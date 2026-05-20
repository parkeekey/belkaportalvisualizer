import { useCallback, useEffect, useState } from 'react';
import { getReferenceEY } from '../utils/tdsReference';

export interface PourPlanEntry {
  cumulativePercent: number;
  duration?: number;
}

export interface BrewPlanSnapshot {
  equipment: {
    name: string;
    brewer: string;
    filterName: string;
    filterType: string;
    flowSpeed: number;
    drawdownRate: number;
  };
  grinder: {
    name: string;
    power: string;
    burr: string;
    fines: string;
    micron: number;
    grindSize: number;
  };
  bean: {
    roastLevel: number;
    density: number;
    altitude: number;
    process: string;
    origin: string;
    defects: string[];
  };
  brewTime: {
    targetSec: number;
    actualSec: number | null;
    liked: boolean | null;
  };
  brewImpact: {
    temp: number;
    waterQuality: string;
    turbulence: number;
    activeFactor: number | null;
    symptom: string | null;
  };
  tdsPlan: {
    ratio: number;
    ey: string;
    tdsMin: string;
    tdsMax: string;
  };
  grinding: {
    grindAdjustPct: number;
    beanAdviceLabel: string;
    beanAdviceScore: number;
  };
  recipe: {
    dose: number;
    ratio: number;
    water: number;
  };
  waterMix?: WaterMixSnapshot | null;
}

export interface WaterMixSnapshot {
  ratio: string;
  measuredPpm: number;
  totalMl: number;
  mineralMl: number;
  plainWaterMl: number;
  mineralPct: number;
  estimatedFinalPpm?: number | null;
}

const TASTE_GROUPS = [
  {
    label: 'Body',
    tags: ['Weak', 'Hollow', 'Muddy', 'Thin', 'Heavy'],
  },
  {
    label: 'Mouthfeel',
    tags: ['Dry', 'Astringent', 'Silky', 'Juicy', 'Crisp', 'Creamy'],
  },
  {
    label: 'Flavor',
    tags: ['Sour', 'Bitter', 'Grassy', 'Earthy', 'Metallic', 'Salty', 'Bright', 'Sweet', 'Floral', 'Rich', 'Clean'],
  },
  {
    label: 'Balance',
    tags: ['Strong', 'Harsh', 'Balanced', 'Smooth', 'Delicate'],
  },
];
const ALL_TASTE_TAGS = TASTE_GROUPS.flatMap(g => g.tags);
const POSITIVE_TAGS = new Set(['Silky', 'Juicy', 'Crisp', 'Creamy', 'Bright', 'Sweet', 'Floral', 'Rich', 'Clean', 'Balanced', 'Smooth', 'Delicate']);
const isPositive = (t: string) => POSITIVE_TAGS.has(t);
const isNegative = (t: string) => !POSITIVE_TAGS.has(t);

interface AttemptEntry {
  id: string;
  date: string;
  grindSize: number;
  doseWeight: number;
  brewRatio: number;
  totalWater: number;
  tdsActual: number;
  tdsMin: number;
  tdsMax: number;
  ey: number;
  eyTarget: number;
  brewTimeActual: number | null;
  pourPlan: PourPlanEntry[];
  tasteTags: string[];
  notes: string;
  liked: boolean | null;
  plan: BrewPlanSnapshot | null;
  waterMix: WaterMixSnapshot | null;
}

const STORAGE_KEY = 'belkaAttemptLog';

function loadLog(): AttemptEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return (raw as AttemptEntry[]).map(e => ({ ...e, tasteTags: e.tasteTags ?? [], plan: (e as any).plan ?? null, eyTarget: (e as any).eyTarget ?? 0, brewTimeActual: (e as any).brewTimeActual ?? null, liked: (e as any).liked ?? null, pourPlan: (e as any).pourPlan ?? [], waterMix: (e as any).waterMix ?? null }));
  } catch { return []; }
}

function tdsVerdict(tds: number, min: number, max: number): 'UNDER' | 'IDEAL' | 'OVER' {
  if (tds < min) return 'UNDER';
  if (tds > max) return 'OVER';
  return 'IDEAL';
}

function delta(tds: number, min: number, max: number): number {
  const mid = (min + max) / 2;
  return parseFloat((tds - mid).toFixed(3));
}

