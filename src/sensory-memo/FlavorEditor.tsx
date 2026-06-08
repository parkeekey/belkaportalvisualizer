import { useState } from 'react';
import { AROMA_FAMILIES, TASTE_LABELS, type AromaFamily, type TasteProfile, type CustomFlavorEntry } from './types';

interface Props {
  flavor?: CustomFlavorEntry;
  onSave: (data: { label: string; emoji: string; family: AromaFamily; taste: TasteProfile; description: string; subgroup?: string }) => void;
  onClose: () => void;
}

const DEFAULT_TASTE: TasteProfile = { sour: 0, sweet: 0, bitter: 0, salty: 0, umami: 0 };

export default function FlavorEditor({ flavor, onSave, onClose }: Props) {
  const [label, setLabel] = useState(flavor?.label ?? '');
  const [emoji, setEmoji] = useState(flavor?.emoji ?? '🍊');
  const [family, setFamily] = useState<AromaFamily>(flavor?.family ?? 'other');
  const [subgroup, setSubgroup] = useState(flavor?.subgroup ?? '');
  const [taste, setTaste] = useState<TasteProfile>(flavor?.taste ?? { ...DEFAULT_TASTE });
  const [description, setDescription] = useState(flavor?.description ?? '');

  const setTasteVal = (key: keyof TasteProfile, val: number) => {
    setTaste(prev => ({ ...prev, [key]: Math.max(0, Math.min(5, val)) }));
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({ label: label.trim(), emoji, family, taste, description: description.trim(), subgroup: subgroup.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm mx-3 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <span className="text-[11px] font-bold text-slate-700">{flavor ? 'Edit flavor' : 'New custom flavor'}</span>
          <button onClick={onClose} className="text-[9px] text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-3 space-y-2.5 max-h-[80vh] overflow-y-auto">
          {/* Label */}
          <div>
            <span className="text-[8px] text-slate-400 font-semibold uppercase">Name</span>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. My Special Note"
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>

          {/* Emoji + Family row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[8px] text-slate-400 font-semibold uppercase">Emoji</span>
              <input value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
            <div className="flex-[2]">
              <span className="text-[8px] text-slate-400 font-semibold uppercase">Aroma family</span>
              <select value={family} onChange={e => setFamily(e.target.value as AromaFamily)}
                className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
              >
                {AROMA_FAMILIES.map(f => (
                  <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subgroup */}
          <div>
            <span className="text-[8px] text-slate-400 font-semibold uppercase">Subgroup (optional)</span>
            <input value={subgroup} onChange={e => setSubgroup(e.target.value)}
              placeholder="e.g. berry, citrus, roasted"
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>

          {/* Taste sliders */}
          <div>
            <span className="text-[8px] text-slate-400 font-semibold uppercase">Taste composition (0-5)</span>
            <div className="mt-1 space-y-1.5">
              {TASTE_LABELS.map(t => (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-500 w-10">{t.label}</span>
                  <input type="range" min={0} max={5} value={taste[t.key]}
                    onChange={e => setTasteVal(t.key, parseInt(e.target.value))}
                    className="flex-1 h-1 accent-violet-500"
                  />
                  <span className="text-[9px] font-bold text-slate-600 w-3 text-right">{taste[t.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Taste preview */}
          <div className="bg-slate-50 rounded p-2">
            <span className="text-[7px] text-slate-400 uppercase">Preview</span>
            <div className="flex flex-col gap-0.5 mt-1">
              {TASTE_LABELS.filter(t => taste[t.key] > 0).map(t => (
                <div key={t.key} className="flex items-center gap-1">
                  <span className="text-[6px] text-slate-400 w-8 text-right">{t.label}</span>
                  <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(taste[t.key] / 5) * 100}%` }} />
                  </div>
                  <span className="text-[7px] text-slate-400">{taste[t.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <span className="text-[8px] text-slate-400 font-semibold uppercase">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this flavor smell/taste like?"
              rows={3}
              className="w-full mt-0.5 px-2 py-1 text-[10px] border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-2.5 py-1 text-[9px] text-slate-500 hover:text-slate-700"
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
