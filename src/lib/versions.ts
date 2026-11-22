// Versionsvergleich – reine Logik ohne Abhängigkeiten (auch mit `node --test` prüfbar).

/** Zerlegt „v1.10.2-beta.1“ in Zahlen [1,10,2] und Zusatz „beta.1“. */
export function parseVersion(v: string): { nums: number[]; pre: string } | null {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { nums: m[1].split('.').map((n) => parseInt(n, 10)), pre: m[2] ?? '' };
}

/** >0 wenn a neuer ist als b, <0 wenn älter, 0 wenn gleich. Ungültige Versionen gelten als „älter“. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  // 1.9.0-beta ist älter als 1.9.0
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  return pa.pre === pb.pre ? 0 : pa.pre > pb.pre ? 1 : -1;
}

export const cleanVersion = (v: string) => String(v).trim().replace(/^v/i, '');

/** Lesbare Version: „0.5.2-test“ → „0.5.2 Test“. */
export function readableVersion(v: string): string {
  const p = parseVersion(v);
  if (!p) return cleanVersion(v);
  const base = p.nums.join('.');
  return p.pre ? `${base} ${p.pre.replace(/^test\.?/i, 'Test ').replace(/[.-]/g, ' ').trim()}` : base;
}
