import { useState, useMemo } from 'react';

// Parametric demo EC curve — responds to grind size so you can play with adjustments live
function generateDemoCurve(grindUm: number): EcPoint[] {
  const g = Math.max(300, Math.min(1800, grindUm));
  // Peak EC: finer = higher. Range ~8–18 across 300–1800µm
  const peakEC = Math.max(8, Math.min(18, 22 - ((g - 300) / 1500) * 14));
  // Time to peak: finer = slower. Range ~25–45s
  const timeToPeak = Math.max(25, Math.min(45, 45 - ((g - 300) / 1500) * 20));
  // Decline rate: finer = slower (lower number = slower decay). Range ~0.4–1.8
  const declineFactor = 0.4 + ((g - 300) / 1500) * 1.4;

  const pts: EcPoint[] = [];
  for (let t = 0; t <= 210; t += 5) {
    let ec: number;
    if (t <= timeToPeak) {
      const frac = t / timeToPeak;
      ec = frac * frac * peakEC;
    } else {
      const elapsed = t - timeToPeak;
      ec = peakEC * Math.exp(-elapsed / (60 / declineFactor));
    }
    pts.push({ timeSec: t, ec: Math.round(ec * 10) / 10 });
  }
  return pts;
}

interface EcPoint {
  timeSec: number;
  ec: number;
}

interface CurveAnalysis {
  lowestEC: number;
  timeToLowestEC: number;
  highestEC: number;
  timeToHighestEC: number;
  ecAtTargetTime: number | null;
  timeBelowRedLight: number | null;
  shape: 'collapsed' | 'stalling' | 'stable' | 'channeling' | 'unknown';
  stabilityRating: 'high' | 'medium' | 'low';
}

interface EcSandboxProps {
  ecPoints: EcPoint[];
  redLightThreshold: number;
  targetBrewTimeSec: number;
  enabled: boolean;
  onToggle: () => void;
}

function analyzeCurve(
  pts: EcPoint[],
  redLight: number,
  targetTime: number,
): CurveAnalysis | null {
  if (pts.length < 2) return null;

  let lowestEC = Infinity;
  let timeToLowestEC = 0;
  let highestEC = -Infinity;
  let timeToHighestEC = 0;

  for (const p of pts) {
    if (p.ec < lowestEC) { lowestEC = p.ec; timeToLowestEC = p.timeSec; }
    if (p.ec > highestEC) { highestEC = p.ec; timeToHighestEC = p.timeSec; }
  }

  // Find EC at target brew time
  let ecAtTargetTime: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].timeSec >= targetTime) {
      const prev = pts[i - 1];
      const span = pts[i].timeSec - prev.timeSec;
      const frac = span > 0 ? (targetTime - prev.timeSec) / span : 0;
      ecAtTargetTime = prev.ec + (pts[i].ec - prev.ec) * Math.min(1, Math.max(0, frac));
      break;
    }
  }
  if (ecAtTargetTime === null && pts.length > 0) {
    ecAtTargetTime = pts[pts.length - 1].ec;
  }

  // Find when EC first drops below red light
  let timeBelowRedLight: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    if (prev.ec >= redLight && pts[i].ec < redLight) {
      const span = pts[i].timeSec - prev.timeSec;
      const frac = span > 0 ? (redLight - prev.ec) / (pts[i].ec - prev.ec) : 0;
      timeBelowRedLight = prev.timeSec + frac * span;
      break;
    }
  }

  // Shape classification
  const drainPhase = pts.filter(p => p.timeSec >= Math.max(20, timeToHighestEC));
  const avgLateEC = drainPhase.length > 0
    ? drainPhase.reduce((s, p) => s + p.ec, 0) / drainPhase.length
    : 0;
  const ecDrop = highestEC - lowestEC;
  const dropRate = ecDrop / Math.max(1, timeToLowestEC - Math.min(timeToHighestEC, timeToLowestEC));

  let shape: CurveAnalysis['shape'] = 'unknown';
  let stabilityRating: CurveAnalysis['stabilityRating'] = 'medium';

  if (lowestEC < 3 && timeToLowestEC < 60) {
    shape = 'collapsed';
    stabilityRating = 'low';
  } else if (avgLateEC > 14 && pts[pts.length - 1].timeSec > 90) {
    shape = 'stalling';
    stabilityRating = 'low';
  } else if (dropRate > 0.35 && ecDrop > 10) {
    shape = 'channeling';
    stabilityRating = 'low';
  } else if (avgLateEC >= 5 && avgLateEC <= 11 && ecDrop < 10) {
    shape = 'stable';
    stabilityRating = 'high';
  }

  return {
    lowestEC, timeToLowestEC, highestEC, timeToHighestEC,
    ecAtTargetTime, timeBelowRedLight, shape, stabilityRating,
  };
}

