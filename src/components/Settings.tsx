import { useCallback, useEffect, useRef, useState } from 'react';

const GIT_BRANCH = 'belka_BOSS';
const GIT_COMMIT = '8f143a6';

interface SnapshotEntry {
  id: string;
  label: string;
  timestamp: string;
  branch: string;
  commit: string;
  config: BelkaConfig | null;
  features: { sandboxEnabled: boolean; debugMode: boolean; chatEnabled: boolean };
}

interface BelkaConfig {
  version: number;
  project: { name: string; repo: string; description: string };
  extraction: { ratioMin: number; ratioMax: number; eyMin: number; eyMax: number; tdsTargetMode: string };
  ecThresholds: { redLight: number; collapse: number; stall: number };
  features: { sandboxEnabled: boolean; debugMode: boolean; chatEnabled: boolean };
  ui: { defaultBrewTimeSec: number; theme: string; layoutStyle: string };
}

const OVERRIDE_KEY = 'belka.configOverrides';

function loadOverrides(): Partial<BelkaConfig> | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveOverrides(config: Partial<BelkaConfig>) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(config, null, 2));
}

function mergeConfig(defaults: BelkaConfig, overrides: Partial<BelkaConfig> | null): BelkaConfig {
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}

const SNAPSHOTS_KEY = 'belka.snapshots';

let snapshotCounter = 0;

