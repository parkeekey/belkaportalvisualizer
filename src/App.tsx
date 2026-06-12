import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ManualDigitizer, type ManualDigitizerHandle, type ManualDigitizerSessionProfile } from './components/ManualDigitizer';
import { InfoModal } from './components/InfoModal';
import { UltrakokiParserPage, type UltrakokiParserPageHandle, type UltrakokiParserSessionProfile } from './components/UltrakokiParserPage';
import SetupProfile, { type SetupProfileHandle } from './components/SetupProfile';
import CoffeeChat from './components/CoffeeChat';
import BedVisual from './components/BedVisual';
import ZenMode from './components/ZenMode';
import Diagnostic from './components/Diagnostic';
import Simulation from './components/Simulation';
import EcSandbox from './components/EcSandbox';
import SensoryMemo from './sensory-memo/SensoryMemo';
import CoffeeProfilePage from './sensory-memo/CoffeeProfile';
import { RecipeGenerator } from './sensory-memo';
import Settings from './components/Settings';
import AppNav, { type AppPage, type LayoutStyle } from './components/AppNav';

const ACTIVE_PAGE_STORAGE_KEY = 'belka.activePage';

interface BelkaWorkspaceProfile {
  version: 1;
  savedAt: string;
  activePage: AppPage;
  digitizer: ManualDigitizerSessionProfile;
  ultrakokiParser: UltrakokiParserSessionProfile;
  setupProfile?: Record<string, unknown>;
}

