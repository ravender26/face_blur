"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState(null);
  const [blurredVideoUrl, setBlurredVideoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugText, setDebugText] = useState("");
  const [consoleLogs, setConsoleLogs] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleLog = (type, ...args) => {
      const msg = args.map(arg => {
        if (arg instanceof Error) return arg.message + "\n" + arg.stack;
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      }).join(' ');
      setConsoleLogs(prev => [...prev.slice(-40), `[${type}] ${msg}`]);
    };
    
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.log = (...args) => {
      originalLog(...args);
      handleLog('log', ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      handleLog('warn', ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      handleLog('error', ...args);
    };
    
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // Statuses: 'idle', 'loading-model', 'processing', 'encoding', 'done'
  const [status, setStatus] = useState("idle");
  const fileInputRef = useRef(null);

  // Refs for client-side video processing
  const sourceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const activeDetectorRef = useRef(null);
  const activeRecorderRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        selectFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        selectFile(selectedFile);
      }
    }
  };

  const validateFile = (file) => {
    const validTypes = ["video/mp4", "video/quicktime", "video/mov"];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".mov")) {
      setError("Please upload an MP4 or MOV video file.");
      return false;
    }
    setError(null);
    return true;
  };

  const selectFile = (file) => {
    setFile(file);
    setBlurredVideoUrl(null);
    setStatus("idle");
    const localUrl = URL.createObjectURL(file);
    setOriginalVideoUrl(localUrl);
  };

  const handleSubmit = async () => {
    if (!file || !sourceVideoRef.current) return;

    setLoading(true);
    setError(null);
    setBlurredVideoUrl(null);
    setStatus("loading-model");

    let detector = null;
    let mediaRecorder = null;
    let animationFrameId = null;

    try {
      // 1. Dynamic import of MediaPipe Tasks Vision to avoid SSR build errors
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");

      // 2. Initialize Resolver and Detector
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.15,
      });

      activeDetectorRef.current = detector;

      // 3. Setup Canvas and Video metadata
      const video = sourceVideoRef.current;
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Target canvas element is not ready.");
      }

      if (video.readyState < 1) {
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Could not get 2D context from canvas.");
      }

      setStatus("processing");

      // 4. Setup MediaRecorder with canvas frame capture
      const fps = 30;
      const canvasStream = canvas.captureStream ? canvas.captureStream(fps) : canvas.mozCaptureStream(fps);

      // Attempt to clone and merge audio track from source video
      try {
        const videoStream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
        if (videoStream) {
          const audioTracks = videoStream.getAudioTracks();
          if (audioTracks && audioTracks.length > 0) {
            canvasStream.addTrack(audioTracks[0].clone());
          }
        }
      } catch (audioErr) {
        console.warn("Could not capture or clone audio track:", audioErr);
      }

      // Check browser supported mime type for best encoding compatibility
      const mimeTypes = [
        "video/mp4;codecs=avc1",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/ogg"
      ];
      let selectedMimeType = "";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error("No supported video recording MIME types found in this browser.");
      }

      const chunks = [];
      mediaRecorder = new MediaRecorder(canvasStream, { mimeType: selectedMimeType });
      activeRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        const localBlurredUrl = URL.createObjectURL(blob);
        setBlurredVideoUrl(localBlurredUrl);
        setStatus("done");
        setLoading(false);

        // Clean up detector instance to free up GPU memory
        if (detector) {
          try {
            detector.close();
          } catch (err) {
            console.error("Error closing detector:", err);
          }
        }
        activeDetectorRef.current = null;
        activeRecorderRef.current = null;
      };

      // 5. Start playback and recording
      video.currentTime = 0;
      video.muted = true; // Muted to prevent audio feedback loop/play noise while processing
      
      mediaRecorder.start();
      await video.play();

      let lastTime = -1;

      // Offscreen buffer canvas to avoid browser restrictions on drawing a canvas onto itself
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");

      const processFrame = () => {
        try {
          if (video.paused || video.ended) {
            setStatus("encoding");
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
            return;
          }

          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;

            // Draw the current video frame onto the processing canvas
            ctx.drawImage(video, 0, 0, width, height);

            // Run the face detector on the current canvas frame (using IMAGE mode for robustness)
            const detectionResult = detector.detect(canvas);

            if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
              const first = detectionResult.detections[0].boundingBox;
              setDebugText(`Detected face! x: ${Math.round(first.originX)}, y: ${Math.round(first.originY)}, w: ${Math.round(first.width)}, h: ${Math.round(first.height)}`);
            } else {
              setDebugText("No faces detected in this frame");
            }

            if (detectionResult && detectionResult.detections) {
              for (const detection of detectionResult.detections) {
                const bbox = detection.boundingBox;
                if (bbox) {
                  let x = bbox.originX;
                  let y = bbox.originY;
                  let w = bbox.width;
                  let h = bbox.height;

                  // Handle normalized coordinates (some MediaPipe versions return 0.0 to 1.0)
                  if (Math.abs(x) <= 1.0 && Math.abs(w) <= 1.0) {
                    x = x * width;
                    y = y * height;
                    w = w * width;
                    h = h * height;
                  }

                  // Secure coordinate clamping
                  x = Math.max(0, Math.min(x, width));
                  y = Math.max(0, Math.min(y, height));
                  w = Math.max(0, Math.min(w, width - x));
                  h = Math.max(0, Math.min(h, height - y));

                  if (w > 4 && h > 4 && tempCtx) {
                    // Set temp canvas dimensions to match bounding box
                    tempCanvas.width = w;
                    tempCanvas.height = h;

                    // Copy the face region from the main canvas to the temp canvas
                    tempCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

                    // Draw the temp canvas back onto the main canvas with a blur filter
                    ctx.save();
                    ctx.filter = `blur(${Math.max(12, Math.min(w, h) / 4.5)}px)`;
                    ctx.drawImage(tempCanvas, 0, 0, w, h, x, y, w, h);
                    ctx.restore();
                  }
                }
              }
            }
          }

          animationFrameId = requestAnimationFrame(processFrame);
        } catch (frameErr) {
          console.error("Error in processFrame loop:", frameErr);
          setError("Error processing frame: " + frameErr.message);
          setStatus("idle");
          setLoading(false);
          if (mediaRecorder && mediaRecorder.state === "recording") {
            try {
              mediaRecorder.stop();
            } catch (_) {}
          }
        }
      };

      // Handle onended event explicitly
      video.onended = () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        setStatus("encoding");
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      };

      animationFrameId = requestAnimationFrame(processFrame);

    } catch (err) {
      console.error("Client-side face blurring error:", err);
      setError(err.message || "Failed to process video client-side. Please verify video format compatibility.");
      setStatus("idle");
      setLoading(false);

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (mediaRecorder && mediaRecorder.state === "recording") {
        try {
          mediaRecorder.stop();
        } catch (_) {}
      }
      if (detector) {
        try {
          detector.close();
        } catch (_) {}
      }
      activeDetectorRef.current = null;
      activeRecorderRef.current = null;
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const resetAll = () => {
    if (sourceVideoRef.current) {
      sourceVideoRef.current.pause();
      sourceVideoRef.current.currentTime = 0;
      sourceVideoRef.current.muted = false;
    }
    if (activeRecorderRef.current && activeRecorderRef.current.state === "recording") {
      try {
        activeRecorderRef.current.stop();
      } catch (_) {}
    }
    if (activeDetectorRef.current) {
      try {
        activeDetectorRef.current.close();
      } catch (_) {}
    }
    activeDetectorRef.current = null;
    activeRecorderRef.current = null;

    setFile(null);
    setOriginalVideoUrl(null);
    setBlurredVideoUrl(null);
    setStatus("idle");
    setError(null);
    setDebugText("");
  };

  return (
    <main className="flex-1 bg-[#090b11] text-slate-100 min-h-screen relative overflow-hidden font-sans">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />

      {/* Main Dashboard Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
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

        {/* Dashboard Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left panel: Upload & Process controls */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">

              {!originalVideoUrl ? (
                /* Dropzone configuration */
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerFileInput}
                  className={`relative group border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${dragActive
                    ? "border-violet-500 bg-violet-600/5 shadow-inner"
                    : "border-slate-800 bg-[#0c0e14]/55 hover:border-slate-700 hover:bg-[#0c0e14]/90"
                    }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="video/mp4, video/quicktime, video/mov"
                    className="hidden"
                  />

                  <div className="flex flex-col items-center">
                    <div className="mb-4 p-4 rounded-full bg-slate-900 border border-slate-800 group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-slate-200 mb-1">
                      Drag & drop your video here
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      or click to browse your files
                    </p>
                    <span className="inline-block px-3 py-1 bg-slate-900 border border-slate-800/80 rounded-md text-[10px] text-slate-500 font-mono">
                      MP4, MOV (max 100MB)
                    </span>
                  </div>
                </div>
              ) : (
                /* Selected video actions */
                <div className="space-y-6">
                  <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 font-mono truncate max-w-[250px] sm:max-w-md">
                        {file?.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono">
                        {(file?.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={resetAll}
                      disabled={loading}
                      className="px-3 py-1.5 border border-slate-800 hover:border-rose-500/40 text-xs rounded-md text-slate-400 hover:text-rose-400 bg-slate-950/40 hover:bg-rose-500/5 transition-all"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Video previews */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Source file preview */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                        Original Video
                      </label>
                      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
                        <video
                          ref={sourceVideoRef}
                          src={originalVideoUrl}
                          className="w-full h-full object-contain"
                          controls={status === "idle" || status === "done"}
                        />
                      </div>
                    </div>

                    {/* Processed/Blurred video container */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                        Blurred Video Output
                      </label>
                      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
                        {blurredVideoUrl ? (
                          <video
                            src={blurredVideoUrl}
                            className="w-full h-full object-contain"
                            controls
                            autoPlay
                          />
                        ) : (status === "loading-model" || status === "processing" || status === "encoding") ? (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <canvas
                              ref={canvasRef}
                              className="w-full h-full object-contain"
                            />
                            {status === "loading-model" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 text-center p-4">
                                <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-3"></div>
                                <p className="text-xs font-semibold text-violet-400">Loading Face Detection AI...</p>
                                <p className="text-[10px] text-slate-500 mt-1">Initializing WebAssembly runtime and models</p>
                              </div>
                            )}
                            {status === "encoding" && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 text-center p-4">
                                <div className="w-10 h-10 border-4 border-fuchsia-500/20 border-t-fuchsia-500 rounded-full animate-spin mb-3"></div>
                                <p className="text-xs font-semibold text-fuchsia-400">Encoding Output Video...</p>
                                <p className="text-[10px] text-slate-500 mt-1">Packaging tracks into video container</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                            <svg className="w-8 h-8 text-slate-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <p className="text-xs">Click &quot;Process Video&quot; to apply blurring effect</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  {!blurredVideoUrl && !loading && (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSubmit}
                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-sm font-semibold rounded-lg text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/35 transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Process Video
                      </button>
                    </div>
                  )}

                  {blurredVideoUrl && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Face Blurring Complete!
                      </span>
                      <a
                        href={blurredVideoUrl}
                        download={`blurred-${file?.name || "video.mp4"}`}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Blurred Video
                      </a>
                    </div>
                  )}

                  {debugText && (
                    <div className="text-xs font-mono text-violet-400 mt-2 bg-slate-900/60 p-2 rounded-md border border-slate-800/60 text-center">
                      {debugText}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium flex items-start gap-2.5 shadow-lg">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right panel: Active state metrics and steps */}
          <div className="space-y-6">

            {/* Status Steps */}
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Processing Stages
              </h3>

              <ul className="space-y-5">
                {[
                  {
                    key: "loading-model",
                    label: "Initialize AI Model",
                    desc: "Loading WebAssembly vision runtime & BlazeFace detector",
                  },
                  {
                    key: "processing",
                    label: "Client-Side Detection & Blur",
                    desc: "Processing frames on canvas with hardware-accelerated filters",
                  },
                  {
                    key: "encoding",
                    label: "MediaRecorder Encoding",
                    desc: "Packaging video & audio tracks into browser-native container",
                  },
                ].map((step, idx) => {
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
                        <h4 className={`text-xs font-semibold ${isDone ? "text-slate-300 line-through opacity-70" : isCurrent ? "text-violet-400" : "text-slate-500"
                          }`}>
                          {step.label}
                        </h4>
                        <p className={`text-[10px] mt-0.5 leading-relaxed ${isCurrent ? "text-slate-400" : "text-slate-600"
                          }`}>
                          {step.desc}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Quick Tutorial / Architecture Card */}
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

            {/* Debug Console Logs */}
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Console Logs</h3>
              <div className="bg-slate-950 p-4 rounded-xl max-h-48 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1">
                {consoleLogs.map((log, idx) => (
                  <div key={idx} className={log.startsWith('[error]') ? 'text-rose-400' : log.startsWith('[warn]') ? 'text-amber-400' : 'text-slate-400'}>
                    {log}
                  </div>
                ))}
                {consoleLogs.length === 0 && <div className="text-slate-600">No logs captured yet</div>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
