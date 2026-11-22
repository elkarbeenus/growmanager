// Bewässerungsplaner (Crop Steering light) – reine Rechenlogik ohne Abhängigkeiten.
// Tests: src/lib/irrigation.test.ts  (node --experimental-strip-types --test)
//
// Idee: Aus Medium, Feldkapazität (Sensorwert bei vollgesättigtem Medium), Durchfluss und
// Steuerung (vegetativ ↔ generativ) wird ein Tagesplan berechnet:
//   P1  = morgens auf Feldkapazität auffüllen (mehrere Shots im Abstand)
//   P2  = tagsüber kleine Erhaltungs-Shots (nur vegetative Steuerung)
//   Ende = letzter Shot x Stunden vor Licht aus, danach Dryback über Nacht
// Alle Richtwerte sind bewusst einfach („light“) und lassen sich überschreiben.

export type MediumKind = 'block' | 'slab' | 'pot';

export interface MediumPreset {
  id: string;
  kind: MediumKind;
  /** Maße in cm (L × B × H) – für Matten die ganze Matte */
  dims?: [number, number, number];
  /** Volumen in Litern, wenn keine Maße (z. B. Töpfe) */
  liters?: number;
  de: string;
  en: string;
}

export const MEDIUM_PRESETS: MediumPreset[] = [
  { id: 'cube-4', kind: 'block', dims: [4, 4, 4], de: 'Steinwolle-Würfel 4×4×4 cm', en: 'Rockwool cube 4×4×4 cm' },
  { id: 'cube-7.5', kind: 'block', dims: [7.5, 7.5, 6.5], de: 'Steinwolle-Block 7,5×7,5×6,5 cm', en: 'Rockwool block 7.5×7.5×6.5 cm' },
  { id: 'block-10x10x6.5', kind: 'block', dims: [10, 10, 6.5], de: 'Steinwolle-Block 10×10×6,5 cm (Delta)', en: 'Rockwool block 10×10×6.5 cm (Delta)' },
  { id: 'block-10', kind: 'block', dims: [10, 10, 10], de: 'Steinwolle-Block 10×10×10 cm', en: 'Rockwool block 10×10×10 cm' },
  { id: 'block-15', kind: 'block', dims: [15, 15, 15], de: 'Steinwolle-Block 15×15×15 cm', en: 'Rockwool block 15×15×15 cm' },
  { id: 'hugo', kind: 'block', dims: [15, 15, 14.8], de: 'Steinwolle-Block 15×15×14,8 cm (Hugo)', en: 'Rockwool block 15×15×14.8 cm (Hugo)' },
  { id: 'block-20', kind: 'block', dims: [20, 20, 15], de: 'Steinwolle-Block 20×20×15 cm', en: 'Rockwool block 20×20×15 cm' },
  { id: 'slab-100x15x7.5', kind: 'slab', dims: [100, 15, 7.5], de: 'Steinwolle-Matte 100×15×7,5 cm', en: 'Rockwool slab 100×15×7.5 cm' },
  { id: 'slab-100x20x7.5', kind: 'slab', dims: [100, 20, 7.5], de: 'Steinwolle-Matte 100×20×7,5 cm', en: 'Rockwool slab 100×20×7.5 cm' },
  { id: 'pot-3.8', kind: 'pot', liters: 3.8, de: 'Topf 1 gal (3,8 L)', en: 'Pot 1 gal (3.8 L)' },
  { id: 'pot-7.5', kind: 'pot', liters: 7.5, de: 'Topf 2 gal (7,5 L)', en: 'Pot 2 gal (7.5 L)' },
  { id: 'pot-11', kind: 'pot', liters: 11, de: 'Topf 3 gal (11 L)', en: 'Pot 3 gal (11 L)' },
];

