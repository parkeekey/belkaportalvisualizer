import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PourPlanGraph from './PourPlanGraph';
import GrinderKnob from './GrinderKnob';

interface PourPlanEntry {
  cumulativePercent: number;
  duration?: number;
}

export interface RecipePourPlanningProfile {
  doseWeight: number;
  brewRatio: number;
  totalWaterIn: number;
  pourPlan: PourPlanEntry[];
  recipeFinishTimeSec: number;
  grinderName: string;
  grindSize: number;
  micron: number;
}

export interface RecipePourPlanningHandle {
  exportProfile: () => RecipePourPlanningProfile;
  importProfile: (profile: RecipePourPlanningProfile) => void;
  setFinishTime: (sec: number) => void;
  setGrindCalibration: (grindNum: number, micronVal: number) => void;
}

interface ECPoint {
  time: number;
  ecValue: number;
}

interface ECProps {
  getECAtTime: (time: number) => number | null;
  getCurrentData: () => ECPoint[];
  effectivePourData: { values: number[]; intervalSeconds: number; label?: string } | null;
  totalBrewTime: number;
}

export interface ProfileData {
  doseWeight: number;
  brewRatio: number;
  totalWaterIn: number;
  pourPlan: PourPlanEntry[];
  recipeFinishTimeSec: number;
  grinderName: string;
  grindSize: number;
  micron: number;
}

interface RecipePourPlanningProps {
  ecProps?: ECProps;
  profile?: ProfileData;
  onProfileChange?: (profile: ProfileData) => void;
  brewTargetSec?: number;
  expectedTDSMin?: number;
  expectedTDSMax?: number;
}

