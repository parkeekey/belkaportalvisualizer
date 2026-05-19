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
  const [flowSpeed, setFlowSpeed] = useState(50);
  const flowSuggestion = useMemo(() => {
    const finePct = Math.round((flowSpeed - 50) * 0.6);
    return finePct;
  }, [flowSpeed]);
  const [burrSize, setBurrSize] = useState('');
  const [rpm, setRpm] = useState('');

  const [roastLevel, setRoastLevel] = useState('medium');
  const [density, setDensity] = useState('medium');
  const [altitude, setAltitude] = useState('');
  const [process, setProcess] = useState('washed');
  const [origin, setOrigin] = useState('');

  const [grindAdjustPct, setGrindAdjustPct] = useState(50);

  const [targetTDSMin, setTargetTDSMin] = useState('1.30');
  const [targetTDSMax, setTargetTDSMax] = useState('1.45');
  const [currentTDS, setCurrentTDS] = useState(1.35);
  const [targetEY, setTargetEY] = useState('20');
  const [recipeValues, setRecipeValues] = useState(() => ({
    dose: parseFloat(localStorage.getItem('belkaDoseWeight') || '0') || 18,
    ratio: parseFloat(localStorage.getItem('belkaBrewRatio') || '0') || 16,
    water: parseFloat(localStorage.getItem('belkaTotalWaterIn') || '0') || 288,
    grindSize: 0,
  }));
  useEffect(() => {
    const id = setInterval(() => {
      const dose = parseFloat(localStorage.getItem('belkaDoseWeight') || '0') || 18;
      const ratio = parseFloat(localStorage.getItem('belkaBrewRatio') || '0') || 16;
      const water = parseFloat(localStorage.getItem('belkaTotalWaterIn') || '0') || 288;
      setRecipeValues(r => r.dose !== dose || r.ratio !== ratio || r.water !== water ? { ...r, dose, ratio, water } : r);
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
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Burr Size</label>
            <input type="number" step={0.5} value={burrSize} onChange={(e) => setBurrSize(e.target.value)} placeholder="mm" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">RPM</label>
            <input type="number" step={1} value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder="e.g. 800" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
        </div>
      </section>

      {/* Bean Profile */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-3">Bean Profile</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Roast Level</label>
            <select value={roastLevel} onChange={(e) => setRoastLevel(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="light">Light</option>
              <option value="medium-light">Medium-Light</option>
              <option value="medium">Medium</option>
              <option value="medium-dark">Medium-Dark</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Density</label>
            <select value={density} onChange={(e) => setDensity(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="low">Low</option>
              <option value="medium-low">Medium-Low</option>
              <option value="medium">Medium</option>
              <option value="medium-high">Medium-High</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Altitude</label>
            <input type="text" value={altitude} onChange={(e) => setAltitude(e.target.value)} placeholder="e.g. 1600-1800m" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="flex flex-col gap-0.5">
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
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Origin</label>
            <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Ethiopia" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>
      </section>

      {/* Grind Adjustment Calculator */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Grind Adjustment</h3>
          <span className="text-[9px] text-sky-500 font-medium">Auto-suggested from flow speed</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium w-14">Finer</span>
            <input type="range" min={0} max={100} value={grindAdjustPct} onChange={(e) => setGrindAdjustPct(parseInt(e.target.value))} className="w-32 h-1.5 accent-emerald-500" />
            <span className="text-xs text-slate-500 font-medium w-14">Coarser</span>
          </div>
          <span className="text-sm font-bold text-emerald-700 tabular-nums">
            {grindAdjustPct < 33 ? 'Finer' : grindAdjustPct < 66 ? 'Neutral' : 'Coarser'} ({grindAdjustPct}%)
          </span>
        </div>
      </section>

      {/* TDS Target */}
      <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <TDSHUD
          tdsMin={parseFloat(targetTDSMin) || 0}
          tdsMax={parseFloat(targetTDSMax) || 0}
          currentTDS={currentTDS}
          eyTarget={parseFloat(targetEY) || 0}
          onTDSChange={setCurrentTDS}
        />
        <div className="bg-white/80 px-4 py-2 flex items-center gap-4 text-xs flex-wrap border-t border-slate-200">
          <div className="flex items-center gap-1">
            <label className="text-slate-400 font-medium">TDS Min</label>
            <input type="number" step={0.05} value={targetTDSMin} onChange={(e) => setTargetTDSMin(e.target.value)} className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-slate-400 font-medium">TDS Max</label>
            <input type="number" step={0.05} value={targetTDSMax} onChange={(e) => setTargetTDSMax(e.target.value)} className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-slate-400 font-medium">EY %</label>
            <input type="number" step={0.5} value={targetEY} onChange={(e) => setTargetEY(e.target.value)} className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
        </div>
      </section>

      {/* Recipe & Pour Planning */}
      <section className="border border-emerald-200 rounded-xl overflow-hidden">
        <RecipePourPlanning ref={recipePlanRef} />
      </section>

      {/* Attempt Log */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Attempt Log</h3>
        <AttemptLog
          currentGrindSize={0}
          currentDose={recipeValues.dose}
          currentRatio={recipeValues.ratio}
          currentTotalWater={recipeValues.water}
          tdsMin={parseFloat(targetTDSMin) || 0}
          tdsMax={parseFloat(targetTDSMax) || 0}
          currentTDS={currentTDS}
        />
      </section>
    </div>
  );
});

SetupProfile.displayName = 'SetupProfile';
export default SetupProfile;
