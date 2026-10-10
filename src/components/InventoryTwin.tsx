import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Color, DoubleSide, MeshStandardMaterial, Vector3, type Group, type Mesh, type PerspectiveCamera } from 'three';
import type { Storage } from '../lib/data';
import { STATUS_LABEL, type Assessment, type Intervention, type ScenarioRow, type Status } from '../lib/risk';

// Interactive 3D digital twin of the demo storeroom, built from procedural
// low-poly models. It visualises model outputs — it is not a live sensor feed.

export type TwinView = 'baseline' | 'scenario';
export type TwinMode = 'risk' | 'temperature';

interface Props {
  rows: ScenarioRow[];
  plan: Record<string, Intervention>;
  view: TwinView;
  mode: TwinMode;
  selectedId: string;
  autoRotate: boolean;
  onSelect: (id: string) => void;
}

const ZONES: Storage[] = ['Walk-in chiller', 'Reach-in fridge', 'Produce cooler', 'Ambient rack'];
const ZONE_W = 3.4, ZONE_D = 3.0, ZONE_GAP = 0.45;
const CRATE_W = 0.62, CRATE_H = 0.26, CRATE_D = 0.42, KG_PER_CRATE = 5, MAX_CRATES = 8;
const BATCH_Z = 0.55; // batches stand on pallets in front of the equipment

const STATUS_HEX: Record<Status, string> = { hold: '#6b2135', critical: '#c2412d', high: '#d9772b', moderate: '#c9a227', low: '#5c9a6b' };
const WOOD = '#c99a5f', WOOD_D = '#a87a43', STEEL = '#cfd5d8', STEEL_D = '#8e979b', PANEL = '#e8ecee';

function tempColor(dev: number) {
  const d = Math.abs(dev);
  if (d < 1) return '#5c9a6b';
  if (d < 2.5) return '#c9a227';
  if (d < 4.5) return '#d9772b';
  return '#c2412d';
}

const zoneX = (i: number) => (i - (ZONES.length - 1) / 2) * (ZONE_W + ZONE_GAP);

