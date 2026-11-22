import { useEffect, useState } from 'react';
import { Copy, Droplets, Info, SlidersHorizontal, Sprout, Sun, Timer, Waves } from 'lucide-react';
import type { Grow } from '@/types';
import DarkSelect from './DarkSelect';
import { t, isEn, fmtNum } from '@/lib/i18n';
import { currentPhase } from '@/lib/growLogic';
import { plantsOf } from '@/lib/growStats';
import {
  computePlan,
  DEFAULT_PLAN,
  formatDuration,
  formatTime,
  isSlab,
  MEDIUM_PRESETS,
  parseTime,
  steeringLabel,
  type IrrigationPlan,
  type PlanResult,
  type TimerBlock,
} from '@/lib/irrigation';

const inputCls =
  'w-full bg-ink-850 border border-ink-700/70 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:outline-none';
const labelCls = 'text-sm font-medium text-ink-200 mb-1.5 block';

/** Zahlenfeld, das Kommas erlaubt und erst gültige Werte weitergibt. */
function Num({
  value,
  onChange,
  placeholder,
  testid,
  suffix,
  min = 0,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  testid?: string;
  suffix?: string;
  min?: number;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', isEn() ? '.' : ','));
  useEffect(() => {
    const cur = Number(text.replace(',', '.'));
    if (value !== (text.trim() === '' ? undefined : cur)) setText(value === undefined ? '' : String(value).replace('.', isEn() ? '.' : ','));
    // nur auf Änderungen von außen reagieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        data-testid={testid}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.trim();
          if (raw === '') return onChange(undefined);
          const n = Number(raw.replace(',', '.'));
          if (Number.isFinite(n) && n >= min) onChange(n);
        }}
        className={`${inputCls} ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500 pointer-events-none">{suffix}</span>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, testid }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; testid?: string }) {
  return (
    <div className="inline-flex rounded-xl border border-ink-700/70 bg-ink-850 p-1 w-full" role="radiogroup" data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-testid={testid ? `${testid}-${o.value}` : undefined}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${value === o.value ? 'bg-primary-400 text-ink-950' : 'text-ink-300 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MISSING_TEXT: Record<PlanResult['missing'][number], () => string> = {
  medium: () => t('Mediumgröße', 'medium size'),
  flow: () => t('Durchfluss (mL in Sekunden)', 'flow (mL in seconds)'),
  fc: () => t('Feldkapazität (Sensorwert)', 'field capacity (sensor value)'),
  lights: () => t('Uhrzeit „Licht an“', '“Lights on” time'),
};

function fmtMl(ml: number) {
  return ml >= 1000 ? `${fmtNum(ml / 1000, 2)} L` : `${fmtNum(ml, 0)} mL`;
}

/** Text zum Kopieren (z. B. aufs Handy, um ihn in der Mars-Hydro-App abzutippen). */
function planText(grow: Grow, r: PlanResult): string {
  const lines = [
    `${t('Bewässerungsplan', 'Irrigation plan')} – ${grow.name}`,
    `${t(steeringLabel(r.steering).de, steeringLabel(r.steering).en)} · ${t('Licht', 'Lights')} ${formatTime(r.lightsOn)}–${formatTime(r.lightsOff)}`,
    `${t('Shot', 'Shot')}: ${fmtMl(r.shotMl)} ${t('pro Pflanze', 'per plant')} (${fmtNum(r.shotPct, 1)} %), ${t('Laufzeit', 'run time')} ${formatDuration(r.runSeconds)}`,
  ];
  const block = (b: TimerBlock, name: string) =>
    `${name}: ${formatTime(b.start)}–${formatTime(b.end)}, ${b.shots}× ${t('alle', 'every')} ${b.intervalMin} min, ${t('Laufzeit', 'run')} ${formatDuration(b.runSeconds)}, ${t('Pause', 'pause')} ${formatDuration(b.pauseSeconds)}`;
  if (r.p1) lines.push(block(r.p1, 'P1'));
  if (r.p2) lines.push(block(r.p2, 'P2'));
  lines.push(`${t('Ziel morgens', 'Target in the morning')}: ~${fmtNum(r.morningVwc, 0)} % (${t('Dryback', 'dryback')} ${r.drybackPoints} ${t('Punkte', 'points')})`);
  lines.push(`${t('Wasser pro Tag', 'Water per day')}: ${fmtMl(r.dailyMlPerPlant)} ${t('pro Pflanze', 'per plant')}, ${fmtMl(r.dailyMlTotal)} ${t('gesamt', 'total')}`);
  return lines.join('\n');
}

/** Tagesverlauf: Lichtphase mit allen Shots als Punkte. */
function DayBar({ r }: { r: PlanResult }) {
  const dayStart = r.lightsOn - 30;
  const span = r.lightHours * 60 + 60;
  const pos = (m: number) => `${Math.min(100, Math.max(0, ((m - dayStart) / span) * 100))}%`;
  const shots: { m: number; k: 'p1' | 'p2' }[] = [];
  for (const b of [r.p1, r.p2]) if (b) for (let i = 0; i < b.shots; i++) shots.push({ m: b.start + i * b.intervalMin, k: b.key });
  const lastAllowed = r.lightsOff - r.lastShotBeforeOffH * 60;
  return (
    <div data-testid="irrigation-daybar">
      <div className="relative h-10 rounded-xl bg-ink-850 border border-ink-800 overflow-hidden">
        <div className="absolute inset-y-0 bg-warning-400/10 border-x border-warning-400/30" style={{ left: pos(r.lightsOn), right: `calc(100% - ${pos(r.lightsOff)})` }} />
        <div className="absolute inset-y-0 bg-ink-950/50" style={{ left: pos(lastAllowed), right: `calc(100% - ${pos(r.lightsOff)})` }} title={t('Dryback vor Licht aus', 'Dryback before lights off')} />
        {shots.map((s, i) => (
          <span
            key={i}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${s.k === 'p1' ? 'h-3.5 w-3.5 bg-accent-400' : 'h-2.5 w-2.5 bg-led-400'}`}
            style={{ left: pos(s.m) }}
          />
        ))}
      </div>
      <div className="relative h-5 mt-1 text-[11px] text-ink-500 tabular-nums">
        <span className="absolute flex items-center gap-1" style={{ left: pos(r.lightsOn) }}>
          <Sun size={11} className="text-warning-300" />
          {formatTime(r.lightsOn)}
        </span>
        <span className="absolute -translate-x-full flex items-center gap-1" style={{ left: pos(r.lightsOff) }}>
          {formatTime(r.lightsOff)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-400" /> P1 {t('Auffüllen', 'ramp-up')}
        </span>
        {r.p2 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-led-400" /> P2 {t('Halten', 'maintenance')}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-ink-950/80 border border-ink-700" /> {t('Dryback bis Licht aus', 'dryback until lights off')}
        </span>
      </div>
    </div>
  );
}

