"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  parseDetection,
  updateTracks,
  processRecognitionForTracksAwaited
} from "../utils/faceHelpers";

/**
 * VideoAnonymizer component.
 * Manages video file uploads, local source playback, offscreen canvas face detection / tracking,
 * and media encoding to output a blurred target-preserved video.
 * 
 * @component
 * @returns {React.ReactElement} The video upload and client-side processing workspace.
 */
export default function VideoAnonymizer() {
  const {
    excludeTargetRef,
    targetDescriptorRef,
    status,
    setStatus,
    loading,
    setLoading,
    error,
    setError,
    registeringFace: disabled
  } = useWorkspace();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState(null);
  const [blurredVideoUrl, setBlurredVideoUrl] = useState(null);
  const [debugText, setDebugText] = useState("");

  const fileInputRef = useRef(null);
  const sourceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const activeDetectorRef = useRef(null);
  const activeRecorderRef = useRef(null);

  useEffect(() => {
    return () => {
      // Clean up local URL objects to prevent memory leaks
      if (originalVideoUrl) URL.revokeObjectURL(originalVideoUrl);
      if (blurredVideoUrl) URL.revokeObjectURL(blurredVideoUrl);
    };
  }, [originalVideoUrl, blurredVideoUrl]);

  /**
   * Drag-and-drop state controller.
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  /**
   * Drops handler for file uploads.
   */
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

  /**
   * Handles traditional file selection dialogs.
   */
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        selectFile(selectedFile);
      }
    }
  };

  /**
   * Verifies file type and formats.
   */
  const validateFile = (file) => {
    const validTypes = ["video/mp4", "video/quicktime", "video/mov"];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".mov")) {
      setError("Please upload an MP4 or MOV video file.");
      return false;
    }
    setError(null);
    return true;
  };

  /**
   * Assigns active file URLs.
   */
  const selectFile = (file) => {
    setFile(file);
    setBlurredVideoUrl(null);
    setStatus("idle");
    const localUrl = URL.createObjectURL(file);
    setOriginalVideoUrl(localUrl);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  /**
   * Resets the entire anonymizer workflow and cleans up memory references.
   */
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

  /**
   * Spawns MediaPipe WASM detector, captures frame streams from video playback onto offscreen canvas,
   * performs sequential face recognition checks, draws the anonymizing blur filter, and packages into a final file.
   */
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
      // 1. Initialize detector models
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

      // 2. Prep metadata and canvas layers
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

      // 3. Initiate recording streams
      const fps = 30;
      const canvasStream = canvas.captureStream ? canvas.captureStream(fps) : canvas.mozCaptureStream(fps);

      // Extract original audio track if present
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

      video.currentTime = 0;
      video.muted = true;

      mediaRecorder.start();
      await video.play();

      let lastTime = -1;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");

      let faceTracks = [];
      const trackIdCounterRef = { current: 0 };

      // 4. Sequential frame render and recognition handler
      const processFrame = async () => {
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

            if (tempCtx) {
              tempCtx.clearRect(0, 0, width, height);
              tempCtx.drawImage(video, 0, 0, width, height);
            }

            const timestampMs = Math.round(video.currentTime * 1000);
            const detectionResult = detector.detectForVideo(tempCanvas, timestampMs);

            if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
              const first = detectionResult.detections[0].boundingBox;
              setDebugText(`Detected ${detectionResult.detections.length} face(s)! x: ${Math.round(first.originX)}, y: ${Math.round(first.originY)}`);
            } else {
              setDebugText("No faces detected in this frame");
            }

            if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
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

              // Perfect sync awaited recognition
              await processRecognitionForTracksAwaited(
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
              faceTracks.forEach((t) => t.missedFrames++);
              faceTracks = faceTracks.filter((t) => t.missedFrames < 15);
            }

            ctx.drawImage(tempCanvas, 0, 0, width, height);
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

  return (
    <>
      {!originalVideoUrl ? (
        <div
          onDragEnter={!disabled ? handleDrag : undefined}
          onDragOver={!disabled ? handleDrag : undefined}
          onDragLeave={!disabled ? handleDrag : undefined}
          onDrop={!disabled ? handleDrop : undefined}
          onClick={!disabled ? triggerFileInput : undefined}
          className={`relative group border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
            disabled
              ? "border-slate-900 bg-[#0c0e14]/25 opacity-50 cursor-not-allowed"
              : dragActive
              ? "border-violet-500 bg-violet-600/5 shadow-inner cursor-pointer"
              : "border-slate-800 bg-[#0c0e14]/55 hover:border-slate-700 hover:bg-[#0c0e14]/90 cursor-pointer"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/mp4, video/quicktime, video/mov"
            disabled={disabled}
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
        <div className="space-y-6">
          <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300 font-mono truncate max-w-[250px] sm:max-w-md">
                {file?.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {file ? (file.size / (1024 * 1024)).toFixed(2) : 0} MB
              </p>
            </div>
            <button
              onClick={resetAll}
              disabled={loading || disabled}
              className={`px-3 py-1.5 border border-slate-800 text-xs rounded-md text-slate-400 bg-slate-950/40 transition-all ${
                loading || disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:border-rose-500/40 hover:text-rose-400 hover:bg-rose-500/5"
              }`}
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
                  controls={!disabled && (status === "idle" || status === "done")}
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
                    controls={!disabled}
                    autoPlay
                  />
                ) : status === "loading-model" || status === "processing" || status === "encoding" ? (
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
                disabled={disabled}
                className={`px-6 py-3 text-sm font-semibold rounded-lg text-white shadow-lg transition-all flex items-center gap-2 ${
                  disabled
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-violet-500/25 hover:shadow-violet-500/35"
                }`}
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
                href={disabled ? undefined : blurredVideoUrl}
                download={`blurred-${file?.name || "video.mp4"}`}
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
    </>
  );
}
