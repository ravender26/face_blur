"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  parseDetection,
  updateTracks,
  processRecognitionForTracks
} from "../utils/faceHelpers";

/**
 * WebcamAnonymizer component.
 * Manages raw camera streams, handles requestAnimationFrame loop tracking, blurs faces,
 * and records processed live video feeds.
 * 
 * @component
 * @returns {React.ReactElement} The webcam live processing feed.
 */
export default function WebcamAnonymizer() {
  const {
    excludeTargetRef,
    targetDescriptorRef,
    loading,
    setLoading,
    error,
    setError,
    registeringFace: disabled
  } = useWorkspace();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecordingCamera, setIsRecordingCamera] = useState(false);
  const [cameraRecordUrl, setCameraRecordUrl] = useState(null);
  const [debugText, setDebugText] = useState("");

  const webcamVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraRecorderRef = useRef(null);
  const cameraAnimationFrameIdRef = useRef(null);
  const activeDetectorRef = useRef(null);

  useEffect(() => {
    return () => {
      // Clean up camera resources and object URLs on unmount
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (cameraAnimationFrameIdRef.current) {
        cancelAnimationFrame(cameraAnimationFrameIdRef.current);
      }
      if (activeDetectorRef.current) {
        try {
          activeDetectorRef.current.close();
        } catch (_) {}
      }
      if (cameraRecordUrl) {
        URL.revokeObjectURL(cameraRecordUrl);
      }
    };
  }, [cameraRecordUrl]);

  /**
   * Accesses user media webcam streams (with progressive quality fallbacks),
   * initializes MediaPipe FaceDetector instance, and starts the render loop.
   */
  const startCamera = async () => {
    setLoading(true);
    setError(null);
    setCameraRecordUrl(null);
    setIsRecordingCamera(false);

    if (typeof window !== "undefined" && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      setError("Webcam access is not supported by your browser or secure context settings. Please verify you are using HTTPS (Vercel uses SSL automatically) and a supported mobile browser like Safari or Chrome.");
      setLoading(false);
      return;
    }

    let detector = null;

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          },
          audio: false
        });
      } catch (err1) {
        console.warn("First getUserMedia attempt failed, trying user-facing camera fallback...", err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
          });
        } catch (err2) {
          console.warn("Second getUserMedia attempt failed, trying generic camera fallback...", err2);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }
      cameraStreamRef.current = stream;

      // Assign camera streams using a safe promise loader block to avoid play/onloadedmetadata race conditions
      if (webcamVideoRef.current) {
        const video = webcamVideoRef.current;
        await new Promise((resolve) => {
          const handleMetadata = () => {
            video.play()
              .then(resolve)
              .catch((err) => {
                console.warn("Video play promise rejected:", err);
                resolve();
              });
          };

          if (video.readyState >= 1) {
            handleMetadata();
          } else {
            video.onloadedmetadata = handleMetadata;
          }

          video.srcObject = stream;
        });
      }

      // Initialize resolver and detector models
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.15,
        minSuppressionThreshold: 0.3,
      });
      activeDetectorRef.current = detector;

      const video = webcamVideoRef.current;
      const canvas = canvasRef.current;
      if (!canvas || !video) {
        throw new Error("Webcam setup error: DOM nodes not found.");
      }

      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");

      setIsCameraActive(true);
      setLoading(false);

      let faceTracks = [];
      const trackIdCounterRef = { current: 0 };

      // Recurring requestAnimationFrame rendering loop
      const processCameraFrame = async () => {
        if (!cameraStreamRef.current || video.paused || video.ended) return;

        try {
          const timestampMs = performance.now();

          if (tempCtx) {
            tempCtx.clearRect(0, 0, width, height);
            tempCtx.drawImage(video, 0, 0, width, height);
          }

          const detectionResult = detector.detectForVideo(tempCanvas, timestampMs);

          if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
            setDebugText(`Detected ${detectionResult.detections.length} face(s)!`);

            const currentDetections = [];
            for (const detection of detectionResult.detections) {
              const parsed = parseDetection(detection, width, height);
              if (parsed) {
                currentDetections.push(parsed);
              }
            }

            faceTracks = updateTracks(
              currentDetections,
              faceTracks,
              excludeTargetRef.current,
              targetDescriptorRef.current,
              tempCanvas,
              width,
              height,
              trackIdCounterRef
            );

            // Execute recognition in parallel to retain smooth frames (non-blocking)
            processRecognitionForTracks(
              faceTracks,
              excludeTargetRef.current,
              targetDescriptorRef.current,
              tempCanvas,
              width,
              height
            );

            for (const det of currentDetections) {
              const track = faceTracks.find(
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
            setDebugText("No faces detected in live feed");
            faceTracks.forEach((t) => t.missedFrames++);
            faceTracks = faceTracks.filter((t) => t.missedFrames < 15);
          }

          ctx.drawImage(tempCanvas, 0, 0, width, height);

          cameraAnimationFrameIdRef.current = requestAnimationFrame(processCameraFrame);
        } catch (frameErr) {
          console.error("Error in live processing frame:", frameErr);
        }
      };

      cameraAnimationFrameIdRef.current = requestAnimationFrame(processCameraFrame);
    } catch (err) {
      console.error("Camera start failure:", err);
      let userFriendlyMsg = err.message || "Failed to initialize webcam.";

      if (err.name === "NotAllowedError" || err.message?.toLowerCase().includes("permission") || err.message?.toLowerCase().includes("allowed")) {
        userFriendlyMsg = "Camera permission was denied. Please make sure camera permission is enabled for this site in your browser settings (look for a settings/lock icon in your browser address bar) and that your mobile OS grants permission to your browser app.";
      }

      setError(userFriendlyMsg);
      setLoading(false);
      stopCamera();
    }
  };

  /**
   * Stops camera streams and resets canvas contexts.
   */
  const stopCamera = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state === "recording") {
      try {
        cameraRecorderRef.current.stop();
      } catch (_) {}
    }
    cameraRecorderRef.current = null;

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;

    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }

    if (cameraAnimationFrameIdRef.current) {
      cancelAnimationFrame(cameraAnimationFrameIdRef.current);
    }
    cameraAnimationFrameIdRef.current = null;

    if (activeDetectorRef.current) {
      try {
        activeDetectorRef.current.close();
      } catch (_) {}
    }
    activeDetectorRef.current = null;

    setIsCameraActive(false);
    setIsRecordingCamera(false);
    setDebugText("");
  };

  /**
   * Starts a MediaRecorder instance capturing the canvas element stream.
   */
  const startCameraRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setCameraRecordUrl(null);
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
    cameraRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMimeType });
      const localUrl = URL.createObjectURL(blob);
      setCameraRecordUrl(localUrl);
      setIsRecordingCamera(false);
    };

    recorder.start();
    setIsRecordingCamera(true);
  };

  /**
   * Stops active camera recording streams.
   */
  const stopCameraRecording = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state === "recording") {
      cameraRecorderRef.current.stop();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-300 font-mono">
            Live Webcam Face Blur
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            {isCameraActive ? "Camera feed active" : "Webcam inactive"}
          </p>
        </div>
        {isCameraActive && (
          <button
            onClick={stopCamera}
            disabled={loading || disabled}
            className={`px-3 py-1.5 border border-slate-800 text-xs rounded-md text-slate-400 bg-slate-950/40 transition-all ${
              loading || disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-rose-500/40 hover:text-rose-400 hover:bg-rose-500/5"
            }`}
          >
            Stop Camera
          </button>
        )}
      </div>

      <video ref={webcamVideoRef} className="hidden" playsInline muted />

      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain ${isCameraActive ? "block" : "hidden"}`}
        />

        {isRecordingCamera && isCameraActive && (
          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Recording Live Feed...
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 text-center p-4">
            <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold text-violet-400">Activating Webcam & AI...</p>
            <p className="text-[10px] text-slate-500 mt-1">Initializing stream and detector</p>
          </div>
        )}

        {!isCameraActive && !loading && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <div className="mb-4 p-4 rounded-full bg-slate-900 border border-slate-800">
              <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">Camera Inactive</h3>
            <p className="text-xs text-slate-400 mb-6">Start your camera to see live face blurring on screen</p>
            <button
              onClick={startCamera}
              disabled={disabled}
              className={`px-6 py-3 text-sm font-semibold rounded-lg text-white shadow-lg transition-all flex items-center gap-2 ${
                disabled
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-500/25 hover:shadow-violet-500/35"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Start Camera
            </button>
          </div>
        )}
      </div>

      {isCameraActive && (
        <div className="flex justify-between items-center pt-2">
          <div className="flex gap-3">
            {!isRecordingCamera ? (
              <button
                onClick={startCameraRecording}
                disabled={disabled}
                className={`px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-all flex items-center gap-2 shadow-lg ${
                  disabled
                    ? "bg-slate-850 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-rose-600 hover:bg-rose-500 shadow-rose-500/15"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white"></span>
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopCameraRecording}
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

          {cameraRecordUrl && (
            <a
              href={disabled ? undefined : cameraRecordUrl}
              download="live-webcam-blurred.mp4"
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
