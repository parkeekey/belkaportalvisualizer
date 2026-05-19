import { useCallback, useEffect, useState } from 'react';

interface AttemptEntry {
  id: string;
  date: string;
  grindSize: number;
  doseWeight: number;
  brewRatio: number;
  totalWater: number;
  tdsActual: number;
  tdsMin: number;
  tdsMax: number;
  ey: number;
  notes: string;
}

const STORAGE_KEY = 'belkaAttemptLog';

function loadLog(): AttemptEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function verdict(tds: number, min: number, max: number): 'UNDER' | 'IDEAL' | 'OVER' {
  if (tds < min) return 'UNDER';
  if (tds > max) return 'OVER';
  return 'IDEAL';
}

function delta(tds: number, min: number, max: number): number {
  const mid = (min + max) / 2;
  return parseFloat((tds - mid).toFixed(3));
}

interface AttemptLogProps {
  currentGrindSize: number;
  currentDose: number;
  currentRatio: number;
  currentTotalWater: number;
  tdsMin: number;
  tdsMax: number;
  currentTDS: number;
}

export default function AttemptLog({ currentGrindSize, currentDose, currentRatio, currentTotalWater, tdsMin, tdsMax, currentTDS }: AttemptLogProps) {
  const [entries, setEntries] = useState<AttemptEntry[]>(loadLog);
  const [logTDS, setLogTDS] = useState(String(currentTDS));
  const [logEY, setLogEY] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTDS, setEditTDS] = useState('');
  const [editEY, setEditEY] = useState('');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }, [entries]);

  const addEntry = useCallback(() => {
    const tds = parseFloat(logTDS);
    if (isNaN(tds)) return;
    const ey = parseFloat(logEY) || 0;
    const entry: AttemptEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      grindSize: currentGrindSize,
      doseWeight: currentDose,
      brewRatio: currentRatio,
      totalWater: currentTotalWater,
      tdsActual: tds,
      tdsMin,
      tdsMax,
      ey,
      notes: logNotes,
    };
    setEntries(prev => [entry, ...prev]);
    setLogEY('');
    setLogNotes('');
  }, [logTDS, logEY, logNotes, currentGrindSize, currentDose, currentRatio, currentTotalWater, tdsMin, tdsMax]);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const startEdit = useCallback((e: AttemptEntry) => {
    setEditingId(e.id);
    setEditTDS(String(e.tdsActual));
    setEditEY(String(e.ey));
  }, []);

  const saveEdit = useCallback((id: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newTDS = parseFloat(editTDS);
      const newEY = parseFloat(editEY);
      return {
        ...e,
        tdsActual: isNaN(newTDS) ? e.tdsActual : newTDS,
        ey: isNaN(newEY) ? e.ey : newEY,
      };
    }));
    setEditingId(null);
  }, [editTDS, editEY]);

  const total = entries.length;
  const idealCount = entries.filter(e => verdict(e.tdsActual, e.tdsMin, e.tdsMax) === 'IDEAL').length;
  const successPct = total > 0 ? Math.round((idealCount / total) * 100) : 0;

  const handleLogTDSBlur = useCallback(() => {
    const v = parseFloat(logTDS);
    if (!isNaN(v)) setLogTDS(v.toFixed(2));
  }, [logTDS]);

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs px-1">
        <span className="text-slate-400 font-medium">Attempts <strong className="text-slate-700">{total}</strong></span>
        <span className="text-emerald-600 font-medium">Ideal <strong>{idealCount}</strong></span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-32">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${successPct}%` }} />
        </div>
        <span className={`font-bold tabular-nums ${successPct >= 60 ? 'text-emerald-600' : successPct >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{successPct}%</span>
      </div>

      {/* Log new attempt */}
      <div className="flex flex-wrap items-end gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">TDS</label>
          <input type="number" step={0.01} value={logTDS}
            onChange={(e) => setLogTDS(e.target.value)}
            onBlur={handleLogTDSBlur}
            className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">EY%</label>
          <input type="number" step={0.1} value={logEY}
            onChange={(e) => setLogEY(e.target.value)}
            className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Notes</label>
          <input type="text" value={logNotes}
            onChange={(e) => setLogNotes(e.target.value)}
            placeholder="taste notes..."
            className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>
        <button onClick={addEntry} disabled={!logTDS || isNaN(parseFloat(logTDS))}
          className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Log Attempt
        </button>
      </div>

      {/* Log table */}
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 italic px-1">No attempts logged yet. Brew, measure your TDS, and log it here.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-1">
          {entries.map((e) => {
            const v = verdict(e.tdsActual, e.tdsMin, e.tdsMax);
            const d = delta(e.tdsActual, e.tdsMin, e.tdsMax);
            const vColor = v === 'UNDER' ? '#38bdf8' : v === 'OVER' ? '#ef4444' : '#22d65e';
            const isEditing = editingId === e.id;
            return (
              <div key={e.id}
                className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border transition-colors ${v === 'IDEAL' ? 'bg-emerald-50/60 border-emerald-200' : v === 'UNDER' ? 'bg-sky-50/40 border-sky-200' : 'bg-red-50/40 border-red-200'}`}
              >
                {/* Grind + dose */}
                <span className="text-slate-500 font-medium w-14 tabular-nums">#{e.grindSize > 0 ? e.grindSize : '—'}</span>
                <span className="text-slate-400 w-12 tabular-nums">{e.doseWeight.toFixed(1)}g</span>
                <span className="text-slate-400 w-10 tabular-nums">1:{e.brewRatio.toFixed(0)}</span>

                {/* TDS actual */}
                {isEditing ? (
                  <input type="number" step={0.01} value={editTDS}
                    onChange={(ee) => setEditTDS(ee.target.value)}
                    className="w-14 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                    autoFocus
                    onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); if (ee.key === 'Escape') setEditingId(null); }}
                  />
                ) : (
                  <span className="w-14 text-right font-bold tabular-nums" style={{ color: vColor }}>{e.tdsActual.toFixed(2)}</span>
                )}

                {/* Delta */}
                <span className="w-12 text-right tabular-nums text-slate-400">{d > 0 ? '+' : ''}{d.toFixed(2)}</span>

                {/* EY */}
                {isEditing ? (
                  <input type="number" step={0.1} value={editEY}
                    onChange={(ee) => setEditEY(ee.target.value)}
                    className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                    onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); }}
                  />
                ) : (
                  <span className="w-10 text-right tabular-nums text-slate-500">{e.ey > 0 ? `${e.ey.toFixed(1)}%` : '—'}</span>
                )}

                {/* Verdict badge */}
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    color: vColor,
                    backgroundColor: `${vColor}18`,
                    border: `1px solid ${vColor}30`,
                  }}
                >
                  {v}
                </span>

                {/* Date */}
                <span className="ml-auto text-[9px] text-slate-400 whitespace-nowrap">{e.date}</span>

                {/* Actions */}
                {isEditing ? (
                  <button onClick={() => saveEdit(e.id)} className="text-emerald-600 hover:text-emerald-800 font-bold px-1">✓</button>
                ) : (
                  <button onClick={() => startEdit(e)} className="text-slate-300 hover:text-slate-500 px-1">✎</button>
                )}
                <button onClick={() => deleteEntry(e.id)} className="text-red-200 hover:text-red-500 font-bold px-0.5">×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick reference: grind sizes that hit IDEAL */}
      {entries.length >= 3 && (() => {
        const idealGinds = [...new Set(entries.filter(e => verdict(e.tdsActual, e.tdsMin, e.tdsMax) === 'IDEAL').map(e => e.grindSize))].filter(g => g > 0);
        if (idealGinds.length === 0) return null;
        const sorted = idealGinds.sort((a, b) => a - b);
        return (
          <div className="text-[10px] text-slate-400 px-1 pt-1 border-t border-slate-100">
            Sweet spot grind sizes: <span className="text-emerald-600 font-bold">{sorted.map(g => `#${g}`).join(', ')}</span>
          </div>
        );
      })()}
    </div>
  );
}
