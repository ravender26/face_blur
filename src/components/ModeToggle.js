/**
 * ModeToggle component.
 * Provides controls to toggle between the Video File Anonymizer and Live Webcam Feed modes.
 * 
 * @component
 * @param {Object} props - Component properties.
 * @param {string} props.activeMode - The active interface mode ("upload" or "camera").
 * @param {function(string): void} props.onModeChange - Callback fired when a new mode is selected.
 * @returns {React.ReactElement} The mode toggling tabs component.
 */
export default function ModeToggle({ activeMode, onModeChange, disabled }) {
  return (
    <div className={`flex gap-4 mb-8 bg-[#0f131d]/60 border border-slate-800/80 p-1.5 rounded-xl w-fit ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        onClick={() => !disabled && onModeChange("upload")}
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
        onClick={() => !disabled && onModeChange("camera")}
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
    </div>
  );
}
