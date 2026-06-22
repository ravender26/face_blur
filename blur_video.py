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

    # Ensure model is downloaded
    model_path = 'blaze_face_short_range.tflite'
    if not os.path.exists(model_path):
        print("Downloading face detection model...")
        url = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
        try:
            urllib.request.urlretrieve(url, model_path)
            print("Model downloaded successfully.")
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

    # Initialize the MediaPipe Tasks FaceDetector
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.FaceDetectorOptions(base_options=base_options)
    
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
                    
                    x = bbox.origin_x
                    y = bbox.origin_y
                    w = bbox.width
                    h = bbox.height

                    # If coordinates are normalized floats (typically between 0 and 1), scale to pixel dimensions
                    # (Allows support across various MediaPipe API versions/platforms)
                    if isinstance(x, float) and x <= 1.0:
                        x = int(x * width)
                        y = int(y * height)
                        w = int(w * width)
                        h = int(h * height)

                    # Compute clamping boundaries securely to avoid invalid coordinates or shifts
                    x1 = int(max(0, min(x, width - 1)))
                    y1 = int(max(0, min(y, height - 1)))
                    x2 = int(max(0, min(x + w, width)))
                    y2 = int(max(0, min(y + h, height)))

                    w_clamped = x2 - x1
                    h_clamped = y2 - y1

                    if w_clamped > 0 and h_clamped > 0:
                        # Extract region of interest
                        roi = frame[y1:y2, x1:x2]
                        
                        # Apply Gaussian blur
                        ksize_w = int(w_clamped / 3) | 1
                        ksize_h = int(h_clamped / 3) | 1
                        ksize_w = max(5, ksize_w)
                        ksize_h = max(5, ksize_h)
                        
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
