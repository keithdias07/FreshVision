// DEMO DATA — illustrative values only, not from a real kitchen or supplier.

export type Storage = 'Walk-in chiller' | 'Ambient rack' | 'Reach-in fridge' | 'Produce cooler';

export interface Batch {
  id: string;
  food: string;
  emoji: string;
  quantityKg: number;
  ageDays: number;
  /** Typical usable life under ideal storage (reference guide value, demo). */
  shelfLifeDays: number;
  storage: Storage;
  idealTempC: number;
  /** Mean logged temperature over storage period (demo sensor log). */
  avgTempC: number;
  /** Hours logged outside the safe band (cold-chain excursions). */
  excursionHours: number;
  humidityPct: number;
  idealHumidityPct: number;
  /** Average daily consumption from recent sales/menu usage (demo). */
  consumptionKgPerDay: number;
  /** Visual score attached from an inspection (0-100), if any. */
  visualScore?: number;
  /** Requires temperature control for safety (cut produce, leafy greens, etc). */
  tcs: boolean;
}

export const DEMO_BATCHES: Batch[] = [
  { id: 'B-1042', food: 'Strawberries', emoji: '🍓', quantityKg: 18, ageDays: 3, shelfLifeDays: 5, storage: 'Walk-in chiller', idealTempC: 2, avgTempC: 5.5, excursionHours: 3, humidityPct: 82, idealHumidityPct: 92, consumptionKgPerDay: 3.2, tcs: false },
  { id: 'B-1043', food: 'Baby spinach', emoji: '🥬', quantityKg: 12, ageDays: 4, shelfLifeDays: 7, storage: 'Reach-in fridge', idealTempC: 2, avgTempC: 6.8, excursionHours: 7, humidityPct: 88, idealHumidityPct: 95, consumptionKgPerDay: 1.4, tcs: true },
  { id: 'B-1044', food: 'Bananas', emoji: '🍌', quantityKg: 30, ageDays: 3, shelfLifeDays: 7, storage: 'Ambient rack', idealTempC: 14, avgTempC: 18, excursionHours: 0, humidityPct: 60, idealHumidityPct: 90, consumptionKgPerDay: 4.5, tcs: false },
  { id: 'B-1045', food: 'Roma tomatoes', emoji: '🍅', quantityKg: 25, ageDays: 5, shelfLifeDays: 10, storage: 'Ambient rack', idealTempC: 13, avgTempC: 19, excursionHours: 0, humidityPct: 70, idealHumidityPct: 90, consumptionKgPerDay: 3.0, tcs: false },
  { id: 'B-1046', food: 'Avocados', emoji: '🥑', quantityKg: 14, ageDays: 6, shelfLifeDays: 9, storage: 'Produce cooler', idealTempC: 7, avgTempC: 7.5, excursionHours: 0, humidityPct: 88, idealHumidityPct: 90, consumptionKgPerDay: 1.1, tcs: false },
  { id: 'B-1047', food: 'Carrots', emoji: '🥕', quantityKg: 40, ageDays: 9, shelfLifeDays: 28, storage: 'Walk-in chiller', idealTempC: 1, avgTempC: 2, excursionHours: 0, humidityPct: 94, idealHumidityPct: 95, consumptionKgPerDay: 2.8, tcs: false },
  { id: 'B-1048', food: 'Cut melon (prep)', emoji: '🍈', quantityKg: 6, ageDays: 2, shelfLifeDays: 3, storage: 'Reach-in fridge', idealTempC: 3, avgTempC: 6, excursionHours: 5, humidityPct: 90, idealHumidityPct: 90, consumptionKgPerDay: 1.5, tcs: true },
  { id: 'B-1049', food: 'Apples (Gala)', emoji: '🍎', quantityKg: 35, ageDays: 12, shelfLifeDays: 45, storage: 'Walk-in chiller', idealTempC: 1, avgTempC: 1.5, excursionHours: 0, humidityPct: 92, idealHumidityPct: 92, consumptionKgPerDay: 1.9, tcs: false },
  { id: 'B-1050', food: 'Mushrooms', emoji: '🍄', quantityKg: 8, ageDays: 4, shelfLifeDays: 6, storage: 'Reach-in fridge', idealTempC: 2, avgTempC: 4, excursionHours: 1, humidityPct: 80, idealHumidityPct: 92, consumptionKgPerDay: 0.9, tcs: false },
  { id: 'B-1051', food: 'Bell peppers', emoji: '🫑', quantityKg: 16, ageDays: 3, shelfLifeDays: 14, storage: 'Produce cooler', idealTempC: 8, avgTempC: 8, excursionHours: 0, humidityPct: 90, idealHumidityPct: 92, consumptionKgPerDay: 1.6, tcs: false },
];
