// Entscheidung fürs Selbst-Update – reine Logik ohne Abhängigkeiten (Tests: src/lib/updateDecision.test.ts).
import { compareVersions } from './versions.ts';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

/** Wie die laufende App installiert ist (kommt aus der Desktop-App). */
export type UpdatePlatform = 'appimage' | 'windows' | 'other' | 'off' | 'web';

/** Passende Installationsdatei für diese Plattform aus den Release-Dateien. */
export function pickAsset(assets: ReleaseAsset[] | undefined, platform: UpdatePlatform): ReleaseAsset | null {
  const list = assets ?? [];
  if (platform === 'appimage') {
    const images = list.filter((a) => /\.AppImage$/i.test(a.name));
    return images.find((a) => /(amd64|x86_64)/i.test(a.name)) ?? images[0] ?? null;
  }
  if (platform === 'windows') {
    return list.find((a) => /-setup\.exe$/i.test(a.name)) ?? list.find((a) => /\.exe$/i.test(a.name)) ?? null;
  }
  return null;
}

/** Datei mit den SHA-256-Prüfsummen des Releases. */
export function sumsAsset(assets: ReleaseAsset[] | undefined): ReleaseAsset | null {
  return (assets ?? []).find((a) => /^SHA256SUMS(\.txt)?$/i.test(a.name)) ?? null;
}

export type UpdatePlan =
  | { kind: 'none' } // aktuell oder neuer
  | { kind: 'auto'; asset: ReleaseAsset; sums: ReleaseAsset } // Ein-Klick-Update möglich
  | { kind: 'manual'; reason: 'platform' | 'no-asset' | 'no-sums' }; // nur Download-Seite

/** Was soll die App bei diesem Release anbieten? */
export function planUpdate(
  current: string,
  latest: { version: string; assets?: ReleaseAsset[] } | null,
  platform: UpdatePlatform
): UpdatePlan {
  if (!latest || compareVersions(latest.version, current) <= 0) return { kind: 'none' };
  if (platform !== 'appimage' && platform !== 'windows') return { kind: 'manual', reason: 'platform' };
  const asset = pickAsset(latest.assets, platform);
  if (!asset) return { kind: 'manual', reason: 'no-asset' };
  const sums = sumsAsset(latest.assets);
  if (!sums) return { kind: 'manual', reason: 'no-sums' };
  return { kind: 'auto', asset, sums };
}
