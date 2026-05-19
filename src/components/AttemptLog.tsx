import { useCallback, useEffect, useState } from 'react';

const TASTE_GROUPS = [
  {
    label: 'Body',
    tags: ['Weak', 'Hollow', 'Muddy', 'Thin', 'Heavy'],
  },
  {
    label: 'Mouthfeel',
    tags: ['Dry', 'Astringent', 'Silky', 'Juicy', 'Crisp', 'Creamy'],
  },
  {
    label: 'Flavor',
    tags: ['Sour', 'Bitter', 'Grassy', 'Earthy', 'Metallic', 'Salty', 'Bright', 'Sweet', 'Floral', 'Rich', 'Clean'],
  },
  {
    label: 'Balance',
    tags: ['Strong', 'Harsh', 'Balanced', 'Smooth', 'Delicate'],
  },
];
const ALL_TASTE_TAGS = TASTE_GROUPS.flatMap(g => g.tags);
const POSITIVE_TAGS = new Set(['Silky', 'Juicy', 'Crisp', 'Creamy', 'Bright', 'Sweet', 'Floral', 'Rich', 'Clean', 'Balanced', 'Smooth', 'Delicate']);
const isPositive = (t: string) => POSITIVE_TAGS.has(t);
const isNegative = (t: string) => !POSITIVE_TAGS.has(t);

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
  tasteTags: string[];
  notes: string;
}

const STORAGE_KEY = 'belkaAttemptLog';

function loadLog(): AttemptEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return (raw as AttemptEntry[]).map(e => ({ ...e, tasteTags: e.tasteTags ?? [] }));
  } catch { return []; }
}

function tdsVerdict(tds: number, min: number, max: number): 'UNDER' | 'IDEAL' | 'OVER' {
  if (tds < min) return 'UNDER';
  if (tds > max) return 'OVER';
  return 'IDEAL';
}

function delta(tds: number, min: number, max: number): number {
  const mid = (min + max) / 2;
  return parseFloat((tds - mid).toFixed(3));
}

