import { useMemo, useState } from 'react';
import { DEMO_BATCHES, type Batch } from './lib/data';
import {
  assess, DEFAULT_CONFIG, isActive, NO_INTERVENTION, recommend, runScenario, STATUS_LABEL,
  type Intervention, type ModelConfig, type Weights,
} from './lib/risk';
import { RiskDistribution, ScenarioBars, ScoreRing, STATUS_COLOR } from './components/Charts';
import { ImageInspector } from './components/ImageInspector';

const KIND_LABEL = { safety: 'Food safety', inspect: 'Inspect', storage: 'Storage', 'use-first': 'Use first', purchasing: 'Purchasing', capture: 'Data' } as const;

export default function App() {
  const [batches, setBatches] = useState<Batch[]>(DEMO_BATCHES);
  const [cfg, setCfg] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<string>('B-1043');
  const [plan, setPlan] = useState<Record<string, Intervention>>({ 'B-1044': { menuBoost: 1.8, fixStorage: true, transferKg: 0 } });
  const [simBatch, setSimBatch] = useState<string>('B-1044');
  const [showCfg, setShowCfg] = useState(false);

  const list = useMemo(() => batches.map(b => assess(b, cfg)).sort((a, b) => (b.status === 'hold' ? 1000 : 0) + b.inventoryScore - ((a.status === 'hold' ? 1000 : 0) + a.inventoryScore)), [batches, cfg]);
  const recs = useMemo(() => recommend(list), [list]);
  const rows = useMemo(() => runScenario(batches, cfg, plan), [batches, cfg, plan]);
  const sel = list.find(a => a.batch.id === selected) ?? list[0];

  const totalKg = batches.reduce((t, b) => t + b.quantityKg, 0);
  const baseRisk = rows.reduce((t, r) => t + r.baseline.atRiskKg, 0);
  const scenRisk = rows.reduce((t, r) => t + r.scenario.atRiskKg, 0);
  const baseAvg = rows.reduce((t, r) => t + r.baseline.inventoryScore, 0) / Math.max(1, rows.length);
  const scenAvg = rows.reduce((t, r) => t + r.scenario.inventoryScore, 0) / Math.max(1, rows.length);
  const holds = list.filter(a => a.status === 'hold').length;
  const blocked = rows.flatMap(r => r.blocked.map(m => `${r.id}: ${m}`));

  const iv = plan[simBatch] ?? NO_INTERVENTION;
  const setIv = (patch: Partial<Intervention>) => setPlan(p => ({ ...p, [simBatch]: { ...(p[simBatch] ?? NO_INTERVENTION), ...patch } }));
  const simB = batches.find(b => b.id === simBatch)!;
  const simA = list.find(a => a.batch.id === simBatch)!;

  const attach = (id: string, score: number) => {
    setBatches(bs => bs.map(b => (b.id === id ? { ...b, visualScore: score } : b)));
    setSelected(id);
  };
  const setW = (k: keyof Weights, v: number) => setCfg(c => ({ ...c, weights: { ...c.weights, [k]: v } }));

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="38" height="38" role="img" aria-label="FreshVision logo"><rect width="32" height="32" rx="8" fill="var(--ink)" /><path d="M4.5 16C7.6 11 11.5 8.5 16 8.5S24.4 11 27.5 16c-3.1 5-7 7.5-11.5 7.5S7.6 21 4.5 16z" fill="none" stroke="var(--leaf)" strokeWidth="2" strokeLinejoin="round" /><path d="M16 10.8c3.2 2.1 3.2 8.3 0 10.4-3.2-2.1-3.2-8.3 0-10.4z" fill="var(--leaf)" /><path d="M16 12.6v7" stroke="var(--ink)" strokeWidth="1.1" strokeLinecap="round" /></svg>
          <div>
            <h1>Fresh<em>Vision</em></h1>
            <span>Pre-Visual Food Waste Prevention · Central Kitchen</span>
            <p className="tagline">Don't detect waste. Prevent it before it happens.</p>
          </div>
        </div>
        <div className="top-right">
          <span className="tag demo">Demo inventory · illustrative data</span>
          <span className="tag">Heuristic model v0.1 · uncalibrated</span>
          <button className="btn ghost sm" onClick={() => setShowCfg(s => !s)}>{showCfg ? 'Hide' : 'Tune'} model weights</button>
        </div>
      </header>

      {showCfg && (
        <section className="card cfg">
          <div className="card-h"><h2>Risk model configuration</h2><button className="btn ghost sm" onClick={() => setCfg(DEFAULT_CONFIG)}>Reset defaults</button></div>
          <p className="small muted">Weights are renormalised automatically (visual weight only applies to batches with an inspection photo). All constants are assumptions — calibrate against your own waste logs before relying on them.</p>
          <div className="cfg-grid">
            {(Object.keys(cfg.weights) as (keyof Weights)[]).map(k => (
              <label key={k} className="slider">
                <span>{k} <b className="mono">{cfg.weights[k].toFixed(2)}</b></span>
                <input type="range" min={0} max={0.6} step={0.01} value={cfg.weights[k]} onChange={e => setW(k, +e.target.value)} />
              </label>
            ))}
            <label className="slider"><span>Q10 ageing factor <b className="mono">{cfg.q10.toFixed(1)}</b></span><input type="range" min={1} max={4} step={0.1} value={cfg.q10} onChange={e => setCfg(c => ({ ...c, q10: +e.target.value }))} /></label>
            <label className="slider"><span>TCS excursion hold (h) <b className="mono">{cfg.tcsExcursionHoldHours}</b></span><input type="range" min={1} max={8} step={1} value={cfg.tcsExcursionHoldHours} onChange={e => setCfg(c => ({ ...c, tcsExcursionHoldHours: +e.target.value }))} /></label>
            <label className="slider"><span>Visual hold threshold <b className="mono">{cfg.visualHoldScore}</b></span><input type="range" min={40} max={95} step={1} value={cfg.visualHoldScore} onChange={e => setCfg(c => ({ ...c, visualHoldScore: +e.target.value }))} /></label>
          </div>
        </section>
      )}

      <section className="kpis">
        <div className="kpi"><span>Stock on hand</span><b>{totalKg} kg</b><small>{batches.length} batches (demo)</small></div>
        <div className="kpi"><span>Projected at risk · baseline</span><b>{baseRisk.toFixed(1)} kg</b><small>{((baseRisk / totalKg) * 100).toFixed(0)}% of stock · model estimate</small></div>
        <div className="kpi accent"><span>With your intervention plan</span><b>{scenRisk.toFixed(1)} kg</b><small className={scenRisk < baseRisk ? 'good' : ''}>{scenRisk - baseRisk <= 0 ? '−' : '+'}{Math.abs(scenRisk - baseRisk).toFixed(1)} kg in scenario · simulated</small></div>
        <div className="kpi warn"><span>On safety hold</span><b>{holds}</b><small>excluded from use-first actions</small></div>
      </section>

      <div className="grid main">
        <section className="card span2">
          <div className="card-h"><h2>Inventory · ranked by risk</h2><span className="muted small">Click a batch to explain its score</span></div>
          <div className="table-wrap">
            <table className="inv">
              <thead><tr><th>#</th><th>Batch</th><th className="right">Qty</th><th>Age / life</th><th>Storage</th><th className="right">Temp</th><th className="right">Use/day</th><th className="right">Visual</th><th className="right">Risk</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((a, i) => {
                  const b = a.batch;
                  return (
                    <tr key={b.id} className={b.id === sel.batch.id ? 'sel' : ''} onClick={() => setSelected(b.id)}>
                      <td className="mono muted">{i + 1}</td>
                      <td><span className="emoji">{b.emoji}</span><b>{b.food}</b><div className="mono muted small">{b.id}{b.tcs ? ' · TCS' : ''}</div></td>
                      <td className="right mono">{b.quantityKg} kg</td>
                      <td><div className="life"><div style={{ width: `${a.lifeUsedPct}%`, background: a.lifeUsedPct > 80 ? 'var(--crit)' : a.lifeUsedPct > 55 ? 'var(--high)' : 'var(--leaf-d)' }} /></div><span className="small mono">{b.ageDays}d / {b.shelfLifeDays}d</span></td>
                      <td className="small">{b.storage}<div className="muted">{b.humidityPct}% RH</div></td>
                      <td className={`right mono ${Math.abs(b.avgTempC - b.idealTempC) >= 2 ? 'bad' : ''}`}>{b.avgTempC}°<div className="muted small">target {b.idealTempC}°</div></td>
                      <td className="right mono">{b.consumptionKgPerDay}</td>
                      <td className="right mono">{a.visualScore ?? <span className="muted">—</span>}</td>
                      <td className="right mono"><b>{a.inventoryScore}</b></td>
                      <td><span className="pill" style={{ background: STATUS_COLOR[a.status] }}>{STATUS_LABEL[a.status]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-h"><h2>Risk distribution</h2></div>
          <RiskDistribution list={list} />
        </section>
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-h"><h2>Why this score? <span className="muted">{sel.batch.emoji} {sel.batch.food}</span></h2><span className="mono small muted">{sel.batch.id}</span></div>
          <div className="explain-head">
            <ScoreRing value={sel.inventoryScore} label="Inventory risk" />
            <ScoreRing value={sel.visualScore ?? null} label="Visual (separate)" tone="var(--ink-2)" />
            <div className="explain-meta small">
              <div><span className="muted">Est. days left</span> <b className="mono">{sel.remainingDays.toFixed(1)}</b></div>
              <div><span className="muted">Days to use stock</span> <b className="mono">{isFinite(sel.daysToDeplete) ? sel.daysToDeplete.toFixed(1) : '∞'}</b></div>
              <div><span className="muted">Ageing multiplier</span> <b className="mono">{sel.degradationMult.toFixed(2)}×</b></div>
              <div><span className="muted">Projected unused</span> <b className="mono">{sel.atRiskKg.toFixed(1)} kg</b></div>
            </div>
          </div>
          {sel.holdReasons.length > 0 && (
            <div className="alert hold"><b>Food-safety rule overrides the score.</b> {sel.holdReasons.join(' ')}</div>
          )}
          <div className="factors">
            {sel.factors.map(f => (
              <div key={f.key} className="factor">
                <div className="factor-top"><b>{f.label}</b><span className="mono">{f.score} × {f.weight.toFixed(2)} = <b>{f.points.toFixed(1)}</b></span></div>
                <div className="factor-bar"><div style={{ width: `${f.score}%` }} /><div className="contrib" style={{ width: `${f.points}%` }} /></div>
                <div className="muted small">{f.detail}</div>
              </div>
            ))}
            {sel.visualScore === undefined && <div className="muted small">No inspection image attached — visual weight excluded and others renormalised.</div>}
          </div>
          <p className="fine">Heuristic estimate. Weighted sum of normalised factors; not calibrated against measured spoilage. Ageing uses a Q10-style assumption ({cfg.q10}× per +10°C).</p>
        </section>

        <section className="card">
          <div className="card-h"><h2>Image inspection</h2><span className="tag sm">Runs locally</span></div>
          <ImageInspector batches={batches} onAttach={attach} />
        </section>
      </div>

      <section className="card sim">
        <div className="card-h">
          <div>
            <div className="eyebrow">Counterfactual simulator</div>
            <h2>What if we act today?</h2>
          </div>
          <span className="tag demo">Model-based scenario · not measured waste avoided</span>
        </div>
        <div className="sim-grid">
          <div className="sim-ctrl">
            <label className="field"><span>Batch to intervene on</span>
              <select value={simBatch} onChange={e => setSimBatch(e.target.value)}>
                {list.map(a => <option key={a.batch.id} value={a.batch.id}>{a.batch.id} · {a.batch.food} ({STATUS_LABEL[a.status]}){isActive(plan[a.batch.id]) ? ' ●' : ''}</option>)}
              </select>
            </label>
            {simA.status === 'hold' && <div className="alert hold small">This batch is on safety hold. Menu prioritisation and transfers are blocked in the model; only storage correction applies.</div>}
            <label className="slider"><span>Prioritise on menu · usage × <b className="mono">{iv.menuBoost.toFixed(1)}</b> <small className="muted">({(simB.consumptionKgPerDay * iv.menuBoost).toFixed(1)} kg/day)</small></span>
              <input type="range" min={1} max={3} step={0.1} value={iv.menuBoost} onChange={e => setIv({ menuBoost: +e.target.value })} disabled={simA.status === 'hold'} />
            </label>
            <label className="slider"><span>Redistribute / donate <b className="mono">{iv.transferKg} kg</b> <small className="muted">(of {simB.quantityKg})</small></span>
              <input type="range" min={0} max={simB.quantityKg} step={1} value={iv.transferKg} onChange={e => setIv({ transferKg: +e.target.value })} disabled={simA.status === 'hold'} />
            </label>
            <label className="chk"><input type="checkbox" checked={iv.fixStorage} onChange={e => setIv({ fixStorage: e.target.checked })} /> Correct storage to {simB.idealTempC}°C / {simB.idealHumidityPct}% RH from today</label>
            <div className="btn-row">
              <button className="btn ghost sm" onClick={() => setPlan(p => { const n = { ...p }; delete n[simBatch]; return n; })}>Clear this batch</button>
              <button className="btn ghost sm" onClick={() => setPlan({})}>Clear all</button>
            </div>
            <div className="plan">
              <div className="eyebrow">Active plan</div>
              {Object.entries(plan).filter(([, v]) => isActive(v)).length === 0 ? <div className="muted small">No interventions — scenario equals baseline.</div> :
                Object.entries(plan).filter(([, v]) => isActive(v)).map(([id, v]) => (
                  <div key={id} className="plan-item small" onClick={() => setSimBatch(id)}>
                    <b className="mono">{id}</b> {v.menuBoost !== 1 && `menu ×${v.menuBoost.toFixed(1)} `}{v.fixStorage && 'fix storage '}{v.transferKg > 0 && `transfer ${v.transferKg}kg`}
                  </div>
                ))}
            </div>
            <details className="assume small">
              <summary>Explicit assumptions</summary>
              <ul>
                <li>Usable life consumed so far = age × Q10^(ΔT/10), using historical temperature.</li>
                <li>Remaining life runs at the forward (intervened) temperature.</li>
                <li>At-risk kg = stock − daily usage × remaining days (floored at 0).</li>
                <li>Held batches count fully as at-risk until cleared; they cannot be prioritised or transferred.</li>
                <li>Menu boost assumes demand can absorb the extra usage; transfers assume a safe recipient.</li>
              </ul>
            </details>
          </div>
          <div className="sim-out">
            <div className="compare">
              <div className="cmp base"><span>Baseline plan</span><b>{baseRisk.toFixed(1)} kg</b><small>avg risk {baseAvg.toFixed(0)}</small></div>
              <div className="cmp-arrow">→</div>
              <div className="cmp scen"><span>Intervention scenario</span><b>{scenRisk.toFixed(1)} kg</b><small>avg risk {scenAvg.toFixed(0)}</small></div>
              <div className={`cmp delta ${scenRisk < baseRisk - 0.05 ? 'good' : scenRisk > baseRisk + 0.05 ? 'bad' : ''}`}>
                <span>Scenario change</span>
                <b>{scenRisk - baseRisk > 0.05 ? '+' : ''}{(scenRisk - baseRisk).toFixed(1)} kg</b>
                <small>{baseRisk > 0 ? `${(((scenRisk - baseRisk) / baseRisk) * 100).toFixed(0)}% vs baseline` : '—'}</small>
              </div>
            </div>
            {blocked.length > 0 && <div className="alert small">{blocked.join(' ')}</div>}
            <div className="sbar-legend small"><span><i className="base" /> baseline kg at risk</span><span><i className="scen" /> scenario kg at risk</span></div>
            <ScenarioBars rows={rows} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Recommended actions</h2><span className="muted small">Rule-based · safety rules always take precedence</span></div>
        {recs.length === 0 ? <div className="empty">No actions needed — all batches are within modelled tolerances.</div> : (
          <ol className="recs">
            {recs.map((r, i) => (
              <li key={i} className={`rec ${r.kind}`} onClick={() => setSelected(r.batchId)}>
                <span className={`prio p${r.priority}`}>P{r.priority}</span>
                <div><div className="rec-kind">{KIND_LABEL[r.kind]}</div><b>{r.title}</b><p className="small muted">{r.why}</p></div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="foot small">
        <b>FreshVision</b> · Pre-Visual Food Waste Prevention — <em>Don&apos;t detect waste. Prevent it before it happens.</em><br />
        Prototype. All inventory, sensor and consumption values are demo data. Scores are heuristic estimates and scenarios are model outputs — neither is a validated forecast or a food-safety determination. When in doubt, follow your HACCP plan and throw it out.
      </footer>
    </div>
  );
}
