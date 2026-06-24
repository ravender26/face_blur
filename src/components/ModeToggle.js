export default function ModeToggle({ activeMode, onModeChange }) {
  return (
    <div className="flex gap-4 mb-8 bg-[#0f131d]/60 border border-slate-800/80 p-1.5 rounded-xl w-fit">
      <button
        onClick={() => onModeChange("upload")}
        className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          activeMode === "upload"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Video File Anonymizer
      </button>
      <button
        onClick={() => onModeChange("camera")}
        className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          activeMode === "camera"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Live Webcam Feed
      </button>
    </div>
  );
}
