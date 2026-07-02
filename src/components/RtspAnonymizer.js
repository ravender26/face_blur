"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  parseDetection,
  updateTracks,
  processRecognitionForTracks
} from "../utils/faceHelpers";

/**
 * RtspAnonymizer component.
 * Connects to CCTV/RTSP camera feeds via Next.js stream proxy, handles requestAnimationFrame
 * loop tracking, blurs faces client-side, and records the processed video streams.
 * 
 * @component
 * @returns {React.ReactElement} The RTSP live processing feed component.
 */
export default function RtspAnonymizer() {
  const {
    excludeTargetRef,
    targetDescriptorRef,
    loading,
    setLoading,
    error,
    setError,
    setStatus,
    registeringFace: disabled
  } = useWorkspace();

  const [rtspUrl, setRtspUrl] = useState("rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov");
  const [streamUrl, setStreamUrl] = useState(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isRecordingStream, setIsRecordingStream] = useState(false);
  const [streamRecordUrl, setStreamRecordUrl] = useState(null);
  const [debugText, setDebugText] = useState("");

  const rtspImageRef = useRef(null);
  const canvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const activeDetectorRef = useRef(null);
  const recorderRef = useRef(null);
  
  const faceTracksRef = useRef([]);
  const trackIdCounterRef = useRef(0);
  const streamInitializedRef = useRef(false);
  const tickCountRef = useRef(0);
  const isStreamingRef = useRef(false);

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      cleanupStream();
      if (streamRecordUrl) {
        URL.revokeObjectURL(streamRecordUrl);
      }
    };
  }, [streamRecordUrl]);

  /**
   * Resets all states, cancels loops, and closes detector models.
   */
  const cleanupStream = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch (_) {}
    }
    recorderRef.current = null;

    if (activeDetectorRef.current) {
      try {
        activeDetectorRef.current.close();
      } catch (_) {}
    }
    activeDetectorRef.current = null;

    streamInitializedRef.current = false;
    isStreamingRef.current = false;
    tickCountRef.current = 0;
    setIsStreamActive(false);
    setIsRecordingStream(false);
    setStreamUrl(null);
    setLoading(false);
    setDebugText("");
    setStatus("idle");
  };

  /**
   * Initializes the MediaPipe FaceDetector instance and begins request to Next.js stream API proxy.
   */
  const startStream = async (e) => {
    if (e) e.preventDefault();
    if (!rtspUrl.trim()) {
      setError("Please enter a valid RTSP or video URL.");
      return;
    }

    console.log("[RTSP Debug] Connect Stream clicked. URL:", rtspUrl);
    setLoading(true);
    setError(null);
    setStreamRecordUrl(null);
    setIsRecordingStream(false);
    setStatus("loading-model");

    try {
      // 1. Initialize resolver and detector models
      console.log("[RTSP Debug] Loading MediaPipe FilesetResolver...");
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

      console.log("[RTSP Debug] Creating FaceDetector model instance...");
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.15,
        minSuppressionThreshold: 0.3,
      });
      activeDetectorRef.current = detector;
      console.log("[RTSP Debug] FaceDetector initialized successfully.");

      // Create an offscreen canvas
      tempCanvasRef.current = document.createElement("canvas");

      // 2. Set the proxied url to trigger image loading
      isStreamingRef.current = true;
      setIsStreamActive(true);

      const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const targetUrl = isLocalhost 
        ? `/api/stream?url=${encodeURIComponent(rtspUrl)}` 
        : `http://127.0.0.1:9999/stream?url=${encodeURIComponent(rtspUrl)}`;

      console.log(`[RTSP Debug] Environment: ${isLocalhost ? "localhost" : "production/deployed"}. Setting stream URL target to:`, targetUrl);
      setStreamUrl(targetUrl);

      // Start the frame processing loop immediately (we'll check dimensions dynamically in the loop)
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      animationFrameIdRef.current = requestAnimationFrame(processRtspFrame);
    } catch (err) {
      console.error("[RTSP Debug] Failed to start RTSP stream:", err);
      setError(err.message || "Failed to initialize face detector.");
      cleanupStream();
    }
  };

  /**
   * Called when the proxied MJPEG stream first loads inside the <img> element.
   * Handled dynamically inside the loop instead.
   */
  const handleImageLoad = () => {
    // Handled dynamically in processRtspFrame loop
  };

  /**
   * Called if the proxied MJPEG stream fails to load.
   */
  const handleImageError = () => {
    console.error("[RTSP Debug] Proxied image stream load error.");
    const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isLocalhost) {
      setError("Failed to connect to the RTSP stream. Since the application is deployed in the cloud, please ensure you have started the local helper proxy on your computer (.venv\\Scripts\\python rtsp_proxy.py) and that your camera stream address is valid.");
    } else {
      setError("Failed to connect to the RTSP stream. Please verify that the URL is correct, and the camera feed is active and accessible.");
    }
    cleanupStream();
  };

  /**
   * The core frame processing loop. Draws stream frames, performs face detection
   * and face comparison, and blurs non-exempt faces.
   */
  const processRtspFrame = async () => {
    const img = rtspImageRef.current;
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const detector = activeDetectorRef.current;

    // Periodic state logging to console every 100 ticks
    tickCountRef.current++;
    if (tickCountRef.current % 100 === 0) {
      console.log(`[RTSP Debug] Loop tick #${tickCountRef.current}. imgRef: ${!!img}, naturalSize: ${img ? img.naturalWidth : 0}x${img ? img.naturalHeight : 0}, canvasRef: ${!!canvas}, isStreaming: ${isStreamingRef.current}`);
    }

    if (!isStreamingRef.current) {
      return; // Stop the loop entirely!
    }

    if (!img || !canvas || !tempCanvas || !detector) {
      animationFrameIdRef.current = requestAnimationFrame(processRtspFrame);
      return;
    }

    try {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      if (width === 0 || height === 0) {
        // Stream not ready or still buffering, loop again
        animationFrameIdRef.current = requestAnimationFrame(processRtspFrame);
        return;
      }

      // Stream is now actively delivering frames!
      if (!streamInitializedRef.current) {
        streamInitializedRef.current = true;
        console.log(`[RTSP Debug] First frame resolved! Dimensions: ${width}x${height}`);
        setLoading(false);
        setStatus("processing");
      }

      // Sync canvas dimensions
      if (width > 0 && height > 0) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          tempCanvas.width = width;
          tempCanvas.height = height;
        }

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tempCtx = tempCanvas.getContext("2d");
        const timestampMs = performance.now();

        if (tempCtx) {
          tempCtx.clearRect(0, 0, width, height);
          tempCtx.drawImage(img, 0, 0, width, height);
        }

        // Run face detection on the raw frame
        const detectionResult = detector.detectForVideo(tempCanvas, timestampMs);

        if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
          setDebugText(`Detected ${detectionResult.detections.length} face(s) in CCTV stream!`);

          const currentDetections = [];
          for (const detection of detectionResult.detections) {
            const parsed = parseDetection(detection, width, height);
            if (parsed) {
              currentDetections.push(parsed);
            }
          }

          // Match detections to existing tracks
          faceTracksRef.current = updateTracks(
            currentDetections,
            faceTracksRef.current,
            excludeTargetRef.current,
            targetDescriptorRef.current,
            tempCanvas,
            width,
            height,
            trackIdCounterRef
          );

          // Asynchronously resolve face identities (matches descriptor profile)
          processRecognitionForTracks(
            faceTracksRef.current,
            excludeTargetRef.current,
            targetDescriptorRef.current,
            tempCanvas,
            width,
            height
          );

          // Draw the blurring effect on non-target faces
          for (const det of currentDetections) {
            const track = faceTracksRef.current.find(
              (t) => t.missedFrames === 0 && Math.abs(t.centerX - det.centerX) < 2 && Math.abs(t.centerY - det.centerY) < 2
            );
            const isTargetFace = track ? track.isTarget : false;

            if (!isTargetFace && det.side > 4 && tempCtx) {
              const blurRadius = Math.max(12, det.side / 4.5);
              const pad = Math.round(blurRadius * 1.5);

              const cropX = Math.max(0, det.x - pad);
              const cropY = Math.max(0, det.y - pad);
              const cropW = Math.min(width - cropX, det.side + pad * 2);
              const cropH = Math.min(height - cropY, det.side + pad * 2);

              const offsetX = det.x - cropX;
              const offsetY = det.y - cropY;

              const faceCanvas = document.createElement("canvas");
              faceCanvas.width = cropW;
              faceCanvas.height = cropH;
              const faceCtx = faceCanvas.getContext("2d");
              faceCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

              const blurredFaceCanvas = document.createElement("canvas");
              blurredFaceCanvas.width = det.side;
              blurredFaceCanvas.height = det.side;
              const blurredFaceCtx = blurredFaceCanvas.getContext("2d");

              blurredFaceCtx.filter = `blur(${blurRadius}px)`;
              blurredFaceCtx.drawImage(faceCanvas, -offsetX, -offsetY);

              tempCtx.drawImage(blurredFaceCanvas, det.x, det.y);
            }
          }
        } else {
          setDebugText("No faces detected in CCTV stream");
          faceTracksRef.current.forEach((t) => t.missedFrames++);
          faceTracksRef.current = faceTracksRef.current.filter((t) => t.missedFrames < 15);
        }

        // Output final frame to visible canvas
        ctx.drawImage(tempCanvas, 0, 0, width, height);
      }

      animationFrameIdRef.current = requestAnimationFrame(processRtspFrame);
    } catch (frameErr) {
      console.error("Error in CCTV processing frame:", frameErr);
      animationFrameIdRef.current = requestAnimationFrame(processRtspFrame);
    }
  };

  /**
   * Starts a MediaRecorder instance capturing the canvas element stream.
   */
  const startStreamRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setStreamRecordUrl(null);
    const fps = 30;
    const stream = canvas.captureStream ? canvas.captureStream(fps) : canvas.mozCaptureStream(fps);

    const mimeTypes = [
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    let selectedMimeType = "";
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMimeType = mime;
        break;
      }
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMimeType });
      const localUrl = URL.createObjectURL(blob);
      setStreamRecordUrl(localUrl);
      setIsRecordingStream(false);
    };

    recorder.start();
    setIsRecordingStream(true);
    setStatus("encoding");
  };

  /**
   * Stops active camera recording streams.
   */
  const stopStreamRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setStatus("processing");
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Offscreen image stream target (essential for frame capture) */}
      {streamUrl && (
        <img
          ref={rtspImageRef}
          src={streamUrl}
          alt="raw-rtsp-stream-source"
          onError={handleImageError}
          className="absolute -left-[9999px] -top-[9999px] w-[640px] h-[480px] pointer-events-none"
        />
      )}

      <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-300 font-mono">
            CCTV / RTSP Stream Face Blur
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            {isStreamActive ? "CCTV feed connected & active" : "Stream disconnected"}
          </p>
        </div>
        {isStreamActive && (
          <button
            onClick={() => cleanupStream()}
            disabled={loading || disabled}
            className={`px-3 py-1.5 border border-slate-800 text-xs rounded-md text-slate-400 bg-slate-950/40 transition-all ${
              loading || disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-rose-500/40 hover:text-rose-400 hover:bg-rose-500/5"
            }`}
          >
            Disconnect Stream
          </button>
        )}
      </div>

      {!isStreamActive && !loading && (
        <form onSubmit={startStream} className="space-y-4 bg-slate-950/45 p-6 rounded-xl border border-slate-800/85">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 font-mono block">
              CCTV / RTSP Feed Address:
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                placeholder="rtsp://admin:password@192.168.1.100:554/h264"
                disabled={disabled}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-violet-500/60 font-mono"
              />
              <button
                type="submit"
                disabled={disabled}
                className={`px-6 py-2.5 text-xs font-semibold rounded-lg text-white shadow-lg transition-all flex items-center gap-2 ${
                  disabled
                    ? "bg-slate-800 text-slate-550 cursor-not-allowed"
                    : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-500/25"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Connect Stream
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-1">
              Note: Browsers do not support RTSP directly. Next.js will proxy the stream locally using Python and OpenCV. Feel free to input public test RTSP feeds or custom network links.
            </p>
          </div>
        </form>
      )}

      {/* Main Canvas view panel */}
      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain ${isStreamActive ? "block" : "hidden"}`}
        />

        {isRecordingStream && isStreamActive && (
          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Recording CCTV Feed...
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 text-center p-4">
            <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold text-violet-400">Loading Vision Models & Establishing Connection...</p>
            <p className="text-[10px] text-slate-500 mt-1">Spawning local Python OpenCV backend streamer</p>
          </div>
        )}

        {!isStreamActive && !loading && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <div className="mb-4 p-4 rounded-full bg-slate-900 border border-slate-800">
              <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">CCTV Stream Offline</h3>
            <p className="text-xs text-slate-400 mb-2">Input the stream link above to access the CCTV stream and blur faces in real-time</p>
          </div>
        )}
      </div>

      {isStreamActive && (
        <div className="flex justify-between items-center pt-2">
          <div className="flex gap-3">
            {!isRecordingStream ? (
              <button
                onClick={startStreamRecording}
                disabled={disabled}
                className={`px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-all flex items-center gap-2 shadow-lg ${
                  disabled
                    ? "bg-slate-850 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-rose-600 hover:bg-rose-500 shadow-rose-500/15"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white"></span>
                Start Recording Feed
              </button>
            ) : (
              <button
                onClick={stopStreamRecording}
                disabled={disabled}
                className={`px-5 py-2.5 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  disabled
                    ? "text-slate-500 opacity-50 cursor-not-allowed"
                    : "hover:bg-slate-850 hover:border-slate-700 text-rose-400"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                Stop Recording
              </button>
            )}
          </div>

          {streamRecordUrl && (
            <a
              href={disabled ? undefined : streamRecordUrl}
              download="cctv-stream-blurred.mp4"
              onClick={(e) => disabled && e.preventDefault()}
              className={`px-5 py-2.5 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-lg text-slate-200 transition-all flex items-center gap-2 ${
                disabled
                  ? "opacity-40 cursor-not-allowed pointer-events-none"
                  : "hover:bg-slate-850 hover:border-slate-700"
              }`}
            >
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Recording
            </a>
          )}
        </div>
      )}

      {debugText && (
        <div className="text-xs font-mono text-violet-400 mt-2 bg-slate-900/60 p-2 rounded-md border border-slate-800/60 text-center">
          {debugText}
        </div>
      )}
    </div>
  );
}
