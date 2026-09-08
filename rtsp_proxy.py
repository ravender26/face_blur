# Standalone Local RTSP Proxy Server
# Run this script on your local computer (.venv\Scripts\python rtsp_proxy.py)
# to stream local CCTV feeds to the face-blur app when it is deployed to Vercel.

import cv2
import sys
import time
import os
import urllib.parse
import subprocess
import threading
import shutil
import atexit
from http.server import BaseHTTPRequestHandler, HTTPServer

tunnel_proc = None

def cleanup_tunnel():
    global tunnel_proc
    if tunnel_proc:
        print("\n[Tunnel] Closing secure tunnel...")
        try:
            tunnel_proc.terminate()
            tunnel_proc.wait(timeout=2)
        except Exception:
            try:
                tunnel_proc.kill()
            except Exception:
                pass
        tunnel_proc = None

atexit.register(cleanup_tunnel)

def start_tunnel_background(port):
    global tunnel_proc
    
    def run_tunnel():
        global tunnel_proc
        cf_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe")
        
        # 1. Try Cloudflare Tunnel first (No landing page, no cookie blocking, works seamlessly in <img> tags)
        if os.path.exists(cf_path) or shutil.which("cloudflared"):
            cmd = [cf_path if os.path.exists(cf_path) else "cloudflared", "tunnel", "--url", f"http://localhost:{port}"]
            try:
                print("[Tunnel] Starting secure Cloudflare HTTPS tunnel...")
                tunnel_proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )
                
                for line in iter(tunnel_proc.stdout.readline, ''):
                    if "trycloudflare.com" in line:
                        for word in line.split():
                            if "https://" in word and "trycloudflare.com" in word:
                                url = word.strip().rstrip('/')
                                print(f"\n==================================================")
                                print(f"🚀 Cloudflare HTTPS Tunnel Active!")
                                print(f"Tunnel URL: {url}")
                                print(f"Paste '{url}' into Advanced Connection Settings on Vercel.")
                                print(f"==================================================\n")
                                return
            except Exception as e:
                print(f"[Tunnel] Cloudflare Tunnel start failed: {e}")

        # 2. Fallback to localtunnel via npx
        if shutil.which("npx"):
            try:
                print("[Tunnel] Starting secure HTTPS tunnel via localtunnel...")
                tunnel_proc = subprocess.Popen(
                    ["npx", "localtunnel", "--port", str(port)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    shell=True
                )
                
                for line in iter(tunnel_proc.stdout.readline, ''):
                    if "your url is:" in line:
                        url = line.split("your url is:")[1].strip()
                        print(f"\n==================================================")
                        print(f"Secure HTTPS Tunnel automatically started!")
                        print(f"Tunnel URL: {url}")
                        print(f"IMPORTANT: Open {url} ONCE in your browser tab and click 'Click to Continue'")
                        print(f"Then paste '{url}' into Advanced Connection Settings on Vercel.")
                        print(f"==================================================\n")
                        break
            except Exception as e:
                print(f"[Tunnel] Failed to start secure tunnel: {e}")

    threading.Thread(target=run_tunnel, daemon=True).start()


class MJPEGHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Handle CORS and Private Network Access preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
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
            
            # Set response headers with CORS wildcard and Private Network Access
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
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
                        self.wfile.write(b'Content-Type: image/jpeg\r\n')
                        self.wfile.write(f'Content-Length: {len(jpeg)}\r\n\r\n'.encode('ascii'))
                        self.wfile.write(jpeg.tobytes())
                        self.wfile.write(b'\r\n')
                        self.wfile.flush()
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
    # Start the secure HTTPS tunnel in the background
    start_tunnel_background(port)

    # Bind to 0.0.0.0 to make it accessible to local network devices
    server = HTTPServer(('0.0.0.0', port), MJPEGHandler)
    print(f"\n==================================================")
    print(f"Local RTSP Proxy Server running on port {port}")
    print(f"Direct Local URL: http://127.0.0.1:{port}/stream?url=<RTSP_URL>")
    print(f"==================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping proxy server...")

if __name__ == '__main__':
    run()
