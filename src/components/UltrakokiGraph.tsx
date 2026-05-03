import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';

export interface UltrakokiBrewData {
  period: number;
  label: string;
  intervalSeconds: number;
  pourFlow: number[];
  dripFlow: number[];
  cumulativePour: number[];
}

export interface ComparisonCurvePoint {
  time: number;
  ecValue: number;
}

export interface UltrakokiPhaseLog {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
}

type SeriesKey = 'cumulativePour' | 'pourFlow' | 'dripFlow';
type PresetKey = 'brew';

interface SeriesCfg {
  key: SeriesKey;
  label: string;
  shortLabel: string;
  color: string;
  axis: 'left' | 'right';
  drawAs: 'line' | 'bar';
}

const SERIES_CFG: SeriesCfg[] = [
  { key: 'cumulativePour', label: 'Cumulative Pour (g)', shortLabel: 'Pour Total', color: '#2563eb', axis: 'left', drawAs: 'line' },
  { key: 'pourFlow', label: 'Pour Flow (g/s)', shortLabel: 'Pour Flow', color: '#0ea5e9', axis: 'left', drawAs: 'bar' },
  { key: 'dripFlow', label: 'Drip Rate (g/s)', shortLabel: 'Drip Rate', color: '#14b8a6', axis: 'left', drawAs: 'bar' },
];

const PRESET_SERIES: Record<PresetKey, SeriesKey[]> = {
  brew: ['cumulativePour', 'pourFlow', 'dripFlow'],
};

const PRESET_LABELS: Record<PresetKey, string> = {
  brew: 'Brew Flow',
};

const PAD = { top: 28, right: 64, bottom: 64, left: 64 };
const COMPARISON_COLOR = '#111827';

interface Props {
  data: UltrakokiBrewData;
  comparisonCurve?: ComparisonCurvePoint[];
  comparisonLabel?: string;
  phaseLogs?: UltrakokiPhaseLog[];
  redLightTime?: number | null;
  showRedLight?: boolean;
}

const formatClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const maxOf = (values: number[]) => {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : 0;
};

