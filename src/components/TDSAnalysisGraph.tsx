import React, { useRef, useEffect, useState, useMemo } from 'react';
import tdsCalculationConfig from '../config/tdsCalculationConfig.json';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ECPoint {
  time: number;        // seconds
  ecValue: number;     // mS/cm
  temperature?: number; // °C, optional
}

interface PourPlanEntry {
  cumulativePercent: number;
  duration?: number;
}

interface BrewData {
  intervalSeconds: number;
  cumulativePour: number[]; // grams per index
  pourFlow?: number[];
  dripFlow?: number[];
}

interface PhaseLog {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
  pourPlanPercent?: number | null;
}

interface TDSPoint {
  time: number;
  ec: number;       // raw EC mS/cm
  ec25: number;     // temp-compensated EC @ 25°C
  tds: number;      // TDS %
  ey: number;       // Extraction Yield %
  beverageWeight: number; // g
  temperature?: number;
}

export interface TDSAnalysisGraphProps {
  ecPoints: ECPoint[];
  brewData?: BrewData | null;
  phaseLogs?: PhaseLog[];
  redLightTime?: number | null;
  showRedLight?: boolean;
  pourPlan?: PourPlanEntry[];
  doseWeight: number;       // g of coffee grounds
  brewRatio?: number;       // 1:x
  totalWaterIn?: number;    // grams
  waterInSource?: 'ultrakoki' | 'estimated';
  conversionFactor?: number; // EC→TDS factor, default 0.5
  refractometerTDS?: number | null; // optional final-cup TDS % anchor
  refractometerTDSInput?: string;
  onDoseWeightChange?: (value: number) => void;
  onBrewRatioChange?: (value: number) => void;
  onTotalWaterInChange?: (value: number) => void;
  onConversionFactorChange?: (value: number) => void;
  onRefractometerTDSInputChange?: (value: string) => void;
  onShowRedLightChange?: (value: boolean) => void;
  grinderName?: string;
  grindSize?: number;
  micron?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolateEC(points: ECPoint[], t: number): { ec: number; temperature?: number } {
  if (points.length === 0) return { ec: 0 };
  if (t <= points[0].time) return { ec: points[0].ecValue, temperature: points[0].temperature };
  if (t >= points[points.length - 1].time) {
    const last = points[points.length - 1];
    return { ec: last.ecValue, temperature: last.temperature };
  }
  let lo = 0, hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= t) lo = mid; else hi = mid;
  }
  const p0 = points[lo], p1 = points[hi];
  const frac = (t - p0.time) / (p1.time - p0.time);
  const ec = lerp(p0.ecValue, p1.ecValue, frac);
  const temperature =
    p0.temperature != null && p1.temperature != null
      ? lerp(p0.temperature, p1.temperature, frac)
      : (p0.temperature ?? p1.temperature);
  return { ec, temperature };
}

function getCumulativePour(brewData: BrewData, t: number): number {
  const { cumulativePour, intervalSeconds } = brewData;
  if (cumulativePour.length === 0 || intervalSeconds <= 0) return 0;
  const rawIdx = Math.max(0, t) / intervalSeconds;
  const lo = Math.min(cumulativePour.length - 1, Math.floor(rawIdx));
  const hi = Math.min(cumulativePour.length - 1, Math.ceil(rawIdx));
  if (lo === hi) return cumulativePour[lo] ?? 0;
  return lerp(cumulativePour[lo] ?? 0, cumulativePour[hi] ?? 0, rawIdx - lo);
}

function compensateEC(ecRaw: number, temperature?: number): number {
  if (temperature == null || !isFinite(temperature)) return ecRaw;
  const factor = 1 + 0.02 * (temperature - 25);
  return factor !== 0 ? ecRaw / factor : ecRaw;
}

const formatClock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const formatBrewRatio = (waterIn: number, dose: number): string => {
  if (!Number.isFinite(waterIn) || !Number.isFinite(dose) || dose <= 0) return 'n/a';
  return `1:${(waterIn / dose).toFixed(1)}`;
};

const formatBrewRatioRange = (minWater: number, maxWater: number, dose: number): string => {
  if (!Number.isFinite(minWater) || !Number.isFinite(maxWater) || !Number.isFinite(dose) || dose <= 0) return 'n/a';
  return `${formatBrewRatio(minWater, dose)}-${formatBrewRatio(maxWater, dose)}`;
};

type TargetWindow = {
  startTime: number;
  endTime: number;
  minEC: number;
  maxEC: number;
  minWaterIn: number;
  maxWaterIn: number;
};

const PAD = { top: 40, right: 80, bottom: 56, left: 72 };
const conversionFactorConfig = tdsCalculationConfig.bounds.conversionFactor;
const axisConfig = tdsCalculationConfig.axis;

// ─── Main Component ────────────────────────────────────────────────────────