// Shared materials for static props (cached by appearance).
const matCache = new Map<string, MeshStandardMaterial>();
function mat(color: string, opts: { rough?: number; metal?: number; opacity?: number; emissive?: string } = {}) {
  const key = `${color}|${opts.rough ?? 0.7}|${opts.metal ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0 });
    if (opts.opacity !== undefined && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = false; }
    if (opts.emissive) { m.emissive = new Color(opts.emissive); m.emissiveIntensity = 0.9; }
    matCache.set(key, m);
  }
  return m;
}

/* ------------------------------------------------------------------ produce models */

type Kind = 'strawberr' | 'spinach' | 'banana' | 'tomato' | 'avocado' | 'carrot' | 'melon' | 'apple' | 'mushroom' | 'pepper';
const KINDS: Kind[] = ['strawberr', 'spinach', 'banana', 'tomato', 'avocado', 'carrot', 'melon', 'apple', 'mushroom', 'pepper'];
const kindOf = (food: string): Kind => KINDS.find(k => food.toLowerCase().includes(k)) ?? 'apple';

const BASE: Record<Kind, string> = {
  strawberr: '#d42a3a', spinach: '#2f6b2f', banana: '#e8c33a', tomato: '#d6362b', avocado: '#3d5a2a',
  carrot: '#e8762a', melon: '#f2a65a', apple: '#c8281f', mushroom: '#cdb89a', pepper: '#3f8a3a',
};

/** Tint produce toward brown as modelled life is used up (illustrative only). */
function tint(hex: string, lifeUsedPct: number) {
  const f = Math.max(0, Math.min(1, (lifeUsedPct - 45) / 55)) * 0.5;
  return '#' + new Color(hex).lerp(new Color('#6b4a2a'), f).getHexString();
}

function ProduceItem({ kind, color, seed }: { kind: Kind; color: string; seed: number }) {
  const rot = (seed * 2.399) % (Math.PI * 2);
  const leaf = mat('#3e7d32');
  const glossy = kind === 'apple' || kind === 'pepper' || kind === 'tomato';
  const body = mat(color, { rough: glossy ? 0.35 : 0.7 });
  switch (kind) {
    case 'strawberr':
      return (<group rotation={[0, rot, 0]}>
        <mesh material={body} position={[0, 0.045, 0]} rotation={[Math.PI, 0, 0]} castShadow><coneGeometry args={[0.042, 0.085, 10]} /></mesh>
        <mesh material={leaf} position={[0, 0.09, 0]}><cylinderGeometry args={[0.035, 0.03, 0.012, 6]} /></mesh>
      </group>);
    case 'spinach':
      return (<mesh material={body} rotation={[0.3, rot, 0.2]} scale={[1, 0.22, 0.6]} position={[0, 0.03, 0]} castShadow><sphereGeometry args={[0.075, 10, 8]} /></mesh>);
    case 'banana':
      return (<group rotation={[0, rot, 0]} position={[0, 0.03, 0]}>
        <mesh material={body} rotation={[Math.PI / 2, 0, 0.9]} castShadow><torusGeometry args={[0.1, 0.024, 8, 14, Math.PI * 0.62]} /></mesh>
      </group>);
    case 'tomato':
      return (<group>
        <mesh material={body} position={[0, 0.05, 0]} scale={[1, 0.82, 1]} castShadow><sphereGeometry args={[0.06, 14, 10]} /></mesh>
        <mesh material={leaf} position={[0, 0.1, 0]} rotation={[0, rot, 0]}><coneGeometry args={[0.03, 0.012, 5]} /></mesh>
      </group>);
    case 'avocado':
      return (<mesh material={body} position={[0, 0.05, 0]} rotation={[0, rot, 1.3]} scale={[0.8, 1.2, 0.8]} castShadow><sphereGeometry args={[0.055, 12, 10]} /></mesh>);
    case 'carrot':
      return (<group rotation={[0, rot, 0]} position={[0, 0.03, 0]}>
        <mesh material={body} rotation={[0, 0, Math.PI / 2]} castShadow><coneGeometry args={[0.026, 0.17, 8]} /></mesh>
        <mesh material={leaf} position={[0.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.02, 0.05, 5]} /></mesh>
      </group>);
    case 'melon':
      return (<group rotation={[0, rot, 0]} position={[0, 0.03, 0]}>
        <mesh material={body} castShadow><cylinderGeometry args={[0.08, 0.08, 0.04, 12, 1, false, 0, Math.PI * 0.7]} /></mesh>
        <mesh material={mat('#7fa65a')} scale={[1.05, 1.02, 1.05]}><cylinderGeometry args={[0.08, 0.08, 0.04, 12, 1, true, 0, Math.PI * 0.7]} /></mesh>
      </group>);
    case 'mushroom':
      return (<group>
        <mesh material={mat('#efe6d6')} position={[0, 0.025, 0]}><cylinderGeometry args={[0.014, 0.018, 0.05, 8]} /></mesh>
        <mesh material={body} position={[0, 0.045, 0]} castShadow><sphereGeometry args={[0.042, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      </group>);
    case 'pepper':
      return (<group rotation={[0, rot, 0]}>
        <mesh material={body} position={[0, 0.055, 0]} scale={[1, 1.12, 1]} castShadow><sphereGeometry args={[0.058, 10, 8]} /></mesh>
        <mesh material={mat('#2f5e26')} position={[0, 0.12, 0]}><cylinderGeometry args={[0.008, 0.012, 0.03, 6]} /></mesh>
      </group>);
    default:
      return (<group>
        <mesh material={body} position={[0, 0.055, 0]} castShadow><sphereGeometry args={[0.058, 14, 10]} /></mesh>
        <mesh material={mat('#5a4320')} position={[0, 0.118, 0]} rotation={[0, 0, 0.3]}><cylinderGeometry args={[0.005, 0.005, 0.03, 4]} /></mesh>
        <mesh material={leaf} position={[0.014, 0.12, 0]} rotation={[0, rot, 0.9]} scale={[1, 0.25, 0.5]}><sphereGeometry args={[0.016, 6, 4]} /></mesh>
      </group>);
  }
}

/* ------------------------------------------------------------------ crates & pallets */

function Crate({ color, highlight, produce }: { color: string; highlight: number; produce?: { kind: Kind; tint: string; seed: number } }) {
  const m = useMemo(() => new MeshStandardMaterial({ color, roughness: color === WOOD ? 0.85 : 0.45 }), [color]);
  useEffect(() => { m.emissive.set('#ffffff'); m.emissiveIntensity = highlight; }, [m, highlight]);
  useEffect(() => () => m.dispose(), [m]);
  const w = CRATE_W, h = CRATE_H, d = CRATE_D, t = 0.018;
  const items = useMemo(() => {
    if (!produce) return [];
    const out: [number, number][] = [];
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {
      const j = ((produce.seed + ix * 7 + iz * 13) % 10) / 10 - 0.5;
      out.push([(ix - 1.5) * (w / 4.6) + j * 0.03, (iz - 1) * (d / 3.6) - j * 0.02]);
    }
    return out;
  }, [produce?.seed, w, d]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <mesh material={m} position={[0, t / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, t, d]} /></mesh>
      {[0.07, 0.17, h - 0.025].map(y => [-1, 1].map(s => (
        <mesh key={`${y}${s}`} material={m} position={[0, y, s * (d / 2 - t / 2)]} castShadow><boxGeometry args={[w, 0.05, t]} /></mesh>
      )))}
      {[-1, 1].map(s => (
        <group key={s} position={[s * (w / 2 - t / 2), 0, 0]}>
          <mesh material={m} position={[0, h / 2, 0]} castShadow><boxGeometry args={[t, h, d]} /></mesh>
          <mesh material={mat('#3a2a18')} position={[s * 0.002, h - 0.06, 0]}><boxGeometry args={[t + 0.002, 0.03, 0.12]} /></mesh>
        </group>
      ))}
      {produce && items.map(([x, z], i) => (
        <group key={i} position={[x, h - 0.1, z]}><ProduceItem kind={produce.kind} color={produce.tint} seed={produce.seed + i} /></group>
      ))}
    </group>
  );
}

function Pallet() {
  const w = CRATE_W + 0.12, d = CRATE_D * 2 + 0.12;
  return (
    <group>
      {[-1, 0, 1].map(i => <mesh key={`b${i}`} material={mat(WOOD_D, { rough: 0.9 })} position={[i * (w / 2 - 0.05), 0.04, 0]} castShadow receiveShadow><boxGeometry args={[0.09, 0.08, d]} /></mesh>)}
      {[-2, -1, 0, 1, 2].map(i => <mesh key={`t${i}`} material={mat(WOOD, { rough: 0.9 })} position={[0, 0.095, i * (d / 5)]} castShadow receiveShadow><boxGeometry args={[w, 0.03, d / 5 - 0.03]} /></mesh>)}
    </group>
  );
}

function HoldRing({ radius }: { radius: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.07;
    ref.current.scale.set(s, s, 1);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
      <ringGeometry args={[radius, radius + 0.07, 48]} />
      <meshBasicMaterial color={STATUS_HEX.hold} transparent opacity={0.9} />
    </mesh>
  );
}

function BatchStack({ row, a, iv, view, mode, selected, onSelect, position }: {
  row: ScenarioRow; a: Assessment; iv?: Intervention; view: TwinView; mode: TwinMode;
  selected: boolean; onSelect: (id: string) => void; position: [number, number, number];
}) {
  const [hover, setHover] = useState(false);
  const b = a.batch;
  // Scenario quantity reflects any modelled transfer; held stock is never transferred.
  const qty = view === 'scenario' && iv && a.status !== 'hold' && iv.transferKg > 0 ? Math.max(0, b.quantityKg - iv.transferKg) : b.quantityKg;
  const crates = Math.max(qty > 0 ? 1 : 0, Math.min(MAX_CRATES, Math.ceil(qty / KG_PER_CRATE)));
  const riskCrates = a.status === 'hold' ? crates : Math.min(crates, Math.round((a.atRiskKg / Math.max(qty, 1e-6)) * crates));
  const tempDev = view === 'scenario' && iv?.fixStorage ? 0 : b.avgTempC - b.idealTempC;
  const kind = kindOf(b.food);
  const produceTint = tint(BASE[kind], a.lifeUsedPct);
  const seed = parseInt(b.id.replace(/\D/g, ''), 10) || 1;

  // Two crates per layer (back/front); the at-risk portion is the top of the stack.
  const layers = Math.ceil(crates / 2);
  const colorFor = (i: number) => {
    if (mode === 'temperature') return tempColor(tempDev);
    return i >= crates - riskCrates ? STATUS_HEX[a.status] : WOOD;
  };
  const highlight = selected ? 0.14 : hover ? 0.08 : 0;
  const top = 0.11 + layers * (CRATE_H + 0.01);

  const over = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; };
  const out = () => { setHover(false); document.body.style.cursor = ''; };

  return (
    <group position={position}>
      <group onPointerOver={over} onPointerOut={out} onClick={e => { e.stopPropagation(); onSelect(b.id); }}>
        <Pallet />
        {Array.from({ length: crates }, (_, i) => {
          const layer = Math.floor(i / 2), back = i % 2 === 0;
          // Produce is visible in the top layer (and a lone back crate one layer down).
          const showProduce = layer === layers - 1 || (back && i === crates - 2 && crates % 2 === 1);
          return (
            <group key={i} position={[0, 0.11 + layer * (CRATE_H + 0.01), back ? -CRATE_D / 2 - 0.01 : CRATE_D / 2 + 0.01]}>
              <Crate color={colorFor(i)} highlight={highlight} produce={showProduce ? { kind, tint: produceTint, seed: seed + i } : undefined} />
            </group>
          );
        })}
        {/* invisible hit area so the whole stack is easy to click */}
        <mesh position={[0, Math.max(top, 0.6) / 2, 0]} visible={false}>
          <boxGeometry args={[CRATE_W + 0.15, Math.max(top, 0.6), CRATE_D * 2 + 0.15]} />
        </mesh>
      </group>
      {a.status === 'hold' && <HoldRing radius={0.62} />}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
          <ringGeometry args={[0.56, 0.62, 48]} />
          <meshBasicMaterial color="#1d2420" />
        </mesh>
      )}
      <Html position={[0, top + 0.25, 0]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`twin-badge ${selected ? 'sel' : ''}`}>{b.emoji}{a.status === 'hold' && <span className="twin-hold-tag">HOLD</span>}</div>
      </Html>
      {(hover || selected) && (
        <Html position={[0, top + 0.72, 0]} center distanceFactor={9} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
          <div className="twin-tip">
            <b>{b.food}</b> <span className="mono">{b.id}</span>
            <div><i style={{ background: STATUS_HEX[a.status] }} />{STATUS_LABEL[a.status]} · risk {a.inventoryScore}</div>
            <div>{qty.toFixed(0)} kg · <b>{a.atRiskKg.toFixed(1)} kg</b> projected unused</div>
            <div>{view === 'scenario' && iv?.fixStorage ? `${b.idealTempC}°C (corrected in scenario)` : `${b.avgTempC}°C`} vs {b.idealTempC}°C target</div>
            {row.blocked.length > 0 && view === 'scenario' && <div className="twin-warn">Intervention blocked: safety hold</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ equipment models */

function Shelf({ w, d, y }: { w: number; d: number; y: number }) {
  return <mesh material={mat(STEEL, { rough: 0.4, metal: 0.6 })} position={[0, y, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.025, d]} /></mesh>;
}

function StockBoxes({ w, y, seed, palette }: { w: number; y: number; seed: number; palette: string[] }) {
  const n = Math.floor(w / 0.26);
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const h = 0.12 + ((seed * (i + 3)) % 7) * 0.015;
        return <mesh key={i} material={mat(palette[(seed + i) % palette.length], { rough: 0.8 })} position={[(i - (n - 1) / 2) * 0.26, h / 2 + 0.013, 0]} castShadow><boxGeometry args={[0.2, h, 0.22]} /></mesh>;
      })}
    </group>
  );
}

function Fan({ position }: { position: [number, number, number] }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 6; });
  return (
    <group ref={ref} position={position}>
      {[0, 1, 2].map(i => <mesh key={i} material={mat('#8e979b', { metal: 0.6 })} rotation={[0, 0, (i * Math.PI * 2) / 3]}><boxGeometry args={[0.22, 0.04, 0.005]} /></mesh>)}
    </group>
  );
}

function WalkInChiller() {
  const w = 3.0, h = 1.9, d = 1.15, panel = mat(PANEL, { rough: 0.5, metal: 0.2 });
  return (
    <group position={[0, 0, -0.85]}>
      <mesh material={panel} position={[0, h / 2, -d / 2]} castShadow receiveShadow><boxGeometry args={[w, h, 0.06]} /></mesh>
      {[-1, 1].map(s => <mesh key={s} material={panel} position={[s * w / 2, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[0.06, h, d]} /></mesh>)}
      <mesh material={panel} position={[0, h, 0]} castShadow><boxGeometry args={[w + 0.06, 0.06, d]} /></mesh>
      {/* strip-curtain doorway */}
      {Array.from({ length: 9 }, (_, i) => <mesh key={i} material={mat('#bfe0ee', { opacity: 0.35, rough: 0.1 })} position={[-0.4 + i * 0.1, h / 2 - 0.05, d / 2]}><boxGeometry args={[0.09, h - 0.15, 0.01]} /></mesh>)}
      <mesh material={mat(STEEL_D, { metal: 0.5, rough: 0.4 })} position={[0, h - 0.06, d / 2]}><boxGeometry args={[1.0, 0.06, 0.05]} /></mesh>
      {/* interior wire shelving */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 1.0, 0, -0.1]}>
          {[0.35, 0.8, 1.25].map((y, j) => <group key={y}><Shelf w={0.85} d={0.7} y={y} /><StockBoxes w={0.85} y={y} seed={j + (s > 0 ? 3 : 0)} palette={['#d8c8a8', '#c9d6b8', '#e2d3b5']} /></group>)}
        </group>
      ))}
      {/* condenser unit on the roof */}
      <group position={[0.8, h + 0.2, -0.1]}>
        <mesh material={mat(STEEL, { metal: 0.6, rough: 0.35 })} castShadow><boxGeometry args={[0.9, 0.34, 0.6]} /></mesh>
        <mesh material={mat('#2a3136')} position={[0, 0, 0.301]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.01, 20]} /></mesh>
        <Fan position={[0, 0, 0.31]} />
      </group>
      <mesh material={mat('#7fbfe0', { emissive: '#7fbfe0' })} position={[0, h - 0.1, d / 2 + 0.03]}><boxGeometry args={[0.5, 0.03, 0.02]} /></mesh>
    </group>
  );
}

function ReachInFridge() {
  const body = mat('#f2f4f5', { rough: 0.35, metal: 0.25 });
  return (
    <group position={[0, 0, -0.95]}>
      {[-0.52, 0.52].map((x, k) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh material={body} position={[0, 1.0, 0]} castShadow receiveShadow><boxGeometry args={[1.0, 2.0, 0.78]} /></mesh>
          <mesh material={mat('#1d2420', { rough: 0.6 })} position={[0, 1.02, 0.392]}><boxGeometry args={[0.9, 1.68, 0.01]} /></mesh>
          {[0.45, 0.85, 1.25, 1.62].map((y, j) => <group key={y} position={[0, 0, 0.05]}><Shelf w={0.8} d={0.55} y={y} /><StockBoxes w={0.8} y={y} seed={j + k * 4} palette={['#5f9a52', '#d9a441', '#c96a4a', '#e6dcc4']} /></group>)}
          <mesh material={mat('#cfe7f2', { opacity: 0.4, rough: 0.05 })} position={[0, 1.02, 0.41]}><boxGeometry args={[0.84, 1.62, 0.015]} /></mesh>
          <mesh material={mat(STEEL_D, { metal: 0.8, rough: 0.3 })} position={[0.36, 1.05, 0.43]}><boxGeometry args={[0.03, 0.55, 0.03]} /></mesh>
          <mesh material={mat('#1d2420')} position={[0, 1.9, 0.393]}><boxGeometry args={[0.92, 0.16, 0.012]} /></mesh>
          <mesh material={mat('#9fd18b', { emissive: '#9fd18b' })} position={[0, 1.9, 0.401]}><boxGeometry args={[0.5, 0.03, 0.01]} /></mesh>
          <mesh material={mat('#2a3136')} position={[0, 0.06, 0.393]}><boxGeometry args={[0.9, 0.1, 0.02]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function ProduceCooler() {
  const body = mat('#2f3a35', { rough: 0.5, metal: 0.3 });
  const tiers: [number, number][] = [[0.55, 0.15], [0.95, -0.05], [1.32, -0.22]];
  const fruit = ['#c8281f', '#e8c33a', '#3f8a3a', '#e8762a', '#5f9a52', '#d6362b'];
  return (
    <group position={[0, 0, -0.85]}>
      <mesh material={body} position={[0, 0.25, 0.05]} castShadow receiveShadow><boxGeometry args={[2.9, 0.5, 0.95]} /></mesh>
      <mesh material={body} position={[0, 1.0, -0.4]} castShadow><boxGeometry args={[2.9, 2.0, 0.08]} /></mesh>
      {[-1, 1].map(s => <mesh key={s} material={body} position={[s * 1.45, 0.95, -0.05]} castShadow><boxGeometry args={[0.06, 1.9, 0.8]} /></mesh>)}
      <mesh material={body} position={[0, 1.95, -0.15]} castShadow><boxGeometry args={[2.96, 0.12, 0.6]} /></mesh>
      <mesh material={mat('#fff8e0', { emissive: '#fff3c4' })} position={[0, 1.885, 0.08]}><boxGeometry args={[2.6, 0.02, 0.05]} /></mesh>
      {tiers.map(([y, z], i) => (
        <group key={y} position={[0, y, z]} rotation={[0.18, 0, 0]}>
          <mesh material={mat(STEEL, { metal: 0.5, rough: 0.35 })} castShadow receiveShadow><boxGeometry args={[2.75, 0.03, 0.42]} /></mesh>
          {Array.from({ length: 9 }, (_, j) => (
            <mesh key={j} material={mat(fruit[(i * 3 + j) % fruit.length], { rough: 0.4 })} position={[-1.2 + j * 0.3, 0.05, 0]} castShadow>
              <sphereGeometry args={[0.06, 10, 8]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh material={mat('#11161a')} position={[0, 0.48, 0.53]}><boxGeometry args={[2.8, 0.04, 0.02]} /></mesh>
    </group>
  );
}

function AmbientRack() {
  const steel = mat('#5d6a70', { metal: 0.7, rough: 0.35 });
  return (
    <group position={[0, 0, -0.9]}>
      {[-1.35, 1.35].map(x => [-0.32, 0.32].map(z => (
        <mesh key={`${x}${z}`} material={steel} position={[x, 1.0, z]} castShadow><boxGeometry args={[0.05, 2.0, 0.05]} /></mesh>
      )))}
      {[0.12, 0.65, 1.15, 1.65].map((y, j) => (
        <group key={y}>
          <mesh material={mat(WOOD, { rough: 0.85 })} position={[0, y, 0]} castShadow receiveShadow><boxGeometry args={[2.75, 0.04, 0.7]} /></mesh>
          <mesh material={mat('#d9772b', { metal: 0.3, rough: 0.5 })} position={[0, y - 0.02, 0.35]}><boxGeometry args={[2.75, 0.06, 0.02]} /></mesh>
          {j > 0 && <StockBoxes w={2.6} y={y + 0.01} seed={j * 5} palette={['#c8a878', '#b89462', '#d8bc8c', '#e6d3a8']} />}
        </group>
      ))}
    </group>
  );
}

const EQUIPMENT: Record<Storage, () => JSX.Element> = {
  'Walk-in chiller': WalkInChiller,
  'Reach-in fridge': ReachInFridge,
  'Produce cooler': ProduceCooler,
  'Ambient rack': AmbientRack,
};

/* ------------------------------------------------------------------ monitoring devices */

function TempSensor({ dev, position }: { dev: number; position: [number, number, number] }) {
  const color = tempColor(dev);
  const blink = Math.abs(dev) >= 2.5;
  const m = useMemo(() => new MeshStandardMaterial({ color, emissive: new Color(color), emissiveIntensity: 1.2 }), [color]);
  useEffect(() => () => m.dispose(), [m]);
  useFrame(({ clock }) => { if (blink) m.emissiveIntensity = 0.3 + (Math.sin(clock.elapsedTime * 6) > 0 ? 1.4 : 0); });
  return (
    <group position={position}>
      <mesh material={mat('#f7f7f4', { rough: 0.4 })} castShadow><boxGeometry args={[0.16, 0.22, 0.05]} /></mesh>
      <mesh material={mat('#1d2420')} position={[0, 0.03, 0.026]}><boxGeometry args={[0.11, 0.07, 0.005]} /></mesh>
      <mesh material={m} position={[0, -0.06, 0.03]}><sphereGeometry args={[0.018, 10, 8]} /></mesh>
    </group>
  );
}

/** FreshVision inspection camera with a sweeping field-of-view cone. */
function VisionCamera({ position, phase }: { position: [number, number, number]; phase: number }) {
  const head = useRef<Group>(null);
  useFrame(({ clock }) => { if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + phase) * 0.5 - 0.35; });
  const metal = mat('#3a4247', { metal: 0.6, rough: 0.4 });
  return (
    <group position={position}>
      <mesh material={metal} position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.025, 0.035, 2.4, 8]} /></mesh>
      <mesh material={metal} position={[0, 0.02, 0]}><cylinderGeometry args={[0.12, 0.14, 0.04, 16]} /></mesh>
      <group ref={head} position={[0, 2.4, 0]}>
        <group rotation={[0.9, 0, 0]}>
          <mesh material={mat('#f2f4f5', { rough: 0.3, metal: 0.2 })} castShadow><boxGeometry args={[0.14, 0.12, 0.26]} /></mesh>
          <mesh material={mat('#1d2420', { rough: 0.1 })} position={[0, 0, 0.135]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.045, 0.045, 0.02, 16]} /></mesh>
          <mesh material={mat('#9fd18b', { emissive: '#9fd18b' })} position={[0.05, 0.065, 0.08]}><sphereGeometry args={[0.012, 8, 6]} /></mesh>
          {/* field of view */}
          <mesh position={[0, 0, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.7, 2.2, 24, 1, true]} />
            <meshBasicMaterial color="#9fd18b" transparent opacity={0.12} depthWrite={false} side={DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ zones & room */

function Zone({ name, index, items, view, mode, plan, selectedId, onSelect }: {
  name: Storage; index: number; items: { row: ScenarioRow; a: Assessment }[]; view: TwinView; mode: TwinMode;
  plan: Record<string, Intervention>; selectedId: string; onSelect: (id: string) => void;
}) {
  const x = zoneX(index);
  const devs = items.map(({ a }) => (view === 'scenario' && plan[a.batch.id]?.fixStorage ? 0 : a.batch.avgTempC - a.batch.idealTempC));
  const avgDev = devs.length ? devs.reduce((s, d) => s + d, 0) / devs.length : 0;
  const atRisk = items.reduce((s, { a }) => s + a.atRiskKg, 0);
  const Equipment = EQUIPMENT[name];
  return (
    <group position={[x, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[ZONE_W, ZONE_D]} />
        <meshStandardMaterial color="#e4ddcc" roughness={0.95} />
      </mesh>
      {/* temperature strip along the front edge, yellow safety lines at the sides */}
      <mesh position={[0, 0.008, ZONE_D / 2 - 0.05]}>
        <boxGeometry args={[ZONE_W, 0.012, 0.08]} />
        <meshStandardMaterial color={tempColor(avgDev)} />
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * (ZONE_W / 2 - 0.03), 0.008, 0]}>
          <boxGeometry args={[0.05, 0.012, ZONE_D]} />
          <meshStandardMaterial color="#e2b93b" />
        </mesh>
      ))}
      <Equipment />
      <TempSensor dev={avgDev} position={[-ZONE_W / 2 + 0.3, 1.55, -0.2]} />
      <VisionCamera position={[ZONE_W / 2 - 0.2, 0, 1.25]} phase={index * 1.3} />
      {items.length === 0 && (
        <Html position={[0, 0.4, BATCH_Z]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div className="twin-empty">Empty zone</div>
        </Html>
      )}
      {items.map(({ row, a }, i) => {
        const cols = 3;
        const px = ((i % cols) - (Math.min(items.length, cols) - 1) / 2) * 0.98 - 0.12;
        const pz = BATCH_Z + Math.floor(i / cols) * 0.9;
        return (
          <BatchStack key={a.batch.id} row={row} a={a} iv={plan[a.batch.id]} view={view} mode={mode}
            selected={a.batch.id === selectedId} onSelect={onSelect} position={[px, 0, pz]} />
        );
      })}
      <Html position={[0, 0.05, ZONE_D / 2 + 0.38]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div className="twin-zone">
          <b>{name}</b>
          <span>{avgDev >= 0 ? '+' : ''}{avgDev.toFixed(1)}°C vs target</span>
          <span>{atRisk.toFixed(1)} kg at risk</span>
        </div>
      </Html>
    </group>
  );
}

function Room({ width }: { width: number }) {
  const W = width + 2.2, D = 9, backZ = -ZONE_D / 2 - 0.15;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.6]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#f1ebdd" roughness={1} />
      </mesh>
      <gridHelper args={[W, Math.round(W / 0.6), '#ddd5c2', '#e6dfcf']} position={[0, 0.002, 0.6]} />
      <mesh position={[0, 1.5, backZ]} receiveShadow>
        <boxGeometry args={[W, 3, 0.15]} />
        <meshStandardMaterial color="#efe9db" roughness={1} />
      </mesh>
      <mesh position={[0, 0.06, backZ + 0.08]}>
        <boxGeometry args={[W, 0.12, 0.02]} />
        <meshStandardMaterial color="#3c4741" />
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * W / 2, 1.5, backZ + 1.5]} receiveShadow>
          <boxGeometry args={[0.15, 3, 3]} />
          <meshStandardMaterial color="#e9e2d2" roughness={1} />
        </mesh>
      ))}
      <group position={[0, 2.6, backZ + 0.09]}>
        <mesh><boxGeometry args={[2.6, 0.44, 0.04]} /><meshStandardMaterial color="#1d2420" /></mesh>
        <Html position={[0, 0, 0.03]} center distanceFactor={10} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="twin-sign">Fresh<span>Vision</span> · Cold Store A</div>
        </Html>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ camera & scene */

const CAM_DIR = new Vector3(0, 5.2, 8.4);
const TARGET = new Vector3(0, 0.9, 0);

/** Pull the camera back on narrow viewports so the whole storeroom stays in frame. */
function FitCamera({ sceneWidth }: { sceneWidth: number }) {
  const camera = useThree(s => s.camera) as PerspectiveCamera;
  const { width, height } = useThree(s => s.size);
  useEffect(() => {
    const aspect = width / Math.max(height, 1);
    const halfV = (camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const needed = (sceneWidth / 2 + 0.5) / Math.tan(halfH);
    const dist = Math.max(CAM_DIR.length(), needed);
    camera.position.copy(CAM_DIR).normalize().multiplyScalar(dist).add(new Vector3(0, TARGET.y, 0));
    camera.updateProjectionMatrix();
  }, [camera, width, height, sceneWidth]);
  return null;
}

export default function InventoryTwin({ rows, plan, view, mode, selectedId, autoRotate, onSelect }: Props) {
  const byZone = useMemo(() => ZONES.map(z => rows
    .filter(r => r.baseline.batch.storage === z)
    .map(r => ({ row: r, a: view === 'scenario' ? r.scenario : r.baseline }))), [rows, view]);
  const width = ZONES.length * ZONE_W + (ZONES.length - 1) * ZONE_GAP;

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: CAM_DIR.toArray(), fov: 42 }} onPointerMissed={() => (document.body.style.cursor = '')}>
      <color attach="background" args={['#f6f2e8']} />
      <fog attach="fog" args={['#f6f2e8', 26, 52]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fffdf8', '#c9bfa6', 0.55]} />
      <directionalLight position={[5, 11, 7]} intensity={1.25} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={7} shadow-camera-bottom={-7} />
      <pointLight position={[zoneX(0), 1.6, -0.6]} color="#bfe0ff" intensity={2.2} distance={3.5} />
      <Room width={width} />
      {ZONES.map((z, i) => (
        <Zone key={z} name={z} index={i} items={byZone[i]} view={view} mode={mode} plan={plan} selectedId={selectedId} onSelect={onSelect} />
      ))}
      <FitCamera sceneWidth={width} />
      <OrbitControls makeDefault enablePan={false} minDistance={5} maxDistance={32} minPolarAngle={0.3} maxPolarAngle={1.4}
        autoRotate={autoRotate} autoRotateSpeed={0.6} target={TARGET} />
    </Canvas>
  );
}
