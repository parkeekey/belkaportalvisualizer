import { useState, useMemo, useEffect } from 'react';
import { FLAVORS } from './flavors';
import { AROMA_FAMILIES, TASTE_LABELS, type AromaFamily, type TasteProfile, type FlavorEntry, type CustomFlavorEntry, type SessionState } from './types';
import { loadCustomFlavors, saveCustomFlavors, createCustomFlavor, deleteCustomFlavor } from './customFlavors';
import FlavorEditor from './FlavorEditor';

const SESSION_KEY = 'belka.sensorySession';

function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { active: false, entries: {}, notes: '' };
}

function saveSession(s: SessionState) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── Taste bar visualization ──
function TasteBars({ taste }: { taste: FlavorEntry['taste'] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {TASTE_LABELS.map(t => {
        const val = taste[t.key];
        if (val === 0) return null;
        return (
          <div key={t.key} className="flex items-center gap-1">
            <span className="text-[6px] text-slate-400 w-7 text-right">{t.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(val / 5) * 100}%` }} />
            </div>
            <span className="text-[7px] text-slate-400 w-3 text-right">{val}</span>
          </div>
        );
      })}
      {Object.values(taste).every(v => v === 0) && (
        <span className="text-[7px] text-slate-300 italic">No dominant taste</span>
      )}
    </div>
  );
}

// ── Flavor card ──
function FlavorCard({
  flavor, session, onToggleCheck, onIntensity, onEdit, onDelete,
}: {
  flavor: FlavorEntry;
  session: SessionState;
  onToggleCheck: (id: string) => void;
  onIntensity: (id: string, v: number) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const isCustom = flavor.id.startsWith('custom_');
  const [expanded, setExpanded] = useState(false);
  const entry = session.entries[flavor.id];
  const checked = entry?.checked ?? false;

  return (
    <div className={`rounded-lg border ${checked ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200 bg-white'} p-2`}>
      <div className="flex items-start gap-2">
        {session.active && (
          <input type="checkbox" checked={checked}
            onChange={() => onToggleCheck(flavor.id)}
            className="mt-0.5 accent-violet-600"
          />
        )}
        <button onClick={() => setExpanded(v => !v)} className="flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{flavor.emoji}</span>
            <span className="text-[10px] font-semibold text-slate-700">{flavor.label}</span>
            {flavor.wcr_ref && (
              <span className="text-[6px] text-slate-400 bg-slate-100 px-1 rounded">WCR</span>
            )}
            {flavor.subgroup && (
              <span className="text-[6px] text-slate-300 italic capitalize">{flavor.subgroup}</span>
            )}
          </div>
          {expanded && (
            <div className="mt-1.5 pl-0.5 space-y-1">
              <TasteBars taste={flavor.taste} />
              <p className="text-[8px] text-slate-500 leading-relaxed">{flavor.description}</p>
              {flavor.wcr_category && (
                <span className="text-[6px] text-slate-400 bg-slate-100 px-1 rounded">{flavor.wcr_category}</span>
              )}
            </div>
          )}
        </button>
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {isCustom && (
            <div className="flex gap-1">
              <button onClick={() => onEdit?.(flavor.id)}
                className="text-[7px] text-violet-400 hover:text-violet-600"
              >✎</button>
              <button onClick={() => onDelete?.(flavor.id)}
                className="text-[7px] text-red-400 hover:text-red-600"
              >✕</button>
            </div>
          )}
          <button onClick={() => setExpanded(v => !v)}
            className="text-[8px] text-slate-300 hover:text-slate-500"
          >{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      {session.active && checked && (
        <div className="flex items-center gap-2 mt-1.5 pl-0.5">
          <span className="text-[7px] text-slate-400">Intensity:</span>
          <input type="range" min={1} max={5} value={entry?.intensity ?? 3}
            onChange={e => onIntensity(flavor.id, parseInt(e.target.value))}
            className="flex-1 h-1 accent-violet-500"
          />
          <span className="text-[9px] font-bold text-violet-600 w-3 text-right">{entry?.intensity ?? 3}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ──
export default function SensoryMemo({ onClose }: { onClose?: () => void }) {
  const [session, setSession] = useState<SessionState>(loadSession);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [customFlavors, setCustomFlavors] = useState<CustomFlavorEntry[]>(loadCustomFlavors);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFlavor, setEditingFlavor] = useState<CustomFlavorEntry | undefined>(undefined);

  useEffect(() => { saveCustomFlavors(customFlavors); }, [customFlavors]);

  // Merge WCR + custom flavors
  const allFlavors = useMemo(() => [...customFlavors, ...FLAVORS], [customFlavors]);

  const toggleFamily = (key: string) => {
    setCollapsedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const updateSession = (fn: (s: SessionState) => SessionState) => {
    setSession(prev => {
      const next = fn(prev);
      saveSession(next);
      return next;
    });
  };

  const toggleSession = () => {
    updateSession(s => ({ ...s, active: !s.active }));
    if (!session.active) setCollapsedFamilies(new Set());
  };

  const toggleCheck = (id: string) => {
    updateSession(s => {
      const e = s.entries[id];
      return {
        ...s,
        entries: {
          ...s.entries,
          [id]: e ? { ...e, checked: !e.checked } : { checked: true, intensity: 3, notes: '' },
        },
      };
    });
  };

  const setIntensity = (id: string, intensity: number) => {
    updateSession(s => ({
      ...s,
      entries: {
        ...s.entries,
        [id]: { ...s.entries[id] ?? { checked: true, intensity: 3, notes: '' }, intensity },
      },
    }));
  };

  const resetSession = () => {
    updateSession(() => ({ active: false, entries: {}, notes: '' }));
  };

  const handleEditFlavor = (id: string) => {
    const f = customFlavors.find(c => c.id === id);
    if (f) { setEditingFlavor(f); setShowEditor(true); }
  };

  const handleDeleteFlavor = (id: string) => {
    setCustomFlavors(prev => deleteCustomFlavor(prev, id));
  };

  const handleSaveCustom = (data: { label: string; emoji: string; family: AromaFamily; taste: TasteProfile; description: string; subgroup?: string }) => {
    if (editingFlavor) {
      setCustomFlavors(prev => prev.map(f =>
        f.id === editingFlavor.id ? { ...f, ...data, updatedAt: new Date().toISOString() } : f
      ));
    } else {
      setCustomFlavors(prev => [...prev, createCustomFlavor(data.label, data.emoji, data.family, data.taste, data.description, 'user', data.subgroup)]);
    }
    setShowEditor(false);
    setEditingFlavor(undefined);
  };

  const checkedCount = Object.values(session.entries).filter(e => e.checked).length;

  // Search across label, description, family, subgroup
  const filteredFlavors = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allFlavors.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q) ||
      (f.subgroup && f.subgroup.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const hasSearch = filteredFlavors !== null;

  const flavorsByFamily = useMemo(() => {
    const map: Record<string, FlavorEntry[]> = {};
    for (const f of allFlavors) {
      if (!map[f.family]) map[f.family] = [];
      map[f.family].push(f);
    }
    return map;
  }, [allFlavors]);

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span className="text-sm font-bold text-slate-700">Sensory Memo</span>
          <span className="text-[8px] text-slate-400">{allFlavors.length} entries · {customFlavors.length} custom</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { setEditingFlavor(undefined); setShowEditor(true); }}
            className="text-[9px] font-semibold px-2 py-1 rounded border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
          >+ New flavor</button>
          <button onClick={toggleSession}
            className={`text-[9px] font-semibold px-2 py-1 rounded border transition-colors ${
              session.active
                ? 'bg-violet-100 border-violet-300 text-violet-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {session.active ? '✓ Checklist ON' : '📋 Checklist'}
          </button>
          {onClose && (
            <button onClick={onClose}
              className="text-[9px] text-slate-400 hover:text-slate-600 underline decoration-dotted"
            >✕ Close</button>
          )}
        </div>
      </div>

      {/* Session info bar */}
      {session.active && (
        <div className="flex items-center justify-between mb-2 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
          <span className="text-[9px] text-violet-700">
            <strong>{checkedCount}</strong> / {allFlavors.length} flavors tagged
          </span>
          <button onClick={resetSession}
            className="text-[8px] text-violet-400 hover:text-violet-600 underline decoration-dotted"
          >Reset</button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-300">🔍</span>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search flavors by name, description, or family..."
          className="w-full pl-6 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 hover:text-slate-500"
          >✕</button>
        )}
      </div>

      {/* Results: flat list when searching, accordion when browsing */}
      {hasSearch ? (
        <div className="space-y-1.5">
          {filteredFlavors!.length === 0 ? (
            <div className="text-center py-6 text-[9px] text-slate-400">No flavors match "<strong className="text-slate-500">{searchQuery}</strong>"</div>
          ) : (
            filteredFlavors!.map(f => (
              <FlavorCard key={f.id} flavor={f} session={session}
                onToggleCheck={toggleCheck} onIntensity={setIntensity}
                onEdit={handleEditFlavor} onDelete={handleDeleteFlavor}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {AROMA_FAMILIES.map(fam => {
            const entries = flavorsByFamily[fam.key] ?? [];
            if (entries.length === 0) return null;
            const isCollapsed = collapsedFamilies.has(fam.key);
            const famChecked = entries.filter(e => session.entries[e.id]?.checked).length;

            return (
              <div key={fam.key} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button onClick={() => toggleFamily(fam.key)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{fam.emoji}</span>
                    <span className="text-[10px] font-semibold text-slate-600">{fam.label}</span>
                    {session.active && famChecked > 0 && (
                      <span className="text-[8px] text-violet-500 bg-violet-50 rounded px-1">{famChecked}</span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-300">{isCollapsed ? '▶' : '▼'}</span>
                </button>
                {!isCollapsed && (
                  <div className="px-2.5 pb-2 space-y-1.5">
                    {entries.map(f => (
                      <FlavorCard key={f.id} flavor={f} session={session}
                        onToggleCheck={toggleCheck} onIntensity={setIntensity}
                        onEdit={handleEditFlavor} onDelete={handleDeleteFlavor}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showEditor && (
        <FlavorEditor
          flavor={editingFlavor}
          onSave={handleSaveCustom}
          onClose={() => { setShowEditor(false); setEditingFlavor(undefined); }}
        />
      )}
    </div>
  );
}