export interface IrrigationPlan {
  /** Preset-ID oder 'custom-dims' / 'custom-liters' */
  medium: string;
  customDims?: [number, number, number];
  customLiters?: number;
  /** Pflanzen pro Matte (nur bei Matten) */
  plantsPerSlab?: number;
  /** Sensorwert (VWC %) bei vollgesättigtem Medium nach dem Ablaufen */
  fieldCapacity: number;
  /** gemessener Durchfluss: flowMl in flowSeconds Sekunden */
  flowMl: number;
  flowSeconds: number;
  /** 'dripper' = an einem Tropfer gemessen, 'system' = gesamte Anlage */
  flowBasis: 'dripper' | 'system';
  drippersPerPlant: number;
  /** Pflanzen an dieser Bewässerung; leer = Pflanzenanzahl des Grows */
  plants?: number;
  /** Licht an, „HH:MM“ */
  lightsOn: string;
  /** Lichtstunden; leer = automatisch nach Phase (18 / 12) */
  lightHours?: number;
  /** 0 = ganz vegetativ … 100 = ganz generativ; leer = automatisch nach Phase */
  steering?: number;
  /** eigene Shot-Größe in % des Mediums (überschreibt den Richtwert) */
  shotPctOverride?: number;
  /** eigener Ziel-Dryback über Nacht in Prozentpunkten (überschreibt den Richtwert) */
  drybackOverride?: number;
}

export const DEFAULT_PLAN: IrrigationPlan = {
  medium: 'block-15',
  fieldCapacity: 88,
  flowMl: 0,
  flowSeconds: 30,
  flowBasis: 'dripper',
  drippersPerPlant: 2,
  lightsOn: '06:00',
};

/** Phasen-Schlüssel aus growLogic (veg, stretch, bloom, ready, …) → Richtwert für die Steuerung. */
export function autoSteering(phaseKey: string): number {
  switch (phaseKey) {
    case 'veg':
    case 'germination':
    case 'planning':
      return 20; // vegetativ: Masse aufbauen
    case 'stretch':
      return 80; // frühe Blüte: generativ, Stretch bremsen
    case 'bloom':
      return 45; // Blütenmasse: ausgewogen, leicht vegetativ
    case 'ready':
      return 70; // Reife: wieder generativer
    default:
      return 50;
  }
}

export function autoLightHours(phaseKey: string): number {
  return phaseKey === 'stretch' || phaseKey === 'bloom' || phaseKey === 'ready' ? 12 : 18;
}

export function steeringLabel(s: number): { de: string; en: string } {
  if (s < 30) return { de: 'Vegetativ', en: 'Vegetative' };
  if (s < 45) return { de: 'Leicht vegetativ', en: 'Slightly vegetative' };
  if (s <= 55) return { de: 'Ausgewogen', en: 'Balanced' };
  if (s <= 70) return { de: 'Leicht generativ', en: 'Slightly generative' };
  return { de: 'Generativ', en: 'Generative' };
}

/** Mediumvolumen pro Pflanze in Litern. */
export function mediumLitersPerPlant(p: IrrigationPlan): number {
  const preset = MEDIUM_PRESETS.find((m) => m.id === p.medium);
  let liters = 0;
  let kind: MediumKind = 'block';
  if (preset) {
    kind = preset.kind;
    liters = preset.dims ? (preset.dims[0] * preset.dims[1] * preset.dims[2]) / 1000 : preset.liters ?? 0;
  } else if (p.medium === 'custom-dims' && p.customDims) {
    liters = (p.customDims[0] * p.customDims[1] * p.customDims[2]) / 1000;
  } else if (p.medium === 'custom-liters') {
    liters = p.customLiters ?? 0;
  }
  if (kind === 'slab') liters = liters / Math.max(1, Math.round(p.plantsPerSlab ?? 3));
  return liters > 0 && Number.isFinite(liters) ? liters : 0;
}

export const isSlab = (p: IrrigationPlan) => MEDIUM_PRESETS.find((m) => m.id === p.medium)?.kind === 'slab';

