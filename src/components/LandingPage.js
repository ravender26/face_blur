/**
 * LandingPage component.
 * Displays a premium, professional landing page explaining the application's capabilities
 * (Webcam feed anonymization, video file uploads, selective target preservation, and local WASM security).
 * Prominently features a "Try FocusBlur Now" CTA button to open the dashboard.
 * 
 * @component
 * @param {Object} props - Component properties.
 * @param {function(): void} props.onTryNow - Callback triggered when the user clicks the Try Now CTA.
 * @returns {React.ReactElement} The rendered landing page.
 */
export default function LandingPage({ onTryNow }) {
  return (
    <div className="min-h-screen text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden bg-[#090b11]">
      {/* Background glowing decorations */}
      <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] rounded-full bg-fuchsia-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Navigation Header */}
      <nav className="max-w-7xl mx-auto w-full px-6 py-6 flex justify-between items-center border-b border-slate-800/40 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-lg shadow-lg shadow-violet-500/15">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            FocusBlur
          </span>
        </div>
        <button
          onClick={onTryNow}
          className="px-4 py-2 border border-slate-800 hover:border-violet-500/50 hover:bg-violet-500/5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white transition-all shadow-md"
        >
          Launch Workspace
        </button>
      </nav>

      {/* Main Content Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 md:py-24 max-w-5xl mx-auto relative z-10 space-y-16">
        
        {/* Title & Slogan */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
            100% Client-Side Privacy
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight md:leading-none">
            Secure, Instant Face Anonymization{" "}
            <span className="block mt-2 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
              Right in Your Browser
            </span>
          </h1>
          <p className="text-slate-400 text-sm md:text-lg max-w-2xl mx-auto leading-relaxed">
            Protect identities in real-time. Blur video files and live webcam streams locally using
            WebAssembly and hardware-accelerated machine learning. No servers, no uploads.
          </p>
        </div>

        {/* Call to Actions (CTA) */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <button
            onClick={onTryNow}
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-sm font-bold rounded-xl text-white shadow-xl shadow-violet-600/25 hover:shadow-violet-600/35 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 group"
          >
            Get Started Free
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        {/* Feature Grid / Capabilities */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          
          {/* Card 1: Webcam */}
          <div className="p-6 bg-[#0f131d]/40 backdrop-blur-md border border-slate-800/60 rounded-2xl hover:border-violet-500/30 transition-all group space-y-4 hover:bg-[#0c0f17]/60">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-violet-400 transition-colors">
                Live Webcam Feed Blurring
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Connect your camera and redact faces dynamically on the fly. Process streams at up to 60 FPS with hardware GPU acceleration.
              </p>
            </div>
          </div>

          {/* Card 2: Exclusions */}
          <div className="p-6 bg-[#0f131d]/40 backdrop-blur-md border border-slate-800/60 rounded-2xl hover:border-fuchsia-500/30 transition-all group space-y-4 hover:bg-[#0c0f17]/60">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-fuchsia-400 transition-colors">
                Selective Face Preservation
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Exclude target faces from redact blurring. Register profiles with selfies + videos and allow key team members to remain unblurred.
              </p>
            </div>
          </div>

          {/* Card 3: Files Upload */}
          <div className="p-6 bg-[#0f131d]/40 backdrop-blur-md border border-slate-800/60 rounded-2xl hover:border-indigo-500/30 transition-all group space-y-4 hover:bg-[#0c0f17]/60">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                Video File Anonymization
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Upload MP4 or MOV media files. Crop, blur, track, and package them client-side using native MediaRecorder APIs with audio preservation.
              </p>
            </div>
          </div>

          {/* Card 4: WebAssembly Local */}
          <div className="p-6 bg-[#0f131d]/40 backdrop-blur-md border border-slate-800/60 rounded-2xl hover:border-emerald-500/30 transition-all group space-y-4 hover:bg-[#0c0f17]/60">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                Zero Cloud Uploads (Offline Ready)
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Fully sandboxed. All scanning runs locally in your browser. Rest assured your sensitive company files and webcam streams never leave your device.
              </p>
            </div>
          </div>

        </div>

        {/* Security Shield Callout */}
        <div className="w-full p-4 bg-emerald-500/5 border border-emerald-500/15 text-emerald-400/90 rounded-2xl text-xs font-medium flex items-center justify-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Enterprise Grade Compliance: FocusBlur operates entirely on device and is safe for HIPAA, GDPR, and strict privacy environments.
        </div>

      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full px-6 py-6 border-t border-slate-800/40 text-center text-[10px] text-slate-500 relative z-10 flex flex-col sm:flex-row justify-between items-center gap-3">
        <p>&copy; {new Date().getFullYear()} FocusBlur. All rights reserved. Powered by local WASM neural networks.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-slate-350 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-slate-350 transition-colors">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
