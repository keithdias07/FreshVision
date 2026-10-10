import type { Batch } from './data';

// Transparent, configurable HEURISTIC risk model. Not calibrated against real
// spoilage outcomes — weights and constants are explicit assumptions.

export interface Weights {
  age: number;
  temperature: number;
  humidity: number;
  demand: number;
  visual: number;
}

export interface ModelConfig {
  weights: Weights;
  /** Degradation multiplier per +10 °C above ideal (Q10-style assumption). */
  q10: number;
  /** TCS items with this many excursion hours are held (set per your HACCP plan). */
  tcsExcursionHoldHours: number;
  /** Visual heuristic score at/above which the batch must be manually inspected. */
  visualHoldScore: number;
}

export const DEFAULT_CONFIG: ModelConfig = {
  weights: { age: 0.3, temperature: 0.25, humidity: 0.1, demand: 0.2, visual: 0.15 },
  q10: 2.5,
  tcsExcursionHoldHours: 4,
  visualHoldScore: 70,
};

export type Status = 'hold' | 'critical' | 'high' | 'moderate' | 'low';

export interface Factor {
  key: keyof Weights;
  label: string;
  score: number; // 0-100
  weight: number; // effective (renormalised) weight
  points: number; // score * weight
  detail: string;
}

export interface Assessment {
  batch: Batch;
  inventoryScore: number; // 0-100 overall heuristic
  visualScore?: number;
  factors: Factor[];
  status: Status;
  holdReasons: string[];
  degradationMult: number;
  lifeUsedPct: number;
  remainingDays: number; // calendar days left at current conditions
  daysToDeplete: number;
  atRiskKg: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface Overrides {
  avgTempC?: number;
  humidityPct?: number;
  consumptionKgPerDay?: number;
  quantityKg?: number;
}

export function assess(batch: Batch, cfg: ModelConfig, ov: Overrides = {}): Assessment {
  const temp = ov.avgTempC ?? batch.avgTempC;
  const hum = ov.humidityPct ?? batch.humidityPct;
  const rate = ov.consumptionKgPerDay ?? batch.consumptionKgPerDay;
  const qty = ov.quantityKg ?? batch.quantityKg;

  // Life already consumed uses the HISTORICAL temperature (the past can't change).
  const histDev = batch.avgTempC - batch.idealTempC;
  const histMult = Math.pow(cfg.q10, Math.max(0, histDev) / 10);
  const lifeUsed = batch.ageDays * histMult;
  // Future degradation uses the (possibly intervened) forward temperature.
  const fwdDev = temp - batch.idealTempC;
  const fwdMult = Math.pow(cfg.q10, Math.max(0, fwdDev) / 10);
  const remainingDays = Math.max(0, (batch.shelfLifeDays - lifeUsed) / fwdMult);
  const lifeUsedPct = clamp01(lifeUsed / batch.shelfLifeDays) * 100;
  const daysToDeplete = rate > 0 ? qty / rate : Infinity;

  const ageScore = lifeUsedPct;
  const tempScore = (clamp01(Math.abs(fwdDev) / 6) * 0.7 + clamp01(batch.excursionHours / 8) * 0.3) * 100;
  const humScore = clamp01(Math.abs(hum - batch.idealHumidityPct) / 25) * 100;
  const unusedFrac = remainingDays <= 0 ? 1 : clamp01(1 - (rate * remainingDays) / Math.max(qty, 1e-6));
  const demandScore = unusedFrac * 100;

  const w = cfg.weights;
  const hasVisual = batch.visualScore !== undefined;
  const raw: { key: keyof Weights; label: string; score: number; w: number; detail: string }[] = [
    { key: 'age', label: 'Storage age', score: ageScore, w: w.age, detail: `${batch.ageDays}d of ~${batch.shelfLifeDays}d reference life; temp-adjusted ${lifeUsedPct.toFixed(0)}% used` },
    { key: 'temperature', label: 'Temperature deviation', score: tempScore, w: w.temperature, detail: `${temp.toFixed(1)}°C vs ${batch.idealTempC}°C target · ${batch.excursionHours}h excursions` },
    { key: 'humidity', label: 'Humidity deviation', score: humScore, w: w.humidity, detail: `${hum}% RH vs ${batch.idealHumidityPct}% target` },
    { key: 'demand', label: 'Demand shortfall', score: demandScore, w: w.demand, detail: `${rate.toFixed(1)} kg/day → ${isFinite(daysToDeplete) ? daysToDeplete.toFixed(1) : '∞'}d to use vs ${remainingDays.toFixed(1)}d left` },
  ];
  if (hasVisual) raw.push({ key: 'visual', label: 'Visual indicators', score: batch.visualScore!, w: w.visual, detail: 'Image heuristic from latest inspection' });
  const wSum = raw.reduce((a, r) => a + r.w, 0) || 1;
  const factors: Factor[] = raw.map(r => {
    const weight = r.w / wSum;
    return { key: r.key, label: r.label, score: Math.round(r.score), weight, points: r.score * weight, detail: r.detail };
  });
  const inventoryScore = Math.round(factors.reduce((a, f) => a + f.points, 0));

  // Food-safety rules — these OVERRIDE any score. A low visual score never clears them.
  const holdReasons: string[] = [];
  if (lifeUsed >= batch.shelfLifeDays) holdReasons.push('Past estimated usable life — verify against date labels / quality before any use.');
  if (batch.tcs && batch.excursionHours >= cfg.tcsExcursionHoldHours) holdReasons.push(`Temperature-controlled item with ${batch.excursionHours}h logged excursions (≥${cfg.tcsExcursionHoldHours}h) — follow your HACCP/food-safety discard policy.`);
  if (hasVisual && batch.visualScore! >= cfg.visualHoldScore) holdReasons.push(`Visual heuristic ${batch.visualScore} ≥ ${cfg.visualHoldScore} — manual inspection required.`);

  let status: Status;
  if (holdReasons.length) status = 'hold';
  else if (inventoryScore >= 65) status = 'critical';
  else if (inventoryScore >= 48) status = 'high';
  else if (inventoryScore >= 30) status = 'moderate';
  else status = 'low';

  // Quantity projected to remain unused when usable life runs out.
  const atRiskKg = status === 'hold' ? qty : Math.max(0, qty - rate * remainingDays);

  return {
    batch, inventoryScore, visualScore: batch.visualScore, factors, status, holdReasons,
    degradationMult: fwdMult, lifeUsedPct, remainingDays, daysToDeplete, atRiskKg,
  };
}

export const STATUS_LABEL: Record<Status, string> = {
  hold: 'Hold · inspect', critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low',
};

// ---------------------------------------------------------------- Simulator

export interface Intervention {
  menuBoost: number; // consumption multiplier, 1 = none
  fixStorage: boolean; // move to ideal temp & humidity from today
  transferKg: number; // redistribute to another site / donation partner (if safe)
}

export const NO_INTERVENTION: Intervention = { menuBoost: 1, fixStorage: false, transferKg: 0 };

export function isActive(i?: Intervention) {
  return !!i && (i.menuBoost !== 1 || i.fixStorage || i.transferKg > 0);
}

export interface ScenarioRow {
  id: string;
  food: string;
  baseline: Assessment;
  scenario: Assessment;
  blocked: string[];
}

export function runScenario(batches: Batch[], cfg: ModelConfig, plan: Record<string, Intervention>): ScenarioRow[] {
  return batches.map(b => {
    const baseline = assess(b, cfg);
    const iv = plan[b.id];
    const blocked: string[] = [];
    if (!isActive(iv)) return { id: b.id, food: b.food, baseline, scenario: baseline, blocked };
    const ov: Overrides = {};
    if (iv.fixStorage) { ov.avgTempC = b.idealTempC; ov.humidityPct = b.idealHumidityPct; }
    if (baseline.status === 'hold') {
      // Safety gate: held stock cannot be pushed to menus or donated in the model.
      if (iv.menuBoost !== 1) blocked.push('Menu prioritisation blocked: batch is on safety hold.');
      if (iv.transferKg > 0) blocked.push('Transfer blocked: batch is on safety hold.');
    } else {
      if (iv.menuBoost !== 1) ov.consumptionKgPerDay = b.consumptionKgPerDay * iv.menuBoost;
      if (iv.transferKg > 0) ov.quantityKg = Math.max(0, b.quantityKg - iv.transferKg);
    }
    return { id: b.id, food: b.food, baseline, scenario: assess(b, cfg, ov), blocked };
  });
}

// ---------------------------------------------------------------- Recommendations

export interface Recommendation {
  priority: 1 | 2 | 3;
  batchId: string;
  title: string;
  why: string;
  kind: 'safety' | 'inspect' | 'storage' | 'use-first' | 'purchasing' | 'capture';
}

export function recommend(list: Assessment[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const a of list) {
    const b = a.batch;
    const dev = b.avgTempC - b.idealTempC;
    if (a.status === 'hold') {
      recs.push({ priority: 1, batchId: b.id, kind: 'safety', title: `Quarantine ${b.food} (${b.id}) — do not serve until cleared`, why: a.holdReasons.join(' ') });
      continue; // never suggest using held stock
    }
    if (Math.abs(dev) >= 2) {
      recs.push({ priority: a.status === 'critical' || a.status === 'high' ? 1 : 2, batchId: b.id, kind: 'storage', title: `Verify storage for ${b.food}: ${b.avgTempC}°C logged vs ${b.idealTempC}°C target`, why: `Check thermometer calibration and placement in ${b.storage}. Model assumes ~${a.degradationMult.toFixed(2)}× faster ageing at current conditions.` });
    }
    if (a.visualScore !== undefined && a.visualScore >= 40) {
      recs.push({ priority: 1, batchId: b.id, kind: 'inspect', title: `Manually inspect ${b.food} (${b.id})`, why: `Visual heuristic ${a.visualScore}/100 flagged discoloration/texture indicators. Image heuristics can be wrong both ways.` });
    }
    if (a.atRiskKg > 0.5 && (a.status === 'critical' || a.status === 'high' || a.status === 'moderate')) {
      recs.push({ priority: a.status === 'moderate' ? 2 : 1, batchId: b.id, kind: 'use-first', title: `Use ${b.food} first — schedule in today's menu after a quality check`, why: `~${a.atRiskKg.toFixed(1)} kg projected unused within ${a.remainingDays.toFixed(1)}d at ${b.consumptionKgPerDay} kg/day. Only use stock that passes inspection.` });
      const cut = Math.round(a.atRiskKg);
      if (cut >= 1) recs.push({ priority: 3, batchId: b.id, kind: 'purchasing', title: `Reduce next ${b.food} order by ~${cut} kg`, why: `Current stock outpaces demand. Align order size with ${b.consumptionKgPerDay} kg/day usage.` });
    }
    if (a.visualScore === undefined && a.inventoryScore >= 45) {
      recs.push({ priority: 2, batchId: b.id, kind: 'capture', title: `Capture an inspection photo for ${b.food}`, why: 'No visual data yet; a photo adds an independent signal to the score.' });
    }
  }
  return recs.sort((x, y) => x.priority - y.priority);
}
