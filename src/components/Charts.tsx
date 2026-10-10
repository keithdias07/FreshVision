import type { Assessment, ScenarioRow, Status } from '../lib/risk';
import { STATUS_LABEL } from '../lib/risk';

export const STATUS_COLOR: Record<Status, string> = {
  hold: 'var(--hold)', critical: 'var(--crit)', high: 'var(--high)', moderate: 'var(--mod)', low: 'var(--low)',
};

const ORDER: Status[] = ['hold', 'critical', 'high', 'moderate', 'low'];

export function RiskDistribution({ list }: { list: Assessment[] }) {
  const counts = ORDER.map(s => ({ s, n: list.filter(a => a.status === s).length, kg: list.filter(a => a.status === s).reduce((t, a) => t + a.batch.quantityKg, 0) }));
  const max = Math.max(1, ...counts.map(c => c.n));
  const bins = Array.from({ length: 10 }, (_, i) => list.filter(a => Math.min(9, Math.floor(a.inventoryScore / 10)) === i).length);
  const binMax = Math.max(1, ...bins);
  return (
    <div className="dist">
      {counts.map(c => (
        <div key={c.s} className="dist-row">
          <span className="dist-label">{STATUS_LABEL[c.s]}</span>
          <div className="dist-track">
            <div className="dist-bar" style={{ width: `${(c.n / max) * 100}%`, background: STATUS_COLOR[c.s] }} />
          </div>
          <span className="dist-val mono">{c.n} <small>· {c.kg} kg</small></span>
        </div>
      ))}
      <div className="hist">
        <div className="hist-title">Score histogram (inventory heuristic, 0–100)</div>
        <div className="hist-bars">
          {bins.map((n, i) => {
            return (
              <div key={i} className="hist-col" title={`${i * 10}–${i * 10 + 9}: ${n}`}>
                <div className="hist-fill" style={{ height: `${(n / binMax) * 100}%`, background: i >= 6 ? 'var(--crit)' : i >= 4 ? 'var(--high)' : i >= 3 ? 'var(--mod)' : 'var(--low)' }} />
                <span>{i * 10}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ScoreRing({ value, label, tone }: { value: number | null; label: string; tone?: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const v = value ?? 0;
  const color = tone ?? (v >= 65 ? 'var(--crit)' : v >= 48 ? 'var(--high)' : v >= 30 ? 'var(--mod)' : 'var(--low)');
  return (
    <div className="ring">
      <svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`${label} ${value ?? 'n/a'}`}>
        <circle cx="42" cy="42" r={r} stroke="var(--line)" strokeWidth="8" fill="none" />
        {value !== null && <circle cx="42" cy="42" r={r} stroke={color} strokeWidth="8" fill="none" strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 42 42)" />}
        <text x="42" y="47" textAnchor="middle" className="ring-text">{value ?? '—'}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function ScenarioBars({ rows }: { rows: ScenarioRow[] }) {
  const shown = rows.filter(r => r.baseline.atRiskKg > 0.05 || r.scenario.atRiskKg > 0.05)
    .sort((a, b) => b.baseline.atRiskKg - a.baseline.atRiskKg);
  if (!shown.length) return <div className="empty">No batch is projected to have unused stock under either scenario.</div>;
  const max = Math.max(...shown.map(r => Math.max(r.baseline.atRiskKg, r.scenario.atRiskKg)), 1);
  return (
    <div className="sbars">
      {shown.map(r => {
        const d = r.scenario.atRiskKg - r.baseline.atRiskKg;
        return (
          <div className="sbar" key={r.id}>
            <div className="sbar-name">{r.food} <small className="mono">{r.id}</small></div>
            <div className="sbar-tracks">
              <div className="sbar-track"><div className="sbar-fill base" style={{ width: `${(r.baseline.atRiskKg / max) * 100}%` }} /><span className="mono">{r.baseline.atRiskKg.toFixed(1)}</span></div>
              <div className="sbar-track"><div className="sbar-fill scen" style={{ width: `${(r.scenario.atRiskKg / max) * 100}%` }} /><span className="mono">{r.scenario.atRiskKg.toFixed(1)}</span></div>
            </div>
            <div className={`sbar-delta mono ${d < -0.05 ? 'good' : d > 0.05 ? 'bad' : ''}`}>{Math.abs(d) < 0.05 ? '±0' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`} kg</div>
          </div>
        );
      })}
    </div>
  );
}
