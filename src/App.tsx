import { useState } from 'react';
import { ManualDigitizer } from './components/ManualDigitizer';
import { InfoModal } from './components/InfoModal';

function App() {
  const [showInfo, setShowInfo] = useState(false);

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
      </header>

      <main>
        <ManualDigitizer onDataExtracted={(data) => console.log('Extracted data:', data)} />
      </main>
    </div>
  );
}

export default App;
