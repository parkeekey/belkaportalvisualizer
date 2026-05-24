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
const CHIP_CATEGORIES = [
  { key: 'flavor', label: 'Flavor', short: 'FLA' },
  { key: 'aftertaste', label: 'Aftertaste', short: 'AFT' },
  { key: 'acidity', label: 'Acidity', short: 'ACD' },
  { key: 'sweetness', label: 'Sweetness', short: 'SWT' },
  { key: 'mouthfeel', label: 'Mouthfeel', short: 'MTH' },
  { key: 'overall', label: 'Overall', short: 'OVR' },
];
const isPositive = (t: string) => POSITIVE_TAGS.has(t);
const isNegative = (t: string) => !POSITIVE_TAGS.has(t);

interface AttemptEntry {
  id: string;
  date: string;
  grindSize: number;
  doseWeight: number;
  brewRatio: number;
  totalWater: number;
  brewTemp: number;
  tdsActual: number;
  tdsMin: number;
  tdsMax: number;
  ey: number;
  eyTarget: number;
  brewTimeActual: number | null;
  pourPlan: PourPlanEntry[];
  tasteTags: string[];
  chips: string[] | null;
  notes: string;
  liked: boolean | null;
  cupRating: number | null;
  plan: BrewPlanSnapshot | null;
  waterMix: WaterMixSnapshot | null;
}

const STORAGE_KEY = 'belkaAttemptLog';

function loadLog(): AttemptEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return (raw as AttemptEntry[]).map(e => {
      const entry = { ...e, brewTemp: (e as any).brewTemp ?? 0, tasteTags: e.tasteTags ?? [], chips: (e as any).chips ?? ((e as any).chipScores ? Object.keys((e as any).chipScores).filter((k: string) => (e as any).chipScores[k] > 0) : null), plan: (e as any).plan ?? null, eyTarget: (e as any).eyTarget ?? 0, brewTimeActual: (e as any).brewTimeActual ?? null, liked: (e as any).liked ?? null, pourPlan: (e as any).pourPlan ?? [], waterMix: (e as any).waterMix ?? null, cupRating: (e as any).cupRating ?? null };
      if (entry.cupRating == null && entry.liked != null) entry.cupRating = entry.liked ? 3 : 1;
      return entry;
    });
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
  currentWaterTemp: number;
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

