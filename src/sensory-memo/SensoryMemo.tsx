import { useState, useMemo, useEffect } from 'react';
import { FLAVORS } from './flavors';
import { BIG_CATEGORIES, BIG_SUBGROUP_LABEL, TASTE_LABELS, type BigAromaCategory, type BigAromaSubgroup, type AromaFamily, type TasteProfile, type FlavorEntry, type CustomFlavorEntry, type SessionState, type SensoryProfile } from './types';
import { loadCustomFlavors, saveCustomFlavors, createCustomFlavor, deleteCustomFlavor } from './customFlavors';
import FlavorEditor from './FlavorEditor';
import CoffeeOriginSelect from '../components/CoffeeOriginSelect';

const SESSION_KEY = 'belka.sensorySession';
const SENSORY_PROFILES_KEY = 'belka.sensoryProfiles';

function loadSensoryProfiles(): SensoryProfile[] {
  try { const raw = localStorage.getItem(SENSORY_PROFILES_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return [];
}

function saveSensoryProfiles(ps: SensoryProfile[]) {
  try { localStorage.setItem(SENSORY_PROFILES_KEY, JSON.stringify(ps)); } catch { /* ignore */ }
}

function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.active === false) s.active = true; // always active now
      return s;
    }
  } catch { /* ignore */ }
  return { active: true, entries: {}, notes: '' };
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
            <span className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-7 text-right">{t.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(val / 5) * 100}%` }} />
            </div>
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-3 text-right">{val}</span>
          </div>
        );
      })}
      {Object.values(taste).every(v => v === 0) && (
        <span className="text-[7px] text-slate-300 dark:text-slate-600 dark:text-slate-600 italic">No dominant taste</span>
      )}
    </div>
  );
}