function overallVerdict(tds: number, min: number, max: number, tasteTags: string[] = []): 'NEED IMPROVE' | 'IDEAL' {
  const hasNegative = (tasteTags ?? []).some(t => isNegative(t));
  if (hasNegative) return 'NEED IMPROVE';
  return tdsVerdict(tds, min, max) === 'IDEAL' ? 'IDEAL' : 'NEED IMPROVE';
}

interface AttemptLogProps {
  currentGrindSize: number;
  currentDose: number;
  currentRatio: number;
  currentTotalWater: number;
  tdsMin: number;
  tdsMax: number;
  currentTDS: number;
  currentEY?: number;
  brewTimeTarget?: number;
  brewTimeActual?: number | null;
  planSnapshot?: BrewPlanSnapshot;
  pourPlan?: PourPlanEntry[];
  pourPlanStandby?: PourPlanEntry[] | null;
  waterMixStandby?: WaterMixSnapshot | null;
  onClearPourPlanStandby?: () => void;
  onClearWaterMixStandby?: () => void;
}

export default function AttemptLog({ currentGrindSize, currentDose, currentRatio, currentTotalWater, tdsMin, tdsMax, currentTDS, currentEY, brewTimeTarget, brewTimeActual, planSnapshot, pourPlan: propPourPlan, pourPlanStandby, waterMixStandby, onClearPourPlanStandby, onClearWaterMixStandby }: AttemptLogProps) {
  const [entries, setEntries] = useState<AttemptEntry[]>(loadLog);
  const [logGrind, setLogGrind] = useState(currentGrindSize > 0 ? String(currentGrindSize) : '');
  const [logRatio, setLogRatio] = useState(currentRatio > 0 ? String(Math.round(currentRatio)) : '');
  const [logTDS, setLogTDS] = useState(String(currentTDS));
  const [logEY, setLogEY] = useState(currentEY && currentEY > 0 ? String(currentEY) : '');
  const [logBrewTarget, setLogBrewTarget] = useState(brewTimeTarget && brewTimeTarget > 0 ? String(brewTimeTarget) : '');
  const [logBrewActual, setLogBrewActual] = useState(brewTimeActual != null && brewTimeActual > 0 ? String(brewTimeActual) : '');
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logNotes, setLogNotes] = useState('');
  const [logLiked, setLogLiked] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTDS, setEditTDS] = useState('');
  const [editEY, setEditEY] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [graphFeedback, setGraphFeedback] = useState<string | null>(null);

  const applyToGraph = useCallback((entry: AttemptEntry) => {
    localStorage.setItem('belka.attemptToGraph', JSON.stringify({
      doseWeight: entry.doseWeight,
      brewRatio: entry.brewRatio,
      totalWater: entry.totalWater,
      tdsMin: entry.tdsMin,
      tdsMax: entry.tdsMax,
      ey: entry.ey,
      eyTarget: entry.eyTarget,
      grindSize: entry.grindSize,
      pourPlan: entry.pourPlan,
      waterMix: entry.waterMix,
    }));
    setGraphFeedback(entry.id);
    setTimeout(() => setGraphFeedback(null), 2000);
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }, [entries]);

  useEffect(() => {
    if (currentGrindSize > 0) setLogGrind(String(currentGrindSize));
  }, [currentGrindSize]);

  useEffect(() => {
    if (currentRatio > 0) setLogRatio(String(Math.round(currentRatio)));
  }, [currentRatio]);

  useEffect(() => {
    if (currentEY && currentEY > 0) setLogEY(String(currentEY));
  }, [currentEY]);

  useEffect(() => {
    if (brewTimeTarget && brewTimeTarget > 0) setLogBrewTarget(String(brewTimeTarget));
  }, [brewTimeTarget]);

  useEffect(() => {
    if (brewTimeActual != null && brewTimeActual > 0) setLogBrewActual(String(brewTimeActual));
  }, [brewTimeActual]);

  useEffect(() => {
    const tds = parseFloat(logTDS);
    const ratio = parseFloat(logRatio) || currentRatio;
    if (!isNaN(tds) && ratio > 0) {
      const refEY = getReferenceEY(ratio, tds);
      setLogEY(refEY > 0 ? refEY.toFixed(1) : (tds * ratio).toFixed(1));
    }
  }, [logTDS, logRatio, currentRatio]);

  const toggleLogTag = useCallback((tag: string) => {
    setLogTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);

  const toggleEditTag = useCallback((tag: string) => {
    setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);

  const addEntry = useCallback(() => {
    const tds = parseFloat(logTDS);
    if (isNaN(tds)) return;
    const ey = parseFloat(logEY) || 0;
    const entry: AttemptEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      grindSize: parseFloat(logGrind) || currentGrindSize || 0,
      doseWeight: currentDose,
      brewRatio: parseFloat(logRatio) || currentRatio,
      totalWater: currentTotalWater,
      tdsActual: tds,
      tdsMin,
      tdsMax,
      ey,
      eyTarget: parseFloat(logEY) || currentEY || 0,
      brewTimeActual: parseFloat(logBrewActual) || null,
      pourPlan: pourPlanStandby ?? propPourPlan ?? [],
      tasteTags: [...logTags],
      notes: logNotes,
      liked: logLiked,
      plan: planSnapshot ?? null,
      waterMix: waterMixStandby ?? planSnapshot?.waterMix ?? null,
    };
    if (pourPlanStandby && onClearPourPlanStandby) onClearPourPlanStandby();
    if (waterMixStandby && onClearWaterMixStandby) onClearWaterMixStandby();
    setEntries(prev => [entry, ...prev]);
    setLogEY('');
    setLogBrewActual('');
    setLogTags([]);
    setLogNotes('');
    setLogLiked(null);
  }, [logGrind, logRatio, logTDS, logEY, logBrewTarget, logBrewActual, logTags, logNotes, logLiked, currentGrindSize, currentDose, currentRatio, currentTotalWater, tdsMin, tdsMax, currentEY, brewTimeTarget, brewTimeActual, planSnapshot, waterMixStandby, onClearWaterMixStandby, pourPlanStandby, onClearPourPlanStandby, propPourPlan]);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const startEdit = useCallback((e: AttemptEntry) => {
    setEditingId(e.id);
    setEditTDS(String(e.tdsActual));
    setEditEY(String(e.ey));
    setEditTags([...e.tasteTags]);
  }, []);

  const saveEdit = useCallback((id: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newTDS = parseFloat(editTDS);
      const newEY = parseFloat(editEY);
      return {
        ...e,
        tdsActual: isNaN(newTDS) ? e.tdsActual : newTDS,
        ey: isNaN(newEY) ? e.ey : newEY,
        tasteTags: [...editTags],
      };
    }));
    setEditingId(null);
  }, [editTDS, editEY, editTags]);

  const total = entries.length;
  const idealCount = entries.filter(e => overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags) === 'IDEAL').length;
  const successPct = total > 0 ? Math.round((idealCount / total) * 100) : 0;

  const handleLogTDSBlur = useCallback(() => {
    const v = parseFloat(logTDS);
    if (!isNaN(v)) {
      setLogTDS(v.toFixed(2));
      const ratio = parseFloat(logRatio) || currentRatio;
      if (ratio > 0) {
        const refEY = getReferenceEY(ratio, v);
        setLogEY(refEY > 0 ? refEY.toFixed(1) : (v * ratio).toFixed(1));
      }
    }
  }, [logTDS, logRatio, currentRatio]);

  const renderTasteTag = useCallback((tag: string, small?: boolean) => {
    const color = isNegative(tag) ? '#f59e0b' : '#22d65e';
    return (
      <span key={tag}
        className={`inline-flex items-center rounded font-semibold uppercase tracking-wider ${small ? 'px-1 py-0.5 text-[7px]' : 'px-1.5 py-0.5 text-[9px]'}`}
        style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}30` }}
      >
        {tag}
      </span>
    );
  }, []);

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs px-1">
        <span className="text-slate-400 font-medium">Attempts <strong className="text-slate-700">{total}</strong></span>
        <span className="text-emerald-600 font-medium">Ideal <strong>{idealCount}</strong></span>
        <span className="text-amber-600 font-medium">Needs work <strong>{total - idealCount}</strong></span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-32">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${successPct}%` }} />
        </div>
        <span className={`font-bold tabular-nums ${successPct >= 60 ? 'text-emerald-600' : successPct >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{successPct}%</span>
      </div>

      {/* Log new attempt */}
      <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        {(pourPlanStandby || waterMixStandby) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
            {pourPlanStandby && (
              <span className="px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold uppercase tracking-wider">
                Pour plan standby: {pourPlanStandby.length} pours
              </span>
            )}
            {waterMixStandby && (
              <span className="px-1.5 py-0.5 rounded border border-cyan-200 bg-cyan-50 text-cyan-700 font-semibold uppercase tracking-wider">
                Water mix standby: {waterMixStandby.ratio} ({waterMixStandby.totalMl.toFixed(0)}ml)
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Grind #</label>
            <input type="number" step={0.1} value={logGrind}
              onChange={(e) => setLogGrind(e.target.value)}
              className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder={currentGrindSize > 0 ? `#${currentGrindSize}` : '#'}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Ratio</label>
            <input type="number" step={0.1} min={1} value={logRatio}
              onChange={(e) => setLogRatio(e.target.value)}
              className="w-14 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              placeholder={currentRatio > 0 ? `1:${Math.round(currentRatio)}` : '1:?'}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Actual TDS</label>
            <div className="flex items-center gap-0.5">
              <input type="number" step={0.01} value={logTDS}
                onChange={(e) => setLogTDS(e.target.value)}
                onBlur={handleLogTDSBlur}
                className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
              <button type="button" onClick={() => document.getElementById('tds-target')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-1 py-1 rounded text-[9px] font-bold text-sky-600 bg-sky-50 border border-sky-200 hover:bg-sky-100 leading-none"
                title="Go to TDS Target"
              >← TDS</button>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">EY%</label>
            <input type="number" step={0.1} value={logEY}
              onChange={(e) => setLogEY(e.target.value)}
              className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Brew finished ⏱</label>
            <div className="flex items-center gap-0.5">
              <input type="number" min={0} step={1} value={logBrewActual && parseInt(logBrewActual) > 0 ? Math.floor(parseInt(logBrewActual) / 60) : ''}
                onChange={(e) => {
                  const m = Math.max(0, parseInt(e.target.value) || 0);
                  const s = parseInt(logBrewActual) || 0;
                  setLogBrewActual(String(m * 60 + (s % 60)));
                }}
                className="w-10 px-1 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="mm"
              />
              <span className="text-slate-300 text-[10px]">:</span>
              <input type="number" min={0} max={59} step={1} value={logBrewActual && parseInt(logBrewActual) > 0 ? (parseInt(logBrewActual) % 60) : ''}
                onChange={(e) => {
                  const s = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                  const base = parseInt(logBrewActual) || 0;
                  setLogBrewActual(String(Math.floor(base / 60) * 60 + s));
                }}
                className="w-10 px-1 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="ss"
              />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Notes</label>
            <input type="text" value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="taste notes..."
              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
        </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setLogLiked(logLiked === true ? null : true)}
              className={`text-lg px-2 py-1 rounded-lg border transition-all ${logLiked === true ? 'bg-emerald-100 text-emerald-600 border-emerald-300 shadow-sm' : 'text-slate-300 border-slate-200 hover:border-emerald-200 hover:text-emerald-400'}`}
            >
              👍
            </button>
            <button onClick={() => setLogLiked(logLiked === false ? null : false)}
              className={`text-lg px-2 py-1 rounded-lg border transition-all ${logLiked === false ? 'bg-amber-100 text-amber-600 border-amber-300 shadow-sm' : 'text-slate-300 border-slate-200 hover:border-amber-200 hover:text-amber-400'}`}
            >
              👎
            </button>
            <button onClick={addEntry} disabled={!logTDS || isNaN(parseFloat(logTDS))}
            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Log Attempt
          </button>
        </div>
      </div>

        {/* Taste tag menu */}
        <div>
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1 block">Taste Profile</label>
          <div className="space-y-1">
            {TASTE_GROUPS.map(group => {
              const negTags = group.tags.filter(t => isNegative(t));
              const posTags = group.tags.filter(t => isPositive(t));
              if (negTags.length === 0 && posTags.length === 0) return null;
              return (
                <div key={group.label} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[8px] text-slate-300 font-semibold uppercase tracking-wider w-16 shrink-0">{group.label}</span>
                  {negTags.map(tag => (
                    <button key={tag} onClick={() => toggleLogTag(tag)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border transition-colors ${logTags.includes(tag) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600'}`}
                    >
                      {tag}
                    </button>
                  ))}
                  {posTags.map(tag => (
                    <button key={tag} onClick={() => toggleLogTag(tag)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border transition-colors ${logTags.includes(tag) ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-400 border-slate-200 hover:border-emerald-200 hover:text-emerald-600'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

      {/* Log table */}
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 italic px-1">No attempts logged yet. Brew, measure your TDS, mark the taste, and log it.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {entries.map((e) => {
            const tv = tdsVerdict(e.tdsActual, e.tdsMin, e.tdsMax);
            const ov = overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags);
            const d = delta(e.tdsActual, e.tdsMin, e.tdsMax);
            const tvColor = tv === 'UNDER' ? '#38bdf8' : tv === 'OVER' ? '#ef4444' : '#22d65e';
            const isIdeal = ov === 'IDEAL';
            const isEditing = editingId === e.id;
            return (
              <div key={e.id}
                className={`rounded-lg px-3 py-2 border transition-colors ${isIdeal ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}
              >
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {/* Grind # — large */}
                  <span className="text-slate-700 font-bold text-sm w-12 tabular-nums">#{e.grindSize > 0 ? e.grindSize : '—'}</span>

                  {/* Dose + ratio */}
                  <span className="text-slate-400 tabular-nums">{e.doseWeight.toFixed(1)}g</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400 tabular-nums">1:{e.brewRatio.toFixed(0)}</span>

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS actual */}
                  {isEditing ? (
                    <input type="number" step={0.01} value={editTDS}
                      onChange={(ee) => setEditTDS(ee.target.value)}
                      className="w-14 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                      autoFocus
                      onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); if (ee.key === 'Escape') setEditingId(null); }}
                    />
                  ) : (
                    <span className="font-bold tabular-nums" style={{ color: tvColor }}>{e.tdsActual.toFixed(2)}</span>
                  )}

                  {/* Delta */}
                  <span className="tabular-nums text-slate-400 text-[10px]">{d > 0 ? '+' : ''}{d.toFixed(2)}</span>

                  {/* EY */}
                  {isEditing ? (
                    <input type="number" step={0.1} value={editEY}
                      onChange={(ee) => setEditEY(ee.target.value)}
                      className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                      onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); }}
                    />
                  ) : (
                    <span className="tabular-nums text-slate-500">{e.ey > 0 ? `${e.ey.toFixed(1)}%` : '—'}</span>
                  )}

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS target range */}
                  <span className="text-[9px] text-slate-400 tabular-nums">({e.tdsMin.toFixed(2)}–{e.tdsMax.toFixed(2)})</span>

                  {/* TDS verdict badge */}
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                    style={{ color: tvColor, backgroundColor: `${tvColor}15`, border: `1px solid ${tvColor}28` }}
                  >
                    {tv}
                  </span>

                  {/* Overall verdict */}
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${isIdeal ? 'text-emerald-700 bg-emerald-100 border border-emerald-300' : 'text-amber-700 bg-amber-100 border border-amber-300'}`}>
                    {isIdeal ? 'OK' : 'NEED IMPROVE'}
                  </span>

                  {/* EY target */}
                  {e.eyTarget > 0 && (
                    <span className="text-[9px] text-slate-400 tabular-nums">EY {e.ey > 0 ? `${e.ey.toFixed(1)}` : '?'}/{e.eyTarget}%</span>
                  )}

                  {/* Brew time */}
                  {e.brewTimeActual != null && e.brewTimeActual > 0 && (
                    <span className="text-[9px] text-slate-400 tabular-nums">⏱ {Math.floor(e.brewTimeActual / 60)}:{String(e.brewTimeActual % 60).padStart(2, '0')}</span>
                  )}

                  {e.waterMix && (
                    <span className="text-[9px] text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1 py-0.5 tabular-nums">
                      H2O {e.waterMix.ratio} · {e.waterMix.totalMl.toFixed(0)}ml
                    </span>
                  )}

                  {/* Taste tags */}
                  {!isEditing && e.tasteTags.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {e.tasteTags.map(t => renderTasteTag(t, true))}
                    </div>
                  )}

                  {/* Edit taste tags */}
                  {isEditing && (
                    <div className="flex flex-wrap gap-0.5">
                      {ALL_TASTE_TAGS.map(tag => (
                        <button key={tag} onClick={() => toggleEditTag(tag)}
                          className={`px-1 py-0.5 rounded text-[7px] font-semibold uppercase tracking-wider border ${editTags.includes(tag) ? (isNegative(tag) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300') : 'bg-white text-slate-300 border-slate-200'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Date */}
                  <span className="ml-auto text-[8px] text-slate-400 whitespace-nowrap">{e.date}</span>

                  {/* Like/Dislike */}
                  <span className="text-base tabular-nums">
                    {e.liked === true ? <span className="text-emerald-500">👍</span> : e.liked === false ? <span className="text-amber-500">👎</span> : null}
                  </span>

                  {/* Plan toggle */}
                  {(e.plan || e.pourPlan.length > 0) && !isEditing && (
                    <button onClick={() => setExpandedPlanId(expandedPlanId === e.id ? null : e.id)}
                      className={`px-2 py-1 rounded text-xs font-bold border ${expandedPlanId === e.id ? 'bg-sky-100 text-sky-700 border-sky-300' : 'text-slate-500 border-slate-200 hover:bg-sky-50 hover:text-sky-600'}`}
                    >
                      {expandedPlanId === e.id ? '▲ Plan' : '▼ Plan'}
                    </button>
                  )}

                  {/* Apply to Graph */}
                  {!isEditing && (
                    <button onClick={() => applyToGraph(e)}
                      className="px-1.5 py-1 rounded text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      title="Send this attempt's targets to the Main App graph"
                    >
                      {graphFeedback === e.id ? '✓ Sent!' : '↗ Graph'}
                    </button>
                  )}

                  {/* Actions */}
                  {isEditing ? (
                    <button onClick={() => saveEdit(e.id)} className="text-emerald-600 hover:text-emerald-800 font-bold px-1 text-xs">✓</button>
                  ) : (
                    <button onClick={() => startEdit(e)} className="text-slate-300 hover:text-slate-500 px-1 text-xs">✎</button>
                  )}
                  <button onClick={() => deleteEntry(e.id)} className="text-red-200 hover:text-red-500 font-bold px-0.5 text-xs">×</button>
                </div>

                {/* Notes row */}
                {e.notes && !isEditing && (
                  <div className="text-[9px] text-slate-400 mt-1 ml-14">{e.notes}</div>
                )}

                {/* Expandable plan snapshot */}
                {(e.plan || e.pourPlan.length > 0) && expandedPlanId === e.id && !isEditing && (
                  <div className="mt-2 ml-14 p-2 bg-sky-50 border border-sky-200 rounded text-[9px] text-slate-600 space-y-1">
                    <div className="font-semibold text-sky-700 text-[10px] uppercase tracking-wider mb-1">Brew Plan</div>
                    {e.plan && (
                      <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Roast <strong>{e.plan.bean.roastLevel}%</strong></span>
                          <span>Density <strong>{e.plan.bean.density}%</strong></span>
                          <span>Altitude <strong>{e.plan.bean.altitude}m</strong></span>
                          <span>Process <strong>{e.plan.bean.process}</strong></span>
                          <span>Defects <strong>{e.plan.bean.defects.length > 0 ? e.plan.bean.defects.join(', ') : 'none'}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Drawdown <strong>{e.plan.equipment.drawdownRate} g/s</strong></span>
                          <span>Flow <strong>{e.plan.equipment.flowSpeed}%</strong></span>
                          <span>Brewer <strong>{e.plan.equipment.brewer}</strong></span>
                          <span>Filter <strong>{e.plan.equipment.filterName || e.plan.equipment.filterType || '—'}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Grinder <strong>{e.plan.grinder.name || '—'}</strong></span>
                          <span>Burr <strong>{e.plan.grinder.burr}</strong></span>
                          <span>Fines <strong>{e.plan.grinder.fines}</strong></span>
                          <span>Micron <strong>{e.plan.grinder.micron}µm</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Grind # <strong>{e.plan.grinder.grindSize || e.grindSize || '—'}</strong></span>
                          <span>Adjust <strong>{e.plan.grinding.grindAdjustPct}%</strong></span>
                          <span>Guidance <strong>{e.plan.grinding.beanAdviceLabel}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Temp <strong>{e.plan.brewImpact.temp}°C</strong></span>
                          <span>Water <strong>{e.plan.brewImpact.waterQuality}</strong></span>
                          <span>Turbulence <strong>{e.plan.brewImpact.turbulence}/3</strong></span>
                          <span>Symptom <strong>{e.plan.brewImpact.symptom || '—'}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Target TDS <strong>{e.plan.tdsPlan.tdsMin}–{e.plan.tdsPlan.tdsMax}%</strong></span>
                          <span>Target EY <strong>{e.plan.tdsPlan.ey}%</strong></span>
                          <span>TDS Ratio <strong>1:{e.plan.tdsPlan.ratio}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Brew Target <strong>{Math.floor(e.plan.brewTime.targetSec / 60)}:{String(e.plan.brewTime.targetSec % 60).padStart(2, '0')}</strong></span>
                          {e.plan.brewTime.actualSec != null && <span>Brew Actual <strong>{Math.floor(e.plan.brewTime.actualSec / 60)}:{String(e.plan.brewTime.actualSec % 60).padStart(2, '0')}</strong></span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Dose <strong>{e.plan.recipe.dose}g</strong></span>
                          <span>Ratio <strong>1:{e.plan.recipe.ratio}</strong></span>
                          <span>Water <strong>{e.plan.recipe.water}g</strong></span>
                        </div>
                        {(e.waterMix || e.plan.waterMix) && (() => {
                          const wm = e.waterMix ?? e.plan.waterMix;
                          if (!wm) return null;
                          return (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <span>Water Mix <strong>{wm.ratio}</strong></span>
                              <span>Total Mix <strong>{wm.totalMl.toFixed(0)}ml</strong></span>
                              <span>Mineral <strong>{wm.mineralMl.toFixed(1)}ml</strong></span>
                              <span>Plain <strong>{wm.plainWaterMl.toFixed(1)}ml</strong></span>
                              <span>Measured PPM <strong>{wm.measuredPpm.toFixed(0)}</strong></span>
                              <span>Est. Final PPM <strong>{wm.estimatedFinalPpm != null ? wm.estimatedFinalPpm.toFixed(1) : '—'}</strong></span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                    {e.pourPlan.length > 0 && (
                      <div>
                        <span className="font-semibold text-[10px] uppercase tracking-wider" style={{color: e.plan ? '#0e7490' : '#047857'}}>Pour Plan</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {e.pourPlan.map((p, i) => {
                            const prev = i === 0 ? 0 : e.pourPlan[i - 1].cumulativePercent;
                            return (
                              <span key={i} className="text-[9px] text-slate-500">
                                #{i + 1} <strong>{p.cumulativePercent}%</strong>{p.duration != null ? ` (${p.duration}s)` : ''} <span className="text-slate-300">+{p.cumulativePercent - prev}%</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sweet spot summary */}
      {entries.length >= 2 && (() => {
        const good = entries.filter(e => overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags) === 'IDEAL' && e.grindSize > 0);
        const sweetGinds = [...new Set(good.map(e => e.grindSize))].sort((a, b) => a - b);
        return sweetGinds.length > 0 ? (
          <div className="text-[10px] text-slate-400 px-1 pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-emerald-600 font-semibold">Sweet spot</span>
            <span className="text-slate-400">:</span>
            {sweetGinds.map(g => (
              <span key={g} className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px] tabular-nums">#{g}</span>
            ))}
          </div>
        ) : null;
      })()}

      {/* Common issue patterns */}
      {entries.length >= 3 && (() => {
        const tagCounts: Record<string, number> = {};
        entries.forEach(e => e.tasteTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
        const topIssues = Object.entries(tagCounts)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4);
        return topIssues.length > 0 ? (
          <div className="text-[10px] text-slate-400 px-1 pt-1 flex items-center gap-2 flex-wrap">
            <span className="text-amber-600 font-semibold">Recurring</span>
            <span className="text-slate-400">:</span>
            {topIssues.map(([tag, count]) => (
              <span key={tag} className="text-amber-700 text-[9px]">
                {tag} <strong className="text-amber-500">×{count}</strong>
              </span>
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}
