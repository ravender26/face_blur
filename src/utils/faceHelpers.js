// Parse MediaPipe detection bounding box to a standard square format
export function parseDetection(detection, width, height) {
  const bbox = detection.boundingBox;
  if (!bbox) return null;

  let x = bbox.originX;
  let y = bbox.originY;
  let w = bbox.width;
  let h = bbox.height;

  // Handle normalized coordinates
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

  const finalSide = Math.min(wSq, hSq);

  if (finalSide > 4) {
    return {
      x: xSq,
      y: ySq,
      side: finalSide,
      centerX,
      centerY
    };
  }
  return null;
}

// Helper for face recognition on a cropped frame canvas
export async function recognizeFace(cropCanvas, targetDescriptor) {
  try {
    if (!window.faceapi) return false;
    // Lower threshold to 0.1 and set inputSize to 160 since MediaPipe has already confirmed a face is here,
    // and cropped images are small, so smaller inputSize works much better.
    const faceapiResult = await window.faceapi.detectSingleFace(
      cropCanvas,
      new window.faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
    )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (faceapiResult) {
      const dist = window.faceapi.euclideanDistance(faceapiResult.descriptor, targetDescriptor);
      console.log("Face distance to target:", dist);
      // Relax threshold from 0.55 to 0.60 to match standard face matcher settings and reduce false negatives
      if (dist < 0.60) {
        return true;
      }
    }
  } catch (faceErr) {
    console.error("Face recognition error:", faceErr);
  }
  return false;
}

// Face Tracking implementation using center distance
export function updateTracks(currentDetections, faceTracks, excludeTarget, targetDescriptor, tempCanvas, width, height, trackIdCounterRef) {
  const matchedIndices = new Set();
  const updatedTracks = [];

  for (const det of currentDetections) {
    let bestTrackIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < faceTracks.length; i++) {
      if (matchedIndices.has(i)) continue; // Ensure one-to-one matching per frame
      const track = faceTracks[i];
      const dist = Math.sqrt((det.centerX - track.centerX) ** 2 + (det.centerY - track.centerY) ** 2);
      // Distance threshold: allow movement up to 1.2 * track.side
      const threshold = track.side * 1.2;
      if (dist < threshold && dist < minDistance) {
        minDistance = dist;
        bestTrackIdx = i;
      }
    }

    if (bestTrackIdx !== -1) {
      // Matched existing track: mutate in-place so reference is kept for async recognition updates
      const track = faceTracks[bestTrackIdx];
      matchedIndices.add(bestTrackIdx);
      track.x = det.x;
      track.y = det.y;
      track.side = det.side;
      track.centerX = det.centerX;
      track.centerY = det.centerY;
      track.missedFrames = 0;
      track.detMatches = (track.detMatches || 0) + 1;
      updatedTracks.push(track);
    } else {
      // Create new track
      const newTrackId = trackIdCounterRef.current++;
      updatedTracks.push({
        id: newTrackId,
        x: det.x,
        y: det.y,
        side: det.side,
        centerX: det.centerX,
        centerY: det.centerY,
        history: [], // Will be populated in recognition step
        isTarget: false,
        missedFrames: 0,
        detMatches: 1,
        recognizing: false
      });
    }
  }

  // Carry over missed tracks up to 15 frames
  for (let i = 0; i < faceTracks.length; i++) {
    if (!matchedIndices.has(i)) {
      const track = faceTracks[i];
      if (track.missedFrames < 15) {
        track.missedFrames += 1;
        updatedTracks.push(track);
      }
    }
  }

  return updatedTracks;
}

// Asynchronously process recognition for tracks in the background (no await)
export function processRecognitionForTracks(tracks, excludeTarget, targetDescriptor, tempCanvas, width, height) {
  if (!excludeTarget || !targetDescriptor || !window.faceapi) return;

  for (const track of tracks) {
    if (track.missedFrames > 0) continue; // Skip missed tracks
    if (track.recognizing) continue; // Skip if already running recognition for this track

    const pad = Math.round(track.side * 0.5);
    const xCrop = Math.max(0, track.x - pad);
    const yCrop = Math.max(0, track.y - pad);
    const wCrop = Math.min(width - xCrop, track.side + pad * 2);
    const hCrop = Math.min(height - yCrop, track.side + pad * 2);

    if (wCrop < 10 || hCrop < 10) continue;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = wCrop;
    cropCanvas.height = hCrop;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(tempCanvas, xCrop, yCrop, wCrop, hCrop, 0, 0, wCrop, hCrop);

    track.recognizing = true;

    recognizeFace(cropCanvas, targetDescriptor)
      .then((matchedThisFrame) => {
        track.history.push(matchedThisFrame);
        if (track.history.length > 15) {
          track.history.shift();
        }
        const matchesCount = track.history.filter(Boolean).length;
        track.isTarget = (matchesCount / track.history.length) >= 0.3;
        track.recognizing = false;
        console.log(`[Face Tracking] Track ID ${track.id} resolved: matched=${matchedThisFrame}, matchesCount=${matchesCount}, length=${track.history.length}, isTarget=${track.isTarget}`);
      })
      .catch((err) => {
        console.error("Async recognition error for track:", track.id, err);
        track.recognizing = false;
      });
  }
}

// Awaited recognition process for video files (fully blocking frame-by-frame)
export async function processRecognitionForTracksAwaited(tracks, excludeTarget, targetDescriptor, tempCanvas, width, height) {
  if (!excludeTarget || !targetDescriptor || !window.faceapi) return;

  for (const track of tracks) {
    if (track.missedFrames > 0) continue; // Skip missed tracks

    const pad = Math.round(track.side * 0.5);
    const xCrop = Math.max(0, track.x - pad);
    const yCrop = Math.max(0, track.y - pad);
    const wCrop = Math.min(width - xCrop, track.side + pad * 2);
    const hCrop = Math.min(height - yCrop, track.side + pad * 2);

    if (wCrop < 10 || hCrop < 10) continue;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = wCrop;
    cropCanvas.height = hCrop;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(tempCanvas, xCrop, yCrop, wCrop, hCrop, 0, 0, wCrop, hCrop);

    let matchedThisFrame = await recognizeFace(cropCanvas, targetDescriptor);

    track.history.push(matchedThisFrame);
    if (track.history.length > 15) {
      track.history.shift();
    }

    const matchesCount = track.history.filter(Boolean).length;
    track.isTarget = (matchesCount / track.history.length) >= 0.3;
    console.log(`[Face Tracking Awaited] Track ID ${track.id}: matched=${matchedThisFrame}, matchesCount=${matchesCount}, length=${track.history.length}, isTarget=${track.isTarget}`);
  }
}
