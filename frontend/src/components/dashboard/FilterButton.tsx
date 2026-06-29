export default function FilterButton() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5 px-2.5 py-1.5 rounded-lg transition-all duration-150"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
      Filter
    </button>
  );
}
