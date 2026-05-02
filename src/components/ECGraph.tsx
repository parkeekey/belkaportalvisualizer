import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DataPoint {
  time_seconds: number;
  time_formatted: string;
  ec_value: number;
}

interface ECGraphProps {
  ecData: DataPoint[];
}

interface TooltipData {
  x: number;
  y: number;
  time: string;
  ecValue?: number;
  visible: boolean;
}

export const ECGraph: React.FC<ECGraphProps> = ({ ecData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData>({
    x: 0,
    y: 0,
    time: '',
    visible: false
  });
  
  // Canvas dimensions and padding
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const canvasWidth = 800;
  const canvasHeight = 400;

  // Calculate scales
  const calculateScales = useCallback(() => {
    if (ecData.length === 0) return null;
    
    // Find data ranges from EC data
    const allTimes = ecData.map(d => d.time_seconds);
    const allValues = ecData.map(d => d.ec_value);
    
    const xMin = Math.min(...allTimes);
    const xMax = Math.max(...allTimes);
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    
    // Add some padding to ranges
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
      yMax
    };
  }, [ecData]);

  // Convert data coordinates to canvas coordinates
  const dataToCanvas = useCallback((time: number, value: number, scales: any) => {
    const x = padding.left + (time - scales.xMin) * scales.xScale;
    const y = canvasHeight - padding.bottom - (value - scales.yMin) * scales.yScale;
    return { x, y };
  }, []);

  
  // Find nearest data point to canvas coordinates
  const findNearestPoint = useCallback((canvasX: number, canvasY: number, scales: any) => {
    let nearestPoint: DataPoint | null = null;
    let minDist = Infinity;
    
    for (const point of ecData) {
      const pointCanvas = dataToCanvas(point.time_seconds, point.ec_value, scales);
      const dist = Math.sqrt(
        Math.pow(canvasX - pointCanvas.x, 2) + Math.pow(canvasY - pointCanvas.y, 2)
      );
      if (dist < minDist && dist < 20) { // 20px threshold
        minDist = dist;
        nearestPoint = point;
      }
    }
    
    return nearestPoint;
  }, [ecData, dataToCanvas]);

  // Draw the graph
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const scales = calculateScales();
    if (!scales) return;
    
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
    
    // Draw axis labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // X-axis labels (time)
    for (let i = 0; i <= 5; i++) {
      const time = scales.xMin + (i * (scales.xMax - scales.xMin)) / 5;
      const x = padding.left + (i * (canvasWidth - padding.left - padding.right)) / 5;
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      ctx.fillText(label, x, canvasHeight - padding.bottom + 20);
    }
    
    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = scales.yMin + (i * (scales.yMax - scales.yMin)) / 5;
      const y = canvasHeight - padding.bottom - (i * (canvasHeight - padding.top - padding.bottom)) / 5;
      ctx.fillText(value.toFixed(1), padding.left - 10, y + 4);
    }
    
    // Draw EC line
    if (ecData.length > 0) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      ecData.forEach((point, index) => {
        const canvasPoint = dataToCanvas(point.time_seconds, point.ec_value, scales);
        if (index === 0) {
          ctx.moveTo(canvasPoint.x, canvasPoint.y);
        } else {
          ctx.lineTo(canvasPoint.x, canvasPoint.y);
        }
      });
      
      ctx.stroke();
      
      // Draw EC points
      ctx.fillStyle = '#3b82f6';
      ecData.forEach(point => {
        const canvasPoint = dataToCanvas(point.time_seconds, point.ec_value, scales);
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
    
    // Draw axis titles
    ctx.fillStyle = '#374151';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (min:sec)', canvasWidth / 2, canvasHeight - 10);
    
    ctx.save();
    ctx.translate(20, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('EC (μS/cm)', 0, 0);
    ctx.restore();
    
    // Draw legend
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    // EC legend
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(canvasWidth - 150, 20, 15, 15);
    ctx.fillStyle = '#374151';
    ctx.fillText('EC (Blue)', canvasWidth - 130, 32);
    
  }, [ecData, calculateScales, dataToCanvas]);

  // Handle mouse move
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    const scales = calculateScales();
    if (!scales) return;
    
    const nearestPoint = findNearestPoint(canvasX, canvasY, scales);
    
    if (nearestPoint) {
      setTooltip({
        x: event.clientX,
        y: event.clientY,
        time: nearestPoint.time_formatted,
        ecValue: nearestPoint.ec_value,
        visible: true
      });
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
    
      }, [calculateScales, findNearestPoint]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // Initialize and redraw
  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="border border-gray-300 rounded-lg cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      
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
          {tooltip.ecValue !== undefined && (
            <div className="text-xs text-blue-300">EC: {tooltip.ecValue.toFixed(2)}</div>
          )}
        </div>
      )}
      
      <div className="mt-2 text-sm text-gray-600">
        <p>• Hover over EC line to see exact values</p>
        <p>• Click and drag to see crosshair with coordinates</p>
      </div>
    </div>
  );
};
