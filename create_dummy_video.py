import cv2
import numpy as np

def create_dummy():
    width, height = 640, 480
    fps = 30
    duration_sec = 2
    num_frames = fps * duration_sec

    # Match the output codec of our blur script
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter('dummy_input.mp4', fourcc, fps, (width, height))

    for i in range(num_frames):
        # Create a black frame
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Draw a moving red circle
        center_x = int(100 + i * (width - 200) / num_frames)
        center_y = int(240 + 50 * np.sin(i * 0.1))
        cv2.circle(frame, (center_x, center_y), 50, (0, 0, 255), -1)
        
        # Write frame
        out.write(frame)

    out.release()
    print("Created dummy_input.mp4")

if __name__ == "__main__":
    create_dummy()
