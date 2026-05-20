import { useCallback, useRef, useState } from 'react';

interface TDSHUDProps {
  tdsMin: number;
  tdsMax: number;
  currentTDS: number;
  eyTarget: number;
  onTDSChange: (v: number) => void;
  scaTdsMin?: number;
  scaTdsMax?: number;
}

export default function TDSHUD({ tdsMin, tdsMax, currentTDS, eyTarget, onTDSChange, scaTdsMin, scaTdsMax }: TDSHUDProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(currentTDS));

  const status = currentTDS < tdsMin ? 'UNDER' : currentTDS > tdsMax ? 'OVER' : 'IDEAL';
  const statusColor = status === 'UNDER' ? '#38bdf8' : status === 'OVER' ? '#ef4444' : '#22d65e';
  const idealStart = Math.max(0, (tdsMin - 0.7) / 1.4 * 100);
  const idealEnd = Math.min(100, (tdsMax - 0.7) / 1.4 * 100);
  const markerPct = Math.max(0, Math.min(100, (currentTDS - 0.7) / 1.4 * 100));

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const tds = 0.7 + (pct / 100) * 1.4;
    onTDSChange(parseFloat(tds.toFixed(2)));
  }, [onTDSChange]);

  const handleMarkerDrag = useCallback((e: React.PointerEvent) => {
    const bar = barRef.current;
    if (!bar) return;
    bar.setPointerCapture(e.pointerId);
    const rect = bar.getBoundingClientRect();
    const moveHandler = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const tds = 0.7 + (pct / 100) * 1.4;
      onTDSChange(parseFloat(tds.toFixed(2)));
    };
    const upHandler = () => {
      bar.removeEventListener('pointermove', moveHandler);
      bar.removeEventListener('pointerup', upHandler);
    };
    bar.addEventListener('pointermove', moveHandler);
    bar.addEventListener('pointerup', upHandler);
  }, [onTDSChange]);

  return (
    <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 shadow-lg shadow-emerald-900/20 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-[0.2em]">TDS Target</span>
          <span className="text-emerald-400/40 text-[10px]">|</span>
          <span className="text-emerald-400/60 text-[10px] tabular-nums">{tdsMin.toFixed(2)} – {tdsMax.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: statusColor, textShadow: `0 0 8px ${statusColor}60` }}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Gauge bar */}
      <div ref={barRef} className="relative h-8 mb-1 cursor-pointer rounded-sm overflow-hidden" onClick={handleBarClick}>
        {/* Background zones */}
        <div className="absolute inset-0 rounded-sm overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #1e3a5f, #1e4a3a, #3a1a1a)' }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${idealStart}%, #22d65e ${idealStart}%, #22d65e ${idealEnd}%, #ef4444 ${idealEnd}%, #ef4444 100%)`, opacity: 0.25 }} />
        </div>

        {/* SCA ideal zone overlay */}
        {scaTdsMin != null && scaTdsMax != null && (() => {
          const left = Math.max(0, (scaTdsMin - 0.7) / 1.4 * 100);
          const right = Math.min(100, (scaTdsMax - 0.7) / 1.4 * 100);
          return (
            <div
              className="absolute top-0 bottom-0 z-[5] pointer-events-none transition-all duration-300"
              style={{
                left: `${left}%`,
                width: `${right - left}%`,
                background: 'rgba(52, 211, 153, 0.12)',
                boxShadow: 'inset 0 0 12px rgba(52, 211, 153, 0.15), 0 0 8px rgba(52, 211, 153, 0.08)',
              }}
            />
          );
        })()}

        {/* Tick marks */}
        {[0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0].map((v) => {
          const pct = (v - 0.7) / 1.4 * 100;
          return (
            <div key={v} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
              <div className="w-px h-full bg-emerald-500/20" />
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-emerald-500/50 tabular-nums">{v.toFixed(1)}</div>
            </div>
          );
        })}

        {/* Zone labels */}
        <div className="absolute top-1 left-2 text-[9px] font-bold text-sky-400/60 uppercase tracking-wider">UNDER</div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-emerald-400/60 uppercase tracking-wider">IDEAL</div>
        <div className="absolute top-1 right-2 text-[9px] font-bold text-red-400/60 uppercase tracking-wider">OVER</div>

        {/* Marker */}
        <div className="absolute top-0 -translate-x-1/2 z-10 cursor-grab active:cursor-grabbing"
          style={{ left: `${markerPct}%` }}
          onPointerDown={handleMarkerDrag}
        >
          <div className="flex flex-col items-center">
            <div className="text-emerald-400 text-lg leading-none drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]"
              style={{ textShadow: '0 0 10px rgba(52,211,153,0.6)' }}
            >▼</div>
            <div className="w-0.5 h-6 bg-emerald-400/60" />
          </div>
        </div>
      </div>

      {/* Current value display */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-baseline gap-2">
          {editing ? (
            <input
              type="number"
              step={0.01}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => {
                const v = parseFloat(editValue);
                if (!isNaN(v) && v >= 0) onTDSChange(parseFloat(v.toFixed(2)));
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="bg-transparent text-2xl font-bold text-emerald-400 w-20 text-center outline-none border-b border-emerald-500/40"
              style={{ textShadow: '0 0 12px rgba(52,211,153,0.5)' }}
              autoFocus
            />
          ) : (
            <span
              className="text-2xl font-bold cursor-pointer"
              style={{ color: statusColor, textShadow: `0 0 12px ${statusColor}60` }}
              onClick={() => { setEditValue(String(currentTDS)); setEditing(true); }}
            >
              {currentTDS.toFixed(2)}
            </span>
          )}
          <span className="text-emerald-500/50 text-xs font-medium">TDS%</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-sky-400/70">EY</span>
            <span className="text-emerald-400 font-bold tabular-nums">{eyTarget > 0 ? `${eyTarget.toFixed(1)}%` : '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sky-400/70">Δ</span>
            <span className="text-emerald-400 font-bold tabular-nums" style={{ color: statusColor }}>
              {status === 'UNDER' ? `-${(tdsMin - currentTDS).toFixed(2)}` : status === 'OVER' ? `+${(currentTDS - tdsMax).toFixed(2)}` : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* EY gauge strip */}
      <div className="mt-3 pt-2 border-t border-emerald-500/10">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-emerald-500/50 uppercase tracking-wider font-bold">EY</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400/60 transition-all"
              style={{ width: `${Math.min(100, (eyTarget / 25) * 100)}%` }}
            />
          </div>
          <span className="text-emerald-400 font-bold tabular-nums">{eyTarget > 0 ? `${eyTarget.toFixed(1)}%` : '—'}</span>
        </div>
      </div>
    </div>
  );
}
