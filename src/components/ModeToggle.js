"use client";

import { useWorkspace } from "../context/WorkspaceContext";

/**
 * ModeToggle component.
 * Provides controls to toggle between the Video File Anonymizer and Live Webcam Feed modes.
 * 
 * @component
 * @returns {React.ReactElement} The mode toggling tabs component.
 */
export default function ModeToggle() {
  const { activeMode, handleModeChange, registeringFace: disabled } = useWorkspace();

  return (
    <div className={`flex gap-4 mb-8 bg-[#0f131d]/60 border border-slate-800/80 p-1.5 rounded-xl w-fit ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        onClick={() => !disabled && handleModeChange("upload")}
        disabled={disabled}
        className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          activeMode === "upload"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
            : disabled
            ? "text-slate-600 cursor-not-allowed"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Video File Anonymizer
      </button>
      <button
        onClick={() => !disabled && handleModeChange("camera")}
        disabled={disabled}
        className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          activeMode === "camera"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
            : disabled
            ? "text-slate-600 cursor-not-allowed"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Live Webcam Feed
      </button>
      <button
        onClick={() => !disabled && handleModeChange("rtsp")}
        disabled={disabled}
        className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          activeMode === "rtsp"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
            : disabled
            ? "text-slate-600 cursor-not-allowed"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        CCTV / RTSP Stream
      </button>
    </div>
  );
}
