import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const videoFile = formData.get('video');

    if (!videoFile) {
      return NextResponse.json({ error: 'No video file uploaded' }, { status: 400 });
    }

    const bytes = await videoFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Use system temp directory (os.tmpdir()) to ensure write access on read-only hosting environments like Vercel/Docker
    const tempBaseDir = os.tmpdir();
    const uploadDir = path.join(tempBaseDir, 'face_blur_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const outputDir = path.join(tempBaseDir, 'face_blur_blurred');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileExt = path.extname(videoFile.name) || '.mp4';
    const inputFileName = `input-${Date.now()}${fileExt}`;
    const outputFileName = `blurred-${Date.now()}.mp4`;

    const inputPath = path.join(uploadDir, inputFileName);
    const outputPath = path.join(outputDir, outputFileName);

    // Write file to temp path
    fs.writeFileSync(inputPath, buffer);

    // Determine the python command to use. Windows virtualenv uses .venv\Scripts\python.exe
    const venvPythonPath = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const pythonCmd = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python';
    const scriptPath = path.join(process.cwd(), 'blur_video.py');

    // Run Python worker as subprocess
    await new Promise((resolve, reject) => {
      const pyProcess = spawn(pythonCmd, [scriptPath, inputPath, outputPath]);

      let stderr = '';
      pyProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pyProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python process exited with code ${code}. Error: ${stderr}`));
        }
      });
    });

    // Cleanup input file to save space
    if (fs.existsSync(inputPath)) {
      try {
        fs.unlinkSync(inputPath);
      } catch (err) {
        console.error('Failed to delete temp input file:', err);
      }
    }

    const publicUrl = `/api/video?name=${outputFileName}`;
    return NextResponse.json({ success: true, url: publicUrl });

  } catch (error) {
    console.error('Error processing video:', error);
    return NextResponse.json({ error: error.message || 'Failed to process video' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
