import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');

    // Prevent directory traversal attacks
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      return new NextResponse('Invalid video name', { status: 400 });
    }

    const videoPath = path.join(os.tmpdir(), 'face_blur_blurred', name);

    if (!fs.existsSync(videoPath)) {
      return new NextResponse('Video not found', { status: 404 });
    }

    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(videoPath);
    
    const download = searchParams.get('download') === 'true';

    const headers = {
      'Content-Type': download ? 'application/octet-stream' : 'video/mp4',
      'Content-Length': fileBuffer.length.toString(),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
    };

    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${name}"`;
    }

    // Return standard response with headers configured for video playback
    return new NextResponse(fileBuffer, { headers });

  } catch (error) {
    console.error('Error serving video:', error);
    return new NextResponse('Error serving video', { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
