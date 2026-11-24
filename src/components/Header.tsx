import type { ActiveSection } from '../types/medroute';

interface HeaderProps {
  activeSection: ActiveSection;
  onNavigate: (section: ActiveSection) => void;
  onResetJourney: () => void;
  hasResults: boolean;
  hasSelectedProvider: boolean;
  compareCount: number;
}

export function Header({
  activeSection,
  onNavigate,
  onResetJourney,
  hasResults,
  hasSelectedProvider,
  compareCount,
}: HeaderProps) {
  const navItems: Array<{
    id: ActiveSection;
    label: string;
    disabled?: boolean;
  }> = [
    { id: 'search', label: 'Search' },
    { id: 'results', label: 'Results', disabled: !hasResults },
    { id: 'details', label: 'Details', disabled: !hasSelectedProvider },
    {
      id: 'compare',
      label: compareCount > 0 ? `Compare (${compareCount})` : 'Compare',
    },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('search')}
          className="text-xl font-bold tracking-tight text-[#0F2942] font-display whitespace-nowrap shrink-0"
        >
          MedRoute
        </button>

        {/* Zone 2: Clean single-line typography navigation links */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-4 sm:gap-6 overflow-x-auto"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium pb-0.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-[#0F2942] border-[#0F766E]'
                    : item.disabled
                      ? 'text-slate-300 border-transparent cursor-not-allowed'
                      : 'text-slate-600 border-transparent hover:text-[#0F2942] hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onResetJourney}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
          >
            New Journey
          </button>
        </div>
      </div>
    </header>
  );
}
