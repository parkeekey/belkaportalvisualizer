import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import RecipePourPlanning, { type RecipePourPlanningHandle, type RecipePourPlanningProfile } from './RecipePourPlanning';
import TDSHUD from './TDSHUD';
import AttemptLog from './AttemptLog';

export interface SetupProfileProfile {
  version: 1;
  recipePlan: RecipePourPlanningProfile;
}

export interface SetupProfileHandle {
  exportProfile: () => SetupProfileProfile;
  importProfile: (profile: SetupProfileProfile) => void;
}

const SetupProfile = forwardRef<SetupProfileHandle>((_props, ref) => {
  const recipePlanRef = React.useRef<RecipePourPlanningHandle>(null);

  const [equipmentName, setEquipmentName] = useState('');
  const [brewerType, setBrewerType] = useState('V60');
  const [filterName, setFilterName] = useState('');
  const [filterType, setFilterType] = useState('');
  const [flowSpeed, setFlowSpeed] = useState(50);
  const flowSuggestion = useMemo(() => {
    const finePct = Math.round((flowSpeed - 50) * 0.6);
    return finePct;
  }, [flowSpeed]);
  const [roastLevel, setRoastLevel] = useState(40);
  const [density, setDensity] = useState(50);
  const [altitude, setAltitude] = useState(1600);
  const [process, setProcess] = useState('washed');
  const [origin, setOrigin] = useState('');
  const [defects, setDefects] = useState<string[]>([]);
  const toggleDefect = (id: string) => setDefects(p => p.includes(id) ? p.filter(d => d !== id) : [...p, id]);
  const DEFECT_OPTIONS = [
    { id: 'quakers', label: 'Quakers' },
    { id: 'insect-damage', label: 'Insect Damage' },
    { id: 'mold', label: 'Mold' },
    { id: 'over-fermented', label: 'Over-Fermented' },
    { id: 'under-ripe', label: 'Under-Ripe' },
    { id: 'stinker', label: 'Stinker' },
    { id: 'sour', label: 'Sour' },
  ];

  const [grindAdjustPct, setGrindAdjustPct] = useState(50);
  const [flowTestOpen, setFlowTestOpen] = useState(false);
  const [drawdownRate, setDrawdownRate] = useState(8);
  const [brewTimeSec, setBrewTimeSec] = useState(180);
  const [brewActualSec, setBrewActualSec] = useState<number | null>(null);
  const [brewLiked, setBrewLiked] = useState<boolean | null>(null);
  const [icedDose, setIcedDose] = useState(20);
  const [icedRatio, setIcedRatio] = useState(15);
  const [icedIcePct, setIcedIcePct] = useState(40);
  const [icedHotTDS, setIcedHotTDS] = useState(3.0);
  const [icedTargetFinalTDS, setIcedTargetFinalTDS] = useState<number | null>(null);
  const [icedTab, setIcedTab] = useState<'ratio' | 'ey'>('ratio');
  const [icedOpen, setIcedOpen] = useState(false);
  const [icedEYmin, setIcedEYmin] = useState(18);
  const [icedEYmax, setIcedEYmax] = useState(22);

  const [finesTendency, setFinesTendency] = useState<'low' | 'medium' | 'high'>('medium');
  const [grinderBurr, setGrinderBurr] = useState<'conical' | 'flat' | 'blade'>('conical');
  const [grinderPower, setGrinderPower] = useState<'hand' | 'electric'>('hand');
  const [grinderName, setGrinderName] = useState('');
  const [grinderMicron, setGrinderMicron] = useState(800);
  const [dialRangeMin, setDialRangeMin] = useState(() => {
    const saved = localStorage.getItem('belkaDialRangeMin');
    return saved ? parseInt(saved) || 0 : 0;
  });
  const [dialRangeMax, setDialRangeMax] = useState(() => {
    const saved = localStorage.getItem('belkaDialRangeMax');
    return saved ? parseInt(saved) || 0 : 0;
  });
  const [grinderProfiles, setGrinderProfiles] = useState<Record<string, { name: string; power: string; burr: string; fines: string; micron: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('belkaGrinderProfiles') || '{}'); } catch { return {}; }
  });
  const [profileNameInput, setProfileNameInput] = useState('');
  const [grinderCalibration, setGrinderCalibration] = useState<{ grindNum: number; micron: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('belkaGrinderCal') || '[]'); } catch { return []; }
  });
  const [calGrindDraft, setCalGrindDraft] = useState('0');
  const [calMicronDraft, setCalMicronDraft] = useState('800');
  const MICRON_RANGES = [
    { id: 'turkish', label: 'Turkish / Ibrik', min: 200, max: 300, mid: 250, color: 'text-purple-700 bg-purple-50 border-purple-200', note: 'Ultra-fine, powder-like.' },
    { id: 'espresso', label: 'Espresso', min: 300, max: 400, mid: 350, color: 'text-red-700 bg-red-50 border-red-200', note: 'Fine, high pressure required.' },
    { id: 'moka', label: 'Moka Pot / Fine Aeropress', min: 400, max: 500, mid: 450, color: 'text-orange-700 bg-orange-50 border-orange-200', note: 'Between espresso and pour-over.' },
    { id: 'pourover', label: 'Pour-Over / V60 / Drip', min: 500, max: 700, mid: 600, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', note: 'Standard pour-over range.' },
    { id: 'chemex', label: 'Chemex / Kalita / Flat Bottom', min: 700, max: 900, mid: 800, color: 'text-teal-700 bg-teal-50 border-teal-200', note: 'Clean cup, faster flow.' },
    { id: 'frenchpress', label: 'French Press / Coarse Aeropress', min: 900, max: 1100, mid: 1000, color: 'text-amber-700 bg-amber-50 border-amber-200', note: 'Full immersion, heavy body.' },
    { id: 'coldbrew', label: 'Cold Brew / Cupping', min: 1100, max: 1400, mid: 1250, color: 'text-stone-700 bg-stone-50 border-stone-200', note: 'Very coarse, long steep.' },
  ];
  const [targetMethod, setTargetMethod] = useState<string | null>(null);
  const micronGuide = useMemo(() => {
    const r = MICRON_RANGES.find(r => grinderMicron >= r.min && grinderMicron < r.max) ?? MICRON_RANGES[MICRON_RANGES.length - 1];
    return r;
  }, [grinderMicron]);
  const targetRange = useMemo(() => {
    if (!targetMethod) return null;
    return MICRON_RANGES.find(r => r.id === targetMethod) ?? null;
  }, [targetMethod]);
  const [waterTemp, setWaterTemp] = useState(93);
  const [waterQuality, setWaterQuality] = useState<'soft' | 'medium' | 'hard'>('medium');
  const [turbulenceLevel, setTurbulenceLevel] = useState(2);
  const [activeFactor, setActiveFactor] = useState<number | null>(null);
  const [symptom, setSymptom] = useState<string | null>(null);

  const symptomGuide: Record<string, { factor: number; rankLabel: string; direction: string; magnitude: string; advice: string }> = {
    bitter: { factor: 2, rankLabel: 'Grind', direction: 'coarser', magnitude: '3 clicks', advice: 'Grind coarser 3 clicks. If still bitter next brew, lower water temp 2°C.' },
    sour: { factor: 2, rankLabel: 'Grind', direction: 'finer', magnitude: '3 clicks', advice: 'Grind finer 3 clicks. If still sour next brew, raise water temp 2°C.' },
    weak: { factor: 1, rankLabel: 'Ratio', direction: 'tighten', magnitude: '+2g dose', advice: 'Increase dose 2g or tighten ratio to 1:15. If still weak, grind finer 3 clicks.' },
    hollow: { factor: 2, rankLabel: 'Grind', direction: 'finer', magnitude: '3 clicks', advice: 'Grind finer 3 clicks for more extraction. Next brew, also try raising temp 1°C.' },
    drying: { factor: 2, rankLabel: 'Grind', direction: 'coarser', magnitude: '3 clicks', advice: 'Grind coarser 3 clicks. If still astringent next brew, reduce temp 2°C.' },
    muddy: { factor: 1, rankLabel: 'Ratio', direction: 'loosen', magnitude: '1:17 ratio', advice: 'Increase ratio to 1:17 or grind coarser 3 clicks to reduce over-extraction.' },
    salty: { factor: 1, rankLabel: 'Ratio', direction: 'increase', magnitude: '+1g dose', advice: 'Increase dose 1g or grind finer 2 clicks for more strength.' },
  };

  const SYMPTOM_OPTIONS = [
    { id: 'bitter', label: 'Bitter' },
    { id: 'sour', label: 'Sour' },
    { id: 'weak', label: 'Weak' },
    { id: 'hollow', label: 'Hollow' },
    { id: 'drying', label: 'Drying' },
    { id: 'muddy', label: 'Muddy' },
    { id: 'salty', label: 'Salty' },
  ];

  const brewImpactFactors = useMemo(() => {
    const dose = parseFloat(localStorage.getItem('belkaDoseWeight') || '0') || 18;
    const ratio = parseFloat(localStorage.getItem('belkaBrewRatio') || '0') || 16;
    const wqLabel = waterQuality === 'soft' ? 'Soft' : waterQuality === 'hard' ? 'Hard' : 'Medium';
    const turbLabel = turbulenceLevel <= 1 ? 'Low' : turbulenceLevel >= 3 ? 'High' : 'Med';
    return [
      { rank: 1, name: 'Ratio', value: `1:${ratio}`, detail: `${dose}g dose`, barPct: 100, color: 'bg-emerald-500', connects: [2, 4, 5, 7] },
      { rank: 2, name: 'Grind', value: 'Set in Recipe', detail: '', barPct: 85, color: 'bg-emerald-400', connects: [3, 4, 6] },
      { rank: 3, name: 'Temp', value: `${waterTemp}°C`, detail: '', barPct: 70, color: 'bg-emerald-300', connects: [4] },
      { rank: 4, name: 'Time', value: `${Math.floor(brewTimeSec / 60)}:${String(brewTimeSec % 60).padStart(2, '0')}`, detail: '', barPct: 55, color: 'bg-amber-400', connects: [2, 3] },
      { rank: 5, name: 'Water', value: wqLabel, detail: '', barPct: 40, color: 'bg-amber-300', connects: [3] },
      { rank: 6, name: 'Turb.', value: turbLabel, detail: '', barPct: 25, color: 'bg-orange-400', connects: [2, 4] },
      { rank: 7, name: 'Filter', value: filterName || filterType || 'Paper', detail: '', barPct: 10, color: 'bg-orange-300', connects: [2, 4] },
    ];
  }, [waterTemp, waterQuality, turbulenceLevel, brewTimeSec, filterName, filterType]);

  const beanAdvice = useMemo(() => {
    const roastScore = roastLevel <= 66 ? -80 + (roastLevel / 66) * 80 : ((roastLevel - 66) / 34) * 60;
    const densityScore = Math.round((50 - density) * 1.1);
    const processScores: Record<string, number> = { washed: -20, natural: 10, honey: 0, anaerobic: 25, lactic: 25, 'thermal-shock': 35, other: 0 };
    const processScore = processScores[process] ?? 0;
    const altitudeScore = Math.round(50 - (altitude / 2500) * 100);
    const flowScore = Math.round((50 - flowSpeed) * 1.2);
    const brewTimeScore = Math.round((180 - brewTimeSec) * 0.3);
    const overall = Math.round(roastScore * 0.27 + densityScore * 0.22 + flowScore * 0.18 + processScore * 0.14 + altitudeScore * 0.09 + brewTimeScore * 0.10);
    const label = overall < -50 ? 'Much Finer' : overall < -20 ? 'Finer' : overall < -5 ? 'Slightly Finer' : overall <= 5 ? 'Neutral' : overall <= 20 ? 'Slightly Coarser' : overall <= 50 ? 'Coarser' : 'Much Coarser';
    return { overall, label, roastScore: Math.round(roastScore), densityScore, processScore, altitudeScore, flowScore, brewTimeScore };
  }, [roastLevel, density, process, altitude, flowSpeed, brewTimeSec]);

  const [targetTDSMin, setTargetTDSMin] = useState('1.30');
  const [targetTDSMax, setTargetTDSMax] = useState('1.45');
  const [targetEY, setTargetEY] = useState('20');
  const [currentTDS, setCurrentTDS] = useState(1.35);
  const [tdsPlanRatio, setTdsPlanRatio] = useState(() => {
    const saved = localStorage.getItem('belkaBrewRatio');
    return saved ? (parseFloat(saved) || 16) : 16;
  });
  const [recipeValues, setRecipeValues] = useState(() => ({
    dose: parseFloat(localStorage.getItem('belkaDoseWeight') || '0') || 18,
    ratio: parseFloat(localStorage.getItem('belkaBrewRatio') || '0') || 16,
    water: parseFloat(localStorage.getItem('belkaTotalWaterIn') || '0') || 288,
    grindSize: 0,
  }));
  useEffect(() => {
    const ey = parseFloat(targetEY) || 20;
    if (tdsPlanRatio > 0) {
      const t = ey / tdsPlanRatio;
      setTargetTDSMin((t - 0.05).toFixed(2));
      setTargetTDSMax((t + 0.05).toFixed(2));
    }
  }, [targetEY, tdsPlanRatio]);
  useEffect(() => {
    const id = setInterval(() => {
      const dose = parseFloat(localStorage.getItem('belkaDoseWeight') || '0') || 18;
      const ratio = parseFloat(localStorage.getItem('belkaBrewRatio') || '0') || 16;
      const water = parseFloat(localStorage.getItem('belkaTotalWaterIn') || '0') || 288;
      const grindSize = parseFloat(localStorage.getItem('belkaGrindSize') || '0') || 0;
      setRecipeValues(r => r.dose !== dose || r.ratio !== ratio || r.water !== water || r.grindSize !== grindSize ? { ...r, dose, ratio, water, grindSize } : r);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useImperativeHandle(ref, () => ({
    exportProfile: () => ({
      version: 1,
      recipePlan: recipePlanRef.current?.exportProfile() ?? {
        doseWeight: 15, brewRatio: 15, totalWaterIn: 225, pourPlan: [],
        recipeFinishTimeSec: 0, grinderName: '', grindSize: 0, micron: 0,
      },
    }),
    importProfile: (profile) => {
      if (profile.recipePlan) {
        recipePlanRef.current?.importProfile(profile.recipePlan);
      }
    },
  }), []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Setup Profile</h2>

      {/* Equipment Profile */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider mb-3">Equipment Profile</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Brewer</label>
            <input type="text" value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} placeholder="e.g. Stagg X" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Brew Method</label>
            <select value={brewerType} onChange={(e) => setBrewerType(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
              <option value="V60">V60</option>
              <option value="Chemex">Chemex</option>
              <option value="Kalita Wave">Kalita Wave</option>
              <option value="Flat Bottom">Flat Bottom</option>
              <option value="Aeropress">Aeropress</option>
              <option value="French Press">French Press</option>
              <option value="Espresso">Espresso</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Filter</label>
            <input type="text" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="e.g. Cafec Abaca" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Filter Type <span className="text-slate-300 font-normal">(opt)</span></label>
            <input type="text" value={filterType} onChange={(e) => setFilterType(e.target.value)} placeholder="e.g. V60-02, paper" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex flex-col gap-0.5 col-span-2 md:col-span-3">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Flow Speed</label>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-medium w-16 text-right">Very Slow</span>
              <input type="range" min={0} max={100} value={flowSpeed} onChange={(e) => { const v = parseInt(e.target.value); setFlowSpeed(v); setGrindAdjustPct(50 + Math.round((v - 50) * 0.4)); }} className="flex-1 h-1.5 accent-sky-500 max-w-48" />
              <span className="text-[10px] text-slate-400 font-medium w-16">Very Fast</span>
              <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${flowSuggestion > 0 ? 'text-emerald-700 bg-emerald-100 border-emerald-300' : flowSuggestion < 0 ? 'text-amber-700 bg-amber-100 border-amber-300' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                {flowSuggestion > 0 ? `Suggest ${flowSuggestion}% finer` : flowSuggestion < 0 ? `Suggest ${Math.abs(flowSuggestion)}% coarser` : 'Neutral'}
              </div>
            </div>
          </div>

          {/* Drawdown Rate Quick Entry */}
          <div className="col-span-2 md:col-span-3">
            <button type="button" onClick={() => setFlowTestOpen(v => !v)} className="text-[10px] font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1">
              <svg className={`w-3 h-3 transition-transform ${flowTestOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              Set drawdown rate (g/s)
            </button>
            {flowTestOpen && (
              <div className="mt-2 p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs space-y-2">
                <p className="text-[10px] text-slate-500">Measure how fast water passes through the <strong>empty</strong> dripper + paper (no coffee). This reflects the equipment's flow resistance, not your pour speed.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-slate-500">Drawdown Rate:</label>
                    <input type="number" step="0.1" min="0" max="25" value={drawdownRate} onChange={(e) => setDrawdownRate(Number(e.target.value))} className="w-16 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">g/s</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${
                    drawdownRate >= 15 ? 'text-purple-700 bg-purple-100' :
                    drawdownRate >= 8 ? 'text-emerald-700 bg-emerald-100' :
                    drawdownRate >= 4 ? 'text-amber-700 bg-amber-100' :
                    'text-red-700 bg-red-100'
                  }`}>
                    {drawdownRate >= 15 ? 'Ultra-Fast' : drawdownRate >= 8 ? 'Standard Fast' : drawdownRate >= 4 ? 'Medium-Slow' : 'Highly Restrictive'}
                  </span>
                  <button type="button" onClick={() => {
                    const speed = Math.min(100, Math.max(0, Math.round((drawdownRate / 20) * 100)));
                    setFlowSpeed(speed);
                    setGrindAdjustPct(50 + Math.round((speed - 50) * 0.4));
                    setFlowTestOpen(false);
                  }} className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-sky-300 text-sky-700 bg-white hover:bg-sky-50">
                    Apply
                  </button>
                </div>
                <div className={`text-[10px] px-2 py-1.5 rounded ${
                  drawdownRate >= 15 ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                  drawdownRate >= 8 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                  drawdownRate >= 4 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                  'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {drawdownRate >= 15
                    ? 'Zero bypass resistance. Recommend finer grind or slower pour to prevent under-extraction.'
                    : drawdownRate >= 8
                      ? 'Ideal for modern pour-overs. Excellent clarity. Standard recipes recommended.'
                      : drawdownRate >= 4
                        ? 'High body, prone to heavy extraction. Minimise agitation/swirling to avoid stalling.'
                      : 'Dangerous clogging risk. Try a different filter paper brand or check if the dripper channels are blocked.'}
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Grinder Setup */}
      <section id="grinder-setup" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-3">Grinder Setup</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Grinder</label>
            <div className="flex items-center gap-1.5">
              <input type="text" value={grinderName} onChange={(e) => setGrinderName(e.target.value)} placeholder="e.g. Comandante C40" className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Power</label>
            <div className="flex gap-1">
              {(['hand', 'electric'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setGrinderPower(p)} className={`flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${grinderPower === p ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200'}`}>
                  {p === 'hand' ? '🖐 Hand' : '⚡ Electric'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Burr Type</label>
            <div className="flex gap-1">
              {(['conical', 'flat', 'blade'] as const).map((b) => (
                <button key={b} type="button" onClick={() => setGrinderBurr(b)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${grinderBurr === b ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200'}`}>
                  {b === 'conical' ? 'Conical' : b === 'flat' ? 'Flat' : 'Blade'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-0.5 col-span-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fines Tendency</label>
            <div className="flex items-center gap-2">
              {(['low', 'medium', 'high'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFinesTendency(f)} className={`flex-1 px-2 py-1.5 text-[11px] font-bold rounded-lg border transition-colors ${finesTendency === f ? f === 'low' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : f === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                  {f === 'low' ? '↘ Low' : f === 'medium' ? '→ Med' : '↗ High'}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 md:col-span-3">
            <div className={`p-2 rounded-lg text-[10px] leading-relaxed border ${
              finesTendency === 'low' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              finesTendency === 'medium' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-red-50 border-red-200 text-red-700'
            }`}>
              {finesTendency === 'low' && '⚫ Low fines — clean bed, predictable flow, consistent extractions.'}
              {finesTendency === 'medium' && '⚫ Moderate fines — slight channeling risk on fast pours. Keep agitation moderate.'}
              {finesTendency === 'high' && '⚫ High fines — clogging risk, stalled brews, uneven extraction. Coarsen or reduce agitation.'}
              {grinderBurr === 'flat' && finesTendency === 'high' && ' Worn flat burrs may cause this — consider replacement.'}
              {grinderBurr === 'blade' && ' Blade grinders produce very uneven particle sizes. Consistent dosing is difficult.'}
            </div>
          </div>
          <div className="col-span-2 md:col-span-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Particle Size</label>
              <div className="flex items-center gap-2">
                {targetRange && (
                  <span className="text-[9px] text-slate-400 font-medium">
                    {targetRange.min}–{targetRange.max}µm
                  </span>
                )}
                <span className="text-xs font-bold text-amber-700 tabular-nums">{grinderMicron} µm</span>
              </div>
            </div>
            {/* Slider with target zone overlay */}
            <div className="relative">
              <input type="range" min={200} max={1400} step={25} value={grinderMicron} onChange={(e) => setGrinderMicron(parseInt(e.target.value))} className="w-full h-1.5 accent-amber-500 relative z-10" />
              {targetRange && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ height: '6px' }}>
                  <div
                    className="absolute h-full rounded-full bg-emerald-300/40 border-x border-emerald-400/50"
                    style={{ left: `${((targetRange.min - 200) / 1200) * 100}%`, width: `${((targetRange.max - targetRange.min) / 1200) * 100}%` }}
                  />
                </div>
              )}
            </div>
            {/* Target method pills */}
            <div className="flex flex-wrap gap-1">
              {MICRON_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setTargetMethod(targetMethod === r.id ? null : r.id);
                    setGrinderMicron(r.mid);
                  }}
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    targetMethod === r.id
                      ? 'bg-amber-100 text-amber-700 border-amber-300'
                      : micronGuide.id === r.id
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200'
                  }`}
                >
                  {r.label} <span className="text-[8px] opacity-70">{r.min}–{r.max}</span>
                </button>
              ))}
            </div>
            {/* Current guide + target info */}
            <div className="flex items-start gap-2">
              <div className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-semibold border ${micronGuide.color}`}>
                Current: {micronGuide.label} — {micronGuide.note}
              </div>
              {targetRange && (
                <div className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 whitespace-nowrap">
                  Target: {targetRange.min}–{targetRange.max}µm
                  {grinderMicron < targetRange.min && ` (${targetRange.min - grinderMicron}µm finer)`}
                  {grinderMicron > targetRange.max && ` (${grinderMicron - targetRange.max}µm coarser)`}
                  {grinderMicron >= targetRange.min && grinderMicron <= targetRange.max && ' ✓ in range'}
                </div>
              )}
            </div>
          </div>
          {/* Calibration: grind # ↔ micron */}
          <div className="col-span-2 md:col-span-3 border-t border-slate-100 pt-3 mt-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Calibration</span>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-slate-400">Grind #</label>
                <input type="number" min={0} max={100} value={calGrindDraft} onChange={(e) => setCalGrindDraft(e.target.value)} onBlur={() => { const v = parseInt(calGrindDraft); if (isNaN(v) || v < 0) setCalGrindDraft('0'); else setCalGrindDraft(String(v)); }} className="w-12 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-slate-400">µm</label>
                <input type="number" min={200} max={1400} step={25} value={calMicronDraft} onChange={(e) => setCalMicronDraft(e.target.value)} onBlur={() => { const v = parseInt(calMicronDraft); if (isNaN(v) || v < 200) setCalMicronDraft('800'); else if (v > 1400) setCalMicronDraft('1400'); else setCalMicronDraft(String(v)); }} className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <button type="button" onClick={() => {
                const g = parseInt(calGrindDraft);
                const m = parseInt(calMicronDraft);
                if (isNaN(g) || isNaN(m) || g < 0 || m < 200) return;
                const updated = [...grinderCalibration, { grindNum: g, micron: m }];
                setGrinderCalibration(updated);
                localStorage.setItem('belkaGrinderCal', JSON.stringify(updated));
                setCalGrindDraft('0');
                setCalMicronDraft('800');
              }} className="px-3 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">Record</button>
            </div>
            {grinderCalibration.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[...grinderCalibration].reverse().map((c, i) => {
                  const range = MICRON_RANGES.find(r => c.micron >= r.min && c.micron < r.max) ?? MICRON_RANGES[MICRON_RANGES.length - 1];
                  return (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] tabular-nums">
                      <span className="font-semibold text-slate-600">#{c.grindNum}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-amber-700 font-bold">{c.micron}µm</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-[9px] text-slate-500">{range.label}</span>
                      <button type="button" onClick={() => { recipePlanRef.current?.setGrindCalibration(c.grindNum, c.micron); document.getElementById('recipe-pour-planning')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100" title="Send to Recipe">→ Recipe</button>
                      <button type="button" onClick={() => {
                        const idx = grinderCalibration.length - 1 - i;
                        const updated = grinderCalibration.filter((_, j) => j !== idx);
                        setGrinderCalibration(updated);
                        localStorage.setItem('belkaGrinderCal', JSON.stringify(updated));
                      }} className="text-red-400 hover:text-red-600 text-[9px] font-bold px-0.5">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Dialing Range */}
          <div className="col-span-2 md:col-span-3 border-t border-slate-100 pt-3 mt-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Dialing Range</span>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-slate-400">#</label>
                <input type="number" min={0} step={1} value={dialRangeMin > 0 ? dialRangeMin : ''} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value) || 0); setDialRangeMin(v); localStorage.setItem('belkaDialRangeMin', String(v)); }} placeholder="min" className="w-12 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <span className="text-slate-300 text-[10px]">→</span>
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-slate-400">#</label>
                <input type="number" min={0} step={1} value={dialRangeMax > 0 ? dialRangeMax : ''} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value) || 0); setDialRangeMax(v); localStorage.setItem('belkaDialRangeMax', String(v)); }} placeholder="max" className="w-12 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              {dialRangeMin > 0 && dialRangeMax > 0 && (
                <span className="text-[9px] text-emerald-600 font-semibold">Active search zone: #{dialRangeMin}–#{dialRangeMax}</span>
              )}
            </div>
            {dialRangeMin > 0 && dialRangeMax > 0 && dialRangeMax > dialRangeMin && (() => {
              const total = dialRangeMax - dialRangeMin;
              const steps = Array.from({ length: total + 1 }, (_, i) => dialRangeMin + i);
              return (
                <div className="mt-2 flex items-center gap-0.5">
                  {steps.map(s => {
                      return (
                      <div key={s} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className={`w-full h-2 rounded-sm ${s === 14 || s === 16 ? 'bg-emerald-400' : s >= 14 && s <= 16 ? 'bg-emerald-300' : s < 14 ? 'bg-sky-300' : 'bg-amber-300'}`} />
                        <span className={`text-[8px] font-bold tabular-nums ${s >= 14 && s <= 16 ? 'text-emerald-700' : 'text-slate-400'}`}>#{s}</span>
                        {s === 14 && <span className="text-[7px] text-emerald-600 font-bold">◀ finest</span>}
                        {s === 16 && <span className="text-[7px] text-emerald-600 font-bold">coarsest ▶</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          {/* Save / Load profiles */}
          <div className="col-span-2 md:col-span-3 border-t border-slate-100 pt-3 mt-1">
            <div className="flex items-center gap-2 mb-2">
              <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} placeholder="Profile name..." className="flex-1 max-w-40 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <button type="button" onClick={() => {
                const name = profileNameInput.trim();
                if (!name) return;
                const updated = { ...grinderProfiles, [name]: { name: grinderName, power: grinderPower, burr: grinderBurr, fines: finesTendency, micron: grinderMicron } };
                setGrinderProfiles(updated);
                localStorage.setItem('belkaGrinderProfiles', JSON.stringify(updated));
                setProfileNameInput('');
              }} disabled={!profileNameInput.trim()} className="px-3 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40">Save</button>
              {Object.keys(grinderProfiles).length > 0 && (
                <span className="text-[9px] text-slate-400 ml-1">{Object.keys(grinderProfiles).length} saved</span>
              )}
            </div>
            {Object.keys(grinderProfiles).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(grinderProfiles).map(([key, p]) => (
                  <div key={key} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px]">
                    <button type="button" onClick={() => {
                      setGrinderName(p.name);
                      setGrinderPower(p.power as 'hand' | 'electric');
                      setGrinderBurr(p.burr as 'conical' | 'flat' | 'blade');
                      setFinesTendency(p.fines as 'low' | 'medium' | 'high');
                      setGrinderMicron(p.micron);
                    }} className="font-semibold text-slate-700 hover:text-amber-600">{key}</button>
                    <button type="button" onClick={() => {
                      const updated = { ...grinderProfiles };
                      delete updated[key];
                      setGrinderProfiles(updated);
                      localStorage.setItem('belkaGrinderProfiles', JSON.stringify(updated));
                    }} className="text-red-400 hover:text-red-600 text-[9px] font-bold px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bean Profile */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-3">Bean Profile</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">

          {/* Roast Level Slider */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Roast Level</label>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                {roastLevel <= 16 ? 'Nordic' : roastLevel <= 33 ? 'Light' : roastLevel <= 50 ? 'Light-Medium' : roastLevel <= 66 ? 'Medium' : roastLevel <= 83 ? 'Medium-Dark' : 'Dark'}
              </span>
            </div>
            <div className="relative h-7 flex items-center">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden" style={{background: 'linear-gradient(to right, #D4A76A, #C4915E, #A66E3E, #8B5E3C, #6B3F1F, #3B1E08)'}} />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-white/30" style={{width: `${100 - roastLevel}%`, marginLeft: 'auto'}} />
              </div>
              <input type="range" min="0" max="100" value={roastLevel} onChange={(e) => setRoastLevel(Number(e.target.value))} className="bean-slider absolute inset-x-0 w-full z-10" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-0 pointer-events-none" style={{zIndex: 5}}>
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                <div className="w-0.5 h-3 bg-white/60 rounded-full" />
              </div>
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 px-0">
              <span>Nordic</span>
              <span>Light</span>
              <span>Lt-Med</span>
              <span>Medium</span>
              <span>Med-Dk</span>
              <span>Dark</span>
            </div>
          </div>

          {/* Density Slider */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Density</label>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {density <= 33 ? 'Low' : density <= 66 ? 'Medium' : 'High'}
              </span>
            </div>
            <div className="relative h-7 flex items-center">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full" style={{background: 'linear-gradient(to right, #A8D5BA, #6BBF8A, #2D8B57)'}} />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-white/30" style={{width: `${100 - density}%`, marginLeft: 'auto'}} />
              </div>
              <input type="range" min="0" max="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="bean-slider absolute inset-x-0 w-full z-10" />
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 px-0.5">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          {/* Altitude Slider */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Altitude</label>
              <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">{altitude}m</span>
            </div>
            <div className="relative h-7 flex items-center">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full" style={{background: 'linear-gradient(to right, #93C5FD, #3B82F6, #1E3A5F)'}} />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-white/30" style={{width: `${100 - (altitude / 2500 * 100)}%`, marginLeft: 'auto'}} />
              </div>
              <input type="range" min="0" max="2500" step="50" value={altitude} onChange={(e) => setAltitude(Number(e.target.value))} className="bean-slider absolute inset-x-0 w-full z-10" />
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 px-0.5">
              <span>0m</span>
              <span>1250m</span>
              <span>2500m</span>
            </div>
          </div>

          {/* Process */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Process</label>
            <select value={process} onChange={(e) => setProcess(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="washed">Washed</option>
              <option value="natural">Natural</option>
              <option value="honey">Honey</option>
              <option value="anaerobic">Anaerobic</option>
              <option value="lactic">Lactic</option>
              <option value="thermal-shock">Thermal Shock</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Origin */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Origin</label>
            <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Ethiopia" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {/* Defects */}
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 block">Defects</label>
            <div className="flex flex-wrap gap-1.5">
              {DEFECT_OPTIONS.map(d => (
                <button key={d.id} type="button" onClick={() => toggleDefect(d.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                    defects.includes(d.id)
                      ? 'bg-red-50 text-red-700 border-red-300 shadow-sm'
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-500'
                  }`}
                >
                  {defects.includes(d.id) ? '✓ ' : ''}{d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Status Effects */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-indigo-800 uppercase tracking-wider mb-3">Status Effects</h3>
        <div className="flex flex-wrap gap-2">
          {/* Brewer perk */}
          <div className="flex-1 min-w-[140px] bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-lg p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">☕</span>
              <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">{brewerType}</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {brewerType === 'V60' ? 'Fast flow, high clarity — precise technique needed' :
               brewerType === 'Chemex' ? 'Thick filter, clean cup — slightly coarser grind' :
               brewerType === 'Kalita Wave' ? 'Flat bottom, forgiving — even extraction' :
               brewerType === 'Aeropress' ? 'Versatile, short brew — fine grind works' :
               brewerType === 'French Press' ? 'Full body, immersion — coarse grind, long steep' :
               brewerType === 'Espresso' ? 'High pressure — very fine grind required' :
               'Standard brew method'}
            </p>
          </div>

          {/* Drawdown perk */}
          <div className={`flex-1 min-w-[140px] bg-gradient-to-br rounded-lg p-2.5 border ${
            flowSpeed >= 70 ? 'from-purple-50 to-fuchsia-50 border-purple-200' :
            flowSpeed >= 40 ? 'from-emerald-50 to-teal-50 border-emerald-200' :
            flowSpeed >= 20 ? 'from-amber-50 to-orange-50 border-amber-200' :
            'from-red-50 to-rose-50 border-red-200'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">💧</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Drawdown</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {flowSpeed >= 70 ? 'Very fast flow — finer grind to prevent under-extraction' :
               flowSpeed >= 40 ? 'Standard flow — balanced extraction expected' :
               flowSpeed >= 20 ? 'Slow flow — minimise agitation, avoid stalling' :
               'Highly restrictive — check filter paper, risk of clogging'}
            </p>
          </div>

          {/* Roast perk */}
          <div className={`flex-1 min-w-[140px] bg-gradient-to-br rounded-lg p-2.5 border ${
            roastLevel <= 33 ? 'from-amber-50 to-yellow-50 border-amber-200' :
            roastLevel <= 66 ? 'from-orange-50 to-amber-50 border-orange-200' :
            'from-stone-50 to-amber-50 border-stone-300'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">🔥</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Roast</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {roastLevel <= 16 ? 'Nordic — very light, requires finer grind + higher water temp' :
               roastLevel <= 33 ? 'Light — needs finer grind, bright acidity' :
               roastLevel <= 50 ? 'Light-Medium — balanced approach' :
               roastLevel <= 66 ? 'Medium — standard extraction' :
               roastLevel <= 83 ? 'Medium-Dark — slightly coarser, lower temp' :
               'Dark — coarse grind, low temp to avoid bitterness'}
            </p>
          </div>

          {/* Density perk */}
          <div className={`flex-1 min-w-[140px] bg-gradient-to-br rounded-lg p-2.5 border ${
            density >= 67 ? 'from-emerald-50 to-green-50 border-emerald-200' :
            density >= 34 ? 'from-teal-50 to-emerald-50 border-teal-200' :
            'from-lime-50 to-green-50 border-lime-200'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">⚖️</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Density</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {density >= 67 ? 'High — hard bean, requires finer grind + more heat' :
               density >= 34 ? 'Medium — standard density, normal approach' :
               'Low — soft bean, coarser grind, less agitation'}
            </p>
          </div>

          {/* Altitude perk */}
          <div className={`flex-1 min-w-[140px] bg-gradient-to-br rounded-lg p-2.5 border ${
            altitude >= 1800 ? 'from-sky-50 to-blue-50 border-sky-200' :
            altitude >= 800 ? 'from-cyan-50 to-sky-50 border-cyan-200' :
            'from-slate-50 to-gray-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">⛰️</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Altitude</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {altitude >= 1800 ? 'High — dense bean structure, complex sugars, finer grind' :
               altitude >= 800 ? 'Medium — standard elevation bean' :
               'Low — softer bean, less complex'}
            </p>
          </div>

          {/* Process perk */}
          <div className="flex-1 min-w-[140px] bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">🧪</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">{process}</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {process === 'washed' ? 'Clean, bright — standard extraction approach' :
               process === 'natural' ? 'Fruity, heavy body — more soluble, less agitation' :
               process === 'honey' ? 'Sweet, balanced — standard approach' :
               process === 'anaerobic' ? 'Fermented, complex — careful temperature control' :
               process === 'lactic' ? 'Bright fermentation — coarser grind recommended' :
               process === 'thermal-shock' ? 'Delicate processing — handle with care' :
               'Unknown profile — start standard and adjust'}
            </p>
          </div>

          {/* Fines perk */}
          <div className={`flex-1 min-w-[140px] bg-gradient-to-br rounded-lg p-2.5 border ${
            finesTendency === 'low' ? 'from-emerald-50 to-green-50 border-emerald-200' :
            finesTendency === 'medium' ? 'from-amber-50 to-yellow-50 border-amber-200' :
            'from-red-50 to-rose-50 border-red-200'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">⚫</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Fines</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {finesTendency === 'low' ? 'Clean particle distribution — predictable flow, even extraction.' :
               finesTendency === 'medium' ? 'Moderate fines — watch for slow drawdown on light roasts.' :
               'High fines — significant clogging risk, grind coarser or use slower pour.'}
            </p>
          </div>

          {/* Defect penalties */}
          {defects.length > 0 && (
            <div className="w-full bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-lg p-2.5">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs">⚠️</span>
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">{defects.length} Defect{defects.length > 1 ? 's' : ''} Detected</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {defects.map(id => {
                  const d = DEFECT_OPTIONS.find(o => o.id === id);
                  return <span key={id} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-600">{d?.label ?? id}</span>;
                })}
              </div>
              <p className="text-[9px] text-red-500 mt-1 leading-tight">
                Defects reduce extraction quality. Consider tightening grind or cupping to identify off-flavours before brewing.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Brew Time */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">⏱️ Brew Time</h3>

        {/* Target | Diff | Actual side by side */}
        <div className="flex items-stretch gap-2 mb-2">
          {/* Target */}
          <div className="flex-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col items-center justify-center">
            <label className="text-[9px] uppercase tracking-wider text-amber-600 font-semibold mb-1">Target</label>
            <div className="flex items-center gap-0.5">
              <input type="number" min={0} max={4} step={1} value={Math.floor(brewTimeSec / 60)} onChange={(e) => setBrewTimeSec(Math.min(240, Math.max(0, Number(e.target.value) * 60 + (brewTimeSec % 60))))} className="w-12 px-1 py-1.5 text-sm border border-amber-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-bold" />
              <span className="text-sm text-amber-400 font-bold px-0.5">:</span>
              <input type="number" min={0} max={55} step={5} value={brewTimeSec % 60} onChange={(e) => setBrewTimeSec(Math.min(240, Math.max(0, Math.floor(brewTimeSec / 60) * 60 + Number(e.target.value))))} className="w-12 px-1 py-1.5 text-sm border border-amber-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-bold" />
            </div>
          </div>

          {/* Diff */}
          <div className="flex items-center justify-center min-w-[60px]">
            {brewActualSec !== null ? (
              <div className={`text-center px-2 py-1 rounded-lg border ${
                Math.abs(brewActualSec - brewTimeSec) <= 15 ? 'bg-emerald-50 border-emerald-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <div className={`text-sm font-black tabular-nums ${
                  Math.abs(brewActualSec - brewTimeSec) <= 15 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {brewActualSec === brewTimeSec ? '0' :
                   brewActualSec < brewTimeSec ? `-${brewTimeSec - brewActualSec}` : `+${brewActualSec - brewTimeSec}`}
                </div>
                <div className="text-[8px] text-slate-400 uppercase tracking-wider">sec</div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-300 font-bold">→</div>
            )}
          </div>

          {/* Actual */}
          <div className="flex-1 p-2.5 bg-sky-50 border border-sky-200 rounded-lg flex flex-col items-center justify-center">
            <label className="text-[9px] uppercase tracking-wider text-sky-600 font-semibold mb-1">Actual</label>
            <div className="flex items-center gap-0.5">
              <input type="number" min={0} max={4} step={1} value={brewActualSec !== null ? Math.floor(brewActualSec / 60) : ''} onChange={(e) => setBrewActualSec(e.target.value !== '' ? Math.min(240, Math.max(0, Number(e.target.value) * 60 + ((brewActualSec ?? 0) % 60))) : null)} className="w-12 px-1 py-1.5 text-sm border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white font-bold placeholder:text-slate-300" placeholder="-" />
              <span className="text-sm text-sky-400 font-bold px-0.5">:</span>
              <input type="number" min={0} max={55} step={5} value={brewActualSec !== null ? brewActualSec % 60 : ''} onChange={(e) => setBrewActualSec(e.target.value !== '' ? Math.min(240, Math.max(0, Math.floor((brewActualSec ?? 0) / 60) * 60 + Number(e.target.value))) : null)} className="w-12 px-1 py-1.5 text-sm border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white font-bold placeholder:text-slate-300" placeholder="--" />
            </div>
          </div>
        </div>

        {/* Import to Pour Plan */}
        <div className="flex justify-center mb-2">
          <button type="button" onClick={() => {
            recipePlanRef.current?.setFinishTime(brewTimeSec);
          }} className="text-[9px] font-medium text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded transition-all flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            Send to Pour Plan
          </button>
        </div>

        {/* Like/Dislike — shown when actual is filled */}
        {brewActualSec !== null && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <button type="button" onClick={() => setBrewLiked(brewLiked === true ? null : true)}
              className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${
                brewLiked === true ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-emerald-200 hover:text-emerald-500'
              }`}>
              👍 Like
            </button>
            <button type="button" onClick={() => setBrewLiked(brewLiked === false ? null : false)}
              className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${
                brewLiked === false ? 'bg-red-100 text-red-700 border-red-300 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-500'
              }`}>
              👎 Don't Like
            </button>
          </div>
        )}

        {/* Diagnosis: plan failed or execution failed? */}
        {brewActualSec !== null && brewLiked !== null && !brewLiked && (
          <div className="mb-3 p-2.5 rounded-lg border text-[10px] space-y-1 bg-red-50 border-red-200">
            <div className="font-bold text-red-700 uppercase tracking-wider text-[9px]">☕ Coffee was bad — why?</div>
            {Math.abs(brewActualSec - brewTimeSec) <= 10 ? (
              <div className="text-red-600">
                <strong>Planning issue.</strong> You hit your target ({Math.floor(brewTimeSec / 60)}:{String(brewTimeSec % 60).padStart(2, '0')}) but didn't like the result.
                The target time itself doesn't work for this bean. Try a different brew time:
                {brewTimeSec < 180 ? ' go slower (finer grind) for more body.' : ' go faster (coarser grind) for more clarity.'}
              </div>
            ) : (
              <>
              <div className="text-red-600">
                <strong>Execution issue.</strong> You missed your target by {Math.abs(brewActualSec - brewTimeSec)}s
                (planned {Math.floor(brewTimeSec / 60)}:{String(brewTimeSec % 60).padStart(2, '0')}, got {Math.floor(brewActualSec / 60)}:{String(brewActualSec % 60).padStart(2, '0')}).
                {brewActualSec < brewTimeSec
                  ? ` Finished faster than planned — grind was too coarse. Next time grind finer by ${Math.abs(Math.round((brewActualSec - brewTimeSec) * 0.3))}% to hit your target.`
                  : ` Finished slower than planned (${Math.abs(brewActualSec - brewTimeSec)}s). Possible causes:`}
              </div>
              {brewActualSec > brewTimeSec && (
                <ul className="text-[9px] text-red-600 list-disc pl-4 space-y-0.5">
                  <li>Clogging from too fine grind — <strong>first remedy: grind coarser by {Math.abs(Math.round((brewActualSec - brewTimeSec) * 0.3))}%</strong></li>
                  <li>Too much fine particles (fines migration)</li>
                  <li>Excessive agitation or turbulence during pour</li>
                </ul>
              )}
              </>
            )}
            <div className="text-[9px] text-red-400 pt-0.5">Fix the target first. Then dial grind to hit it. Confirm with TDS.</div>
          </div>
        )}
        {brewActualSec !== null && brewLiked !== null && brewLiked && Math.abs(brewActualSec - brewTimeSec) > 10 && (
          <div className="mb-3 p-2.5 rounded-lg border text-[10px] bg-emerald-50 border-emerald-200">
            <div className="text-emerald-700">
              <strong>Note:</strong> You liked the result even though you missed your target by {Math.abs(brewActualSec - brewTimeSec)}s.
              Consider updating your target time to {Math.floor(brewActualSec / 60)}:{String(brewActualSec % 60).padStart(2, '0')} — that's what actually worked.
            </div>
          </div>
        )}

        {/* Link diagram: Equipment → Brew Time → Taste Profile → Grind */}
        <div className="flex items-stretch gap-1 text-[9px] mb-3">
          <div className="flex-1 p-2 bg-sky-50 border border-sky-200 rounded-lg text-center">
            <div className="font-bold text-sky-700 uppercase tracking-wider mb-0.5">Equipment</div>
            <div className="text-slate-500">
              {flowSpeed >= 70 ? 'Fast drawdown' : flowSpeed >= 40 ? 'Standard drawdown' : flowSpeed >= 20 ? 'Slow drawdown' : 'Restrictive'}
              <br />{brewerType}
            </div>
          </div>
          <div className="flex items-center text-slate-300 text-base px-0.5">→</div>
          <div className="flex-1 p-2 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <div className="font-bold text-amber-700 uppercase tracking-wider mb-0.5">Brew Time</div>
            <div className="text-slate-500">
              {Math.floor(brewTimeSec / 60)}:{String(brewTimeSec % 60).padStart(2, '0')}
            </div>
          </div>
          <div className="flex items-center text-slate-300 text-base px-0.5">→</div>
          <div className="flex-1 p-2 bg-orange-50 border border-orange-200 rounded-lg text-center">
            <div className="font-bold text-orange-700 uppercase tracking-wider mb-0.5">Taste Profile</div>
            <div className="text-slate-500">
              {brewTimeSec < 120 ? 'Bright, sour, tea-like' :
               brewTimeSec < 150 ? 'Light body, high acidity' :
               brewTimeSec < 180 ? 'Mild, juicy acidity' :
               brewTimeSec < 210 ? 'Balanced, rounded' :
               brewTimeSec < 240 ? 'Heavy body, low acidity' :
               'Bitter, astringent, flat'}
            </div>
          </div>
          <div className="flex items-center text-slate-300 text-base px-0.5">→</div>
          <div className="flex-1 p-2 bg-purple-50 border border-purple-200 rounded-lg text-center">
            <div className="font-bold text-purple-700 uppercase tracking-wider mb-0.5">Grind</div>
            <div className="text-slate-500">
              {(() => {
                const diff = 180 - brewTimeSec;
                if (Math.abs(diff) < 10) return 'No change';
                return diff > 0 ? `${Math.abs(Math.round(diff * 0.3))}% coarser` : `${Math.abs(Math.round(diff * 0.3))}% finer`;
              })()}
            </div>
          </div>
        </div>

        {/* Sensory + TDS check advice */}
        <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <span>
            {(() => {
              if (brewTimeSec < 120) return '⏱️ Targeting 1:00 — fast brew, grind coarser for bright, light-bodied coffee. Check TDS to confirm extraction.';
              if (brewTimeSec < 150) return '⏱️ Targeting fast finish — coarser grind, expect lighter body and higher acidity. Verify with TDS.';
              if (brewTimeSec < 180) return '⏱️ Slightly fast — mild coarser grind, expect juicy acidity. Check TDS to dial in.';
              if (brewTimeSec < 210) return '⏱️ Mid-range target — standard grind, balanced profile. Use TDS to confirm.';
              if (brewTimeSec < 240) return '⏱️ Slower target — finer grind, expect heavier body. Check TDS to avoid over-extraction.';
              return '⏱️ Targeting 4:00+ — fine grind, expect heavy body. Risk of bitterness — check TDS carefully.';
            })()}
          </span>
        </div>
      </section>

      {/* Bean Grind Guidance */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        {(() => {
          const totalPct = Math.round(beanAdvice.overall * 0.3);
          const absPct = Math.abs(totalPct);
          const isFiner = totalPct < 0;
          const isCoarser = totalPct > 0;
          const severity = absPct === 0 ? 'none' : absPct <= 3 ? 'slight' : absPct <= 7 ? 'moderate' : absPct <= 12 ? 'notable' : absPct <= 20 ? 'significant' : 'major';
          const clickEstimate = absPct === 0 ? '' : absPct <= 3 ? '~1' : absPct <= 7 ? '2-3' : absPct <= 12 ? '4-5' : absPct <= 20 ? '6-8' : '8+';
          const zoneWidth = 20;
          const markerPos = (beanAdvice.overall + 100) / 2;
          const activeZone = markerPos < 20 ? 0 : markerPos < 40 ? 1 : markerPos < 60 ? 2 : markerPos < 80 ? 3 : 4;
          const zoneColors = ['bg-blue-500', 'bg-blue-300', 'bg-slate-300', 'bg-amber-300', 'bg-amber-500'];
          const zoneGlow = ['shadow-blue-400/40', 'shadow-blue-300/30', 'shadow-slate-300/20', 'shadow-amber-300/30', 'shadow-amber-400/40'];
          const zoneNames = ['Much Finer', 'Finer', 'Neutral', 'Coarser', 'Much Coarser'];
          return (
            <div className={`mb-3 p-3 rounded-lg border ${
              isFiner ? 'bg-blue-50 border-blue-200' : isCoarser ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Total Grind Impact</span>
                {absPct > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isFiner ? 'bg-blue-100 text-blue-600' : isCoarser ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {absPct}%
                  </span>
                )}
              </div>
              {/* Headline: action + percentage tag */}
              <div className="flex items-center gap-2 mb-2">
                {totalPct !== 0 && (
                  <span className={`text-lg font-bold ${isFiner ? 'text-blue-500' : 'text-amber-500'}`}>
                    {isFiner ? '←' : '→'}
                  </span>
                )}
                <span className={`font-bold tracking-tight ${
                  severity === 'none' ? 'text-slate-500 text-sm' :
                  severity === 'slight' ? 'text-slate-600 text-sm' :
                  'text-base'
                } ${isFiner ? 'text-blue-700' : isCoarser ? 'text-amber-700' : 'text-slate-500'}`}>
                  {absPct === 0 ? 'Neutral — no adjustment needed' :
                   `${severity.charAt(0).toUpperCase() + severity.slice(1)} — ${clickEstimate} step${clickEstimate.includes('-') || clickEstimate.includes('+') ? 's' : ''} ${isFiner ? 'finer' : 'coarser'}`}
                </span>
              </div>

              {/* Five-zone gauge */}
              <div className="relative pt-1 pb-3">
                {/* Zone background track */}
                <div className="relative h-7 flex items-center">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full flex overflow-hidden">
                    {[0, 1, 2, 3, 4].map((z) => (
                      <div
                        key={z}
                        className={`h-full transition-all duration-300 ${
                          z === 0 ? 'bg-blue-200' :
                          z === 1 ? 'bg-blue-100' :
                          z === 2 ? 'bg-slate-100' :
                          z === 3 ? 'bg-amber-100' :
                          'bg-amber-200'
                        } ${activeZone === z ? 'opacity-100' : 'opacity-60'}`}
                        style={{ width: `${zoneWidth}%` }}
                      />
                    ))}
                  </div>
                  {/* Zone dividers */}
                  {[20, 40, 60, 80].map((pct) => (
                    <div
                      key={pct}
                      className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-slate-300/50"
                      style={{ left: `${pct}%` }}
                    />
                  ))}
                  {/* Marker */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 z-10 transition-all duration-300`}
                    style={{ left: `calc(${markerPos}% - 8px)` }}
                  >
                    <div className={`w-4 h-4 rotate-45 border-2 shadow-lg ${
                      zoneColors[activeZone]
                    } border-white ${zoneGlow[activeZone]}`} />
                  </div>
                </div>
                {/* Zone labels */}
                <div className="flex justify-between mt-1">
                  {zoneNames.map((name, i) => (
                    <span
                      key={name}
                      className={`text-[9px] font-semibold transition-all duration-300 ${
                        activeZone === i
                          ? i < 2 ? 'text-blue-600' : i > 2 ? 'text-amber-600' : 'text-slate-500'
                          : 'text-slate-300'
                      }`}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Factor Breakdown */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {[
            { label: 'Roast', score: beanAdvice.roastScore, max: 80, color: 'bg-amber-400' },
            { label: 'Density', score: beanAdvice.densityScore, max: 55, color: 'bg-emerald-400' },
            { label: 'Process', score: beanAdvice.processScore, max: 35, color: 'bg-violet-400' },
            { label: 'Altitude', score: beanAdvice.altitudeScore, max: 50, color: 'bg-sky-400' },
            { label: 'Flow Speed', score: beanAdvice.flowScore, max: 60, color: 'bg-rose-400' },
            { label: 'Brew Time', score: beanAdvice.brewTimeScore, max: 30, color: 'bg-slate-400' },
          ].map(({ label, score, max, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-medium w-12">{label}</span>
              <div className="flex-1 relative h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-full ${color} transition-all duration-300`}
                  style={{
                    left: score < 0 ? `${50 + score / (max * 2) * 100}%` : '50%',
                    width: `${Math.abs(score) / max * 50}%`,
                    opacity: 0.7,
                  }}
                />
                <div className={`absolute top-1/2 -translate-y-1/2 w-0 h-0 transition-all duration-300 ${
                  score < 0 ? 'border-r-[5px] border-r-blue-400 border-y-[4px] border-y-transparent' :
                  score > 0 ? 'border-l-[5px] border-l-amber-400 border-y-[4px] border-y-transparent' : ''
                }`} style={{
                  left: `${50 + Math.min(Math.max(score / max * 50, -45), 45)}%`,
                  display: score === 0 ? 'none' : 'block',
                }} />
              </div>
              <span className={`text-[10px] font-bold w-7 text-right tabular-nums ${
                score < 0 ? 'text-blue-500' : score > 0 ? 'text-amber-500' : 'text-slate-400'
              }`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Grind Adjustment Calculator */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Grind Adjustment</h3>
          {(() => {
            const suggested = Math.round(beanAdvice.overall * 0.3);
            return (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                suggested < 0 ? 'text-blue-600 bg-blue-50 border-blue-200' : suggested > 0 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-400 bg-slate-50 border-slate-200'
              }`}>
                Suggest {suggested === 0 ? 'neutral' : `${Math.abs(suggested)}% ${suggested < 0 ? 'finer' : 'coarser'}`}
              </span>
            );
          })()}
        </div>
        <div className="relative flex items-center gap-3">
          <span className="text-[10px] text-slate-400 font-medium w-12 text-right">Finer</span>
          <div className="relative flex-1 max-w-48">
            <input type="range" min={0} max={100} value={grindAdjustPct} onChange={(e) => setGrindAdjustPct(parseInt(e.target.value))} className="w-full h-1.5 accent-emerald-500 relative z-10" />
            {/* Suggested position marker */}
            {(() => {
              const suggested = Math.round(beanAdvice.overall * 0.3);
              const sugPct = 50 + suggested;
              return (
                <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300" style={{ left: `calc(${Math.min(100, Math.max(0, sugPct))}% - 3px)`, zIndex: 5 }}>
                  <div className={`w-1.5 h-4 rounded-sm ${
                    suggested < 0 ? 'bg-blue-400' : suggested > 0 ? 'bg-amber-400' : 'bg-slate-300'
                  }`} />
                </div>
              );
            })()}
          </div>
          <span className="text-[10px] text-slate-400 font-medium w-12">Coarser</span>
          <span className="text-xs font-bold text-slate-700 tabular-nums w-16 text-right">
            {grindAdjustPct < 33 ? 'Finer' : grindAdjustPct < 66 ? 'Neutral' : 'Coarser'} ({grindAdjustPct}%)
          </span>
        </div>
      </section>

      {/* Brew Impact */}
      <section className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Brew Impact</h3>
          {!symptom && (
            <span className="text-[10px] text-emerald-500 italic">{activeFactor ? 'Tap again to clear' : 'Tap a row to see ripple'}</span>
          )}
        </div>

        {/* Symptom selector */}
        <div className="flex flex-wrap gap-1 mb-3">
          {SYMPTOM_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSymptom(symptom === s.id ? null : s.id);
                setActiveFactor(null);
              }}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                symptom === s.id
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
              }`}
            >
              {s.label} {symptom === s.id && '✕'}
            </button>
          ))}
        </div>

        {/* Guidance mode */}
        {symptom && symptomGuide[symptom] && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Fix this</span>
              <span className="text-xs font-bold text-emerald-800">{SYMPTOM_OPTIONS.find(s => s.id === symptom)?.label}</span>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">{symptomGuide[symptom].advice}</p>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="font-bold text-emerald-700">→ {symptomGuide[symptom].rankLabel}:</span>
              <span className="font-bold text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-200">{symptomGuide[symptom].direction} {symptomGuide[symptom].magnitude}</span>
            </div>
          </div>
        )}

        {/* Factor rows */}
        <div className="space-y-1">
          {brewImpactFactors.map((f) => {
            const isGuided = symptom && symptomGuide[symptom]?.factor === f.rank;
            const isOther = symptom && !isGuided;
            const isActive = !symptom && activeFactor === f.rank;
            const isConnected = !symptom && activeFactor !== null && f.connects.includes(activeFactor);
            const connections = f.connects.length;
            return (
              <button
                type="button"
                key={f.rank}
                onClick={() => { if (!symptom) setActiveFactor(isActive ? null : f.rank); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all duration-200 ${
                  isGuided
                    ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_10px_rgba(52,211,153,0.35)]'
                    : isActive
                    ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                    : isConnected
                    ? 'border-emerald-300 bg-emerald-50/50 shadow-[0_0_4px_rgba(52,211,153,0.15)]'
                    : isOther
                    ? 'border-transparent opacity-30'
                    : 'border-transparent hover:bg-slate-50'
                }`}
                disabled={!!symptom}
              >
                <span className={`text-[11px] font-bold w-4 text-center transition-colors ${
                  isGuided ? 'text-emerald-600' : isActive ? 'text-emerald-600' : isConnected ? 'text-emerald-500' : 'text-slate-400'
                }`}>
                  {f.rank}
                </span>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${f.color} ${
                        isGuided ? 'opacity-100' : isActive ? 'opacity-100' : isConnected ? 'opacity-80' : 'opacity-60'
                      }`}
                      style={{ width: `${isGuided ? 100 : f.barPct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-semibold w-10 shrink-0 transition-colors ${
                    isGuided ? 'text-emerald-700' : isActive ? 'text-emerald-700' : isConnected ? 'text-emerald-600' : 'text-slate-500'
                  }`}>
                    {f.name}
                    {isGuided && <span className="ml-1 text-[9px] text-emerald-500">←</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.rank === 3 ? (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setWaterTemp(Math.max(80, waterTemp - 1)); }}
                        className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                      >−</button>
                      <span className="text-[11px] font-bold text-slate-700 tabular-nums w-7 text-center">{waterTemp}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setWaterTemp(Math.min(100, waterTemp + 1)); }}
                        className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                      >+</button>
                    </div>
                  ) : f.rank === 5 ? (
                    <div className="flex items-center gap-0.5">
                      {(['soft', 'medium', 'hard'] as const).map((wq) => (
                        <button
                          key={wq}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setWaterQuality(wq); }}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
                            waterQuality === wq
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {wq === 'soft' ? 'S' : wq === 'medium' ? 'M' : 'H'}
                        </button>
                      ))}
                    </div>
                  ) : f.rank === 6 ? (
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3].map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTurbulenceLevel(lv); }}
                          className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                            turbulenceLevel >= lv
                              ? 'bg-amber-400 border-amber-500'
                              : 'bg-slate-100 border-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className={`text-[11px] font-bold tabular-nums ${isGuided ? 'text-emerald-700' : 'text-slate-700'}`}>{f.value}</span>
                  )}
                  {!isOther && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${
                      connections > 0
                        ? isGuided || isActive || isConnected
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-400'
                        : 'text-slate-300'
                    }`}>
                      ↔{connections}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* TDS Target */}
      <section id="tds-target" className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <TDSHUD
          tdsMin={parseFloat(targetTDSMin) || 0}
          tdsMax={parseFloat(targetTDSMax) || 0}
          currentTDS={currentTDS}
          eyTarget={parseFloat(targetEY) || 0}
          onTDSChange={setCurrentTDS}
          scaTdsMin={tdsPlanRatio > 0 ? 18 / tdsPlanRatio : undefined}
          scaTdsMax={tdsPlanRatio > 0 ? 22 / tdsPlanRatio : undefined}
        />
        {tdsPlanRatio > 0 && (() => {
          const scaLo = 18 / tdsPlanRatio;
          const scaHi = 22 / tdsPlanRatio;
          const actualEY = currentTDS * tdsPlanRatio;
          const isUnder = currentTDS < scaLo;
          const isOver = currentTDS > scaHi;
          const tdsDelta = isUnder ? (scaLo - currentTDS) : isOver ? (currentTDS - scaHi) : 0;
          let advice = '';
          if (!isUnder && !isOver) advice = '✓ Your TDS is in the SCA gold cup zone for this ratio.';
          else if (isUnder) advice = `TDS is ${tdsDelta.toFixed(2)}% below SCA zone. Tighten ratio to 1:${(tdsPlanRatio - 1).toFixed(0)}, increase dose, or grind finer.`;
          else advice = `TDS is ${tdsDelta.toFixed(2)}% above SCA zone. Loosen ratio to 1:${(tdsPlanRatio + 1).toFixed(0)}, coarsen grind, or reduce dose.`;
          const statusLabel = isUnder ? 'UNDER' : isOver ? 'OVER' : '✓ IDEAL';
          const statusColor = isUnder ? 'text-sky-600 bg-sky-50 border-sky-200' : isOver ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200';
          return (
            <div className="px-4 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-start gap-4">
                {/* Target zone */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Target</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500">TDS</span>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{scaLo.toFixed(2)}–{scaHi.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500">EY</span>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">18.0–22.0%</span>
                    </div>
                  </div>
                </div>
                {/* Status badge */}
                <div className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                  {statusLabel} {tdsDelta > 0 && `+${tdsDelta.toFixed(2)}%`}
                </div>
              </div>
              {/* Your values */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="text-slate-500 tabular-nums">TDS <strong className={isUnder ? 'text-sky-600' : isOver ? 'text-red-600' : 'text-emerald-600'}>{currentTDS.toFixed(2)}%</strong></span>
                <span className="text-slate-500 tabular-nums">EY <strong className={isUnder ? 'text-sky-600' : isOver ? 'text-red-600' : 'text-emerald-600'}>{actualEY.toFixed(1)}%</strong></span>
                <span className="text-slate-400">at 1:{tdsPlanRatio}</span>
              </div>
              {/* Gap bar */}
              <div className="relative h-2 mt-2 mb-1 rounded-full bg-slate-100 overflow-hidden max-w-xs">
                <div className="absolute inset-y-0 bg-emerald-300/40 border-x border-emerald-400/50" style={{ left: `${Math.max(0, (scaLo - 0.7) / 1.4 * 100)}%`, width: `${Math.min(100, (scaHi - scaLo) / 1.4 * 100)}%` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-slate-600 transition-all duration-300" style={{ left: `${Math.max(0, Math.min(100, (currentTDS - 0.7) / 1.4 * 100))}%` }} />
              </div>
              {/* Advice */}
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{advice}</p>
            </div>
          );
        })()}
        <div className="bg-white/80 px-4 py-3 flex flex-col gap-3 text-xs border-t border-slate-200">
          {/* Ratio + EY — prominent focus */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Ratio</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-slate-600">1:</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.5}
                  value={tdsPlanRatio}
                  onChange={(e) => { const v = Math.min(30, Math.max(1, parseFloat(e.target.value) || 16)); setTdsPlanRatio(v); }}
                  className="w-14 px-1.5 py-1 text-sm font-bold text-sky-800 border-2 border-sky-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => { const r = parseFloat(localStorage.getItem('belkaBrewRatio') || '0'); if (r > 0) setTdsPlanRatio(r); }}
                  className="px-1.5 py-1 rounded-lg text-[9px] font-bold text-sky-600 bg-sky-50 border border-sky-200 hover:bg-sky-100"
                  title="Import from Recipe"
                >↻ Recipe</button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">EY</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.5}
                  min={10}
                  max={30}
                  value={targetEY}
                  onChange={(e) => setTargetEY(e.target.value)}
                  className="w-14 px-1.5 py-1 text-sm font-bold text-amber-800 border-2 border-amber-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white shadow-sm"
                />
                <span className="text-sm font-bold text-slate-400">%</span>
              </div>
            </div>
            {tdsPlanRatio > 0 && (() => {
              const ey = parseFloat(targetEY) || 20;
              const tdsFromEY = ey / tdsPlanRatio;
              const tdsLo = (tdsFromEY - 0.05).toFixed(2);
              const tdsHi = (tdsFromEY + 0.05).toFixed(2);
              return (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-400">TDS</span>
                  <span className="text-[9px] font-bold text-emerald-700 tabular-nums">{tdsLo}–{tdsHi}%</span>
                  <button type="button" onClick={() => { setTargetTDSMin(tdsLo); setTargetTDSMax(tdsHi); document.getElementById('recipe-pour-planning')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100">→ Plan</button>
                </div>
              );
            })()}
            {tdsPlanRatio > 0 && (() => {
              const scaLo = 18 / tdsPlanRatio;
              const scaHi = 22 / tdsPlanRatio;
              const scaWidth = (scaHi - scaLo) / 1.4 * 100;
              const scaLeft = Math.max(0, (scaLo - 0.7) / 1.4 * 100);
              const markerPct = Math.max(0, Math.min(100, (currentTDS - 0.7) / 1.4 * 100));
              const isUnder = currentTDS < scaLo;
              const isOver = currentTDS > scaHi;
              const delta = isUnder ? (scaLo - currentTDS) : isOver ? (currentTDS - scaHi) : 0;
              return (
                <div className="flex items-center gap-2">
                  {/* SCA zone mini-gauge */}
                  <div className="w-24 sm:w-32 relative h-3">
                    <div className="absolute inset-0 rounded-sm bg-slate-100 overflow-hidden">
                      <div className="absolute inset-0 flex">
                        <div className="h-full flex-1 bg-sky-100/50" />
                        <div className="h-full flex-1 bg-emerald-100/50" />
                        <div className="h-full flex-1 bg-red-100/50" />
                      </div>
                      {/* SCA band */}
                      <div
                        className="absolute top-0 bottom-0 bg-emerald-300/30 border-x border-emerald-400/40 transition-all duration-300"
                        style={{ left: `${scaLeft}%`, width: `${scaWidth}%` }}
                      />
                      {/* Marker */}
                      <div
                        className="absolute top-0 -translate-x-1/2 z-10 transition-all duration-300"
                        style={{ left: `${markerPct}%` }}
                      >
                        <div className={`w-2 h-4 rounded-sm border ${
                          isUnder ? 'bg-sky-400 border-sky-500' :
                          isOver ? 'bg-red-400 border-red-500' :
                          'bg-emerald-400 border-emerald-500'
                        } shadow-sm`} />
                      </div>
                    </div>
                    {/* Zone labels */}
                    <div className="flex justify-between text-[7px] text-slate-400 mt-px px-0.5">
                      <span>UNDER</span>
                      <span>SCA</span>
                      <span>OVER</span>
                    </div>
                  </div>
                  {/* Status text */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isUnder && !isOver ? (
                      <span className="text-emerald-700 font-bold text-[9px]">✓ SCA</span>
                    ) : (
                      <span className={`font-bold text-[9px] ${isUnder ? 'text-sky-600' : 'text-red-600'}`}>
                        {isUnder ? `${delta.toFixed(2)}% ↓` : `${delta.toFixed(2)}% ↑`}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { const ey = parseFloat(targetEY) || 20; const t = ey / tdsPlanRatio; setTargetTDSMin((t - 0.05).toFixed(2)); setTargetTDSMax((t + 0.05).toFixed(2)); }}
                      className="px-1.5 py-0.5 rounded text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                    >
                      Set TDS
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2">
            <div className="flex items-center gap-1">
              <label className="text-[9px] text-slate-400 font-medium">TDS Min</label>
              <input type="number" step={0.05} value={targetTDSMin} onChange={(e) => setTargetTDSMin(e.target.value)} className="w-14 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[9px] text-slate-400 font-medium">TDS Max</label>
              <input type="number" step={0.05} value={targetTDSMax} onChange={(e) => setTargetTDSMax(e.target.value)} className="w-14 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>

            {tdsPlanRatio > 0 && (() => {
              const actualEY = currentTDS * tdsPlanRatio;
              const scaLoEY = 18;
              const scaHiEY = 22;
              const inRange = actualEY >= scaLoEY && actualEY <= scaHiEY;
              const eyDelta = inRange ? 0 : actualEY < scaLoEY ? (scaLoEY - actualEY) : (actualEY - scaHiEY);
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-sky-700 font-semibold tabular-nums text-[10px]">
                    {currentTDS.toFixed(2)}% → <strong>{(actualEY).toFixed(1)}% EY</strong>
                  </span>
                  {eyDelta > 0 && (
                    <span className={`text-[9px] font-semibold ${actualEY < scaLoEY ? 'text-sky-600' : 'text-red-600'}`}>
                      {eyDelta.toFixed(1)}% {actualEY < scaLoEY ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Iced Drip Calculator */}
      <section className="bg-white border border-sky-200 rounded-xl p-4 shadow-sm">
        <button type="button" onClick={() => setIcedOpen(v => !v)} className="w-full flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider">🧊 Iced Drip Calculator</h3>
          <svg className={`w-4 h-4 text-sky-500 transition-transform ${icedOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {icedOpen && <><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Brew Calculation */}
          <div className="space-y-2">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-sky-200 pb-1.5">
              <button type="button" onClick={() => setIcedTab('ratio')} className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-t transition-colors ${icedTab === 'ratio' ? 'text-sky-800 bg-sky-100 border-b-2 border-sky-500' : 'text-slate-400 hover:text-sky-600'}`}>Coffee &amp; Ice</button>
              <button type="button" onClick={() => setIcedTab('ey')} className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-t transition-colors ${icedTab === 'ey' ? 'text-sky-800 bg-sky-100 border-b-2 border-sky-500' : 'text-slate-400 hover:text-sky-600'}`}>EY &amp; TDS Target</button>
            </div>

            {icedTab === 'ratio' ? (
              <>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                  <label className="text-slate-500 col-span-1">Dose</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={1} step={0.5} value={icedDose} onChange={(e) => setIcedDose(Number(e.target.value))} className="w-full px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">g</span>
                  </div>
                  <label className="text-slate-500 col-span-1">Ratio</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">1 :</span>
                    <input type="number" min={1} step={0.5} value={icedRatio} onChange={(e) => setIcedRatio(Number(e.target.value))} className="w-full px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  </div>
                  <label className="text-slate-500 col-span-1">Ice</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={0} max={100} step={1} value={icedIcePct} onChange={(e) => setIcedIcePct(Number(e.target.value))} className="w-16 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">% of water</span>
                  </div>
                </div>
                {(() => {
                  const totalWater = icedDose * icedRatio;
                  const ice = Math.round(totalWater * icedIcePct / 100);
                  const hotWater = totalWater - ice;
                  return (
                    <div className="p-2 bg-sky-50 border border-sky-200 rounded-lg text-xs space-y-0.5">
                      <div className="flex justify-between"><span className="text-slate-500">Total water</span><span className="font-bold tabular-nums">{totalWater.toFixed(0)}g</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Hot water</span><span className="font-bold tabular-nums text-amber-600">{hotWater.toFixed(0)}g</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Ice needed</span><span className="font-bold tabular-nums text-sky-600">{ice.toFixed(0)}g</span></div>
                      <div className="flex justify-between border-t border-sky-200 pt-0.5 mt-0.5"><span className="text-slate-500">Target bev.</span><span className="font-bold tabular-nums">{totalWater.toFixed(0)}g</span></div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                  <label className="text-slate-500 col-span-1">Target EY</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={0} step={0.5} value={icedEYmin} onChange={(e) => setIcedEYmin(Number(e.target.value))} className="w-12 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-300">—</span>
                    <input type="number" min={0} step={0.5} value={icedEYmax} onChange={(e) => setIcedEYmax(Number(e.target.value))} className="w-12 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                  <label className="text-slate-500 col-span-1">Final TDS</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={0} step={0.05} value={icedTargetFinalTDS ?? ''} onChange={(e) => setIcedTargetFinalTDS(e.target.value ? Number(e.target.value) : null)} placeholder="target" className="w-full px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400 placeholder:text-slate-300" />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                  <label className="text-slate-500 col-span-1">Dose</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={1} step={0.5} value={icedDose} onChange={(e) => setIcedDose(Number(e.target.value))} className="w-full px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">g</span>
                  </div>
                  <label className="text-slate-500 col-span-1">Ice</label>
                  <div className="col-span-2 flex items-center gap-1">
                    <input type="number" min={0} max={100} step={1} value={icedIcePct} onChange={(e) => setIcedIcePct(Number(e.target.value))} className="w-16 px-1.5 py-1 text-xs border border-sky-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <span className="text-[10px] text-slate-400">% of water</span>
                  </div>
                </div>
                {(() => {
                  const eyMid = (icedEYmin + icedEYmax) / 2;
                  const finalTDS = icedTargetFinalTDS ?? 1.2;
                  const optRatio = finalTDS > 0 ? eyMid / finalTDS : 15;
                  const totalWater = icedDose * optRatio;
                  const ice = Math.round(totalWater * icedIcePct / 100);
                  const hotWater = totalWater - ice;
                  const reqHotTDS = hotWater > 0 ? finalTDS * totalWater / hotWater : 0;
                  return (
                    <div className="p-2 bg-sky-50 border border-sky-200 rounded-lg text-xs space-y-0.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Optimal ratio</span>
                        <span className="font-bold tabular-nums text-indigo-600">1 : {optRatio.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between"><span className="text-slate-500">Total water</span><span className="font-bold tabular-nums">{totalWater.toFixed(0)}g</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Hot water</span><span className="font-bold tabular-nums text-amber-600">{hotWater.toFixed(0)}g</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Ice needed</span><span className="font-bold tabular-nums text-sky-600">{ice.toFixed(0)}g</span></div>
                      <div className="flex justify-between border-t border-sky-200 pt-0.5 mt-0.5">
                        <span className="text-slate-500">Req. hot TDS</span>
                        <span className="font-bold tabular-nums text-purple-600">{reqHotTDS.toFixed(2)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* TDS Dilution */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">TDS Dilution</h4>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <label className="text-slate-500 col-span-1">Hot TDS</label>
              <div className="col-span-2 flex items-center gap-1">
                {(() => {
                  const isUnder = icedHotTDS < 2.8;
                  const isOver = icedHotTDS > 3.4;
                  const isOff = isUnder || isOver;
                  return (
                    <>
                      <input type="number" min={0} step={0.05} value={icedHotTDS} onChange={(e) => setIcedHotTDS(Number(e.target.value))}
                        className={`w-full px-1.5 py-1 text-xs border-2 rounded text-center focus:outline-none focus:ring-2 ${
                          isOver ? 'border-red-400 bg-red-50 focus:ring-red-400' :
                          isUnder ? 'border-blue-400 bg-blue-50 focus:ring-blue-400' :
                          'border-sky-300 focus:ring-sky-400'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400">%</span>
                      {isOff && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
                          isOver ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-blue-100 text-blue-700 border border-blue-300'
                        }`}>
                          {isOver ? `↑ +${(icedHotTDS - 3.4).toFixed(2)}%` : `↓ ${(2.8 - icedHotTDS).toFixed(2)}%`}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className={`col-span-3 text-[9px] font-semibold -mt-1 ${icedHotTDS < 2.8 ? 'text-blue-600' : icedHotTDS > 3.4 ? 'text-red-600' : 'text-slate-400'}`}>
                {icedHotTDS < 2.8 ? `⚠ Under target — aim for 2.8–3.4% (concentrate for dilution)` :
                 icedHotTDS > 3.4 ? `⚠ Over target — aim for 2.8–3.4% (concentrate for dilution)` :
                 `✓ Target range: 2.8–3.4% (concentrate for dilution)`}
              </div>
            </div>
            {(() => {
              const totalWater = icedDose * icedRatio;
              const ice = Math.round(totalWater * icedIcePct / 100);
              const hotWater = totalWater - ice;
              const finalTDS = hotWater > 0 ? icedHotTDS * hotWater / totalWater : 0;
              return (
                <div className="p-2 bg-sky-50 border border-sky-200 rounded-lg text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Final TDS (diluted)</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-emerald-600">{finalTDS.toFixed(2)}%</span>
                      <span className="text-[8px] text-slate-400">info</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5 border-t border-sky-200 mt-0.5">
                    <span>Hot TDS <strong className="text-slate-500">{icedHotTDS.toFixed(2)}%</strong> at {hotWater > 0 ? (hotWater / totalWater * 100).toFixed(0) : 0}% dilution</span>
                  </div>
                </div>
              );
            })()}
            {/* EY ↔ TDS Goal Table */}
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">EY ↔ TDS Goal</span>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-slate-400">Target:</span>
                  <input type="number" min={0} step={0.5} value={icedEYmin} onChange={(e) => setIcedEYmin(Number(e.target.value))} className="w-10 px-1 py-0.5 text-[9px] border border-amber-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <span className="text-slate-300">—</span>
                  <input type="number" min={0} step={0.5} value={icedEYmax} onChange={(e) => setIcedEYmax(Number(e.target.value))} className="w-10 px-1 py-0.5 text-[9px] border border-amber-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <span className="text-slate-400">%</span>
                </div>
              </div>
              {(() => {
                const totalWater = icedDose * icedRatio;
                const hotWater = totalWater - Math.round(totalWater * icedIcePct / 100);
                const dose = icedDose;
                const lo = Math.max(10, icedEYmin);
                const hi = Math.min(30, icedEYmax);
                const eyValues: number[] = [];
                for (let v = lo; v <= hi; v++) eyValues.push(v);
                return (
                  <div className="grid grid-cols-7 gap-px bg-amber-200/60 rounded overflow-hidden" style={{gridTemplateColumns: '2fr 3fr 2fr'}}>
                    <div className="bg-amber-100/80 px-1.5 py-1 text-[9px] font-semibold text-amber-800 text-center">EY</div>
                    <div className="bg-amber-100/80 px-1.5 py-1 text-[9px] font-semibold text-amber-800 text-center">Hot Brew TDS</div>
                    <div className="bg-amber-100/80 px-1.5 py-1 text-[9px] font-semibold text-amber-800 text-center">Final TDS</div>
                    {eyValues.map(ey => {
                      const reqTDS = dose > 0 && hotWater > 0 ? ey * dose / hotWater / 100 : 0;
                      const finalTDS = totalWater > 0 ? reqTDS * hotWater / totalWater : 0;
                      const eyInTarget = ey >= icedEYmin && ey <= icedEYmax;
                      const tdsMatches = Math.abs(reqTDS * 100 - icedHotTDS) < 0.05;
                      return (
                        <React.Fragment key={ey}>
                          <div className={`px-1.5 py-1 text-center text-[9px] font-bold tabular-nums ${tdsMatches ? 'bg-amber-300 text-amber-900' : eyInTarget ? 'bg-white text-slate-700' : 'bg-white/60 text-slate-400'}`}>
                            {ey}%{tdsMatches ? ' ◀' : ''}
                          </div>
                          <div className={`px-1.5 py-1 text-center text-[9px] tabular-nums ${tdsMatches ? 'bg-amber-300 font-bold text-amber-900' : eyInTarget ? 'bg-white text-slate-600' : 'bg-white/60 text-slate-400'}`}>
                            {(reqTDS * 100).toFixed(2)}%
                          </div>
                          <div className={`px-1.5 py-1 text-center text-[9px] tabular-nums ${tdsMatches ? 'bg-amber-300 font-bold text-amber-900' : 'bg-white/60 text-slate-400'}`}>
                            {(finalTDS * 100).toFixed(2)}%
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()}
              {(() => {
                const totalWater = icedDose * icedRatio;
                const hotWater = totalWater - Math.round(totalWater * icedIcePct / 100);
                const ey = icedHotTDS / 100 * hotWater / icedDose * 100;
                const eyStatus = ey < icedEYmin ? 'Under' : ey > icedEYmax ? 'Over' : 'Ideal';
                return (
                  <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-amber-200">
                    <span className="text-slate-500">Current hot TDS <strong>{icedHotTDS.toFixed(2)}%</strong></span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold tabular-nums text-amber-700">{ey.toFixed(1)}% EY</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        eyStatus === 'Ideal' ? 'bg-emerald-100 text-emerald-700' :
                        eyStatus === 'Under' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{eyStatus}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Equilibrium: Hot Concentrate vs Final Beverage */}
        {(() => {
          const totalWater = icedDose * icedRatio;
          const ice = Math.round(totalWater * icedIcePct / 100);
          const hotWater = totalWater - ice;
          const hotLiquid = Math.max(0, hotWater - Math.round(icedDose * 2.5)); // ~2.5g water retained per g coffee
          const finalBev = hotLiquid + ice;
          const hotTDS = icedHotTDS;
          const finalTDS = finalBev > 0 ? hotTDS * hotLiquid / finalBev : 0;
          const extracted = hotLiquid * hotTDS / 100;
          const ey = icedDose > 0 ? extracted / icedDose * 100 : 0;
          const finalExtracted = finalBev * finalTDS / 100;
          const finalEY = icedDose > 0 ? finalExtracted / icedDose * 100 : 0;
          const matched = Math.abs(ey - finalEY) < 0.01;
          return (
            <div className="p-3 bg-gradient-to-r from-indigo-50 to-sky-50 border border-indigo-200 rounded-lg text-xs space-y-2 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">⚖️ Equilibrium — EY is the Same</span>
                <span className="text-[9px] text-indigo-500">EY% is conserved through dilution</span>
              </div>
              {(() => {
                const isUnder = icedHotTDS < 2.8;
                const isOver = icedHotTDS > 3.4;
                if (isUnder || isOver) {
                  return (
                    <div className={`px-2 py-1 rounded text-[9px] font-bold border ${isOver ? 'bg-red-100 text-red-700 border-red-300' : 'bg-blue-100 text-blue-700 border-blue-300'}`}>
                      ⚠ Hot TDS {icedHotTDS.toFixed(2)}% is {isOver ? 'above' : 'below'} the 2.8–3.4% target range. {isOver ? 'Grind coarser or loosen ratio.' : 'Grind finer or tighten ratio.'}
                    </div>
                  );
                }
                return null;
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Hot concentrate */}
                <div className="p-2 bg-white/70 border border-amber-200 rounded-lg space-y-1">
                  <div className="text-[9px] font-bold text-amber-800 uppercase tracking-wider">Hot Concentrate</div>
                  <div className="text-[9px] text-slate-500">TDS: <strong className="text-amber-700">{hotTDS.toFixed(2)}%</strong></div>
                  <div className="text-[9px] text-slate-500">Liquid: <strong className="text-slate-700">{hotLiquid.toFixed(0)}g</strong> ({hotWater.toFixed(0)}g water − ~{Math.round(icedDose * 2.5)}g retained)</div>
                  <div className="text-[9px] text-slate-500">Extracted coffee: <strong className="text-slate-700">{extracted.toFixed(2)}g</strong></div>
                  <div className="text-[9px] font-bold text-indigo-700 border-t border-amber-200 pt-0.5 mt-0.5">
                    EY = {hotLiquid.toFixed(0)}g × {hotTDS.toFixed(2)}% ÷ {icedDose}g = <strong>{ey.toFixed(2)}%</strong>
                  </div>
                </div>
                {/* Final beverage */}
                <div className="p-2 bg-white/70 border border-sky-200 rounded-lg space-y-1">
                  <div className="text-[9px] font-bold text-sky-800 uppercase tracking-wider">Final Beverage (After Ice)</div>
                  <div className="text-[9px] text-slate-500">TDS: <strong className="text-sky-700">{finalTDS.toFixed(2)}%</strong></div>
                  <div className="text-[9px] text-slate-500">Beverage: <strong className="text-slate-700">{finalBev.toFixed(0)}g</strong> ({hotLiquid.toFixed(0)}g hot + {ice}g melted ice)</div>
                  <div className="text-[9px] text-slate-500">Extracted coffee: <strong className="text-slate-700">{finalExtracted.toFixed(2)}g</strong></div>
                  <div className={`text-[9px] font-bold border-t pt-0.5 mt-0.5 ${matched ? 'text-emerald-600 border-sky-200' : 'text-amber-600 border-sky-200'}`}>
                    EY = {finalBev.toFixed(0)}g × {finalTDS.toFixed(2)}% ÷ {icedDose}g = <strong>{finalEY.toFixed(2)}%</strong>
                    {matched && <span className="ml-1 text-emerald-600">✓ Same!</span>}
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-indigo-600 bg-indigo-100/60 rounded px-2 py-1">
                <strong>Key insight:</strong> EY% is the same whether calculated from the hot concentrate or the final beverage — only TDS and volume change. Use the <strong>hot concentrate TDS</strong> (2.5–4.0%) to check your extraction mid-brew.
              </div>
            </div>
          );
        })()}
        </>}
      </section>

      {/* Recipe & Pour Planning */}
      <section id="recipe-pour-planning" className="border border-emerald-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">Expecting</span>
            <span className="text-sky-700 font-bold tabular-nums">TDS {parseFloat(targetTDSMin).toFixed(2)}–{parseFloat(targetTDSMax).toFixed(2)}%</span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-bold tabular-nums">EY {parseFloat(targetEY).toFixed(1)}%</span>
            <span className="text-slate-300">|</span>
            <span className="text-amber-700 font-bold tabular-nums">1:{tdsPlanRatio}</span>
          </div>
          <button type="button" onClick={() => document.getElementById('grinder-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100">↑ Grinder Setup</button>
        </div>
        <RecipePourPlanning ref={recipePlanRef} brewTargetSec={brewTimeSec} expectedTDSMin={parseFloat(targetTDSMin) || undefined} expectedTDSMax={parseFloat(targetTDSMax) || undefined} />
      </section>

      {/* Attempt Log */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Attempt Log</h3>
        <AttemptLog
          currentGrindSize={recipeValues.grindSize}
          currentDose={recipeValues.dose}
          currentRatio={recipeValues.ratio}
          currentTotalWater={recipeValues.water}
          tdsMin={parseFloat(targetTDSMin) || 0}
          tdsMax={parseFloat(targetTDSMax) || 0}
          currentTDS={currentTDS}
          currentEY={parseFloat(targetEY) || 0}
          brewTimeTarget={brewTimeSec}
          brewTimeActual={brewActualSec}
          planSnapshot={{
            equipment: {
              name: equipmentName,
              brewer: brewerType,
              filterName,
              filterType,
              flowSpeed,
              drawdownRate,
            },
            grinder: {
              name: grinderName,
              power: grinderPower,
              burr: grinderBurr,
              fines: finesTendency,
              micron: grinderMicron,
              grindSize: recipeValues.grindSize,
            },
            bean: {
              roastLevel,
              density,
              altitude,
              process,
              origin,
              defects: [...defects],
            },
            brewTime: {
              targetSec: brewTimeSec,
              actualSec: brewActualSec,
              liked: brewLiked,
            },
            brewImpact: {
              temp: waterTemp,
              waterQuality,
              turbulence: turbulenceLevel,
              activeFactor,
              symptom,
            },
            tdsPlan: {
              ratio: tdsPlanRatio,
              ey: targetEY,
              tdsMin: targetTDSMin,
              tdsMax: targetTDSMax,
            },
            grinding: {
              grindAdjustPct,
              beanAdviceLabel: beanAdvice.label,
              beanAdviceScore: beanAdvice.overall,
            },
            recipe: {
              dose: recipeValues.dose,
              ratio: recipeValues.ratio,
              water: recipeValues.water,
            },
          }}
        />
      </section>
    </div>
  );
});

SetupProfile.displayName = 'SetupProfile';
export default SetupProfile;