const RecipePourPlanning = forwardRef<RecipePourPlanningHandle, RecipePourPlanningProps>(({ ecProps, profile: controlledProfile, onProfileChange, brewTargetSec, expectedTDSMin, expectedTDSMax }, ref) => {
  const isControlled = controlledProfile !== undefined;
  const [internalDoseWeight, setInternalDoseWeight] = useState<number>(() => {
    const saved = localStorage.getItem('belkaDoseWeight');
    return saved ? (parseFloat(saved) || 15) : 15;
  });
  const [internalBrewRatio, setInternalBrewRatio] = useState<number>(() => {
    const saved = localStorage.getItem('belkaBrewRatio');
    return saved ? (parseFloat(saved) || 15) : 15;
  });
  const [internalTotalWaterIn, setInternalTotalWaterIn] = useState<number>(() => {
    const saved = localStorage.getItem('belkaTotalWaterIn');
    if (saved) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 225;
  });
  const [internalPourPlan, setInternalPourPlan] = useState<PourPlanEntry[]>([]);
  const [internalRecipeFinishTimeSec, setInternalRecipeFinishTimeSec] = useState<number>(0);
  const [internalGrinderName, setInternalGrinderName] = useState<string>('');
  const [internalGrindSize, setInternalGrindSize] = useState<number>(0);
  const [internalMicron, setInternalMicron] = useState<number>(0);
  const [swRunning, setSwRunning] = useState(false);
  const [swTime, setSwTime] = useState(0);
  const [swLaps, setSwLaps] = useState<{ time: number; pourIdx: number }[]>([]);
  const swStartRef = useRef<number>(0);
  const swTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doseWeight = isControlled ? controlledProfile.doseWeight : internalDoseWeight;
  const brewRatio = isControlled ? controlledProfile.brewRatio : internalBrewRatio;
  const totalWaterIn = isControlled ? controlledProfile.totalWaterIn : internalTotalWaterIn;
  const pourPlan = isControlled ? controlledProfile.pourPlan : internalPourPlan;
  const recipeFinishTimeSec = isControlled ? controlledProfile.recipeFinishTimeSec : internalRecipeFinishTimeSec;
  const grinderName = isControlled ? controlledProfile.grinderName : internalGrinderName;
  const grindSize = isControlled ? controlledProfile.grindSize : internalGrindSize;
  const micron = isControlled ? controlledProfile.micron : internalMicron;

  const setDoseWeight = useCallback((v: number) => {
    localStorage.setItem('belkaDoseWeight', String(v));
    if (isControlled) {
      onProfileChange?.({ doseWeight: v, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron });
    } else {
      setInternalDoseWeight(v);
    }
  }, [isControlled, onProfileChange, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron]);
  const setBrewRatio = useCallback((v: number) => {
    localStorage.setItem('belkaBrewRatio', String(v));
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio: v, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron });
    } else {
      setInternalBrewRatio(v);
    }
  }, [isControlled, onProfileChange, doseWeight, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron]);
  const setTotalWaterIn = useCallback((v: number) => {
    localStorage.setItem('belkaTotalWaterIn', String(v));
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio, totalWaterIn: v, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron });
    } else {
      setInternalTotalWaterIn(v);
    }
  }, [isControlled, onProfileChange, doseWeight, brewRatio, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron]);
  const setPourPlan = useCallback((fn: PourPlanEntry[] | ((prev: PourPlanEntry[]) => PourPlanEntry[])) => {
    const next = typeof fn === 'function' ? fn(isControlled ? controlledProfile.pourPlan : internalPourPlan) : fn;
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan: next, recipeFinishTimeSec, grinderName, grindSize, micron });
    } else {
      setInternalPourPlan(next);
    }
  }, [isControlled, onProfileChange, doseWeight, brewRatio, totalWaterIn, controlledProfile, internalPourPlan, recipeFinishTimeSec, grinderName, grindSize, micron]);
  const setRecipeFinishTimeSec = useCallback((v: number) => {
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec: v, grinderName, grindSize, micron });
    } else {
      setInternalRecipeFinishTimeSec(v);
    }
  }, [isControlled, onProfileChange, doseWeight, brewRatio, totalWaterIn, pourPlan, grinderName, grindSize, micron]);
  const setGrinderName = useCallback((v: string) => {
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName: v, grindSize, micron });
    } else {
      setInternalGrinderName(v);
    }
  }, [isControlled, onProfileChange, doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grindSize, micron]);
  const setGrindSize = useCallback((v: number) => {
    localStorage.setItem('belkaGrindSize', String(v));
    if (isControlled) {
      onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize: v, micron });
    } else {
      setInternalGrindSize(v);
    }
  }, [isControlled, onProfileChange, doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, micron]);
  // setMicron is handled by GrinderKnob internally

  useEffect(() => {
    if (swRunning) {
      swStartRef.current = Date.now() - swTime * 1000;
      swTimerRef.current = setInterval(() => {
        setSwTime(Math.floor((Date.now() - swStartRef.current) / 1000));
      }, 200);
    } else if (swTimerRef.current) {
      clearInterval(swTimerRef.current);
      swTimerRef.current = null;
    }
    return () => { if (swTimerRef.current) clearInterval(swTimerRef.current); };
  }, [swRunning]);

  const pourPlanCanvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    exportProfile: () => ({
      doseWeight,
      brewRatio,
      totalWaterIn,
      pourPlan,
      recipeFinishTimeSec,
      grinderName,
      grindSize,
      micron,
    }),
    importProfile: (profile) => {
      const p = {
        doseWeight: Number.isFinite(profile.doseWeight) ? profile.doseWeight : 15,
        brewRatio: Number.isFinite(profile.brewRatio) ? profile.brewRatio : 15,
        totalWaterIn: Number.isFinite(profile.totalWaterIn) ? profile.totalWaterIn : 225,
        pourPlan: Array.isArray(profile.pourPlan) ? profile.pourPlan : [],
        grinderName: profile.grinderName ?? '',
        grindSize: Number.isFinite(profile.grindSize) ? profile.grindSize : 0,
        micron: Number.isFinite(profile.micron) ? profile.micron : 0,
        recipeFinishTimeSec: Number.isFinite(profile.recipeFinishTimeSec) ? profile.recipeFinishTimeSec! : 0,
      };
      if (isControlled) {
        onProfileChange?.(p);
      } else {
        setInternalDoseWeight(p.doseWeight);
        setInternalBrewRatio(p.brewRatio);
        setInternalTotalWaterIn(p.totalWaterIn);
        setInternalPourPlan(p.pourPlan);
        setInternalGrinderName(p.grinderName);
        setInternalGrindSize(p.grindSize);
        setInternalMicron(p.micron);
        setInternalRecipeFinishTimeSec(p.recipeFinishTimeSec);
      }
      localStorage.setItem('belkaDoseWeight', String(p.doseWeight));
      localStorage.setItem('belkaBrewRatio', String(p.brewRatio));
      localStorage.setItem('belkaTotalWaterIn', String(p.totalWaterIn));
    },
    setFinishTime: (sec) => {
      if (isControlled) {
        onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec: sec, grinderName, grindSize, micron });
      } else {
        setInternalRecipeFinishTimeSec(sec);
      }
    },
    setGrindCalibration: (grindNum: number, micronVal: number) => {
      localStorage.setItem('belkaGrindSize', String(grindNum));
      if (isControlled) {
        onProfileChange?.({ doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize: grindNum, micron: micronVal });
      } else {
        setInternalGrindSize(grindNum);
        setInternalMicron(micronVal);
      }
    },
  }), [doseWeight, brewRatio, totalWaterIn, pourPlan, recipeFinishTimeSec, grinderName, grindSize, micron, isControlled, onProfileChange]);

  const totalBrewTime = ecProps?.totalBrewTime ?? 0;

  const handleCalculate = useCallback(() => {
    const water = doseWeight * brewRatio;
    setTotalWaterIn(water);
    localStorage.setItem('belkaTotalWaterIn', String(water));
    if (pourPlan.length === 0) {
      setPourPlan([
        { cumulativePercent: 20 },
        { cumulativePercent: 50 },
        { cumulativePercent: 80 },
        { cumulativePercent: 100 },
      ]);
    }
  }, [doseWeight, brewRatio, pourPlan.length]);

  const ecAtTime = useCallback((time: number): number | null => {
    if (!ecProps) return null;
    return ecProps.getECAtTime(time);
  }, [ecProps]);

  const handleDownloadRecipeReport = useCallback(() => {
    const pourCanvas = pourPlanCanvasRef.current;
    if (!pourCanvas || !ecProps) return;
    const rowH = 13;
    const headerH = 80;
    const tableH = pourPlan.length > 0 ? (28 + pourPlan.length * rowH) : 0;
    const graphH = pourCanvas.height;
    const graphW = pourCanvas.width;
    const w = Math.max(600, graphW);
    const totalH = headerH + tableH + graphH + 20;
    const tmp = document.createElement('canvas');
    tmp.width = w * 2;
    tmp.height = totalH * 2;
    const ctx = tmp.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, totalH);

    let ly = 10;
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Recipe', 12, ly); ly += 22;
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`Dose: ${Number.isFinite(doseWeight) ? doseWeight.toFixed(1) : '—'} g  |  Ratio: 1:${Number.isFinite(brewRatio) ? brewRatio.toFixed(1) : '—'}  |  Water: ${Number.isFinite(totalWaterIn) ? totalWaterIn.toFixed(0) : '—'} g`, 12, ly); ly += 18;
    if (grinderName || (grindSize != null && grindSize > 0) || (micron != null && micron > 0)) {
      ctx.fillText(`Grinder: ${grinderName || '—'}  |  Size: ${(grindSize != null && grindSize > 0) ? `#${grindSize}` : '—'}  |  Micron: ${(micron != null && micron > 0) ? `${micron}µm` : '—'}`, 12, ly);
    }

    if (pourPlan.length > 0) {
      ly += 24;
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('Pour Plan', 12, ly); ly += 18;
      const cols = ['#', 'Cum.%', 'EC', 'Cum.g', 'Δg', 'Δ%', 'Dur.', 'Time'];
      const colW = [24, 56, 48, 60, 60, 56, 44, 64];
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#64748b';
      let cx = 12;
      cols.forEach((c, i) => { ctx.fillText(c, cx, ly); cx += colW[i]; });
      ly += 15;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, ly - 2); ctx.lineTo(12 + colW.reduce((a,b) => a + b, 0), ly - 2); ctx.stroke();
      ctx.fillStyle = '#334155';
      const totalG = Number.isFinite(totalWaterIn) && totalWaterIn > 0 ? totalWaterIn : 0;
      const dt = ecProps.totalBrewTime > 0 ? ecProps.totalBrewTime : 1;
      const sortedEC = [...ecProps.getCurrentData()].sort((a, b) => a.time - b.time);
      let prevPct = 0;
      pourPlan.forEach((entry, i) => {
        const pct = entry.cumulativePercent;
        const cumG = totalG * pct / 100;
        const deltaG = cumG - totalG * prevPct / 100;
        const deltaPct = pct - prevPct;
        const tSec = (pct / 100) * dt;
        const ecVal = sortedEC.length > 0 ? ecAtTime(tSec) ?? 0 : 0;
        const durStr = entry.duration != null ? `${entry.duration}s` : '—';
        const vals = [String(i + 1), pct.toFixed(1) + '%', ecVal.toFixed(2), cumG.toFixed(0), deltaG.toFixed(0), deltaPct.toFixed(1) + '%', durStr, `${Math.floor(tSec / 60)}:${(Math.floor(tSec) % 60).toString().padStart(2, '0')}`];
        cx = 12;
        vals.forEach((v, j) => { ctx.fillText(v, cx, ly); cx += colW[j]; });
        ly += rowH;
        prevPct = pct;
      });
    }

    ly += 10;
    ctx.drawImage(pourCanvas, 0, ly, graphW, graphH);

    const link = document.createElement('a');
    link.href = tmp.toDataURL('image/png');
    link.download = `belka_recipe_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pourPlan, doseWeight, brewRatio, totalWaterIn, grinderName, grindSize, micron, ecProps, ecAtTime]);

  return (
    <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white">
      <div className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-2">Recipe & Pour Planning</h3>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Dose</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={doseWeight}
                  onChange={(e) => {
                    const v = Math.max(0.1, parseFloat(e.target.value) || 15);
                    setDoseWeight(v);
                    localStorage.setItem('belkaDoseWeight', String(v));
                  }}
                  className="w-20 px-2 py-1.5 text-sm font-bold text-emerald-800 border-2 border-emerald-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                />
                <span className="text-xs font-medium text-slate-400">g</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ratio</label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-slate-400">1:</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={0.1}
                  value={brewRatio}
                  onChange={(e) => {
                    const v = Math.min(30, Math.max(1, parseFloat(e.target.value) || 15));
                    setBrewRatio(v);
                    localStorage.setItem('belkaBrewRatio', String(v));
                  }}
                  className="w-16 px-2 py-1.5 text-sm font-bold text-emerald-800 border-2 border-emerald-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCalculate}
              className="text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-5 py-2 shadow-sm transition-colors"
            >
              Calculate
            </button>
            <span className="text-sm font-bold text-emerald-700 tabular-nums px-1">
              {(() => {
                const w = totalWaterIn > 0 ? totalWaterIn : doseWeight * brewRatio;
                return `${w}g water`;
              })()}
            </span>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Finish Time</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={recipeFinishTimeSec > 0 ? Math.floor(recipeFinishTimeSec / 60) : ''}
                  onChange={(e) => {
                    const m = Math.max(0, parseInt(e.target.value) || 0);
                    setRecipeFinishTimeSec(m * 60 + (recipeFinishTimeSec % 60));
                  }}
                  placeholder={totalBrewTime > 0 ? String(Math.floor(totalBrewTime / 60)) : 'mm'}
                  className="w-14 px-2 py-1.5 text-sm font-bold text-emerald-800 border-2 border-emerald-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                />
                <span className="text-sm font-bold text-slate-400">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  value={recipeFinishTimeSec > 0 ? (recipeFinishTimeSec % 60) : ''}
                  onChange={(e) => {
                    const s = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                    setRecipeFinishTimeSec(Math.floor(recipeFinishTimeSec / 60) * 60 + s);
                  }}
                  placeholder={totalBrewTime > 0 ? String(totalBrewTime % 60).padStart(2, '0') : 'ss'}
                  className="w-14 px-2 py-1.5 text-sm font-bold text-emerald-800 border-2 border-emerald-400 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                />
                {brewTargetSec != null && (
                  <button
                    type="button"
                    onClick={() => setRecipeFinishTimeSec(brewTargetSec)}
                    title={`Import plan time (${Math.floor(brewTargetSec / 60)}:${String(brewTargetSec % 60).padStart(2, '0')})`}
                    className="px-2 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 shadow-sm"
                  >
                    ← Plan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-1">
          <GrinderKnob
            grinderName={grinderName}
            onGrinderNameChange={setGrinderName}
            grindSize={grindSize}
            onGrindSizeChange={setGrindSize}
            micron={micron}
            expectedTDSMin={expectedTDSMin}
            expectedTDSMax={expectedTDSMax}
          />
        </div>

        <div className="space-y-2">
          <div className="overflow-x-auto">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium px-1">
            <span className="w-12">Pour #</span>
            <span className="w-28">Target</span>
            <span className="w-28 text-right">Cumul. g</span>
            <span className="w-24 text-right">Delta g</span>
            <span className="w-16 text-right">Delta %</span>
            <span className="w-14 text-right">Dur.s</span>
            <span className="w-16 text-right">Time</span>
            {ecProps && <span className="w-16 text-right text-violet-500">EC</span>}
            <span className="w-8" />
          </div>
          {pourPlan.map((entry, idx) => {
            const prevCumul = idx === 0 ? 0 : pourPlan[idx - 1].cumulativePercent;
            const deltaPct = entry.cumulativePercent - prevCumul;
            const totalWater = totalWaterIn > 0 ? totalWaterIn : doseWeight * brewRatio;
            const cumulativeG = Number((totalWater * entry.cumulativePercent / 100).toFixed(1));
            const deltaG = Number((totalWater * deltaPct / 100).toFixed(1));
            const useTime = recipeFinishTimeSec > 0 ? recipeFinishTimeSec : totalBrewTime;
            const pourTime = useTime > 0 ? (entry.cumulativePercent / 100) * useTime : 0;
            const ecVal = ecProps ? ecAtTime(pourTime) : null;
            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="w-12 text-slate-500 font-medium">#{idx + 1}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={entry.cumulativePercent}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        setPourPlan(prev => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], cumulativePercent: 0 };
                          return next;
                        });
                        return;
                      }
                      const parsed = parseFloat(raw);
                      if (Number.isFinite(parsed)) {
                        setPourPlan(prev => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], cumulativePercent: parsed };
                          return next;
                        });
                      }
                    }}
                    className="w-20 px-2 py-1 text-sm border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400 text-center"
                  />
                  <span className="text-slate-400">%</span>
                </div>
                <span className="w-28 text-right text-slate-600 font-medium tabular-nums">{cumulativeG}g</span>
                <span className="w-24 text-right text-slate-500 tabular-nums">+{deltaG}g</span>
                <span className="w-16 text-right text-slate-400 text-xs tabular-nums">({deltaPct > 0 ? '+' : ''}{deltaPct}%)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={entry.duration ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPourPlan(prev => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], duration: raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0) };
                      return next;
                    });
                  }}
                  placeholder="s"
                  className="w-14 px-1 py-0.5 text-xs border border-slate-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="w-16 text-right text-slate-600 tabular-nums text-xs">{Math.floor(pourTime / 60)}:{Math.round(pourTime % 60).toString().padStart(2, '0')}</span>
                {ecVal != null && (
                  <span className="w-16 text-right text-violet-600 tabular-nums text-xs font-medium">{ecVal.toFixed(2)}</span>
                )}
                <button
                  type="button"
                  onClick={() => setPourPlan(prev => prev.filter((_, i) => i !== idx))}
                  className="ml-1 text-red-400 hover:text-red-600 text-xs font-bold px-1.5"
                  title="Remove pour"
                >
                  ✕
                </button>
              </div>
            );
          })}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPourPlan(prev => [...prev, { cumulativePercent: prev.length === 0 ? 100 : 100 }])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              + Add Pour
            </button>
            {pourPlan.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const n = pourPlan.length;
                  setPourPlan(pourPlan.map((_, i) => ({
                    cumulativePercent: Math.round((100 * (i + 1)) / n),
                  })));
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition-colors border border-emerald-200"
              >
                Distribute Evenly
              </button>
            )}
          </div>

          {pourPlan.length > 0 && (
            <div className="mt-2">
              {(() => {
                const lastPct = pourPlan[pourPlan.length - 1].cumulativePercent;
                const ok = lastPct >= 99.5;
                return (
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(100, lastPct)}%` }}
                      />
                    </div>
                    <span className={`font-semibold tabular-nums ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {lastPct.toFixed(0)}% cumulative
                    </span>
                    {!ok && (
                      <span className="text-amber-600">{(100 - lastPct).toFixed(0)}% to target</span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          </div>

          {/* Stopwatch */}
          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl font-bold text-slate-700 tabular-nums font-mono tracking-wider">
                {String(Math.floor(swTime / 60)).padStart(2, '0')}:{String(swTime % 60).padStart(2, '0')}
              </span>
              <div className="flex items-center gap-2">
                {!swRunning ? (
                  <button type="button" onClick={() => { setSwRunning(true); setSwLaps([]); setSwTime(0); }} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 shadow-sm">▶ Start</button>
                ) : (
                  <>
                    <button type="button" onClick={() => {
                      const idx = swLaps.length;
                      setSwLaps(prev => [...prev, { time: swTime, pourIdx: idx }]);
                      if (idx + 1 >= pourPlan.length) {
                        setSwRunning(false);
                        setRecipeFinishTimeSec(swTime);
                      }
                    }} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 shadow-sm">⏱ Lap {swLaps.length + 1}</button>
                    <button type="button" onClick={() => setSwRunning(false)} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 shadow-sm">⏹ Stop</button>
                  </>
                )}
              </div>
            </div>
            {swLaps.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {swLaps.map((lap, i) => (
                  <span key={i} className="tabular-nums font-medium">#{i + 1} {String(Math.floor(lap.time / 60)).padStart(2, '0')}:{String(lap.time % 60).padStart(2, '0')}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {pourPlan.length > 0 && totalBrewTime > 0 && ecProps && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-end mb-1 gap-2">
            <button
              onClick={handleDownloadRecipeReport}
              className="px-3 py-1 rounded-lg border border-amber-300 bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
            >
              Recipe Report
            </button>
          </div>
          <PourPlanGraph
            ref={pourPlanCanvasRef}
            pourPlan={pourPlan}
            totalBrewTime={totalBrewTime}
            ecPoints={ecProps.getCurrentData()}
            brewData={ecProps.effectivePourData ? {
              cumulativePour: ecProps.effectivePourData.values,
              intervalSeconds: ecProps.effectivePourData.intervalSeconds,
            } : null}
          />
        </div>
      )}
    </div>
  );
});

RecipePourPlanning.displayName = 'RecipePourPlanning';
export default RecipePourPlanning;
