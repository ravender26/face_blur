# pyrefly: ignore [missing-import]
import cv2
import numpy as np
# pyrefly: ignore [missing-import]
import mediapipe as mp
# pyrefly: ignore [missing-import]
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import sys
import os
import urllib.request

def main():
    if len(sys.argv) < 3:
        print("Usage: python blur_video.py <input_path> <output_path>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    # Check if input file exists
    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' does not exist.")
        sys.exit(1)

    # Ensure model is downloaded (use full range model to support multiple faces up to 5 meters)
    model_path = 'blaze_face_full_range.tflite'
    if not os.path.exists(model_path):
        print("Downloading full-range face detection model...")
        url = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite"
        try:
            urllib.request.urlretrieve(url, model_path)
            print("Full-range model downloaded successfully.")
        except Exception as e:
            print(f"Error downloading face detection model: {e}")
            sys.exit(1)

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Could not open input video '{input_path}'.")
        sys.exit(1)

    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    import imageio

    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    # Use imageio with standard libx264 codec and yuv420p pixel format for browser compatibility
    writer = imageio.get_writer(output_path, fps=fps, codec='libx264', pixelformat='yuv420p')

    # Initialize the MediaPipe Tasks FaceDetector with custom confidence thresholds to detect multiple faces
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.FaceDetectorOptions(
        base_options=base_options,
        min_detection_confidence=0.35,  # Lowered threshold to detect far or angled faces in group shots
        min_suppression_threshold=0.3
    )
    
    with vision.FaceDetector.create_from_options(options) as detector:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Convert BGR frame (OpenCV format) to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Create MediaPipe Image
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # Run face detection
            detection_result = detector.detect(mp_image)

            if detection_result.detections:
                for detection in detection_result.detections:
                    bbox = detection.bounding_box
                    
                    x = int(bbox.origin_x)
                    y = int(bbox.origin_y)
                    w = int(bbox.width)
                    h = int(bbox.height)

                    # Compute clamping boundaries securely to avoid invalid coordinates or shifts
                    x1 = max(0, min(x, width - 1))
                    y1 = max(0, min(y, height - 1))
                    x2 = max(0, min(x + w, width))
                    y2 = max(0, min(y + h, height))

                    w_clamped = x2 - x1
                    h_clamped = y2 - y1

                    # Apply blur only to valid regions of sufficient size to prevent OpenCV failures
                    if w_clamped >= 5 and h_clamped >= 5:
                        # Extract region of interest
                        roi = frame[y1:y2, x1:x2]
                        
                        # Apply Gaussian blur (make sure kernel size is odd and at least 5)
                        ksize_w = int(w_clamped / 3) | 1
                        ksize_h = int(h_clamped / 3) | 1
                        ksize_w = max(5, ksize_w)
                        ksize_h = max(5, ksize_h)
                        
                        # Ensure kernel size does not exceed image slice dimensions
                        ksize_w = min(ksize_w, w_clamped)
                        ksize_h = min(ksize_h, h_clamped)
                        if ksize_w % 2 == 0:
                            ksize_w = max(5, ksize_w - 1)
                        if ksize_h % 2 == 0:
                            ksize_h = max(5, ksize_h - 1)
                        
                        blurred_roi = cv2.GaussianBlur(roi, (ksize_w, ksize_h), 0)
                        frame[y1:y2, x1:x2] = blurred_roi

            # Convert BGR frame (OpenCV format) to RGB for imageio
            rgb_out = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            writer.append_data(rgb_out)

    cap.release()
    writer.close()
    print("Processing complete.")

if __name__ == "__main__":
    main()
