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

  const [activeMode, setActiveMode] = useState("upload"); // 'upload' | 'camera'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecordingCamera, setIsRecordingCamera] = useState(false);
  const [cameraRecordUrl, setCameraRecordUrl] = useState(null);

  const [excludeTarget, setExcludeTarget] = useState(false);
  const [targetDescriptor, setTargetDescriptor] = useState(null);
  const [selfieFiles, setSelfieFiles] = useState([]);
  const [sampleVideoFile, setSampleVideoFile] = useState(null);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);

  const webcamVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraRecorderRef = useRef(null);
  const cameraAnimationFrameIdRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (cameraAnimationFrameIdRef.current) {
        cancelAnimationFrame(cameraAnimationFrameIdRef.current);
      }
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

  const handleModeChange = (mode) => {
    if (mode === activeMode) return;
    if (activeMode === "camera") {
      stopCamera();
    } else if (activeMode === "upload") {
      resetAll();
    }
    setActiveMode(mode);
  };

  const loadFaceApi = () => {
    return new Promise((resolve, reject) => {
      if (window.faceapi) {
        resolve(window.faceapi);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
      script.async = true;
      script.onload = async () => {
        try {
          const modelUrl = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
          await window.faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
          await window.faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
          await window.faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
          resolve(window.faceapi);
        } catch (err) {
          reject(new Error("Failed to load Face-API models: " + err.message));
        }
      };
      script.onerror = () => {
        reject(new Error("Failed to load Face-API CDN script."));
      };
      document.body.appendChild(script);
    });
  };

  const registerTargetProfile = async () => {
    if (selfieFiles.length < 4) {
      setError("Please select at least 4 selfie images of the target person.");
      return;
    }
    if (!sampleVideoFile) {
      setError("Please select a sample video of the target person's face.");
      return;
    }

    setRegisteringFace(true);
    setRegistrationSuccess(null);
    setError(null);

    try {
      const faceapi = await loadFaceApi();
      const descriptors = [];

      const extractDescriptor = async (el) => {
        const detection = await faceapi.detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        return detection ? detection.descriptor : null;
      };

      // Process Selfies
      for (let i = 0; i < selfieFiles.length; i++) {
        const file = selfieFiles[i];
        const img = await faceapi.bufferToImage(file);
        const desc = await extractDescriptor(img);
        if (desc) {
          descriptors.push(desc);
        } else {
          console.warn(`No face detected in selfie ${i + 1}`);
        }
      }

      // Process Video
      const video = document.createElement("video");
      video.src = URL.createObjectURL(sampleVideoFile);
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      const duration = video.duration;
      const timestamps = [duration * 0.1, duration * 0.3, duration * 0.5, duration * 0.7, duration * 0.9];
      const videoCanvas = document.createElement("canvas");
      const videoCtx = videoCanvas.getContext("2d");

      for (const t of timestamps) {
        video.currentTime = t;
        await new Promise(r => video.onseeked = r);

        videoCanvas.width = video.videoWidth || 640;
        videoCanvas.height = video.videoHeight || 480;
        videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);

        const desc = await extractDescriptor(videoCanvas);
        if (desc) {
          descriptors.push(desc);
        } else {
          console.warn(`No face detected in video frame at ${t}s`);
        }
      }

      try {
        video.pause();
        video.src = "";
        video.load();
      } catch (_) {}

      if (descriptors.length === 0) {
        throw new Error("Could not detect any faces in the uploaded selfies or video frames. Please ensure your face is clearly visible.");
      }

      const meanDesc = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        let sum = 0;
        for (const desc of descriptors) {
          sum += desc[i];
        }
        meanDesc[i] = sum / descriptors.length;
      }

      setTargetDescriptor(meanDesc);
      setRegistrationSuccess(`Successfully registered target face profile using ${descriptors.length} samples!`);
      setExcludeTarget(true);
    } catch (err) {
      console.error("Face registration error:", err);
      setError(err.message || "Failed to analyze and register target face.");
    } finally {
      setRegisteringFace(false);
    }
  };

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
      // 1. Access user camera with progressive fallbacks (MUST be first to preserve user gesture context for iOS Safari permission prompt!)
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

      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          webcamVideoRef.current.onloadedmetadata = () => {
            webcamVideoRef.current.play().then(resolve);
          };
        });
      }

      // 2. Initialize FaceDetector model
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



      // 3. Setup canvas sizing
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

      // 4. Processing Loop
      const processCameraFrame = async () => {
        if (!cameraStreamRef.current || video.paused || video.ended) return;

        try {
          ctx.drawImage(video, 0, 0, width, height);

          const timestampMs = performance.now();
          const detectionResult = detector.detectForVideo(canvas, timestampMs);

          if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
            const first = detectionResult.detections[0].boundingBox;
            setDebugText(`Detected ${detectionResult.detections.length} face(s)!`);

            if (tempCtx) {
              tempCtx.clearRect(0, 0, width, height);
              tempCtx.drawImage(canvas, 0, 0, width, height);
            }

            for (const detection of detectionResult.detections) {
              const bbox = detection.boundingBox;
              if (bbox) {
                let x = bbox.originX;
                let y = bbox.originY;
                let w = bbox.width;
                let h = bbox.height;

                if (Math.abs(x) <= 1.0 && Math.abs(w) <= 1.0) {
                  x = x * width;
                  y = y * height;
                  w = w * width;
                  h = h * height;
                }

                x = Math.max(0, Math.min(x, width));
                y = Math.max(0, Math.min(y, height));
                w = Math.max(0, Math.min(w, width - x));
                h = Math.max(0, Math.min(h, height - y));

                const side = Math.max(w, h);
                const centerX = x + w / 2;
                const centerY = y + h / 2;

                let xSq = Math.max(0, Math.min(centerX - side / 2, width));
                let ySq = Math.max(0, Math.min(centerY - side / 2, height));
                let wSq = Math.max(0, Math.min(centerX + side / 2, width) - xSq);
                let hSq = Math.max(0, Math.min(centerY + side / 2, height) - ySq);

                const finalSide = Math.min(wSq, hSq);

                let isTargetFace = false;
                if (excludeTarget && targetDescriptor && window.faceapi) {
                  try {
                    const pad = Math.round(finalSide * 0.2);
                    const xCrop = Math.max(0, xSq - pad);
                    const yCrop = Math.max(0, ySq - pad);
                    const wCrop = Math.min(width - xCrop, finalSide + pad * 2);
                    const hCrop = Math.min(height - yCrop, finalSide + pad * 2);

                    const cropCanvas = document.createElement("canvas");
                    cropCanvas.width = wCrop;
                    cropCanvas.height = hCrop;
                    const cropCtx = cropCanvas.getContext("2d");
                    cropCtx.drawImage(tempCanvas, xCrop, yCrop, wCrop, hCrop, 0, 0, wCrop, hCrop);

                    const faceapiResult = await window.faceapi.detectSingleFace(cropCanvas, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 }))
                      .withFaceLandmarks()
                      .withFaceDescriptor();

                    if (faceapiResult) {
                      const dist = window.faceapi.euclideanDistance(faceapiResult.descriptor, targetDescriptor);
                      console.log("Webcam face distance to target:", dist);
                      if (dist < 0.55) {
                        isTargetFace = true;
                      }
                    }
                  } catch (faceErr) {
                    console.error("Webcam face recognition error:", faceErr);
                  }
                }

                if (!isTargetFace && finalSide > 4 && tempCtx) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.rect(xSq, ySq, finalSide, finalSide);
                  ctx.clip();
                  ctx.filter = `blur(${Math.max(12, finalSide / 4.5)}px)`;
                  ctx.drawImage(tempCanvas, 0, 0, width, height);
                  ctx.restore();
                }
              }
            }
          } else {
            setDebugText("No faces detected in live feed");
          }

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

  const stopCamera = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state === "recording") {
      try {
        cameraRecorderRef.current.stop();
      } catch (_) {}
    }
    cameraRecorderRef.current = null;

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
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

  const stopCameraRecording = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state === "recording") {
      cameraRecorderRef.current.stop();
    }
  };

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
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.15,
        minSuppressionThreshold: 0.3, // Non-maximum suppression threshold to handle close/overlapping faces
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

      // Offscreen buffer canvas (same size as main canvas to avoid high-frequency resizing lag)
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");

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

            // Draw the current video frame onto the processing canvas
            ctx.drawImage(video, 0, 0, width, height);

            // Run the face detector on the current canvas frame (using VIDEO mode for temporal tracking)
            const timestampMs = Math.round(video.currentTime * 1000);
            const detectionResult = detector.detectForVideo(canvas, timestampMs);

            if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
              const first = detectionResult.detections[0].boundingBox;
              setDebugText(`Detected ${detectionResult.detections.length} face(s)! x: ${Math.round(first.originX)}, y: ${Math.round(first.originY)}`);
            } else {
              setDebugText("No faces detected in this frame");
            }

            if (detectionResult && detectionResult.detections && detectionResult.detections.length > 0) {
              // Copy the entire unblurred frame to temp canvas once
              if (tempCtx) {
                tempCtx.clearRect(0, 0, width, height);
                tempCtx.drawImage(canvas, 0, 0, width, height);
              }

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

                  // Calculate square bounding box centered around the face
                  const side = Math.max(w, h);
                  const centerX = x + w / 2;
                  const centerY = y + h / 2;

                  let xSq = Math.max(0, Math.min(centerX - side / 2, width));
                  let ySq = Math.max(0, Math.min(centerY - side / 2, height));
                  let wSq = Math.max(0, Math.min(centerX + side / 2, width) - xSq);
                  let hSq = Math.max(0, Math.min(centerY + side / 2, height) - ySq);

                  // Keep it as a square
                  const finalSide = Math.min(wSq, hSq);

                  let isTargetFace = false;
                  if (excludeTarget && targetDescriptor && window.faceapi) {
                    try {
                      const pad = Math.round(finalSide * 0.2);
                      const xCrop = Math.max(0, xSq - pad);
                      const yCrop = Math.max(0, ySq - pad);
                      const wCrop = Math.min(width - xCrop, finalSide + pad * 2);
                      const hCrop = Math.min(height - yCrop, finalSide + pad * 2);

                      const cropCanvas = document.createElement("canvas");
                      cropCanvas.width = wCrop;
                      cropCanvas.height = hCrop;
                      const cropCtx = cropCanvas.getContext("2d");
                      cropCtx.drawImage(tempCanvas, xCrop, yCrop, wCrop, hCrop, 0, 0, wCrop, hCrop);

                      const faceapiResult = await window.faceapi.detectSingleFace(cropCanvas, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 }))
                        .withFaceLandmarks()
                        .withFaceDescriptor();

                      if (faceapiResult) {
                        const dist = window.faceapi.euclideanDistance(faceapiResult.descriptor, targetDescriptor);
                        console.log("Video face distance to target:", dist);
                        if (dist < 0.55) {
                          isTargetFace = true;
                        }
                      }
                    } catch (faceErr) {
                      console.error("Video face recognition error:", faceErr);
                    }
                  }

                  if (!isTargetFace && finalSide > 4 && tempCtx) {
                    // Draw the temp canvas back onto the main canvas with a blur filter, clipped to a sharp square
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(xSq, ySq, finalSide, finalSide);
                    ctx.clip();
                    ctx.filter = `blur(${Math.max(12, finalSide / 4.5)}px)`;
                    ctx.drawImage(tempCanvas, 0, 0, width, height);
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
            } catch (_) { }
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
        } catch (_) { }
      }
      if (detector) {
        try {
          detector.close();
        } catch (_) { }
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
      } catch (_) { }
    }
    if (activeDetectorRef.current) {
      try {
        activeDetectorRef.current.close();
      } catch (_) { }
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

        {/* Mode Toggle Tabs */}
        <div className="flex gap-4 mb-8 bg-[#0f131d]/60 border border-slate-800/80 p-1.5 rounded-xl w-fit">
          <button
            onClick={() => handleModeChange("upload")}
            className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeMode === "upload"
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Video File Anonymizer
          </button>
          <button
            onClick={() => handleModeChange("camera")}
            className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeMode === "camera"
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Live Webcam Feed
          </button>
        </div>

        {/* Dashboard Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left panel: Upload & Process controls */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">

              {activeMode === "upload" && (
                <>
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
            </>)}

              {activeMode === "camera" && (
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
                        disabled={loading}
                        className="px-3 py-1.5 border border-slate-800 hover:border-rose-500/40 text-xs rounded-md text-slate-400 hover:text-rose-400 bg-slate-950/40 hover:bg-rose-500/5 transition-all"
                      >
                        Stop Camera
                      </button>
                    )}
                  </div>

                  {/* Hidden raw webcam input stream */}
                  <video
                    ref={webcamVideoRef}
                    className="hidden"
                    playsInline
                    muted
                  />

                  {/* Webcam preview frame */}
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
                          className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-sm font-semibold rounded-lg text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/35 transition-all flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Start Camera
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Camera Controls */}
                  {isCameraActive && (
                    <div className="flex justify-between items-center pt-2">
                      <div className="flex gap-3">
                        {!isRecordingCamera ? (
                          <button
                            onClick={startCameraRecording}
                            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-xs font-semibold rounded-lg text-white transition-all flex items-center gap-2 shadow-lg shadow-rose-500/15"
                          >
                            <span className="w-2 h-2 rounded-full bg-white"></span>
                            Start Recording
                          </button>
                        ) : (
                          <button
                            onClick={stopCameraRecording}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-semibold rounded-lg text-rose-400 transition-all flex items-center gap-2"
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                            Stop Recording
                          </button>
                        )}
                      </div>

                      {cameraRecordUrl && (
                        <a
                          href={cameraRecordUrl}
                          download="live-webcam-blurred.mp4"
                          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition-all flex items-center gap-2"
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

            {/* Target Face Exclusion Card */}
            <div className="bg-[#0f131d]/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <svg className="w-4 h-4 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Selective Face Preservation
                </h3>
                {targetDescriptor && (
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeTarget}
                      onChange={(e) => setExcludeTarget(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-fuchsia-600 peer-checked:after:bg-white"></div>
                  </label>
                )}
              </div>

              {/* Status Alert */}
              {targetDescriptor ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Target Face Profile Registered!
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  No target profile registered.
                </div>
              )}

              {/* Inputs and Buttons */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase block">
                    Upload Selfies (Min 4)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setSelfieFiles(e.target.files)}
                    disabled={registeringFace}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-900 file:text-slate-200 file:hover:bg-slate-850 file:cursor-pointer cursor-pointer bg-slate-950/40 p-2 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all"
                  />
                  {selfieFiles.length > 0 && (
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {selfieFiles.length} selfie(s) selected
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase block">
                    Upload Face Video (1 File)
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setSampleVideoFile(e.target.files[0])}
                    disabled={registeringFace}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-900 file:text-slate-200 file:hover:bg-slate-850 file:cursor-pointer cursor-pointer bg-slate-950/40 p-2 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all"
                  />
                  {sampleVideoFile && (
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Selected: {sampleVideoFile.name}
                    </span>
                  )}
                </div>

                <button
                  onClick={registerTargetProfile}
                  disabled={registeringFace || selfieFiles.length < 4 || !sampleVideoFile}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${
                    registeringFace
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : selfieFiles.length >= 4 && sampleVideoFile
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/15"
                      : "bg-slate-900 border border-slate-800/85 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {registeringFace ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin"></div>
                      Analyzing Face Samples...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" />
                      </svg>
                      Register Target Face
                    </>
                  )}
                </button>

                {registrationSuccess && (
                  <p className="text-[10px] text-emerald-400 font-medium text-center">
                    {registrationSuccess}
                  </p>
                )}
              </div>
            </div>

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
