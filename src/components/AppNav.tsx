export type AppPage = 'digitizer' | 'ultrakoki-parser' | 'setup-profile' | 'zen' | 'diagnostic' | 'simulation' | 'sensory-memo' | 'coffee-profile' | 'recipe-generator' | 'settings';

export type LayoutStyle = 'sidebar' | 'compact-bar' | 'full-bar';

interface NavItem {
  page: AppPage;
  icon: string;
  label: string;
  activeBg: string;
  activeBorder: string;
  title: string;
}

const NAV_ITEMS: NavItem[] = [
  { page: 'digitizer', icon: '🏠', label: 'Main App', activeBg: 'bg-slate-800', activeBorder: 'border-slate-800', title: 'Go to main digitizer' },
  { page: 'ultrakoki-parser', icon: '🌿', label: 'Ultrakoki', activeBg: 'bg-emerald-600', activeBorder: 'border-emerald-600', title: 'Go to Ultrakoki parser' },
  { page: 'setup-profile', icon: '⚙️', label: 'Setup', activeBg: 'bg-sky-600', activeBorder: 'border-sky-600', title: 'Go to Setup Profile' },
  { page: 'zen', icon: '☯', label: 'Zen', activeBg: 'bg-amber-700', activeBorder: 'border-amber-700', title: 'Zen Mode' },
  { page: 'diagnostic', icon: '🔍', label: 'Diagnostic', activeBg: 'bg-rose-700', activeBorder: 'border-rose-700', title: 'Diagnostic' },
  { page: 'simulation', icon: '🔬', label: 'Simulate', activeBg: 'bg-indigo-600', activeBorder: 'border-indigo-600', title: 'Simulation' },
  { page: 'sensory-memo', icon: '📝', label: 'Memo', activeBg: 'bg-violet-600', activeBorder: 'border-violet-600', title: 'Sensory Memo' },
  { page: 'coffee-profile', icon: '☕', label: 'Profile', activeBg: 'bg-amber-600', activeBorder: 'border-amber-600', title: 'Coffee Profile' },
  { page: 'recipe-generator', icon: '📋', label: 'Recipe', activeBg: 'bg-teal-600', activeBorder: 'border-teal-600', title: 'Recipe Generator' },
  { page: 'settings', icon: '⚙️', label: 'Settings', activeBg: 'bg-slate-600', activeBorder: 'border-slate-600', title: 'Settings' },
];

interface AppNavProps {
  mode: LayoutStyle;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onShowInfo: () => void;
}

export default function AppNav({ mode, activePage, onNavigate, chatOpen, onToggleChat, onShowInfo }: AppNavProps) {
  if (mode === 'sidebar') {
    return (
      <nav className="fixed left-0 top-0 h-full w-14 dark:w-14 bg-white dark:bg-slate-800 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 dark:border-slate-700 z-50 flex flex-col items-stretch py-2 px-1 gap-0.5">
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.page;
          return (
            <div key={item.page} className="relative flex items-center">
              {isActive && <div className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full ${item.activeBg}`} />}
              <button
                onClick={() => onNavigate(item.page)}
                className={`w-full h-10 flex items-center justify-center rounded-lg text-base transition-all group relative ml-0.5 ${isActive ? `${item.activeBg} text-white shadow-sm ring-1 ring-white/20` : 'text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-800'}`}
                title={item.title}
              >
                <span>{item.icon}</span>
                <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-semibold rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                  {item.label}
                </span>
              </button>
            </div>
          );
        })}
        <div className="flex-1" />
        <div className="relative flex items-center">
          <button
            onClick={onToggleChat}
            className={`w-full h-10 flex items-center justify-center rounded-lg text-base transition-colors group relative ml-0.5 ${chatOpen ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-800'}`}
            title="Brew Chat"
          >
            <span>💬</span>
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-semibold rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">Chat</span>
          </button>
        </div>
        <div className="relative flex items-center">
          <button
            onClick={onShowInfo}
            className="w-full h-10 flex items-center justify-center rounded-lg text-base text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors group relative ml-0.5"
            title="About"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-400 dark:bg-slate-500 text-white text-[10px] font-bold">i</span>
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-semibold rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">About</span>
          </button>
        </div>
      </nav>
    );
  }

  if (mode === 'compact-bar') {
    return (
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${isActive ? `${item.activeBg} text-white` : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
              title={item.title}
            >
              <span>{item.icon}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // full-bar mode
  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
      {NAV_ITEMS.map(item => {
        const isActive = activePage === item.page;
        return (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors ${isActive ? `${item.activeBg} ${item.activeBorder} text-white` : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}
            title={item.title}
          >
            {item.icon} {item.label}
          </button>
        );
      })}
    </div>
  );
}