function App() {
  const [showInfo, setShowInfo] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const digitizerRef = useRef<ManualDigitizerHandle>(null);
  const ultrakokiParserRef = useRef<UltrakokiParserPageHandle>(null);
  const setupProfileRef = useRef<SetupProfileHandle>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  // Live EC curve from digitizer
  const [liveECPoints, setLiveECPoints] = useState<{ timeSec: number; ec: number }[]>([]);
  const [ecSource, setEcSource] = useState<'digitizer' | 'preset'>('digitizer');
  const [presetOverlay, setPresetOverlay] = useState(false);
  const [shapePresetPoints, setShapePresetPoints] = useState<{ timeSec: number; ec: number }[]>([]);
  const [targetBrewTimeSec, setTargetBrewTimeSec] = useState(180);
  const lastDigestRef = useRef('');
  const [pourPlan, setPourPlan] = useState<{ cumulativePercent: number; duration?: number }[]>([]);

  const [activePage, setActivePage] = useState<AppPage>(() => {
    try {
      const savedPage = localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
      return savedPage === 'ultrakoki-parser' || savedPage === 'diagnostic' || savedPage === 'simulation' || savedPage === 'sensory-memo' || savedPage === 'coffee-profile' || savedPage === 'settings' ? savedPage : 'digitizer';
    } catch {
      return 'digitizer';
    }
  });

  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>(() => {
    try { return (localStorage.getItem('belka.layoutStyle') as LayoutStyle) || 'sidebar'; }
    catch { return 'sidebar'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, activePage);
    } catch {
      // Ignore browser storage errors.
    }
  }, [activePage]);

  useEffect(() => {
    const checkLayout = () => {
      try {
        const overrides = localStorage.getItem('belka.configOverrides');
        if (overrides) {
          const parsed = JSON.parse(overrides);
          const style = parsed?.ui?.layoutStyle as LayoutStyle | undefined;
          if (style && ['sidebar', 'compact-bar', 'full-bar'].includes(style)) {
            setLayoutStyle(style);
            localStorage.setItem('belka.layoutStyle', style);
          }
        }
      } catch {}
    };
    checkLayout();
    window.addEventListener('storage', checkLayout);
    return () => window.removeEventListener('storage', checkLayout);
  }, []);

  const [redLightECThreshold, setRedLightECThreshold] = useState(3.0);
  const [redLightECInput, setRedLightECInput] = useState('3.0');
  const lastRLRef = useRef(0);
  const manualRLRef = useRef(false);
  const [sandboxEnabled, setSandboxEnabled] = useState(false);

  // Live-poll digitizer for EC curve data + red light threshold
  useEffect(() => {
    if (activePage !== 'digitizer') return;
    const poll = () => {
      if (ecSource === 'preset') return;
      const profile = digitizerRef.current?.exportProfile();
      if (!profile) return;
      // Sync EC points
      const pts = profile.extractedPoints;
      const digest = pts ? pts.map(p => `${p.time}:${p.ecValue}`).join('|') : '';
      if (digest !== lastDigestRef.current) {
        lastDigestRef.current = digest;
        setLiveECPoints(pts ? pts.map(p => ({ timeSec: p.time, ec: p.ecValue })) : []);
      }
      // Sync red light threshold only if user hasn't manually overridden
      const rl = profile.redLightECThreshold;
      if (rl !== undefined && !manualRLRef.current) {
        if (rl !== lastRLRef.current) {
          lastRLRef.current = rl;
          setRedLightECThreshold(rl);
          setRedLightECInput(String(rl));
        }
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [activePage, ecSource]);

  const goLiveEC = useCallback(() => {
    setEcSource('digitizer');
    setPresetOverlay(false);
    manualRLRef.current = false;
    lastDigestRef.current = '';
  }, []);
  const loadPresetEC = useCallback((points: { timeSec: number; ec: number }[]) => {
    setShapePresetPoints(points);
    if (presetOverlay) {
      // Draw as reference overlay on top of live digitizer data
      setEcSource('digitizer');
    } else {
      setLiveECPoints(points);
      setEcSource('preset');
    }
  }, [presetOverlay]);

  const saveWorkspaceProfile = () => {
    const digitizer = digitizerRef.current?.exportProfile();
    const ultrakokiParser = ultrakokiParserRef.current?.exportProfile();
    if (!digitizer || !ultrakokiParser) {
      window.alert('Profile save is not ready yet. Try again in a moment.');
      return;
    }

    const setupProfile = setupProfileRef.current?.exportProfile();

    const payload: BelkaWorkspaceProfile = {
      version: 1,
      savedAt: new Date().toISOString(),
      activePage,
      digitizer,
      ultrakokiParser,
      setupProfile: setupProfile ? (setupProfile as unknown as Record<string, unknown>) : undefined,
    };

    const timestamp = payload.savedAt.replace(/[:.]/g, '-');
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    fetch('/api/save-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json }).catch(() => {});
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `belka-workspace-profile-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadWorkspaceProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BelkaWorkspaceProfile>;
      if (parsed.version !== 1 || !parsed.digitizer || !parsed.ultrakokiParser) {
        throw new Error('Unsupported profile format.');
      }

      digitizerRef.current?.importProfile(parsed.digitizer);
      ultrakokiParserRef.current?.importProfile(parsed.ultrakokiParser);
      if (parsed.setupProfile) {
        setupProfileRef.current?.importProfile(parsed.setupProfile as unknown as Parameters<typeof setupProfileRef.current.importProfile>[0]);
      }
      setActivePage(parsed.activePage === 'ultrakoki-parser' || parsed.activePage === 'setup-profile' || parsed.activePage === 'zen' || parsed.activePage === 'diagnostic' || parsed.activePage === 'simulation' || parsed.activePage === 'sensory-memo' || parsed.activePage === 'coffee-profile' || parsed.activePage === 'settings' ? parsed.activePage : 'digitizer');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load workspace profile.';
      window.alert(message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 dark:bg-slate-950">
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {layoutStyle === 'sidebar' && (
        <AppNav
          mode="sidebar"
          activePage={activePage}
          onNavigate={setActivePage}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen(v => !v)}
          onShowInfo={() => setShowInfo(true)}
        />
      )}

      <header className={`bg-white dark:bg-slate-800 dark:bg-slate-900 shadow-sm border-b dark:border-slate-700 ${layoutStyle === 'sidebar' ? 'ml-14' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-y-2 py-3">
            <div className="flex items-center">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white dark:text-white">
                Belka Portal Graph Digitizer
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <input
                ref={profileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={loadWorkspaceProfile}
                className="hidden"
              />
              {layoutStyle !== 'sidebar' && (
                <AppNav
                  mode={layoutStyle}
                  activePage={activePage}
                  onNavigate={setActivePage}
                  chatOpen={chatOpen}
                  onToggleChat={() => setChatOpen(v => !v)}
                  onShowInfo={() => setShowInfo(true)}
                />
              )}
              {layoutStyle === 'sidebar' ? (
                <>
                  <button
                    onClick={() => setChatOpen(v => !v)}
                    className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors ${chatOpen ? 'border-purple-300 bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300' : 'border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-700'}`}
                    title="Open Brew Chat — AI brew assistant"
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setShowInfo(true)}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 text-slate-600 dark:text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="About this app — EC, TDS, use cases, credits"
                  >
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-500 text-white text-[8px] sm:text-[10px] font-bold leading-none">i</span>
                    About
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className={layoutStyle === 'sidebar' ? 'ml-14' : ''}>
        <div className={activePage === 'digitizer' ? 'block' : 'hidden'} aria-hidden={activePage !== 'digitizer'}>
          <div className="max-w-6xl mx-auto px-6 pt-4 pb-0">
            <div className="flex items-center gap-2">
              <button onClick={saveWorkspaceProfile}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                title="Save the full workspace session as a portable JSON profile"
              >💾 Save Profile</button>
              <button onClick={() => profileInputRef.current?.click()}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/30"
                title="Load a previously saved workspace profile"
              >📂 Load Profile</button>
            </div>
          </div>
          <ManualDigitizer ref={digitizerRef} isActive={activePage === 'digitizer'} onDataExtracted={(data) => console.log('Extracted data:', data)} onNavigateToSetupProfile={useCallback(() => setActivePage('setup-profile'), [])} onPourPlanChange={setPourPlan} />

          {/* Bed Health */}
          <section className="max-w-6xl mx-auto px-6 pb-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Bed Health</h3>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-semibold uppercase tracking-wider ${liveECPoints.length > 0 && ecSource === 'digitizer' ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'}`}>
                    {liveECPoints.length > 0 && ecSource === 'digitizer' ? `● ${liveECPoints.length} pts` : 'preset'}
                  </span>
                  <button
                    onClick={() => setSandboxEnabled(v => !v)}
                    className={`px-2 py-0.5 text-[9px] font-bold rounded border transition-colors ${sandboxEnabled ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    title="Toggle EC dial-in sandbox"
                  >
                    🔬
                  </button>
                </div>
              </div>

              {/* Red light threshold */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Red Light:</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">EC &lt;</span>
                <input value={redLightECInput} onChange={e => setRedLightECInput(e.target.value)}
                  className="w-12 px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                <button onClick={() => {
                  const v = parseFloat(redLightECInput);
                  if (!isNaN(v) && v > 0) {
                    setRedLightECThreshold(v);
                    lastRLRef.current = v;
                    manualRLRef.current = true;
                  }
                }}
                  className="px-2 py-0.5 text-[9px] font-bold bg-slate-800 text-white rounded hover:bg-slate-900"
                >Set</button>
                <span className="text-slate-200 mx-1">|</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Brew Time:</span>
                <input value={`${Math.floor(targetBrewTimeSec / 60)}:${String(Math.floor(targetBrewTimeSec % 60)).padStart(2, '0')}`}
                  onChange={e => {
                    const parts = e.target.value.split(':');
                    const m = parseInt(parts[0]);
                    const s = parseInt(parts[1]);
                    if (!isNaN(m) && !isNaN(s) && m >= 0 && s >= 0 && s < 60) setTargetBrewTimeSec(m * 60 + s);
                  }}
                  className="w-16 px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="m:ss"
                />
              </div>

              {/* Full-width BedVisual — chart can grow unconstrained */}
              <div className="w-full mb-4">
                <BedVisual ecPoints={liveECPoints} brewTimeSec={targetBrewTimeSec}
                  redLightThreshold={ecSource === 'digitizer' || liveECPoints.length > 0 ? redLightECThreshold : undefined}
                  referencePoints={presetOverlay && shapePresetPoints.length > 1 ? shapePresetPoints : undefined}
                  pourPlan={pourPlan}
                  onImportPhases={useCallback((phases: { phase: string; startTime: number; endTime: number; color: string }[]) => {
                    digitizerRef.current?.importPhaseLogs?.(phases);
                  }, [])}
                />
              </div>

              {/* No-data state + Presets */}
              <div className="flex flex-col gap-3">
                {liveECPoints.length === 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                      Digitize a graph to see its EC curve reflected here in real time. Or explore with a preset scenario below.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Shape Presets</span>
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                      <input type="checkbox" checked={presetOverlay}
                        onChange={e => setPresetOverlay(e.target.checked)}
                        className="w-2.5 h-2.5 accent-slate-700"
                      />
                      <span className="text-[8px] text-slate-400 dark:text-slate-500">Overlay</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {[
                      {
                        label: 'Healthy',
                        desc: 'gentle peak → slow decline',
                        points: [
                          { timeSec: 0, ec: 0.3 }, { timeSec: 10, ec: 3.2 }, { timeSec: 20, ec: 8.5 },
                          { timeSec: 30, ec: 12.1 }, { timeSec: 40, ec: 14.2 }, { timeSec: 50, ec: 14.8 },
                          { timeSec: 60, ec: 14.2 }, { timeSec: 75, ec: 12.5 }, { timeSec: 90, ec: 10.8 },
                          { timeSec: 120, ec: 8.2 }, { timeSec: 150, ec: 6.5 }, { timeSec: 180, ec: 5.1 },
                        ],
                      },
                      {
                        label: 'Channeling',
                        desc: 'sharp peak → steep drop',
                        points: [
                          { timeSec: 0, ec: 0.3 }, { timeSec: 10, ec: 2.8 }, { timeSec: 20, ec: 7.5 },
                          { timeSec: 30, ec: 11.0 }, { timeSec: 35, ec: 12.5 }, { timeSec: 40, ec: 12.0 },
                          { timeSec: 50, ec: 8.5 }, { timeSec: 60, ec: 5.2 }, { timeSec: 75, ec: 3.5 },
                          { timeSec: 90, ec: 2.8 }, { timeSec: 120, ec: 2.0 }, { timeSec: 180, ec: 1.5 },
                        ],
                      },
                      {
                        label: 'Collapse',
                        desc: 'brief peak → crash',
                        points: [
                          { timeSec: 0, ec: 0.3 }, { timeSec: 10, ec: 2.5 }, { timeSec: 20, ec: 6.8 },
                          { timeSec: 30, ec: 10.5 }, { timeSec: 35, ec: 11.8 }, { timeSec: 40, ec: 10.2 },
                          { timeSec: 45, ec: 6.5 }, { timeSec: 50, ec: 3.2 }, { timeSec: 60, ec: 1.8 },
                          { timeSec: 90, ec: 1.0 }, { timeSec: 120, ec: 0.8 }, { timeSec: 180, ec: 0.5 },
                        ],
                      },
                      {
                        label: 'Fines',
                        desc: 'steady peak → moderate drop',
                        points: [
                          { timeSec: 0, ec: 0.3 }, { timeSec: 10, ec: 3.0 }, { timeSec: 20, ec: 7.8 },
                          { timeSec: 30, ec: 11.5 }, { timeSec: 40, ec: 13.2 }, { timeSec: 50, ec: 13.8 },
                          { timeSec: 60, ec: 12.5 }, { timeSec: 75, ec: 10.0 }, { timeSec: 90, ec: 8.5 },
                          { timeSec: 120, ec: 7.2 }, { timeSec: 150, ec: 6.0 }, { timeSec: 180, ec: 5.5 },
                        ],
                      },
                    ].map(s => (
                      <button key={s.label} onClick={() => loadPresetEC(s.points)}
                        className={`px-2 py-1 text-[9px] font-bold border rounded transition-all ${(ecSource === 'preset' && JSON.stringify(liveECPoints) === JSON.stringify(s.points)) || (presetOverlay && JSON.stringify(shapePresetPoints) === JSON.stringify(s.points)) ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'}`}
                        title={s.desc}
                      >{s.label}</button>
                    ))}
                    {ecSource === 'preset' && (
                      <button onClick={goLiveEC}
                        className="px-2 py-1 text-[9px] font-bold border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                      >← Live</button>
                    )}
                    {presetOverlay && shapePresetPoints.length > 1 && (
                      <button onClick={() => { setPresetOverlay(false); setShapePresetPoints([]); }}
                        className="px-2 py-1 text-[9px] font-bold border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                      >✕ Clear overlay</button>
                    )}
                  </div>
                  <div className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {ecSource === 'preset' ? 'Preset replaces live data · toggle Overlay to draw as reference on top'
                      : presetOverlay ? 'Overlay on — presets draw as dotted reference without replacing data'
                      : 'Presets replace live data for exploration'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {sandboxEnabled && (
            <section className="max-w-6xl mx-auto px-6 pb-6">
              <EcSandbox
                ecPoints={liveECPoints}
                redLightThreshold={redLightECThreshold}
                targetBrewTimeSec={targetBrewTimeSec}
                enabled={sandboxEnabled}
                onToggle={() => setSandboxEnabled(v => !v)}
              />
            </section>
          )}
        </div>
        <div className={activePage === 'ultrakoki-parser' ? 'block' : 'hidden'} aria-hidden={activePage !== 'ultrakoki-parser'}>
          <UltrakokiParserPage ref={ultrakokiParserRef} />
        </div>
        <div className={activePage === 'setup-profile' ? 'block' : 'hidden'} aria-hidden={activePage !== 'setup-profile'}>
          <SetupProfile ref={setupProfileRef} />
        </div>
        {activePage === 'zen' && (
          <ZenMode onClose={() => setActivePage('digitizer')} />
        )}
        {activePage === 'diagnostic' && (
          <Diagnostic onClose={() => setActivePage('digitizer')} />
        )}
        {activePage === 'simulation' && (
          <Simulation />
        )}
        {activePage === 'sensory-memo' && (
          <SensoryMemo />
        )}
        {activePage === 'coffee-profile' && (
          <CoffeeProfilePage />
        )}
        {activePage === 'recipe-generator' && (
          <RecipeGenerator />
        )}
        {activePage === 'settings' && (
          <Settings />
        )}
      </main>

      <CoffeeChat
        externalOpen={chatOpen}
        onExternalToggle={() => setChatOpen(v => !v)}
        onApplyCommands={useCallback((cmds: Record<string, number>) => {
          localStorage.setItem('belka.chatCommand', JSON.stringify(cmds));
        }, [])}
        onRequestContext={useCallback(() => {
          const d = digitizerRef.current?.exportProfile();
          const lines: string[] = [];
          lines.push('── Current brew ──');
          if (d) {
            if (d.doseWeight) lines.push(`Dose: ${d.doseWeight}g`);
            if (d.brewRatio) lines.push(`Ratio: 1:${d.brewRatio}`);
            if (d.totalWaterIn) lines.push(`Total water: ${d.totalWaterIn}g`);
            if (d.grinderName) lines.push(`Grinder: ${d.grinderName}`);
            if (d.grindSize) lines.push(`Grind setting: ${d.grindSize}`);
            if (d.micron) lines.push(`Micron: ${d.micron}µm`);
            if (d.recipeFinishTimeSec) {
              const m = Math.floor(d.recipeFinishTimeSec / 60);
              const s = d.recipeFinishTimeSec % 60;
              lines.push(`Finish time: ${m}:${s.toString().padStart(2, '0')}`);
            }
            if (d.importedBean?.coffeeName) {
              lines.push(`Bean: ${d.importedBean.coffeeName}`);
              if (d.importedBean.roastery) lines.push(`Roaster: ${d.importedBean.roastery}`);
              if (d.importedBean.origin) lines.push(`Origin: ${d.importedBean.origin}`);
              if (d.importedBean.process) lines.push(`Process: ${d.importedBean.process}`);
              if (d.importedBean.roastLevel) lines.push(`Roast: ${d.importedBean.roastLevel}/5`);
            }
            if (d.refractometerTDSInput) lines.push(`Refractometer TDS: ${d.refractometerTDSInput}%`);
          }
          try {
            const raw = localStorage.getItem('belka.chatAttemptData');
            if (raw) {
              const a = JSON.parse(raw);
              lines.push('');
              lines.push('── Selected brew attempt ──');
              if (a.date) lines.push(`Date: ${new Date(a.date).toLocaleDateString()}`);
              if (a.doseWeight) lines.push(`Dose: ${a.doseWeight}g`);
              if (a.brewRatio) lines.push(`Ratio: 1:${a.brewRatio}`);
              if (a.totalWater) lines.push(`Total water: ${a.totalWater}g`);
              if (a.grindSize) lines.push(`Grind setting: ${a.grindSize}`);
              if (a.tdsActual) lines.push(`TDS: ${a.tdsActual}%`);
              if (a.ey) lines.push(`EY: ${a.ey}%`);
              if (a.brewTimeActual) lines.push(`Brew time: ${Math.floor(a.brewTimeActual / 60)}:${(a.brewTimeActual % 60).toString().padStart(2, '0')}`);
              if (a.tasteTags?.length) lines.push(`Taste: ${a.tasteTags.join(', ')}`);
              if (a.liked !== null) lines.push(`Liked: ${a.liked ? 'Yes' : 'No'}`);
              if (a.notes) lines.push(`Notes: ${a.notes}`);
            }
          } catch {}
          return lines.join('\n');
        }, [])}
      />
    </div>
  );
}

export default App;