export const UltrakokiGraph: React.FC<Props> = ({
  data,
  comparisonCurve = [],
  comparisonLabel = 'Digitized EC curve',
  phaseLogs = [],
  redLightTime = null,
  showRedLight = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(380);
  const [preset, setPreset] = useState<PresetKey>('brew');
  const [enabled, setEnabled] = useState<Set<SeriesKey>>(() => new Set(PRESET_SERIES.brew));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showSeriesControls, setShowSeriesControls] = useState<boolean>(false);
  const hasComparisonCurve = comparisonCurve.length > 1;
  const showComparison = hasComparisonCurve;

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const width = Math.min(containerRef.current.clientWidth - 2, 1240);
      const isMobile = window.innerWidth < 768;
      const height = isMobile
        ? Math.max(440, Math.min(window.innerHeight * 0.66, 560))
        : Math.max(420, Math.min(window.innerHeight * 0.54, 620));
      setCanvasWidth(width);
      setCanvasHeight(height);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const setPresetMode = useCallback((nextPreset: PresetKey) => {
    setPreset(nextPreset);
    setEnabled(new Set(PRESET_SERIES[nextPreset]));
  }, []);

  const getSeries = useCallback((key: SeriesKey): number[] => {
    switch (key) {
      case 'cumulativePour': return data.cumulativePour;
      case 'pourFlow': return data.pourFlow;
      case 'dripFlow': return data.dripFlow;
    }
  }, [data]);

  const sortedComparisonCurve = useMemo(
    () => [...comparisonCurve].filter(point => Number.isFinite(point.time) && Number.isFinite(point.ecValue)).sort((a, b) => a.time - b.time),
    [comparisonCurve]
  );

  const compareAtTime = useCallback((timeSeconds: number) => {
    if (sortedComparisonCurve.length === 0) return null;
    let closest = sortedComparisonCurve[0];
    let minDelta = Math.abs(sortedComparisonCurve[0].time - timeSeconds);
    for (const point of sortedComparisonCurve) {
      const delta = Math.abs(point.time - timeSeconds);
      if (delta < minDelta) {
        closest = point;
        minDelta = delta;
      }
    }
    return closest;
  }, [sortedComparisonCurve]);

  const timelinePointCount = useMemo(() => {
    const basePointCount = Math.max(data.cumulativePour.length, data.pourFlow.length, data.dripFlow.length);
    const baseDurationSeconds = Math.max(
      data.period,
      (basePointCount - 1) * data.intervalSeconds
    );
    const phaseMaxSeconds = phaseLogs.reduce((max, log) => Math.max(max, log.startTime, log.endTime), 0);
    const comparisonMaxSeconds = sortedComparisonCurve.length > 0
      ? sortedComparisonCurve[sortedComparisonCurve.length - 1].time
      : 0;
    const redLightSeconds = redLightTime ?? 0;
    const maxDurationSeconds = Math.max(baseDurationSeconds, phaseMaxSeconds, comparisonMaxSeconds, redLightSeconds);
    return Math.max(2, Math.ceil(maxDurationSeconds / data.intervalSeconds) + 1);
  }, [
    data.cumulativePour.length,
    data.pourFlow.length,
    data.dripFlow.length,
    data.period,
    data.intervalSeconds,
    phaseLogs,
    sortedComparisonCurve,
    redLightTime,
  ]);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, '#fffdf8');
    gradient.addColorStop(1, '#f8fafc');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const plotWidth = canvasWidth - PAD.left - PAD.right;
    const plotHeight = canvasHeight - PAD.top - PAD.bottom;
    if (timelinePointCount < 2) return;

    const xStep = plotWidth / (timelinePointCount - 1);
    let leftMax = 0;
    let rightMax = 0;

    for (const cfg of SERIES_CFG) {
      if (!enabled.has(cfg.key)) continue;
      const maxValue = maxOf(getSeries(cfg.key));
      if (cfg.axis === 'left') leftMax = Math.max(leftMax, maxValue);
    }
    if (showComparison) {
      rightMax = Math.max(rightMax, maxOf(sortedComparisonCurve.map(point => point.ecValue)));
    }

    leftMax = leftMax > 0 ? leftMax * 1.12 : 1;
    rightMax = rightMax > 0 ? rightMax * 1.12 : 1;

    const toX = (index: number) => PAD.left + index * xStep;
    const toY = (value: number, axis: 'left' | 'right') => {
      const ceiling = axis === 'left' ? leftMax : rightMax;
      return PAD.top + plotHeight - (value / ceiling) * plotHeight;
    };

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let index = 0; index <= 6; index += 1) {
      const y = PAD.top + (index * plotHeight) / 6;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotWidth, y);
      ctx.stroke();
    }
    for (let index = 0; index <= 6; index += 1) {
      const x = PAD.left + (index * plotWidth) / 6;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotHeight);
      ctx.stroke();
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD.left, PAD.top, plotWidth, plotHeight);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let index = 0; index <= 6; index += 1) {
      const pointIndex = Math.round(((timelinePointCount - 1) * index) / 6);
      const time = pointIndex * data.intervalSeconds;
      ctx.fillText(formatClock(time), toX(pointIndex), PAD.top + plotHeight + 18);
    }

    ctx.textAlign = 'right';
    for (let index = 0; index <= 5; index += 1) {
      const value = (leftMax / 1.12) * (index / 5);
      const y = PAD.top + plotHeight - (index / 5) * plotHeight;
      ctx.fillText(value.toFixed(value >= 10 ? 0 : 1), PAD.left - 8, y + 4);
    }

    ctx.textAlign = 'left';
    for (let index = 0; index <= 5; index += 1) {
      const value = (rightMax / 1.12) * (index / 5);
      const y = PAD.top + plotHeight - (index / 5) * plotHeight;
      ctx.fillText(value.toFixed(value >= 10 ? 1 : 2), PAD.left + plotWidth + 8, y + 4);
    }

    ctx.save();
    ctx.translate(18, PAD.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f766e';
    ctx.font = '12px sans-serif';
    ctx.fillText('Weight / Flow (g)', 0, 0);
    ctx.restore();

    if (showComparison) {
      ctx.save();
      ctx.translate(canvasWidth - 16, PAD.top + plotHeight / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c2410c';
      ctx.font = '12px sans-serif';
      ctx.fillText('EC Curve', 0, 0);
      ctx.restore();
    }

    ctx.fillStyle = '#475569';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (min:sec)', PAD.left + plotWidth / 2, canvasHeight - 12);

    for (const cfg of SERIES_CFG.filter(item => item.drawAs === 'bar' && enabled.has(item.key))) {
      const barWidth = Math.max(2, xStep * 0.58);
      const values = getSeries(cfg.key);
      const hex = cfg.color;
      const red = parseInt(hex.slice(1, 3), 16);
      const green = parseInt(hex.slice(3, 5), 16);
      const blue = parseInt(hex.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.30)`;
      values.forEach((value, index) => {
        if (!Number.isFinite(value) || value <= 0) return;
        const x = toX(index);
        const y = toY(value, cfg.axis);
        ctx.fillRect(x - barWidth / 2, y, barWidth, PAD.top + plotHeight - y);
      });
    }

    const hexToRgba = (hex: string, alpha: number) => {
      const clean = hex.replace('#', '');
      const bigint = parseInt(clean, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    phaseLogs.forEach((log, index) => {
      const startX = PAD.left + (log.startTime / data.intervalSeconds) * xStep;
      const endX = PAD.left + (log.endTime / data.intervalSeconds) * xStep;
      const left = Math.max(PAD.left, Math.min(startX, endX));
      const right = Math.min(PAD.left + plotWidth, Math.max(startX, endX));
      const width = right - left;
      if (width <= 1) return;

      ctx.fillStyle = hexToRgba(log.color, 0.10);
      ctx.fillRect(left, PAD.top, width, plotHeight);

      ctx.strokeStyle = log.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(left, PAD.top);
      ctx.lineTo(left, PAD.top + plotHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(right, PAD.top);
      ctx.lineTo(right, PAD.top + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = log.color;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(log.name, left + width / 2, PAD.top - 10 - (index % 2) * 12);
    });

    if (showRedLight && redLightTime !== null) {
      const redX = PAD.left + (redLightTime / data.intervalSeconds) * xStep;
      if (redX >= PAD.left && redX <= PAD.left + plotWidth) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(redX, PAD.top);
        ctx.lineTo(redX, PAD.top + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ef4444';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Red Light ${formatClock(redLightTime)}`, redX, PAD.top - 28);
        ctx.restore();
      }
    }

    for (const cfg of SERIES_CFG.filter(item => item.drawAs === 'line' && enabled.has(item.key))) {
      const values = getSeries(cfg.key);
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = cfg.key === 'cumulativePour' ? 2.8 : 2.2;
      ctx.beginPath();
      let started = false;
      values.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        const x = toX(index);
        const y = toY(value, cfg.axis);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    if (showComparison) {
      ctx.save();
      ctx.strokeStyle = COMPARISON_COLOR;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      sortedComparisonCurve.forEach((point, index) => {
        const normalizedIndex = Math.max(0, Math.min(timelinePointCount - 1, point.time / data.intervalSeconds));
        const x = PAD.left + normalizedIndex * xStep;
        const y = toY(point.ecValue, 'right');
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    if (hoverIdx !== null) {
      const hoverX = toX(hoverIdx);
      const hoverTime = hoverIdx * data.intervalSeconds;

      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverX, PAD.top);
      ctx.lineTo(hoverX, PAD.top + plotHeight);
      ctx.stroke();
      ctx.restore();

      for (const cfg of SERIES_CFG.filter(item => enabled.has(item.key))) {
        const value = getSeries(cfg.key)[hoverIdx];
        if (!Number.isFinite(value)) continue;
        const y = toY(value, cfg.axis);
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.arc(hoverX, y, cfg.key === 'cumulativePour' ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hoverX, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (showComparison) {
        const comparisonPoint = compareAtTime(hoverTime);
        if (comparisonPoint) {
          const x = PAD.left + Math.max(0, Math.min(timelinePointCount - 1, comparisonPoint.time / data.intervalSeconds)) * xStep;
          const y = toY(comparisonPoint.ecValue, 'right');
          ctx.fillStyle = COMPARISON_COLOR;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [canvasWidth, canvasHeight, data, enabled, getSeries, hoverIdx, showComparison, sortedComparisonCurve, compareAtTime, timelinePointCount]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cursorX = (event.clientX - rect.left) * (canvas.width / rect.width);
    const plotWidth = canvasWidth - PAD.left - PAD.right;
    const relX = cursorX - PAD.left;
    if (relX < 0 || relX > plotWidth) {
      setHoverIdx(null);
      return;
    }
    const nextIdx = Math.max(0, Math.min(timelinePointCount - 1, Math.round((relX / plotWidth) * (timelinePointCount - 1))));
    setHoverIdx(nextIdx);
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }, [canvasWidth, timelinePointCount]);

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  const toggleSeries = useCallback((key: SeriesKey) => {
    setPreset('brew');
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size > 0 ? next : new Set([key]);
    });
  }, []);

  const hoverTime = hoverIdx !== null ? hoverIdx * data.intervalSeconds : null;
  const hoverComparison = hoverTime !== null && showComparison ? compareAtTime(hoverTime) : null;
  const presets = ['brew'] as PresetKey[];
  const summaryCards = [
    { label: 'Total Pour', value: `${maxOf(data.cumulativePour).toFixed(1)} g`, tone: 'bg-blue-50 text-blue-900 border-blue-100' },
    { label: 'Peak Flow', value: `${maxOf(data.pourFlow).toFixed(1)} g/s`, tone: 'bg-cyan-50 text-cyan-900 border-cyan-100' },
    { label: 'Peak Drip', value: `${maxOf(data.dripFlow).toFixed(1)} g/s`, tone: 'bg-teal-50 text-teal-900 border-teal-100' },
    { label: 'EC Overlay', value: hasComparisonCurve ? `${sortedComparisonCurve.length} pts` : 'Not loaded', tone: 'bg-slate-50 text-slate-900 border-slate-200' },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" ref={containerRef}>
      <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Ultrakoki + Custom Curve</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Interactive brew analysis</h3>
            <p className="mt-1 text-sm text-slate-600">
              {data.label} · smart-scale flow timeline · {data.period}s total{hasComparisonCurve ? ` · ${comparisonLabel} is overlaid automatically` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
            {summaryCards.map(card => (
              <div key={card.label} className={`rounded-xl border px-3 py-2 text-xs ${card.tone}`}>
                <div className="font-medium opacity-80">{card.label}</div>
                <div className="mt-1 text-sm font-semibold">{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {presets.map(item => (
              <button
                key={item}
                onClick={() => setPresetMode(item)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${preset === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {PRESET_LABELS[item]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSeriesControls(prev => !prev)}
              className="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {showSeriesControls ? 'Hide series' : 'Choose series'}
            </button>
            {hasComparisonCurve && (
              <div className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                Always showing <span className="font-medium text-slate-900">{comparisonLabel}</span>
              </div>
            )}
          </div>
        </div>

        {showSeriesControls && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
            {SERIES_CFG.map(series => {
              const isOn = enabled.has(series.key);
              return (
                <button
                  key={series.key}
                  onClick={() => toggleSeries(series.key)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${isOn ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 bg-slate-100 text-slate-500'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color, opacity: isOn ? 1 : 0.35 }} />
                    <span className="font-medium">{series.shortLabel}</span>
                  </div>
                  <div className="mt-1 text-xs opacity-75">{series.axis === 'left' ? 'Left axis' : 'Right axis'}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-xl bg-white">
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ display: 'block', width: '100%', height: 'auto', cursor: 'crosshair' }}
            />

            {hoverIdx !== null && hoverTime !== null && (
              <div
                className="fixed z-30 w-[220px] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm"
                style={{ left: Math.min(tooltipPos.x + 14, window.innerWidth - 240), top: Math.max(tooltipPos.y - 8, 8) }}
              >
                <div className="font-semibold text-slate-800">{formatClock(hoverTime)} <span className="font-normal text-slate-400">({hoverTime.toFixed(1)}s)</span></div>
                <div className="mt-2 space-y-1.5">
                  {SERIES_CFG.filter(series => enabled.has(series.key)).map(series => (
                    <div key={series.key} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                        <span>{series.shortLabel}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{(getSeries(series.key)[hoverIdx] ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                  {hoverComparison && (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5">
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full bg-slate-900" />
                        <span>{comparisonLabel}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{hoverComparison.ecValue.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
