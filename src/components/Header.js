/**
 * Header component for the FocusBlur application.
 * Renders the brand logo, application title, and a status badge indicating client-side WebAssembly (WASM) face blurring is active.
 * 
 * @component
 * @returns {React.ReactElement} The rendered header section.
 */
export default function Header() {
  return (
    <header className="flex justify-between items-center mb-12 border-b border-slate-800/80 pb-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-xl shadow-lg shadow-violet-500/20">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            FocusBlur
          </h1>
          <p className="text-xs text-slate-400">Automated Face Anonymization Tool</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
          Client-Side WASM Blurring Active
        </span>
      </div>
    </header>
  );
}