// ── Flavor card ──
function FlavorCard({
  flavor, checked, intensity, onToggleCheck, onIntensity, onEdit, onDelete,
}: {
  flavor: FlavorEntry;
  checked: boolean;
  intensity: number;
  onToggleCheck: (id: string) => void;
  onIntensity: (id: string, v: number) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const isCustom = flavor.id.startsWith('custom_');
  const [expanded, setExpanded] = useState(false);

  const similarLabel = useMemo(() => {
    if (!isCustom || !('similarTo' in flavor) || !flavor.similarTo) return null;
    const all = [...loadCustomFlavors(), ...FLAVORS];
    return all.find(f => f.id === flavor.similarTo)?.label ?? null;
  }, [flavor]);

  return (
    <div className={`rounded-lg border ${checked ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 dark:bg-slate-800'} p-2`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={checked}
          onChange={() => onToggleCheck(flavor.id)}
          className="mt-0.5 accent-violet-600"
        />
        <button onClick={() => setExpanded(v => !v)} className="flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{flavor.emoji}</span>
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-300">{flavor.label}</span>
            {flavor.wcr_ref && (
              <span className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 bg-slate-100 px-1 rounded">WCR</span>
            )}
            {similarLabel && (
              <span className="text-[6px] text-violet-400 bg-violet-50 px-1 rounded">↔ {similarLabel}</span>
            )}
            {flavor.subgroup && (
              <span className="text-[6px] text-slate-300 dark:text-slate-600 dark:text-slate-600 italic capitalize">{flavor.subgroup}</span>
            )}
          </div>
            {expanded && (
            <div className="mt-1.5 pl-0.5 space-y-1">
              <TasteBars taste={flavor.taste} />
              <p className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-relaxed">{flavor.description}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {flavor.wcr_category && (
                  <span className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 bg-slate-100 px-1 rounded">{flavor.wcr_category}</span>
                )}
                <span className="text-[6px] px-1 rounded text-white"
                  style={{ backgroundColor: BIG_CATEGORIES.find(c => c.key === flavor.bigCategory)?.color ?? '#999' }}
                >{BIG_CATEGORIES.find(c => c.key === flavor.bigCategory)?.label}</span>
              </div>
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
            className="text-[8px] text-slate-300 dark:text-slate-600 dark:text-slate-600 hover:text-slate-500 dark:text-slate-400 dark:text-slate-400"
          >{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      {checked && (
        <div className="flex items-center gap-2 mt-1.5 pl-0.5">
          <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">Intensity:</span>
          <input type="range" min={1} max={5} value={intensity}
            onChange={e => onIntensity(flavor.id, parseInt(e.target.value))}
            className="flex-1 h-1 accent-violet-500"
          />
          <span className="text-[9px] font-bold text-violet-600 w-3 text-right">{intensity}</span>
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
  const [smellLean, setSmellLean] = useState(50); // 0 = pure sour, 50 = balanced, 100 = pure sweet
  const [smellLeanEnabled, setSmellLeanEnabled] = useState(false);
  const [saveProfileOpen, setSaveProfileOpen] = useState(false);
  const [sensoryProfileName, setSensoryProfileName] = useState('');
  const [spCoffeeName, setSpCoffeeName] = useState('');
  const [spRoaster, setSpRoaster] = useState('');
  const [spOrigin, setSpOrigin] = useState('');
  const [spProcess, setSpProcess] = useState('');
  const [spRoast, setSpRoast] = useState('');
  const [spRoastValue, setSpRoastValue] = useState(50);
  const roastLabel = useMemo(() => {
    return spRoastValue <= 16 ? 'Nordic' : spRoastValue <= 33 ? 'Light' : spRoastValue <= 50 ? 'Light-Medium' : spRoastValue <= 66 ? 'Medium' : spRoastValue <= 83 ? 'Medium-Dark' : 'Dark';
  }, [spRoastValue]);
  const handleRoastChange = (v: number) => {
    setSpRoastValue(v);
    setSpRoast(v <= 16 ? 'Nordic' : v <= 33 ? 'Light' : v <= 50 ? 'Light-Medium' : v <= 66 ? 'Medium' : v <= 83 ? 'Medium-Dark' : 'Dark');
    // Darker roast → lean toward sour (lower smell lean)
    setSmellLean(Math.round(80 - v * 0.6));
    setSmellLeanEnabled(true);
  };
  const [sensoryProfiles, setSensoryProfiles] = useState<SensoryProfile[]>(loadSensoryProfiles);
  const [showSensorySetupPicker, setShowSensorySetupPicker] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [showProfileList, setShowProfileList] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const beanProfiles = useMemo<Record<string, { coffeeName: string; roastery: string; origin: string; process: string; roastLevel: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('belkaBeanProfiles') || '{}'); } catch { return {}; }
  }, []);

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
    updateSession(() => ({ active: true, entries: {}, notes: '' }));
    setEditingProfileId(null);
  };

  const handleEditFlavor = (id: string) => {
    const f = customFlavors.find(c => c.id === id);
    if (f) { setEditingFlavor(f); setShowEditor(true); }
  };

  const handleDeleteFlavor = (id: string) => {
    setCustomFlavors(prev => deleteCustomFlavor(prev, id));
  };

  const handleSaveCustom = (data: { label: string; emoji: string; family: AromaFamily; bigCategory: BigAromaCategory; bigSubgroup: BigAromaSubgroup; taste: TasteProfile; description: string; subgroup?: string; similarTo?: string }) => {
    if (editingFlavor) {
      setCustomFlavors(prev => prev.map(f =>
        f.id === editingFlavor.id ? { ...f, ...data, updatedAt: new Date().toISOString() } : f
      ));
    } else {
      setCustomFlavors(prev => [...prev, createCustomFlavor(data.label, data.emoji, data.family, data.bigCategory, data.bigSubgroup, data.taste, data.description, 'user', data.subgroup, data.similarTo)]);
    }
    setShowEditor(false);
    setEditingFlavor(undefined);
  };

  const loadSensoryProfile = (profile: SensoryProfile) => {
    updateSession(s => ({
      ...s,
      entries: { ...profile.checkedFlavors },
    }));
    setSensoryProfileName(profile.name);
    setSpCoffeeName(profile.coffeeName || '');
    setSpRoaster(profile.roaster || '');
    setSpOrigin(profile.origin || '');
    setSpProcess(profile.process || '');
    if (profile.roastLevel) {
      const labelToValue: Record<string, number> = { 'Nordic': 8, 'Light': 25, 'Light-Medium': 42, 'Medium': 58, 'Medium-Dark': 75, 'Dark': 92 };
      const v = labelToValue[profile.roastLevel] ?? 50;
      handleRoastChange(v);
    }
    setEditingProfileId(profile.id);
    setShowProfileList(false);
    setSaveProfileOpen(true);
  };

  const deleteSensoryProfile = (id: string) => {
    const updated = sensoryProfiles.filter(p => p.id !== id);
    setSensoryProfiles(updated);
    saveSensoryProfiles(updated);
  };

  const handleSaveSensoryProfile = () => {
    const checkedEntries: Record<string, { checked: boolean; intensity: number; notes: string }> = {};
    for (const [id, entry] of Object.entries(session.entries)) {
      if (entry.checked) checkedEntries[id] = entry;
    }
    const now = new Date().toISOString();
    if (editingProfileId) {
      const updated = sensoryProfiles.map(p => p.id === editingProfileId ? {
        ...p,
        name: sensoryProfileName.trim() || p.name,
        coffeeName: spCoffeeName.trim() || p.coffeeName,
        roaster: spRoaster.trim() || p.roaster,
        origin: spOrigin.trim() || p.origin,
        process: spProcess.trim() || p.process,
        roastLevel: spRoast.trim() || p.roastLevel,
        checkedFlavors: checkedEntries,
        createdAt: p.createdAt,
      } : p);
      setSensoryProfiles(updated);
      saveSensoryProfiles(updated);
    } else {
      const profile: SensoryProfile = {
        id: `sensory_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: sensoryProfileName.trim() || `Sensory ${new Date().toLocaleDateString()}`,
        coffeeName: spCoffeeName.trim() || undefined,
        roaster: spRoaster.trim() || undefined,
        origin: spOrigin.trim() || undefined,
        process: spProcess.trim() || undefined,
        roastLevel: spRoast.trim() || undefined,
        checkedFlavors: checkedEntries,
        createdAt: now,
      };
      const updated = [...sensoryProfiles, profile];
      setSensoryProfiles(updated);
      saveSensoryProfiles(updated);
    }
    setEditingProfileId(null);
    setSaveProfileOpen(false);
    setSaveConfirm(true);
    setTimeout(() => setSaveConfirm(false), 2500);
  };

  const loadBeanProfileToForm = (bp: { coffeeName: string; roastery: string; origin: string; process: string; roastLevel: number }) => {
    setSpCoffeeName(bp.coffeeName);
    setSpRoaster(bp.roastery);
    setSpOrigin(bp.origin);
    setSpProcess(bp.process);
    handleRoastChange(bp.roastLevel);
    setShowSensorySetupPicker(false);
  };

  const checkedCount = Object.values(session.entries).filter(e => e.checked).length;

  // Live analysis from checked flavors
  const checkedFlavorList = useMemo(() => {
    return allFlavors.filter(f => session.entries[f.id]?.checked);
  }, [allFlavors, session.entries]);

  const analysis = useMemo(() => {
    if (checkedFlavorList.length === 0) return null;
    const totalTaste = { sour: 0, sweet: 0, bitter: 0, salty: 0, umami: 0 };
    let wcrCount = 0, customCount = 0;
    const categoryCounts: Record<string, number> = {};
    const subgroupCounts: Record<string, number> = {};
    for (const f of checkedFlavorList) {
      totalTaste.sour += f.taste.sour;
      totalTaste.sweet += f.taste.sweet;
      totalTaste.bitter += f.taste.bitter;
      totalTaste.salty += f.taste.salty;
      totalTaste.umami += f.taste.umami;
      if (f.id.startsWith('custom_')) customCount++;
      else if ('wcr_ref' in f && f.wcr_ref) wcrCount++;
      categoryCounts[f.bigCategory] = (categoryCounts[f.bigCategory] || 0) + 1;
      const sgLabel = BIG_SUBGROUP_LABEL[f.bigSubgroup] || f.bigSubgroup;
      subgroupCounts[sgLabel] = (subgroupCounts[sgLabel] || 0) + 1;
    }
    const n = checkedFlavorList.length;
    const avgVibrancy = (totalTaste.sour + totalTaste.sweet) / n;
    const avgDepth = (totalTaste.bitter + totalTaste.umami) / n;
    const vibrancyScore = Math.min(100, Math.round((avgVibrancy / 5) * 100));
    const depthScore = Math.min(100, Math.round((avgDepth / 5) * 100));
    // Flavor pillar: balance between aroma and mouthfeel, plus complexity from diversity
    const flavorBalance = 100 - Math.abs(vibrancyScore - depthScore);
    const flavorComplexity = Math.min(checkedFlavorList.length * 5, 25);
    const flavorScore = Math.min(100, Math.round(flavorBalance * 0.75 + flavorComplexity));
    let possibilityScore = 70;
    if (wcrCount > 0) possibilityScore += 10;
    if (checkedFlavorList.length >= 3) possibilityScore += 10;
    if (checkedFlavorList.length <= 1) possibilityScore -= 15;
    possibilityScore = Math.max(25, Math.min(95, possibilityScore));
    const avgTaste = { sour: Math.round((totalTaste.sour / n) * 10) / 10, sweet: Math.round((totalTaste.sweet / n) * 10) / 10, bitter: Math.round((totalTaste.bitter / n) * 10) / 10, salty: Math.round((totalTaste.salty / n) * 10) / 10, umami: Math.round((totalTaste.umami / n) * 10) / 10 };
    return { totalTaste, avgTaste, n, wcrCount, customCount, categoryCounts, subgroupCounts, vibrancyScore, depthScore, flavorScore, possibilityScore };
  }, [checkedFlavorList]);

  // Smell lean filter: computes sour-sweet balance
  // score = sweet / (sour + sweet); 0 = pure sour, 1 = pure sweet
  const smellLeanFiltered = useMemo(() => {
    if (!smellLeanEnabled || smellLean === 50) return allFlavors; // off or neutral: show all
    const target = smellLean / 100;
    const tolerance = 0.18;
    return allFlavors.filter(f => {
      const total = f.taste.sour + f.taste.sweet;
      if (total === 0) return true; // no sour/sweet data: show always
      const score = f.taste.sweet / total;
      return Math.abs(score - target) <= tolerance;
    });
  }, [allFlavors, smellLean, smellLeanEnabled]);

  // Search across label, description, family, subgroup
  const filteredFlavors = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return smellLeanFiltered.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q) ||
      (f.subgroup && f.subgroup.toLowerCase().includes(q))
    );
  }, [searchQuery, smellLeanFiltered]);

  const hasSearch = filteredFlavors !== null && searchQuery.trim().length > 0;

  // Group by big category, then subgroup
  const flavorsByBigCategory = useMemo(() => {
    const catMap: Record<string, Record<string, FlavorEntry[]>> = {};
    for (const f of smellLeanFiltered) {
      const bc = f.bigCategory;
      const bs = f.bigSubgroup;
      if (!catMap[bc]) catMap[bc] = {};
      if (!catMap[bc][bs]) catMap[bc][bs] = [];
      catMap[bc][bs].push(f);
    }
    return catMap;
  }, [smellLeanFiltered]);

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Sensory Memo</span>
          <span className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{allFlavors.length} entries · {customFlavors.length} custom</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { setEditingFlavor(undefined); setShowEditor(true); }}
            className="text-[9px] font-semibold px-2 py-1 rounded border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
          >+ New flavor</button>
          <button onClick={() => setShowProfileList(v => !v)}
            className={`text-[9px] font-semibold px-2 py-1 rounded border transition-colors ${
              showProfileList
                ? 'bg-sky-100 border-sky-300 text-sky-700'
                : 'bg-white dark:bg-slate-800 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:border-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'
            }`}
          >📁 My Profiles</button>
          <button onClick={() => {
            if (!saveProfileOpen) {
              setEditingProfileId(null);
              setSensoryProfileName('');
              setSpCoffeeName('');
              setSpRoaster('');
              setSpOrigin('');
              setSpProcess('');
              setSpRoastValue(50);
              setSpRoast('');
            }
            setSaveProfileOpen(v => !v);
          }}
            className={`text-[9px] font-semibold px-2 py-1 rounded border transition-colors ${
              saveProfileOpen
                ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400'
                : 'bg-white dark:bg-slate-800 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:border-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'
            }`}
          >☕ New Profile</button>
          {onClose && (
            <button onClick={onClose}
              className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-400 underline decoration-dotted"
            >✕ Close</button>
          )}
        </div>
      </div>

      {/* Session info bar */}
      <div className="flex items-center justify-between mb-2 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] text-violet-700 shrink-0">
            <strong>{checkedCount}</strong> / {allFlavors.length} flavors tagged
          </span>
          {editingProfileId && (
            <span className="text-[7px] text-violet-500 bg-violet-100 rounded px-1.5 py-0.5 truncate max-w-32">
              📁 {sensoryProfileName}
            </span>
          )}
        </div>
        <button onClick={resetSession}
          className="text-[8px] text-violet-400 hover:text-violet-600 underline decoration-dotted"
        >Reset</button>
      </div>

      {/* Checked flavor chips */}
      {checkedCount > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {checkedFlavorList.map(f => (
            <div key={f.id} className="flex items-center gap-0.5 bg-violet-100 border border-violet-200 rounded px-1.5 py-0.5">
              <span className="text-[10px]">{f.emoji}</span>
              <span className="text-[7px] font-medium text-violet-700">{f.label}</span>
              <button onClick={() => toggleCheck(f.id)}
                className="text-[7px] text-violet-400 hover:text-red-500 dark:text-red-400 dark:text-red-400 pl-0.5"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Saved profiles list */}
      {showProfileList && (
        <div className="mb-2 bg-sky-50 border border-sky-200 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[8px] text-sky-700 font-semibold uppercase">Saved Profiles</span>
            <span className="text-[7px] text-sky-400">{sensoryProfiles.length} saved</span>
          </div>
          {sensoryProfiles.length === 0 ? (
            <div className="text-center py-3 text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500 italic">No saved profiles yet</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {[...sensoryProfiles].reverse().map(p => (
                <div key={p.id} className="flex items-center gap-1 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-sky-200 rounded px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-semibold text-sky-800 truncate">{p.name}</div>
                    <div className="flex gap-2 text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
                      <span>{p.coffeeName || '—'}</span>
                      <span>{Object.keys(p.checkedFlavors).length} flavors</span>
                      {p.process && <span>{p.process}</span>}
                    </div>
                  </div>
                  <button onClick={() => loadSensoryProfile(p)}
                    className="text-[7px] px-1.5 py-0.5 rounded font-bold text-sky-600 bg-sky-100 hover:bg-sky-200 transition-colors"
                  >Load</button>
                  <button onClick={() => deleteSensoryProfile(p.id)}
                    className="text-[7px] px-1.5 py-0.5 rounded font-bold text-red-400 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 dark:bg-red-900/20 dark:hover:bg-red-900/20 dark:bg-red-900/20 transition-colors"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Smell lean slider */}
      <div className="mb-2 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase">Smell lean</span>
            <button onClick={() => setSmellLeanEnabled(v => !v)}
              className={`text-[7px] px-1.5 py-0.5 rounded font-bold transition-colors ${
                smellLeanEnabled
                  ? 'bg-violet-100 text-violet-700 border border-violet-300'
                  : 'bg-slate-100 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700'
              }`}
            >{smellLeanEnabled ? 'ON' : 'OFF'}</button>
          </div>
          <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">
            {!smellLeanEnabled ? 'Filter off' : smellLean < 30 ? 'Sour ⬅' : smellLean > 70 ? '➡ Sweet' : 'Balanced'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-amber-500 font-bold">Sour</span>
          <input type="range" min={0} max={100} value={smellLean}
            onChange={e => setSmellLean(parseInt(e.target.value))}
            className="flex-1 h-1.5 accent-violet-500"
          />
          <span className="text-[8px] text-pink-500 font-bold">Sweet</span>
        </div>
        <div className="flex justify-between text-[6px] text-slate-300 dark:text-slate-600 dark:text-slate-600 mt-0.5">
          <span>Citrus, Berry, Winey</span>
          <span>Caramel, Chocolate, Nutty</span>
        </div>
      </div>

      {/* Save sensory profile */}
      {saveProfileOpen && (
        <div className="mb-2 bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 dark:border-emerald-800 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[8px] text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 font-semibold uppercase">New Sensory Profile</span>
            {saveConfirm && <span className="text-[8px] text-emerald-600 animate-pulse">✓ Saved!</span>}
          </div>
          <div className="space-y-1.5">
            <input value={sensoryProfileName} onChange={e => setSensoryProfileName(e.target.value)}
              placeholder="Profile name (e.g. 'Finca El Mirador tasting')"
              className="w-full px-2 py-1 text-[9px] border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-800 dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input value={spCoffeeName} onChange={e => setSpCoffeeName(e.target.value)}
                placeholder="Coffee name" className="w-full px-2 py-1 text-[9px] border border-slate-300 dark:border-slate-600 dark:border-slate-600 rounded font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-800 dark:bg-slate-800"
              />
              <input value={spRoaster} onChange={e => setSpRoaster(e.target.value)}
                placeholder="Roaster" className="w-full px-2 py-1 text-[9px] border border-slate-300 dark:border-slate-600 dark:border-slate-600 rounded font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-800 dark:bg-slate-800"
              />
              <CoffeeOriginSelect value={spOrigin} onChange={setSpOrigin} placeholder="Origin" size="sm" />
              <div className="col-span-2">
                <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase font-semibold">Process</span>
                <div className="flex gap-1 mt-0.5">
                  <button onClick={() => setSpProcess('')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${!spProcess ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Any</button>
                  <button onClick={() => setSpProcess('washed')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'washed' ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Washed</button>
                  <button onClick={() => setSpProcess('natural')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'natural' ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Natural</button>
                  <button onClick={() => setSpProcess('honey')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'honey' ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Honey</button>
                  <button onClick={() => setSpProcess('anaerobic')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'anaerobic' ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Anaerobic</button>
                  <button onClick={() => setSpProcess('lactic')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'lactic' ? 'bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Lactic</button>
                  <button onClick={() => setSpProcess('thermal-shock')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'thermal-shock' ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-700 border border-amber-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Thermal</button>
                </div>
                <div className="flex gap-1 mt-0.5">
                  <span className="text-[6px] text-slate-300 dark:text-slate-600 dark:text-slate-600 uppercase font-semibold self-center mr-1">Co-fermented</span>
                  <button onClick={() => setSpProcess('co-fermented')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'co-fermented' ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-700 border border-amber-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Co-Fermented</button>
                  <button onClick={() => setSpProcess('carbonic-maceration')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'carbonic-maceration' ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-700 border border-amber-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Carbonic Mac.</button>
                  <button onClick={() => setSpProcess('koji')}
                    className={`text-[7px] px-2 py-0.5 rounded font-bold transition-colors ${spProcess === 'koji' ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-700 border border-amber-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
                  >Koji</button>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">Roast level</span>
                  <span className="text-[7px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 dark:border-amber-800">{roastLabel}</span>
                </div>
                <input type="range" min={0} max={100} value={spRoastValue}
                  onChange={e => handleRoastChange(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-amber-600"
                />
                <div className="flex justify-between text-[6px] text-slate-300 dark:text-slate-600 dark:text-slate-600 mt-0.5">
                  <span>Nordic</span>
                  <span>Dark</span>
                </div>
              </div>
              <div className="relative">
                <button onClick={() => setShowSensorySetupPicker(v => !v)}
                  className="w-full px-2 py-1 text-[9px] border border-amber-300 rounded bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 text-amber-700 font-semibold hover:bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 transition-colors text-left"
                >📦 Load from Setup</button>
                {showSensorySetupPicker && (
                  <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg shadow-lg max-h-36 overflow-y-auto">
                    {Object.keys(beanProfiles).length === 0 && (
                      <div className="px-2 py-1.5 text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500 italic">No saved bean profiles</div>
                    )}
                    {Object.entries(beanProfiles).map(([key, bp]) => (
                      <button key={key} onClick={() => loadBeanProfileToForm(bp)}
                        className="w-full text-left px-2 py-1.5 text-[9px] text-slate-700 dark:text-slate-300 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 font-mono"
                      >{key} — {bp.coffeeName}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={handleSaveSensoryProfile}
              className="w-full py-1 text-[9px] font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors"
            >{editingProfileId ? 'Update profile' : 'Save profile'}</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 dark:text-slate-600 dark:text-slate-600">🔍</span>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search flavors by name, description, or family..."
          className="w-full pl-6 pr-2 py-1.5 text-[10px] border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white dark:bg-slate-800 dark:bg-slate-800"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 dark:text-slate-600 dark:text-slate-600 hover:text-slate-500 dark:text-slate-400 dark:text-slate-400"
          >✕</button>
        )}
      </div>

      {/* Live analysis */}
      {analysis && (
        <div className="mb-2 bg-gradient-to-br from-violet-50 to-white border border-violet-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[7px] text-violet-500 font-semibold uppercase tracking-wider">Sensory Composition</span>
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{analysis.n} flavors · {analysis.wcrCount} WCR · {analysis.customCount} custom</span>
          </div>

          {/* Average taste profile */}
          <div className="mb-2">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase font-semibold">Taste profile</span>
            <div className="flex flex-col gap-0.5 mt-1">
              {TASTE_LABELS.map(t => {
                const val = analysis.avgTaste[t.key];
                if (val === 0) return null;
                return (
                  <div key={t.key} className="flex items-center gap-1">
                    <span className="text-[6px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-6 text-right">{t.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(val / 5) * 100}%` }} />
                    </div>
                    <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 w-3 text-right">{val}</span>
                  </div>
                );
              })}
              {Object.values(analysis.avgTaste).every(v => v === 0) && (
                <span className="text-[7px] text-slate-300 dark:text-slate-600 dark:text-slate-600 italic">No dominant taste</span>
              )}
            </div>
          </div>

          {/* Big category breakdown */}
          <div className="mb-1.5">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase font-semibold">Aroma categories</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {BIG_CATEGORIES.map(cat => {
                const count = analysis.categoryCounts[cat.key] ?? 0;
                if (count === 0) return null;
                const pct = Math.round((count / analysis.n) * 100);
                return (
                  <div key={cat.key} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: cat.bgColor, borderColor: cat.borderColor, borderWidth: 1 }}>
                    <span className="text-[8px]" style={{ color: cat.color }}>●</span>
                    <span className={`text-[7px] font-semibold ${cat.textColor}`}>{cat.label}</span>
                    <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subgroup breakdown */}
          <div className="mb-1.5">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase font-semibold">Notes</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              {Object.entries(analysis.subgroupCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                <span key={label} className="text-[8px] text-slate-600 dark:text-slate-400 dark:text-slate-400">
                  {label} <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600">×{count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Taste vibrancy vs depth */}
          <div className="flex gap-3">
            <div className="flex-1">
              <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase">Vibrancy</span>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-pink-400" style={{ width: `${analysis.vibrancyScore}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase">Depth</span>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-orange-600" style={{ width: `${analysis.depthScore}%` }} />
              </div>
            </div>
          </div>

          {/* Three-pillar composition: Aroma / Flavor / Mouthfeel */}
          <div className="mt-2 mb-0.5">
            <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Three-pillar composition</span>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase">Aroma</span>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-rose-400" style={{ width: `${analysis.vibrancyScore}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase">Flavor</span>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${analysis.flavorScore}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-[6px] text-slate-400 dark:text-slate-500 uppercase">Mouthfeel</span>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-orange-600" style={{ width: `${analysis.depthScore}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results: flat list when searching, accordion when browsing */}
      {hasSearch ? (
        <div className="space-y-1.5">
          {filteredFlavors!.length === 0 ? (
            <div className="text-center py-6 text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">No flavors match "<strong className="text-slate-500 dark:text-slate-400 dark:text-slate-400">{searchQuery}</strong>"</div>
          ) : (
            filteredFlavors!.map(f => (
              <FlavorCard key={f.id} flavor={f}
                checked={session.entries[f.id]?.checked ?? false}
                intensity={session.entries[f.id]?.intensity ?? 3}
                onToggleCheck={toggleCheck} onIntensity={setIntensity}
                onEdit={handleEditFlavor} onDelete={handleDeleteFlavor}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {BIG_CATEGORIES.map(cat => {
            const groupMap = flavorsByBigCategory[cat.key];
            if (!groupMap || Object.values(groupMap).every(a => a.length === 0)) return null;
            const catChecked = Object.values(groupMap).flat().filter(e => session.entries[e.id]?.checked).length;
            const catTotal = Object.values(groupMap).flat().length;
            const isCollapsed = collapsedFamilies.has(cat.key);

            return (
              <div key={cat.key} className={`rounded-lg border ${cat.borderColor} ${cat.bgColor} overflow-hidden`}>
                <button onClick={() => toggleFamily(cat.key)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 transition-colors hover:opacity-80"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${cat.textColor}`}>{cat.label}</span>
                    <span className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{catTotal}</span>
                    {catChecked > 0 && (
                      <span className="text-[8px] text-violet-500 bg-violet-100 rounded px-1">{catChecked}</span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{isCollapsed ? '▶' : '▼'}</span>
                </button>
                {!isCollapsed && (
                  <div className="px-2.5 pb-2 space-y-2">
                    {cat.subgroups.map(sg => {
                      const entries = groupMap[sg.key] ?? [];
                      if (entries.length === 0) return null;
                      return (
                        <div key={sg.key}>
                          <div className="flex items-center gap-1 mb-1 mt-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sg.color }} />
                            <span className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">{sg.label}</span>
                            <span className="text-[7px] text-slate-300 dark:text-slate-600 dark:text-slate-600">{entries.length}</span>
                          </div>
                          <div className="space-y-1.5">
                            {entries.map(f => (
                              <FlavorCard key={f.id} flavor={f}
                                checked={session.entries[f.id]?.checked ?? false}
                                intensity={session.entries[f.id]?.intensity ?? 3}
                                onToggleCheck={toggleCheck} onIntensity={setIntensity}
                                onEdit={handleEditFlavor} onDelete={handleDeleteFlavor}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
