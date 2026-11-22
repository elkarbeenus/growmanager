// Ausführen: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, DEFAULT_PLAN, mediumLitersPerPlant, normalizePlan, formatDuration, type IrrigationPlan } from './irrigation.ts';

const base: IrrigationPlan = { ...DEFAULT_PLAN, medium: 'block-15', fieldCapacity: 88, flowMl: 100, flowSeconds: 30, flowBasis: 'dripper', drippersPerPlant: 2, lightsOn: '06:00' };

test('15er Block = 3,375 L, Matte wird auf Pflanzen verteilt', () => {
  assert.equal(mediumLitersPerPlant(base), 3.375);
  assert.equal(mediumLitersPerPlant({ ...base, medium: 'slab-100x15x7.5', plantsPerSlab: 3 }), 3.75);
  assert.equal(mediumLitersPerPlant({ ...base, medium: 'custom-dims', customDims: [10, 10, 10] }), 1);
  assert.equal(mediumLitersPerPlant({ ...base, medium: 'custom-liters', customLiters: 11 }), 11);
});

test('Laufzeit: 100 mL/30 s pro Tropfer × 2 Tropfer, vegetativ 5 %', () => {
  const r = computePlan({ ...base, steering: 0 }, 'veg', 4);
  assert.ok(r.ok);
  assert.equal(r.shotPct, 5);
  assert.ok(Math.abs(r.shotMl - 168.75) < 0.01);
  assert.ok(Math.abs(r.flowPerPlantMlS - 6.6667) < 0.001);
  assert.equal(r.runSeconds, 25); // 168,75 mL / 6,67 mL/s ≈ 25 s
  assert.ok(Math.abs(r.shotMlTotal - 675) < 0.01); // 4 Pflanzen aus dem Tank
});

test('Pflanzenanzahl ändert die Laufzeit nur bei Messung der ganzen Anlage', () => {
  const a = computePlan({ ...base, plants: 2, steering: 50 }, 'veg', 2).runSeconds;
  const b = computePlan({ ...base, plants: 5, steering: 50 }, 'veg', 5).runSeconds;
  assert.equal(a, b);
  const sys2 = computePlan({ ...base, flowBasis: 'system', flowMl: 400, plants: 2, steering: 50 }, 'veg', 2).runSeconds;
  const sys4 = computePlan({ ...base, flowBasis: 'system', flowMl: 400, plants: 4, steering: 50 }, 'veg', 4).runSeconds;
  assert.ok(sys4 > sys2);
  assert.ok(Math.abs(sys4 / sys2 - 2) < 0.05);
});

test('vegetativ: P1 früher, P2 vorhanden; generativ: später, kein P2, früher Schluss', () => {
  const veg = computePlan({ ...base, steering: 0 }, 'veg', 1);
  const gen = computePlan({ ...base, steering: 100, lightHours: 12 }, 'stretch', 1);
  assert.ok(veg.p1 && gen.p1);
  assert.ok(veg.p1!.start < gen.p1!.start);
  assert.ok(veg.p2 !== null);
  assert.equal(gen.p2, null);
  assert.ok(gen.drybackPoints > veg.drybackPoints);
  assert.ok(gen.lastShotBeforeOffH > veg.lastShotBeforeOffH);
  assert.ok(gen.shotPct < veg.shotPct);
  assert.ok(veg.p2!.shotMl < veg.p1!.shotMl && veg.p2!.runSeconds < veg.p1!.runSeconds);
  assert.ok(Math.abs(veg.dailyMlPerPlant - (veg.p1!.shots * veg.p1!.shotMl + veg.p2!.shots * veg.p2!.shotMl)) < 0.01);
  // P2 endet vor dem letzten erlaubten Zeitpunkt
  assert.ok(veg.p2!.end <= veg.lightsOff - veg.lastShotBeforeOffH * 60 + 1);
});

test('Automatik nach Phase', () => {
  assert.equal(computePlan(base, 'veg', 1).lightHours, 18);
  assert.equal(computePlan(base, 'bloom', 1).lightHours, 12);
  assert.ok(computePlan(base, 'stretch', 1).steering > 60);
  assert.ok(computePlan(base, 'veg', 1).steering < 40);
});

test('fehlende Angaben werden gemeldet', () => {
  const r = computePlan({ ...base, flowMl: 0 }, 'veg', 1);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['flow']);
  assert.equal(r.p1, null);
});

test('Hilfsfunktionen', () => {
  assert.equal(formatDuration(25), '0:25');
  assert.equal(formatDuration(95), '1:35');
  const n = normalizePlan({ medium: 'block-15', fieldCapacity: '88', flowMl: 100, flowBasis: 'x', lightsOn: '25:00' });
  assert.equal(n?.fieldCapacity, 88);
  assert.equal(n?.flowBasis, 'dripper');
  assert.equal(n?.lightsOn, '06:00');
  assert.equal(normalizePlan(null), undefined);
});