function overallVerdict(tds: number, min: number, max: number, tasteTags: string[] = []): 'NEED IMPROVE' | 'IDEAL' {
  const hasNegative = (tasteTags ?? []).some(t => isNegative(t));
  if (hasNegative) return 'NEED IMPROVE';
  return tdsVerdict(tds, min, max) === 'IDEAL' ? 'IDEAL' : 'NEED IMPROVE';
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
  const [logGrind, setLogGrind] = useState(currentGrindSize > 0 ? String(currentGrindSize) : '');
  const [logTDS, setLogTDS] = useState(String(currentTDS));
  const [logEY, setLogEY] = useState('');
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logNotes, setLogNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTDS, setEditTDS] = useState('');
  const [editEY, setEditEY] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }, [entries]);

  const toggleLogTag = useCallback((tag: string) => {
    setLogTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);

  const toggleEditTag = useCallback((tag: string) => {
    setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);

  const addEntry = useCallback(() => {
    const tds = parseFloat(logTDS);
    if (isNaN(tds)) return;
    const ey = parseFloat(logEY) || 0;
    const entry: AttemptEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      grindSize: parseFloat(logGrind) || currentGrindSize || 0,
      doseWeight: currentDose,
      brewRatio: currentRatio,
      totalWater: currentTotalWater,
      tdsActual: tds,
      tdsMin,
      tdsMax,
      ey,
      tasteTags: [...logTags],
      notes: logNotes,
    };
    setEntries(prev => [entry, ...prev]);
    setLogEY('');
    setLogTags([]);
    setLogNotes('');
  }, [logGrind, logTDS, logEY, logTags, logNotes, currentGrindSize, currentDose, currentRatio, currentTotalWater, tdsMin, tdsMax]);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const startEdit = useCallback((e: AttemptEntry) => {
    setEditingId(e.id);
    setEditTDS(String(e.tdsActual));
    setEditEY(String(e.ey));
    setEditTags([...e.tasteTags]);
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
        tasteTags: [...editTags],
      };
    }));
    setEditingId(null);
  }, [editTDS, editEY, editTags]);

  const total = entries.length;
  const idealCount = entries.filter(e => overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags) === 'IDEAL').length;
  const successPct = total > 0 ? Math.round((idealCount / total) * 100) : 0;

  const handleLogTDSBlur = useCallback(() => {
    const v = parseFloat(logTDS);
    if (!isNaN(v)) setLogTDS(v.toFixed(2));
  }, [logTDS]);

  const renderTasteTag = useCallback((tag: string, small?: boolean) => {
    const color = isNegative(tag) ? '#f59e0b' : '#22d65e';
    return (
      <span key={tag}
        className={`inline-flex items-center rounded font-semibold uppercase tracking-wider ${small ? 'px-1 py-0.5 text-[7px]' : 'px-1.5 py-0.5 text-[9px]'}`}
        style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}30` }}
      >
        {tag}
      </span>
    );
  }, []);

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs px-1">
        <span className="text-slate-400 font-medium">Attempts <strong className="text-slate-700">{total}</strong></span>
        <span className="text-emerald-600 font-medium">Ideal <strong>{idealCount}</strong></span>
        <span className="text-amber-600 font-medium">Needs work <strong>{total - idealCount}</strong></span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-32">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${successPct}%` }} />
        </div>
        <span className={`font-bold tabular-nums ${successPct >= 60 ? 'text-emerald-600' : successPct >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{successPct}%</span>
      </div>

      {/* Log new attempt */}
      <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Grind #</label>
            <input type="number" step={0.1} value={logGrind}
              onChange={(e) => setLogGrind(e.target.value)}
              className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder={currentGrindSize > 0 ? `#${currentGrindSize}` : '#'}
            />
          </div>
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
          <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
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

        {/* Taste tag menu */}
        <div>
          <label className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1 block">Taste Profile</label>
          <div className="space-y-1">
            {TASTE_GROUPS.map(group => {
              const negTags = group.tags.filter(t => isNegative(t));
              const posTags = group.tags.filter(t => isPositive(t));
              if (negTags.length === 0 && posTags.length === 0) return null;
              return (
                <div key={group.label} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[8px] text-slate-300 font-semibold uppercase tracking-wider w-16 shrink-0">{group.label}</span>
                  {negTags.map(tag => (
                    <button key={tag} onClick={() => toggleLogTag(tag)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border transition-colors ${logTags.includes(tag) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600'}`}
                    >
                      {tag}
                    </button>
                  ))}
                  {posTags.map(tag => (
                    <button key={tag} onClick={() => toggleLogTag(tag)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border transition-colors ${logTags.includes(tag) ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-400 border-slate-200 hover:border-emerald-200 hover:text-emerald-600'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Log table */}
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 italic px-1">No attempts logged yet. Brew, measure your TDS, mark the taste, and log it.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {entries.map((e) => {
            const tv = tdsVerdict(e.tdsActual, e.tdsMin, e.tdsMax);
            const ov = overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags);
            const d = delta(e.tdsActual, e.tdsMin, e.tdsMax);
            const tvColor = tv === 'UNDER' ? '#38bdf8' : tv === 'OVER' ? '#ef4444' : '#22d65e';
            const isIdeal = ov === 'IDEAL';
            const isEditing = editingId === e.id;
            return (
              <div key={e.id}
                className={`rounded-lg px-3 py-2 border transition-colors ${isIdeal ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}
              >
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {/* Grind # — large */}
                  <span className="text-slate-700 font-bold text-sm w-12 tabular-nums">#{e.grindSize > 0 ? e.grindSize : '—'}</span>

                  {/* Dose + ratio */}
                  <span className="text-slate-400 tabular-nums">{e.doseWeight.toFixed(1)}g</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400 tabular-nums">1:{e.brewRatio.toFixed(0)}</span>

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS actual */}
                  {isEditing ? (
                    <input type="number" step={0.01} value={editTDS}
                      onChange={(ee) => setEditTDS(ee.target.value)}
                      className="w-14 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                      autoFocus
                      onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); if (ee.key === 'Escape') setEditingId(null); }}
                    />
                  ) : (
                    <span className="font-bold tabular-nums" style={{ color: tvColor }}>{e.tdsActual.toFixed(2)}</span>
                  )}

                  {/* Delta */}
                  <span className="tabular-nums text-slate-400 text-[10px]">{d > 0 ? '+' : ''}{d.toFixed(2)}</span>

                  {/* EY */}
                  {isEditing ? (
                    <input type="number" step={0.1} value={editEY}
                      onChange={(ee) => setEditEY(ee.target.value)}
                      className="w-12 px-1 py-0.5 text-xs border border-emerald-300 rounded text-center bg-white"
                      onKeyDown={(ee) => { if (ee.key === 'Enter') saveEdit(e.id); }}
                    />
                  ) : (
                    <span className="tabular-nums text-slate-500">{e.ey > 0 ? `${e.ey.toFixed(1)}%` : '—'}</span>
                  )}

                  <span className="text-slate-200 mx-0.5">|</span>

                  {/* TDS verdict badge */}
                  <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                    style={{ color: tvColor, backgroundColor: `${tvColor}15`, border: `1px solid ${tvColor}28` }}
                  >
                    {tv}
                  </span>

                  {/* Overall verdict */}
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${isIdeal ? 'text-emerald-700 bg-emerald-100 border border-emerald-300' : 'text-amber-700 bg-amber-100 border border-amber-300'}`}>
                    {isIdeal ? 'OK' : 'NEED IMPROVE'}
                  </span>

                  {/* Taste tags */}
                  {!isEditing && e.tasteTags.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {e.tasteTags.map(t => renderTasteTag(t, true))}
                    </div>
                  )}

                  {/* Edit taste tags */}
                  {isEditing && (
                    <div className="flex flex-wrap gap-0.5">
                      {ALL_TASTE_TAGS.map(tag => (
                        <button key={tag} onClick={() => toggleEditTag(tag)}
                          className={`px-1 py-0.5 rounded text-[7px] font-semibold uppercase tracking-wider border ${editTags.includes(tag) ? (isNegative(tag) ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300') : 'bg-white text-slate-300 border-slate-200'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Date */}
                  <span className="ml-auto text-[8px] text-slate-400 whitespace-nowrap">{e.date}</span>

                  {/* Actions */}
                  {isEditing ? (
                    <button onClick={() => saveEdit(e.id)} className="text-emerald-600 hover:text-emerald-800 font-bold px-1 text-xs">✓</button>
                  ) : (
                    <button onClick={() => startEdit(e)} className="text-slate-300 hover:text-slate-500 px-1 text-xs">✎</button>
                  )}
                  <button onClick={() => deleteEntry(e.id)} className="text-red-200 hover:text-red-500 font-bold px-0.5 text-xs">×</button>
                </div>

                {/* Notes row */}
                {e.notes && !isEditing && (
                  <div className="text-[9px] text-slate-400 mt-1 ml-14">{e.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sweet spot summary */}
      {entries.length >= 2 && (() => {
        const good = entries.filter(e => overallVerdict(e.tdsActual, e.tdsMin, e.tdsMax, e.tasteTags) === 'IDEAL' && e.grindSize > 0);
        const sweetGinds = [...new Set(good.map(e => e.grindSize))].sort((a, b) => a - b);
        return sweetGinds.length > 0 ? (
          <div className="text-[10px] text-slate-400 px-1 pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-emerald-600 font-semibold">Sweet spot</span>
            <span className="text-slate-400">:</span>
            {sweetGinds.map(g => (
              <span key={g} className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[9px] tabular-nums">#{g}</span>
            ))}
          </div>
        ) : null;
      })()}

      {/* Common issue patterns */}
      {entries.length >= 3 && (() => {
        const tagCounts: Record<string, number> = {};
        entries.forEach(e => e.tasteTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
        const topIssues = Object.entries(tagCounts)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4);
        return topIssues.length > 0 ? (
          <div className="text-[10px] text-slate-400 px-1 pt-1 flex items-center gap-2 flex-wrap">
            <span className="text-amber-600 font-semibold">Recurring</span>
            <span className="text-slate-400">:</span>
            {topIssues.map(([tag, count]) => (
              <span key={tag} className="text-amber-700 text-[9px]">
                {tag} <strong className="text-amber-500">×{count}</strong>
              </span>
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}
