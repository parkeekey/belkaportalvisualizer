import { useState, useMemo } from 'react';
import { AROMA_FAMILIES, BIG_CATEGORIES, TASTE_LABELS, type AromaFamily, type TasteProfile, type CustomFlavorEntry, type BigAromaCategory, type BigAromaSubgroup, type FlavorEntry } from './types';
import { FLAVORS } from './flavors';
import { loadCustomFlavors } from './customFlavors';

interface Props {
  flavor?: CustomFlavorEntry;
  onSave: (data: { label: string; emoji: string; family: AromaFamily; bigCategory: BigAromaCategory; bigSubgroup: BigAromaSubgroup; taste: TasteProfile; description: string; subgroup?: string; similarTo?: string }) => void;
  onClose: () => void;
}

const DEFAULT_TASTE: TasteProfile = { sour: 0, sweet: 0, bitter: 0, salty: 0, umami: 0 };

export default function FlavorEditor({ flavor, onSave, onClose }: Props) {
  const [label, setLabel] = useState(flavor?.label ?? '');
  const [emoji, setEmoji] = useState(flavor?.emoji ?? '🍊');
  const [family, setFamily] = useState<AromaFamily>(flavor?.family ?? 'other');
  const [bigCategory, setBigCategory] = useState<BigAromaCategory>(flavor?.bigCategory ?? 'other');
  const [bigSubgroup, setBigSubgroup] = useState<BigAromaSubgroup>(flavor?.bigSubgroup ?? 'others-other');
  const [subgroup, setSubgroup] = useState(flavor?.subgroup ?? '');
  const [taste, setTaste] = useState<TasteProfile>(flavor?.taste ?? { ...DEFAULT_TASTE });
  const [description, setDescription] = useState(flavor?.description ?? '');
  const [similarTo, setSimilarTo] = useState(flavor?.similarTo ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const customFlavors = useMemo(() => loadCustomFlavors(), []);
  const allFlavors = useMemo(() => [...customFlavors, ...FLAVORS], [customFlavors]);

  const similarFlavor = useMemo(() => allFlavors.find(f => f.id === similarTo), [similarTo, allFlavors]);

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allFlavors.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchQuery, allFlavors]);

  const bigCatDef = BIG_CATEGORIES.find(c => c.key === bigCategory);
  const subgroups = bigCatDef?.subgroups ?? [];

  const setTasteVal = (key: keyof TasteProfile, val: number) => {
    setTaste(prev => ({ ...prev, [key]: Math.max(0, Math.min(5, val)) }));
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({ label: label.trim(), emoji, family, bigCategory, bigSubgroup, taste, description: description.trim(), subgroup: subgroup.trim() || undefined, similarTo: similarTo || undefined });
  };

  const isWCR = (f: FlavorEntry | CustomFlavorEntry): f is FlavorEntry => 'wcr_ref' in f;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-3 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{flavor ? 'Edit flavor' : 'New custom flavor'}</span>
          <button onClick={onClose} className="text-[9px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">✕</button>
        </div>
        <div className="p-3 space-y-2.5 max-h-[80vh] overflow-y-auto">
          {/* Label */}
          <div>
            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Name</span>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Yuzu"
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>

          {/* Similar to search */}
          <div>
            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Similar to</span>
            <div className="relative mt-0.5">
              {similarFlavor ? (
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] border border-violet-200 rounded bg-violet-50">
                  <span className="text-sm">{similarFlavor.emoji}</span>
                  <span className="font-semibold text-violet-700">{similarFlavor.label}</span>
                  {isWCR(similarFlavor) && similarFlavor.wcr_ref && <span className="text-[6px] text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-1 rounded">WCR</span>}
                  <button onClick={() => { setSimilarTo(''); setSearchQuery(''); }} className="ml-auto text-slate-400 dark:text-slate-500 hover:text-red-500 dark:text-red-400 text-[9px]">✕</button>
                </div>
              ) : (
                <button onClick={() => setShowSearch(p => !p)}
                  className="w-full text-left px-2 py-1 text-[10px] border border-dashed border-slate-300 dark:border-slate-600 rounded text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 hover:border-slate-400"
                >+ Link to existing flavor</button>
              )}
              {showSearch && !similarFlavor && (
                <div className="mt-1">
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search WCR & custom flavors..."
                    className="w-full px-2 py-1 text-[9px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                    autoFocus
                  />
                  {results.length > 0 && (
                    <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded max-h-36 overflow-y-auto">
                      {results.map(f => (
                        <button key={f.id} onClick={() => { setSimilarTo(f.id); setShowSearch(false); setSearchQuery(''); }}
                          className="w-full text-left px-2 py-1 text-[9px] hover:bg-violet-50 flex items-center gap-1.5 border-b border-slate-50 last:border-0"
                        >
                          <span className="text-sm">{f.emoji}</span>
                          <span className="font-medium text-slate-600 dark:text-slate-400">{f.label}</span>
                          {isWCR(f) && f.wcr_ref && <span className="text-[6px] text-slate-400 dark:text-slate-500 bg-slate-100 px-1 rounded ml-auto">WCR</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {searchQuery.trim() && results.length === 0 && (
                    <div className="text-[8px] text-slate-400 dark:text-slate-500 italic mt-1 text-center">No matches — you can leave it unlinked</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Emoji + Family row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Emoji</span>
              <input value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
            <div className="flex-[2]">
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Aroma family</span>
              <select value={family} onChange={e => setFamily(e.target.value as AromaFamily)}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white dark:bg-slate-800"
              >
                {AROMA_FAMILIES.map(f => (
                  <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Big Category + Subgroup row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Big category</span>
              <select value={bigCategory} onChange={e => { setBigCategory(e.target.value as BigAromaCategory); setBigSubgroup(BIG_CATEGORIES.find(c => c.key === e.target.value)?.subgroups[0]?.key ?? 'others-other'); }}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white dark:bg-slate-800"
              >
                {BIG_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Subgroup</span>
              <select value={bigSubgroup} onChange={e => setBigSubgroup(e.target.value as BigAromaSubgroup)}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white dark:bg-slate-800"
              >
                {subgroups.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Legacy subgroup */}
          <div>
            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Legacy subgroup (optional)</span>
            <input value={subgroup} onChange={e => setSubgroup(e.target.value)}
              placeholder="e.g. berry, citrus, roasted"
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>

          {/* Taste sliders */}
          <div>
            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Taste composition (0-5)</span>
            <div className="mt-1 space-y-1.5">
              {TASTE_LABELS.map(t => (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-500 dark:text-slate-400 w-10">{t.label}</span>
                  <input type="range" min={0} max={5} value={taste[t.key]}
                    onChange={e => setTasteVal(t.key, parseInt(e.target.value))}
                    className="flex-1 h-1 accent-violet-500"
                  />
                  <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 w-3 text-right">{taste[t.key]}</span>
                </div>
              ))}
              {similarFlavor && (
                <div className="text-[7px] text-slate-400 dark:text-slate-500 italic border-t border-slate-100 dark:border-slate-700 pt-1 mt-1">
                  Tip: {similarFlavor.label} has sour {similarFlavor.taste.sour} · sweet {similarFlavor.taste.sweet} · bitter {similarFlavor.taste.bitter}
                </div>
              )}
            </div>
          </div>

          {/* Taste preview */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded p-2">
            <span className="text-[7px] text-slate-400 dark:text-slate-500 uppercase">Preview</span>
            <div className="flex flex-col gap-0.5 mt-1">
              {TASTE_LABELS.filter(t => taste[t.key] > 0).map(t => (
                <div key={t.key} className="flex items-center gap-1">
                  <span className="text-[6px] text-slate-400 dark:text-slate-500 w-8 text-right">{t.label}</span>
                  <div className="flex-1 h-1.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(taste[t.key] / 5) * 100}%` }} />
                  </div>
                  <span className="text-[7px] text-slate-400 dark:text-slate-500">{taste[t.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this flavor smell/taste like?"
              rows={3}
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose}
            className="px-2.5 py-1 text-[9px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300"
          >Cancel</button>
          <button onClick={handleSave}
            disabled={!label.trim()}
            className="px-3 py-1 text-[9px] font-semibold text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-40"
          >{flavor ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
