import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DataPoint {
  x: number;
  y: number;
  time: number;
  ecValue: number;
  temperature?: number;
  isAutoDetected?: boolean;
  id?: string;
}

interface PhaseLog {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
}

interface CumulativePourData {
  values: number[];
  intervalSeconds: number;
  label: string;
}

interface InteractiveDataGraphProps {
  dataPoints: DataPoint[];
  onDataUpdate?: (updatedPoints: DataPoint[]) => void;
  redLightTime?: number | null;
  showRedLight?: boolean;
  phaseLogs?: PhaseLog[];
  cumulativePourData?: CumulativePourData;
}

interface TooltipData {
  x: number;
  y: number;
  time: string;
  ecValue: number;
  pourTotal?: number | null;
  visible: boolean;
}

export const InteractiveDataGraph: React.FC<InteractiveDataGraphProps> = ({ 
  dataPoints, 
  onDataUpdate,
  redLightTime,
  showRedLight = false,
  phaseLogs = [],
  cumulativePourData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData>({
    x: 0,
    y: 0,
    time: '',
    ecValue: 0,
    pourTotal: null,
    visible: false
  });

  const formatTimeMinSec = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatRawSeconds = useCallback((seconds: number) => {
    return seconds.toFixed(1);
  }, []);

  // Axis range controls
  const [xMax, setXMax] = useState(200); // Time in seconds (extended for extrapolation)
  const [yMax, setYMax] = useState(30); // EC max value (extended for extrapolation)
  const [xMin, setXMin] = useState(0);
  const [yMin, setYMin] = useState(0);
  
  // Canvas dimensions and padding
  const padding = { top: 40, right: 72, bottom: 100, left: 80 };
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(400);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Update canvas dimensions based on container size
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        const containerWidth = container.clientWidth;
        const baseW = Math.min(containerWidth - 32, 1200);
        const isMobile = window.innerWidth < 768;
        const newCanvasHeight = isMobile
          ? Math.max(400, Math.min(window.innerHeight * 0.65, 520))
          : Math.max(400, Math.min(window.innerHeight * 0.5, 650));
        
        setCanvasWidth(Math.round(baseW * zoomLevel));
        setCanvasHeight(newCanvasHeight);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [zoomLevel]);
  
  // Calculate scales based on current axis ranges
  const calculateScales = useCallback(() => {
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    
    const xScale = (canvasWidth - padding.left - padding.right) / xRange;
    const yScale = (canvasHeight - padding.top - padding.bottom) / yRange;
    
    return {
      xScale,
      yScale,
      xMin,
      xMax,
      yMin,
      yMax,
      canvasWidth,
      canvasHeight
    };
  }, [xMin, xMax, yMin, yMax, canvasWidth, canvasHeight]);

  // Convert data coordinates to canvas coordinates
  const dataToCanvas = useCallback((time: number, ecValue: number, scales: any) => {
    const x = padding.left + (time - scales.xMin) * scales.xScale;
    const y = scales.canvasHeight - padding.bottom - (ecValue - scales.yMin) * scales.yScale;
    return { x, y };
  }, []);

  
  // Draw the graph
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const scales = calculateScales();
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding.left + (i * (canvasWidth - padding.left - padding.right)) / 10;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, canvasHeight - padding.bottom);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let i = 0; i <= 8; i++) {
      const y = padding.top + (i * (canvasHeight - padding.top - padding.bottom)) / 8;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvasWidth - padding.right, y);
      ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding.left, canvasHeight - padding.bottom);
    ctx.lineTo(canvasWidth - padding.right, canvasHeight - padding.bottom);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvasHeight - padding.bottom);
    ctx.stroke();
    
    const hasPourOverlay = !!cumulativePourData && cumulativePourData.values.length > 1;
    const pourValues = cumulativePourData?.values ?? [];
    const pourMax = hasPourOverlay ? Math.max(...pourValues.filter(Number.isFinite), 1) : 1;

    // Draw axis labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // X-axis labels (time)
    for (let i = 0; i <= 5; i++) {
      const time = xMin + (i * (xMax - xMin)) / 5;
      const x = padding.left + (i * (canvasWidth - padding.left - padding.right)) / 5;
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      ctx.fillText(label, x, canvasHeight - padding.bottom + 20);
    }
    
    // Left axis labels for cumulative pour when available, otherwise EC.
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = hasPourOverlay ? (pourMax * i) / 5 : yMin + (i * (yMax - yMin)) / 5;
      const y = canvasHeight - padding.bottom - (i * (canvasHeight - padding.top - padding.bottom)) / 5;
      ctx.fillText(hasPourOverlay ? value.toFixed(0) : value.toFixed(1), padding.left - 10, y + 4);
    }

    if (hasPourOverlay) {
      ctx.textAlign = 'left';
      for (let i = 0; i <= 5; i++) {
        const value = yMin + (i * (yMax - yMin)) / 5;
        const y = canvasHeight - padding.bottom - (i * (canvasHeight - padding.top - padding.bottom)) / 5;
        ctx.fillText(value.toFixed(1), canvasWidth - padding.right + 10, y + 4);
      }
    }
    
    // Draw axis titles
    ctx.fillStyle = '#374151';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    const xAxisY = canvasHeight - padding.bottom;
    ctx.fillText('Time (min:sec)', canvasWidth / 2, xAxisY + 50);
    
    ctx.save();
    ctx.translate(20, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(hasPourOverlay ? 'Pour Total (g)' : 'EC', 0, 0);
    ctx.restore();

    if (hasPourOverlay) {
      ctx.save();
      ctx.translate(canvasWidth - 18, canvasHeight / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('EC', 0, 0);
      ctx.restore();
    }

    if (hasPourOverlay && cumulativePourData) {
      const plotHeight = canvasHeight - padding.top - padding.bottom;
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      cumulativePourData.values.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        const time = index * cumulativePourData.intervalSeconds;
        if (time < xMin || time > xMax) return;
        const x = padding.left + (time - xMin) * scales.xScale;
        const y = canvasHeight - padding.bottom - (value / pourMax) * plotHeight;
        if (index === 0 || time <= xMin) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    
    // Draw data points and lines
    if (dataPoints.length > 0) {
      // Sort points by time
      const sortedPoints = [...dataPoints].sort((a, b) => a.time - b.time);
      
      // Draw line
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      sortedPoints.forEach((point, index) => {
        const canvasPoint = dataToCanvas(point.time, point.ecValue, scales);
        if (index === 0) {
          ctx.moveTo(canvasPoint.x, canvasPoint.y);
        } else {
          ctx.lineTo(canvasPoint.x, canvasPoint.y);
        }
      });
      
      ctx.stroke();
      
      // Draw points
      sortedPoints.forEach(point => {
        const canvasPoint = dataToCanvas(point.time, point.ecValue, scales);
        
        // Different colors for auto-detected vs manual points
        ctx.fillStyle = point.isAutoDetected ? '#8b5cf6' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // White center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Draw red-light reference line on graph when enabled
    if (showRedLight && redLightTime !== null && redLightTime !== undefined) {
      const redX = padding.left + (redLightTime - scales.xMin) * scales.xScale;
      const minX = padding.left;
      const maxX = canvasWidth - padding.right;

      if (redX >= minX && redX <= maxX) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(redX, padding.top);
        ctx.lineTo(redX, canvasHeight - padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        const mins = Math.floor(redLightTime / 60);
        const secs = Math.floor(redLightTime % 60);
        ctx.fillText(`Red Light ${mins}:${secs.toString().padStart(2, '0')}`, redX, padding.top - 10);
        ctx.restore();
      }
    }

    // Draw phase logs as colored duration bands and vertical boundaries.
    if (phaseLogs.length > 0) {
      const hexToRgba = (hex: string, alpha: number) => {
        const clean = hex.replace('#', '');
        const bigint = parseInt(clean, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      phaseLogs.forEach((log, index) => {
        const startX = padding.left + (log.startTime - scales.xMin) * scales.xScale;
        const endX = padding.left + (log.endTime - scales.xMin) * scales.xScale;
        const left = Math.max(padding.left, Math.min(startX, endX));
        const right = Math.min(canvasWidth - padding.right, Math.max(startX, endX));
        const width = right - left;
        if (width <= 1) return;

        // Duration band inside plotting area.
        ctx.fillStyle = hexToRgba(log.color, 0.12);
        ctx.fillRect(left, padding.top, width, canvasHeight - padding.top - padding.bottom);

        // Boundary lines.
        ctx.strokeStyle = log.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, padding.top);
        ctx.lineTo(left, canvasHeight - padding.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(right, padding.top);
        ctx.lineTo(right, canvasHeight - padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label above plot, staggered.
        ctx.fillStyle = log.color;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(log.name, (left + right) / 2, padding.top - 16 - (index % 2) * 12);
      });
    }
    
    // Draw legend below x-axis title so it doesn't block graph content
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const legendY = xAxisY + 78;
    const autoLabel = 'Auto-detected';
    const manualLabel = 'Manual';
    const autoWidth = ctx.measureText(autoLabel).width;
    const manualWidth = ctx.measureText(manualLabel).width;
    const legendWidth = 15 + 8 + autoWidth + 24 + 15 + 8 + manualWidth;
    const legendStartX = (canvasWidth - legendWidth) / 2;

    // Auto-detected points
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(legendStartX, legendY - 10, 15, 15);
    ctx.fillStyle = '#374151';
    ctx.fillText(autoLabel, legendStartX + 23, legendY + 2);

    // Manual points
    const manualX = legendStartX + 23 + autoWidth + 24;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(manualX, legendY - 10, 15, 15);
    ctx.fillStyle = '#374151';
    ctx.fillText(manualLabel, manualX + 23, legendY + 2);
    
        
  }, [dataPoints, calculateScales, dataToCanvas, xMin, xMax, yMin, yMax, showRedLight, redLightTime, phaseLogs]);

  // Handle mouse move for tooltips
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    const scales = calculateScales();
    
    // Find nearest point
    let nearestPoint: DataPoint | null = null;
    let minDist = Infinity;
    
    dataPoints.forEach((point: DataPoint) => {
      const canvasPoint = dataToCanvas(point.time, point.ecValue, scales);
      const dist = Math.sqrt(
        Math.pow(canvasX - canvasPoint.x, 2) + Math.pow(canvasY - canvasPoint.y, 2)
      );
      if (dist < minDist && dist < 20) { // 20px threshold
        minDist = dist;
        nearestPoint = point;
      }
    });
    
    if (nearestPoint) {
      const point: DataPoint = nearestPoint;
      const minutes = Math.floor(point.time / 60);
      const seconds = Math.floor(point.time % 60);
      const timeFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      let pourTotal: number | null = null;
      if (cumulativePourData && cumulativePourData.values.length > 1) {
        const index = Math.max(0, Math.min(cumulativePourData.values.length - 1, Math.round(point.time / cumulativePourData.intervalSeconds)));
        pourTotal = cumulativePourData.values[index] ?? null;
      }

      setTooltip({
        x: event.clientX,
        y: event.clientY,
        time: timeFormatted,
        ecValue: point.ecValue,
        pourTotal,
        visible: true
      });
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  }, [dataPoints, calculateScales, dataToCanvas]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // Update data points when axis ranges change
  const updateDataPoints = useCallback(() => {
    if (onDataUpdate && dataPoints.length > 0) {
      const updatedPoints = dataPoints.map(point => ({
        ...point,
        // Clamp values to new ranges
        time: Math.max(xMin, Math.min(xMax, point.time)),
        ecValue: Math.max(yMin, Math.min(yMax, point.ecValue))
      }));
      onDataUpdate(updatedPoints);
    }
  }, [dataPoints, xMin, xMax, yMin, yMax, onDataUpdate]);

  useEffect(() => {
    drawGraph();
  }, [dataPoints, xMin, xMax, yMin, yMax, canvasWidth, canvasHeight, showRedLight, redLightTime, drawGraph]);

  useEffect(() => {
    updateDataPoints();
  }, [xMin, xMax, yMin, yMax]);

  const summaryCards = [
    { label: 'Total Points', value: `${dataPoints.length}`, tone: 'bg-blue-50 text-blue-900 border-blue-100' },
    { label: 'Auto / Manual', value: `${dataPoints.filter(p => p.isAutoDetected).length} / ${dataPoints.filter(p => !p.isAutoDetected).length}`, tone: 'bg-violet-50 text-violet-900 border-violet-100' },
    { label: 'Phases', value: `${phaseLogs.length}`, tone: 'bg-amber-50 text-amber-900 border-amber-100' },
    { label: 'Pour Total', value: cumulativePourData ? `${Math.max(...cumulativePourData.values.filter(Number.isFinite), 0).toFixed(1)} g` : 'Not loaded', tone: 'bg-cyan-50 text-cyan-900 border-cyan-100' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Custom EC Chart</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Generated curve + timed overlays</h3>
            <p className="mt-1 text-sm text-slate-600">
              Your EC curve stays primary. When Ultrakoki flow is loaded, total pour is drawn on the same time axis for back-and-forth comparison.
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

      <div className="p-6">
        <div className="mb-6">
        
        {/* Axis Range Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* X-axis (Time) Controls */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-700">Time Axis (seconds)</h4>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Min: {xMin}s</label>
                <input
                  type="number"
                  value={xMin}
                  onChange={(e) => setXMin(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="10"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Max: {xMax}s</label>
                <input
                  type="number"
                  value={xMax}
                  onChange={(e) => setXMax(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  step="10"
                />
              </div>
            </div>
          </div>
          
          {/* Y-axis (EC) Controls */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-700">EC Axis</h4>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Min: {yMin}</label>
                <input
                  type="number"
                  value={yMin}
                  onChange={(e) => setYMin(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="5"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Max: {yMax}</label>
                <input
                  type="number"
                  value={yMax}
                  onChange={(e) => setYMax(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  step="5"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1">
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
      <div ref={containerRef} className="relative w-full rounded-2xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 overflow-x-auto">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-slate-200 bg-white rounded-xl cursor-crosshair"
          style={{ width: canvasWidth, height: canvasHeight }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        
        {/* Red Light Display */}
        {showRedLight && redLightTime !== null && redLightTime !== undefined && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="font-semibold text-red-700">Red Light Detected</span>
              </div>
              <div className="text-lg font-bold text-red-600">
                {formatTimeMinSec(redLightTime)}
              </div>
            </div>
            <div className="text-sm text-red-600 mt-2">
              Raw seconds: {formatRawSeconds(redLightTime)}s
            </div>
            <div className="text-sm text-red-600 mt-1">
              Extraction compounds appear after this time point
            </div>
          </div>
        )}
        
        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="absolute bg-gray-900 text-white p-2 rounded shadow-lg pointer-events-none z-10"
            style={{
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y - 40}px`
            }}
          >
            <div className="text-sm font-semibold">{tooltip.time}</div>
            <div className="text-xs text-blue-300">EC: {tooltip.ecValue.toFixed(2)}</div>
            {tooltip.pourTotal !== null && tooltip.pourTotal !== undefined && (
              <div className="text-xs text-cyan-300">Pour: {tooltip.pourTotal.toFixed(1)} g</div>
            )}
          </div>
        )}
      </div>
      
      {/* Data Summary */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Total Points:</span>
            <span className="ml-2 text-gray-900">{dataPoints.length}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Auto-detected:</span>
            <span className="ml-2 text-purple-600">
              {dataPoints.filter(p => p.isAutoDetected).length}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Manual:</span>
            <span className="ml-2 text-blue-600">
              {dataPoints.filter(p => !p.isAutoDetected).length}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Time Range:</span>
            <span className="ml-2 text-gray-900">
              {Math.floor(dataPoints[0]?.time || 0)}s - {Math.floor(dataPoints[dataPoints.length - 1]?.time || 0)}s
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
