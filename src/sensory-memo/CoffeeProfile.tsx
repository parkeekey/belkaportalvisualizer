import { useState, useMemo, useEffect } from 'react';
import { FLAVORS } from './flavors';
import { loadCustomFlavors } from './customFlavors';
import {
  TASTE_LABELS,
  type CoffeeProfile, type FlavorEntry, type AggregateAnalysis,
} from './types';

const PROFILES_KEY = 'belka.coffeeProfiles';

function loadProfiles(): CoffeeProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveProfiles(p: CoffeeProfile[]) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function generateId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// Compute aggregate analysis from selected flavor IDs
function computeAnalysis(flavorIds: string[], allFlavors: FlavorEntry[]): AggregateAnalysis | null {
  const selected = allFlavors.filter(f => flavorIds.includes(f.id));
  if (selected.length === 0) return null;

  const totalTaste = { sour: 0, sweet: 0, bitter: 0, salty: 0, umami: 0 };
  let wcrCount = 0, customCount = 0;

  for (const f of selected) {
    totalTaste.sour += f.taste.sour;
    totalTaste.sweet += f.taste.sweet;
    totalTaste.bitter += f.taste.bitter;
    totalTaste.salty += f.taste.salty;
    totalTaste.umami += f.taste.umami;
    if (f.id.startsWith('custom_')) customCount++;
    else if ('wcr_ref' in f && f.wcr_ref) wcrCount++;
  }

  const n = selected.length;
  const avgTaste = {
    sour: Math.round((totalTaste.sour / n) * 10) / 10,
    sweet: Math.round((totalTaste.sweet / n) * 10) / 10,
    bitter: Math.round((totalTaste.bitter / n) * 10) / 10,
    salty: Math.round((totalTaste.salty / n) * 10) / 10,
    umami: Math.round((totalTaste.umami / n) * 10) / 10,
  };

  // Determine dominant sensory dimension
  const bright = avgTaste.sour + avgTaste.sweet;
  const deep = avgTaste.bitter + avgTaste.umami;
  const total = bright + deep + avgTaste.salty;
  const brightPct = total > 0 ? (bright / total) * 100 : 50;
  const deepPct = total > 0 ? (deep / total) * 100 : 50;

  let dimension: AggregateAnalysis['dimension'];
  let dimensionReason: string;

  if (brightPct > 65) {
    dimension = 'aroma';
    dimensionReason = 'Bright, fruity, and sweet notes dominate — expect the coffee to express primarily through aroma. Floral, citrus, and berry character will be most noticeable in the dry fragrance and wet aroma.';
  } else if (deepPct > 65) {
    dimension = 'mouthfeel';
    dimensionReason = 'Deep, bitter, and savory notes dominate — expect the coffee to express primarily through mouthfeel and body. Chocolate, roasted, and earthy character will be felt on the palate.';
  } else if (brightPct > 45 && brightPct < 55) {
    dimension = 'balanced';
    dimensionReason = 'Bright and deep notes are well-balanced — the coffee expresses equally through aroma, flavor, and mouthfeel. A versatile profile suitable for a wide range of brew methods.';
  } else {
    dimension = 'flavor';
    dimensionReason = 'A balanced mix of bright and deep notes — expect the coffee to express primarily through flavor (retronasal perception). The mid-palate will carry the most character.';
  }

  // Possibility score (heuristic)
  let score = 70;
  if (wcrCount > 0) score += 10;
  if (avgTaste.sour > 3 || avgTaste.sweet > 3) score += 5;
  if (n >= 3) score += 5;
  if (n <= 1) score -= 10;
  score = Math.max(30, Math.min(95, score));

  return {
    totalTaste, avgTaste, dimension, dimensionReason,
    possibilityScore: score,
    selectedCount: n, wcrCount, customCount,
  };
}