function recommendationFromAnalysis(
  analysis: CurveAnalysis,
  grindUm: number | null,
): { verdict: string; action: string; suggestedGrindDelta: number; finishEC: number; suggestedTimeDirection: 'shorter' | 'longer' | 'neutral' } {
  let verdict = '';
  let action = '';
  let suggestedGrindDelta = 0;
  let finishEC = 0;
  let suggestedTimeDirection: 'shorter' | 'longer' | 'neutral' = 'neutral';

  // Filter grind typically 600–1200µm. Use percentage-based deltas (~8–12%).
  // 1 grinder click ≈ 25–40µm. So 2–3 clicks is a reasonable tweak.
  switch (analysis.shape) {
    case 'collapsed':
      verdict = 'Bed collapsed';
      action = 'Grind finer';
      suggestedGrindDelta = grindUm
        ? -Math.max(30, Math.min(100, Math.round(grindUm * 0.08)))
        : -60;
      suggestedTimeDirection = 'longer';
      finishEC = Math.max(2, analysis.lowestEC * 1.4);
      break;
    case 'stalling':
      verdict = 'Bed stalling';
      action = 'Grind coarser or pulse pour';
      suggestedGrindDelta = grindUm
        ? Math.max(30, Math.min(100, Math.round(grindUm * 0.08)))
        : 60;
      suggestedTimeDirection = 'shorter';
      finishEC = Math.min(10, Math.max(4, analysis.ecAtTargetTime ?? 7));
      break;
    case 'channeling':
      verdict = 'Channeling detected';
      action = 'Check pour pattern';
      suggestedGrindDelta = 0;
      suggestedTimeDirection = 'neutral';
      finishEC = Math.max(3, analysis.lowestEC * 1.3);
      break;
    case 'stable':
      verdict = 'In the zone';
      action = 'Keep doing what you are doing';
      suggestedGrindDelta = 0;
      suggestedTimeDirection = 'neutral';
      finishEC = analysis.ecAtTargetTime ?? analysis.lowestEC;
      break;
    default:
      verdict = 'Unclear pattern';
      action = 'More data needed';
      suggestedGrindDelta = 0;
      suggestedTimeDirection = 'neutral';
      finishEC = analysis.ecAtTargetTime ?? 5;
  }

  return { verdict, action, suggestedGrindDelta, finishEC: Math.round(finishEC * 10) / 10, suggestedTimeDirection };
}

