import { useCallback, useEffect, useRef, useState } from 'react';
import Brew from './Brew';

type Roast = 'light' | 'medium' | 'dark';
type Process = 'washed' | 'natural' | 'anaerobic' | 'honey';
type BurrProfileName = 'mazzer' | 'comandante' | 'commercial' | 'budget' | 'standard';

interface BurrProfile {
  name: BurrProfileName;
  label: string;
  desc: string;
  sdModifier: number;
  finesTail: number;
  bimodalFines: number;
  bimodalCoarse: number;
}

const BURR_PROFILES: BurrProfile[] = [
  { name: 'mazzer', label: 'Mazzer Precision', desc: 'Laser-cut, deep flavor, tight spread',
    sdModifier: 0.7, finesTail: 0.5, bimodalFines: 0, bimodalCoarse: 0 },
  { name: 'comandante', label: 'Comandante', desc: 'Aroma-biased, deliberate chunks for clarity',
    sdModifier: 0.85, finesTail: 0.6, bimodalFines: 0.1, bimodalCoarse: 1.2 },
  { name: 'commercial', label: 'Commercial Flat', desc: 'Very uniform fine, bad for filter',
    sdModifier: 0.5, finesTail: 1.0, bimodalFines: 0, bimodalCoarse: 0 },
  { name: 'budget', label: 'Budget Conical', desc: 'Uneven, high fines, messy spread',
    sdModifier: 1.6, finesTail: 1.8, bimodalFines: 1.0, bimodalCoarse: 0 },
  { name: 'standard', label: 'Standard Conical', desc: 'General purpose conical',
    sdModifier: 1.0, finesTail: 1.0, bimodalFines: 0.5, bimodalCoarse: 0 },
];

const micronSizes = [0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400];