function TimerCard({ b, title, hint }: { b: TimerBlock; title: string; hint: string }) {
  const row = (label: string, value: string, testid?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-ink-800/80 last:border-0">
      <span className="text-xs text-ink-400">{label}</span>
      <span className="font-display text-base font-bold text-white tabular-nums text-right whitespace-nowrap" data-testid={testid}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-850/60 p-4" data-testid={`timer-${b.key}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-semibold text-sm text-white">{title}</div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${b.key === 'p1' ? 'text-accent-300 bg-accent-500/10' : 'text-led-300 bg-led-500/10'}`}>{b.key.toUpperCase()}</span>
      </div>
      <p className="text-[11px] text-ink-500 mb-2">{hint}</p>
      {row(t('Startzeit', 'Start time'), formatTime(b.start), `timer-${b.key}-start`)}
      {row(t('Endzeit', 'End time'), formatTime(b.end), `timer-${b.key}-end`)}
      {row(t('Laufzeit (Min:Sek)', 'Run time (min:sec)'), formatDuration(b.runSeconds), `timer-${b.key}-run`)}
      {row(t('Pause (Min:Sek)', 'Pause (min:sec)'), formatDuration(b.pauseSeconds), `timer-${b.key}-pause`)}
      {row(t('Wiederholungen', 'Repeats'), `${b.shots}×`, `timer-${b.key}-shots`)}
      {row(t('Abstand', 'Interval'), `${b.intervalMin} min`, `timer-${b.key}-interval`)}
    </div>
  );
}

export default function IrrigationPlanner({ grow, onChange }: { grow: Grow; onChange: (plan: IrrigationPlan | undefined) => void }) {
  const phase = currentPhase(grow);
  const growPlants = plantsOf(grow);
  const plan = grow.irrigation;
  const [copied, setCopied] = useState(false);
  const [fine, setFine] = useState(!!(plan?.shotPctOverride || plan?.drybackOverride));

  if (!plan) {
    return (
      <div data-testid="irrigation-empty">
        <Header />
        <p className="text-sm text-ink-400 mt-2 max-w-2xl">
          {t(
            'Berechnet aus Medium, Sensorwert bei voller Sättigung und Durchfluss deiner Tropfer, wie lange, wie oft und wann die Pumpe laufen soll – vegetativ oder generativ, für alle Pflanzen. Die Werte trägst du dann im Timer deiner Steuerung (z. B. Mars-Hydro-App) ein.',
            'Works out from your medium, the sensor value at full saturation and the flow of your drippers how long, how often and when the pump should run – vegetative or generative, for all plants. You then enter the values in your controller’s timer (e.g. the Mars Hydro app).'
          )}
        </p>
        <button
          type="button"
          data-testid="irrigation-create"
          onClick={() => onChange({ ...DEFAULT_PLAN })}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-ink-950 bg-primary-400 hover:bg-primary-300"
        >
          <Droplets size={16} />
          {t('Bewässerungsplan anlegen', 'Create irrigation plan')}
        </button>
      </div>
    );
  }

  const set = (patch: Partial<IrrigationPlan>) => onChange({ ...plan, ...patch });
  const r = computePlan(plan, phase.key, growPlants);
  const lang = isEn() ? 'en' : 'de';
  const steerAuto = plan.steering === undefined;
  const lightAuto = plan.lightHours === undefined;
  const label = steeringLabel(r.steering);

  const mediumOptions = [
    ...MEDIUM_PRESETS.map((m) => ({ value: m.id, label: m[lang] })),
    { value: 'custom-dims', label: t('Eigene Maße (L × B × H in cm)', 'Custom size (L × W × H in cm)') },
    { value: 'custom-liters', label: t('Eigenes Volumen in Litern', 'Custom volume in litres') },
  ];

  return (
    <div data-testid="irrigation-planner">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Header />
        <div className="flex items-center gap-2">
          {r.ok && (
            <button
              type="button"
              data-testid="irrigation-copy"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(planText(grow, r));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-ink-200 bg-ink-900 hover:bg-ink-850 border border-ink-800"
            >
              <Copy size={14} />
              {copied ? t('Kopiert ✓', 'Copied ✓') : t('Plan kopieren', 'Copy plan')}
            </button>
          )}
          <button
            type="button"
            data-testid="irrigation-remove"
            onClick={() => onChange(undefined)}
            className="px-3 py-2 rounded-lg text-sm text-ink-400 hover:text-error-300 hover:bg-error-500/10"
          >
            {t('Plan entfernen', 'Remove plan')}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 mt-5">
        {/* ---------- Eingaben ---------- */}
        <div className="space-y-4" data-testid="irrigation-inputs">
          <div>
            <span className={labelCls}>{t('Medium', 'Medium')}</span>
            <DarkSelect testid="irr-medium" value={plan.medium} onChange={(v) => set({ medium: v })} options={mediumOptions} />
            {plan.medium === 'custom-dims' && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['L', t('B', 'W'), 'H'] as const).map((lbl, i) => (
                  <Num
                    key={i}
                    testid={`irr-dim-${i}`}
                    value={plan.customDims?.[i]}
                    suffix={`${lbl} cm`}
                    onChange={(v) => {
                      const d: [number, number, number] = [...(plan.customDims ?? [0, 0, 0])] as [number, number, number];
                      d[i] = v ?? 0;
                      set({ customDims: d });
                    }}
                  />
                ))}
              </div>
            )}
            {plan.medium === 'custom-liters' && (
              <div className="mt-2">
                <Num testid="irr-liters" value={plan.customLiters} suffix="L" onChange={(v) => set({ customLiters: v })} />
              </div>
            )}
            {isSlab(plan) && (
              <div className="mt-2">
                <span className="text-xs text-ink-400 mb-1 block">{t('Pflanzen pro Matte', 'Plants per slab')}</span>
                <Num testid="irr-per-slab" value={plan.plantsPerSlab ?? 3} min={1} onChange={(v) => set({ plantsPerSlab: v })} />
              </div>
            )}
            {r.mediumLiters > 0 && (
              <p className="text-[11px] text-ink-500 mt-1.5" data-testid="irr-medium-liters">
                = {fmtNum(r.mediumLiters, 2)} L {t('pro Pflanze', 'per plant')}
              </p>
            )}
          </div>

          <div>
            <span className={labelCls}>{t('Feldkapazität (Sensor)', 'Field capacity (sensor)')}</span>
            <Num testid="irr-fc" value={plan.fieldCapacity} suffix="% VWC" onChange={(v) => set({ fieldCapacity: v ?? 0 })} />
            <p className="text-[11px] text-ink-500 mt-1.5">{t('Wert auf dem Sensor, wenn das Medium voll gesättigt und abgelaufen ist.', 'Sensor value when the medium is fully saturated and has drained.')}</p>
          </div>

          <div>
            <span className={labelCls}>{t('Durchfluss gemessen', 'Measured flow')}</span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Num testid="irr-flow-ml" value={plan.flowMl || undefined} placeholder="z. B. 100" suffix="mL" onChange={(v) => set({ flowMl: v ?? 0 })} />
              <span className="text-xs text-ink-500">{t('in', 'in')}</span>
              <Num testid="irr-flow-sec" value={plan.flowSeconds} suffix={t('Sek.', 'sec')} min={1} onChange={(v) => set({ flowSeconds: v ?? 30 })} />
            </div>
            <div className="mt-2">
              <Segmented
                testid="irr-basis"
                value={plan.flowBasis}
                onChange={(v) => set({ flowBasis: v })}
                options={[
                  { value: 'dripper', label: t('an einem Tropfer', 'at one dripper') },
                  { value: 'system', label: t('ganze Anlage', 'whole system') },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {plan.flowBasis === 'dripper' && (
                <div>
                  <span className="text-xs text-ink-400 mb-1 block">{t('Tropfer pro Pflanze', 'Drippers per plant')}</span>
                  <Num testid="irr-drippers" value={plan.drippersPerPlant} min={1} onChange={(v) => set({ drippersPerPlant: v ?? 1 })} />
                </div>
              )}
              <div>
                <span className="text-xs text-ink-400 mb-1 block">{t('Pflanzen an der Pumpe', 'Plants on the pump')}</span>
                <Num testid="irr-plants" value={plan.plants} placeholder={`${t('wie Grow', 'as grow')}: ${growPlants}`} min={1} onChange={(v) => set({ plants: v })} />
              </div>
            </div>
            {r.flowPerPlantMlS > 0 && (
              <p className="text-[11px] text-ink-500 mt-1.5" data-testid="irr-flow-per-plant">
                = {fmtNum(r.flowPerPlantMlS, 2)} mL/s {t('pro Pflanze', 'per plant')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={labelCls}>{t('Licht an', 'Lights on')}</span>
              <input
                type="text"
                inputMode="numeric"
                data-testid="irr-lights-on"
                defaultValue={plan.lightsOn}
                placeholder="06:00"
                onChange={(e) => {
                  const v = e.target.value.trim().replace('.', ':');
                  const norm = /^\d{1,2}$/.test(v) ? `${v}:00` : v;
                  if (parseTime(norm) !== null) set({ lightsOn: formatTime(parseTime(norm) ?? 0) });
                }}
                className={inputCls}
              />
            </div>
            <div>
              <span className={labelCls}>{t('Stunden Licht', 'Hours of light')}</span>
              <Num testid="irr-light-hours" value={plan.lightHours} placeholder={`${t('auto', 'auto')}: ${r.lightHours}`} min={1} onChange={(v) => set({ lightHours: v })} />
              {lightAuto && <p className="text-[11px] text-ink-500 mt-1">{t('automatisch nach Phase', 'automatic by phase')}</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-ink-200">{t('Steuerung', 'Steering')}</span>
              <span className="text-sm font-semibold text-primary-300" data-testid="irr-steer-label">
                {label[lang]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={r.steering}
              data-testid="irr-steering"
              onChange={(e) => set({ steering: Number(e.target.value) })}
              className="w-full accent-primary-400"
              aria-label={t('Steuerung vegetativ bis generativ', 'Steering vegetative to generative')}
            />
            <div className="flex justify-between text-[11px] text-ink-500">
              <span className="flex items-center gap-1">
                <Sprout size={11} /> {t('Vegetativ', 'Vegetative')}
              </span>
              <span>{t('Generativ', 'Generative')}</span>
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs text-ink-300 cursor-pointer">
              <input
                type="checkbox"
                checked={steerAuto}
                data-testid="irr-steer-auto"
                onChange={(e) => set({ steering: e.target.checked ? undefined : r.steering })}
                className="accent-primary-400"
              />
              {t(`Automatisch nach Phase (jetzt: ${phase.label})`, `Automatic by phase (now: ${phase.label})`)}
            </label>
          </div>

          <div>
            <button type="button" onClick={() => setFine((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-white" data-testid="irr-fine-toggle">
              <SlidersHorizontal size={13} />
              {fine ? t('Feinjustieren ausblenden', 'Hide fine-tuning') : t('Feinjustieren', 'Fine-tune')}
            </button>
            {fine && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-xs text-ink-400 mb-1 block">{t('Shot-Größe', 'Shot size')}</span>
                  <Num testid="irr-shot-pct" value={plan.shotPctOverride} placeholder={`${t('Richtwert', 'guide')}: ${fmtNum(r.shotPct, 1)}`} suffix="%" onChange={(v) => set({ shotPctOverride: v })} />
                </div>
                <div>
                  <span className="text-xs text-ink-400 mb-1 block">{t('Dryback über Nacht', 'Overnight dryback')}</span>
                  <Num testid="irr-dryback" value={plan.drybackOverride} placeholder={`${t('Richtwert', 'guide')}: ${r.drybackPoints}`} suffix={t('Pkt.', 'pts')} onChange={(v) => set({ drybackOverride: v })} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Ergebnis ---------- */}
        <div className="space-y-4" data-testid="irrigation-result">
          {!r.ok ? (
            <div className="rounded-2xl border border-dashed border-ink-700 bg-ink-850/40 p-5 text-sm text-ink-300" data-testid="irr-missing">
              <div className="flex items-center gap-2 font-semibold text-white mb-1">
                <Info size={15} className="text-led-300" />
                {t('Noch nicht vollständig', 'Not complete yet')}
              </div>
              {t('Es fehlt: ', 'Missing: ')}
              {r.missing.map((m) => MISSING_TEXT[m]()).join(', ')}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 rounded-2xl border border-primary-400/30 bg-primary-500/10 px-4 py-3.5">
                  <div className="text-xs font-medium text-primary-300 flex items-center gap-1.5">
                    <Timer size={14} /> {t('Pumpe pro Shot', 'Pump per shot')}
                  </div>
                  <div className="flex items-end gap-3 mt-1.5 flex-wrap">
                    <span className="font-display text-5xl font-extrabold text-white tabular-nums leading-none" data-testid="irr-run">
                      {formatDuration(r.runSeconds)}
                    </span>
                    <span className="text-sm text-ink-300 pb-1">{t('Min:Sek', 'min:sec')}</span>
                  </div>
                  <p className="text-xs text-ink-400 mt-2">
                    {fmtMl(r.shotMl)} {t('pro Pflanze', 'per plant')} ({fmtNum(r.shotPct, 1)} % {t('vom Medium', 'of the medium')}) · {fmtMl(r.shotMlTotal)}{' '}
                    {t(`aus dem Tank für ${r.plants} Pflanzen`, `from the tank for ${r.plants} plants`)}
                  </p>
                </div>
                <div className="rounded-2xl border border-ink-800 bg-ink-850/60 px-4 py-3">
                  <div className="text-xs text-ink-400 flex items-center gap-1.5">
                    <Waves size={13} /> {t('Ziel morgens vor P1', 'Target before P1')}
                  </div>
                  <div className="font-display text-2xl font-bold text-white tabular-nums mt-1" data-testid="irr-morning">
                    ~{fmtNum(r.morningVwc, 0)} %
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">
                    {t('Dryback', 'Dryback')} {r.drybackPoints} {t('Pkt.', 'pts')} ({fmtNum(r.drybackRelPct, 0)} %)
                  </div>
                </div>
                <div className="rounded-2xl border border-ink-800 bg-ink-850/60 px-4 py-3">
                  <div className="text-xs text-ink-400 flex items-center gap-1.5">
                    <Droplets size={13} /> {t('Wasser pro Tag', 'Water per day')}
                  </div>
                  <div className="font-display text-2xl font-bold text-white tabular-nums mt-1" data-testid="irr-daily">
                    {fmtMl(r.dailyMlTotal)}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">
                    {fmtMl(r.dailyMlPerPlant)} {t('pro Pflanze', 'per plant')} · {r.shotsPerDay} Shots
                  </div>
                </div>
              </div>

              <DayBar r={r} />

              <div>
                <div className="text-sm font-semibold text-white mb-2">{t('So stellst du den Timer ein', 'How to set the timer')}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {r.p1 && (
                    <TimerCard
                      b={r.p1}
                      title={t('Timer 1 – Auffüllen', 'Timer 1 – ramp-up')}
                      hint={t('Bringt das Medium morgens zurück auf Feldkapazität; der letzte Shot darf leicht ablaufen.', 'Brings the medium back to field capacity in the morning; the last shot may run off slightly.')}
                    />
                  )}
                  {r.p2 ? (
                    <TimerCard
                      b={r.p2}
                      title={t('Timer 2 – Halten', 'Timer 2 – maintenance')}
                      hint={t('Kleinere Shots, halten den Wassergehalt tagsüber hoch (vegetativ).', 'Smaller shots keep the water content high during the day (vegetative).')}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-ink-700 p-4 text-xs text-ink-400" data-testid="timer-p2-none">
                      <div className="font-semibold text-ink-200 mb-1">{t('Kein Timer 2', 'No timer 2')}</div>
                      {t(
                        `Generativ: nach P1 nicht mehr gießen – das Medium trocknet bis Licht aus (${formatTime(r.lightsOff)}) und über Nacht ab.`,
                        `Generative: no more watering after P1 – the medium dries back until lights off (${formatTime(r.lightsOff)}) and overnight.`
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-ink-500 mt-2">
                  {t(
                    `Letzter Shot ${fmtNum(r.lastShotBeforeOffH, 1)} h vor Licht aus. Die Werte passen zu Zyklus-Timern mit Laufzeit und Pause in Minuten:Sekunden (z. B. Mars-Hydro-App).`,
                    `Last shot ${fmtNum(r.lastShotBeforeOffH, 1)} h before lights off. The values fit cycle timers with run time and pause in minutes:seconds (e.g. the Mars Hydro app).`
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-ink-850/50 border border-ink-800 px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-400 flex gap-2">
                <Info size={13} className="text-led-300 shrink-0 mt-0.5" />
                <span>
                  {t(
                    'Richtwerte für Crop Steering „light“. Prüfe mit deinem Sensor: Erreicht P1 die Feldkapazität nicht, mehr Shots oder größere Shots; fällt der Wert über Nacht stärker als geplant, früher aufhören oder vegetativer steuern. Anpassen kannst du alles unter „Feinjustieren“.',
                    'Guide values for “light” crop steering. Check with your sensor: if P1 does not reach field capacity, add shots or make them larger; if the value drops more overnight than planned, stop earlier or steer more vegetatively. Everything can be adjusted under “Fine-tune”.'
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-white tracking-tight flex items-center gap-2">
        <Droplets size={18} className="text-accent-400" />
        {t('Bewässerungsplan', 'Irrigation plan')}
        <span className="font-sans text-[11px] font-semibold text-led-300 bg-led-500/10 border border-led-500/30 rounded-md px-1.5 py-0.5">Crop Steering light</span>
      </h3>
    </div>
  );
}
