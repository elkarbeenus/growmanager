// Ausführen: node --experimental-strip-types --test src/lib/updateDecision.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planUpdate, pickAsset } from './updateDecision.ts';
import { compareVersions, readableVersion } from './versions.ts';

const assets = [
  { name: 'growmanager_0.5.2_amd64.AppImage', url: 'https://x/a.AppImage', size: 1 },
  { name: 'growmanager_0.5.2_amd64.deb', url: 'https://x/a.deb', size: 1 },
  { name: 'growmanager_0.5.2_x64-setup.exe', url: 'https://x/a.exe', size: 1 },
  { name: 'SHA256SUMS.txt', url: 'https://x/sums', size: 1 },
];

test('älter, gleich, neuer', () => {
  assert.equal(planUpdate('0.5.2', { version: '0.5.1', assets }, 'appimage').kind, 'none');
  assert.equal(planUpdate('0.5.2', { version: '0.5.2', assets }, 'appimage').kind, 'none');
  const p = planUpdate('0.5.1', { version: '0.5.2', assets }, 'appimage');
  assert.equal(p.kind, 'auto');
  if (p.kind === 'auto') assert.equal(p.asset.name, 'growmanager_0.5.2_amd64.AppImage');
});

test('Test-Build über einem Release', () => {
  assert.ok(compareVersions('0.5.2-test', '0.5.1') > 0); // neuer als das letzte Release
  assert.ok(compareVersions('0.5.2-test', '0.5.2') < 0); // aber älter als das fertige 0.5.2
  assert.equal(planUpdate('0.5.2-test', { version: '0.5.2', assets }, 'windows').kind, 'auto');
  assert.equal(planUpdate('0.5.2', { version: '0.5.2-test', assets }, 'windows').kind, 'none');
});

test('Windows nimmt das Setup', () => {
  assert.equal(pickAsset(assets, 'windows')?.name, 'growmanager_0.5.2_x64-setup.exe');
});

test('ohne passende Datei oder Prüfsummen nur Download-Seite', () => {
  assert.deepEqual(planUpdate('0.5.1', { version: '0.5.2', assets: [assets[1]] }, 'appimage'), { kind: 'manual', reason: 'no-asset' });
  assert.deepEqual(planUpdate('0.5.1', { version: '0.5.2', assets: assets.slice(0, 3) }, 'appimage'), { kind: 'manual', reason: 'no-sums' });
  assert.deepEqual(planUpdate('0.5.1', { version: '0.5.2', assets }, 'other'), { kind: 'manual', reason: 'platform' });
  assert.deepEqual(planUpdate('0.5.1', { version: '0.5.2', assets }, 'web'), { kind: 'manual', reason: 'platform' });
});

test('lesbare Versionen', () => {
  assert.equal(readableVersion('v0.5.2'), '0.5.2');
  assert.equal(readableVersion('0.5.2-test'), '0.5.2 Test');
  assert.equal(readableVersion('0.5.2-test.3'), '0.5.2 Test 3');
});
