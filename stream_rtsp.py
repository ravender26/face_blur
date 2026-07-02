import cv2
import sys
import time
import os
import urllib.parse

def decode_rtsp_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
        if '@' in parsed.netloc:
            creds, host_port = parsed.netloc.rsplit('@', 1)
            # Unquote only the credentials (username/password) to decode percent-encoded chars (e.g. %2B to +)
            decoded_creds = urllib.parse.unquote(creds)
            # Reconstruct netloc
            new_netloc = f"{decoded_creds}@{host_port}"
            # Reconstruct the URL
            parsed = parsed._replace(netloc=new_netloc)
            return urllib.parse.urlunparse(parsed)
    except Exception as e:
        print(f"Error parsing URL: {e}", file=sys.stderr)
    return urllib.parse.unquote(url)

def main():
    if len(sys.argv) < 2:
        print("Error: Missing RTSP URL argument", file=sys.stderr)
        sys.exit(1)

    # Force TCP transport for RTSP streams in OpenCV/FFmpeg backend (prevents packet drop/firewall issues)
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

    raw_url = sys.argv[1]
    rtsp_url = decode_rtsp_url(raw_url)
    
    print(f"Connecting to decoded video source: {rtsp_url}", file=sys.stderr)

    # Try opening the video stream (handles rtsp://, http://, and standard video file paths)
    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        print(f"Error: Could not open video source '{rtsp_url}'", file=sys.stderr)
        sys.exit(1)

    try:
        # Loop over frames
        while True:
            ret, frame = cap.read()
            if not ret:
                # Stream ended or disconnected
                print("Stream disconnected or ended", file=sys.stderr)
                break

            # Encode frame to JPEG
            ret_enc, jpeg = cv2.imencode('.jpg', frame)
            if not ret_enc:
                continue

            # Write MJPEG boundary and JPEG image buffer to stdout
            try:
                sys.stdout.buffer.write(b'--frame\r\n')
                sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n')
                sys.stdout.buffer.write(f'Content-Length: {len(jpeg)}\r\n\r\n'.encode('ascii'))
                sys.stdout.buffer.write(jpeg.tobytes())
                sys.stdout.buffer.write(b'\r\n')
                sys.stdout.flush()
            except IOError:
                # Broke pipe (e.g. Next.js closed/aborted the socket connection)
                break

            # Sleep briefly to regulate framerate and avoid excessive CPU usage
            # ~33ms corresponds to ~30 FPS
            time.sleep(0.033)
    except Exception as e:
        print(f"Error during streaming: {e}", file=sys.stderr)
    finally:
        cap.release()

if __name__ == '__main__':
    main()