export const TDSAnalysisGraph: React.FC<TDSAnalysisGraphProps> = ({
  ecPoints,
  brewData,
  phaseLogs = [],
  redLightTime = null,
  showRedLight = false,
  pourPlan = [],
  doseWeight,
  brewRatio = 15,
  totalWaterIn = 225,
  waterInSource = 'estimated',
  conversionFactor = tdsCalculationConfig.defaults.conversionFactor,
  refractometerTDS = null,
  refractometerTDSInput,
  onDoseWeightChange,
  onBrewRatioChange,
  onTotalWaterInChange,
  onConversionFactorChange,
  onRefractometerTDSInputChange,
  onShowRedLightChange,
  grinderName,
  grindSize,
  micron,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseSummaryWrapRef = useRef<HTMLDivElement>(null);
  const phaseSummaryTableRef = useRef<HTMLTableElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 340 });
  const [baseWidth, setBaseWidth] = useState(800);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTDSCurve, setShowTDSCurve] = useState<boolean>(true);
  const [showEYCurve, setShowEYCurve] = useState<boolean>(true);
  const [showECOverlay, setShowECOverlay] = useState<boolean>(true);
  const [ecLineWidth, setEcLineWidth] = useState(2);
  const [ecDotRadius, setEcDotRadius] = useState(3);
  const [ecFillOpacity, setEcFillOpacity] = useState(15);
  const [showBlind, setShowBlind] = useState<boolean>(false);
  const [blindPercent, setBlindPercent] = useState(20);
  const [showPourOverlay, setShowPourOverlay] = useState<boolean>(true);
  const [showFlowOverlay, setShowFlowOverlay] = useState<boolean>(false);
  const [showPourFlowSeries, setShowPourFlowSeries] = useState<boolean>(true);
  const [showDripFlowSeries, setShowDripFlowSeries] = useState<boolean>(true);
  const [flowVisibilityZoom, setFlowVisibilityZoom] = useState<number>(0.5);
  const [flowCap, setFlowCap] = useState<number>(10);
  const [cleanShortFlowSpikes, setCleanShortFlowSpikes] = useState<boolean>(false);
  const [flowSpikeDurationSeconds, setFlowSpikeDurationSeconds] = useState<number>(3);
  const [showPourPlanOverlay, setShowPourPlanOverlay] = useState<boolean>(true);
  const [showPhaseLog, setShowPhaseLog] = useState<boolean>(true);
  const [phaseMetricVisibility, setPhaseMetricVisibility] = useState({
    peakTDS: true,
    avgTDS: true,
    eyStart: true,
    eyEnd: true,
    pourEnd: true,
    pourPercent: true,
  });
  const [showTargetAssistant, setShowTargetAssistant] = useState<boolean>(false);
  const [targetMode, setTargetMode] = useState<'tds' | 'ey'>('tds');
  const [targetTDSInput, setTargetTDSInput] = useState<string>('1.36');
  const [targetEYInput, setTargetEYInput] = useState<string>('20.0');
  const [targetStartInput, setTargetStartInput] = useState<string>('60');
  const [phaseSummaryZoom, setPhaseSummaryZoom] = useState<number>(1);
  const [phaseSummaryHasManualZoom, setPhaseSummaryHasManualZoom] = useState<boolean>(false);
  const [screenshotBg, setScreenshotBg] = useState<'white' | 'transparent'>('white');
  const [showRecipeInScreenshot, setShowRecipeInScreenshot] = useState<boolean>(false);
  const [hiddenTargetWindows, setHiddenTargetWindows] = useState<Set<string>>(new Set());
  const [hiddenTargetMarkers, setHiddenTargetMarkers] = useState<Set<string>>(new Set());

  const refractometerAnchor = useMemo(() => {
    if (refractometerTDS == null || !Number.isFinite(refractometerTDS) || refractometerTDS <= 0) {
      return null;
    }
    return refractometerTDS;
  }, [refractometerTDS]);

  const adjustedConversionFactor = useMemo(() => {
    if (refractometerAnchor == null || ecPoints.length === 0) return null;
    const sorted = [...ecPoints].sort((a, b) => a.time - b.time);
    const final = sorted[sorted.length - 1];
    const finalEC25 = compensateEC(final.ecValue, final.temperature);
    if (!Number.isFinite(finalEC25) || finalEC25 <= 0) return null;
    const next = refractometerAnchor / finalEC25;
    return Number.isFinite(next) && next > 0 ? next : null;
  }, [refractometerAnchor, ecPoints]);

  const factorToUse = adjustedConversionFactor ?? conversionFactor;
  const waterInSourceLabel = waterInSource === 'ultrakoki' ? 'Ultrakoki' : 'Estimated';
  const isEstimatedWaterInMode = waterInSource !== 'ultrakoki';
  const targetTDS = useMemo(() => {
    const parsed = parseFloat(targetTDSInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [targetTDSInput]);
  const targetEY = useMemo(() => {
    const parsed = parseFloat(targetEYInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [targetEYInput]);
  const targetStartAfter = useMemo(() => {
    const n = parseFloat(targetStartInput);
    return Number.isFinite(n) && n >= 0 ? n : 60;
  }, [targetStartInput]);

  const waterInPercentBase = useMemo(() => {
    if (brewData && Array.isArray(brewData.cumulativePour) && brewData.cumulativePour.length > 0) {
      for (let i = brewData.cumulativePour.length - 1; i >= 0; i--) {
        const v = brewData.cumulativePour[i];
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return Number.isFinite(totalWaterIn) && totalWaterIn > 0 ? totalWaterIn : null;
  }, [brewData, totalWaterIn]);

  const computePhaseSummaryFitZoom = () => {
    const wrap = phaseSummaryWrapRef.current;
    const table = phaseSummaryTableRef.current;
    if (!wrap || !table) return 1;

    const wrapWidth = wrap.clientWidth;
    const renderedTableWidth = table.getBoundingClientRect().width;
    if (!Number.isFinite(wrapWidth) || !Number.isFinite(renderedTableWidth) || wrapWidth <= 0 || renderedTableWidth <= 0) {
      return 1;
    }

    const unzoomedTableWidth = renderedTableWidth / Math.max(phaseSummaryZoom, 0.01);
    const fit = wrapWidth / unzoomedTableWidth;
    return Math.max(0.45, Math.min(1, Number(fit.toFixed(2))));
  };

  // ── Compute TDS/EY time series ──────────────────────────────────────────

  const series: TDSPoint[] = useMemo(() => {
    const sorted = [...ecPoints].sort((a, b) => a.time - b.time);
    if (sorted.length === 0 || doseWeight <= 0) return [];

    return sorted.map((pt) => {
      const { ec, temperature } = interpolateEC(sorted, pt.time);
      const ec25 = compensateEC(ec, temperature);
      const tds = ec25 * factorToUse; // TDS %
      const beverageWeight = brewData ? getCumulativePour(brewData, pt.time) : 0;
      const ey = beverageWeight > 0 ? (tds / 100) * beverageWeight / doseWeight * 100 : 0;
      return { time: pt.time, ec, ec25, tds, ey, beverageWeight, temperature };
    });
  }, [ecPoints, brewData, doseWeight, factorToUse]);

  const flowOverlayData = useMemo(() => {
    if (!brewData || brewData.intervalSeconds <= 0) return null;

    const interval = Math.max(0.001, brewData.intervalSeconds);
    const sampleCount = Math.max(
      brewData.dripFlow?.length ?? 0,
      brewData.pourFlow?.length ?? 0,
      brewData.cumulativePour.length,
    );

    if (sampleCount < 2) return null;

    const buildPourSeries = (): number[] => {
      if (Array.isArray(brewData.pourFlow) && brewData.pourFlow.length >= sampleCount) {
        const values: number[] = [];
        for (let i = 0; i < sampleCount; i += 1) values.push(Number.isFinite(brewData.pourFlow[i]) ? brewData.pourFlow[i] : 0);
        return values;
      }

      const values: number[] = [];
      for (let i = 0; i < sampleCount; i += 1) {
        if (i === 0) {
          values.push(0);
          continue;
        }
        const current = Number.isFinite(brewData.cumulativePour[i]) ? brewData.cumulativePour[i] : brewData.cumulativePour[i - 1] ?? 0;
        const prev = Number.isFinite(brewData.cumulativePour[i - 1]) ? brewData.cumulativePour[i - 1] : 0;
        values.push(Math.max(0, (current - prev) / interval));
      }
      return values;
    };

    const buildDripSeries = (): number[] | null => {
      if (Array.isArray(brewData.dripFlow) && brewData.dripFlow.length >= sampleCount) {
        const values: number[] = [];
        for (let i = 0; i < sampleCount; i += 1) values.push(Number.isFinite(brewData.dripFlow[i]) ? brewData.dripFlow[i] : 0);
        return values;
      }
      return null;
    };

    const capValue = Number.isFinite(flowCap) ? Math.max(0, flowCap) : 0;

    const processFlowSeries = (input: number[]) => {
      const processed = [...input];
      const maxSpikeWindow = Math.max(1, Math.min(3, Math.round(flowSpikeDurationSeconds)));

      if (cleanShortFlowSpikes && capValue > 0) {
        let i = 0;
        while (i < processed.length) {
          if (processed[i] <= capValue) {
            i += 1;
            continue;
          }

          const start = i;
          let end = i;
          while (end < processed.length && processed[end] > capValue) end += 1;

          const runSeconds = (end - start) * interval;
          if (runSeconds >= 1 && runSeconds <= maxSpikeWindow) {
            const left = start > 0 ? Math.min(processed[start - 1], capValue) : null;
            const right = end < processed.length ? Math.min(processed[end], capValue) : null;
            for (let j = start; j < end; j += 1) {
              if (left !== null && right !== null) {
                const t = (j - start + 1) / (end - start + 1);
                processed[j] = left * (1 - t) + right * t;
              } else if (left !== null) {
                processed[j] = left;
              } else if (right !== null) {
                processed[j] = right;
              } else {
                processed[j] = capValue;
              }
            }
          }

          i = end;
        }
      }

      return capValue > 0 ? processed.map(v => Math.min(v, capValue)) : processed;
    };

    const pourValues = processFlowSeries(buildPourSeries());
    const dripRaw = buildDripSeries();
    const dripValues = dripRaw ? processFlowSeries(dripRaw) : null;
    const times = Array.from({ length: sampleCount }, (_, index) => index * interval);
    const positives = [...pourValues, ...(dripValues ?? [])].filter(v => Number.isFinite(v) && v > 0);
    const flowDataMax = positives.length > 0 ? Math.max(...positives) : 1;
    const axisMax = Math.max(0.1, flowDataMax);
    const safeVisibility = Math.max(0.2, Math.min(1.2, flowVisibilityZoom));
    const exponent = 0.8;

    const atTime = (values: number[], t: number) => {
      const clamped = Math.max(0, Math.min(t, times[times.length - 1]));
      const idx = clamped / interval;
      const lo = Math.max(0, Math.min(values.length - 1, Math.floor(idx)));
      const hi = Math.max(0, Math.min(values.length - 1, Math.ceil(idx)));
      if (lo === hi) return values[lo] ?? 0;
      return lerp(values[lo] ?? 0, values[hi] ?? 0, idx - lo);
    };

    return {
      times,
      pourValues,
      dripValues,
      axisMax,
      exponent,
      heightScale: safeVisibility,
      atTimePour: (t: number) => atTime(pourValues, t),
      atTimeDrip: (t: number) => (dripValues ? atTime(dripValues, t) : null),
    };
  }, [brewData, flowCap, cleanShortFlowSpikes, flowSpikeDurationSeconds, flowVisibilityZoom]);

  // ── Axis limits ─────────────────────────────────────────────────────────

  const { tdsMax, eyMax, timeMax } = useMemo(() => {
    if (series.length === 0) {
      return {
        tdsMax: axisConfig.empty.tdsMax,
        eyMax: axisConfig.empty.eyMax,
        timeMax: axisConfig.empty.timeMax,
      };
    }
    const maxTDS = Math.max(...series.map(p => p.tds));
    const maxEY  = Math.max(...series.map(p => p.ey));
    const maxT   = series[series.length - 1].time;
    return {
      tdsMax: Math.max(
        axisConfig.tdsFloor,
        Math.ceil(maxTDS * axisConfig.paddingMultiplier * (10 ** axisConfig.tdsDecimalPlaces)) / (10 ** axisConfig.tdsDecimalPlaces),
      ),
      eyMax:  Math.max(axisConfig.eyFloor, Math.ceil(maxEY * axisConfig.paddingMultiplier)),
      timeMax: maxT,
    };
  }, [series]);

  // ── Resize observer ─────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 100) setBaseWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setCanvasSize({ width: Math.round(baseWidth * zoomLevel), height: 340 });
  }, [baseWidth, zoomLevel]);

  // ── Canvas draw ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const plotW = width  - PAD.left - PAD.right;
    const plotH = height - PAD.top  - PAD.bottom;
    if (plotW < 1 || plotH < 1 || series.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        series.length === 0 ? 'No EC data — extract points from screenshot first' : 'Need at least 2 EC points',
        width / 2, height / 2
      );
      return;
    }

    // coord helpers
    const toX = (t: number) => PAD.left + (t / timeMax) * plotW;
    const toYtds = (v: number) => PAD.top + plotH - (v / tdsMax) * plotH;
    const toYey  = (v: number) => PAD.top + plotH - (v / eyMax)  * plotH;
    const visibleTargetMarkers = (() => {
      if (!showTargetAssistant || series.length === 0) return [] as Array<{ key: string; idx: number; window: TargetWindow }>;

      const tone = targetMode === 'tds' ? 'rose' : 'amber';
      const targetValue = targetMode === 'tds' ? targetTDS : targetEY;
      if (targetValue == null) return [] as Array<{ key: string; idx: number; window: TargetWindow }>;

      const tolerance = targetMode === 'tds'
        ? Math.max(0.03, targetValue * 0.02)
        : Math.max(0.25, targetValue * 0.02);
      const hitIndices: number[] = [];
      for (let i = 0; i < series.length; i += 1) {
        const pt = series[i];
        const metric = targetMode === 'tds' ? pt.tds : pt.ey;
        if (pt.time >= targetStartAfter && Math.abs(metric - targetValue) <= tolerance) {
          hitIndices.push(i);
        }
      }
      if (hitIndices.length === 0) return [] as Array<{ key: string; idx: number; window: TargetWindow }>;

      const windows: TargetWindow[] = [];
      let start = hitIndices[0];
      let prev = hitIndices[0];
      for (let i = 1; i <= hitIndices.length; i += 1) {
        const current = hitIndices[i];
        const contiguous = current === prev + 1;
        if (i < hitIndices.length && contiguous) {
          prev = current;
          continue;
        }

        const windowPts = series.slice(start, prev + 1);
        windows.push({
          startTime: windowPts[0].time,
          endTime: windowPts[windowPts.length - 1].time,
          minEC: Math.min(...windowPts.map((p) => p.ec25)),
          maxEC: Math.max(...windowPts.map((p) => p.ec25)),
          minWaterIn: Math.min(...windowPts.map((p) => p.beverageWeight)),
          maxWaterIn: Math.max(...windowPts.map((p) => p.beverageWeight)),
        });

        start = current;
        prev = current;
      }

      return windows
        .slice(0, 3)
        .map((window, idx) => ({ key: `${tone}-${idx}`, idx, window }))
        .filter((item) => !hiddenTargetMarkers.has(item.key));
    })();
    const toYflow = (v: number) => {
      if (!flowOverlayData) return PAD.top + plotH;
      const normalized = Math.max(0, Math.min(1, v / flowOverlayData.axisMax));
      const boosted = Math.pow(normalized, flowOverlayData.exponent);
      return PAD.top + plotH - boosted * plotH * flowOverlayData.heightScale;
    };

    // ── Phase bands ──────────────────────────────────────────────────────
    if (showPhaseLog) {
      phaseLogs.forEach(phase => {
        const x0 = toX(phase.startTime);
        const x1 = toX(Math.min(phase.endTime, timeMax));
        if (x1 < PAD.left || x0 > PAD.left + plotW) return;
        ctx.fillStyle = phase.color + '28';
        ctx.fillRect(x0, PAD.top, Math.max(0, x1 - x0), plotH);
        ctx.strokeStyle = phase.color + '88';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, PAD.top);
        ctx.lineTo(x0, PAD.top + plotH);
        ctx.stroke();
        // label
        ctx.fillStyle = phase.color;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        const labelX = Math.max(PAD.left + 2, x0 + 3);
        ctx.fillText(phase.name, labelX, PAD.top + 12);
        if (phase.pourPlanPercent != null) {
          ctx.font = '9px sans-serif';
          ctx.fillStyle = phase.color + 'cc';
          ctx.fillText(`${phase.pourPlanPercent}%`, labelX, PAD.top + 24);
        }
      });
    }

    // ── Grid & axes ───────────────────────────────────────────────────────
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const tdsGridCount = 5;
    for (let i = 0; i <= tdsGridCount; i++) {
      const v = (tdsMax / tdsGridCount) * i;
      const y = toYtds(v);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(1) + '%', PAD.left - 6, y + 4);
    }

    // EY right-axis labels
    const eyGridCount = 5;
    for (let i = 0; i <= eyGridCount; i++) {
      const v = (eyMax / eyGridCount) * i;
      const y = toYey(v);
      ctx.fillStyle = '#b45309';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(v.toFixed(0) + '%', PAD.left + plotW + 6, y + 4);
    }

    // X-axis ticks
    const tickInterval = timeMax <= 120 ? 15 : timeMax <= 240 ? 30 : 60;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let t = 0; t <= timeMax; t += tickInterval) {
      const x = toX(t);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + plotH); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillText(formatClock(t), x, PAD.top + plotH + 16);
    }

    // Plot border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    // Axis labels
    if (showTDSCurve) {
      ctx.save();
      ctx.translate(14, PAD.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TDS %', 0, 0);
      ctx.restore();
    }

    if (showEYCurve) {
      ctx.save();
      ctx.translate(width - 14, PAD.top + plotH / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EY %', 0, 0);
      ctx.restore();
    }

    // ── EY line ──────────────────────────────────────────────────────────
    if (showEYCurve) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = toX(pt.time);
        const y = toYey(pt.ey);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // ── TDS line ─────────────────────────────────────────────────────────
    if (showTDSCurve) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      series.forEach((pt, i) => {
        const x = toX(pt.time);
        const y = toYtds(pt.tds);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // ── Target TDS guide line ────────────────────────────────────────────
    if (showTargetAssistant && showTDSCurve && targetMode === 'tds' && targetTDS != null) {
      const yTarget = toYtds(Math.max(0, Math.min(targetTDS, tdsMax)));
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, yTarget);
      ctx.lineTo(PAD.left + plotW, yTarget);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Target ${targetTDS.toFixed(2)}%`, PAD.left + 6, Math.max(PAD.top + 12, yTarget - 6));
    }

    // ── Target EY guide line ─────────────────────────────────────────────
    if (showTargetAssistant && showEYCurve && targetMode === 'ey' && targetEY != null) {
      const yTargetEY = toYey(Math.max(0, Math.min(targetEY, eyMax)));
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, yTargetEY);
      ctx.lineTo(PAD.left + plotW, yTargetEY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#b45309';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`EY target ${targetEY.toFixed(1)}%`, PAD.left + plotW - 6, Math.max(PAD.top + 12, yTargetEY - 6));
    }

    // ── Target markers for selected windows ─────────────────────────────
    if (showTargetAssistant && visibleTargetMarkers.length > 0 && ((targetMode === 'tds' && showTDSCurve) || (targetMode === 'ey' && showEYCurve))) {
      const markerColor = targetMode === 'tds' ? '#e11d48' : '#b45309';
      const markerY = targetMode === 'tds'
        ? toYtds(Math.max(0, Math.min(targetTDS ?? 0, tdsMax)))
        : toYey(Math.max(0, Math.min(targetEY ?? 0, eyMax)));

      visibleTargetMarkers.forEach((entry) => {
        const markerX = toX((entry.window.startTime + entry.window.endTime) / 2);
        const markerRadius = 6;

        ctx.strokeStyle = markerColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(markerX, markerY, markerRadius - 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = markerColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(markerX - 3, markerY);
        ctx.lineTo(markerX + 3, markerY);
        ctx.moveTo(markerX, markerY - 3);
        ctx.lineTo(markerX, markerY + 3);
        ctx.stroke();

        ctx.fillStyle = markerColor;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`T${entry.idx + 1}`, markerX + 8, markerY - 8);
      });
    }

    // ── EC raw overlay ────────────────────────────────────────────────────
    if (showECOverlay && ecPoints.length > 1) {
      const sortedEC = [...ecPoints].sort((a, b) => a.time - b.time);
      const ecMax = Math.max(...sortedEC.map(p => p.ecValue)) * 1.1 || 1;
      // filled area under EC curve
      const fillAlpha = Math.max(0, Math.min(50, ecFillOpacity));
      ctx.fillStyle = `rgba(124, 58, 237, ${(fillAlpha / 255).toFixed(4)})`;
      ctx.beginPath();
      sortedEC.forEach((pt, i) => {
        if (pt.time > timeMax) return;
        const x = toX(pt.time);
        const y = PAD.top + plotH - (pt.ecValue / ecMax) * plotH;
        if (i === 0) { ctx.moveTo(x, PAD.top + plotH); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
      });
      if (sortedEC.length > 0) {
        const last = sortedEC[sortedEC.length - 1];
        ctx.lineTo(toX(Math.min(last.time, timeMax)), PAD.top + plotH);
      }
      ctx.closePath();
      ctx.fill();
      // EC curve (solid, thick)
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = ecLineWidth;
      ctx.setLineDash([]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      sortedEC.forEach((pt, i) => {
        if (pt.time > timeMax) return;
        const x = toX(pt.time);
        const y = PAD.top + plotH - (pt.ecValue / ecMax) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // EC data point dots
      ctx.fillStyle = '#7c3aed';
      sortedEC.forEach((pt) => {
        if (pt.time > timeMax) return;
        const x = toX(pt.time);
        const y = PAD.top + plotH - (pt.ecValue / ecMax) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, ecDotRadius, 0, Math.PI * 2);
        ctx.fill();
      });
      // EC axis label (right inner, above EY label)
      ctx.fillStyle = '#7c3aed';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`EC max ${(ecMax / 1.1).toFixed(1)} mS/cm`, PAD.left + plotW + 6, PAD.top + 8);
    }

    // ── Cumulative pour overlay ───────────────────────────────────────────
    if (showPourOverlay && brewData && brewData.cumulativePour.length > 1) {
      const pourMax = Math.max(...brewData.cumulativePour.filter(Number.isFinite)) * 1.1 || 1;
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let pourStarted = false;
      for (let i = 0; i < brewData.cumulativePour.length; i++) {
        const t = i * brewData.intervalSeconds;
        if (t > timeMax) break;
        const v = brewData.cumulativePour[i];
        if (!Number.isFinite(v)) continue;
        const x = toX(t);
        const y = PAD.top + plotH - (v / pourMax) * plotH;
        if (!pourStarted) { ctx.moveTo(x, y); pourStarted = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // Pour label (left inner)
      ctx.fillStyle = '#2563eb';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Pour max ${(pourMax / 1.1).toFixed(0)} g`, PAD.left - 6, PAD.top + 8);
    }

    // ── Pour plan overlay ──────────────────────────────────────────────
    if (showPourPlanOverlay && pourPlan.length > 0) {
      const sortedPlan = [...pourPlan].sort((a, b) => a.cumulativePercent - b.cumulativePercent);
      const toPlanY = (pct: number) => PAD.top + plotH - (pct / 100) * plotH;
      // fill under step function
      ctx.fillStyle = '#f9731618';
      ctx.beginPath();
      let prevPct = 0;
      ctx.moveTo(toX(0), PAD.top + plotH);
      ctx.lineTo(toX(0), toPlanY(0));
      for (let i = 0; i < sortedPlan.length; i++) {
        const pct = sortedPlan[i].cumulativePercent;
        const t = (pct / 100) * timeMax;
        if (t > timeMax) break;
        const x = toX(t);
        ctx.lineTo(x, toPlanY(prevPct));
        ctx.lineTo(x, toPlanY(pct));
        prevPct = pct;
      }
      ctx.lineTo(toX(timeMax), PAD.top + plotH);
      ctx.closePath();
      ctx.fill();
      // step function line
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      prevPct = 0;
      ctx.moveTo(toX(0), toPlanY(0));
      for (let i = 0; i < sortedPlan.length; i++) {
        const pct = sortedPlan[i].cumulativePercent;
        const t = (pct / 100) * timeMax;
        if (t > timeMax) break;
        const x = toX(t);
        ctx.lineTo(x, toPlanY(prevPct));
        ctx.lineTo(x, toPlanY(pct));
        prevPct = pct;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // labels
      ctx.fillStyle = '#f97316';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Pour plan', PAD.left + plotW + 6, PAD.top + 24);
      // vertical reference lines at each pour plan time
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 5]);
      for (let i = 0; i < sortedPlan.length; i++) {
        const pct = sortedPlan[i].cumulativePercent;
        const t = (pct / 100) * timeMax;
        if (t <= 0 || t >= timeMax) continue;
        const x = toX(t);
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + plotH);
        ctx.stroke();
        ctx.fillStyle = '#f97316';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${pct}%`, x, PAD.top - 2);
      }
      ctx.setLineDash([]);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Flow overlay (separate from TDS/EY curves) ──────────────────────
    const canDrawPourFlow = !!flowOverlayData && showPourFlowSeries && flowOverlayData.pourValues.length > 1;
    const canDrawDripFlow = !!flowOverlayData && showDripFlowSeries && !!flowOverlayData.dripValues && flowOverlayData.dripValues.length > 1;
    if (showFlowOverlay && flowOverlayData && (canDrawPourFlow || canDrawDripFlow)) {
      const drawFlowSeries = (values: number[], lineColor: string, barColor: string) => {
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < values.length; i += 1) {
          const t = flowOverlayData.times[i] ?? 0;
          if (t > timeMax) break;
          const x = toX(t);
          const y = toYflow(values[i] ?? 0);
          points.push({ x, y });
        }

        if (points.length <= 1) return;

        const baselineY = PAD.top + plotH;
        const barWidth = Math.max(2, (plotW / Math.max(1, points.length - 1)) * 0.52);

        ctx.fillStyle = barColor;
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          const flowValue = values[i] ?? 0;
          if (!Number.isFinite(flowValue) || flowValue <= 0) continue;
          ctx.fillRect(point.x - barWidth / 2, point.y, barWidth, baselineY - point.y);
        }

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        points.forEach(({ x, y }) => {
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      };

      if (canDrawPourFlow) {
        drawFlowSeries(flowOverlayData.pourValues, '#0ea5e9', 'rgba(14, 165, 233, 0.45)');
      }
      if (canDrawDripFlow && flowOverlayData.dripValues) {
        drawFlowSeries(flowOverlayData.dripValues, '#14b8a6', 'rgba(20, 184, 166, 0.38)');
      }

      ctx.fillStyle = '#0f766e';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Flow max ${flowOverlayData.axisMax.toFixed(1)} g/s`, PAD.left + plotW + 6, PAD.top + 22);
    }

    // ── Red Light vertical marker ─────────────────────────────────────────
    if (showRedLight && redLightTime != null && redLightTime >= 0 && redLightTime <= timeMax) {
      const redX = toX(redLightTime);
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(redX, PAD.top);
      ctx.lineTo(redX, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      const labelX = Math.min(PAD.left + plotW - 84, redX + 6);
      ctx.fillText(`Red Light ${formatClock(redLightTime)}`, labelX, PAD.top + 12);
      ctx.restore();
    }

    // ── Hover marker ─────────────────────────────────────────────────────
    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length) {
      const pt = series[hoverIndex];
      const hx = toX(pt.time);
      // vertical guide
      ctx.strokeStyle = '#64748b80';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + plotH); ctx.stroke();
      ctx.setLineDash([]);
      // TDS dot
      if (showTDSCurve) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(hx, toYtds(pt.tds), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // EY dot
      if (showEYCurve) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(hx, toYey(pt.ey), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // tooltip box
      const lines = [
        `t = ${formatClock(pt.time)}`,
        `EC = ${pt.ec.toFixed(2)} mS/cm${pt.temperature != null ? ` @ ${pt.temperature.toFixed(1)}°C` : ''}`,
        `EC₂₅ = ${pt.ec25.toFixed(2)} mS/cm`,
        `Pour = ${pt.beverageWeight.toFixed(1)} g (${waterInPercentBase != null && waterInPercentBase > 0 ? `${((pt.beverageWeight / waterInPercentBase) * 100).toFixed(1)}%` : 'n/a'})`,
      ];
      if (showTDSCurve) lines.push(`TDS = ${pt.tds.toFixed(2)}%`);
      if (showEYCurve) lines.push(`EY = ${pt.ey.toFixed(1)}%`);
      if (showFlowOverlay && flowOverlayData) {
        const includePourFlow = showPourFlowSeries;
        const includeDripFlow = showDripFlowSeries;
        if (includePourFlow) {
          lines.push(`Pour flow = ${flowOverlayData.atTimePour(pt.time).toFixed(2)} g/s`);
        }
        if (includeDripFlow) {
          const dripValue = flowOverlayData.atTimeDrip(pt.time);
          if (dripValue != null) lines.push(`Drip rate = ${dripValue.toFixed(2)} g/s`);
        }
      }
      const boxW = 162, lineH = 16, boxH = lines.length * lineH + 10;
      let bx = hx + 10;
      if (bx + boxW > PAD.left + plotW) bx = hx - boxW - 10;
      const by = PAD.top + 10;
      ctx.fillStyle = 'rgba(15,23,42,0.88)';
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect?.(bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      lines.forEach((line, i) => {
        ctx.fillStyle = line.startsWith('TDS =') ? '#6ee7b7' : line.startsWith('EY =') ? '#fcd34d' : '#e2e8f0';
        ctx.fillText(line, bx + 8, by + 16 + i * lineH);
      });
    }

    // ── Legend ───────────────────────────────────────────────────────────
    const legend: { color: string; label: string; dash?: number[] }[] = [];
    if (showTDSCurve) legend.push({ color: '#10b981', label: 'TDS %' });
    if (showEYCurve) legend.push({ color: '#f59e0b', label: `EY % (dose ${doseWeight.toFixed(1)} g)` });
    if (showTargetAssistant && showTDSCurve && targetMode === 'tds' && targetTDS != null) {
      legend.push({ color: '#ef4444', label: `Target TDS ${targetTDS.toFixed(2)}%`, dash: [8, 4] });
    }
    if (showTargetAssistant && showEYCurve && targetMode === 'ey' && targetEY != null) {
      legend.push({ color: '#b45309', label: `Target EY ${targetEY.toFixed(1)}%`, dash: [4, 4] });
    }
    if (showRedLight && redLightTime != null) {
      legend.push({ color: '#ef4444', label: `Red Light ${formatClock(redLightTime)}`, dash: [7, 5] });
    }
    if (showECOverlay) legend.push({ color: '#7c3aed', label: 'EC (mS/cm)' });
    if (showPourPlanOverlay && pourPlan.length > 0) legend.push({ color: '#f97316', label: 'Pour plan', dash: [6, 4] });
    if (showPourOverlay && brewData) legend.push({ color: '#2563eb', label: 'Water-in (g)', dash: [3, 3] });
    if (showFlowOverlay && flowOverlayData) {
      if (showPourFlowSeries) legend.push({ color: '#0ea5e9', label: 'Pour flow (g/s) overlay' });
      if (showDripFlowSeries && flowOverlayData.dripValues) legend.push({ color: '#14b8a6', label: 'Drip rate (g/s) overlay' });
    }
    let lx = PAD.left;
    legend.forEach(({ color, label, dash }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(lx, height - 12); ctx.lineTo(lx + 20, height - 12); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 24, height - 8);
      lx += ctx.measureText(label).width + 52;
    });

    // ── Blind overlay ───────────────────────────────────────────────────
    if (showBlind) {
      const blindTime = (blindPercent / 100) * timeMax;
      const blindX = toX(blindTime);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.fillRect(blindX, PAD.top, PAD.left + plotW - blindX, plotH);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(blindX, PAD.top);
      ctx.lineTo(blindX, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Blind at ${blindPercent}%`, blindX + 4, PAD.top + plotH - 2);
      ctx.textBaseline = 'alphabetic';
    }

  }, [series, canvasSize, tdsMax, eyMax, timeMax, phaseLogs, hoverIndex, doseWeight, showTDSCurve, showEYCurve, showECOverlay, ecLineWidth, ecDotRadius, ecFillOpacity, showBlind, blindPercent, showPourOverlay, showFlowOverlay, showPourFlowSeries, showDripFlowSeries, showPhaseLog, showTargetAssistant, targetMode, targetTDS, targetEY, targetStartAfter, ecPoints, brewData, waterInPercentBase, showRedLight, redLightTime, flowOverlayData, hiddenTargetMarkers, showPourPlanOverlay, pourPlan]);

  // ── Hover handler ────────────────────────────────────────────────────────

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || series.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const plotW = canvasSize.width - PAD.left - PAD.right;
    const tFrac = (mx - PAD.left) / plotW;
    const tAtMouse = tFrac * timeMax;
    // find closest index by time
    let closest = 0, minDist = Infinity;
    series.forEach((pt, i) => {
      const d = Math.abs(pt.time - tAtMouse);
      if (d < minDist) { minDist = d; closest = i; }
    });
    setHoverIndex(closest);
  };

  // ── Phase summary table ──────────────────────────────────────────────────

  interface PhaseSummaryRow {
    phase: PhaseLog;
    pts: TDSPoint[];
    peakTDS: number;
    avgTDS: number;
    endEY: number;
    startEY: number;
    endPour: number;
    duration: number;
  }

  const phaseSummary = useMemo((): PhaseSummaryRow[] => {
    if (series.length === 0 || phaseLogs.length === 0) return [];
    const rows: PhaseSummaryRow[] = [];
    for (const phase of phaseLogs) {
      const pts = series.filter(p => p.time >= phase.startTime && p.time <= phase.endTime);
      if (pts.length === 0) continue;
      const peakTDS = Math.max(...pts.map(p => p.tds));
      const avgTDS  = pts.reduce((s, p) => s + p.tds, 0) / pts.length;
      const endEY   = pts[pts.length - 1].ey;
      const startEY = pts[0].ey;
      const endPour = pts[pts.length - 1].beverageWeight;
      const duration = phase.endTime - phase.startTime;
      rows.push({ phase, pts, peakTDS, avgTDS, endEY, startEY, endPour, duration });
    }
    return rows;
  }, [series, phaseLogs]);

  useEffect(() => {
    if (phaseSummaryHasManualZoom || !showPhaseLog || phaseSummary.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const fitZoom = computePhaseSummaryFitZoom();
      setPhaseSummaryZoom((prev) => (Math.abs(prev - fitZoom) < 0.01 ? prev : fitZoom));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phaseSummaryHasManualZoom, showPhaseLog, phaseSummary.length, phaseMetricVisibility, canvasSize.width]);

  const targetTDSWindows = useMemo(() => {
    if (!showTargetAssistant || targetMode !== 'tds' || targetTDS == null || series.length === 0) {
      return [] as TargetWindow[];
    }

    const tolerance = Math.max(0.03, targetTDS * 0.02);
    const hitIndices: number[] = [];
    series.forEach((pt, i) => {
      if (pt.time >= targetStartAfter && Math.abs(pt.tds - targetTDS) <= tolerance) {
        hitIndices.push(i);
      }
    });
    if (hitIndices.length === 0) return [];

    const windows: TargetWindow[] = [];

    let start = hitIndices[0];
    let prev = hitIndices[0];
    for (let i = 1; i <= hitIndices.length; i++) {
      const current = hitIndices[i];
      const contiguous = current === prev + 1;
      if (i < hitIndices.length && contiguous) {
        prev = current;
        continue;
      }

      const windowPts = series.slice(start, prev + 1);
      windows.push({
        startTime: windowPts[0].time,
        endTime: windowPts[windowPts.length - 1].time,
        minEC: Math.min(...windowPts.map(p => p.ec25)),
        maxEC: Math.max(...windowPts.map(p => p.ec25)),
        minWaterIn: Math.min(...windowPts.map(p => p.beverageWeight)),
        maxWaterIn: Math.max(...windowPts.map(p => p.beverageWeight)),
      });

      start = current;
      prev = current;
    }

    return windows;
  }, [showTargetAssistant, targetMode, targetTDS, series, targetStartAfter]);

  const nearestTargetPoint = useMemo(() => {
    if (!showTargetAssistant || targetMode !== 'tds' || targetTDS == null || series.length === 0) return null;
    const filtered = series.filter(p => p.time >= targetStartAfter);
    if (filtered.length === 0) return null;
    let best = filtered[0];
    let bestDiff = Math.abs(filtered[0].tds - targetTDS);
    for (let i = 1; i < filtered.length; i++) {
      const d = Math.abs(filtered[i].tds - targetTDS);
      if (d < bestDiff) {
        best = filtered[i];
        bestDiff = d;
      }
    }
    return { point: best, diff: bestDiff };
  }, [showTargetAssistant, targetMode, targetTDS, series, targetStartAfter]);

  const targetEYWindows = useMemo(() => {
    if (!showTargetAssistant || targetMode !== 'ey' || targetEY == null || series.length === 0) {
      return [] as TargetWindow[];
    }

    const tolerance = Math.max(0.25, targetEY * 0.02);
    const hitIndices: number[] = [];
    series.forEach((pt, i) => {
      if (pt.time >= targetStartAfter && Math.abs(pt.ey - targetEY) <= tolerance) {
        hitIndices.push(i);
      }
    });
    if (hitIndices.length === 0) return [];

    const windows: TargetWindow[] = [];

    let start = hitIndices[0];
    let prev = hitIndices[0];
    for (let i = 1; i <= hitIndices.length; i++) {
      const current = hitIndices[i];
      const contiguous = current === prev + 1;
      if (i < hitIndices.length && contiguous) {
        prev = current;
        continue;
      }

      const windowPts = series.slice(start, prev + 1);
      windows.push({
        startTime: windowPts[0].time,
        endTime: windowPts[windowPts.length - 1].time,
        minEC: Math.min(...windowPts.map(p => p.ec25)),
        maxEC: Math.max(...windowPts.map(p => p.ec25)),
        minWaterIn: Math.min(...windowPts.map(p => p.beverageWeight)),
        maxWaterIn: Math.max(...windowPts.map(p => p.beverageWeight)),
      });

      start = current;
      prev = current;
    }

    return windows;
  }, [showTargetAssistant, targetMode, targetEY, series, targetStartAfter]);

  const nearestTargetEYPoint = useMemo(() => {
    if (!showTargetAssistant || targetMode !== 'ey' || targetEY == null || series.length === 0) return null;
    const filtered = series.filter(p => p.time >= targetStartAfter);
    if (filtered.length === 0) return null;
    let best = filtered[0];
    let bestDiff = Math.abs(filtered[0].ey - targetEY);
    for (let i = 1; i < filtered.length; i++) {
      const d = Math.abs(filtered[i].ey - targetEY);
      if (d < bestDiff) {
        best = filtered[i];
        bestDiff = d;
      }
    }
    return { point: best, diff: bestDiff };
  }, [showTargetAssistant, targetMode, targetEY, series, targetStartAfter]);

  const renderTargetWindows = (windows: TargetWindow[], tone: 'rose' | 'amber') => {
    const palette = tone === 'rose'
      ? {
          border: 'border-rose-200/80',
          headerBg: 'bg-gradient-to-r from-rose-50 to-white',
          badgeBg: 'bg-rose-100 text-rose-800',
          label: 'text-rose-700',
          tableBorder: 'border-rose-100',
          stripe: 'even:bg-rose-50/40',
        }
      : {
          border: 'border-amber-200/80',
          headerBg: 'bg-gradient-to-r from-amber-50 to-white',
          badgeBg: 'bg-amber-100 text-amber-800',
          label: 'text-amber-700',
          tableBorder: 'border-amber-100',
          stripe: 'even:bg-amber-50/40',
        };

    return (
      <div className="mt-3 grid gap-3 text-xs text-slate-700">
        {windows.slice(0, 3).map((window, idx) => {
          const rows = [
            ['EC25', `${window.minEC.toFixed(2)}-${window.maxEC.toFixed(2)} mS/cm`],
            ['Water-in', `${window.minWaterIn.toFixed(0)}-${window.maxWaterIn.toFixed(0)} ml`],
            ['Water-in %', waterInPercentBase != null && waterInPercentBase > 0
              ? `${((window.minWaterIn / waterInPercentBase) * 100).toFixed(1)}-${((window.maxWaterIn / waterInPercentBase) * 100).toFixed(1)}%`
              : 'n/a'],
            ['Ratio', formatBrewRatioRange(window.minWaterIn, window.maxWaterIn, doseWeight)],
          ];

          const windowKey = `${tone}-${idx}`;
          const isHidden = hiddenTargetWindows.has(windowKey);
          const isMarkerHidden = hiddenTargetMarkers.has(windowKey);
          const toggleHidden = () => setHiddenTargetWindows(prev => {
            const next = new Set(prev);
            if (next.has(windowKey)) next.delete(windowKey);
            else next.add(windowKey);
            return next;
          });
          const toggleMarker = () => setHiddenTargetMarkers(prev => {
            const next = new Set(prev);
            if (next.has(windowKey)) next.delete(windowKey);
            else next.add(windowKey);
            return next;
          });

          return (
            <div key={`${tone}-target-window-${idx}`} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${palette.border}`}>
              <button
                type="button"
                onClick={toggleHidden}
                className={`w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${palette.headerBg} cursor-pointer text-left`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${palette.badgeBg}`}>
                    Window {idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatClock(window.startTime)} - {formatClock(window.endTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/80 bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-700"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={!isMarkerHidden}
                      onChange={toggleMarker}
                      className="h-3.5 w-3.5"
                    />
                    Show on graph
                  </label>
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${palette.label}`}>
                    Match Range
                  </span>
                  <span className={`text-[11px] ${palette.label}`}>{isHidden ? '▸' : '▾'}</span>
                </div>
              </button>

              {!isHidden && (
                <div className="px-4 py-3">
                  <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
                    <tbody>
                      {rows.map(([label, value]) => (
                        <tr key={label} className={palette.stripe}>
                          <th className={`w-32 border-t px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${palette.label} ${palette.tableBorder}`}>
                            {label}
                          </th>
                          <td className={`border-t px-3 py-2 font-medium text-slate-800 ${palette.tableBorder}`}>
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Overall summary ──────────────────────────────────────────────────────

  const overall = useMemo(() => {
    if (series.length === 0) return null;
    const finalEY  = series[series.length - 1].ey;
    const peakTDS  = Math.max(...series.map(p => p.tds));
    const finalBev = series[series.length - 1].beverageWeight;
    const peakTime = series.find(p => p.tds === peakTDS)?.time ?? 0;
    const refractometerFinalEY =
      refractometerAnchor != null && doseWeight > 0
        ? (refractometerAnchor / 100) * finalBev / doseWeight * 100
        : null;
    return { finalEY, peakTDS, finalBev, peakTime, refractometerFinalEY };
  }, [series, refractometerAnchor, doseWeight]);

  const overallWaterIn = useMemo(() => {
    if (!brewData || !Array.isArray(brewData.cumulativePour) || brewData.cumulativePour.length === 0) {
      return null;
    }
    for (let i = brewData.cumulativePour.length - 1; i >= 0; i--) {
      const v = brewData.cumulativePour[i];
      if (Number.isFinite(v)) return v;
    }
    return null;
  }, [brewData]);

  const overallBrewRatio = useMemo(() => {
    if (overallWaterIn == null || !Number.isFinite(overallWaterIn) || doseWeight <= 0) return null;
    return overallWaterIn / doseWeight;
  }, [overallWaterIn, doseWeight]);

  const downloadGraphScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let sourceCanvas = canvas;
    if (screenshotBg === 'white') {
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tmpCtx = tmp.getContext('2d')!;
      tmpCtx.fillStyle = '#ffffff';
      tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
      tmpCtx.drawImage(canvas, 0, 0);
      sourceCanvas = tmp;
    }

    let exportCanvas = sourceCanvas;
    if (showRecipeInScreenshot) {
      const dpr = window.devicePixelRatio || 1;
      const rowH = 13;
      const cssW = sourceCanvas.width / dpr;
      const cssH = sourceCanvas.height / dpr;
      const recipeH = grinderName || (grindSize != null && grindSize > 0) || (micron != null && micron > 0) ? 62 : 46;
      const planH = pourPlan.length > 0 ? (32 + pourPlan.length * rowH) : 0;
      const headerH = recipeH + planH;
      const tmp = document.createElement('canvas');
      tmp.width = cssW * dpr;
      tmp.height = (cssH + headerH) * dpr;
      const ctx = tmp.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssW, cssH + headerH);

      let ly = 10;
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Recipe', 12, ly); ly += 18;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Dose: ${Number.isFinite(doseWeight) ? doseWeight.toFixed(1) : '—'} g  |  Ratio: 1:${Number.isFinite(brewRatio) ? brewRatio.toFixed(1) : '—'}  |  Water: ${Number.isFinite(totalWaterIn) ? totalWaterIn.toFixed(0) : '—'} g`, 12, ly); ly += 16;
      if (grinderName || (grindSize != null && grindSize > 0) || (micron != null && micron > 0)) {
        ctx.fillText(`Grinder: ${grinderName || '—'}  |  Size: ${(grindSize != null && grindSize > 0) ? `#${grindSize}` : '—'}  |  Micron: ${(micron != null && micron > 0) ? `${micron}µm` : '—'}`, 12, ly); ly += 18;
      } else { ly += 2; }

      if (pourPlan.length > 0) {
        ly += 8;
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('Pour Plan', 12, ly); ly += 16;
        const cols = ['#', 'Cum.%', 'EC', 'Cum.g', 'Δg', 'Δ%', 'Dur.', 'Time'];
        const colW = [24, 52, 44, 56, 56, 52, 40, 60];
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#64748b';
        let cx = 12;
        cols.forEach((c, i) => { ctx.fillText(c, cx, ly); cx += colW[i]; });
        ly += 14;
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath(); ctx.moveTo(12, ly - 2); ctx.lineTo(12 + colW.reduce((a,b) => a + b, 0), ly - 2); ctx.stroke();
        ctx.fillStyle = '#334155';
        const totalG = Number.isFinite(totalWaterIn) && totalWaterIn > 0 ? totalWaterIn : 0;
        const dt = Number.isFinite(timeMax) && timeMax > 0 ? timeMax : 1;
        const sortedEC = [...ecPoints].sort((a, b) => a.time - b.time);
        let prevPct = 0;
        pourPlan.forEach((entry, i) => {
          const pct = entry.cumulativePercent;
          const cumG = totalG * pct / 100;
          const deltaG = cumG - totalG * prevPct / 100;
          const deltaPct = pct - prevPct;
          const tSec = (pct / 100) * dt;
          const ecVal = sortedEC.length > 0 ? interpolateEC(sortedEC, tSec).ec : 0;
          const durStr = entry.duration != null ? `${entry.duration}s` : '—';
          const vals = [String(i + 1), pct.toFixed(1) + '%', ecVal.toFixed(2), cumG.toFixed(0), deltaG.toFixed(0), deltaPct.toFixed(1) + '%', durStr, `${Math.floor(tSec / 60)}:${(Math.floor(tSec) % 60).toString().padStart(2, '0')}`];
          cx = 12;
          vals.forEach((v, j) => { ctx.fillText(v, cx, ly); cx += colW[j]; });
          ly += rowH;
          prevPct = pct;
        });
      }

      ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, headerH, cssW, cssH);
      exportCanvas = tmp;
    }

    const link = document.createElement('a');
    link.href = exportCanvas.toDataURL('image/png');
    link.download = `belka_tds_ey_graph_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const refractometerInputValue = useMemo(() => {
    if (typeof refractometerTDSInput === 'string') {
      return refractometerTDSInput;
    }
    return refractometerTDS != null ? String(refractometerTDS) : '';
  }, [refractometerTDSInput, refractometerTDS]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (ecPoints.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600">
          <h3 className="text-white font-semibold text-sm">TDS &amp; Extraction Yield Analysis</h3>
          <p className="text-emerald-100 text-xs mt-0.5">Extract EC data from a screenshot to enable this analysis</p>
        </div>
        <div className="p-6 text-center text-slate-400 text-sm">No EC data available yet.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-white font-semibold text-sm">TDS &amp; Extraction Yield Analysis</h3>
            <p className="text-emerald-100 text-xs mt-0.5">
              EC → TDS (×{factorToUse.toFixed(3)}) → EY% &nbsp;|&nbsp; dose: {doseWeight.toFixed(1)} g
              {ecPoints.some(p => p.temperature != null) && ' | temp-compensated @ 25°C'}
              {refractometerAnchor != null && adjustedConversionFactor != null && ' | refractometer-anchored'}
              {overallBrewRatio != null && ` | ratio 1:${overallBrewRatio.toFixed(1)} (${waterInSourceLabel})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setShowTDSCurve(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showTDSCurve ? 'bg-emerald-200 text-emerald-900' : 'bg-white/20 text-white/70'}`}
            >
              TDS {showTDSCurve ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowEYCurve(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showEYCurve ? 'bg-amber-200 text-amber-900' : 'bg-white/20 text-white/70'}`}
            >
              EY {showEYCurve ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowECOverlay(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showECOverlay ? 'bg-violet-200 text-violet-900' : 'bg-white/20 text-white/70'}`}
            >
              EC curve {showECOverlay ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowPourPlanOverlay(v => !v)}
              disabled={pourPlan.length === 0}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showPourPlanOverlay && pourPlan.length > 0 ? 'bg-indigo-200 text-indigo-900' : 'bg-white/20 text-white/60'}`}
            >
              Pour Plan {showPourPlanOverlay && pourPlan.length > 0 ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowPourOverlay(v => !v)}
              disabled={!brewData}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showPourOverlay && brewData ? 'bg-blue-200 text-blue-900' : 'bg-white/20 text-white/60'}`}
            >
              Water-in {showPourOverlay && brewData ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowFlowOverlay(v => !v)}
              disabled={!brewData}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showFlowOverlay && brewData ? 'bg-sky-200 text-sky-900' : 'bg-white/20 text-white/60'}`}
            >
              Flow Overlay {showFlowOverlay && brewData ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowTargetAssistant(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showTargetAssistant ? 'bg-rose-200 text-rose-900' : 'bg-white/20 text-white/70'}`}
            >
              Target Assistant {showTargetAssistant ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowPhaseLog(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showPhaseLog ? 'bg-amber-200 text-amber-900' : 'bg-white/20 text-white/70'}`}
            >
              Phase Log {showPhaseLog ? '✓' : '–'}
            </button>
            <button
              onClick={() => onShowRedLightChange?.(!showRedLight)}
              disabled={redLightTime == null}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showRedLight && redLightTime != null ? 'bg-red-200 text-red-900' : 'bg-white/20 text-white/60'} ${redLightTime == null ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              Red Light {showRedLight && redLightTime != null ? '✓' : '–'}
            </button>
            <button
              onClick={() => setShowBlind(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${showBlind ? 'bg-slate-400 text-white' : 'bg-white/20 text-white/70'}`}
            >
              Blind {showBlind ? '✓' : '–'}
            </button>
          </div>
        </div>
      </div>

      {showECOverlay && (
        <div className="px-4 py-2 border-b border-slate-100 bg-violet-50/50">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">EC line:</span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.25}
                value={ecLineWidth}
                onChange={(e) => setEcLineWidth(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-slate-600 tabular-nums w-8">{ecLineWidth.toFixed(1)}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Dots:</span>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={ecDotRadius}
                onChange={(e) => setEcDotRadius(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-slate-600 tabular-nums w-8">{ecDotRadius.toFixed(1)}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Fill:</span>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={ecFillOpacity}
                onChange={(e) => setEcFillOpacity(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-slate-600 tabular-nums w-8">{ecFillOpacity}%</span>
            </div>
          </div>
        </div>
      )}

      {showBlind && (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-100/70">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Blind at:</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={blindPercent}
                onChange={(e) => setBlindPercent(Number(e.target.value))}
                className="w-32"
              />
              <span className="text-slate-600 font-semibold tabular-nums w-10">{blindPercent}%</span>
            </div>
            <div className="text-slate-400">
              Shows 0–{blindPercent}% &nbsp;|&nbsp; greys out {blindPercent}–100%
            </div>
            {pourPlan.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-slate-400 mr-1">From pour plan:</span>
                {pourPlan.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => setBlindPercent(entry.cumulativePercent)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${blindPercent === entry.cumulativePercent ? 'bg-indigo-200 text-indigo-900 ring-1 ring-indigo-400' : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'}`}
                  >
                    {entry.cumulativePercent}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showFlowOverlay && brewData && (
        <div className="px-4 py-3 border-b border-slate-100 bg-sky-50/50">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <button
                onClick={() => setShowPourFlowSeries((v) => !v)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showPourFlowSeries ? 'bg-sky-100 text-sky-800' : 'text-slate-500 hover:bg-slate-100'}`}
                title="Show/hide pour flow overlay"
              >
                Pour {showPourFlowSeries ? '✓' : '–'}
              </button>
              <button
                onClick={() => setShowDripFlowSeries((v) => !v)}
                disabled={!flowOverlayData?.dripValues}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showDripFlowSeries && flowOverlayData?.dripValues ? 'bg-teal-100 text-teal-800' : 'text-slate-500 hover:bg-slate-100'} ${!flowOverlayData?.dripValues ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={flowOverlayData?.dripValues ? 'Show/hide drip rate overlay' : 'No drip data available'}
              >
                Drip {showDripFlowSeries && flowOverlayData?.dripValues ? '✓' : '–'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Flow height</span>
              <input
                type="range"
                min={0.2}
                max={1.2}
                step={0.1}
                value={flowVisibilityZoom}
                onChange={(event) => setFlowVisibilityZoom(Number(event.target.value))}
                className="w-28 accent-sky-600"
              />
              <span className="w-10 text-right text-xs font-semibold text-slate-700">{Math.round(flowVisibilityZoom * 100)}%</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Flow cap (g/s)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={flowCap}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setFlowCap(Number.isFinite(next) ? Math.max(0, next) : 0);
                }}
                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              />
              <span className="text-[11px] text-slate-500">0 = no cap</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={cleanShortFlowSpikes}
                  onChange={(event) => setCleanShortFlowSpikes(event.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Clean short spikes &gt; cap
              </label>
              <select
                value={flowSpikeDurationSeconds}
                onChange={(event) => setFlowSpikeDurationSeconds(Number(event.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                title="Remove above-cap spikes up to this duration"
              >
                <option value={1}>1s</option>
                <option value={2}>2s</option>
                <option value={3}>3s</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Coffee dose (g):</label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={doseWeight}
              onChange={(e) => {
                const v = Math.max(0.1, parseFloat(e.target.value) || 15);
                onDoseWeightChange?.(v);
              }}
              className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Brew ratio (1:x):</label>
            <input
              type="number"
              min={1}
              max={30}
              step={0.1}
              value={brewRatio}
              onChange={(e) => {
                const v = Math.min(30, Math.max(1, parseFloat(e.target.value) || 15));
                onBrewRatioChange?.(v);
              }}
              className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Total water-in (g):</label>
            <input
              type="number"
              min={1}
              step={1}
              value={totalWaterIn}
              onChange={(e) => {
                const v = Math.max(1, parseFloat(e.target.value) || (doseWeight * brewRatio));
                onTotalWaterInChange?.(v);
              }}
              className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs text-slate-500">{waterInSourceLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">EC→TDS factor:</label>
            <input
              type="number"
              min={conversionFactorConfig.min}
              max={conversionFactorConfig.max}
              step={conversionFactorConfig.step}
              value={conversionFactor}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                const fallback = tdsCalculationConfig.defaults.conversionFactor;
                const v = Math.min(
                  conversionFactorConfig.max,
                  Math.max(conversionFactorConfig.min, Number.isFinite(parsed) ? parsed : fallback),
                );
                onConversionFactorChange?.(v);
              }}
              className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs text-slate-500">(0.5 = standard, 0.55 = mineral-rich)</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Refractometer TDS % (optional):</label>
            <input
              type="number"
              min={0}
              max={5}
              step={0.01}
              placeholder="e.g. 1.35"
              value={refractometerInputValue}
              onChange={(e) => onRefractometerTDSInputChange?.(e.target.value)}
              className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {refractometerInputValue.trim().length > 0 && (
              <button
                onClick={() => onRefractometerTDSInputChange?.('')}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {isEstimatedWaterInMode && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Tip:</span> Without Ultrakoki JSON, the water-in curve is an idealized estimate from brew ratio and EC timeline. Treat absolute pour values and EY as reference-only. Use this mode mainly to compare extraction behavior shape (flow-rate and thermal influence reflected in the EC curve), not exact real-world water-in totals.
          </div>
        )}
      </div>

      {showTargetAssistant && (
        <div className={`px-4 py-3 border-b ${targetMode === 'tds' ? 'border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50' : 'border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50'}`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-lg border border-white/70 bg-white/70 p-1 shadow-sm">
              <button
                onClick={() => setTargetMode('tds')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${targetMode === 'tds' ? 'bg-rose-200 text-rose-900' : 'text-slate-600 hover:bg-white'}`}
              >
                TDS
              </button>
              <button
                onClick={() => setTargetMode('ey')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${targetMode === 'ey' ? 'bg-amber-200 text-amber-900' : 'text-slate-600 hover:bg-white'}`}
              >
                EY
              </button>
            </div>

            <label className={`text-xs font-semibold tracking-wide uppercase ${targetMode === 'tds' ? 'text-rose-700' : 'text-amber-700'}`}>
              {targetMode === 'tds' ? 'Target TDS %' : 'Target EY %'}
            </label>
            <input
              type="number"
              min={targetMode === 'tds' ? 0.1 : 1}
              max={targetMode === 'tds' ? 5 : 40}
              step={targetMode === 'tds' ? 0.01 : 0.1}
              value={targetMode === 'tds' ? targetTDSInput : targetEYInput}
              onChange={(e) => {
                if (targetMode === 'tds') setTargetTDSInput(e.target.value);
                else setTargetEYInput(e.target.value);
              }}
              className={`w-24 px-2.5 py-1.5 text-sm font-semibold border rounded-lg bg-white shadow-sm focus:outline-none ${targetMode === 'tds' ? 'border-rose-200 focus:ring-2 focus:ring-rose-300' : 'border-amber-200 focus:ring-2 focus:ring-amber-300'}`}
            />
            <span className={`text-xs ${targetMode === 'tds' ? 'text-rose-700/90' : 'text-amber-700/90'}`}>
              Shows EC range, time window, water-in amount, and brew ratio for your target.
            </span>
            <label className="text-xs font-semibold text-slate-500 whitespace-nowrap ml-2">Start after (s):</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="60"
              value={targetStartInput}
              onChange={(e) => setTargetStartInput(e.target.value)}
              className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {targetMode === 'tds' && targetTDS != null && targetTDSWindows.length > 0 && (
            renderTargetWindows(targetTDSWindows, 'rose')
          )}
          {targetMode === 'tds' && targetTDS != null && targetTDSWindows.length === 0 && nearestTargetPoint && (
            <div className="mt-3 text-xs text-slate-700 rounded-xl border border-rose-200/80 bg-white px-3 py-2 shadow-sm">
              No direct window found. Nearest: {formatClock(nearestTargetPoint.point.time)} | TDS {nearestTargetPoint.point.tds.toFixed(2)}% (Δ {nearestTargetPoint.diff.toFixed(2)}), EC25 {nearestTargetPoint.point.ec25.toFixed(2)} mS/cm, Water-in {nearestTargetPoint.point.beverageWeight.toFixed(0)} ml ({waterInPercentBase != null && waterInPercentBase > 0 ? `${((nearestTargetPoint.point.beverageWeight / waterInPercentBase) * 100).toFixed(1)}%` : 'n/a'}), Ratio {formatBrewRatio(nearestTargetPoint.point.beverageWeight, doseWeight)}.
            </div>
          )}

          {targetMode === 'ey' && targetEY != null && targetEYWindows.length > 0 && (
            renderTargetWindows(targetEYWindows, 'amber')
          )}
          {targetMode === 'ey' && targetEY != null && targetEYWindows.length === 0 && nearestTargetEYPoint && (
            <div className="mt-3 text-xs text-slate-700 rounded-xl border border-amber-200/80 bg-white px-3 py-2 shadow-sm">
              No direct window found. Nearest: {formatClock(nearestTargetEYPoint.point.time)} | EY {nearestTargetEYPoint.point.ey.toFixed(1)}% (Δ {nearestTargetEYPoint.diff.toFixed(1)}), EC25 {nearestTargetEYPoint.point.ec25.toFixed(2)} mS/cm, Water-in {nearestTargetEYPoint.point.beverageWeight.toFixed(0)} ml ({waterInPercentBase != null && waterInPercentBase > 0 ? `${((nearestTargetEYPoint.point.beverageWeight / waterInPercentBase) * 100).toFixed(1)}%` : 'n/a'}), Ratio {formatBrewRatio(nearestTargetEYPoint.point.beverageWeight, doseWeight)}.
            </div>
          )}
        </div>
      )}

      {/* Overall summary cards */}
      {overall && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Peak TDS</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-lg font-bold leading-none text-emerald-600">{overall.peakTDS.toFixed(2)}%</div>
              <div className="text-[11px] font-medium text-slate-500">@ {formatClock(overall.peakTime)}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Final EY</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-lg font-bold leading-none text-amber-600">{overall.finalEY.toFixed(1)}%</div>
              <div className="text-[11px] font-medium text-slate-500 text-right">
                {overall.refractometerFinalEY != null ? `ref ${overall.refractometerFinalEY.toFixed(1)}%` : 'calculated'}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {overallWaterIn != null ? 'Water-in' : 'Beverage'}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-lg font-bold leading-none text-blue-600">{overallWaterIn != null ? `${overallWaterIn.toFixed(0)} g` : `${overall.finalBev.toFixed(0)} g`}</div>
              <div className="text-[11px] font-medium text-slate-500 text-right">
                {overallWaterIn != null ? waterInSourceLabel : 'final weight'}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {overallBrewRatio != null ? 'Brew Ratio' : (adjustedConversionFactor != null ? 'Correction' : 'Dose')}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-lg font-bold leading-none text-slate-700">{overallBrewRatio != null ? `1:${overallBrewRatio.toFixed(1)}` : (adjustedConversionFactor != null ? adjustedConversionFactor.toFixed(3) : `${doseWeight.toFixed(1)} g`)}</div>
              <div className="text-[11px] font-medium text-slate-500 text-right">
                {overallBrewRatio != null ? waterInSourceLabel : (adjustedConversionFactor != null ? 'TDS only' : 'coffee')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas graph */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={downloadGraphScreenshot}
            className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            Screenshot
          </button>
          <button
            onClick={() => setScreenshotBg(b => b === 'white' ? 'transparent' : 'white')}
            title={screenshotBg === 'white' ? 'Currently: white background — click for transparent' : 'Currently: transparent background — click for white'}
            className={`h-7 px-2 rounded-lg border text-xs font-medium ${
              screenshotBg === 'white'
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-800 border-slate-600 text-white hover:bg-slate-700'
            }`}
          >
            {screenshotBg === 'white' ? 'BG: White' : 'BG: Alpha'}
          </button>
          <button
            onClick={() => setShowRecipeInScreenshot(v => !v)}
            className={`h-7 px-2 rounded-lg border text-xs font-medium ${
              showRecipeInScreenshot
                ? 'bg-amber-100 border-amber-400 text-amber-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle recipe info on graph screenshot"
          >
            {showRecipeInScreenshot ? 'Recipe: On' : 'Recipe: Off'}
          </button>
        </div>
        <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Zoom</span>
        <button
          onClick={() => setZoomLevel(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
          className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 font-bold text-sm hover:bg-slate-100 flex items-center justify-center"
        >−</button>
        <span className="text-xs font-semibold text-slate-700 w-8 text-center">{zoomLevel === 1 ? '1×' : `${zoomLevel}×`}</span>
        <button
          onClick={() => setZoomLevel(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
          className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 font-bold text-sm hover:bg-slate-100 flex items-center justify-center"
        >+</button>
        </div>
      </div>
      <div ref={containerRef} className="w-full px-4 pt-1 pb-2 overflow-x-auto">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          className="rounded cursor-crosshair"
          style={{ height: '340px' }}
        />
      </div>

      {/* Phase summary table */}
      {showPhaseLog && phaseSummary.length > 0 && (
        <div className="px-4 pb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-[0.14em]">Phase Extraction Summary</div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="mr-1 flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-1.5 py-1">
                <span className="text-[11px] font-semibold text-slate-500">Zoom</span>
                <button
                  onClick={() => {
                    setPhaseSummaryHasManualZoom(false);
                    setPhaseSummaryZoom(computePhaseSummaryFitZoom());
                  }}
                  className="h-5 rounded-full border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  title="Fit table to available width"
                >
                  Fit
                </button>
                <button
                  onClick={() => {
                    setPhaseSummaryHasManualZoom(true);
                    setPhaseSummaryZoom(z => Math.max(0.45, Number((z - 0.1).toFixed(2))));
                  }}
                  className="h-5 w-5 rounded-full border border-slate-300 bg-white text-slate-700 text-xs font-bold leading-none hover:bg-slate-100"
                  title="Zoom out"
                >
                  -
                </button>
                <span className="w-10 text-center text-[11px] font-semibold text-slate-700">{Math.round(phaseSummaryZoom * 100)}%</span>
                <button
                  onClick={() => {
                    setPhaseSummaryHasManualZoom(true);
                    setPhaseSummaryZoom(z => Math.min(1.8, Number((z + 0.1).toFixed(2))));
                  }}
                  className="h-5 w-5 rounded-full border border-slate-300 bg-white text-slate-700 text-xs font-bold leading-none hover:bg-slate-100"
                  title="Zoom in"
                >
                  +
                </button>
              </div>
              {[
                { key: 'peakTDS', label: 'Peak TDS%' },
                { key: 'avgTDS', label: 'Avg TDS%' },
                { key: 'eyStart', label: 'EY start' },
                { key: 'eyEnd', label: 'EY end' },
                { key: 'pourEnd', label: 'Pour at end' },
                { key: 'pourPercent', label: 'Pour %' },
              ].map((metric) => {
                const visible = phaseMetricVisibility[metric.key as keyof typeof phaseMetricVisibility];
                return (
                  <button
                    key={metric.key}
                    onClick={() => setPhaseMetricVisibility(prev => ({
                      ...prev,
                      [metric.key]: !prev[metric.key as keyof typeof prev],
                    }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${visible ? 'border-indigo-300 bg-indigo-100 text-indigo-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {metric.label}
                  </button>
                );
              })}
              <button
                onClick={() => onShowRedLightChange?.(!showRedLight)}
                disabled={redLightTime == null}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${showRedLight && redLightTime != null ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'} ${redLightTime == null ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={redLightTime == null ? 'Red light time is not available yet' : 'Toggle red light marker on graph'}
              >
                Red line {showRedLight && redLightTime != null ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <div ref={phaseSummaryWrapRef} className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm" style={{ zoom: phaseSummaryZoom }}>
            <table ref={phaseSummaryTableRef} className="w-full min-w-[760px] text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90">
                  <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Phase</th>
                  <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-slate-600">Time range</th>
                  <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-slate-600">Duration</th>
                  {phaseMetricVisibility.peakTDS && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-emerald-700">Peak TDS%</th>}
                  {phaseMetricVisibility.avgTDS && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-emerald-700">Avg TDS%</th>}
                  {phaseMetricVisibility.eyStart && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-amber-700">EY start</th>}
                  {phaseMetricVisibility.eyEnd && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-amber-700">EY end</th>}
                  {phaseMetricVisibility.pourEnd && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-blue-700">Pour at end</th>}
                  {phaseMetricVisibility.pourPercent && <th className="text-center px-3 py-2 border border-slate-200 font-semibold text-blue-700">Pour %</th>}
                </tr>
              </thead>
              <tbody>
                {phaseSummary.map(({ phase, peakTDS, avgTDS, endEY, startEY, endPour, duration }) => (
                  <tr key={phase.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2 border border-slate-200">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ background: phase.color }}
                      />
                      <span className="font-semibold text-slate-800">{phase.name}</span>
                    </td>
                    <td className="text-center px-3 py-2 border border-slate-200 font-mono text-slate-600">
                      {formatClock(phase.startTime)} → {formatClock(phase.endTime)}
                    </td>
                    <td className="text-center px-3 py-2 border border-slate-200 text-slate-600">
                      {duration.toFixed(0)} s
                    </td>
                    {phaseMetricVisibility.peakTDS && (
                      <td className="text-center px-3 py-2 border border-slate-200 font-bold text-emerald-700">
                        {peakTDS.toFixed(2)}%
                      </td>
                    )}
                    {phaseMetricVisibility.avgTDS && (
                      <td className="text-center px-3 py-2 border border-slate-200 text-emerald-600">
                        {avgTDS.toFixed(2)}%
                      </td>
                    )}
                    {phaseMetricVisibility.eyStart && (
                      <td className="text-center px-3 py-2 border border-slate-200 text-amber-600">
                        {startEY.toFixed(1)}%
                      </td>
                    )}
                    {phaseMetricVisibility.eyEnd && (
                      <td className="text-center px-3 py-2 border border-slate-200 font-bold text-amber-700">
                        {endEY.toFixed(1)}%
                      </td>
                    )}
                    {phaseMetricVisibility.pourEnd && (
                      <td className="text-center px-3 py-2 border border-slate-200 text-blue-700">
                        {endPour.toFixed(0)} g
                      </td>
                    )}
                    {phaseMetricVisibility.pourPercent && (
                      <td className="text-center px-3 py-2 border border-slate-200 text-blue-700">
                        {overallWaterIn != null && overallWaterIn > 0 ? `${((endPour / overallWaterIn) * 100).toFixed(1)}%` : 'n/a'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interpretation guide */}
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-700 mb-1">Reading guide</div>
            <div><span className="text-emerald-600 font-medium">TDS 1.2–1.5%</span> = ideal extraction window for most filter coffee</div>
            <div><span className="text-amber-600 font-medium">EY 18–22%</span> = specialty target range (SCA standard)</div>
            {isEstimatedWaterInMode && (
              <div><span className="text-amber-700 font-medium">Estimated water-in mode:</span> values are idealized and may not match real pours exactly; use trends and phase behavior as reference.</div>
            )}
            {refractometerAnchor != null && adjustedConversionFactor != null && (
              <div><span className="text-violet-600 font-medium">Ref anchor:</span> TDS/EY are scaled so final cup equals {refractometerAnchor.toFixed(2)}%; EC curve and EC values are not modified.</div>
            )}
            <div><span className="text-slate-500">EY rising fast</span> = high extraction rate phase — watch for over-extraction</div>
            <div><span className="text-slate-500">TDS falling + EY flat</span> = dilution phase, grounds nearly exhausted</div>
          </div>
        </div>
      )}

      {/* No phase logs hint */}
      {showPhaseLog && phaseSummary.length === 0 && series.length > 0 && (
        <div className="px-4 pb-4 text-xs text-slate-400 italic">
          Add phase logs in the Phase Analysis panel to see per-phase TDS/EY breakdown.
        </div>
      )}
    </div>
  );
};
