import React, { useState, useCallback, useEffect, useRef } from 'react';

interface GrinderEntry {
  id: string;
  clicks: number;
  grindSize: number;
  micron: number;
  like: boolean;
  dislike: boolean;
  showLine: boolean;
  isElectric: boolean;
  rpm: number;
  burrSize: number;
  expectedTDSMin: number;
  expectedTDSMax: number;
  date: string;
  notes: string;
}

interface GrinderKnobProps {
  grinderName: string;
  onGrinderNameChange: (v: string) => void;
  grindSize: number;
  onGrindSizeChange: (v: number) => void;
  micron: number;
}

const STORAGE_KEY = 'belkaGrinderHistory';
const loadHistory = (): GrinderEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const GrinderKnob: React.FC<GrinderKnobProps> = ({ grinderName, onGrinderNameChange, grindSize, onGrindSizeChange, micron }) => {
  const [totalClicks, setTotalClicks] = useState(40);
  const [microStep, setMicroStep] = useState(1);
  const [history, setHistory] = useState<GrinderEntry[]>(loadHistory);
  const [tdsMin, setTdsMin] = useState('');
  const [tdsMax, setTdsMax] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  const [isElectric, setIsElectric] = useState(false);
  const [rpm, setRpm] = useState('');
  const [burrSize, setBurrSize] = useState('');
  const [zoom, setZoom] = useState(1);
  const [hoveredEntry, setHoveredEntry] = useState<GrinderEntry | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [calcLow, setCalcLow] = useState(0);
  const [calcHigh, setCalcHigh] = useState(totalClicks);
  const [calcPct, setCalcPct] = useState(50);
  const [calcDir, setCalcDir] = useState<'coarser' | 'finer'>('coarser');
  const [focusMode, setFocusMode] = useState(false);
  const [focusFrom, setFocusFrom] = useState(0);
  const [focusTo, setFocusTo] = useState(totalClicks);
  const knobRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const step = microStep === 1 ? 1 : 1 / microStep;
  const decimals = step < 1 ? (String(step).split('.')[1]?.length || 1) : 0;

  const initClicks = grindSize > 0 ? parseFloat(grindSize.toFixed(Math.max(2, decimals))) : 0;
  const [clicks, setClicks] = useState(initClicks);
  const [clickInput, setClickInput] = useState(() => initClicks.toFixed(decimals));

  const rangeMin = focusMode ? focusFrom : 0;
  const rangeMax = focusMode ? focusTo : totalClicks;
  const rangeSpan = rangeMax - rangeMin || 1;
  const posToAngle = (v: number) => ((v - rangeMin) / rangeSpan) * 270 - 135;
  const clampedClicks = focusMode ? Math.max(rangeMin, Math.min(rangeMax, clicks)) : clicks;
  const knobAngle = posToAngle(clampedClicks);

  const baseSize = 70;
  const padOuter = 22;
  const knobPx = baseSize * zoom;
  const outerPx = (baseSize + padOuter * 2) * zoom;
  const knobR = knobPx / 2;
  const labelR = knobR + 14 * zoom;
  const majorTickLen = 9 * zoom;
  const minorTickLen = 5 * zoom;
  const microTickLen = 2;

  const majorInterval = totalClicks <= 8 ? 1 : Math.max(1, Math.ceil(totalClicks / 8));
  const intPositions = Array.from({ length: totalClicks + 1 }, (_, i) => i);
  const majorPositions = intPositions.filter(i => i % majorInterval === 0);

  const microPositions: number[] = [];
  if (microStep > 1) {
    const count = Math.round(totalClicks / step);
    for (let i = 0; i <= count; i++) {
      const pos = parseFloat((i * step).toFixed(decimals));
      if (pos % 1 !== 0) microPositions.push(pos);
    }
  }

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); }, [history]);

  const precise = (v: number) => parseFloat(v.toFixed(decimals));

  const handleClickChange = useCallback((delta: number) => {
    setClicks(c => {
      const next = precise(Math.max(0, Math.min(totalClicks, c + delta)));
      onGrindSizeChange(next);
      setClickInput(next.toFixed(decimals));
      return next;
    });
  }, [totalClicks, onGrindSizeChange, decimals]);

  const makeEntry = (like: boolean | null): GrinderEntry => ({
    id: Date.now().toString(),
    clicks,
    grindSize,
    micron,
    like: like === true,
    dislike: like === false,
    showLine: true,
    isElectric,
    rpm: parseFloat(rpm) || 0,
    burrSize: parseFloat(burrSize) || 0,
    expectedTDSMin: parseFloat(tdsMin) || 0,
    expectedTDSMax: parseFloat(tdsMax) || 0,
    date: new Date().toLocaleString(),
    notes: '',
  });

  const flashEntry = (entry: GrinderEntry) => {
    setHistory(prev => [entry, ...prev]);
    setNewEntryId(entry.id);
    setShowHistory(true);
    setTimeout(() => setNewEntryId(null), 2000);
  };

  const recordEntry = useCallback(() => flashEntry(makeEntry(null)), [clicks, grindSize, micron, isElectric, rpm, burrSize, tdsMin, tdsMax]);

  const deleteEntry = useCallback((id: string) => setHistory(prev => prev.filter(e => e.id !== id)), []);

  const updateEntry = useCallback((id: string, updates: Partial<GrinderEntry>) => {
    setHistory(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  const visibleLines = history.filter(e => e.showLine);

  const electricInputs = isElectric && (
    <div className="flex items-center gap-2 text-xs">
      <label className="text-slate-400">RPM:</label>
      <input type="number" step={1} value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder="e.g. 800" className="w-16 px-1 py-0.5 text-xs border border-emerald-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      <label className="text-slate-400">Burr:</label>
      <input type="number" step={0.5} value={burrSize} onChange={(e) => setBurrSize(e.target.value)} placeholder="mm" className="w-14 px-1 py-0.5 text-xs border border-emerald-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      <span className="text-[10px] text-slate-400">mm</span>
    </div>
  );

  const tickAngle = (v: number) => posToAngle(v);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let rawAngle = Math.atan2(dx, dy) * 180 / Math.PI;
    rawAngle = Math.max(-135, Math.min(135, rawAngle));
    const pos = parseFloat(((rawAngle + 135) / 270 * rangeSpan + rangeMin).toFixed(decimals));
    setClicks(pos);
    onGrindSizeChange(pos);
    setClickInput(pos.toFixed(decimals));
  };

  return (
    <div className="border border-emerald-200 rounded-lg bg-emerald-50/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <label className="text-slate-400">Grinder:</label>
        <input type="text" value={grinderName} onChange={(e) => onGrinderNameChange(e.target.value)} placeholder="e.g. Ode Gen 2" className="w-20 px-1.5 py-0.5 text-xs border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <span className="text-slate-300">|</span>
        <label className="text-slate-400">Total clicks:</label>
        <input type="number" min={1} step={1} value={totalClicks} onChange={(e) => setTotalClicks(Math.max(1, parseInt(e.target.value) || 40))} className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <span className="text-slate-300">|</span>
        <label className="text-slate-400">Micro:</label>
        <input type="number" min={1} max={10} step={1} value={microStep} onChange={(e) => setMicroStep(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} className="w-10 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <span className="text-[10px] text-slate-400">(step {step})</span>
        <span className="text-slate-300">|</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={isElectric} onChange={(e) => setIsElectric(e.target.checked)} className="rounded" />
          <span className="text-slate-400">Electric</span>
        </label>
      </div>

      {electricInputs}

      <div className="flex items-start gap-3 flex-wrap">
        <div ref={dialRef} className="relative flex-shrink-0 cursor-pointer select-none touch-none" style={{ width: outerPx, height: outerPx }}
          onPointerDown={(e) => {
            dragRef.current = true;
            dialRef.current?.setPointerCapture?.(e.pointerId);
            updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => { dragRef.current = false; }}
          onPointerCancel={() => { dragRef.current = false; }}
        >
          {microPositions.filter(p => !focusMode || (p >= rangeMin && p <= rangeMax)).map((p) => {
            const a = tickAngle(p);
            return focusMode ? (
              <div key={`m-${p.toFixed(decimals)}`}
                className="absolute"
                style={{
                  top: '50%', left: '50%',
                  width: 3, height: 0,
                  borderTop: '1px dashed #94a3b8',
                  opacity: 0.7,
                  transform: `rotate(${a}deg) translateY(${-knobR - 1}px)`,
                  transformOrigin: 'bottom center',
                }}
              />
            ) : (
              <div key={`m-${p.toFixed(decimals)}`}
                className="absolute"
                style={{
                  top: '50%', left: '50%',
                  width: 0.5, height: microTickLen,
                  background: '#cbd5e1',
                  opacity: 0.35,
                  transform: `rotate(${a}deg) translateY(${-knobR - 1}px)`,
                  transformOrigin: 'bottom center',
                }}
              />
            );
          })}

          {intPositions.filter(i => !focusMode || (i >= rangeMin && i <= rangeMax)).map(i => {
            const a = tickAngle(i);
            const isMajor = i % majorInterval === 0;
            const len = isMajor ? majorTickLen : minorTickLen;
            return (
              <div key={`t-${i}`}
                className="absolute"
                style={{
                  top: '50%', left: '50%',
                  width: isMajor ? 2 : 1,
                  height: len,
                  background: isMajor ? '#475569' : '#94a3b8',
                  transform: `rotate(${a}deg) translateY(${-knobR - len / 2}px)`,
                  transformOrigin: 'center center',
                }}
              />
            );
          })}

          {majorPositions.filter(i => !focusMode || (i >= rangeMin && i <= rangeMax)).map(i => {
            const a = tickAngle(i);
            const rad = a * Math.PI / 180;
            const x = labelR * Math.sin(rad);
            const y = -labelR * Math.cos(rad);
            return (
              <div key={`l-${i}`}
                className="absolute text-[7px] text-slate-500 font-semibold leading-none"
                style={{
                  top: `calc(50% + ${y}px)`,
                  left: `calc(50% + ${x}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {i}
              </div>
            );
          })}

          <div className="absolute rounded-full border-2 border-emerald-400 bg-white shadow-sm"
            style={{
              width: knobPx, height: knobPx,
              left: (outerPx - knobPx) / 2,
              top: (outerPx - knobPx) / 2,
            }}
          >
            {visibleLines.filter(e => !focusMode || (e.clicks >= rangeMin && e.clicks <= rangeMax)).map((e) => {
              const a = tickAngle(e.clicks);
              const color = e.like ? '#22c55e' : e.dislike ? '#ef4444' : '#94a3b8';
              return (
                <div key={e.id}
                  className="absolute"
                  style={{
                    bottom: '50%', left: '50%', width: 5, height: '50%',
                    transformOrigin: 'bottom center',
                    transform: `rotate(${a}deg)`,
                    background: color,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredEntry(e)}
                  onMouseLeave={() => setHoveredEntry(null)}
                />
              );
            })}

            {hoveredEntry && (
              <div className="absolute z-10"
                style={{
                  top: -8,
                  left: '50%',
                  transform: 'translate(-50%, -100%)',
                  background: 'rgba(30,41,59,0.92)',
                  color: '#f1f5f9',
                  fontSize: 10,
                  lineHeight: 1.4,
                  padding: '4px 8px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                <div className="font-semibold">
                  #{hoveredEntry.clicks}{hoveredEntry.micron > 0 ? `  ${hoveredEntry.micron}µm` : ''}
                </div>
                <div>
                  TDS {hoveredEntry.expectedTDSMin > 0 ? hoveredEntry.expectedTDSMin.toFixed(2) : '?'}–{hoveredEntry.expectedTDSMax > 0 ? hoveredEntry.expectedTDSMax.toFixed(2) : '?'}%
                  {hoveredEntry.rpm > 0 ? `  ${hoveredEntry.rpm}rpm` : ''}
                </div>
                <div className="text-[9px] opacity-70">{hoveredEntry.date}</div>
              </div>
            )}
          </div>

          <div ref={knobRef} className="absolute rounded-full"
            style={{
              width: knobPx, height: knobPx,
              left: (outerPx - knobPx) / 2,
              top: (outerPx - knobPx) / 2,
              transform: `rotate(${knobAngle}deg)`,
              transition: 'transform 0.1s ease',
            }}
          >
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 bg-slate-600 rounded-full"
              style={{ height: Math.max(5, knobPx * 0.15) }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-[180px] flex-1">
          <div className="inline-flex items-center self-start border border-emerald-300 rounded-lg bg-white shadow-sm overflow-hidden">
            <button onClick={() => handleClickChange(-step)} className="w-8 h-9 text-emerald-700 font-bold text-sm hover:bg-emerald-100 flex items-center justify-center border-r border-emerald-200">−</button>
            <input type="text" inputMode="decimal" value={clickInput}
              onChange={(e) => setClickInput(e.target.value)}
              onBlur={() => {
                const v = parseFloat(clickInput);
                if (!isNaN(v) && v >= 0) {
                  const clamped = precise(Math.min(totalClicks, v));
                  setClicks(clamped);
                  onGrindSizeChange(clamped);
                }
                setClickInput(clicks.toFixed(decimals));
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-16 text-center text-sm font-bold text-emerald-800 tabular-nums bg-transparent border-none outline-none"
            />
            <button onClick={() => handleClickChange(step)} className="w-8 h-9 text-emerald-700 font-bold text-sm hover:bg-emerald-100 flex items-center justify-center border-l border-emerald-200">+</button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-[10px] text-slate-400 tabular-nums">#{grindSize > 0 ? grindSize : '—'}  |  {micron > 0 ? `${micron}µm` : '—'}</div>
            <button onClick={recordEntry} className="px-4 py-2 rounded text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-600 shadow-sm">Record</button>
            <button onClick={() => flashEntry(makeEntry(true))} className="px-3 py-2 rounded text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 border border-green-300">👍</button>
            <button onClick={() => flashEntry(makeEntry(false))} className="px-3 py-2 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 border border-red-300">👎</button>
            <button onClick={() => setShowCalc(v => !v)} className={`px-2.5 py-2 rounded text-xs font-bold border ${showCalc ? 'bg-emerald-200 text-emerald-800 border-emerald-400' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'}`}>±</button>
            <button onClick={() => { setFocusMode(v => !v); if (!focusMode) { setFocusFrom(Math.max(0, Math.floor(clicks) - 1)); setFocusTo(Math.min(totalClicks, Math.ceil(clicks) + 1)); } }} className={`px-2.5 py-2 rounded text-xs font-bold border ${focusMode ? 'bg-amber-200 text-amber-800 border-amber-400' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'}`}>🔍</button>
          </div>
          {showCalc && (
            <div className="flex items-center gap-2 text-[10px] bg-white border border-emerald-200 rounded-lg px-3 py-2 shadow-sm flex-wrap">
              <div className="flex items-center gap-1">
                <label className="text-slate-400">#grind1</label>
                <input type="number" value={calcLow} onChange={(e) => setCalcLow(parseFloat(e.target.value) || 0)} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-slate-400">#grind2</label>
                <input type="number" value={calcHigh} onChange={(e) => setCalcHigh(parseFloat(e.target.value) || 0)} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
              </div>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="calcDir" checked={calcDir === 'coarser'} onChange={() => setCalcDir('coarser')} className="rounded-full" />
                <span className="text-slate-500">% coarser</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="calcDir" checked={calcDir === 'finer'} onChange={() => setCalcDir('finer')} className="rounded-full" />
                <span className="text-slate-500">% finer</span>
              </label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={calcPct} onChange={(e) => setCalcPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
                <span className="text-slate-400">%</span>
              </div>
              <button onClick={() => {
                const diff = calcHigh - calcLow;
                const v = calcDir === 'coarser' ? calcLow + diff * calcPct / 100 : calcHigh - diff * calcPct / 100;
                const clamped = precise(Math.max(0, Math.min(totalClicks, v)));
                setClicks(clamped);
                setClickInput(clamped.toFixed(decimals));
                onGrindSizeChange(clamped);
              }} className="px-3 py-1 rounded text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600">Calculate</button>
              <span className="font-bold text-emerald-700 tabular-nums">
                = {precise(Math.max(0, Math.min(totalClicks, calcDir === 'coarser' ? calcLow + (calcHigh - calcLow) * calcPct / 100 : calcHigh - (calcHigh - calcLow) * calcPct / 100)))}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="w-5 h-5 rounded border border-slate-300 bg-white text-slate-500 text-[9px] font-bold hover:bg-slate-100 flex items-center justify-center">−</button>
            <span className="text-[9px] text-slate-400 tabular-nums w-6 text-center">{(zoom * 100).toFixed(0)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="w-5 h-5 rounded border border-slate-300 bg-white text-slate-500 text-[9px] font-bold hover:bg-slate-100 flex items-center justify-center">+</button>
          </div>
          {focusMode && (
            <div className="flex items-center gap-2 text-[10px] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-amber-600 font-semibold">Focus</span>
              <span className="text-slate-300">|</span>
              <label className="text-slate-400">From</label>
              <input type="number" value={focusFrom} onChange={(e) => {
                const v = Math.max(0, Math.min(totalClicks, parseFloat(e.target.value) || 0));
                setFocusFrom(v);
              }} className="w-14 px-1 py-0.5 text-xs border border-amber-300 rounded text-center" />
              <span className="text-slate-300">→</span>
              <label className="text-slate-400">To</label>
              <input type="number" value={focusTo} onChange={(e) => {
                const v = Math.max(0, Math.min(totalClicks, parseFloat(e.target.value) || 0));
                setFocusTo(v);
              }} className="w-14 px-1 py-0.5 text-xs border border-amber-300 rounded text-center" />
              <button onClick={() => setFocusMode(false)} className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-700 hover:bg-amber-300">×</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="text-slate-400">Expect TDS:</label>
        <input type="number" step="0.01" value={tdsMin} onChange={(e) => setTdsMin(e.target.value)} placeholder="min" className="w-14 px-1 py-0.5 text-xs border border-emerald-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <span className="text-slate-300">~</span>
        <input type="number" step="0.01" value={tdsMax} onChange={(e) => setTdsMax(e.target.value)} placeholder="max" className="w-14 px-1 py-0.5 text-xs border border-emerald-200 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <button onClick={() => setShowHistory(v => !v)} className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 font-medium">{showHistory ? 'Hide' : 'History'} ({history.length})</button>
      </div>

      {showHistory && history.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1 border-t border-emerald-200 pt-2">
          {history.map((e) => (
            editingId === e.id ? (
              <div key={e.id} className="flex flex-col gap-1 text-[10px] bg-white rounded px-2 py-1.5 border border-emerald-300">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-slate-400">#</span>
                  <button onClick={() => updateEntry(e.id, { like: !e.like, dislike: e.like ? false : e.dislike })} className={`px-0.5 ${e.like ? '' : 'opacity-40'} hover:opacity-100`}>👍</button>
                  <button onClick={() => updateEntry(e.id, { dislike: !e.dislike, like: e.dislike ? false : e.like })} className={`px-0.5 ${e.dislike ? '' : 'opacity-40'} hover:opacity-100`}>👎</button>
                  <span className="text-slate-400">#</span>
                  <input type="number" step={step} value={e.clicks} onChange={(v) => updateEntry(e.id, { clicks: parseFloat(parseFloat(v.target.value).toFixed(decimals)) || 0 })} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
                  <span className="text-slate-400">µm</span>
                  <input type="number" step={1} value={e.micron} onChange={(v) => updateEntry(e.id, { micron: parseFloat(v.target.value) || 0 })} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400">TDS</span>
                  <input type="number" step="0.01" value={e.expectedTDSMin} onChange={(v) => updateEntry(e.id, { expectedTDSMin: parseFloat(v.target.value) || 0 })} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
                  <span className="text-slate-300">~</span>
                  <input type="number" step="0.01" value={e.expectedTDSMax} onChange={(v) => updateEntry(e.id, { expectedTDSMax: parseFloat(v.target.value) || 0 })} className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center" />
                  <button onClick={() => setEditingId(null)} className="text-emerald-600 hover:text-emerald-800 font-bold px-1">✓</button>
                </div>
              </div>
            ) : (
              <div key={e.id} className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 border ${newEntryId === e.id ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-100 bg-white'}`}>
                <input type="checkbox" checked={e.showLine} onChange={() => updateEntry(e.id, { showLine: !e.showLine })} className="rounded" title="Show on knob" />
                <button onClick={() => updateEntry(e.id, { like: !e.like, dislike: e.like ? false : e.dislike })} className={`px-0.5 ${e.like ? '' : 'opacity-30'} hover:opacity-100`}>👍</button>
                <button onClick={() => updateEntry(e.id, { dislike: !e.dislike, like: e.dislike ? false : e.like })} className={`px-0.5 ${e.dislike ? '' : 'opacity-30'} hover:opacity-100`}>👎</button>
                <span className={`font-medium tabular-nums ${e.like ? 'text-green-600' : e.dislike ? 'text-red-500' : 'text-slate-500'}`}>#{e.clicks}</span>
                {e.micron > 0 && <span className="tabular-nums text-slate-400">{e.micron}µm</span>}
                {e.rpm > 0 && <span className="tabular-nums text-slate-400">{e.rpm}rpm</span>}
                <span className="text-slate-300">|</span>
                <span className="tabular-nums text-slate-500">{e.expectedTDSMin > 0 ? e.expectedTDSMin.toFixed(2) : '?'}–{e.expectedTDSMax > 0 ? e.expectedTDSMax.toFixed(2) : '?'}%</span>
                <span className="ml-auto text-slate-300">{e.date}</span>
                <button onClick={() => setEditingId(e.id)} className="text-slate-400 hover:text-slate-600 px-0.5">✎</button>
                <button onClick={() => deleteEntry(e.id)} className="text-red-300 hover:text-red-500 font-bold px-0.5">×</button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default GrinderKnob;
