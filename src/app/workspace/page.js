"use client";

import Link from "next/link";
import Header from "../../components/Header";
import ModeToggle from "../../components/ModeToggle";
import SelectiveFacePreservation from "../../components/SelectiveFacePreservation";
import VideoAnonymizer from "../../components/VideoAnonymizer";
import WebcamAnonymizer from "../../components/WebcamAnonymizer";
import RtspAnonymizer from "../../components/RtspAnonymizer";
import ProcessingStages from "../../components/ProcessingStages";
import HowItWorks from "../../components/HowItWorks";
import ConsoleLogs from "../../components/ConsoleLogs";
import LoginModal from "../../components/LoginModal";
import { useAuth } from "../../context/AuthContext";
import { WorkspaceProvider, useWorkspace } from "../../context/WorkspaceContext";

/**
 * DashboardContent component.
 * Renders the dashboard workspace inside the WorkspaceProvider context.
 */
function DashboardContent() {
  const { activeMode, error } = useWorkspace();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10">
      <Header />

      <ModeToggle />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left panel: Anonymizer modules based on Mode */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
            {activeMode === "upload" ? (
              <VideoAnonymizer />
            ) : activeMode === "camera" ? (
              <WebcamAnonymizer />
            ) : (
              <RtspAnonymizer />
            )}
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium flex items-start gap-2.5 shadow-lg animate-pulse">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right panel: Active state configurations */}
        <div className="space-y-6">
          <SelectiveFacePreservation />

          <ProcessingStages />

          <HowItWorks />

          <ConsoleLogs />
        </div>
      </div>
    </div>
  );
}

/**
 * Workspace Page component (route: /workspace).
 * Hosts the core anonymization dashboard workspace protected by Google Auth.
 */
export default function WorkspacePage() {
  const { user, loading: authLoading, triggerLoginModal } = useAuth();

  if (authLoading) {
    return (
      <main className="flex-1 bg-[#090b11] text-slate-100 min-h-screen flex flex-col items-center justify-center relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex-1 bg-[#090b11] text-slate-100 min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Background ambient glows */}
        <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-fuchsia-600/10 blur-[130px] pointer-events-none" />

        <div className="w-full max-w-md bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10 text-center space-y-6 transform transition-all duration-350 hover:border-violet-500/20">
          <div className="inline-flex p-4 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-2xl shadow-lg">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Access Restricted
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              To start preserving target faces and anonymizing webcam or video files locally, please authenticate with your Google account.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={triggerLoginModal}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl text-xs text-white font-bold transition-all shadow-md flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign In with Google
            </button>
            <Link
              href="/"
              className="w-full py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800/85 rounded-xl text-xs text-slate-450 font-semibold transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
        <LoginModal />
      </main>
    );
  }

  return (
    <WorkspaceProvider>
      <main className="flex-1 bg-[#090b11] text-slate-100 min-h-screen relative overflow-hidden font-sans">
        {/* Background ambient glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />

        <DashboardContent />
        
        <LoginModal />
      </main>
    </WorkspaceProvider>
  );
}
