import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import type { Intervention, ScenarioRow } from '../lib/risk';
import { STATUS_LABEL } from '../lib/risk';
import { STATUS_COLOR } from './Charts';
import type { TwinMode, TwinView } from './InventoryTwin';

// three.js + R3F are loaded on demand so the main dashboard stays light.
const InventoryTwin = lazy(() => import('./InventoryTwin'));

class TwinErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(e: unknown) { console.error('3D twin failed:', e); }
  render() {
    if (this.state.error) return <div className="twin-fallback"><strong>3D view unavailable</strong><span>The 3D renderer failed on this device. All other dashboard features still work.</span></div>;
    return this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

interface Props {
  rows: ScenarioRow[];
  plan: Record<string, Intervention>;
  selectedId: string;
  onSelect: (id: string) => void;
  onSimulate: (id: string) => void;
}

export function TwinPanel({ rows, plan, selectedId, onSelect, onSimulate }: Props) {
  const [view, setView] = useState<TwinView>('baseline');
  const [mode, setMode] = useState<TwinMode>('risk');
  const [autoRotate, setAutoRotate] = useState(false);
  const webgl = useMemo(hasWebGL, []);
  const sel = rows.find(r => r.id === selectedId);
  const a = sel ? (view === 'scenario' ? sel.scenario : sel.baseline) : undefined;
  const total = rows.reduce((s, r) => s + (view === 'scenario' ? r.scenario.atRiskKg : r.baseline.atRiskKg), 0);

  return (
    <section className="card twin">
      <div className="card-h">
        <div>
          <div className="eyebrow">3D inventory twin</div>
          <h2>Storeroom at a glance</h2>
        </div>
        <span className="tag demo">Model visualisation of demo data · not a live sensor feed</span>
      </div>
      <div className="twin-bar">
        <div className="seg" role="group" aria-label="Scenario">
          <button className={view === 'baseline' ? 'on' : ''} onClick={() => setView('baseline')}>Baseline</button>
          <button className={view === 'scenario' ? 'on' : ''} onClick={() => setView('scenario')}>Intervention scenario</button>
        </div>
        <div className="seg" role="group" aria-label="Colour by">
          <button className={mode === 'risk' ? 'on' : ''} onClick={() => setMode('risk')}>Risk &amp; waste</button>
          <button className={mode === 'temperature' ? 'on' : ''} onClick={() => setMode('temperature')}>Temperature</button>
        </div>
        <label className="chk"><input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} /> Auto-rotate</label>
        <span className="muted small twin-total">{view === 'scenario' ? 'Scenario' : 'Baseline'}: <b className="mono">{total.toFixed(1)} kg</b> projected unused</span>
      </div>
      <div className="twin-layout">
        <div className="twin-stage">
          {webgl ? (
            <TwinErrorBoundary>
              <Suspense fallback={<div className="twin-fallback"><div className="spinner dark" /><span>Loading 3D storeroom…</span></div>}>
                <InventoryTwin rows={rows} plan={plan} view={view} mode={mode} selectedId={selectedId} autoRotate={autoRotate} onSelect={onSelect} />
              </Suspense>
            </TwinErrorBoundary>
          ) : (
            <div className="twin-fallback"><strong>WebGL is not available</strong><span>Your browser or device can't render 3D. The table, charts and simulator below show the same data.</span></div>
          )}
        </div>
        {sel && a ? (
          <div className="twin-card">
            <div className="eyebrow">Selected batch · {view === 'scenario' ? 'scenario' : 'baseline'}</div>
            <div><b>{a.batch.emoji} {a.batch.food}</b> <span className="mono muted small">{a.batch.id}</span></div>
            <div className="twin-card-row"><span className="pill" style={{ background: STATUS_COLOR[a.status] }}>{STATUS_LABEL[a.status]}</span><span className="mono">risk {a.inventoryScore}</span></div>
            <div className="small"><b>{a.atRiskKg.toFixed(1)} kg</b> projected unused · {a.remainingDays.toFixed(1)}d left</div>
            <div className="small muted">{a.batch.storage} · {view === 'scenario' && plan[a.batch.id]?.fixStorage ? `${a.batch.idealTempC}°C (corrected)` : `${a.batch.avgTempC}°C`} vs {a.batch.idealTempC}°C target</div>
            {a.status === 'hold' && <div className="small twin-hold">Safety hold — not eligible for use-first actions.</div>}
            <button className="btn primary sm" onClick={() => onSimulate(a.batch.id)}>Simulate this batch ↓</button>
          </div>
        ) : (
          <div className="twin-card muted small">Click a crate stack to inspect a batch.</div>
        )}
      </div>
      <div className="twin-legend small">
        {mode === 'risk' ? (
          <>
            <span><i style={{ background: '#c99a5f' }} /> stock projected to be used</span>
            {(['low', 'moderate', 'high', 'critical', 'hold'] as const).map(s => <span key={s}><i style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]} — projected unused</span>)}
          </>
        ) : (
          <>
            <span><i style={{ background: 'var(--low)' }} /> within 1°C</span>
            <span><i style={{ background: 'var(--mod)' }} /> 1–2.5°C off</span>
            <span><i style={{ background: 'var(--high)' }} /> 2.5–4.5°C off</span>
            <span><i style={{ background: 'var(--crit)' }} /> &gt;4.5°C off</span>
          </>
        )}
        <span><i style={{ background: '#9fd18b', opacity: .6 }} /> FreshVision camera field of view</span>
        <span className="muted">Wooden crate ≈ 5 kg of usable stock · coloured crates = projected unused · produce tint ≈ modelled life used · LEDs blink when a zone is off target · drag to orbit · scroll to zoom · click a pallet</span>
      </div>
    </section>
  );
}
