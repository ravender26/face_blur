"use client";

import { useState, useRef, useEffect } from "react";
import Header from "../../components/Header";
import ModeToggle from "../../components/ModeToggle";
import SelectiveFacePreservation from "../../components/SelectiveFacePreservation";
import VideoAnonymizer from "../../components/VideoAnonymizer";
import WebcamAnonymizer from "../../components/WebcamAnonymizer";
import ProcessingStages from "../../components/ProcessingStages";
import HowItWorks from "../../components/HowItWorks";
import ConsoleLogs from "../../components/ConsoleLogs";

/**
 * Workspace Page component (route: /workspace).
 * Hosts the core anonymization dashboard workspace.
 * Coordinates state for current processing runs, target face profiles, and custom logs.
 */
export default function WorkspacePage() {
  const [activeMode, setActiveMode] = useState("upload"); // 'upload' | 'camera'
  const [status, setStatus] = useState("idle"); // 'idle', 'loading-model', 'processing', 'encoding', 'done'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);

  const [excludeTarget, setExcludeTarget] = useState(false);
  const [targetDescriptor, setTargetDescriptor] = useState(null);

  const excludeTargetRef = useRef(excludeTarget);
  const targetDescriptorRef = useRef(targetDescriptor);

  // Sync refs with state values for requestAnimationFrame loop access
  useEffect(() => {
    excludeTargetRef.current = excludeTarget;
  }, [excludeTarget]);

  useEffect(() => {
    targetDescriptorRef.current = targetDescriptor;
  }, [targetDescriptor]);

  // Console logging interceptor hook
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleLog = (type, ...args) => {
      const msg = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message + "\n" + arg.stack;
          return typeof arg === "object" ? JSON.stringify(arg) : String(arg);
        })
        .join(" ");
      setConsoleLogs((prev) => [...prev.slice(-40), `[${type}] ${msg}`]);
    };

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      handleLog("log", ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      handleLog("warn", ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      handleLog("error", ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  const handleModeChange = (mode) => {
    if (mode === activeMode) return;
    setActiveMode(mode);
    setStatus("idle");
    setLoading(false);
    setError(null);
  };

  return (
    <main className="flex-1 bg-[#090b11] text-slate-100 min-h-screen relative overflow-hidden font-sans">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />

      {/* Main Dashboard Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10">
        <Header />

        <ModeToggle activeMode={activeMode} onModeChange={handleModeChange} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left panel: Anonymizer modules based on Mode */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
              {activeMode === "upload" ? (
                <VideoAnonymizer
                  excludeTargetRef={excludeTargetRef}
                  targetDescriptorRef={targetDescriptorRef}
                  status={status}
                  setStatus={setStatus}
                  loading={loading}
                  setLoading={setLoading}
                  error={error}
                  setError={setError}
                />
              ) : (
                <WebcamAnonymizer
                  excludeTargetRef={excludeTargetRef}
                  targetDescriptorRef={targetDescriptorRef}
                  loading={loading}
                  setLoading={setLoading}
                  error={error}
                  setError={setError}
                />
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
            <SelectiveFacePreservation
              excludeTarget={excludeTarget}
              setExcludeTarget={setExcludeTarget}
              targetDescriptor={targetDescriptor}
              setTargetDescriptor={setTargetDescriptor}
              setError={setError}
            />

            <ProcessingStages status={status} activeMode={activeMode} />

            <HowItWorks />

            <ConsoleLogs consoleLogs={consoleLogs} />
          </div>
        </div>
      </div>
    </main>
  );
}
