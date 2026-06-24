import { useState } from "react";

/**
 * SelectiveFacePreservation component.
 * Allows users to register a target person's face descriptor by uploading selfies and a short video.
 * Once registered, the user can toggle target face exclusion to bypass blurring on the target person.
 * It uses `face-api.js` loaded client-side via a CDN script to extract face descriptors and compute their mean.
 * 
 * @component
 * @param {Object} props - Component properties.
 * @param {boolean} props.excludeTarget - Whether target face preservation is enabled.
 * @param {function(boolean): void} props.setExcludeTarget - Callback to update preservation setting state.
 * @param {Float32Array|null} props.targetDescriptor - The 128-dimensional target face descriptor representation.
 * @param {function(Float32Array|null): void} props.setTargetDescriptor - Callback to update the target face descriptor state.
 * @param {function(string|null): void} props.setError - Callback to bubble up error alerts.
 * @returns {React.ReactElement} The rendered registration and settings control panel.
 */
export default function SelectiveFacePreservation({
  excludeTarget,
  setExcludeTarget,
  targetDescriptor,
  setTargetDescriptor,
  setError
}) {
  const [selfieFiles, setSelfieFiles] = useState([]);
  const [sampleVideoFile, setSampleVideoFile] = useState(null);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);

  /**
   * Dynamically loads the vladmandic/face-api script and initializes required tiny models.
   * Resolves with the faceapi object.
   * 
   * @returns {Promise<Object>} The initialized window.faceapi instance.
   */
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

  /**
   * Processes the uploaded selfies and video frames to generate and average their face descriptors.
   * Updates targetDescriptor with the mean face profile representation.
   */
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
      } catch (_) { }

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

  return (
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
  );
}
