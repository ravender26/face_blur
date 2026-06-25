"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";

/**
 * Header component for the FocusBlur application.
 * Renders the brand logo, application title, and a status badge indicating client-side WebAssembly (WASM) face blurring is active.
 * Shows user profile information and a sign-out button when authenticated.
 * Uses Next.js Link to allow returning to the home landing page.
 * 
 * @component
 * @returns {React.ReactElement} The rendered header section.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { registeringFace } = useWorkspace();

  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12 border-b border-slate-800/80 pb-6">
      <Link
        href={registeringFace ? "#" : "/"}
        className={`flex items-center gap-3 group ${registeringFace ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="p-2.5 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-xl shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform duration-300">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent group-hover:from-slate-50 group-hover:to-slate-200 transition-all">
            FocusBlur
          </h1>
          <p className="text-xs text-slate-400">Automated Face Anonymization Tool</p>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
          Client-Side WASM Blurring Active
        </span>

        {user && (
          <div className="flex items-center gap-3 pl-3 sm:border-l border-slate-800/80">
            <img
              src={user.picture}
              alt={user.name}
              className="w-8 h-8 rounded-full border border-slate-700 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="hidden xs:block text-left">
              <p className="text-[11px] font-bold text-slate-200 leading-tight">{user.name}</p>
              <p className="text-[9px] text-slate-500 truncate max-w-[120px]">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="px-2.5 py-1.5 border border-slate-850 hover:border-rose-500/30 text-[10px] font-bold rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 transition-all cursor-pointer shadow-sm"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
