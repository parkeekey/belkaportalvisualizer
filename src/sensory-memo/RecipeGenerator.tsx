import { useState, useMemo, useEffect } from 'react';
import { FLAVORS } from './flavors';
import { loadCustomFlavors } from './customFlavors';
import type { CoffeeProfile, SensoryProfile, FlavorEntry, CustomFlavorEntry, TasteProfile, AggregateAnalysis, BrewProfile } from './types';
import { TASTE_LABELS } from './types';
import { getReferenceTDSRange } from '../utils/tdsReference';

type FlavorSource = FlavorEntry | CustomFlavorEntry;

const COFFEE_PROFILES_KEY = 'belka.coffeeProfiles';
const SENSORY_PROFILES_KEY = 'belka.sensoryProfiles';
const BREW_PROFILES_KEY = 'belka.brewProfiles';

function loadCoffeeProfiles(): CoffeeProfile[] {
  try { const r = localStorage.getItem(COFFEE_PROFILES_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return [];
}

function loadSensoryProfiles(): SensoryProfile[] {
  try { const r = localStorage.getItem(SENSORY_PROFILES_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return [];
}

function loadBrewProfiles(): BrewProfile[] {
  try { const r = localStorage.getItem(BREW_PROFILES_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return [];
}

function saveBrewProfiles(profiles: BrewProfile[]): void {
  try { localStorage.setItem(BREW_PROFILES_KEY, JSON.stringify(profiles)); } catch { /* */ }
}

function estimateFinishTime(roastNum: number, dose: number): number {
  let base = 180;
  if (roastNum <= 2) base = 210;
  else if (roastNum >= 4) base = 150;
  const doseAdj = (dose - 18) * 6;
  return Math.max(90, Math.min(360, base + doseAdj));
}

function computeAggregate(flavors: FlavorSource[]): AggregateAnalysis {
  const totalTaste: TasteProfile = { sour: 0, sweet: 0, bitter: 0, salty: 0, umami: 0 };
  flavors.forEach(f => {
    for (const k of Object.keys(totalTaste) as (keyof TasteProfile)[]) totalTaste[k] += f.taste[k];
  });
  const n = flavors.length || 1;
  const avgTaste: TasteProfile = { sour: +(totalTaste.sour / n).toFixed(1), sweet: +(totalTaste.sweet / n).toFixed(1), bitter: +(totalTaste.bitter / n).toFixed(1), salty: +(totalTaste.salty / n).toFixed(1), umami: +(totalTaste.umami / n).toFixed(1) };
  const bright = avgTaste.sour + avgTaste.sweet;
  const deep = avgTaste.bitter + avgTaste.umami;
  const total = bright + deep + avgTaste.salty;
  const brightPct = total > 0 ? (bright / total) * 100 : 50;
  const deepPct = total > 0 ? (deep / total) * 100 : 50;
  let dimension: AggregateAnalysis['dimension'] = 'balanced';
  let dimensionReason = '';
  if (brightPct > 65) { dimension = 'aroma'; dimensionReason = `Bright-dominant (${brightPct.toFixed(0)}% sour+sweet) — expect aromatic, fruity, tea-like notes`; }
  else if (deepPct > 65) { dimension = 'mouthfeel'; dimensionReason = `Deep-dominant (${deepPct.toFixed(0)}% bitter+umami) — expect heavy body, chocolate, roasted notes`; }
  else if (brightPct >= 45 && brightPct <= 55) { dimension = 'balanced'; dimensionReason = `Balanced bright/deep split — versatile, well-rounded profile`; }
  else { dimension = 'flavor'; dimensionReason = `Moderate bright/deep mix — flavor-forward profile`; }
  const wcrCount = flavors.filter(f => 'wcr_ref' in f && f.wcr_ref).length;
  let possibilityScore = 70;
  if (wcrCount > 0) possibilityScore += 10;
  if (avgTaste.sour > 3 || avgTaste.sweet > 3) possibilityScore += 5;
  if (flavors.length >= 3) possibilityScore += 5;
  if (flavors.length <= 1) possibilityScore -= 10;
  possibilityScore = Math.max(30, Math.min(95, possibilityScore));
  return { totalTaste, avgTaste, dimension, dimensionReason, possibilityScore, selectedCount: flavors.length, wcrCount, customCount: flavors.length - wcrCount };
}

interface GeneratedRecipe {
  dose: number;
  ratio: number;
  water: number;
  grindUm: number;
  waterTemp: number;
  targetEYmin: number;
  targetEYmax: number;
  targetEYmid: number;
  bloomRatio: number;
  bloomTime: number;
  pourCount: number;
}

function generateRecipe(
  roastNum: number,
  process: string,
  dimension: AggregateAnalysis['dimension'],
  avgTaste: TasteProfile,
  doseOverride?: number
): GeneratedRecipe {
  // Roast → temperature (linear interpolation: 1=96, 5=86)
  const tempMap: Record<number, number> = { 1: 96, 2: 94, 3: 92, 4: 89, 5: 86 };
  const clampedRoast = Math.max(1, Math.min(5, roastNum));
  const waterTemp = tempMap[clampedRoast] ?? 92;

  // Roast → grind base
  const grindBase = clampedRoast <= 2 ? 720 : clampedRoast === 3 ? 800 : clampedRoast >= 4 ? 900 : 800;
  // Process → grind adjustment
  const pLower = process.toLowerCase();
  let grindAdj = 0;
  if (pLower.includes('washed')) grindAdj = 0;
  else if (pLower.includes('natural')) grindAdj = 50;
  else if (pLower.includes('honey')) grindAdj = 30;
  else if (pLower.includes('anaerobic')) grindAdj = 80;
  else if (pLower.includes('lactic')) grindAdj = 60;
  else if (pLower.includes('thermal')) grindAdj = 40;
  else if (pLower.includes('co-ferment') || pLower.includes('coferment')) grindAdj = 100;
  else if (pLower.includes('carbonic')) grindAdj = 80;
  else if (pLower.includes('koji')) grindAdj = 120;

  // Taste dimension → ratio & EY
  let ratio: number;
  let eyMid: number;
  if (dimension === 'aroma') { ratio = 15.5; eyMid = 19; }
  else if (dimension === 'mouthfeel') { ratio = 16.5; eyMid = 21; }
  else if (dimension === 'flavor') { ratio = 16; eyMid = 20; }
  else { ratio = 16; eyMid = 20; }

  // Sweetness bump: if avg sweet ≥ 3, slightly coarser (sweeter extraction)
  if (avgTaste.sweet >= 3.5) grindAdj += 30;
  // Sour bump: if avg sour ≥ 3, slightly finer (brighter)
  if (avgTaste.sour >= 3.5) grindAdj -= 30;

  const grindUm = Math.max(300, Math.min(1800, grindBase + grindAdj));

  const dose = doseOverride ?? 18;
  const water = Math.round(dose * ratio * 10) / 10;

  const eyMin = eyMid - 2;
  const eyMax = eyMid + 2;

  // Bloom
  const bloomRatio = 3;
  const bloomTime = clampedRoast <= 2 ? 40 : clampedRoast === 3 ? 35 : 30;

  // Pour count (technique suggestion, not a prediction)
  let pourCount = 4;
  if (dose <= 15) pourCount = 3;
  else if (dose >= 21) pourCount = 5;
  if (dose >= 26) pourCount = 6;

  return { dose, ratio, water, grindUm, waterTemp, targetEYmin: eyMin, targetEYmax: eyMax, targetEYmid: eyMid, bloomRatio, bloomTime, pourCount };
}

// ── Component ──
export default function RecipeGenerator() {
  const [sourceMode, setSourceMode] = useState<'coffee' | 'sensory'>('coffee');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [doseOverride, setDoseOverride] = useState(18);
  const [showReasoning, setShowReasoning] = useState(true);
  const [savedBrewProfiles, setSavedBrewProfiles] = useState<BrewProfile[]>(() => loadBrewProfiles());
  const [brewProfileName, setBrewProfileName] = useState('');
  const [brewProfileMsg, setBrewProfileMsg] = useState('');

  const coffeeProfiles = useMemo(() => loadCoffeeProfiles(), []);
  const sensoryProfiles = useMemo(() => loadSensoryProfiles(), []);
  const customFlavors = useMemo(() => loadCustomFlavors(), []);

  const allFlavors = useMemo(() => [...FLAVORS, ...customFlavors], [customFlavors]);

  // Resolve the selected profile and its flavors
  const { profileName, flavorSources, coffeeInfo } = useMemo(() => {
    if (sourceMode === 'coffee') {
      const p = coffeeProfiles.find(c => c.id === selectedProfileId);
      if (!p) return { profileName: '', flavorSources: [] as FlavorSource[], coffeeInfo: p ?? null };
      const sources = allFlavors.filter(f => (p.flavorIds ?? []).includes(f.id));
      return { profileName: p.name, flavorSources: sources, coffeeInfo: p };
    } else {
      const p = sensoryProfiles.find(s => s.id === selectedProfileId);
      if (!p) return { profileName: '', flavorSources: [] as FlavorSource[], coffeeInfo: p ?? null };
      const checkedIds = new Set(Object.entries(p.checkedFlavors).filter(([, v]) => v.checked).map(([id]) => id));
      const sources = allFlavors.filter(f => checkedIds.has(f.id));
      return { profileName: p.name, flavorSources: sources, coffeeInfo: p as CoffeeProfile | SensoryProfile | null };
    }
  }, [sourceMode, selectedProfileId, coffeeProfiles, sensoryProfiles, allFlavors]);

  // Pre-fill brew profile name from the selected profile so it's editable text, not placeholder
  useEffect(() => {
    if (profileName) setBrewProfileName(profileName);
  }, [profileName]);

  const aggregate = useMemo(() => computeAggregate(flavorSources), [flavorSources]);

  // Parse roast level from string (e.g. "3/5" or "3")
  const roastNum = useMemo(() => {
    if (!coffeeInfo) return 3;
    const rl = 'roastLevel' in coffeeInfo ? (coffeeInfo as any).roastLevel : undefined;
    if (!rl) return 3;
    const m = String(rl).match(/(\d+)/);
    return m ? Math.max(1, Math.min(5, parseInt(m[1]))) : 3;
  }, [coffeeInfo]);

  const process = useMemo(() => {
    if (!coffeeInfo) return '';
    return 'process' in coffeeInfo ? (coffeeInfo as any).process ?? '' : '';
  }, [coffeeInfo]);

  const recipe = useMemo(() => {
    if (!coffeeInfo) return null;
    return generateRecipe(roastNum, process, aggregate.dimension, aggregate.avgTaste, doseOverride);
  }, [coffeeInfo, roastNum, process, aggregate, doseOverride]);

  // Big category breakdown
  const bigCats = useMemo(() => {
    const cats: Record<string, number> = {};
    flavorSources.forEach(f => { cats[f.bigCategory] = (cats[f.bigCategory] || 0) + 1; });
    return cats;
  }, [flavorSources]);

  const hasSelection = !!coffeeInfo;

  const cardColors: Record<string, { border: string; bg: string; label: string; value: string }> = {
    dose:   { border: 'border-l-slate-400', bg: 'bg-slate-50',     label: 'text-slate-500', value: 'text-slate-800' },
    ratio:  { border: 'border-l-cyan-400',   bg: 'bg-cyan-50',     label: 'text-cyan-600',  value: 'text-cyan-900' },
    grind:  { border: 'border-l-amber-400',  bg: 'bg-amber-50',    label: 'text-amber-600', value: 'text-amber-900' },
    temp:   { border: 'border-l-rose-400',   bg: 'bg-rose-50',     label: 'text-rose-600',  value: 'text-rose-900' },
    ey:     { border: 'border-l-yellow-400', bg: 'bg-yellow-50',   label: 'text-yellow-600',value: 'text-yellow-900' },
    bloom:  { border: 'border-l-sky-400',    bg: 'bg-sky-50',      label: 'text-sky-600',   value: 'text-sky-900' },
    pours:  { border: 'border-l-violet-400', bg: 'bg-violet-50',   label: 'text-violet-600',value: 'text-violet-900' },
    tds:    { border: 'border-l-emerald-400',bg: 'bg-emerald-50',  label: 'text-emerald-600',value: 'text-emerald-900' },
  };

  const td = cardColors.dose;
  const tr = cardColors.ratio;
  const tg = cardColors.grind;
  const tt = cardColors.temp;
  const te = cardColors.ey;
  const tb = cardColors.bloom;
  const tp = cardColors.pours;
  const tts = cardColors.tds;

  return (
    <div className="min-h-screen bg-[#f8f6f0] flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">📋 Recipe Generator</h1>
          <button onClick={() => { setSelectedProfileId(''); }}
            className="px-2 py-1 text-[10px] font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100"
          >✕ Clear</button>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4 pb-20">
        {/* Source picker */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex gap-2 mb-3">
            <button onClick={() => { setSourceMode('coffee'); setSelectedProfileId(''); }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${sourceMode === 'coffee' ? 'bg-amber-600 border-amber-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >☕ Coffee Profile</button>
            <button onClick={() => { setSourceMode('sensory'); setSelectedProfileId(''); }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${sourceMode === 'sensory' ? 'bg-violet-600 border-violet-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >🧪 Sensory Session</button>
          </div>
          {sourceMode === 'coffee' ? (
            <select value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600 bg-white"
            >
              <option value="">— Select a coffee profile —</option>
              {coffeeProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.roaster ? ` (${p.roaster})` : ''}</option>
              ))}
            </select>
          ) : (
            <select value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600 bg-white"
            >
              <option value="">— Select a sensory session —</option>
              {sensoryProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.coffeeName ? ` — ${p.coffeeName}` : ''}</option>
              ))}
            </select>
          )}


        </div>

        {hasSelection && (
          <>
            {/* Flavor profile summary */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-700">🧪 {profileName}</h2>
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{flavorSources.length} flavors</span>
              </div>

              {coffeeInfo && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 mb-3 bg-slate-50 rounded-lg px-3 py-2">
                  {'roaster' in coffeeInfo && (coffeeInfo as any).roaster && <span><span className="text-slate-400">Roaster</span> <strong className="text-slate-700">{(coffeeInfo as any).roaster}</strong></span>}
                  {'origin' in coffeeInfo && (coffeeInfo as any).origin && <span><span className="text-slate-400">Origin</span> <strong className="text-slate-700">{(coffeeInfo as any).origin}</strong></span>}
                  {process && <span><span className="text-slate-400">Process</span> <strong className="text-slate-700">{process}</strong></span>}
                  <span><span className="text-slate-400">Roast</span> <strong className="text-slate-700">{roastNum}/5</strong></span>
                </div>
              )}

              {/* Taste bars */}
              <div className="mb-3">
                <div className="text-[9px] font-semibold text-slate-500 mb-1.5">Taste profile</div>
                <div className="flex gap-2">
                  {TASTE_LABELS.map(t => (
                    <div key={t.key} className="flex-1">
                      <div className="h-12 rounded-lg overflow-hidden bg-slate-100 flex flex-col-reverse">
                        <div className={`${t.color} transition-all duration-200`} style={{ height: `${(aggregate.avgTaste[t.key] / 5) * 100}%` }} />
                      </div>
                      <div className="text-[10px] font-bold text-slate-600 text-center mt-0.5">{aggregate.avgTaste[t.key]}</div>
                      <div className="text-[7px] text-slate-400 text-center">{t.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dimension + possibility row */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">Dimension</span>{' '}
                  <span className={`font-bold ${aggregate.dimension === 'aroma' ? 'text-pink-600' : aggregate.dimension === 'mouthfeel' ? 'text-orange-600' : aggregate.dimension === 'flavor' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {aggregate.dimension}
                  </span>
                </span>
                <span className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">Possibility</span>{' '}
                  <span className={`font-bold ${aggregate.possibilityScore >= 80 ? 'text-emerald-600' : aggregate.possibilityScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {aggregate.possibilityScore}%
                  </span>
                </span>
              </div>

              {/* Big category pills */}
              {Object.keys(bigCats).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {Object.entries(bigCats).map(([cat, n]) => (
                    <span key={cat} className="text-[8px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">{cat} {n}</span>
                  ))}
                </div>
              )}

              {/* Flavor chips */}
              <div className="flex flex-wrap gap-1">
                {flavorSources.map(f => (
                  <span key={f.id} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f.emoji} {f.label}</span>
                ))}
              </div>
            </div>

            {/* Generated Recipe */}
            {recipe && (
              <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-amber-800">☕ Suggested Recipe</h2>
                  <button onClick={() => setShowReasoning(p => !p)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold flex items-center gap-1"
                  >
                    <span className={showReasoning ? 'rotate-90' : ''}>▶</span> Reasoning
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {/* Dose */}
                  <div className={`border-l-4 ${td.border} ${td.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${td.label} mb-0.5`}>Dose</div>
                    <div className="flex items-baseline gap-1">
                      <input type="number" value={doseOverride} onChange={e => setDoseOverride(Math.max(10, Math.min(30, parseInt(e.target.value) || 18)))}
                        className={`w-14 text-sm font-bold ${td.value} bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-center`}
                      />
                      <span className={`text-xs font-semibold ${td.label}`}>g</span>
                    </div>
                  </div>

                  {/* Ratio */}
                  <div className={`border-l-4 ${tr.border} ${tr.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tr.label} mb-0.5`}>Ratio</div>
                    <div className="text-sm font-bold text-cyan-800">1:{recipe.ratio}</div>
                    <div className="text-[10px] text-cyan-600">{recipe.water}g water</div>
                  </div>

                  {/* Grind */}
                  <div className={`border-l-4 ${tg.border} ${tg.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tg.label} mb-0.5`}>Grind</div>
                    <div className="text-sm font-bold text-amber-800">{recipe.grindUm}µm</div>
                    {showReasoning && <div className="text-[8px] text-amber-600/70 mt-0.5">{roastNum <= 2 ? 'Finer for light roast' : roastNum >= 4 ? 'Coarser for dark roast' : 'Medium'}{process ? ` · ${process}` : ''}</div>}
                  </div>

                  {/* Water temp */}
                  <div className={`border-l-4 ${tt.border} ${tt.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tt.label} mb-0.5`}>Water Temp</div>
                    <div className="text-sm font-bold text-rose-800">{recipe.waterTemp}°C</div>
                    {showReasoning && <div className="text-[8px] text-rose-600/70 mt-0.5">{roastNum <= 2 ? 'Hotter for light roast' : roastNum >= 4 ? 'Cooler, avoid bitterness' : 'Standard 92°C'}</div>}
                  </div>

                  {/* Target EY */}
                  <div className={`border-l-4 ${te.border} ${te.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${te.label} mb-0.5`}>Target EY</div>
                    <div className="text-sm font-bold text-yellow-800">{recipe.targetEYmin}–{recipe.targetEYmax}%</div>
                    <div className="text-[10px] text-yellow-600">Mid {recipe.targetEYmid}%</div>
                  </div>

                  {/* Bloom */}
                  <div className={`border-l-4 ${tb.border} ${tb.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tb.label} mb-0.5`}>Bloom</div>
                    <div className="text-sm font-bold text-sky-800">{Math.round(doseOverride * recipe.bloomRatio)}g</div>
                    <div className="text-[10px] text-sky-600">{recipe.bloomTime}s · {recipe.bloomRatio}×</div>
                  </div>

                  {/* Pours */}
                  <div className={`border-l-4 ${tp.border} ${tp.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tp.label} mb-0.5`}>Pours</div>
                    <div className="text-sm font-bold text-violet-800">{recipe.pourCount}</div>
                    {showReasoning && <div className="text-[8px] text-violet-600/70 mt-0.5">{recipe.pourCount <= 3 ? 'Small dose' : recipe.pourCount >= 5 ? 'Larger dose' : 'Standard'}</div>}
                  </div>

                  {/* TDS */}
                  <div className={`border-l-4 ${tts.border} ${tts.bg} rounded-r-lg px-3 py-2`}>
                    <div className={`text-[9px] font-semibold ${tts.label} mb-0.5`}>Target TDS</div>
                    <div className="text-sm font-bold text-emerald-800">
                      {(() => {
                        const range = getReferenceTDSRange(recipe.ratio, recipe.targetEYmin, recipe.targetEYmax);
                        return range ? `${range.tdsMin.toFixed(2)}–${range.tdsMax.toFixed(2)}%` : '—';
                      })()}
                    </div>
                    <div className="text-[10px] text-emerald-600">1:{recipe.ratio}</div>
                  </div>
                </div>

                {/* Reasoning */}
                {showReasoning && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-slate-600 leading-relaxed">
                    <div className="font-bold text-amber-800 mb-1.5">Why this recipe?</div>
                    <ul className="space-y-1 list-disc list-inside">
                      <li><strong>Roast {roastNum}/5</strong> → {recipe.waterTemp}°C · {recipe.grindUm}µm · bloom {recipe.bloomTime}s</li>
                      {process && <li><strong>Process: {process}</strong> → grind adjusted</li>}
                      <li><strong>Dimension: {aggregate.dimension}</strong> → ratio 1:{recipe.ratio} · EY {recipe.targetEYmid}%</li>
                      {aggregate.avgTaste.sweet >= 3.5 && <li><strong>High sweetness</strong> ({aggregate.avgTaste.sweet}/5) → coarser grind</li>}
                      {aggregate.avgTaste.sour >= 3.5 && <li><strong>High acidity</strong> ({aggregate.avgTaste.sour}/5) → finer grind</li>}
                      <li>{flavorSources.length} flavor notes → {aggregate.possibilityScore >= 80 ? 'well-characterized profile' : aggregate.possibilityScore >= 60 ? 'moderately defined' : 'approximate recipe (sparse data)'}</li>
                    </ul>
                  </div>
                )}

                {/* Save as Brew Profile */}
                <div className="mt-3 pt-3 border-t border-amber-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">💾 Save as Brew Profile</span>
                    <input type="text" value={brewProfileName} onChange={e => setBrewProfileName(e.target.value)}
                      placeholder='Save as...'
                      className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white"
                    />
                    <button onClick={() => {
                      const name = brewProfileName.trim() || profileName || 'Untitled';
                      const newProfile: BrewProfile = {
                        id: `brew_${Date.now()}`,
                        name,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        dose: doseOverride,
                        ratio: recipe.ratio,
                        grindUm: recipe.grindUm,
                        waterTemp: recipe.waterTemp,
                        targetEYmin: recipe.targetEYmin,
                        targetEYmax: recipe.targetEYmax,
                        targetEYmid: recipe.targetEYmid,
                        targetFinishSec: estimateFinishTime(roastNum, doseOverride),
                        bloomRatio: recipe.bloomRatio,
                        bloomTime: recipe.bloomTime,
                        pourCount: recipe.pourCount,
                        sourceType: sourceMode,
                        sourceName: profileName,
                        roastLevel: roastNum,
                        process,
                        dimension: aggregate.dimension,
                      };
                      const updated = [...savedBrewProfiles, newProfile];
                      setSavedBrewProfiles(updated);
                      saveBrewProfiles(updated);
                      setBrewProfileName('');
                      setBrewProfileMsg(`Saved "${name}"`);
                      setTimeout(() => setBrewProfileMsg(''), 2500);
                    }}
                      className="text-[9px] px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg font-semibold hover:bg-amber-200"
                    >Save</button>
                  </div>
                  {brewProfileMsg && (
                    <div className="text-[9px] text-emerald-600 font-semibold mt-1">{brewProfileMsg}</div>
                  )}
                  {savedBrewProfiles.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[9px] text-slate-400 font-semibold">Saved ({savedBrewProfiles.length}): </span>
                      <span className="text-[9px] text-slate-500">{savedBrewProfiles.map(p => p.name).join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!hasSelection && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
            <div className="text-3xl mb-3">📋</div>
            <p className="text-sm text-slate-400">Select a coffee profile or sensory session to generate a brew recipe.</p>
            <p className="text-[11px] text-slate-300 mt-1">Recipe adapts to roast level, process method, and flavor profile.</p>
          </div>
        )}
      </div>
    </div>
  );
}
