import { useMemo, useRef, useState } from 'react';

interface ECReading {
  timeSec: number;
  ec: number;
}

interface BedVisualProps {
  ecPoints?: ECReading[];
  ec?: number;
  brewTimeSec?: number;
  redLightThreshold?: number;
  referencePoints?: ECReading[];
  onImportPhases?: (phases: PhaseRange[]) => void;
  className?: string;
  pourPlan?: { cumulativePercent: number; duration?: number }[];
}

// ── Curve Analysis ──────────────────────────────────────────

interface PhaseRange {
  phase: string;
  startTime: number;
  endTime: number;
  color: string;
}

interface CurveAnalysis {
  peak: ECReading;
  sorted: ECReading[];
  derivatives: { timeSec: number; rate: number }[];
  getEC: (t: number) => number;
  getPhase: (t: number) => 'blooming' | 'extracting' | 'declining' | 'collapsing' | 'collapsed';
  getCrackSeverity: (t: number) => 0 | 1 | 2 | 3;
  getPhaseRanges: () => PhaseRange[];
  findDeclineStart: () => { timeSec: number; ec: number } | null;
  findCollapseStart: () => { timeSec: number; ec: number } | null;
  findRedLightCross: (threshold: number) => { timeSec: number; ec: number } | null;
  getPostPeakLowest: () => ECReading | null;
}

function analyzeCurve(points: ECReading[], redLightThreshold?: number): CurveAnalysis | null {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timeSec - b.timeSec);

  const peak = sorted.reduce((max, p) => p.ec > max.ec ? p : max, sorted[0]);

  const derivatives: { timeSec: number; rate: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].timeSec - sorted[i - 1].timeSec;
    if (dt <= 0) continue;
    const rate = (sorted[i].ec - sorted[i - 1].ec) / dt;
    derivatives.push({ timeSec: sorted[i].timeSec, rate });
  }

  const collapseRate = peak.ec * 0.03;
  const declineRate = peak.ec * 0.005;

  function getInterpolatedEC(t: number): number {
    if (t <= sorted[0].timeSec) return sorted[0].ec;
    if (t >= sorted[sorted.length - 1].timeSec) return sorted[sorted.length - 1].ec;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].timeSec && t < sorted[i + 1].timeSec) {
        const ratio = (t - sorted[i].timeSec) / (sorted[i + 1].timeSec - sorted[i].timeSec);
        return sorted[i].ec + (sorted[i + 1].ec - sorted[i].ec) * ratio;
      }
    }
    return sorted[sorted.length - 1].ec;
  }

  function getDerivativeAt(t: number): number {
    if (derivatives.length === 0) return 0;
    const closest = derivatives.reduce((best, d) =>
      Math.abs(d.timeSec - t) < Math.abs(best.timeSec - t) ? d : best
    );
    return closest.rate;
  }

  function getPhase(t: number): 'blooming' | 'extracting' | 'declining' | 'collapsing' | 'collapsed' {
    const ec = getInterpolatedEC(t);
    if (redLightThreshold !== undefined && ec <= redLightThreshold) return 'collapsed';
    if (t < sorted[0].timeSec) return 'blooming';
    if (t > sorted[sorted.length - 1].timeSec) return 'declining';
    if (t <= peak.timeSec) return 'blooming';
    const rate = getDerivativeAt(t);
    if (rate < -collapseRate) return 'collapsing';
    if (rate < -declineRate) return 'declining';
    return 'extracting';
  }

  function getCrackSeverity(t: number): 0 | 1 | 2 | 3 {
    const phase = getPhase(t);
    if (phase === 'collapsed') return 3;
    if (phase === 'collapsing') return 2;
    if (phase === 'declining') return 1;
    return 0;
  }

  function getPhaseRanges(): PhaseRange[] {
    const allPhases: { phase: string; color: string; time: number }[] = [];
    const phaseColors: Record<string, string> = {
      blooming: '#3b82f6', extracting: '#22c55e', declining: '#f59e0b',
      collapsing: '#ef4444', collapsed: '#b91c1c',
    };
    // Sample at each data point time
    for (const p of sorted) {
      const ph = getPhase(p.timeSec);
      allPhases.push({ phase: ph, color: phaseColors[ph] || '#94a3b8', time: p.timeSec });
    }
    // Merge consecutive same-phase into ranges
    const ranges: PhaseRange[] = [];
    for (const entry of allPhases) {
      const last = ranges[ranges.length - 1];
      if (last && last.phase === entry.phase) {
        last.endTime = entry.time;
      } else {
        ranges.push({ phase: entry.phase, startTime: entry.time, endTime: entry.time, color: entry.color });
      }
    }
    return ranges;
  }

  function findDeclineStart(): { timeSec: number; ec: number } | null {
    for (const d of derivatives) {
      if (d.timeSec > peak.timeSec && d.rate < -declineRate) {
        return { timeSec: d.timeSec, ec: getInterpolatedEC(d.timeSec) };
      }
    }
    return null;
  }

  function findCollapseStart(): { timeSec: number; ec: number } | null {
    for (const d of derivatives) {
      if (d.timeSec > peak.timeSec && d.rate < -collapseRate) {
        return { timeSec: d.timeSec, ec: getInterpolatedEC(d.timeSec) };
      }
    }
    return null;
  }

  function findRedLightCross(threshold: number): { timeSec: number; ec: number } | null {
    for (const p of sorted) {
      if (p.timeSec > peak.timeSec && p.ec <= threshold) {
        return { timeSec: p.timeSec, ec: p.ec };
      }
    }
    return null;
  }

  function getPostPeakLowest(): ECReading | null {
    let lowest: ECReading | null = null;
    for (const p of sorted) {
      if (p.timeSec > peak.timeSec) {
        if (!lowest || p.ec < lowest.ec) lowest = p;
      }
    }
    return lowest;
  }

  return { peak, sorted, derivatives, getEC: getInterpolatedEC, getPhase, getCrackSeverity, getPhaseRanges, findDeclineStart, findCollapseStart, findRedLightCross, getPostPeakLowest };
}