export default function AttemptLog({ currentGrindSize, currentDose, currentRatio, currentTotalWater, currentWaterTemp, tdsMin, tdsMax, currentTDS, currentEY, brewTimeTarget, brewTimeActual, planSnapshot, pourPlan: propPourPlan, pourPlanStandby, waterMixStandby, onClearPourPlanStandby, onClearWaterMixStandby }: AttemptLogProps) {
  const [entries, setEntries] = useState<AttemptEntry[]>(loadLog);
  const [logGrind, setLogGrind] = useState(currentGrindSize > 0 ? String(currentGrindSize) : '');
  const [logRatio, setLogRatio] = useState(currentRatio > 0 ? String(Math.round(currentRatio)) : '');
  const [logTemp, setLogTemp] = useState(currentWaterTemp > 0 ? String(currentWaterTemp) : '');
  const [logTDS, setLogTDS] = useState(String(currentTDS));
  const [logEY, setLogEY] = useState(currentEY && currentEY > 0 ? String(currentEY) : '');
  const [logBrewTarget, setLogBrewTarget] = useState(brewTimeTarget && brewTimeTarget > 0 ? String(brewTimeTarget) : '');
  const [logBrewActual, setLogBrewActual] = useState(brewTimeActual != null && brewTimeActual > 0 ? String(brewTimeActual) : '');
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logChips, setLogChips] = useState<string[]>([]);
  const [showChips, setShowChips] = useState(false);
  const [logNotes, setLogNotes] = useState('');
  const [logCupRating, setLogCupRating] = useState<number | null>(null);
  const [logLiked, setLogLiked] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrind, setEditGrind] = useState('');
  const [editDose, setEditDose] = useState('');
  const [editRatio, setEditRatio] = useState('');
  const [editTemp, setEditTemp] = useState('');
  const [editTDS, setEditTDS] = useState('');
  const [editEY, setEditEY] = useState('');
  const [editBrewActual, setEditBrewActual] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editChips, setEditChips] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editCupRating, setEditCupRating] = useState<number | null>(null);
  const [editLiked, setEditLiked] = useState<boolean | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [graphFeedback, setGraphFeedback] = useState<string | null>(null);
  const [chatFeedback, setChatFeedback] = useState<string | null>(null);
  const [mirrorEnabled, setMirrorEnabled] = useState(() => {
    try { return localStorage.getItem('belka.attemptMirror') !== 'false'; } catch { return true; }
  });

  // Mirror mode: auto-sync all form fields from digitizer props
  useEffect(() => {
    localStorage.setItem('belka.attemptMirror', String(mirrorEnabled));
  }, [mirrorEnabled]);

  useEffect(() => {
    if (!mirrorEnabled) return;
    if (currentGrindSize > 0) setLogGrind(String(currentGrindSize));
    if (currentRatio > 0) setLogRatio(String(Math.round(currentRatio)));
    if (currentWaterTemp > 0) setLogTemp(String(currentWaterTemp));
    if (currentEY && currentEY > 0) setLogEY(String(currentEY));
    if (brewTimeTarget && brewTimeTarget > 0) setLogBrewTarget(String(brewTimeTarget));
    if (brewTimeActual != null && brewTimeActual > 0) setLogBrewActual(String(brewTimeActual));
  }, [mirrorEnabled, currentGrindSize, currentRatio, currentWaterTemp, currentEY, brewTimeTarget, brewTimeActual]);

  const applyToGraph = useCallback((entry: AttemptEntry) => {
    localStorage.setItem('belka.attemptToGraph', JSON.stringify({
      doseWeight: entry.doseWeight,
      brewRatio: entry.brewRatio,
      totalWater: entry.totalWater,
      brewTemp: entry.brewTemp,
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
      brewTemp: parseFloat(logTemp) || currentWaterTemp || 0,
      tdsActual: tds,
      tdsMin,
      tdsMax,
      ey,
      eyTarget: parseFloat(logEY) || currentEY || 0,
      brewTimeActual: parseFloat(logBrewActual) || null,
      pourPlan: pourPlanStandby ?? propPourPlan ?? [],
      tasteTags: [...logTags],
      chips: logChips.length > 0 ? [...logChips] : null,
      notes: logNotes,
      cupRating: logCupRating,
      liked: logCupRating != null ? logCupRating >= 2 : null,
      plan: planSnapshot ?? null,
      waterMix: waterMixStandby ?? planSnapshot?.waterMix ?? null,
    };
    if (pourPlanStandby && onClearPourPlanStandby) onClearPourPlanStandby();
    if (waterMixStandby && onClearWaterMixStandby) onClearWaterMixStandby();
    setEntries(prev => [entry, ...prev]);
    setLogEY('');
    setLogBrewActual('');
              setLogTags([]);
    setLogChips([]);
    setShowChips(false);
              setLogCupRating(null);
              setLogLiked(null);
  }, [logGrind, logRatio, logTemp, logTDS, logEY, logBrewTarget, logBrewActual, logTags, logChips, logNotes, logCupRating, logLiked, currentGrindSize, currentDose, currentRatio, currentTotalWater, currentWaterTemp, tdsMin, tdsMax, currentEY, brewTimeTarget, brewTimeActual, planSnapshot, waterMixStandby, onClearWaterMixStandby, pourPlanStandby, onClearPourPlanStandby, propPourPlan]);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const startEdit = useCallback((e: AttemptEntry) => {
    setEditingId(e.id);
    setEditGrind(e.grindSize > 0 ? String(e.grindSize) : '');
    setEditDose(e.doseWeight > 0 ? String(e.doseWeight) : '');
    setEditRatio(e.brewRatio > 0 ? String(e.brewRatio) : '');
    setEditTemp(e.brewTemp > 0 ? String(e.brewTemp) : '');
    setEditTDS(String(e.tdsActual));
    setEditEY(String(e.ey));
    setEditBrewActual(e.brewTimeActual != null ? String(e.brewTimeActual) : '');
    setEditTags([...e.tasteTags]);
    setEditChips(e.chips ? [...e.chips] : []);
    setEditNotes(e.notes);
    setEditCupRating(e.cupRating);
    setEditLiked(e.liked);
  }, []);

  const saveEdit = useCallback((id: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newTDS = parseFloat(editTDS);
      const newEY = parseFloat(editEY);
      const newGrind = parseFloat(editGrind);
      const newDose = parseFloat(editDose);
      const newRatio = parseFloat(editRatio);
      const newTemp = parseFloat(editTemp);
      const newBrewActual = parseInt(editBrewActual);
      return {
        ...e,
        grindSize: !isNaN(newGrind) ? newGrind : e.grindSize,
        doseWeight: !isNaN(newDose) ? newDose : e.doseWeight,
        brewRatio: !isNaN(newRatio) ? newRatio : e.brewRatio,
        brewTemp: !isNaN(newTemp) ? newTemp : e.brewTemp,
        tdsActual: isNaN(newTDS) ? e.tdsActual : newTDS,
        ey: isNaN(newEY) ? e.ey : newEY,
        brewTimeActual: !isNaN(newBrewActual) ? newBrewActual : null,
        tasteTags: [...editTags],
        chips: editChips.length > 0 ? [...editChips] : null,
        notes: editNotes,
        cupRating: editCupRating,
        liked: editCupRating != null ? editCupRating >= 2 : null,
      };
    }));
    setEditingId(null);
  }, [editGrind, editDose, editRatio, editTemp, editTDS, editEY, editBrewActual, editTags, editChips, editNotes, editCupRating, editLiked]);

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

  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState(() => {
    try { return JSON.parse(localStorage.getItem('belka.brewSetup') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('belka.brewSetup', JSON.stringify(setup)); }, [setup]);

  return (
    <div className="space-y-3">
      {/* Setup (collapsible) */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowSetup(!showSetup)}
          className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${showSetup ? 'bg-sky-100 text-sky-700 border-sky-300' : 'text-slate-400 border-slate-200 hover:border-sky-200 hover:text-sky-500'}`}
        >
          ⚙ {showSetup ? '▲' : '▼'}
        </button>
        {setup.grinder && <span className="text-[10px] text-slate-500 font-medium">Grinder: <strong className="text-slate-700">{setup.grinder}</strong></span>}
        {setup.brewer && <span className="text-[10px] text-slate-500 font-medium">Brewer: <strong className="text-slate-700">{setup.brewer}</strong></span>}
        {setup.filter && <span className="text-[10px] text-slate-500 font-medium">Filter: <strong className="text-slate-700">{setup.filter}</strong></span>}
      </div>
      {showSetup && (
        <div className="flex flex-wrap gap-2 p-3 bg-white border border-sky-200 rounded-lg">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Grinder</span>
            <input type="text" value={setup.grinder || ''} onChange={(e) => setSetup((p: any) => ({ ...p, grinder: e.target.value }))}
              className="w-32 px-1.5 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" placeholder="e.g. Comandante C40"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Brewer</span>
            <input type="text" value={setup.brewer || ''} onChange={(e) => setSetup((p: any) => ({ ...p, brewer: e.target.value }))}
              className="w-32 px-1.5 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" placeholder="e.g. V60"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Filter</span>
            <input type="text" value={setup.filter || ''} onChange={(e) => setSetup((p: any) => ({ ...p, filter: e.target.value }))}
              className="w-32 px-1.5 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" placeholder="e.g. Hario paper"
            />
          </label>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs px-1">
        <span className="text-slate-400 font-medium">Attempts <strong className="text-slate-700">{total}</strong></span>
        <span className="text-emerald-600 font-medium">Ideal <strong>{idealCount}</strong></span>
        <span className="text-amber-600 font-medium">Needs work <strong>{total - idealCount}</strong></span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-32">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${successPct}%` }} />
        </div>
        <span className={`font-bold tabular-nums ${successPct >= 60 ? 'text-emerald-600' : successPct >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{successPct}%</span>
        <label className="flex items-center gap-1 ml-auto text-[9px] text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={mirrorEnabled}
            onChange={(e) => setMirrorEnabled(e.target.checked)}
            className="w-3 h-3 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
          />
          Mirror
        </label>
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
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Dose</label>
              <input type="number" step={0.1} value={currentDose > 0 ? currentDose : ''}
                className="w-12 px-1.5 py-1 text-xs border border-slate-200 rounded text-center bg-slate-50 text-slate-500"
                disabled
                title="Pulled from digitizer"
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
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Temp</label>
              <input type="number" step={1} min={80} max={100} value={logTemp}
                onChange={(e) => setLogTemp(e.target.value)}
                className="w-12 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder={currentWaterTemp > 0 ? `${currentWaterTemp}°C` : '°C'}
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
            {[{v:1,e:'🥉'},{v:2,e:'🥈'},{v:3,e:'🥇'}].map(r => (
              <button key={r.v} onClick={() => setLogCupRating(logCupRating === r.v ? null : r.v)}
                className={`text-lg px-2 py-1 rounded-lg border transition-all ${logCupRating === r.v ? 'bg-emerald-100 text-emerald-600 border-emerald-300 shadow-sm' : 'text-slate-300 border-slate-200 hover:border-emerald-200 hover:text-emerald-400'}`}
                title={r.v===1?'Needs work':r.v===2?'Getting closer':'Nailed it'}
              >{r.e}</button>
            ))}
            <button disabled className="px-1 py-1 rounded text-[9px] text-slate-200 border border-dashed border-slate-200 cursor-not-allowed" title="Affective / sensory score — coming soon">+Sensory</button>
            <button onClick={() => setShowChips(!showChips)}
              className={`px-1.5 py-1 rounded text-[9px] font-bold border transition-colors ${showChips ? 'bg-amber-100 text-amber-700 border-amber-300' : 'text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600'}`}
              title="Award chips (competition scoring)"
            >🎰 {showChips ? '▲' : '▼'}</button>
            <button onClick={() => {
              setMirrorEnabled(true);
              setLogGrind(currentGrindSize > 0 ? String(currentGrindSize) : '');
              setLogRatio(currentRatio > 0 ? String(Math.round(currentRatio)) : '');
              setLogTemp(currentWaterTemp > 0 ? String(currentWaterTemp) : '');
              setLogTDS(String(currentTDS));
              setLogEY(currentEY && currentEY > 0 ? String(currentEY) : '');
              setLogBrewTarget(brewTimeTarget && brewTimeTarget > 0 ? String(brewTimeTarget) : '');
              setLogBrewActual(brewTimeActual != null && brewTimeActual > 0 ? String(brewTimeActual) : '');
              setLogTags([]);
              setLogChips([]);
              setShowChips(false);
              setLogNotes('');
              setLogCupRating(null);
              setLogLiked(null);
            }}
              className="px-2 py-1.5 text-xs font-bold text-sky-600 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors"
              title="Pull all digitizer values into form and enable mirror"
            >
              ↻ Pull All
            </button>
            <button onClick={addEntry} disabled={!logTDS || isNaN(parseFloat(logTDS))}
            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Log Attempt
          </button>
        </div>
        </div>

        {/* Award chips */}
        {showChips && (
          <div className="flex items-center gap-1.5 px-1">
            {CHIP_CATEGORIES.map(cat => {
              const on = logChips.includes(cat.key);
              return (
                <div key={cat.key} className="flex flex-col items-center gap-0.5">
                  <div onClick={() => setLogChips(p => p.includes(cat.key) ? p.filter(k => k !== cat.key) : [...p, cat.key])}
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[7px] uppercase tracking-wider border-2 cursor-pointer select-none active:scale-90 transition-all ${on
                      ? 'bg-gradient-to-br from-amber-200 to-amber-400 border-amber-500 text-amber-900 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.3),_0_2px_6px_rgba(0,0,0,0.12)]'
                      : 'bg-slate-100 border-slate-300 text-slate-400 shadow-[inset_0_0_0_2px_rgba(148,163,184,0.2)]'}`}
                    title={`${cat.label}${on ? ' ✅' : ''}`}
                  >{cat.short}</div>
                  <span className={`text-[6px] font-bold uppercase tracking-wider ${on ? 'text-amber-600' : 'text-slate-300'}`}>{cat.label}</span>
                </div>
              );
            })}
          </div>
        )}

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
              <div id={`attempt-${e.id}`} key={e.id}
                className={`rounded-lg px-3 py-2 border transition-colors ${isIdeal ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}
              >
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {/* Grind # */}
                  {isEditing ? (
                    <label className="flex flex-col items-center gap-0">
                      <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">Grind</span>
                      <input type="number" step={0.1} value={editGrind}
                        onChange={(ee) => setEditGrind(ee.target.value)}
                        className="w-12 px-1 py-0.5 text-xs font-bold border border-emerald-300 rounded text-center bg-white tabular-nums"
                        onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); if (ee.key === 'Escape') setEditingId(null); }}
                      />
                    </label>
                  ) : (
                    <span className="text-slate-700 font-bold text-sm w-12 tabular-nums">#{e.grindSize > 0 ? e.grindSize : '—'}</span>
                  )}

                  {/* Dose + ratio + temp */}
                  {isEditing ? (
                    <>
                      <label className="flex flex-col items-center gap-0">
                        <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">Dose</span>
                        <input type="number" step={0.1} value={editDose}
                          onChange={(ee) => setEditDose(ee.target.value)}
                          className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white tabular-nums"
                        />
                      </label>
                      <label className="flex flex-col items-center gap-0">
                        <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">Ratio</span>
                        <input type="number" step={0.1} value={editRatio}
                          onChange={(ee) => setEditRatio(ee.target.value)}
                          className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white tabular-nums"
                        />
                      </label>
                      <label className="flex flex-col items-center gap-0">
                        <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">°C</span>
                        <input type="number" step={1} value={editTemp}
                          onChange={(ee) => setEditTemp(ee.target.value)}
                          className="w-10 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white tabular-nums"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-400 tabular-nums">{e.doseWeight.toFixed(1)}g</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400 tabular-nums">1:{e.brewRatio.toFixed(0)}</span>
                      {e.brewTemp > 0 && (
                        <span className="text-slate-400 tabular-nums text-[10px]">{e.brewTemp}°C</span>
                      )}
                    </>
                  )}

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS actual */}
                  {isEditing ? (
                    <label className="flex flex-col items-center gap-0">
                      <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">TDS</span>
                      <input type="number" step={0.01} value={editTDS}
                        onChange={(ee) => setEditTDS(ee.target.value)}
                        className="w-14 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                        autoFocus
                        onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); if (ee.key === 'Escape') setEditingId(null); }}
                      />
                    </label>
                  ) : (
                    <span className="font-bold tabular-nums" style={{ color: tvColor }}>{e.tdsActual.toFixed(2)}</span>
                  )}

                  {/* Delta */}
                  {!isEditing && <span className="tabular-nums text-slate-400 text-[10px]">{d > 0 ? '+' : ''}{d.toFixed(2)}</span>}

                  {/* EY */}
                  {isEditing ? (
                    <label className="flex flex-col items-center gap-0">
                      <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">EY%</span>
                      <input type="number" step={0.1} value={editEY}
                        onChange={(ee) => setEditEY(ee.target.value)}
                        className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                        onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); }}
                      />
                    </label>
                  ) : (
                    <span className="tabular-nums text-slate-500">{e.ey > 0 ? `${e.ey.toFixed(1)}%` : '—'}</span>
                  )}

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS target range */}
                  <span className="text-[9px] text-slate-400 tabular-nums">({e.tdsMin.toFixed(2)}–{e.tdsMax.toFixed(2)})</span>

                  {/* Brew time */}
                  {isEditing ? (
                    <label className="flex flex-col items-center gap-0">
                      <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">Time</span>
                      <div className="flex items-center gap-0.5">
                        <input type="number" min={0} step={1} value={editBrewActual && parseInt(editBrewActual) > 0 ? Math.floor(parseInt(editBrewActual) / 60) : ''}
                          onChange={(ee) => {
                            const m = Math.max(0, parseInt(ee.target.value) || 0);
                            const s = parseInt(editBrewActual) || 0;
                            setEditBrewActual(String(m * 60 + (s % 60)));
                          }}
                          className="w-8 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                          placeholder="mm"
                        />
                        <span className="text-slate-300 text-[9px]">:</span>
                        <input type="number" min={0} max={59} step={1} value={editBrewActual && parseInt(editBrewActual) > 0 ? (parseInt(editBrewActual) % 60) : ''}
                          onChange={(ee) => {
                            const s = Math.max(0, Math.min(59, parseInt(ee.target.value) || 0));
                            const base = parseInt(editBrewActual) || 0;
                            setEditBrewActual(String(Math.floor(base / 60) * 60 + s));
                          }}
                          className="w-8 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                          placeholder="ss"
                        />
                      </div>
                    </label>
                  ) : (
                    e.brewTimeActual != null && e.brewTimeActual > 0 && (
                      <span className="text-[9px] text-slate-400 tabular-nums">⏱ {Math.floor(e.brewTimeActual / 60)}:{String(e.brewTimeActual % 60).padStart(2, '0')}</span>
                    )
                  )}

                  {/* Verdict badges */}
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                    style={{ color: tvColor, backgroundColor: `${tvColor}15`, border: `1px solid ${tvColor}28` }}
                  >
                    {tv}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${isIdeal ? 'text-emerald-700 bg-emerald-100 border border-emerald-300' : 'text-amber-700 bg-amber-100 border border-amber-300'}`}>
                    {isIdeal ? 'OK' : 'NEED IMPROVE'}
                  </span>

                  {/* EY target */}
                  {e.eyTarget > 0 && (
                    <span className="text-[9px] text-slate-400 tabular-nums">EY {e.ey > 0 ? `${e.ey.toFixed(1)}` : '?'}/{e.eyTarget}%</span>
                  )}

                  {e.waterMix && (
                    <span className="text-[9px] text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1 py-0.5 tabular-nums">
                      H2O {e.waterMix.ratio} · {e.waterMix.totalMl.toFixed(0)}ml
                    </span>
                  )}

                  {/* Taste tags — edit or view */}
                  {isEditing ? (
                    <>
                      <div className="flex flex-wrap gap-0.5">
                        {ALL_TASTE_TAGS.map(tag => (
                          <button key={tag} onClick={() => toggleEditTag(tag)}
                            className={`px-1 py-0.5 rounded text-[7px] font-semibold uppercase tracking-wider border ${editTags.includes(tag) ? (isNegative(tag) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300') : 'bg-white text-slate-300 border-slate-200'}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider mr-0.5">Chips</span>
                        {CHIP_CATEGORIES.map(cat => {
                          const on = editChips.includes(cat.key);
                          return (
                            <div key={cat.key} className="flex flex-col items-center gap-0">
                              <div onClick={() => setEditChips(p => p.includes(cat.key) ? p.filter(k => k !== cat.key) : [...p, cat.key])}
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold border cursor-pointer select-none text-[6px] transition-all ${on
                                  ? 'bg-gradient-to-br from-amber-200 to-amber-400 border-amber-500 text-amber-900 shadow-[inset_0_0_0_1.5px_rgba(251,191,36,0.3)]'
                                  : 'bg-slate-100 border-slate-300 text-slate-400 shadow-[inset_0_0_0_1.5px_rgba(148,163,184,0.2)]'}`}
                                title={`${cat.label}${on ? ' ✅' : ''}`}
                              >{cat.short}</div>
                              <span className="text-[4px] font-bold uppercase tracking-wider" style={{color: on ? '#d97706' : '#94a3b8'}}>{cat.short}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      {e.tasteTags.length > 0 && (
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {e.tasteTags.map(t => renderTasteTag(t, true))}
                        </div>
                      )}
                      {e.chips && e.chips.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {CHIP_CATEGORIES.map(cat => {
                            if (!e.chips!.includes(cat.key)) return null;
                            return (
                              <div key={cat.key} className="w-[14px] h-[14px] rounded-full flex items-center justify-center font-bold text-[6px] border border-amber-500 bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]"
                                title={cat.label}
                              >{cat.short}</div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* Date */}
                  <span className="ml-auto text-[8px] text-slate-400 whitespace-nowrap">{e.date}</span>

                  {/* Like/Dislike — edit or view */}
                  {isEditing ? (
                    <label className="flex flex-col items-center gap-0">
                      <span className="text-[7px] text-emerald-500 font-semibold uppercase tracking-wider">Cup</span>
                      <div className="flex items-center gap-0.5">
                        {[{v:1,e:'🥉'},{v:2,e:'🥈'},{v:3,e:'🥇'}].map(r => (
                          <button key={r.v} onClick={() => setEditCupRating(editCupRating === r.v ? null : r.v)}
                            className={`text-xs px-1.5 py-0.5 rounded border transition-all ${editCupRating === r.v ? 'bg-emerald-100 text-emerald-600 border-emerald-300' : 'text-slate-300 border-slate-200 hover:border-emerald-200'}`}
                            title={r.v===1?'Needs work':r.v===2?'Getting closer':'Nailed it'}
                          >{r.e}</button>
                        ))}
                      </div>
                    </label>
                  ) : (
                    <span className="text-base tabular-nums">
                      {e.cupRating === 3 ? <span className="opacity-90">🥇</span> : e.cupRating === 2 ? <span className="opacity-80">🥈</span> : e.cupRating === 1 ? <span className="opacity-70">🥉</span> : null}
                    </span>
                  )}

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

                  {/* Send to Chat */}
                  {!isEditing && (
                    <button onClick={() => {
                      localStorage.setItem('belka.chatAttemptData', JSON.stringify(e));
                      window.dispatchEvent(new CustomEvent('belka:chat-attempt-ready', { detail: e.id }));
                      setChatFeedback(e.id);
                      setTimeout(() => setChatFeedback(null), 2500);
                    }}
                      className="px-1.5 py-1 rounded text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors"
                      title="Send this attempt to the Brew Chat"
                    >
                      {chatFeedback === e.id ? '✓ Sent! Open Chat →' : '💬 Chat'}
                    </button>
                  )}

                  {/* Edit / Save / Delete */}
                  {isEditing ? (
                    <>
                      <button onClick={() => saveEdit(e.id)} className="text-emerald-600 hover:text-emerald-800 font-bold px-1 text-xs">✓</button>
                      <button onClick={() => setEditingId(null)} className="text-slate-300 hover:text-slate-500 px-1 text-xs">✕</button>
                    </>
                  ) : (
                    <button onClick={() => startEdit(e)} className="text-slate-300 hover:text-slate-500 px-1 text-xs">✎</button>
                  )}
                  <button onClick={() => deleteEntry(e.id)} className="text-red-200 hover:text-red-500 font-bold px-0.5 text-xs">×</button>
                </div>

                {/* Notes row — edit or view */}
                {isEditing ? (
                  <input type="text" value={editNotes}
                    onChange={(ee) => setEditNotes(ee.target.value)}
                    placeholder="taste notes..."
                    className="mt-1 ml-1 w-full px-1.5 py-0.5 text-[9px] border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                ) : (
                  e.notes && <div className="text-[9px] text-slate-400 mt-1 ml-14">{e.notes}</div>
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

      {/* Cup Progress Map */}
      {/* Cup Progress Map — bigger & clickable */}
      {entries.length >= 2 && (() => {
        const rated = [...entries].filter(e => e.cupRating != null);
        if (rated.length === 0) return null;
        const chrono = [...entries].reverse();
        const last3 = rated.slice(-3).map(e => e.cupRating ?? 0);
        const trend = last3.length >= 2
          ? (last3[last3.length - 1] > last3[0] ? '↗' : last3[last3.length - 1] < last3[0] ? '↘' : '→')
          : '';
        const scrollToAttempt = (id: string) => {
          const el = document.getElementById(`attempt-${id}`);
          if (!el) return;
          const container = el.closest('.overflow-y-auto') as HTMLElement | null;
          if (container) {
            const cr = container.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            container.scrollTo({ top: er.top - cr.top + container.scrollTop - 60, behavior: 'smooth' });
          }
          el.style.outline = '2px solid #34d399';
          el.style.outlineOffset = '2px';
          el.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.15)';
          setTimeout(() => {
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.style.boxShadow = '';
          }, 2500);
        };
        const barColor = (r: number) => r === 3 ? '#f59e0b' : r === 2 ? '#94a3b8' : '#78350f';
        const barH = (r: number) => Math.max(r * 12, 0);
        return (
          <div className="px-1 pt-3 pb-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
              <span className="font-semibold text-slate-700 uppercase tracking-wider">Cup Map</span>
              <span className="text-slate-300">|</span>
              <span className="text-emerald-600 font-semibold">Best 🥇</span>
              {rated.filter(e=>e.cupRating===3).length>0&&<span className="text-emerald-700 font-bold tabular-nums">#{rated.filter(e=>e.cupRating===3).map(e=>e.grindSize).join(', #')}</span>}
              {rated.filter(e=>e.cupRating===2).length>0&&<span className="text-slate-400">· 🥈 #{rated.filter(e=>e.cupRating===2).map(e=>e.grindSize).join(', #')}</span>}
              {rated.filter(e=>e.cupRating===1).length>0&&<span className="text-slate-400">· 🥉 #{rated.filter(e=>e.cupRating===1).map(e=>e.grindSize).join(', #')}</span>}
              {trend && <span className="ml-auto text-slate-400 font-semibold text-sm">{trend}</span>}
            </div>
            <div className="flex items-end gap-[3px] h-[116px] relative">
              <div className="absolute inset-x-0 bottom-[16px] border-t border-dashed border-slate-200 pointer-events-none" />
              {chrono.map((e, i) => {
                const r = e.cupRating ?? 0;
                const h = barH(r);
                const colors = ['#fee2e2','#fef3c7','#d1fae5'];
                return (
                  <div key={e.id} onClick={() => scrollToAttempt(e.id)}
                    className={`flex flex-col items-center justify-end w-[28px] cursor-pointer rounded-t-md transition-all hover:scale-110 hover:z-10 ${r > 0 ? 'hover:bg-slate-50' : ''}`}
                    title={`#${i + 1}${e.grindSize > 0 ? ` · grind #${e.grindSize}` : ''}${r ? ` · ${['','🥉','🥈','🥇'][r]}` : ' · unrated'} — click to view`}
                  >
                    <span className={`text-base leading-none mb-0.5 ${r > 0 ? '' : 'opacity-0'}`}>
                      {r === 3 ? '🥇' : r === 2 ? '🥈' : r === 1 ? '🥉' : '·'}
                    </span>
                    <div className="w-[10px] rounded-t-[3px] transition-all" style={{
                      height: `${h}px`,
                      background: r > 0 ? `linear-gradient(180deg, ${barColor(r)}80 0%, ${barColor(r)} 100%)` : '#f1f5f9',
                      opacity: r > 0 ? 1 : 0.15,
                    }} />
                    <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5 leading-none"
                      style={{ color: r > 0 ? colors[r - 1] : '#cbd5e1' }}
                    >{i + 1}</span>
                    {e.chips && e.chips.length > 0 && (
                      <span className="text-[7px] font-bold mt-px leading-none text-amber-600">🏅{e.chips.length}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