// ── Flavor Selector sub-component ──
function FlavorSelector({
  selected, onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const customFlavors = loadCustomFlavors();
  const allFlavors = useMemo(() => [...customFlavors, ...FLAVORS], [customFlavors]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allFlavors.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, allFlavors]);

  return (
    <div className="relative">
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search flavors to add..."
        className="w-full px-2 py-1.5 text-[10px] border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
      />
      {results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(f => {
            const isSelected = selected.includes(f.id);
            return (
              <button key={f.id} onClick={() => onToggle(f.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 transition-colors ${isSelected ? 'bg-violet-50' : ''}`}
              >
                <span className={`text-[8px] w-3 ${isSelected ? 'text-violet-500' : 'text-slate-300'}`}>
                  {isSelected ? '✓' : '+'}
                </span>
                <span className="text-sm">{f.emoji}</span>
                <span className="text-[10px] font-medium text-slate-700">{f.label}</span>
                {'wcr_ref' in f && f.wcr_ref && <span className="text-[6px] text-slate-400 bg-slate-100 px-1 rounded ml-auto">WCR</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Taste bars (mini) ──
function MiniTasteBars({ taste }: { taste: { sour: number; sweet: number; bitter: number; salty: number; umami: number } }) {
  return (
    <div className="flex items-center gap-2">
      {TASTE_LABELS.filter(t => taste[t.key] > 0).map(t => (
        <div key={t.key} className="flex items-center gap-0.5">
          <span className="text-[6px] text-slate-400">{t.label[0]}</span>
          <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(taste[t.key] / 5) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──
export default function CoffeeProfilePage({ onClose }: { onClose?: () => void }) {
  const [profiles, setProfiles] = useState<CoffeeProfile[]>(loadProfiles);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoaster, setEditRoaster] = useState('');
  const [editOrigin, setEditOrigin] = useState('');
  const [editProcess, setEditProcess] = useState('');
  const [editRoast, setEditRoast] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editFlavors, setEditFlavors] = useState<string[]>([]);

  useEffect(() => { saveProfiles(profiles); }, [profiles]);

  const activeProfile = useMemo(() => profiles.find(p => p.id === activeId) ?? null, [profiles, activeId]);

  const customFlavors = loadCustomFlavors();
  const allFlavors = useMemo(() => [...customFlavors, ...FLAVORS], [customFlavors]);

  const analysis = useMemo(() => computeAnalysis(editFlavors, allFlavors), [editFlavors, allFlavors]);

  // Load active profile into edit state
  useEffect(() => {
    if (activeProfile) {
      setEditName(activeProfile.name);
      setEditRoaster(activeProfile.roaster ?? '');
      setEditOrigin(activeProfile.origin ?? '');
      setEditProcess(activeProfile.process ?? '');
      setEditRoast(activeProfile.roastLevel ?? '');
      setEditNotes(activeProfile.notes ?? '');
      setEditFlavors(activeProfile.flavorIds);
    } else {
      setEditName('');
      setEditRoaster('');
      setEditOrigin('');
      setEditProcess('');
      setEditRoast('');
      setEditNotes('');
      setEditFlavors([]);
    }
  }, [activeProfile]);

  const handleNew = () => {
    const id = generateId();
    setProfiles(prev => [...prev, {
      id, name: 'Untitled coffee', flavorIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }]);
    setActiveId(id);
  };

  const handleSave = () => {
    if (!activeId) return;
    setProfiles(prev => prev.map(p =>
      p.id === activeId ? {
        ...p,
        name: editName.trim() || 'Untitled coffee',
        roaster: editRoaster.trim() || undefined,
        origin: editOrigin.trim() || undefined,
        process: editProcess.trim() || undefined,
        roastLevel: editRoast.trim() || undefined,
        notes: editNotes.trim() || undefined,
        flavorIds: editFlavors,
        updatedAt: new Date().toISOString(),
      } : p
    ));
  };

  const handleDelete = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const toggleFlavor = (id: string) => {
    setEditFlavors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const removeFlavor = (id: string) => {
    setEditFlavors(prev => prev.filter(x => x !== id));
  };

  const selectedFlavors = allFlavors.filter(f => editFlavors.includes(f.id));

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">☕</span>
          <span className="text-sm font-bold text-slate-700">Coffee Profiles</span>
          <span className="text-[8px] text-slate-400">{profiles.length} saved</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleNew}
            className="text-[9px] font-semibold px-2 py-1 rounded border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
          >+ New</button>
          {onClose && (
            <button onClick={onClose}
              className="text-[9px] text-slate-400 hover:text-slate-600 underline decoration-dotted"
            >✕ Close</button>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {/* Profile list — sidebar */}
        <div className="w-36 shrink-0 space-y-1">
          {profiles.length === 0 && (
            <div className="text-[8px] text-slate-400 italic py-2 text-center">No profiles yet</div>
          )}
          {profiles.map(p => (
            <div key={p.id} className={`rounded-lg border overflow-hidden ${activeId === p.id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}>
              <button onClick={() => setActiveId(p.id)}
                className="w-full text-left px-2 py-1.5"
              >
                <div className="text-[9px] font-semibold text-slate-700 truncate">{p.name}</div>
                <div className="text-[7px] text-slate-400 truncate">{p.flavorIds.length} flavors</div>
              </button>
              <button onClick={() => handleDelete(p.id)}
                className="w-full text-[7px] text-red-300 hover:text-red-500 text-center pb-1"
              >Delete</button>
            </div>
          ))}
        </div>

        {/* Active profile editor */}
        <div className="flex-1">
          {!activeId ? (
            <div className="text-center py-12 text-[9px] text-slate-400">
              Select a profile or create a new one
            </div>
          ) : (
            <div className="space-y-3">
              {/* Profile fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[7px] text-slate-400 uppercase font-semibold">Name</span>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <span className="text-[7px] text-slate-400 uppercase font-semibold">Roaster</span>
                  <input value={editRoaster} onChange={e => setEditRoaster(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <span className="text-[7px] text-slate-400 uppercase font-semibold">Origin</span>
                  <input value={editOrigin} onChange={e => setEditOrigin(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[7px] text-slate-400 uppercase font-semibold">Process</span>
                    <input value={editProcess} onChange={e => setEditProcess(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <span className="text-[7px] text-slate-400 uppercase font-semibold">Roast</span>
                    <input value={editRoast} onChange={e => setEditRoast(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                </div>
              </div>

              {/* Flavor selector */}
              <div>
                <span className="text-[7px] text-slate-400 uppercase font-semibold">Flavors from bag notes</span>
                <div className="mt-1">
                  <FlavorSelector selected={editFlavors} onToggle={toggleFlavor} />
                </div>
                {selectedFlavors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedFlavors.map(f => (
                      <div key={f.id} className="flex items-center gap-1 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                        <span className="text-xs">{f.emoji}</span>
                        <span className="text-[8px] font-medium text-violet-700">{f.label}</span>
                        <button onClick={() => removeFlavor(f.id)}
                          className="text-[7px] text-violet-400 hover:text-red-500"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected flavor details */}
              {selectedFlavors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[7px] text-slate-400 uppercase font-semibold">Selected flavor profiles</span>
                  <div className="space-y-1">
                    {selectedFlavors.map(f => (
                      <div key={f.id} className="bg-white border border-slate-200 rounded-lg p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{f.emoji}</span>
                          <span className="text-[9px] font-semibold text-slate-700">{f.label}</span>
                          {'wcr_ref' in f && f.wcr_ref && <span className="text-[6px] text-slate-400 bg-slate-100 px-1 rounded">WCR</span>}
                          <span className="text-[7px] text-slate-300 ml-auto capitalize">{f.family}</span>
                        </div>
                        <MiniTasteBars taste={f.taste} />
                        <p className="text-[7px] text-slate-500 mt-1 leading-relaxed">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aggregate analysis */}
              {analysis && selectedFlavors.length > 0 && (
                <div className="bg-gradient-to-br from-violet-50 to-white border border-violet-200 rounded-lg p-3">
                  <div className="text-[9px] font-bold text-violet-700 mb-2">Aggregate analysis</div>

                  {/* Combined taste profile */}
                  <div className="mb-2">
                    <span className="text-[7px] text-slate-400 uppercase font-semibold">Average taste composition</span>
                    <div className="mt-1">
                      <MiniTasteBars taste={analysis.avgTaste} />
                    </div>
                    <div className="flex gap-2 mt-1 text-[7px] text-slate-400">
                      {TASTE_LABELS.filter(t => analysis.avgTaste[t.key] > 0).map(t => (
                        <span key={t.key}>{t.label}: <strong className="text-slate-600">{analysis.avgTaste[t.key].toFixed(1)}</strong></span>
                      ))}
                    </div>
                  </div>

                  {/* Dimension prediction */}
                  <div className="mb-2">
                    <span className="text-[7px] text-slate-400 uppercase font-semibold">Predicted expression</span>
                    <div className={`text-[10px] font-bold mt-0.5 ${
                      analysis.dimension === 'aroma' ? 'text-pink-600' :
                      analysis.dimension === 'mouthfeel' ? 'text-orange-600' :
                      analysis.dimension === 'balanced' ? 'text-emerald-600' :
                      'text-violet-600'
                    }`}>
                      {analysis.dimension === 'aroma' ? '🌸 Aroma-forward' :
                       analysis.dimension === 'mouthfeel' ? '🔥 Mouthfeel-forward' :
                       analysis.dimension === 'balanced' ? '⚖️ Balanced expression' :
                       '👅 Flavor-forward'}
                    </div>
                    <p className="text-[8px] text-slate-500 mt-0.5 leading-relaxed">{analysis.dimensionReason}</p>
                  </div>

                  {/* Possibility score */}
                  <div>
                    <span className="text-[7px] text-slate-400 uppercase font-semibold">Possibility of finding these notes</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          analysis.possibilityScore >= 80 ? 'bg-emerald-400' :
                          analysis.possibilityScore >= 60 ? 'bg-amber-400' :
                          'bg-red-400'
                        }`} style={{ width: `${analysis.possibilityScore}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-600">{analysis.possibilityScore}%</span>
                    </div>
                    <div className="text-[7px] text-slate-400 mt-0.5">
                      {analysis.selectedCount} flavors · {analysis.wcrCount} WCR-validated · {analysis.customCount} custom
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <span className="text-[7px] text-slate-400 uppercase font-semibold">Personal notes</span>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Your tasting impressions, brew notes, etc."
                  className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
                />
              </div>

              {/* Save button */}
              <button onClick={handleSave}
                className="w-full py-1.5 text-[10px] font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >Save profile</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
