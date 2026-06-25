"use client";

import { useWorkspace } from "../context/WorkspaceContext";

/**
 * ProcessingStages component.
 * Displays a visual timeline checklist of stages (Initialize, Process, Encode) showing completed, active, and upcoming stages.
 * 
 * @component
 * @returns {React.ReactElement} The visual stages tracking card.
 */
export default function ProcessingStages() {
  const { status, activeMode } = useWorkspace();
  const steps = [
    {
      key: "loading-model",
      label: activeMode === "camera" ? "Initialize Camera Blur Model" : "Initialize Video Blur Model",
      desc: "Loading WebAssembly vision runtime & BlazeFace detector",
    },
    {
      key: "processing",
      label: activeMode === "camera" ? "Live Feed Detection & Blur" : "Client-Side Detection & Blur",
      desc: activeMode === "camera" ? "Capturing webcam stream and performing frame-by-frame face anonymization" : "Processing frames on canvas with hardware-accelerated filters",
    },
    {
      key: "encoding",
      label: activeMode === "camera" ? "Live Feed Recording" : "MediaRecorder Encoding",
      desc: activeMode === "camera" ? "Optionally record the anonymized webcam session to a downloadable file" : "Packaging video & audio tracks into browser-native container",
    },
  ];

  return (
    <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl">
      <h3 className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
        <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        Processing Stages
      </h3>

      <ul className="space-y-5">
        {steps.map((step, idx) => {
          const statusOrder = ["loading-model", "processing", "encoding", "done"];
          const stepIndex = statusOrder.indexOf(status);
          const isCurrent = status === step.key;
          const isDone = stepIndex > idx;

          return (
            <li key={step.key} className="flex gap-4 items-start">
              <div className="mt-0.5">
                {isDone ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  <div className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500 text-violet-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping"></span>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-slate-950 border border-slate-800 text-slate-600 flex items-center justify-center text-xs font-semibold font-mono">
                    {idx + 1}
                  </div>
                )}
              </div>
              <div>
                <h4 className={`text-xs font-semibold ${isDone ? "text-slate-300 line-through opacity-70" : isCurrent ? "text-violet-400" : "text-slate-500"}`}>
                  {step.label}
                </h4>
                <p className={`text-[10px] mt-0.5 leading-relaxed ${isCurrent ? "text-slate-400" : "text-slate-600"}`}>
                  {step.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
