import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Helper to find Python executable in virtual environment or fallback to system Python
function getPythonPath() {
  const winPath = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
  const nixPath = path.join(process.cwd(), ".venv", "bin", "python");
  if (process.platform === "win32" && fs.existsSync(winPath)) {
    return winPath;
  } else if (fs.existsSync(nixPath)) {
    return nixPath;
  }
  return "python"; // Fallback to system Python
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rtspUrl = searchParams.get("url");

  if (!rtspUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  const pythonPath = getPythonPath();
  const scriptPath = path.join(process.cwd(), "stream_rtsp.py");

  // Spawn Python child process with unbuffered output
  const child = spawn(pythonPath, ["-u", scriptPath, rtspUrl]);

  // Create a ReadableStream to stream the stdout directly to browser client
  const stream = new ReadableStream({
    start(controller) {
      child.stdout.on("data", (chunk) => {
        try {
          controller.enqueue(chunk);
        } catch (_) {}
      });

      child.stderr.on("data", (data) => {
        console.error(`[RTSP Streamer Error] ${data.toString()}`);
      });

      child.stdout.on("end", () => {
        try {
          controller.close();
        } catch (_) {}
      });

      child.stdout.on("error", (err) => {
        try {
          controller.error(err);
        } catch (_) {}
      });

      // Handle connection abort (user closes stream, tab, or navigates away)
      request.signal.addEventListener("abort", () => {
        console.log("[RTSP Stream API] Client aborted request. Terminating Python process...");
        child.kill();
      });
    },
    cancel() {
      console.log("[RTSP Stream API] Stream cancelled. Terminating Python process...");
      child.kill();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Connection": "keep-alive"
    },
  });
}