/** Erhaltungs-Shots (P2) sind kleiner als die Auffüll-Shots (P1). */
export const P2_SHOT_FACTOR = 0.6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** „HH:MM“ → Minuten seit Mitternacht (oder null). */
export function parseTime(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Sekunden → „m:ss“ (für den Timer). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface TimerBlock {
  key: 'p1' | 'p2';
  start: number; // Minuten seit Mitternacht
  end: number; // Ende des letzten Shots
  shots: number;
  intervalMin: number; // Abstand Shot-Beginn zu Shot-Beginn
  runSeconds: number; // Pumpenlaufzeit pro Shot
  shotMl: number; // pro Pflanze und Shot
  pauseSeconds: number; // Pause zwischen zwei Shots (für Zyklus-Timer)
}

export interface PlanResult {
  ok: boolean;
  missing: ('medium' | 'flow' | 'fc' | 'lights')[];
  steering: number;
  lightHours: number;
  plants: number;
  mediumLiters: number; // pro Pflanze
  shotPct: number;
  shotMl: number; // pro Pflanze
  shotMlTotal: number; // alle Pflanzen (aus dem Tank)
  flowPerPlantMlS: number;
  runSeconds: number;
  drybackPoints: number; // Ziel-Dryback über Nacht (Prozentpunkte VWC)
  drybackRelPct: number; // relativ zur Feldkapazität
  morningVwc: number; // erwarteter Sensorwert vor P1
  p1: TimerBlock | null;
  p2: TimerBlock | null;
  lightsOn: number;
  lightsOff: number;
  lastShotBeforeOffH: number;
  shotsPerDay: number;
  dailyMlPerPlant: number;
  dailyMlTotal: number;
}

/** Tagesplan berechnen. phaseKey bestimmt die Automatik für Steuerung und Lichtstunden. */
export function computePlan(p: IrrigationPlan, phaseKey: string, growPlants: number): PlanResult {
  const steering = clamp(Math.round(p.steering ?? autoSteering(phaseKey)), 0, 100);
  const g = steering / 100; // 0 vegetativ … 1 generativ
  const lightHours = clamp(p.lightHours ?? autoLightHours(phaseKey), 1, 24);
  const plants = Math.max(1, Math.round(p.plants ?? growPlants ?? 1));
  const mediumLiters = mediumLitersPerPlant(p);
  const fc = Number(p.fieldCapacity);
  const lightsOn = parseTime(p.lightsOn);

  const flowRaw = p.flowSeconds > 0 ? p.flowMl / p.flowSeconds : 0; // mL/s
  const drippers = Math.max(1, Math.round(p.drippersPerPlant || 1));
  const flowPerPlantMlS = p.flowBasis === 'dripper' ? flowRaw * drippers : flowRaw / plants;

  const missing: PlanResult['missing'] = [];
  if (!(mediumLiters > 0)) missing.push('medium');
  if (!(flowPerPlantMlS > 0)) missing.push('flow');
  if (!(fc > 20 && fc <= 100)) missing.push('fc');
  if (lightsOn === null) missing.push('lights');

  // Richtwerte (im Einklang mit dem Shot-Size-Rechner: vegetativ 4–6 %, generativ 2–4 %)
  const shotPct = clamp(p.shotPctOverride ?? Math.round(lerp(5, 3, g) * 10) / 10, 0.5, 15);
  const drybackPoints = clamp(p.drybackOverride ?? Math.round(lerp(8, 16, g)), 1, 40);
  const p1StartAfterOnH = lerp(1, 2.5, g); // generativ später anfangen
  const p1IntervalMin = Math.round(lerp(15, 30, g) / 5) * 5;
  const lastShotBeforeOffH = Math.round(lerp(1.5, 4, g) * 2) / 2; // generativ früher aufhören
  const p2IntervalMin = g < 0.5 ? Math.round(lerp(45, 120, g / 0.5) / 15) * 15 : 0; // P2 nur vegetativ

  const shotMl = (mediumLiters * 1000 * shotPct) / 100;
  const runSeconds = flowPerPlantMlS > 0 ? Math.max(1, Math.round(shotMl / flowPerPlantMlS)) : 0;
  // 1 % Shot ≈ +1 Prozentpunkt VWC (vereinfacht); ein Shot zusätzlich für leichten Ablauf
  const p1Shots = clamp(Math.ceil(drybackPoints / shotPct) + 1, 1, 15);

  const ok = missing.length === 0;
  const on = lightsOn ?? 0;
  const off = on + lightHours * 60;
  const lastShotAt = off - lastShotBeforeOffH * 60;
  const pause = Math.max(0, p1IntervalMin * 60 - runSeconds);

  let p1: TimerBlock | null = null;
  let p2: TimerBlock | null = null;
  if (ok) {
    const p1Start = Math.round((on + p1StartAfterOnH * 60) / 5) * 5;
    const p1End = p1Start + (p1Shots - 1) * p1IntervalMin + runSeconds / 60;
    p1 = { key: 'p1', start: p1Start, end: p1End, shots: p1Shots, intervalMin: p1IntervalMin, runSeconds, shotMl, pauseSeconds: pause };
    if (p2IntervalMin > 0) {
      const p2Start = p1Start + (p1Shots - 1) * p1IntervalMin + p2IntervalMin;
      if (p2Start <= lastShotAt) {
        const shots = Math.floor((lastShotAt - p2Start) / p2IntervalMin) + 1;
        const p2Ml = shotMl * P2_SHOT_FACTOR;
        const p2Run = Math.max(1, Math.round(p2Ml / flowPerPlantMlS));
        p2 = {
          key: 'p2',
          start: p2Start,
          end: p2Start + (shots - 1) * p2IntervalMin + p2Run / 60,
          shots,
          intervalMin: p2IntervalMin,
          runSeconds: p2Run,
          shotMl: p2Ml,
          pauseSeconds: Math.max(0, p2IntervalMin * 60 - p2Run),
        };
      }
    }
  }
  const shotsPerDay = (p1?.shots ?? 0) + (p2?.shots ?? 0);
  const dailyMlPerPlant = (p1 ? p1.shots * p1.shotMl : 0) + (p2 ? p2.shots * p2.shotMl : 0);

  return {
    ok,
    missing,
    steering,
    lightHours,
    plants,
    mediumLiters,
    shotPct,
    shotMl,
    shotMlTotal: shotMl * plants,
    flowPerPlantMlS,
    runSeconds,
    drybackPoints,
    drybackRelPct: fc > 0 ? (drybackPoints / fc) * 100 : 0,
    morningVwc: fc - drybackPoints,
    p1,
    p2,
    lightsOn: on,
    lightsOff: off,
    lastShotBeforeOffH,
    shotsPerDay,
    dailyMlPerPlant,
    dailyMlTotal: dailyMlPerPlant * plants,
  };
}

/** Gespeicherte Daten bereinigen (Import/Backup). */
export function normalizePlan(v: unknown): IrrigationPlan | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number): number | undefined => {
    const n = Number(x);
    return x === undefined || x === null || x === '' || !Number.isFinite(n) ? undefined : clamp(n, lo, hi);
  };
  const dims = Array.isArray(o.customDims) && o.customDims.length === 3 ? (o.customDims.map((d) => num(d, 0, 500) ?? 0) as [number, number, number]) : undefined;
  return {
    medium: typeof o.medium === 'string' && o.medium ? o.medium : DEFAULT_PLAN.medium,
    customDims: dims,
    customLiters: num(o.customLiters, 0, 500),
    plantsPerSlab: num(o.plantsPerSlab, 1, 12),
    fieldCapacity: num(o.fieldCapacity, 1, 100) ?? DEFAULT_PLAN.fieldCapacity,
    flowMl: num(o.flowMl, 0, 100000) ?? 0,
    flowSeconds: num(o.flowSeconds, 1, 3600) ?? DEFAULT_PLAN.flowSeconds,
    flowBasis: o.flowBasis === 'system' ? 'system' : 'dripper',
    drippersPerPlant: num(o.drippersPerPlant, 1, 12) ?? DEFAULT_PLAN.drippersPerPlant,
    plants: num(o.plants, 1, 50),
    lightsOn: typeof o.lightsOn === 'string' && parseTime(o.lightsOn) !== null ? o.lightsOn : DEFAULT_PLAN.lightsOn,
    lightHours: num(o.lightHours, 1, 24),
    steering: num(o.steering, 0, 100),
    shotPctOverride: num(o.shotPctOverride, 0.5, 15),
    drybackOverride: num(o.drybackOverride, 1, 40),
  };
}
