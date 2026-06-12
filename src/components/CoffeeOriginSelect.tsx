import { useState, useRef, useEffect } from 'react';
import { COFFEE_ORIGINS, REGION_COLORS, searchOrigins } from '../data/coffeeOrigins';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: { input: 'text-[9px] px-2 py-1', dropdown: 'text-[9px]', chip: 'text-[7px]' },
  md: { input: 'text-[10px] px-2 py-1', dropdown: 'text-[10px]', chip: 'text-[8px]' },
  lg: { input: 'text-sm px-3 py-1.5', dropdown: 'text-sm', chip: 'text-[9px]' },
};

export default function CoffeeOriginSelect({ value, onChange, placeholder, size = 'md' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOrigin = COFFEE_ORIGINS.find(o => o.name === value);
  const regionColor = selectedOrigin ? REGION_COLORS[selectedOrigin.region] : null;

  const results = searchOrigins(query);

  useEffect(() => {
    if (open) {
      setQuery(value);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const cls = SIZE_CLASSES[size];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(p => !p)}
        className={`w-full ${cls.input} border rounded font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 text-left flex items-center gap-1.5 ${value ? 'bg-white dark:bg-slate-800 dark:bg-slate-800 border-slate-300 dark:border-slate-600 dark:border-slate-600' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:border-slate-700 text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}
      >
        {value ? (
          <>
            {regionColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: regionColor.color }} />}
            <span className="text-slate-700 dark:text-slate-300 dark:text-slate-300">{value}</span>
          </>
        ) : (
          <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">{placeholder ?? 'Origin'}</span>
        )}
        <span className="ml-auto text-slate-300 dark:text-slate-600 dark:text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-slate-800 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 dark:border-slate-700 p-1">
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search origins..."
              className={`w-full ${cls.input} border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900`}
            />
          </div>
          <div className="py-1">
            {value && (
              <button onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-2 py-1 ${cls.dropdown} text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 italic`}
              >— Clear —</button>
            )}
            {results.length === 0 ? (
              <div className={`px-2 py-2 ${cls.dropdown} text-slate-400 dark:text-slate-500 dark:text-slate-500 italic text-center`}>No matches</div>
            ) : (() => {
              const grouped: Record<string, typeof COFFEE_ORIGINS> = {};
              results.forEach(o => {
                const key = o.region;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(o);
              });
              return Object.entries(grouped).map(([region, origins]) => {
                const rc = REGION_COLORS[region as keyof typeof REGION_COLORS];
                return (
                  <div key={region}>
                    <div className={`px-2 py-0.5 ${cls.chip} font-semibold uppercase tracking-wider`} style={{ color: rc?.color, backgroundColor: rc?.bgColor }}>
                      {region.replace('-', ' ')}
                    </div>
                    {origins.map(o => (
                      <button key={o.name} onClick={() => { onChange(o.name); setOpen(false); }}
                        className={`w-full text-left px-2 py-1 ${cls.dropdown} hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 flex items-center gap-1.5 ${value === o.name ? 'bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/40 font-semibold text-amber-800 dark:text-amber-200 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400 dark:text-slate-400'}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rc?.color }} />
                        <span>{o.name}</span>
                        {o.subregion && <span className="text-slate-300 dark:text-slate-600 dark:text-slate-500 ml-auto text-[0.8em]">{o.subregion}</span>}
                      </button>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