export default function EcSandbox({
  ecPoints, redLightThreshold, targetBrewTimeSec, enabled, onToggle,
}: EcSandboxProps) {
  const [grindInput, setGrindInput] = useState('22');
  const [grindUm, setGrindUm] = useState<number | null>(800);
  const [targetFinishEC, setTargetFinishEC] = useState('5.0');
  const [actualFinishTimeSec, setActualFinishTimeSec] = useState(150); // 2:30 default

  // Demo mode: when no real EC data, use a parametric live curve
  const isDemo = ecPoints.length < 2;
  const effectivePoints = useMemo(() => {
    if (!isDemo) return ecPoints;
    return generateDemoCurve(grindUm ?? 800);
  }, [isDemo, ecPoints, grindUm]);

  const analysis = useMemo(() => {
    if (effectivePoints.length < 2) return null;
    return analyzeCurve(effectivePoints, redLightThreshold, targetBrewTimeSec);
  }, [effectivePoints, redLightThreshold, targetBrewTimeSec]);

  const rec = useMemo(() => {
    if (!analysis) return null;
    return recommendationFromAnalysis(analysis, grindUm);
  }, [analysis, grindUm]);

  const parsedTargetEC = parseFloat(targetFinishEC);
  const hasTargetEC = !isNaN(parsedTargetEC) && parsedTargetEC > 0;

  // Find time when EC reaches target finish EC
  const timeAtTargetEC = useMemo(() => {
    if (!hasTargetEC || effectivePoints.length < 2) return null;
    for (let i = 1; i < effectivePoints.length; i++) {
      const prev = effectivePoints[i - 1];
      const curr = effectivePoints[i];
      if ((prev.ec >= parsedTargetEC && curr.ec <= parsedTargetEC) ||
          (prev.ec <= parsedTargetEC && curr.ec >= parsedTargetEC)) {
        const span = curr.timeSec - prev.timeSec;
        const frac = span > 0 ? (parsedTargetEC - prev.ec) / (curr.ec - prev.ec) : 0;
        return prev.timeSec + frac * span;
      }
    }
    return null;
  }, [effectivePoints, hasTargetEC, parsedTargetEC]);

  // EC at actual finish time
  const ecAtFinishTime = useMemo(() => {
    if (effectivePoints.length < 2) return null;
    for (let i = 1; i < effectivePoints.length; i++) {
      const prev = effectivePoints[i - 1];
      const curr = effectivePoints[i];
      if (curr.timeSec >= actualFinishTimeSec) {
        const span = curr.timeSec - prev.timeSec;
        const frac = span > 0 ? (actualFinishTimeSec - prev.timeSec) / span : 0;
        return prev.ec + (curr.ec - prev.ec) * Math.min(1, Math.max(0, frac));
      }
    }
    return effectivePoints[effectivePoints.length - 1].ec;
  }, [effectivePoints, actualFinishTimeSec]);

  const timeDelta = hasTargetEC && timeAtTargetEC !== null
    ? actualFinishTimeSec - timeAtTargetEC
    : null;

  if (!enabled) return null;

  return (
    <div className={`border-t pt-3 mt-3 ${isDemo ? 'border-dashed border-slate-300 dark:border-slate-600 dark:border-slate-600' : 'border-slate-200 dark:border-slate-700 dark:border-slate-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider">EC Dial-In Sandbox</span>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="text-[7px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 px-1 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700">Demo live data</span>
          )}
          <button onClick={onToggle}
            className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-400 underline decoration-dotted"
          >✕ Disable</button>
        </div>
      </div>

      {isDemo && (
        <p className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 italic mb-2">
          Live demo — tweak grind size and time below to see the EC curve respond in real time. No real digitized data needed.
        </p>
      )}

      {analysis && (
        <div className="flex flex-col gap-3">
          {/* Curve stats row */}
          <div className="grid grid-cols-4 gap-2 text-[9px]">
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded p-1.5 text-center">
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Lowest EC</div>
              <div className="font-bold text-red-600">{analysis.lowestEC.toFixed(1)}</div>
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">@{Math.floor(analysis.timeToLowestEC)}s</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded p-1.5 text-center">
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Peak EC</div>
              <div className="font-bold text-emerald-600">{analysis.highestEC.toFixed(1)}</div>
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">@{Math.floor(analysis.timeToHighestEC)}s</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded p-1.5 text-center">
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Red light cross</div>
              <div className={`font-bold ${analysis.timeBelowRedLight !== null ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}>
                {analysis.timeBelowRedLight !== null ? `${Math.floor(analysis.timeBelowRedLight)}s` : 'Never'}
              </div>
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">EC &lt; {redLightThreshold.toFixed(1)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded p-1.5 text-center">
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Shape</div>
              <div className={`font-bold ${
                analysis.shape === 'stable' ? 'text-emerald-600' :
                analysis.shape === 'stalling' ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' :
                analysis.shape === 'collapsed' ? 'text-red-600' : 'text-slate-500 dark:text-slate-400 dark:text-slate-400'
              }`}>
                {analysis.shape.charAt(0).toUpperCase() + analysis.shape.slice(1)}
              </div>
              <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500">
                {analysis.stabilityRating === 'high' ? 'Stable' :
                 analysis.stabilityRating === 'medium' ? 'Fair' : 'Unstable'}
              </div>
            </div>
          </div>

          {/* Grind size input */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Grind size:</span>
            <input value={grindInput}
              onChange={e => setGrindInput(e.target.value)}
              placeholder="e.g. 22 (optional)"
              className="w-16 px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">µm</span>
            <input value={grindUm ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value);
                setGrindUm(!isNaN(v) && v > 0 ? v : null);
              }}
              placeholder="µm"
              className="w-16 px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            {grindUm !== null && (
              <button onClick={() => { setGrindUm(null); setGrindInput(''); }}
                className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-400 underline decoration-dotted"
              >Clear</button>
            )}
          </div>

          {/* Finish EC target input */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Target finish EC:</span>
            <input value={targetFinishEC}
              onChange={e => setTargetFinishEC(e.target.value)}
              placeholder="e.g. 4.5"
              className="w-16 px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            {hasTargetEC && (
              <span className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400">
                {timeAtTargetEC !== null
                  ? `Reached at ~${Math.floor(timeAtTargetEC / 60)}:${String(Math.floor(timeAtTargetEC % 60)).padStart(2, '0')}`
                  : 'Not reached on this curve'}
              </span>
            )}
          </div>

          {/* Actual finish time input — separate m : ss */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold">Actual finish time:</span>
            <input value={Math.floor(actualFinishTimeSec / 60)}
              onChange={e => {
                const m = parseInt(e.target.value);
                if (!isNaN(m) && m >= 0 && m <= 10) setActualFinishTimeSec(m * 60 + (actualFinishTimeSec % 60));
              }}
              className="w-10 px-1 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono text-center focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="m"
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-bold">:</span>
            <input value={String(actualFinishTimeSec % 60).padStart(2, '0')}
              onChange={e => {
                const s = parseInt(e.target.value);
                if (!isNaN(s) && s >= 0 && s < 60) setActualFinishTimeSec(Math.floor(actualFinishTimeSec / 60) * 60 + s);
              }}
              className="w-10 px-1 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono text-center focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="ss"
            />
            {ecAtFinishTime !== null && (
              <span className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400">
                EC @ finish: <strong className="text-slate-700 dark:text-slate-300 dark:text-slate-300">{ecAtFinishTime.toFixed(1)}</strong>
              </span>
            )}
            {hasTargetEC && timeDelta !== null && (
              <span className={`text-[9px] ${timeDelta > 10 ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' : timeDelta < -10 ? 'text-red-600' : 'text-emerald-600'}`}>
                {timeDelta > 10
                  ? `+${Math.floor(timeDelta)}s past target — consider grinding coarser or increasing target EC`
                  : timeDelta < -10
                  ? `${Math.floor(timeDelta)}s before target — consider grinding finer or decreasing target EC`
                  : '✓ On pace'}
              </span>
            )}
          </div>

          {/* Recommendation card */}
          {rec && (
            <div className={`rounded-lg border p-2.5 ${
              rec.verdict === 'In the zone' ? 'bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 dark:border-emerald-800' :
              rec.verdict === 'Bed collapsed' ? 'bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 border-red-200' :
              rec.verdict === 'Bed stalling' ? 'bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 dark:border-amber-800' :
              rec.verdict === 'Channeling detected' ? 'bg-orange-50 border-orange-200' :
              'bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 dark:border-slate-700'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold ${
                  rec.verdict === 'In the zone' ? 'text-emerald-700 dark:text-emerald-400 dark:text-emerald-400' :
                  rec.verdict === 'Bed collapsed' ? 'text-red-700' :
                  rec.verdict === 'Bed stalling' ? 'text-amber-700' :
                  rec.verdict === 'Channeling detected' ? 'text-orange-700' :
                  'text-slate-600 dark:text-slate-400 dark:text-slate-400'
                }`}>{rec.verdict}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  rec.action === 'No changes needed' ? 'bg-emerald-200 text-emerald-800 dark:text-emerald-200 dark:text-emerald-200' :
                  rec.action.startsWith('Grind finer') ? 'bg-red-200 text-red-800' :
                  rec.action.startsWith('Grind coarser') ? 'bg-amber-200 text-amber-800 dark:text-amber-200 dark:text-amber-200' :
                  'bg-slate-200 text-slate-700 dark:text-slate-300 dark:text-slate-300'
                }`}>{rec.action}</span>
              </div>

              {/* Key stats — scannable grid */}
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                <div className="bg-white dark:bg-slate-800 dark:bg-slate-800/60 rounded px-1.5 py-1 text-center">
                  <div className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider">EC low</div>
                  <div className="text-[10px] font-bold text-red-600">{analysis.lowestEC.toFixed(1)}</div>
                  <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">@{Math.floor(analysis.timeToLowestEC)}s</div>
                </div>
                <div className="bg-white dark:bg-slate-800 dark:bg-slate-800/60 rounded px-1.5 py-1 text-center">
                  <div className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider">EC peak</div>
                  <div className="text-[10px] font-bold text-emerald-600">{analysis.highestEC.toFixed(1)}</div>
                  <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">@{Math.floor(analysis.timeToHighestEC)}s</div>
                </div>
                <div className="bg-white dark:bg-slate-800 dark:bg-slate-800/60 rounded px-1.5 py-1 text-center">
                  <div className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider">Red light</div>
                  <div className={`text-[10px] font-bold ${analysis.timeBelowRedLight !== null ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}>
                    {analysis.timeBelowRedLight !== null ? `${Math.floor(analysis.timeBelowRedLight)}s` : '—'}
                  </div>
                  <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">EC &lt; {redLightThreshold.toFixed(1)}</div>
                </div>
              </div>

              {/* Explanation — one line */}
              <div className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-relaxed mb-1.5">
                {(() => {
                  switch (analysis.shape) {
                    case 'collapsed': return 'Finer grind keeps particles interlocked so the bed holds integrity. Finish EC is a guess until grind is fixed — focus on grind first.';
                    case 'stalling': return 'Coarser by a couple clicks opens flow paths. Pulse pouring also resets the bed.';
                    case 'channeling': return 'Water found a bypass route. Try lower pour height, gentler circles, or pulse pour.';
                    case 'stable': return `Bed integrity is solid — your grind size is in the sweet spot (${Math.max(0, analysis.lowestEC).toFixed(1)}–${analysis.highestEC.toFixed(1)} EC).`;
                    default: return 'EC curve doesn\'t match a known pattern. Try with more data points or a longer brew time.';
                  }
                })()}
              </div>

              {/* Grind suggestion block — clear current → suggested */}
              {rec.suggestedGrindDelta !== 0 && grindUm && (
                <div className="bg-white dark:bg-slate-800 dark:bg-slate-800/60 rounded px-2 py-1.5 mb-1.5 border border-slate-200 dark:border-slate-700 dark:border-slate-700/50">
                  <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider font-semibold mb-1">Grind suggestion</div>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-0.5 text-[9px] items-center">
                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Current:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">{grindInput || '—'} <span className="font-normal text-slate-400 dark:text-slate-500 dark:text-slate-500 text-[8px]">clicks</span></span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 text-right">{grindUm}µm</span>
                    <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600 text-center text-[8px]">│</span>

                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Suggested:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">
                      ~{(() => {
                        const clickDelta = Math.round(rec.suggestedGrindDelta / 35);
                        const clicks = parseInt(grindInput);
                        return !isNaN(clicks) ? Math.max(1, clicks + clickDelta) : '—';
                      })()} <span className="font-normal text-slate-400 dark:text-slate-500 dark:text-slate-500 text-[8px]">clicks</span>
                    </span>
                    <span className={`font-bold text-right ${rec.suggestedGrindDelta < 0 ? 'text-red-600' : 'text-amber-600 dark:text-amber-400 dark:text-amber-400'}`}>
                      ~{Math.max(300, Math.min(1800, grindUm + rec.suggestedGrindDelta))}µm
                    </span>
                    <span className={`text-[8px] text-right ${rec.suggestedGrindDelta < 0 ? 'text-red-500 dark:text-red-400 dark:text-red-400' : 'text-amber-500'}`}>
                      {rec.suggestedGrindDelta > 0 ? '+' : ''}{rec.suggestedGrindDelta}µm
                    </span>
                  </div>
                </div>
              )}

              {/* Time suggestion block */}
              {rec.suggestedTimeDirection !== 'neutral' && (
                <div className="bg-white dark:bg-slate-800 dark:bg-slate-800/60 rounded px-2 py-1.5 mb-1.5 border border-slate-200 dark:border-slate-700 dark:border-slate-700/50">
                  <div className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider font-semibold mb-1">Time suggestion</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[9px] items-center">
                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Current:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">
                      {Math.floor(actualFinishTimeSec / 60)}:{String(actualFinishTimeSec % 60).padStart(2, '0')}
                    </span>

                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Direction:</span>
                    <span className={`font-bold ${rec.suggestedTimeDirection === 'shorter' ? 'text-blue-600' : 'text-orange-600'}`}>
                      {rec.suggestedTimeDirection === 'shorter' ? 'Cut shorter' : 'Let run longer'}
                    </span>

                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Target EC @:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">
                      {hasTargetEC && timeAtTargetEC !== null
                        ? `${Math.floor(timeAtTargetEC / 60)}:${String(Math.floor(timeAtTargetEC % 60)).padStart(2, '0')}`
                        : '—'}
                    </span>

                    <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Delta:</span>
                    <span className={`font-bold ${Math.abs(timeDelta ?? 0) < 10 ? 'text-emerald-600' : timeDelta !== null && timeDelta > 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                      {timeDelta !== null
                        ? `${timeDelta > 0 ? '+' : ''}${Math.floor(timeDelta)}s vs target`
                        : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Directional bars */}
              <div className="flex flex-col gap-1.5 mt-1.5">
                {/* Grind direction bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-10 text-right">Finer</span>
                  <div className="flex-1 h-3 relative">
                    <div className="absolute inset-0 rounded-full overflow-hidden flex">
                      <div className="flex-1 bg-red-100" />
                      <div className="w-0.5 bg-slate-300" />
                      <div className="flex-1 bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-0.5 h-full bg-slate-400" />
                    </div>
                    {rec.suggestedGrindDelta !== 0 && (() => {
                      const pct = Math.max(-100, Math.min(100, rec.suggestedGrindDelta / 1.5));
                      const left = 50 + pct / 2;
                      return <div className="absolute top-0.5" style={{ left: `${Math.max(2, Math.min(98, left))}%`, transform: 'translateX(-50%)' }}>
                        <div className={`w-2 h-2 rounded-full ${rec.suggestedGrindDelta < 0 ? 'bg-red-500' : 'bg-amber-500'} border border-white shadow-sm`} />
                      </div>;
                    })()}
                    {rec.suggestedGrindDelta === 0 && (
                      <div className="absolute top-0.5 left-1/2 -translate-x-1/2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 border border-white shadow-sm" />
                      </div>
                    )}
                  </div>
                  <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-10">Coarser</span>
                </div>

                {/* Time direction bar — suggested brew time direction */}
                <div className="flex items-center gap-2">
                  <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-10 text-right">Shorter</span>
                  <div className="flex-1 h-3 relative">
                    <div className="absolute inset-0 rounded-full overflow-hidden flex">
                      <div className="flex-1 bg-blue-100" />
                      <div className="w-0.5 bg-slate-300" />
                      <div className="flex-1 bg-orange-100" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-0.5 h-full bg-slate-400" />
                    </div>
                    {(() => {
                      const pct = rec.suggestedTimeDirection === 'shorter' ? -60 :
                                  rec.suggestedTimeDirection === 'longer' ? 60 : 0;
                      const left = 50 + pct / 2;
                      return <div className="absolute top-0.5" style={{ left: `${Math.max(2, Math.min(98, left))}%`, transform: 'translateX(-50%)' }}>
                        <div className={`w-2 h-2 rounded-full border border-white shadow-sm ${
                          pct === 0 ? 'bg-emerald-500' :
                          pct < 0 ? 'bg-blue-500' : 'bg-orange-500'
                        }`} />
                      </div>;
                    })()}
                  </div>
                  <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-10">Longer</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 dark:border-slate-700/50">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
                  Suggested finish EC: <strong className="text-slate-700 dark:text-slate-300 dark:text-slate-300">{rec.finishEC.toFixed(1)}</strong>
                </span>
                {hasTargetEC && (
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
                    Your target: <strong className="text-slate-700 dark:text-slate-300 dark:text-slate-300">{parsedTargetEC.toFixed(1)}</strong>
                    <span className={`ml-1 ${Math.abs(parsedTargetEC - rec.finishEC) < 1 ? 'text-emerald-600' : 'text-amber-600 dark:text-amber-400 dark:text-amber-400'}`}>
                      ({Math.abs(parsedTargetEC - rec.finishEC) < 1 ? 'aligned' : `diff ${(parsedTargetEC - rec.finishEC) > 0 ? '+' : ''}${(parsedTargetEC - rec.finishEC).toFixed(1)}`})
                    </span>
                  </span>
                )}
                {analysis.ecAtTargetTime !== null && (
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
                    EC @ {Math.floor(targetBrewTimeSec / 60)}:{String(targetBrewTimeSec % 60).padStart(2, '0')}:
                    <strong className="text-slate-700 dark:text-slate-300 dark:text-slate-300"> {analysis.ecAtTargetTime.toFixed(1)}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
