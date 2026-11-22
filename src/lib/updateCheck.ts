// Update-Check: Beim Start wird bei GitHub nachgesehen, ob es ein neueres Release gibt.
// Es werden dabei keine Nutzerdaten gesendet – nur eine einfache Abfrage der öffentlichen Release-Liste.
// Offline oder bei Fehlern passiert nichts (kein Fehler-Popup).
import { useSyncExternalStore } from 'react';
import { APP_VERSION } from '@/lib/appInfo';
import type { ReleaseAsset } from './updateDecision.ts';
import { compareVersions, cleanVersion, parseVersion as parse } from './versions.ts';

export { compareVersions, cleanVersion };

export const REPO = 'elkarbeenus/growmanager';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const API = `https://api.github.com/repos/${REPO}`;
const TIMEOUT_MS = 8000;

const SETTINGS_KEY = 'growhub:update:v1';

export interface ReleaseInfo {
  version: string; // ohne führendes „v“
  url: string; // Seite zum Herunterladen
  notes: string; // Patchnotes (kann leer sein)
  publishedAt?: string;
  assets?: ReleaseAsset[]; // angehängte Dateien (für das Selbst-Update)
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current'; latest: string; checkedAt: number }
  | { state: 'available'; release: ReleaseInfo; checkedAt: number }
  | { state: 'error'; message: string };


// ---- Einstellungen (lokal gespeichert) ----

interface Settings {
  auto: boolean; // beim Start prüfen
  skipped?: string; // „Diese Version überspringen“
}

function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (v && typeof v === 'object') return { auto: v.auto !== false, skipped: typeof v.skipped === 'string' ? v.skipped : undefined };
  } catch {
    /* ignore */
  }
  return { auto: true };
}

let settings: Settings = loadSettings();
function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  emit();
}

export const isAutoCheckEnabled = () => settings.auto;
export function setAutoCheck(on: boolean): void {
  settings = { ...settings, auto: on };
  saveSettings();
}
export const getSkippedVersion = () => settings.skipped;
export function skipVersion(v: string): void {
  settings = { ...settings, skipped: cleanVersion(v) };
  saveSettings();
}

// ---- Abfrage bei GitHub ----

type FetchFn = typeof fetch;
let fetchImpl: FetchFn | null = null;
/** Nur für Tests: eigene fetch-Funktion einsetzen. */
export function _setFetch(fn: FetchFn | null): void {
  fetchImpl = fn;
}

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const f = fetchImpl ?? fetch;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), TIMEOUT_MS);
  try {
    const res = await f(`${API}${path}`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: ctrl?.signal,
    });
    const body = res.ok ? await res.json() : null;
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Neuestes veröffentlichtes Release holen.
 * 1. /releases/latest (nur fertige Releases, keine Entwürfe/Vorabversionen)
 * 2. Falls es noch gar keine Releases gibt: höchster Versions-Tag (v1.2.3)
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const rel = await getJson('/releases/latest');
  if (rel.status === 200 && rel.body && typeof rel.body === 'object') {
    const b = rel.body as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
      assets?: { name?: string; browser_download_url?: string; size?: number }[];
    };
    if (b.tag_name && parse(b.tag_name)) {
      return {
        version: cleanVersion(b.tag_name),
        url: b.html_url || RELEASES_PAGE,
        notes: (b.body ?? '').trim(),
        publishedAt: b.published_at,
        assets: (b.assets ?? [])
          .filter((a) => a.name && a.browser_download_url)
          .map((a) => ({ name: String(a.name), url: String(a.browser_download_url), size: Number(a.size) || 0 })),
      };
    }
  }
  if (rel.status !== 404 && rel.status !== 200) throw new Error(`GitHub ${rel.status}`);

  const tags = await getJson('/tags?per_page=100');
  if (tags.status !== 200 || !Array.isArray(tags.body)) {
    if (tags.status === 200 || tags.status === 404) return null;
    throw new Error(`GitHub ${tags.status}`);
  }
  const names = (tags.body as { name?: string }[])
    .map((t) => t.name ?? '')
    .filter((n) => /^v?\d+\.\d+/.test(n));
  if (!names.length) return null;
  names.sort((a, b) => compareVersions(b, a));
  return { version: cleanVersion(names[0]), url: RELEASES_PAGE, notes: '' };
}

// ---- Status-Store (für Dialog, Versionsanzeige und „Über“-Reiter) ----

let status: UpdateStatus = { state: 'idle' };
let dialogOpen = false;
const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}
function setStatus(s: UpdateStatus): void {
  status = s;
  emit();
}

export const getUpdateStatus = () => status;
export const isUpdateDialogOpen = () => dialogOpen;
export function closeUpdateDialog(): void {
  dialogOpen = false;
  emit();
}
export function openUpdateDialog(): void {
  if (status.state === 'available') {
    dialogOpen = true;
    emit();
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let snapshot: { status: UpdateStatus; dialogOpen: boolean; settings: Settings } = { status, dialogOpen, settings };
function getSnapshot() {
  if (snapshot.status !== status || snapshot.dialogOpen !== dialogOpen || snapshot.settings !== settings) {
    snapshot = { status, dialogOpen, settings };
  }
  return snapshot;
}

export function useUpdateState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

let running: Promise<UpdateStatus> | null = null;

/**
 * Nach Updates suchen.
 * @param manual true = vom Nutzer ausgelöst: Dialog auch bei übersprungener Version zeigen, Fehler anzeigen.
 */
export function checkForUpdates(opts: { manual?: boolean; currentVersion?: string } = {}): Promise<UpdateStatus> {
  if (running) return running;
  const current = opts.currentVersion ?? APP_VERSION;
  setStatus({ state: 'checking' });
  running = (async (): Promise<UpdateStatus> => {
    try {
      const latest = await fetchLatestRelease();
      if (latest && compareVersions(latest.version, current) > 0) {
        setStatus({ state: 'available', release: latest, checkedAt: Date.now() });
        if (opts.manual || settings.skipped !== latest.version) {
          dialogOpen = true;
          emit();
        }
      } else {
        setStatus({ state: 'current', latest: latest?.version ?? current, checkedAt: Date.now() });
      }
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus({
        state: 'error',
        message: offline ? 'offline' : e instanceof Error && e.name === 'AbortError' ? 'timeout' : String((e as Error)?.message ?? e),
      });
    } finally {
      running = null;
    }
    return status;
  })();
  return running;
}

/** Beim App-Start aufrufen: prüft (wenn nicht abgeschaltet) kurz nach dem Start im Hintergrund. */
export function checkOnStartup(delayMs = 2500): () => void {
  if (!settings.auto) return () => {};
  const timer = setTimeout(() => void checkForUpdates(), delayMs);
  return () => clearTimeout(timer);
}

/** Nur für Tests. */
export function _resetUpdateState(): void {
  status = { state: 'idle' };
  dialogOpen = false;
  running = null;
  settings = loadSettings();
  emit();
}
