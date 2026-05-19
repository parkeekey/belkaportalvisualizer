import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
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
  const [flowCharacter, setFlowCharacter] = useState('medium');
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
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Flow Character</label>
            <select value={flowCharacter} onChange={(e) => setFlowCharacter(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
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

      {/* Grind Adjustment Calculator */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-3">Grind Adjustment Calculator</h3>
        <p className="text-xs text-slate-500 mb-3">How much coarser or finer should you go for this bean on this setup?</p>
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
    </div>
  );
});

SetupProfile.displayName = 'SetupProfile';
export default SetupProfile;
