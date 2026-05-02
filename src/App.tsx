import { ManualDigitizer } from './components/ManualDigitizer';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Belka Portal Graph Digitizer
              </h1>
            </div>
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
