import { useState } from 'react';
import { ManualDigitizer } from './components/ManualDigitizer';
import { InfoModal } from './components/InfoModal';
import { UltrakokiParserPage } from './components/UltrakokiParserPage';

type AppPage = 'digitizer' | 'ultrakoki-parser';

function App() {
  const [showInfo, setShowInfo] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>('digitizer');

  return (
    <div className="min-h-screen bg-gray-50">
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Belka Portal Graph Digitizer
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePage('digitizer')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${activePage === 'digitizer' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                title="Go to main digitizer"
              >
                Main App
              </button>
              <button
                onClick={() => setActivePage('ultrakoki-parser')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${activePage === 'ultrakoki-parser' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                title="Go to Ultrakoki parser"
              >
                Ultrakoki Parser
              </button>
              <button
                onClick={() => setShowInfo(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                title="About this app — EC, TDS, use cases, credits"
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-500 text-white text-[10px] font-bold leading-none">i</span>
                About
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        {activePage === 'digitizer' ? (
          <ManualDigitizer onDataExtracted={(data) => console.log('Extracted data:', data)} />
        ) : (
          <UltrakokiParserPage />
        )}
      </main>
    </div>
  );
}

export default App;
