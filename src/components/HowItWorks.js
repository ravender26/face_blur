/**
 * HowItWorks component.
 * Renders an informational explanation block regarding the application's client-side processing pipeline,
 * including HTML5 APIs, MediaPipe WebAssembly vision tasks, and MediaRecorder API.
 * 
 * @component
 * @returns {React.ReactElement} The informational block.
 */
export default function HowItWorks() {
  return (
    <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How it works
      </h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        The video is decoded frame-by-frame in your browser using standard HTML5 APIs.
        A **MediaPipe** machine learning model (compiled to WebAssembly for native performance) scans each frame,
        detecting face coordinates with GPU acceleration. Custom filters apply localized gaussian-like blur to the face regions
        on an offscreen Canvas, which are then compiled into a new video file on the client side using the **MediaRecorder** API.
      </p>
    </div>
  );
}