export default function Simulation() {
  const [grindSetting, setGrindSetting] = useState(20);
  const [grindMin, setGrindMin] = useState(1);
  const [grindMax, setGrindMax] = useState(40);
  const [rpm, setRpm] = useState(0);
  const [angle, setAngle] = useState(0);
  const [progress, setProgress] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [targetRpm, setTargetRpm] = useState(60);
  const [dose, setDose] = useState(18);
  const [waterTempC, setWaterTempC] = useState(92);
  const [roast, setRoast] = useState<Roast>('medium');
  const [process, setProcess] = useState<Process>('washed');
  const [humidity, setHumidity] = useState(50);
  const [burrProfile, setBurrProfile] = useState<BurrProfile>(BURR_PROFILES[4]);
  const [dia, setDia] = useState(48);
  const [mode, setMode] = useState<'simulate' | 'manual'>('simulate');
  const [manualRaw, setManualRaw] = useState<number[]>(() => micronSizes.map(() => 5));
  const [calibrated, setCalibrated] = useState<number[] | null>(null);
  const [tapWeight, setTapWeight] = useState(5);

  // K-value derived from roast + process
  function computeKValue(r: Roast, p: Process) {
    const base = r === 'light' ? 80 : r === 'medium' ? 50 : 25;
    const mod = p === 'washed' ? 5 : p === 'honey' ? 0 : p === 'natural' ? -5 : -10;
    return Math.max(10, Math.min(100, base + mod));
  }
  const kValue = computeKValue(roast, process);

  const spinRef = useRef<{ velocity: number; dragging: boolean; lastA: number; lastT: number }>({
    velocity: 0, dragging: false, lastA: 0, lastT: 0,
  });
  const totalAngleRef = useRef(0);
  const autoRef = useRef(false);
  const targetRpmRef = useRef(60);
  const doseRef = useRef(18);
  const kValueRef = useRef(50);
  const grindRef = useRef(20);
  const diaRef = useRef(48);
  const startTimeRef = useRef(0);
  const loggedRef = useRef(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [logs, setLogs] = useState<{ dose: number; grind: number; min: number; max: number; rotations: number; time: number; rpm: number; date: string }[]>([]);

  const totalNeeded = totalDegreesNeeded(dose, grindSetting);
  const remainingDeg = Math.max(0, totalNeeded - totalAngleRef.current);
  const effectiveRpm = autoMode ? targetRpm : (rpm > 1 ? rpm : 0);
  const estSeconds = effectiveRpm > 0 ? remainingDeg / (effectiveRpm * 6) : 0;
  autoRef.current = autoMode;
  targetRpmRef.current = targetRpm;
  doseRef.current = dose;
  kValueRef.current = kValue;
  grindRef.current = grindSetting;
  diaRef.current = dia;

  function totalDegreesNeeded(d: number, g: number) {
    const rotPerGram = 2 + 80 / (g + 4);
    return d * rotPerGram * 360;
  }

  function calcProgress(totalAngle: number, d: number, g: number) {
    const needed = totalDegreesNeeded(d, g);
    return Math.min(100, (totalAngle / needed) * 100);
  }

  const getAngle = useCallback((cx: number, cy: number, px: number, py: number) =>
    Math.atan2(py - cy, px - cx) * (180 / Math.PI), []);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (autoMode) return;
    const el = knobRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const s = spinRef.current;
    s.dragging = true;
    s.lastA = getAngle(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
    s.lastT = performance.now();
  }, [getAngle, autoMode]);

  const onMove = useCallback((e: React.PointerEvent) => {
    const s = spinRef.current;
    if (!s.dragging) return;
    const el = knobRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a = getAngle(cx, cy, e.clientX, e.clientY);
    let d = a - s.lastA;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    s.lastA = a;
    const now = performance.now();
    const dt = Math.max(16, now - s.lastT);
    s.lastT = now;
    s.velocity = s.velocity * 0.7 + (d / dt) * 0.3;
    setAngle(prev => prev + d);
    setRpm(Math.abs(s.velocity * 60));
    if (totalAngleRef.current === 0) startTimeRef.current = performance.now();
    totalAngleRef.current += Math.abs(d);
    setProgress(calcProgress(totalAngleRef.current, doseRef.current, grindRef.current));
  }, [getAngle, dose]);

  const onUp = useCallback(() => {
    spinRef.current.dragging = false;
  }, []);

  const toggleAuto = useCallback(() => {
    setAutoMode(prev => !prev);
    if (progress >= 100) setProgress(0);
  }, [progress]);

  const resetGrind = useCallback(() => {
    totalAngleRef.current = 0;
    loggedRef.current = false;
    startTimeRef.current = 0;
    setProgress(0);
    setAngle(0);
    spinRef.current.velocity = 0;
  }, []);

  const skipGrind = useCallback(() => {
    const needed = totalDegreesNeeded(doseRef.current, grindRef.current);
    totalAngleRef.current = needed;
    setProgress(100);
    setAutoMode(false);
    autoRef.current = false;
    if (!loggedRef.current) {
      loggedRef.current = true;
      const rpm_ = autoRef.current ? targetRpmRef.current : Math.max(1, Math.round(rpm) || targetRpm);
      const estSec = (needed / 360) / (rpm_ / 60);
      finishLog(estSec);
    }
  }, [rpm, targetRpm, grindMin, grindMax]);

  useEffect(() => {
    const tick = () => {
      const s = spinRef.current;
      let newP: number;

      if (autoRef.current) {
        newP = calcProgress(totalAngleRef.current, doseRef.current, grindRef.current);
        if (newP < 100) {
          const autoAngle = (targetRpmRef.current / 60) * 16 * 6;
          setAngle(prev => prev + autoAngle);
          if (totalAngleRef.current === 0) startTimeRef.current = performance.now();
          totalAngleRef.current += autoAngle;
          newP = calcProgress(totalAngleRef.current, doseRef.current, grindRef.current);
          setProgress(newP);
          setRpm(targetRpmRef.current);
        }
        if (newP >= 100 && !loggedRef.current) {
          loggedRef.current = true;
          autoRef.current = false;
          setAutoMode(false);
          setRpm(0);
          finishLog();
        }
      } else if (!s.dragging && Math.abs(s.velocity) > 0.001) {
        const friction = 0.92 + (kValueRef.current / 100) * 0.06;
        const inertia = Math.min(3, diaRef.current / 40);
        s.velocity *= Math.pow(friction, 1 / inertia);
        const d = s.velocity * 16;
        setAngle(prev => prev + d);
        setRpm(Math.abs(s.velocity * 60));
        if (totalAngleRef.current === 0) startTimeRef.current = performance.now();
        totalAngleRef.current += Math.abs(d);
        newP = calcProgress(totalAngleRef.current, doseRef.current, grindRef.current);
        setProgress(newP);
        if (newP >= 100 && !loggedRef.current) {
          loggedRef.current = true;
          finishLog();
        }
      } else if (!s.dragging) {
        setRpm(0);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  function finishLog(estSec?: number) {
    setLogs(prev => [{
      dose: doseRef.current,
      grind: grindRef.current,
      min: grindMin,
      max: grindMax,
      rotations: Math.round(totalAngleRef.current / 360),
      time: estSec ?? (startTimeRef.current > 0 ? (performance.now() - startTimeRef.current) / 1000 : 0),
      rpm: autoRef.current ? targetRpmRef.current : Math.round(rpm),
      date: new Date().toLocaleTimeString(),
    }, ...prev]);
  }

  const progressColor = progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500';

  function clickToMicron(c: number) { return Math.round(200 + (c / 40) * 1200); }

  const micronSetting = clickToMicron(grindSetting);
  const micronMin = clickToMicron(grindMin);
  const micronMax = clickToMicron(grindMax);

  // ---------- Distribution model ----------
  const [siftSeed, setSiftSeed] = useState(0);

  // Gaussian random (Box-Muller)
  function randn(seed: number) {
    const x = Math.sin(seed * 12.9898 + 43758.5453) * 0.5 + 0.5;
    const y = Math.cos(seed * 78.233 + 234.567) * 0.5 + 0.5;
    return Math.sqrt(-2 * Math.log(Math.max(0.001, x))) * Math.cos(2 * Math.PI * y);
  }

  function computeDistribution() {
    // When calibrated from manual taps, use that as baseline + noise
    if (calibrated) {
      const processVar = process === 'washed' ? 0.8 : process === 'honey' ? 1.0 : process === 'natural' ? 1.2 : 1.3;
      const humidityFactor = 1 + (1 - humidity / 100) * 0.4;
      const noiseScale = 3; // percentage points of std dev per sift
      const total = calibrated.map((v, i) => {
        const noise = randn(siftSeed * 100 + i) * processVar * humidityFactor * noiseScale;
        return Math.max(0, v + noise);
      });
      const sum = total.reduce((a, b) => a + b, 0);
      return total.map(v => sum > 0 ? (v / sum) * 100 : 0);
    }

    const center = micronSetting;
    const spread = Math.max(50, (micronMax - micronMin) / 2);
    let stdDev = spread * 0.4;
    stdDev *= burrProfile.sdModifier;

    const processVar = process === 'washed' ? 0.8 : process === 'honey' ? 1.0 : process === 'natural' ? 1.2 : 1.3;
    const humidityFactor = 1 + (1 - humidity / 100) * 0.4;
    const roastFines = roast === 'dark' ? 1.4 : roast === 'medium' ? 1.0 : 0.7;
    const densityFines = kValue / 50;

    const total: number[] = [];
    for (let i = 0; i < micronSizes.length; i++) {
      const m = micronSizes[i];
      const diff = m - center;
      const noise = randn(siftSeed * 100 + i) * processVar * humidityFactor * 15;
      let p = Math.exp(-(diff * diff) / (2 * stdDev * stdDev)) * 100;

      if (m < center) {
        const finesBoost = roastFines * densityFines * burrProfile.finesTail
          * Math.exp(-(diff * diff) / (2 * stdDev * 0.3 * stdDev * 0.3));
        p += finesBoost * 15;
      }

      if (burrProfile.bimodalFines > 0 && m < center * 0.6) {
        const bimodal = Math.exp(-((m - center * 0.35) ** 2) / (2 * stdDev * 0.5 * stdDev * 0.5));
        p += bimodal * burrProfile.bimodalFines * 20;
      }

      if (burrProfile.bimodalCoarse > 0 && m > center * 1.1) {
        const coarsePeak = Math.exp(-((m - center * 1.4) ** 2) / (2 * stdDev * 0.6 * stdDev * 0.6));
        p += coarsePeak * burrProfile.bimodalCoarse * 20;
      }

      total.push(Math.max(0, p + noise));
    }

    const sum = total.reduce((a, b) => a + b, 0);
    return total.map(v => sum > 0 ? (v / sum) * 100 : 0);
  }

  function computeManualDistribution() {
    const sum = manualRaw.reduce((a, b) => a + b, 0);
    return manualRaw.map(v => sum > 0 ? (v / sum) * 100 : 0);
  }

  const distribution = mode === 'simulate' ? computeDistribution() : computeManualDistribution();

  // Surface area estimate
  function computeSurfaceArea(dist: number[]) {
    const density_g_per_cm3 = 1.3; // average coffee density
    let totalArea = 0;
    for (let i = 0; i < dist.length; i++) {
      const micron = micronSizes[i];
      if (micron === 0) continue;
      const radius_cm = (micron / 2) / 10000; // microns to cm
      const mass_g = dose * (dist[i] / 100);
      const volume_per_particle = (4 / 3) * Math.PI * radius_cm * radius_cm * radius_cm;
      const numParticles = volume_per_particle > 0 ? mass_g / (density_g_per_cm3 * volume_per_particle) : 0;
      const surface_per_particle = 4 * Math.PI * radius_cm * radius_cm;
      totalArea += numParticles * surface_per_particle;
    }
    return totalArea;
  }

  const surfaceArea = computeSurfaceArea(distribution);
  const finesPct = distribution.slice(0, 4).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 select-none">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-center">
        Grind Simulator
      </h2>

      {/* Min / Grind / Max inputs */}
      <div className="flex items-center gap-3 max-w-xs mx-auto">
        <div className="flex-1">
          <span className="text-[8px] text-blue-500 font-semibold">Min</span>
          <input type="number" min={0} max={40} step={1} value={grindMin}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGrindMin(Math.max(0, Math.min(40, v))); }}
            className="w-full text-center text-sm font-bold text-blue-800 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-blue-200 rounded-lg py-2" />
          <div className="text-[7px] text-blue-400 text-center mt-0.5">{micronMin}µm</div>
        </div>
        <div className="flex-1">
          <span className="text-[8px] text-blue-600 font-bold">Grind</span>
          <input type="number" min={0} max={40} step={1} value={grindSetting}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGrindSetting(Math.max(0, Math.min(40, v))); }}
            className="w-full text-center text-sm font-bold text-blue-800 bg-blue-50 border-2 border-blue-400 rounded-lg py-2" />
          <div className="text-[7px] text-blue-600 text-center mt-0.5 font-semibold">{micronSetting}µm</div>
        </div>
        <div className="flex-1">
          <span className="text-[8px] text-blue-500 font-semibold">Max</span>
          <input type="number" min={0} max={40} step={1} value={grindMax}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setGrindMax(Math.max(0, Math.min(40, v))); }}
            className="w-full text-center text-sm font-bold text-blue-800 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-blue-200 rounded-lg py-2" />
          <div className="text-[7px] text-blue-400 text-center mt-0.5">{micronMax}µm</div>
        </div>
      </div>

      {/* Kruve ruler + distribution histogram */}
      <div className="max-w-xs mx-auto w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Particle size distribution</span>
          <button onClick={() => { setMode(m => {
            const next = m === 'simulate' ? 'manual' : 'simulate';
            if (next === 'simulate' && m === 'manual') {
              const sum = manualRaw.reduce((a, b) => a + b, 0);
              const norm = sum > 0 ? manualRaw.map(v => (v / sum) * 100) : [];
              setCalibrated(norm);
            }
            return next;
          }); }}
            className={`text-[7px] font-bold rounded px-1.5 py-0.5 border transition-all ${
              mode === 'manual'
                ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-700 border-amber-300'
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}>
            {mode === 'simulate' ? '✋ Manual Kruve' : '⚙ Simulate'}
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {micronSizes.map((m, i) => {
            const inRange = m >= micronMin && m <= micronMax;
            const isCenter = m === micronSetting;
            const isFines = m < 200;
            const pct = distribution[i];
            const raw = manualRaw[i];
            const barH = Math.max(4, pct * 1.5);
            const containerH = 50;
            return (
              <div key={m} className={`flex flex-col items-center gap-0.5 shrink-0 ${isFines ? 'opacity-60' : ''} ${mode === 'manual' ? 'cursor-pointer' : ''}`}
                style={{ width: isFines ? 16 : 28 }}
                onClick={() => {
                  if (mode !== 'manual') return;
                  setManualRaw(prev => {
                    const c = [...prev];
                    const cM = micronSizes[i];
                    let totalW = 0;
                    const ws = micronSizes.map(bM => {
                      const d = bM - cM;
                      const w = Math.exp(-(d * d) / (2 * 60 * 60));
                      totalW += w;
                      return w;
                    });
                    ws.forEach((w, j) => {
                      c[j] = Math.min(200, c[j] + tapWeight * (w / totalW));
                    });
                    return c;
                  });
                }}
                onContextMenu={e => {
                  if (mode !== 'manual') return;
                  e.preventDefault();
                  setManualRaw(prev => { const c = [...prev]; c[i] = Math.max(0, c[i] - 1); return c; });
                }}>
                {/* Bar — bordered slot well */}
                <div className="w-full rounded-sm flex items-end justify-center transition-all"
                  style={{
                    height: containerH,
                    border: isCenter ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                  }}>
                  <div className="w-full rounded-sm transition-all"
                    style={{
                      height: barH,
                      backgroundColor: isFines ? '#fca5a5' : isCenter ? '#3b82f6' : inRange ? '#93c5fd' : '#e2e8f0',
                    }}
                  />
                </div>
                {/* Hole dot — skip for sub-200 (no sieve) */}
                {!isFines && <div className="rounded-full"
                  style={{
                    width: 8 + (m / 1400) * 16,
                    height: 8 + (m / 1400) * 16,
                    backgroundColor: isCenter ? '#3b82f6' : inRange ? '#93c5fd' : '#e2e8f0',
                    border: isCenter ? '2px solid #1d4ed8' : inRange ? '1px solid #60a5fa' : '1px solid #cbd5e1',
                    boxShadow: isCenter ? '0 0 6px rgba(59,130,246,0.5)' : 'none',
                  }}
                />}
                <span className={`text-[6px] font-mono ${isFines ? 'text-red-400' : isCenter ? 'text-blue-700 font-bold' : inRange ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600 dark:text-slate-600'}`}>
                  {m}
                </span>
                <span className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
                  {mode === 'manual' ? `${Math.round(raw)}` : `${pct.toFixed(1)}%`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-x-2">
            <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400">Surface: <strong className="text-blue-700">{surfaceArea.toFixed(0)} cm²</strong></span>
            <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400">Fines &lt;200µm: <strong className="text-red-500 dark:text-red-400 dark:text-red-400">
              {finesPct.toFixed(1)}%</strong></span>
            {mode === 'simulate' ? (
              <div className="flex items-center gap-1">
                {calibrated && (
                  <>
                    <span className="text-[7px] text-emerald-600 font-semibold">✓ Calibrated</span>
                    <button onClick={() => setCalibrated(null)}
                      className="text-[7px] text-red-400 hover:text-red-600 border border-red-200 rounded px-1">
                      ✕
                    </button>
                  </>
                )}
                <button onClick={() => setSiftSeed(prev => prev + 1)}
                  className="text-[8px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 dark:border-amber-800 rounded px-2 py-0.5 hover:bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30">
                  ⟳ Sift
                </button>
              </div>
            ) : (
              <button onClick={() => setManualRaw(micronSizes.map(() => 5))}
                className="text-[8px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400 bg-slate-100 border border-slate-300 dark:border-slate-600 dark:border-slate-600 rounded px-2 py-0.5 hover:bg-slate-200">
                ↻ Reset taps
              </button>
            )}
        </div>
        {mode === 'manual' && (
          <div className="mt-1.5 flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mr-0.5">Tap:</span>
              {[{v: 1, l: '+1'}, {v: 5, l: '+5'}, {v: 10, l: '+10'}, {v: 25, l: '+25'}, {v: 50, l: '+50'}, {v: 200, l: 'Fill'}].map(p => (
                <button key={p.v} onClick={() => setTapWeight(p.v)}
                  className={`text-[7px] font-bold rounded px-1.5 py-0.5 border transition-all ${
                    tapWeight === p.v
                      ? 'bg-amber-200 text-amber-800 dark:text-amber-200 dark:text-amber-200 border-amber-400'
                      : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'
                  }`}>
                  {p.l}
                </button>
              ))}
            </div>
            <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 italic text-center">
              {tapWeight >= 200 ? 'Fills the slot — particles smear into adjacent holes' : `+${tapWeight} particles, smears across neighbors`} · Right-click removes 1
            </div>
          </div>
        )}
        {mode === 'simulate' && calibrated && (
          <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 italic mt-0.5 text-center">
            Sift applies noise to your Kruve calibration. Bean params control variance.
          </div>
        )}
      </div>

      {/* Bean parameters */}
      <div className="max-w-xs mx-auto w-full">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Roast */}
          <div className="flex-1 min-w-[60px]">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Roast</span>
            <select value={roast} onChange={e => setRoast(e.target.value as Roast)}
              className="w-full text-[10px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded py-1.5 px-1">
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          {/* Process */}
          <div className="flex-1 min-w-[60px]">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Process</span>
            <select value={process} onChange={e => setProcess(e.target.value as Process)}
              className="w-full text-[10px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded py-1.5 px-1">
              <option value="washed">Washed</option>
              <option value="natural">Natural</option>
              <option value="anaerobic">Anaerobic</option>
              <option value="honey">Honey</option>
            </select>
          </div>
          {/* Burr profile */}
          <div className="flex-1 min-w-[80px]">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Burr</span>
            <select value={burrProfile.name} onChange={e => {
              const found = BURR_PROFILES.find(b => b.name === e.target.value);
              if (found) setBurrProfile(found);
            }}
              className="w-full text-[10px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded py-1.5 px-1">
              {BURR_PROFILES.map(b => (
                <option key={b.name} value={b.name}>{b.label}</option>
              ))}
            </select>
            <div className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-0.5 leading-tight">{burrProfile.desc}</div>
          </div>
          {/* Humidity */}
          <div className="flex-[2] min-w-[80px]">
            <div className="flex items-center justify-between text-[7px] mb-0.5">
              <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Humidity</span>
              <span className="font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">{humidity}%</span>
            </div>
            <input type="range" min={10} max={90} step={5} value={humidity}
              onChange={e => setHumidity(parseInt(e.target.value))}
              className="w-full h-1 accent-blue-500" />
          </div>

          {/* Water temperature */}
          <div className="flex-[2] min-w-[80px]">
            <div className="flex items-center justify-between text-[7px] mb-0.5">
              <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Water Temp</span>
              <span className="font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">{waterTempC}C</span>
            </div>
            <input type="range" min={75} max={100} step={1} value={waterTempC}
              onChange={e => setWaterTempC(parseInt(e.target.value))}
              className="w-full h-1 accent-rose-500" />
          </div>
        </div>
      </div>

      {/* Burr diameter */}
      <div className="max-w-xs mx-auto w-full">
        <div className="flex items-center justify-between text-[7px] mb-0.5">
          <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Burr Ø{dia}mm</span>
          <span className="font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">{dia >= 80 ? 'High inertia' : dia >= 60 ? 'Medium inertia' : 'Light spin'}</span>
        </div>
        <input type="range" min={40} max={120} step={2} value={dia}
          onChange={e => setDia(parseInt(e.target.value))}
          className="w-full h-1 accent-purple-500" />
        <div className="flex justify-between text-[6px] text-slate-300 dark:text-slate-600 dark:text-slate-600 mt-px">
          <span>40mm</span><span>80mm</span><span>120mm</span>
        </div>
      </div>

      {/* Dose + Target RPM */}
      <div className="flex items-center gap-3 max-w-xs mx-auto">
        <div className="flex-1">
          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 font-semibold">Dose (g)</span>
          <input type="number" min={1} max={60} step={0.5} value={dose}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setDose(v); }}
            className="w-full text-center text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg py-2" />
        </div>
        <div className="flex-1">
          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 font-semibold">Target RPM</span>
          <input type="number" min={1} max={1800} step={5} value={targetRpm}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTargetRpm(Math.max(1, Math.min(1800, v))); }}
            className="w-full text-center text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg py-2" />
        </div>
      </div>

      {/* Spin wheel */}
      <div className="flex flex-col items-center">
        <div ref={knobRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative w-48 h-48 rounded-full cursor-grab active:cursor-grabbing touch-none select-none"
          style={{
            background: 'conic-gradient(from 0deg, #dbeafe, #bfdbfe, #93c5fd, #bfdbfe, #dbeafe, #bfdbfe, #93c5fd, #bfdbfe, #dbeafe)',
            boxShadow: 'inset 0 -2px 6px rgba(0,0,0,0.1), 0 4px 12px rgba(59,130,246,0.25)',
            transform: `rotate(${angle}deg)`,
            transition: spinRef.current.dragging || autoMode ? 'none' : 'transform 0.05s ease-out',
            opacity: progress >= 100 ? 0.5 : 1,
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="absolute w-0.5 h-2 bg-blue-400/40 rounded-full"
              style={{
                top: '50%', left: '50%',
                transformOrigin: 'center center',
                transform: `rotate(${i * 15}deg) translateY(-88px)`,
              }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 dark:bg-slate-800 border-2 border-blue-300 flex items-center justify-center shadow-inner">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-800 leading-none">{grindSetting}</div>
                <div className="text-[7px] text-blue-400 mt-0.5">click</div>
              </div>
            </div>
          </div>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-5 bg-orange-500 rounded-full shadow-sm" />
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs mt-4">
          <div className="flex items-center justify-between text-[9px] mb-0.5">
            <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Grind progress</span>
            <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${progressColor}`}
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-0.5">
            <span>{Math.round(totalNeeded / 360)} rotations</span>
            {effectiveRpm > 0 && progress < 100 && (
              <span>~{estSeconds >= 60 ? `${Math.floor(estSeconds / 60)}m ${Math.round(estSeconds % 60)}s` : `${Math.round(estSeconds)}s`} at {effectiveRpm} RPM</span>
            )}
            {progress >= 100 && <span className="text-emerald-600 font-semibold">✓ done</span>}
          </div>
        </div>

        {/* Density indicator */}
        <div className="w-full max-w-xs mt-2 text-center">
          <span className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
            Density: <strong className={kValue >= 60 ? 'text-blue-600' : kValue >= 35 ? 'text-slate-600 dark:text-slate-400 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400 dark:text-amber-400'}>{kValue}</strong>
            {' · '}
            {kValue >= 60 ? 'Dense — heavy spin' : kValue >= 35 ? 'Medium' : 'Brittle — spins light'}
            {' · '}
            {burrProfile.label} / {dia}mm
          </span>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-400 transition-all"
                style={{ width: `${Math.min(100, rpm * 2)}%` }} />
            </div>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 tabular-nums w-16">
              {rpm > 1 ? `${rpm.toFixed(0)} RPM` : 'stopped'}
            </span>
          </div>

          <button onClick={toggleAuto}
            disabled={progress >= 100 && !autoMode}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
              autoMode
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
            } disabled:opacity-40 disabled:cursor-not-allowed`}>
            {autoMode ? '⏸ Pause' : progress >= 100 ? '✓ Done' : '▶ Auto'}
          </button>

          <button onClick={resetGrind}
            className="px-3 py-1.5 text-[10px] font-bold bg-slate-200 text-slate-600 dark:text-slate-400 dark:text-slate-400 rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 hover:bg-slate-300">
            ↻ Reset
          </button>

          <button onClick={skipGrind}
            disabled={progress >= 100}
            className="px-3 py-1.5 text-[10px] font-bold bg-purple-500 text-white rounded-lg border border-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed">
            ⏭ Skip
          </button>
        </div>
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <section className="max-w-xs mx-auto w-full">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider">Grind Log</h3>
            <button onClick={() => setLogs([])}
              className="text-[8px] text-red-400 hover:text-red-600">Clear</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {logs.map((l, i) => (
              <div key={i} className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 dark:border-slate-700 flex items-center gap-2 flex-wrap">
                <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-mono">{l.date}</span>
                <span>{l.dose}g</span>
                <span className="font-bold text-blue-700">#{l.grind}</span>
                <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">|</span>
                <span>{l.rotations} rot</span>
                <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">|</span>
                <span>{l.time >= 60 ? `${Math.floor(l.time / 60)}m ${Math.round(l.time % 60)}s` : `${Math.round(l.time)}s`}</span>
                <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">@</span>
                <span>{l.rpm} RPM</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Brew dose={dose} grindSetting={grindSetting} micronSetting={micronSetting} finesPct={finesPct} surfaceArea={surfaceArea}
        roast={roast} process={process} humidity={humidity} waterTempC={waterTempC} burrProfileName={burrProfile.name} grindDistribution={distribution} />
    </div>
  );
}
