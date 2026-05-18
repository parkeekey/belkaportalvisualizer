import React, { useRef, useEffect, useState, useCallback } from 'react';

interface PourPlanEntry {
  cumulativePercent: number;
}

interface ECPoint {
  time: number;
  ecValue: number;
}

interface BrewData {
  intervalSeconds: number;
  cumulativePour: number[];
  pourFlow?: number[];
  dripFlow?: number[];
}

interface PourPlanGraphProps {
  pourPlan: PourPlanEntry[];
  totalBrewTime: number;
  ecPoints?: ECPoint[];
  brewData?: BrewData | null;
}

const PAD = { top: 24, right: 24, bottom: 32, left: 48 };

const PourPlanGraph: React.FC<PourPlanGraphProps> = ({ pourPlan, totalBrewTime, ecPoints = [], brewData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 200 });
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setCanvasSize({ width: Math.max(200, w), height: 200 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getHoverInfo = useCallback((clientX: number, _clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const plotW = canvasSize.width - PAD.left - PAD.right;
    const timeMax = totalBrewTime > 0 ? totalBrewTime : 240;
    const t = ((mx - PAD.left) / plotW) * timeMax;
    if (t < 0 || t > timeMax) { setHoverTime(null); return; }
    setHoverTime(t);
  }, [canvasSize.width, totalBrewTime]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    getHoverInfo(e.clientX, e.clientY);
  }, [getHoverInfo]);

  const handleMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    if (plotW < 10 || plotH < 10) return;

    const timeMax = totalBrewTime > 0 ? totalBrewTime : 240;
    const pourMax = 100;

    const toX = (t: number) => PAD.left + (t / timeMax) * plotW;
    const toY = (pct: number) => PAD.top + plotH - (pct / pourMax) * plotH;

    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let pct = 0; pct <= 100; pct += 25) {
      const y = toY(pct);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pct}%`, PAD.left - 6, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= timeMax; t += Math.max(15, Math.round(timeMax / 4))) {
      const x = toX(t);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${Math.round(t)}s`, x, PAD.top + plotH + 4);
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    const sorted = [...pourPlan].sort((a, b) => a.cumulativePercent - b.cumulativePercent);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(timeMax), toY(pourMax));
    ctx.stroke();
    ctx.setLineDash([]);

    if (sorted.length > 0) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let prevPct = 0;
      let prevTime = 0;
      ctx.moveTo(toX(prevTime), toY(prevPct));
      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        const pct = entry.cumulativePercent;
        const t = (pct / 100) * timeMax;
        ctx.lineTo(toX(t), toY(prevPct));
        ctx.lineTo(toX(t), toY(pct));
        prevPct = pct;
        prevTime = t;
      }
      ctx.stroke();
    }

    if (brewData && brewData.cumulativePour.length > 1) {
      const pourValues = brewData.cumulativePour.filter(Number.isFinite);
      const maxPour = Math.max(...pourValues, 1);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < brewData.cumulativePour.length; i++) {
        const t = i * brewData.intervalSeconds;
        if (t > timeMax) break;
        const v = brewData.cumulativePour[i];
        if (!Number.isFinite(v)) continue;
        const pct = (v / maxPour) * 100;
        const x = toX(t);
        const y = toY(pct);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (ecPoints.length > 1) {
      const sortedEC = [...ecPoints].sort((a, b) => a.time - b.time);
      const ecValues = sortedEC.map(p => p.ecValue);
      const ecMin = Math.min(...ecValues);
      const ecMax = Math.max(...ecValues);
      const ecRange = ecMax - ecMin || 1;
      const ecToPct = (v: number) => ((v - ecMin) / ecRange) * 100;
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const pt of sortedEC) {
        if (pt.time > timeMax) break;
        const x = toX(pt.time);
        const y = toY(ecToPct(pt.ecValue));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const legendY = 12;
    let lx = PAD.left + 4;
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lx, legendY);
    ctx.lineTo(lx + 16, legendY);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText('Pour plan', lx + 20, legendY);
    lx += ctx.measureText('Pour plan').width + 36;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, legendY);
    ctx.lineTo(lx + 16, legendY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#334155';
    ctx.fillText('Ideal', lx + 20, legendY);
    lx += ctx.measureText('Ideal').width + 32;

    if (brewData && brewData.cumulativePour.length > 1) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, legendY);
      ctx.lineTo(lx + 16, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#334155';
      ctx.fillText('Real pour', lx + 20, legendY);
      lx += ctx.measureText('Real pour').width + 36;
    }

    if (ecPoints.length > 1) {
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, legendY);
      ctx.lineTo(lx + 16, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#334155';
      ctx.fillText('EC curve', lx + 20, legendY);
    }

    ctx.save();
    ctx.translate(12, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Cumulative %', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Time', PAD.left + plotW / 2, height - 2);

    // ── Hover tooltip ────────────────────────────────────────────────────
    if (hoverTime != null) {
      const hx = toX(hoverTime);
      // vertical guide
      ctx.strokeStyle = '#64748b80';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + plotH); ctx.stroke();
      ctx.setLineDash([]);

      // figure out pour plan cum% at this time
      const timeFrac = hoverTime / timeMax;
      const planPctAtTime = sorted.length > 0 ? (() => {
        let prevPct = 0;
        for (const entry of sorted) {
          const entryTime = (entry.cumulativePercent / 100) * timeMax;
          if (hoverTime >= entryTime) { prevPct = entry.cumulativePercent; continue; }
          break;
        }
        return prevPct;
      })() : 0;

      // real pour % at this time
      let realPourPct: number | null = null;
      if (brewData && brewData.cumulativePour.length > 1) {
        const pourValues = brewData.cumulativePour.filter(Number.isFinite);
        const maxPour = Math.max(...pourValues, 1);
        const idx = Math.min(brewData.cumulativePour.length - 1, Math.max(0, Math.round(hoverTime / brewData.intervalSeconds)));
        const v = brewData.cumulativePour[idx];
        if (Number.isFinite(v)) realPourPct = (v / maxPour) * 100;
      }

      // EC value at this time (interpolated)
      let ecAtTime: number | null = null;
      if (ecPoints.length > 0) {
        const sortedEC = [...ecPoints].sort((a, b) => a.time - b.time);
        if (hoverTime <= sortedEC[0].time) ecAtTime = sortedEC[0].ecValue;
        else if (hoverTime >= sortedEC[sortedEC.length - 1].time) ecAtTime = sortedEC[sortedEC.length - 1].ecValue;
        else {
          for (let i = 0; i < sortedEC.length - 1; i++) {
            if (hoverTime >= sortedEC[i].time && hoverTime < sortedEC[i + 1].time) {
              const frac = (hoverTime - sortedEC[i].time) / (sortedEC[i + 1].time - sortedEC[i].time);
              ecAtTime = sortedEC[i].ecValue + frac * (sortedEC[i + 1].ecValue - sortedEC[i].ecValue);
              break;
            }
          }
        }
      }

      const lines: string[] = [
        `t = ${Math.round(hoverTime)}s (${(timeFrac * 100).toFixed(0)}%)`,
        `Pour plan = ${planPctAtTime.toFixed(0)}%`,
      ];
      if (realPourPct != null) lines.push(`Real pour = ${realPourPct.toFixed(1)}%`);
      if (ecAtTime != null) lines.push(`EC = ${ecAtTime.toFixed(2)} mS/cm`);

      const boxW = 150, lineH = 16, boxH = lines.length * lineH + 10;
      let bx = hx + 10;
      if (bx + boxW > PAD.left + plotW) bx = hx - boxW - 10;
      const by = PAD.top + 10;
      ctx.fillStyle = 'rgba(15,23,42,0.88)';
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D).roundRect?.(bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(line, bx + 8, by + 6 + i * lineH);
      });
      ctx.textBaseline = 'alphabetic';
    }
  }, [pourPlan, totalBrewTime, ecPoints, brewData, canvasSize, hoverTime]);

  if (pourPlan.length === 0) return null;

  return (
    <div ref={wrapRef} className="w-full" style={{ minHeight: 200 }}>
      <div className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Pour Plan Visualization</div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-slate-200 bg-white shadow-sm"
        style={{ height: 200 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};

export default PourPlanGraph;
