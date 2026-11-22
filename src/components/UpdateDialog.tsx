import { useEffect, useState } from 'react';
import { ChevronDown, Download, Leaf, RefreshCw, X } from 'lucide-react';
import { LinkFeedback } from '@/components/UpdateCard';
import { APP_VERSION } from '@/lib/appInfo';
import { t } from '@/lib/i18n';
import { openExternal } from '@/lib/openExternal';
import { closeUpdateDialog, skipVersion, useUpdateState } from '@/lib/updateCheck';
import { getUpdatePlatform, installUpdate, restartAfterUpdate } from '@/lib/desktop';
import { planUpdate, type UpdatePlan } from '@/lib/updateDecision';
import { readableVersion } from '@/lib/versions';

type Phase = { k: 'idle' } | { k: 'loading'; done: number; total: number } | { k: 'restarting' } | { k: 'error'; msg: string };
const mb = (b: number) => (b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1);

/** Patchnotes aus dem Release (Markdown) als einfache Liste anzeigen. */
function notesToLines(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^>/.test(l) && !/^---+$/.test(l) && !/^\*\*?full changelog/i.test(l))
    .map((l) => l.replace(/^[-*+]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'))
    .slice(0, 14);
}

/** Erster Teil eines Patchnote-Punkts bis zum Doppelpunkt („Neues Design: …“ → „Neues Design“). */
const headline = (l: string) => (l.includes(':') && l.indexOf(':') < 48 ? l.slice(0, l.indexOf(':')) : l.length > 70 ? `${l.slice(0, 68)}…` : l);

/**
 * Hinweis „Neue Version verfügbar“ – erscheint beim Start oben mittig wie eine Nachricht
 * (kurz „tippt …“, dann die Sprechblase). Blockiert die App nicht.
 */
export default function UpdateDialog() {
  const { status, dialogOpen } = useUpdateState();
  const [failed, setFailed] = useState(false);
  const [typing, setTyping] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [plan, setPlan] = useState<UpdatePlan>({ kind: 'none' });
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const busy = phase.k === 'loading' || phase.k === 'restarting';

  const visible = dialogOpen && status.state === 'available';
  const release = status.state === 'available' ? status.release : null;

  // Kann diese Installation sich selbst aktualisieren (AppImage / Windows-Setup)?
  useEffect(() => {
    if (!release) return;
    let alive = true;
    void getUpdatePlatform().then((platform) => alive && setPlan(planUpdate(APP_VERSION, release, platform)));
    return () => {
      alive = false;
    };
  }, [release]);

  useEffect(() => {
    if (!visible) return;
    setTyping(true);
    setExpanded(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setTyping(false), reduce ? 0 : 900);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && closeUpdateDialog();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, busy]);

  if (!visible || status.state !== 'available') return null;
  const rel = status.release;
  const lines = notesToLines(rel.notes);
  const highlights = lines.slice(0, 3).map(headline);

  const runUpdate = async () => {
    if (plan.kind !== 'auto') return;
    setPhase({ k: 'loading', done: 0, total: plan.asset.size });
    try {
      await installUpdate({ url: plan.asset.url, fileName: plan.asset.name, sumsUrl: plan.sums.url }, (done, total) =>
        setPhase({ k: 'loading', done, total: total || plan.asset.size })
      );
      setPhase({ k: 'restarting' });
      setTimeout(() => {
        restartAfterUpdate().catch((e) => setPhase({ k: 'error', msg: String((e as Error)?.message ?? e) }));
      }, 900);
    } catch (e) {
      setPhase({ k: 'error', msg: String((e as Error)?.message ?? e) });
    }
  };

  return (
    <div
      className="fixed left-1/2 top-3 sm:top-5 z-[85] w-[min(94vw,25rem)] animate-drop-in"
      style={{ transform: 'translateX(-50%)' }}
      data-testid="update-dialog"
      role="dialog"
      aria-live="polite"
      aria-label={t('Update verfügbar', 'Update available')}
    >
      <div className="rounded-[1.6rem] border border-ink-700/80 bg-ink-900/95 shadow-2xl p-3.5 pb-3">
        {/* Kopf wie eine Mitteilung */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="relative h-7 w-7 shrink-0 rounded-lg bg-ink-850 border border-ink-700 flex items-center justify-center overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-[2px] gm-spectrum" aria-hidden="true" />
            <Leaf size={14} className="text-primary-300" />
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-white">growmanager</div>
            <div className="text-[11px] text-ink-400 tabular-nums" data-testid="update-versions">
              v{readableVersion(APP_VERSION)} → <span className="text-primary-300 font-semibold">v{readableVersion(rel.version)}</span>
            </div>
          </div>
          <span className="text-[11px] text-ink-500">{t('jetzt', 'now')}</span>
          <button type="button" onClick={closeUpdateDialog} disabled={busy} className="disabled:opacity-30 h-7 w-7 -mr-1 rounded-full flex items-center justify-center text-ink-500 hover:text-white hover:bg-ink-800" aria-label={t('Schließen', 'Close')}>
            <X size={15} />
          </button>
        </div>

        {/* Nachricht */}
        <div className="mt-3 px-1 space-y-1.5">
          {typing ? (
            <div className="inline-flex items-center gap-1 rounded-[1.2rem] rounded-bl-md bg-ink-800 px-4 py-3" data-testid="update-typing" aria-label={t('schreibt …', 'typing …')}>
              {[0, 1, 2].map((k) => (
                <span key={k} className="h-2 w-2 rounded-full bg-ink-300 animate-typing" style={{ animationDelay: `${k * 0.15}s` }} />
              ))}
            </div>
          ) : (
            <>
              <div className="max-w-[92%] rounded-[1.2rem] rounded-bl-md bg-gradient-to-br from-led-500 to-led-600 px-3.5 py-2.5 text-white shadow-glow-led animate-bubble-in">
                <p className="text-[15px] font-semibold leading-snug">{t(`Version ${readableVersion(rel.version)} ist da 🌱`, `Version ${readableVersion(rel.version)} is here 🌱`)}</p>
                {highlights.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[13px] leading-snug text-white/90">
                    {highlights.map((h, i) => (
                      <li key={i}>• {h}</li>
                    ))}
                  </ul>
                )}
              </div>
              {lines.length > 0 && (
                <div className="animate-bubble-in" style={{ animationDelay: '120ms' }}>
                  {expanded ? (
                    <ul className="max-w-[92%] max-h-56 overflow-y-auto scrollbar-thin rounded-[1.2rem] rounded-bl-md bg-ink-800 px-3.5 py-2.5 space-y-1.5" data-testid="update-notes">
                      {lines.map((l, i) => (
                        <li key={i} className="text-[13px] text-ink-200 leading-snug">
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <button
                      type="button"
                      data-testid="update-show-notes"
                      onClick={() => setExpanded(true)}
                      className="inline-flex items-center gap-1 rounded-[1.2rem] rounded-bl-md bg-ink-800 hover:bg-ink-700 px-3.5 py-2 text-[13px] text-ink-200"
                    >
                      {t('Alle Neuerungen ansehen', 'See everything new')}
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>
              )}
              {phase.k === 'loading' && (
                <div className="max-w-[92%] rounded-[1.2rem] rounded-bl-md bg-ink-800 px-3.5 py-2.5 animate-bubble-in" data-testid="update-progress">
                  <div className="flex justify-between text-[13px] text-ink-200 tabular-nums">
                    <span>{t('Lädt das Update …', 'Downloading the update …')}</span>
                    <span>{phase.total ? `${Math.min(100, Math.round((phase.done / phase.total) * 100))} %` : `${mb(phase.done)} MB`}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-ink-700 overflow-hidden">
                    <div className="h-full gm-spectrum transition-[width] duration-200" style={{ width: `${phase.total ? Math.min(100, (phase.done / phase.total) * 100) : 15}%` }} />
                  </div>
                  {phase.total > 0 && (
                    <div className="mt-1 text-[11px] text-ink-500 tabular-nums">
                      {mb(phase.done)} / {mb(phase.total)} MB
                    </div>
                  )}
                </div>
              )}
              {phase.k === 'restarting' && (
                <div className="max-w-[92%] rounded-[1.2rem] rounded-bl-md bg-ink-800 px-3.5 py-2.5 text-[13px] text-ink-100 animate-bubble-in" data-testid="update-restarting">
                  {t('Geprüft und installiert ✓ – growmanager startet neu …', 'Verified and installed ✓ – growmanager is restarting …')}
                </div>
              )}
              {phase.k === 'error' && (
                <div className="max-w-[92%] rounded-[1.2rem] rounded-bl-md bg-error-500/15 border border-error-500/30 px-3.5 py-2.5 text-[13px] text-error-200 animate-bubble-in" data-testid="update-error">
                  {t('Update hat nicht geklappt: ', 'Update failed: ')}
                  {phase.msg}
                </div>
              )}
            </>
          )}
        </div>

        {/* Antworten */}
        <div className={`mt-3.5 flex flex-wrap items-center gap-2 px-1 ${busy ? 'hidden' : ''}`}>
          {plan.kind === 'auto' && (
            <button
              type="button"
              data-testid="update-install"
              onClick={() => void runUpdate()}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold text-ink-950 bg-primary-400 hover:bg-primary-300"
            >
              <RefreshCw size={15} />
              {phase.k === 'error' ? t('Nochmal versuchen', 'Try again') : t('Jetzt aktualisieren', 'Update now')}
            </button>
          )}
          <button
            type="button"
            data-testid="update-download"
            onClick={async () => {
              if (await openExternal(rel.url)) {
                setFailed(false);
                closeUpdateDialog();
              } else setFailed(true);
            }}
            className={
              plan.kind === 'auto'
                ? 'flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium text-ink-200 bg-ink-850 hover:bg-ink-800 border border-ink-700'
                : 'flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold text-ink-950 bg-primary-400 hover:bg-primary-300'
            }
            title={plan.kind === 'auto' ? t('Release-Seite öffnen', 'Open release page') : undefined}
          >
            <Download size={15} />
            {plan.kind === 'auto' ? t('Seite', 'Page') : t('Herunterladen', 'Download')}
          </button>
          <button type="button" data-testid="update-later" onClick={closeUpdateDialog} className="h-9 px-4 rounded-full text-sm font-medium text-ink-200 bg-ink-850 hover:bg-ink-800 border border-ink-700">
            {t('Später', 'Later')}
          </button>
          <button
            type="button"
            data-testid="update-skip"
            onClick={() => {
              skipVersion(rel.version);
              closeUpdateDialog();
            }}
            className="h-9 px-2 text-sm text-ink-400 hover:text-white ml-auto"
          >
            {t('Überspringen', 'Skip')}
          </button>
        </div>
        {failed && (
          <div className="mt-2 px-1">
            <LinkFeedback ok={false} url={rel.url} />
          </div>
        )}
        <p className="mt-2.5 px-1 text-[11px] text-ink-500 leading-relaxed">
          {plan.kind === 'auto'
            ? t('Lädt die neue Version, prüft sie (SHA-256) und startet neu – deine Daten bleiben erhalten.', 'Downloads the new version, verifies it (SHA-256) and restarts – your data is kept.')
            : t('Neue Datei laden und die alte ersetzen – deine Daten bleiben erhalten.', 'Download the new file and replace the old one – your data is kept.')}
        </p>
      </div>
    </div>
  );
}