export default function Settings() {
  const [defaultConfig, setDefaultConfig] = useState<BelkaConfig | null>(null);
  const [config, setConfig] = useState<BelkaConfig | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [saved, setSaved] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]'); }
    catch { return []; }
  });
  const [buildDate] = useState(() => {
    try {
      const d = new Date(document.querySelector('meta[name=build-date]')?.getAttribute('content') || '');
      return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
    } catch { return ''; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/belka-config.json')
      .then(r => r.json())
      .then((d: BelkaConfig) => {
        setDefaultConfig(d);
        const merged = mergeConfig(d, loadOverrides());
        setConfig(merged);
        setJsonText(JSON.stringify(merged, null, 2));
      })
      .catch(() => {
        const fallback: BelkaConfig = {
          version: 1,
          project: { name: 'Belka Portal', repo: 'windsurf-project', description: 'EC digitizer, brew diagnostics, sensory mapping' },
          extraction: { ratioMin: 5, ratioMax: 22, eyMin: 17, eyMax: 30, tdsTargetMode: 'sca-zone' },
          ecThresholds: { redLight: 3.0, collapse: 3.0, stall: 14.0 },
          features: { sandboxEnabled: false, debugMode: false, chatEnabled: true },
          ui: { defaultBrewTimeSec: 180, theme: 'light', layoutStyle: 'sidebar' },
        };
        setDefaultConfig(fallback);
        setConfig(fallback);
        setJsonText(JSON.stringify(fallback, null, 2));
      });
  }, []);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    setSaved(false);
    try {
      JSON.parse(text);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!defaultConfig) return;
    try {
      const parsed = JSON.parse(jsonText) as BelkaConfig;
      const overrides: Partial<BelkaConfig> = {};
      for (const key of Object.keys(defaultConfig) as (keyof BelkaConfig)[]) {
        if (JSON.stringify(parsed[key]) !== JSON.stringify(defaultConfig[key])) {
          (overrides as any)[key] = parsed[key];
        }
      }
      saveOverrides(overrides);
      localStorage.setItem('belka.layoutStyle', parsed.ui.layoutStyle);
      localStorage.setItem('belka.theme', parsed.ui.theme);
      setSaved(true);
      setTimeout(() => window.location.reload(), 400);
    } catch {}
  }, [defaultConfig, jsonText]);

  const handleReset = useCallback(() => {
    if (!defaultConfig) return;
    localStorage.removeItem(OVERRIDE_KEY);
    setConfig(defaultConfig);
    setJsonText(JSON.stringify(defaultConfig, null, 2));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [defaultConfig]);

  const handleDownload = useCallback(() => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belka-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as BelkaConfig;
        if (!parsed.version) { setJsonError('Invalid config file'); return; }
        setJsonText(JSON.stringify(parsed, null, 2));
        handleSave();
      } catch { setJsonError('Failed to parse uploaded file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [handleSave]);

  useEffect(() => {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    try {
      const theme = localStorage.getItem('belka.theme') || 'light';
      document.documentElement.classList.toggle('dark', theme === 'dark');
    } catch {}
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    try {
      localStorage.setItem('belka.theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      if (config) {
        const newConfig = { ...config, ui: { ...config.ui, theme } };
        setConfig(newConfig);
        setJsonText(JSON.stringify(newConfig, null, 2));
      }
    } catch {}
  }, [config]);

  const takeSnapshot = useCallback(() => {
    snapshotCounter++;
    const now = new Date();
    const label = `S${snapshotCounter}`;
    const entry: SnapshotEntry = {
      id: `${label}-${now.toISOString().slice(0, 10)}`,
      label,
      timestamp: now.toISOString(),
      branch: GIT_BRANCH,
      commit: GIT_COMMIT,
      config: config ? { ...config } : null,
      features: {
        sandboxEnabled: config?.features.sandboxEnabled ?? false,
        debugMode: config?.features.debugMode ?? false,
        chatEnabled: config?.features.chatEnabled ?? true,
      },
    };
    setSnapshots(prev => [entry, ...prev]);
    const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belka-snapshot-${label}-${now.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white dark:text-white">⚙️ Settings</h2>

      {/* Project Snapshot */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider mb-3">📸 Project Snapshot</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Branch</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">{GIT_BRANCH}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Commit</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">{GIT_COMMIT}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Build</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">{buildDate || <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600">—</span>}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Ratio Range</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">1:{config?.extraction.ratioMin ?? '?'} – 1:{config?.extraction.ratioMax ?? '?'}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">EY Range</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">{config?.extraction.eyMin ?? '?'}% – {config?.extraction.eyMax ?? '?'}%</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
            <div className="text-slate-400 dark:text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mb-0.5">EC Red Light</div>
            <div className="font-mono text-slate-800 dark:text-white dark:text-slate-200">EC &lt; {config?.ecThresholds.redLight ?? '?'}</div>
          </div>
        </div>
      </section>

      {/* Project Snapshots */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider">📸 Project Snapshots</h3>
          <button onClick={takeSnapshot}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-800 bg-slate-800 text-white hover:bg-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600"
          >+ Take Snapshot</button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 dark:text-slate-500 italic">No snapshots taken yet. Snapshots download as permanent JSON files you can keep anywhere.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {snapshots.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700 dark:border-slate-700 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 font-mono min-w-[2ch]">{s.label}</span>
                <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">{new Date(s.timestamp).toLocaleString()}</span>
                <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600">·</span>
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 font-mono">{s.commit}</span>
                <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600">·</span>
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400">{s.branch}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* JSON Config Editor */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider">📄 Config</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={handleDownload}
              className="px-2 py-1 text-[10px] font-semibold rounded border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 dark:bg-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-600"
            >Download</button>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 text-[10px] font-semibold rounded border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 dark:bg-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-600"
            >Upload</button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleUpload} className="hidden" />
            <button onClick={handleReset}
              className="px-2 py-1 text-[10px] font-semibold rounded border border-amber-200 dark:border-amber-800 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
            >Reset</button>
          </div>
        </div>
        {jsonError && (
          <div className="mb-2 text-[10px] text-red-500 dark:text-red-400 font-semibold">{jsonError}</div>
        )}
        <textarea
          value={jsonText}
          onChange={e => handleJsonChange(e.target.value)}
          spellCheck={false}
          className="w-full h-64 font-mono text-[11px] leading-relaxed p-3 border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900 text-slate-800 dark:text-white dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-y"
        />
        <div className="flex items-center justify-end mt-2 gap-2">
          {saved && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ Saved</span>}
          <button onClick={handleSave} disabled={!!jsonError || !config}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${jsonError || !config ? 'border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 dark:text-slate-600 cursor-not-allowed' : 'border-slate-800 dark:border-slate-600 bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-600'}`}
          >Apply Config</button>
        </div>
      </section>

      {/* Layout Style */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider mb-3">🎨 Layout Style</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mb-3">Change how the navigation looks. Changes apply immediately after saving config.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'sidebar', label: 'Sidebar', desc: 'Icons-only vertical bar on the left', icon: '◫' },
            { value: 'compact-bar', label: 'Compact', desc: 'Icon-only buttons in the header', icon: '⊟' },
            { value: 'full-bar', label: 'Full', desc: 'Labeled buttons in the header (classic)', icon: '☰' },
          ].map(opt => {
            const isActive = config?.ui.layoutStyle === opt.value;
            return (
              <button key={opt.value} onClick={() => {
                if (!config) return;
                const newConfig = { ...config, ui: { ...config.ui, layoutStyle: opt.value } };
                setConfig(newConfig);
                setJsonText(JSON.stringify(newConfig, null, 2));
                setSaved(false);
              }}
                className={`text-left p-3 rounded-lg border transition-colors ${isActive ? 'border-slate-800 dark:border-slate-500 bg-slate-800 dark:bg-slate-700 text-white ring-1 ring-slate-800 dark:ring-slate-500' : 'border-slate-200 dark:border-slate-700 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-700/50'}`}
              >
                <div className="text-lg mb-1">{opt.icon}</div>
                <div className="text-xs font-bold text-slate-800 dark:text-white dark:text-slate-200">{opt.label}</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-2">Select a style, then click <strong>Apply Config</strong> above.</p>
      </section>

      {/* Appearance */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider mb-3">🌙 Appearance</h3>
        <div className="flex items-center gap-3">
          <button onClick={() => setTheme('light')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${config?.ui.theme === 'light' ? 'border-slate-800 dark:border-slate-500 bg-slate-800 dark:bg-slate-700 text-white' : 'border-slate-200 dark:border-slate-700 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400 dark:text-slate-300'}`}
          >☀️ Light</button>
          <button onClick={() => setTheme('dark')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${config?.ui.theme === 'dark' ? 'border-slate-800 dark:border-slate-500 bg-slate-800 dark:bg-slate-700 text-white' : 'border-slate-200 dark:border-slate-700 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400 dark:text-slate-300'}`}
          >🌙 Dark</button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-2">Toggles immediately. Also saved to config when you Apply.</p>
      </section>

      {/* Feature Status */}
      <section className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider mb-3">🎛️ Feature Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {[
            { label: 'Sandbox', key: 'sandboxEnabled' as const },
            { label: 'Debug Mode', key: 'debugMode' as const },
            { label: 'Chat', key: 'chatEnabled' as const },
          ].map(f => (
            <div key={f.key} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700 dark:border-slate-700">
              <span className={`w-2 h-2 rounded-full ${config?.features[f.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              <span className="text-slate-600 dark:text-slate-400 dark:text-slate-300 font-medium">{f.label}</span>
              <span className="ml-auto font-mono text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{config?.features[f.key] ? 'on' : 'off'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
