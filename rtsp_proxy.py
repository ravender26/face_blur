# Standalone Local RTSP Proxy Server
# Run this script on your local computer (.venv\Scripts\python rtsp_proxy.py)
# to stream local CCTV feeds to the face-blur app when it is deployed to Vercel.

import cv2
import sys
import time
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

class MJPEGHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/stream':
            params = urllib.parse.parse_qs(parsed_path.query)
            raw_url = params.get('url', [None])[0]
            if not raw_url:
                self.send_error(400, "Missing 'url' query parameter")
                return
            
            # Decode percent-encoded credentials (e.g. %2B to +)
            rtsp_url = raw_url
            try:
                parsed = urllib.parse.urlparse(raw_url)
                if '@' in parsed.netloc:
                    creds, host_port = parsed.netloc.rsplit('@', 1)
                    decoded_creds = urllib.parse.unquote(creds)
                    new_netloc = f"{decoded_creds}@{host_port}"
                    parsed = parsed._replace(netloc=new_netloc)
                    rtsp_url = urllib.parse.urlunparse(parsed)
            except Exception as e:
                print(f"Error parsing URL: {e}")
            
            # Set response headers with CORS wildcard
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, private')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            
            # Force TCP transport protocol in FFmpeg backend
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
            cap = cv2.VideoCapture(rtsp_url)
            if not cap.isOpened():
                print(f"Error: Could not open video source '{rtsp_url}'")
                return
            
            print(f"Connected to stream: {rtsp_url}")
            try:
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        print("Stream disconnected or ended.")
                        break
                    
                    ret_enc, jpeg = cv2.imencode('.jpg', frame)
                    if not ret_enc:
                        continue
                    
                    try:
                        self.wfile.write(b'--frame\r\n')
                        self.send_header('Content-Type', 'image/jpeg')
                        self.send_header('Content-Length', str(len(jpeg)))
                        self.end_headers()
                        self.wfile.write(jpeg.tobytes())
                        self.wfile.write(b'\r\n')
                    except IOError:
                        # Client disconnected
                        break
                    time.sleep(0.033) # Match framerate (~30 FPS)
            except Exception as e:
                print(f"Error during streaming: {e}")
            finally:
                cap.release()
                print("Stream capture released.")
        else:
            self.send_error(404, "Not found")

def run(port=9999):
    # Bind to localhost to make it accessible to the browser client locally
    server = HTTPServer(('127.0.0.1', port), MJPEGHandler)
    print(f"\n==================================================")
    print(f"Local RTSP Proxy Server running on port {port}")
    print(f"Target URL: http://127.0.0.1:{port}/stream?url=<RTSP_URL>")
    print(f"==================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping proxy server...")

if __name__ == '__main__':
    run()