// ── Interactive Mini EC Curve Chart ─────────────────────────

const BASE_W = 280, BASE_H = 90, PAD = 6;

function MiniECChart(
  { sorted, peak, currentTime, currentEC, brewTimeSec, redLightThreshold, getPhase, getEC,
    chartZoom, chartPan, onZoomChange, onPanChange, referencePoints, onSeek }:
    {
      sorted: ECReading[];
      peak: ECReading;
      currentTime: number;
      currentEC: number;
      brewTimeSec: number;
      redLightThreshold?: number;
      getPhase: (t: number) => string;
      getEC: (t: number) => number;
      chartZoom: number;
      chartPan: number;
      onZoomChange: (z: number) => void;
      onPanChange: (p: number) => void;
      referencePoints?: ECReading[];
      onSeek?: (t: number) => void;
    }
) {
  const W = BASE_W, H = BASE_H;

  const visibleRange = brewTimeSec / chartZoom;
  const xStart = chartPan;
  const xEnd = Math.min(brewTimeSec, chartPan + visibleRange);

  const ecMax = Math.max(peak.ec * 1.15, 1);

  const xF = (t: number) => PAD + ((t - xStart) / visibleRange) * (W - 2 * PAD);
  const yF = (v: number) => H - PAD - ((v / ecMax) * (H - 2 * PAD));
  const clX = (t: number) => Math.max(PAD, Math.min(W - PAD, xF(t)));

  // Fill
  const visibleL = Math.max(xStart, sorted[0].timeSec);
  const visibleR = Math.min(xEnd, sorted[sorted.length - 1].timeSec);
  const fillPts = [
    `M${clX(visibleL).toFixed(1)},${yF(0).toFixed(1)}`,
    ...sorted.filter(p => p.timeSec >= visibleL && p.timeSec <= visibleR).map(p =>
      `L${clX(p.timeSec).toFixed(1)},${yF(p.ec).toFixed(1)}`
    ),
    `L${clX(visibleR).toFixed(1)},${yF(0).toFixed(1)}`,
    'Z',
  ];

  const phaseColor = (p: string) => p === 'blooming' ? '#3b82f6' : p === 'extracting' ? '#22c55e' : p === 'declining' ? '#f59e0b' : p === 'collapsing' ? '#ef4444' : '#b91c1c';

  const canZoomIn = chartZoom < 8;
  const canZoomOut = chartZoom > 1;
  const isZoomed = chartZoom > 1;

  // Drag to pan + tooltip
  const dragRef = useRef<{ startX: number; startPan: number; dragging: boolean; moved: boolean }>({ startX: 0, startPan: 0, dragging: false, moved: false });
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipPoint, setTooltipPoint] = useState<{ timeSec: number; ec: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isZoomed) return;
    setTooltipPoint(null);
    dragRef.current = { startX: e.clientX, startPan: chartPan, dragging: true, moved: false };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      dragRef.current.moved = true;
      const dx = e.clientX - dragRef.current.startX;
      const dt = -(dx / (W * chartZoom)) * visibleRange;
      const newPan = Math.max(0, Math.min(dragRef.current.startPan + dt, brewTimeSec - visibleRange));
      onPanChange(newPan);
      return;
    }
    // Convert mouse to data coords (smooth, no snap)
    const svg = svgRef.current;
    if (!svg) { setTooltipPoint(null); return; }
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const vbX = (e.clientX - rect.left) / scaleX;
    const clampedX = Math.max(PAD, Math.min(W - PAD, vbX));
    const timeAt = xStart + ((clampedX - PAD) / (W - 2 * PAD)) * visibleRange;
    setTooltipPoint({ timeSec: Math.max(0, Math.min(brewTimeSec, timeAt)), ec: getEC(Math.max(0, Math.min(brewTimeSec, timeAt))) });
  };
  const handleMouseUp = () => {
    dragRef.current.dragging = false;
  };
  const handleMouseLeave = () => {
    dragRef.current.dragging = false;
    setTooltipPoint(null);
  };
  const handleClick = (e: React.MouseEvent) => {
    if (dragRef.current.moved) return; // was a drag, not a click
    const svg = svgRef.current;
    if (!svg || !onSeek) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const vbX = (e.clientX - rect.left) / scaleX;
    const clampedX = Math.max(PAD, Math.min(W - PAD, vbX));
    const timeAt = xStart + ((clampedX - PAD) / (W - 2 * PAD)) * visibleRange;
    onSeek(Math.max(0, Math.min(brewTimeSec, timeAt)));
  };

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      {/* Scrollable chart wrapper */}
      <div className="w-full overflow-x-auto relative" style={{ maxWidth: W * chartZoom }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
          style={{ width: W * chartZoom, height: 'auto', cursor: isZoomed ? 'grab' : 'default' }}
          className="overflow-visible select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(r => {
            const x = xStart + r * visibleRange;
            return (
              <line key={`gx${r}`} x1={clX(x)} y1={yF(0)} x2={clX(x)} y2={yF(ecMax)}
                stroke="#e2e8f0" strokeWidth={0.5} />
            );
          })}
          {[0, 0.25, 0.5, 0.75, 1].map(r => (
            <line key={`gy${r}`} x1={clX(xStart)} y1={yF(r * ecMax)} x2={clX(xEnd)} y2={yF(r * ecMax)}
              stroke="#e2e8f0" strokeWidth={0.5} />
          ))}

          {/* Red light line */}
          {redLightThreshold !== undefined && (
            <>
              <line x1={clX(xStart)} y1={yF(redLightThreshold)} x2={clX(xEnd)} y2={yF(redLightThreshold)}
                stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
              <text x={clX(xEnd) - 2} y={yF(redLightThreshold) - 1} textAnchor="end" fontSize={5} fill="#ef4444" opacity={0.7}>
                EC {redLightThreshold}
              </text>
            </>
          )}

          {/* Reference overlay line (dotted, faint) */}
          {referencePoints && referencePoints.length > 1 && (
            <path d={
              referencePoints
                .filter(p => p.timeSec >= xStart && p.timeSec <= xEnd)
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${clX(p.timeSec).toFixed(1)},${yF(p.ec).toFixed(1)}`)
                .join(' ')
            } fill="none" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
          )}

          {/* Fill */}
          <path d={fillPts.join(' ')} fill="url(#ecGrad)" opacity={0.12} />

          {/* Phase segments */}
          {sorted.slice(0, -1).map((p, i) => {
            const phase = getPhase(p.timeSec + (sorted[i + 1]?.timeSec ?? 0) / 2);
            const color = phaseColor(phase);
            return (
              <line key={i} x1={clX(p.timeSec)} y1={yF(p.ec)} x2={clX(sorted[i + 1].timeSec)} y2={yF(sorted[i + 1].ec)}
                stroke={color} strokeWidth={1.5} strokeLinecap="round" />
            );
          })}

          {/* Peak marker */}
          {peak.timeSec >= xStart && peak.timeSec <= xEnd && (
            <>
              <circle cx={clX(peak.timeSec)} cy={yF(peak.ec)} r={3} fill="#1e293b" stroke="white" strokeWidth={1} />
              <text x={clX(peak.timeSec)} y={yF(peak.ec) - 4} textAnchor="middle" fontSize={5} fontWeight={700} fill="#1e293b">
                EC {peak.ec.toFixed(1)}
              </text>
              <text x={clX(peak.timeSec)} y={yF(peak.ec) - 8} textAnchor="middle" fontSize={4} fill="#64748b">
                @ {Math.floor(peak.timeSec / 60)}:{String(Math.floor(peak.timeSec % 60)).padStart(2, '0')}
              </text>
            </>
          )}

          {/* Current time marker */}
          <line x1={clX(currentTime)} y1={yF(0)} x2={clX(currentTime)} y2={yF(currentEC)}
            stroke={phaseColor(getPhase(currentTime))} strokeWidth={1.5} opacity={0.5} />
          <circle cx={clX(currentTime)} cy={yF(currentEC)} r={3} fill={phaseColor(getPhase(currentTime))}
            stroke="white" strokeWidth={1.5} />

          {/* Hover crosshair line + dot */}
          {tooltipPoint && (
            <>
              <line x1={clX(tooltipPoint.timeSec)} y1={yF(0)} x2={clX(tooltipPoint.timeSec)} y2={yF(tooltipPoint.ec)}
                stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,2" opacity={0.7} />
              <circle cx={clX(tooltipPoint.timeSec)} cy={yF(tooltipPoint.ec)} r={3}
                fill="#64748b" stroke="white" strokeWidth={1.5} />
            </>
          )}

          {/* X labels */}
          <text x={clX(xStart)} y={H - 1} textAnchor="start" fontSize={4} fill="#94a3b8">
            {Math.floor(xStart / 60)}:{String(Math.floor(xStart % 60)).padStart(2, '0')}
          </text>
          <text x={clX(xEnd)} y={H - 1} textAnchor="end" fontSize={4} fill="#94a3b8">
            {Math.floor(xEnd / 60)}:{String(Math.floor(xEnd % 60)).padStart(2, '0')}
          </text>

          <defs>
            <linearGradient id="ecGrad" x1={0} y1={0} x2={0} y2={1}>
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>

        {/* Hover tooltip */}
        {tooltipPoint && (
          <div className="pointer-events-none absolute z-10 bg-gray-900 text-white rounded px-2 py-1 text-[11px] font-semibold shadow-lg whitespace-nowrap"
            style={{ left: clX(tooltipPoint.timeSec) * chartZoom + 10, top: Math.max(0, yF(tooltipPoint.ec) * chartZoom - 38) }}
          >
            <span className="text-blue-300">EC {tooltipPoint.ec.toFixed(2)}</span>
            <span className="mx-1 text-gray-400">@</span>
            {Math.floor(tooltipPoint.timeSec / 60)}:{String(Math.floor(tooltipPoint.timeSec % 60)).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Continuous zoom controls */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <button onClick={() => onZoomChange(parseFloat(Math.max(1, chartZoom - 0.25).toFixed(2)))}
          disabled={!canZoomOut}
          className={`w-7 h-7 rounded-full border text-sm font-bold flex items-center justify-center ${canZoomOut ? 'border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700' : 'border-slate-100 dark:border-slate-700 dark:border-slate-700 text-slate-300 dark:text-slate-600 dark:text-slate-600 cursor-default bg-transparent'}`}
        >−</button>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400 w-10 text-center tabular-nums">{chartZoom}×</span>
        <button onClick={() => onZoomChange(parseFloat(Math.min(8, chartZoom + 0.25).toFixed(2)))}
          disabled={!canZoomIn}
          className={`w-7 h-7 rounded-full border text-sm font-bold flex items-center justify-center ${canZoomIn ? 'border-slate-300 dark:border-slate-600 dark:border-slate-600 bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700' : 'border-slate-100 dark:border-slate-700 dark:border-slate-700 text-slate-300 dark:text-slate-600 dark:text-slate-600 cursor-default bg-transparent'}`}
        >+</button>
        {chartZoom > 1 && (
          <button onClick={() => { onZoomChange(1); onPanChange(0); }}
            className="px-2 py-1 text-[9px] font-bold border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700"
          >Reset</button>
        )}
      </div>
      {chartZoom > 1 && (
        <div className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500">Drag the chart to pan · scroll to navigate</div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function BedVisual({ ecPoints, ec: fallbackEC = 28, brewTimeSec = 180, redLightThreshold, referencePoints, onImportPhases, className = '', pourPlan }: BedVisualProps) {
  const [time, setTime] = useState(brewTimeSec);
  const [chartZoom, setChartZoom] = useState(1);
  const [chartPan, setChartPan] = useState(0);
  const [selectedPhaseIndices, setSelectedPhaseIndices] = useState<Set<number>>(new Set());

  const analysis = useMemo(() => ecPoints && ecPoints.length > 0 ? analyzeCurve(ecPoints, redLightThreshold) : null, [ecPoints, redLightThreshold]);
  const phaseRanges = useMemo(() => analysis?.getPhaseRanges() ?? [], [analysis]);

  const pourPlanPhaseAnalysis = useMemo(() => {
    if (!analysis || !pourPlan || pourPlan.length === 0) return null;
    const phaseColors: Record<string, string> = {
      blooming: '#3b82f6', extracting: '#22c55e', declining: '#f59e0b', collapsing: '#ef4444', collapsed: '#b91c1c',
    };
    const phaseHealth: Record<string, number> = {
      extracting: 1.0, blooming: 0.85, declining: 0.6, collapsing: 0.3, collapsed: 0.1,
    };
    const peakEC = analysis.peak.ec;
    return pourPlan.map((entry, i) => {
      const startPct = i === 0 ? 0 : pourPlan[i - 1].cumulativePercent;
      const endPct = entry.cumulativePercent;
      const startTime = (startPct / 100) * brewTimeSec;
      const endTime = (endPct / 100) * brewTimeSec;
      const phases: {
        phase: string; color: string; startTime: number; endTime: number; ecStart: number; ecEnd: number;
      }[] = [];
      for (const r of phaseRanges) {
        const overlapStart = Math.max(r.startTime, startTime);
        const overlapEnd = Math.min(r.endTime, endTime);
        if (overlapStart < overlapEnd) {
          phases.push({
            phase: r.phase,
            color: r.color,
            startTime: overlapStart,
            endTime: overlapEnd,
            ecStart: analysis.getEC(overlapStart),
            ecEnd: analysis.getEC(overlapEnd),
          });
        }
      }
      if (phases.length === 0) {
        const midT = (startTime + endTime) / 2;
        const p = analysis.getPhase(midT);
        const ec = analysis.getEC(midT);
        phases.push({ phase: p, color: phaseColors[p] ?? '#94a3b8', startTime: midT, endTime: midT, ecStart: ec, ecEnd: ec });
      }
      let totalDur = 0;
      let healthWeighted = 0;
      for (const p of phases) {
        const dur = Math.max(0.001, p.endTime - p.startTime);
        totalDur += dur;
        healthWeighted += dur * (phaseHealth[p.phase] ?? 0.5);
      }
      const midEC = analysis.getEC((startTime + endTime) / 2);
      const ecRatio = peakEC > 0 ? Math.min(1, midEC / peakEC) : 0;
      const integrity = Math.round((healthWeighted / totalDur * 0.5 + ecRatio * 0.5) * 100);
      return { stepIndex: i, startPct, endPct, integrity, phases };
    });
  }, [analysis, pourPlan, brewTimeSec, phaseRanges]);

  const currentEC = analysis ? analysis.getEC(time) : fallbackEC;
  const currentPhase = analysis ? analysis.getPhase(time) : 'blooming';
  const crackSeverity = analysis ? analysis.getCrackSeverity(time) : 0;
  const peak = analysis?.peak ?? null;
  const currentDerivative = analysis && analysis.derivatives.length > 0
    ? analysis.derivatives.reduce((best, d) => Math.abs(d.timeSec - time) < Math.abs(best.timeSec - time) ? d : best)
    : null;

  const progress = Math.min(1, Math.max(0, time / brewTimeSec));

  const [cutTargetSec, setCutTargetSec] = useState<number | ''>('');
  const declineStart = analysis?.findDeclineStart() ?? null;
  const collapseStart = analysis?.findCollapseStart() ?? null;
  const redLightCross = redLightThreshold !== undefined ? analysis?.findRedLightCross(redLightThreshold) ?? null : null;
  const postPeakLowest = analysis?.getPostPeakLowest() ?? null;

  const phaseMeta: Record<string, { level: string; color: string; bar: string; desc: string }> = {
    blooming: { level: 'Blooming', color: '#3b82f6', bar: '#2563eb', desc: 'Bed saturating — EC rising, no channels yet' },
    extracting: { level: 'Extracting', color: '#22c55e', bar: '#16a34a', desc: 'Peak extraction — bed fully saturated, even flow' },
    declining: { level: 'Declining', color: '#f59e0b', bar: '#d97706', desc: 'Extraction winding down — fines migration starting' },
    collapsing: { level: 'Collapsing', color: '#ef4444', bar: '#dc2626', desc: 'Rapid EC drop — channels forming, uneven extraction' },
    collapsed: { level: 'Collapsed', color: '#b91c1c', bar: '#991b1b', desc: 'Bed collapsed — severe channeling, stalled extraction' },
  };

  const state = currentPhase === 'collapsed'
    ? { level: 'Collapsed', color: '#b91c1c', bar: '#991b1b', crack: true, desc: 'Bed collapsed — below red light threshold' }
    : { ...phaseMeta[currentPhase], crack: currentPhase === 'collapsing' || currentPhase === 'declining' };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Cone cross-section */}
      <div className="relative w-36 h-48">
        <div className="absolute inset-0"
          style={{ clipPath: 'polygon(15% 0%, 85% 0%, 70% 100%, 30% 100%)' }}
        >
          {/* Water layer */}
          <div className="absolute inset-x-0 top-0"
            style={{
              height: currentPhase === 'blooming' ? '40%' : '25%',
              background: currentPhase === 'blooming'
                ? 'linear-gradient(180deg, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0.15) 100%)'
                : 'linear-gradient(180deg, rgba(147,197,253,0.3) 0%, rgba(147,197,253,0.1) 100%)',
              borderBottom: currentPhase === 'blooming' ? '1px dashed rgba(59,130,246,0.5)' : '1px dashed rgba(147,197,253,0.4)',
              transition: 'all 0.3s',
            }}
          />

          {/* Coffee bed */}
          <div className="absolute inset-x-0"
            style={{
              top: currentPhase === 'blooming' ? '12%' : '8%',
              bottom: crackSeverity >= 2 ? '18%' : '15%',
              background: crackSeverity >= 2
                ? `linear-gradient(135deg, ${state.color}22 0%, ${state.color}55 40%, ${state.color}11 60%, ${state.color}44 100%)`
                : `linear-gradient(180deg, ${state.color}55 0%, ${state.color}88 40%, ${state.color}66 100%)`,
              transition: 'all 0.3s',
            }}
          >
            {crackSeverity >= 1 && (
              <div className="absolute"
                style={{
                  left: '40%', width: '6%', height: '60%', top: '20%',
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, transparent 100%)',
                  clipPath: 'polygon(40% 0%, 60% 0%, 55% 100%, 45% 100%)',
                }}
              />
            )}
            {crackSeverity >= 2 && (
              <>
                <div className="absolute"
                  style={{
                    left: '30%', width: '10%', height: '85%', top: '5%',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)',
                    clipPath: 'polygon(25% 0%, 75% 0%, 65% 100%, 35% 100%)',
                  }}
                />
                <div className="absolute"
                  style={{
                    left: '55%', width: '8%', height: '70%', top: '15%',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 100%)',
                    clipPath: 'polygon(20% 0%, 80% 0%, 65% 100%, 35% 100%)',
                  }}
                />
              </>
            )}
            {crackSeverity >= 3 && (
              <>
                <div className="absolute"
                  style={{
                    left: '20%', width: '15%', height: '95%', top: '0%',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
                    clipPath: 'polygon(20% 0%, 80% 0%, 70% 100%, 30% 100%)',
                  }}
                />
                <div className="absolute"
                  style={{
                    left: '50%', width: '12%', height: '80%', top: '10%',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
                    clipPath: 'polygon(25% 0%, 75% 0%, 65% 100%, 35% 100%)',
                  }}
                />
                <div className="absolute"
                  style={{
                    left: '65%', width: '6%', height: '55%', top: '25%',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 100%)',
                    clipPath: 'polygon(20% 0%, 80% 0%, 65% 100%, 35% 100%)',
                  }}
                />
              </>
            )}
            {currentPhase === 'blooming' && (
              <div className="absolute inset-x-0 top-[30%] h-[1px] bg-white dark:bg-slate-800 dark:bg-slate-800/20" />
            )}
          </div>

          {/* Filter paper */}
          <div className="absolute inset-x-0"
            style={{
              bottom: '5%', height: '12%',
              background: 'repeating-linear-gradient(90deg, #e2e8f0 0px, #e2e8f0 4px, #f1f5f9 4px, #f1f5f9 8px)',
              borderRadius: '0 0 4px 4px', border: '1px solid #cbd5e1',
            }}
          />
        </div>

        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: state.color }} title={state.level}
        />
      </div>

      {/* Phase + EC label */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: state.color }}>{state.level}</span>
        <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">|</span>
        <span className="font-bold tabular-nums" style={{ color: state.color }}>EC {currentEC.toFixed(1)}</span>
        <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600 mx-0.5">·</span>
        <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">Peak {peak?.ec.toFixed(1) ?? '—'} @ {peak ? `${Math.floor(peak.timeSec / 60)}:${String(Math.floor(peak.timeSec % 60)).padStart(2, '0')}` : '—'}</span>
      </div>

      {/* Report table */}
      {analysis && (
        <div className="w-full" style={{ maxWidth: BASE_W * chartZoom }}>
          <table className="w-full text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 border-collapse">
            <tbody>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Phase</td>
                <td className="py-0.5 font-bold" style={{ color: state.color }}>{state.level}</td>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider pl-4">Slope</td>
                <td className="py-0.5 font-bold tabular-nums"
                  style={{ color: currentDerivative && currentDerivative.rate < -(peak?.ec ?? 0) * 0.03 ? '#ef4444' : currentDerivative && currentDerivative.rate < 0 ? '#f59e0b' : '#22c55e' }}
                >
                  {currentDerivative ? `${currentDerivative.rate >= 0 ? '+' : ''}${currentDerivative.rate.toFixed(2)}/s` : '—'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">EC</td>
                <td className="py-0.5 font-bold tabular-nums">{currentEC.toFixed(2)}</td>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider pl-4">Peak Δ</td>
                <td className="py-0.5 font-bold tabular-nums">
                  {peak ? `${(currentEC - peak.ec) >= 0 ? '+' : ''}${(currentEC - peak.ec).toFixed(2)}` : '—'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Peak</td>
                <td className="py-0.5 font-bold tabular-nums">{peak ? `${peak.ec.toFixed(1)} @ ${Math.floor(peak.timeSec / 60)}:${String(Math.floor(peak.timeSec % 60)).padStart(2, '0')}` : '—'}</td>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider pl-4">Red Light</td>
                <td className="py-0.5 font-bold tabular-nums"
                  style={{ color: redLightThreshold !== undefined && currentEC <= redLightThreshold ? '#ef4444' : '#22c55e' }}
                >
                  {redLightThreshold !== undefined
                    ? (currentEC <= redLightThreshold ? `⚠ EC ≤ ${redLightThreshold}` : `EC > ${redLightThreshold} ✓`)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Risk</td>
                <td className="py-0.5 font-bold tabular-nums" colSpan={3}
                  style={{ color: currentPhase === 'collapsed' ? '#b91c1c' : currentPhase === 'collapsing' ? '#ef4444' : currentPhase === 'declining' ? '#f59e0b' : '#22c55e' }}
                >
                  {currentPhase === 'collapsed' ? 'Collapsed — stalled extraction'
                    : currentPhase === 'collapsing' ? 'Channeling — rapid EC drop'
                    : currentPhase === 'declining' ? 'Fines migration — watch descent'
                    : currentPhase === 'extracting' ? 'Stable extraction'
                    : 'Saturating — normal bloom'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider" title="First point where EC drop accelerates beyond normal">Decline ↓</td>
                <td className="py-0.5 font-bold tabular-nums" style={{ color: '#f59e0b' }}>
                  {declineStart ? `${Math.floor(declineStart.timeSec / 60)}:${String(Math.floor(declineStart.timeSec % 60)).padStart(2, '0')}  EC ${declineStart.ec.toFixed(1)}` : '—'}
                </td>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider pl-4" title="First point where bed starts to collapse">Collapse ↓</td>
                <td className="py-0.5 font-bold tabular-nums" style={{ color: '#ef4444' }}>
                  {collapseStart ? `${Math.floor(collapseStart.timeSec / 60)}:${String(Math.floor(collapseStart.timeSec % 60)).padStart(2, '0')}  EC ${collapseStart.ec.toFixed(1)}` : '—'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider" title="Time EC first drops below red light threshold">Cut @ RL</td>
                <td className="py-0.5 font-bold tabular-nums" style={{ color: redLightCross ? '#ef4444' : '#22c55e' }}>
                  {redLightCross ? `${Math.floor(redLightCross.timeSec / 60)}:${String(Math.floor(redLightCross.timeSec % 60)).padStart(2, '0')}  EC ${redLightCross.ec.toFixed(1)}` : 'EC > RL ✓'}
                </td>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider pl-4">Lowest</td>
                <td className="py-0.5 font-bold tabular-nums" style={{ color: '#64748b' }}>
                  {postPeakLowest ? `${Math.floor(postPeakLowest.timeSec / 60)}:${String(Math.floor(postPeakLowest.timeSec % 60)).padStart(2, '0')}  EC ${postPeakLowest.ec.toFixed(1)}` : '—'}
                </td>
              </tr>
              <tr>
                <td className="pr-3 py-0.5 text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Cut at time</td>
                <td colSpan={3} className="py-0.5">
                  <div className="flex items-center gap-1.5">
                    <input value={cutTargetSec === '' ? '' : `${Math.floor(cutTargetSec / 60)}:${String(Math.floor(cutTargetSec % 60)).padStart(2, '0')}`}
                      onChange={e => {
                        const parts = e.target.value.split(':');
                        const m = parseInt(parts[0]);
                        const s = parseInt(parts[1]);
                        if (!isNaN(m) && !isNaN(s) && s >= 0 && s < 60) setCutTargetSec(m * 60 + s);
                        else if (e.target.value === '') setCutTargetSec('');
                      }}
                      className="w-14 px-1 py-0.5 text-[9px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="m:ss"
                    />
                    {cutTargetSec !== '' && analysis && (
                      <span className="text-[9px] font-bold tabular-nums">
                        EC {analysis.getEC(cutTargetSec).toFixed(1)}
                        <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600 mx-1">·</span>
                        <span style={{ color: (() => {
                          const p = analysis.getPhase(cutTargetSec);
                          return p === 'collapsed' ? '#b91c1c' : p === 'collapsing' ? '#ef4444' : p === 'declining' ? '#f59e0b' : p === 'extracting' ? '#22c55e' : '#3b82f6';
                        })() }}>
                          {analysis.getPhase(cutTargetSec)}
                        </span>
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Phase detection summary */}
      {analysis && phaseRanges.length > 0 && (
        <div className="w-full" style={{ maxWidth: BASE_W * chartZoom }}>
          <div className="flex items-center justify-between mt-2 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Detected Phases</span>
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={selectedPhaseIndices.size === phaseRanges.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPhaseIndices(new Set(phaseRanges.map((_, i) => i)));
                    } else {
                      setSelectedPhaseIndices(new Set());
                    }
                  }}
                  className="w-2.5 h-2.5 accent-slate-700"
                />
                <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">All</span>
              </label>
            </div>
            {selectedPhaseIndices.size > 0 && onImportPhases && (
              <button onClick={() => {
                const selected = phaseRanges.filter((_, i) => selectedPhaseIndices.has(i));
                onImportPhases(selected);
              }}
                className="px-2 py-0.5 text-[8px] font-bold border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-400"
              >+ Import selected ({selectedPhaseIndices.size})</button>
            )}
          </div>
          <table className="w-full text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 dark:border-slate-700">
                <th className="w-4 pr-1 py-0.5"></th>
                <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Phase</th>
                <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Start</th>
                <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">End</th>
                <th className="pr-2 py-0.5 text-right font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">EC</th>
                <th className="py-0.5 text-right font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Duration</th>
              </tr>
            </thead>
            <tbody>
              {phaseRanges.map((r, i) => {
                const isActive = time >= r.startTime && time <= r.endTime;
                const ecStart = analysis?.getEC(r.startTime) ?? 0;
                const ecEnd = analysis?.getEC(r.endTime) ?? 0;
                return (
                  <tr key={i}
                    onClick={() => setTime(r.startTime)}
                    className={`border-b border-slate-50 cursor-pointer transition-colors ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                    style={isActive ? { borderLeft: `2px solid ${r.color}`, boxShadow: 'inset 2px 0 0 0' } : {}}
                  >
                    <td className="pr-1 py-0.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedPhaseIndices.has(i)}
                        onChange={(e) => {
                          const next = new Set(selectedPhaseIndices);
                          e.target.checked ? next.add(i) : next.delete(i);
                          setSelectedPhaseIndices(next);
                        }}
                        className="w-2.5 h-2.5 accent-slate-700"
                      />
                    </td>
                    <td className="pr-2 py-0.5 font-bold" style={{ color: r.color }}>{r.phase}</td>
                    <td className="pr-2 py-0.5 tabular-nums">
                      {Math.floor(r.startTime / 60)}:{String(Math.floor(r.startTime % 60)).padStart(2, '0')}
                    </td>
                    <td className="pr-2 py-0.5 tabular-nums">
                      {Math.floor(r.endTime / 60)}:{String(Math.floor(r.endTime % 60)).padStart(2, '0')}
                    </td>
                    <td className="pr-2 py-0.5 text-right tabular-nums text-slate-600 dark:text-slate-400 dark:text-slate-400">
                      {ecStart.toFixed(1)}→{ecEnd.toFixed(1)}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">
                      {(r.endTime - r.startTime).toFixed(1)}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pour Plan Phase Analysis */}
      {pourPlanPhaseAnalysis && pourPlanPhaseAnalysis.length > 0 && (
        <div className="w-full mt-2" style={{ maxWidth: BASE_W * chartZoom }}>
          <div className="flex items-center justify-between mt-2 mb-1">
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider">Pour Plan Phase Analysis</span>
          </div>
          {pourPlanPhaseAnalysis.map((step) => {
            const stepStartTime = (step.startPct / 100) * brewTimeSec;
            const stepEndTime = (step.endPct / 100) * brewTimeSec;
            return (
              <div key={step.stepIndex} className="mb-2">
                <div className="flex items-center gap-1.5 text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 font-medium mb-0.5">
                  <span>Step {step.stepIndex + 1}: {step.startPct}% → {step.endPct}% &nbsp;
                    ({Math.floor(stepStartTime / 60)}:{String(Math.floor(stepStartTime % 60)).padStart(2, '0')} → {Math.floor(stepEndTime / 60)}:{String(Math.floor(stepEndTime % 60)).padStart(2, '0')})</span>
                  <span className="px-1 py-0.5 rounded text-[7px] font-bold tabular-nums leading-none"
                    style={{
                      backgroundColor: step.integrity >= 70 ? '#dcfce7' : step.integrity >= 40 ? '#fef3c7' : '#fee2e2',
                      color: step.integrity >= 70 ? '#166534' : step.integrity >= 40 ? '#92400e' : '#991b1b',
                    }}
                  >Bed {step.integrity}%</span>
                </div>
                <table className="w-full text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 dark:border-slate-700">
                      <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Phase</th>
                      <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Start</th>
                      <th className="pr-2 py-0.5 text-left font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">End</th>
                      <th className="pr-2 py-0.5 text-right font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">EC</th>
                      <th className="py-0.5 text-right font-semibold text-slate-400 dark:text-slate-500 dark:text-slate-500">Dur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.phases.map((p, j) => (
                      <tr key={j} className="border-b border-slate-50">
                        <td className="pr-2 py-0.5 font-bold" style={{ color: p.color }}>{p.phase}</td>
                        <td className="pr-2 py-0.5 tabular-nums">
                          {Math.floor(p.startTime / 60)}:{String(Math.floor(p.startTime % 60)).padStart(2, '0')}
                        </td>
                        <td className="pr-2 py-0.5 tabular-nums">
                          {Math.floor(p.endTime / 60)}:{String(Math.floor(p.endTime % 60)).padStart(2, '0')}
                        </td>
                        <td className="pr-2 py-0.5 text-right tabular-nums text-slate-600 dark:text-slate-400 dark:text-slate-400">
                          {p.ecStart.toFixed(1)}→{p.ecEnd.toFixed(1)}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">
                          {(p.endTime - p.startTime).toFixed(1)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive EC chart */}
      {analysis && (
        <MiniECChart
          sorted={analysis.sorted}
          peak={analysis.peak}
          currentTime={time}
          currentEC={currentEC}
          brewTimeSec={brewTimeSec}
          redLightThreshold={redLightThreshold}
          getPhase={analysis.getPhase}
          getEC={analysis.getEC}
          chartZoom={chartZoom}
          chartPan={chartPan}
          onZoomChange={setChartZoom}
          onPanChange={setChartPan}
          referencePoints={referencePoints}
          onSeek={setTime}
        />
      )}

      {/* Slider — scales with chart zoom */}
      <div className="w-full flex flex-col gap-0.5" style={{ maxWidth: BASE_W * chartZoom }}>
        <input type="range" min={0} max={brewTimeSec} value={time}
          onChange={(e) => setTime(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(90deg, ${state.color} 0%, ${state.color} ${progress * 100}%, #e2e8f0 ${progress * 100}%, #e2e8f0 100%)`,
          }}
        />
        <div className="flex justify-between text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 tabular-nums" style={{ fontSize: 7 * (chartZoom > 1 ? 1.3 : 1) }}>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((r, i) => {
            const t = brewTimeSec * r;
            return <span key={i}>{Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}</span>;
          })}
        </div>
        <div className="text-center font-semibold tabular-nums text-slate-500 dark:text-slate-400 dark:text-slate-400" style={{ fontSize: 9 * (chartZoom > 1 ? 1.3 : 1) }}>
          {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}
