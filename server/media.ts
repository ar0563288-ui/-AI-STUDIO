import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const MEDIA_ROOT = path.resolve(process.cwd(), 'uploads');
export const IMAGES_DIR = path.join(MEDIA_ROOT, 'images');
export const VIDEOS_DIR = path.join(MEDIA_ROOT, 'videos');
export const AUDIO_DIR = path.join(MEDIA_ROOT, 'audio');
export const TEMP_DIR = path.join(MEDIA_ROOT, 'temp');

for (const dir of [MEDIA_ROOT, IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR, TEMP_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface AspectDimensions {
  width: number;
  height: number;
  nativeProviderRatio: '16:9' | '9:16';
}

export function resolveAspectDimensions(
  aspectRatio: string,
  resolution: string = '720p',
  customWidth?: number,
  customHeight?: number
): AspectDimensions {
  const baseScale = resolution === '4k' ? 2160 : resolution === '1080p' ? 1080 : 720;

  let wRatio = 16;
  let hRatio = 9;

  if (aspectRatio === 'custom' && customWidth && customHeight && customWidth > 0 && customHeight > 0) {
    wRatio = customWidth;
    hRatio = customHeight;
  } else if (aspectRatio.includes(':')) {
    const [wStr, hStr] = aspectRatio.split(':');
    const w = parseFloat(wStr);
    const h = parseFloat(hStr);
    if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
      wRatio = w;
      hRatio = h;
    }
  }

  const isPortrait = hRatio > wRatio;
  let width: number;
  let height: number;

  if (isPortrait) {
    width = Math.round(baseScale / 2) * 2;
    height = Math.round(((width * hRatio) / wRatio) / 2) * 2;
  } else {
    height = Math.round(baseScale / 2) * 2;
    width = Math.round(((height * wRatio) / hRatio) / 2) * 2;
  }

  // Cap max dimensions for smooth FFmpeg transcoding in container environments
  const maxDim = resolution === '4k' ? 3840 : resolution === '1080p' ? 1920 : 1280;
  if (width > maxDim) {
    height = Math.round(((height * maxDim) / width) / 2) * 2;
    width = maxDim;
  }
  if (height > maxDim) {
    width = Math.round(((width * maxDim) / height) / 2) * 2;
    height = maxDim;
  }

  return {
    width: Math.max(256, width),
    height: Math.max(256, height),
    nativeProviderRatio: isPortrait ? '9:16' : '16:9',
  };
}

export async function probeMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = parseFloat(stdout.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export interface StitchOptions {
  clipPaths: string[];
  outputPath: string;
  width: number;
  height: number;
  quality?: 'standard' | 'high' | 'ultra';
  srtContent?: string;
  audioOverlayPath?: string;
}

/**
 * Normalizes and concatenates multiple generated video clips into a single seamless MP4,
 * guaranteeing exact social-media dimensions, optional burned-in SRT subtitles, and optional audio mix.
 */
export async function stitchAndProcessVideo(opts: StitchOptions): Promise<{ duration: number; fileSizeBytes: number }> {
  const { clipPaths, outputPath, width, height, quality = 'high', srtContent, audioOverlayPath } = opts;
  if (clipPaths.length === 0) {
    throw new Error('No video clips provided for stitching.');
  }

  const crf = quality === 'ultra' ? '18' : quality === 'high' ? '21' : '25';
  const normalizedClips: string[] = [];

  try {
    // 1. Normalize each clip to identical resolution, pixel format, fps, and audio channel layout
    for (let i = 0; i < clipPaths.length; i++) {
      const clip = clipPaths[i];
      const normPath = path.join(TEMP_DIR, `norm_${Date.now()}_${i}.mp4`);
      const clipHasAudio = await hasAudioStream(clip);
      const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,format=yuv420p`;

      const args: string[] = ['-y', '-i', clip];
      if (!clipHasAudio) {
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      }
      args.push(
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', crf,
        '-c:a', 'aac',
        '-ar', '44100',
        '-ac', '2',
        '-shortest',
        normPath
      );

      await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 20 });
      normalizedClips.push(normPath);
    }

    // 2. Concatenate normalized clips using concat demuxer
    const concatListPath = path.join(TEMP_DIR, `concat_${Date.now()}.txt`);
    const concatBody = normalizedClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListPath, concatBody, 'utf8');

    const stitchedRawPath = path.join(TEMP_DIR, `stitched_${Date.now()}.mp4`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      stitchedRawPath,
    ], { maxBuffer: 1024 * 1024 * 20 });

    // 3. Apply optional SRT subtitles and/or audio overlay
    let currentVideo = stitchedRawPath;

    if (srtContent && srtContent.trim().length > 0) {
      const srtPath = path.join(TEMP_DIR, `subs_${Date.now()}.srt`);
      fs.writeFileSync(srtPath, srtContent, 'utf8');
      const subbedPath = path.join(TEMP_DIR, `subbed_${Date.now()}.mp4`);
      const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', currentVideo,
        '-vf', `subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00120B24,Outline=2,Shadow=1,MarginV=28'`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', crf,
        '-c:a', 'copy',
        subbedPath,
      ], { maxBuffer: 1024 * 1024 * 20 });
      currentVideo = subbedPath;
      fs.rmSync(srtPath, { force: true });
    }

    if (audioOverlayPath && fs.existsSync(audioOverlayPath)) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', currentVideo,
        '-i', audioOverlayPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        outputPath,
      ], { maxBuffer: 1024 * 1024 * 20 });
    } else {
      fs.copyFileSync(currentVideo, outputPath);
    }

    const duration = await probeMediaDuration(outputPath);
    const stat = fs.statSync(outputPath);
    return { duration, fileSizeBytes: stat.size };
  } finally {
    for (const tmp of normalizedClips) {
      fs.rmSync(tmp, { force: true });
    }
  }
}

export interface EditVideoOptions {
  inputPath: string;
  outputPath: string;
  trimStart?: number;
  trimEnd?: number;
  aspectRatio?: string;
  resolution?: string;
  srtContent?: string;
  audioOverlayPath?: string;
}

export async function editVideoWithFfmpeg(opts: EditVideoOptions): Promise<{ duration: number; fileSizeBytes: number }> {
  const { inputPath, outputPath, trimStart, trimEnd, aspectRatio, resolution, srtContent, audioOverlayPath } = opts;
  const args: string[] = ['-y'];

  if (typeof trimStart === 'number' && trimStart > 0) {
    args.push('-ss', String(trimStart));
  }
  args.push('-i', inputPath);

  if (typeof trimEnd === 'number' && trimEnd > (trimStart ?? 0)) {
    const dur = trimEnd - (trimStart ?? 0);
    args.push('-t', String(dur));
  }

  const filters: string[] = [];
  if (aspectRatio) {
    const dims = resolveAspectDimensions(aspectRatio, resolution ?? '720p');
    filters.push(`scale=${dims.width}:${dims.height}:force_original_aspect_ratio=increase,crop=${dims.width}:${dims.height},setsar=1`);
  }

  let srtPath: string | null = null;
  if (srtContent && srtContent.trim().length > 0) {
    srtPath = path.join(TEMP_DIR, `edit_subs_${Date.now()}.srt`);
    fs.writeFileSync(srtPath, srtContent, 'utf8');
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(`subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00120B24,Outline=2,MarginV=28'`);
  }

  if (audioOverlayPath && fs.existsSync(audioOverlayPath)) {
    args.push('-i', audioOverlayPath);
    args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-c:a', 'aac', outputPath);

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 20 });
    const duration = await probeMediaDuration(outputPath);
    const stat = fs.statSync(outputPath);
    return { duration, fileSizeBytes: stat.size };
  } finally {
    if (srtPath) fs.rmSync(srtPath, { force: true });
  }
}

export async function transcodeAudioFormat(
  inputBuffer: Buffer,
  inputExt: 'mp3' | 'wav',
  targetFormat: 'mp3' | 'wav',
  outputPath: string
): Promise<void> {
  if (inputExt === targetFormat) {
    fs.writeFileSync(outputPath, inputBuffer);
    return;
  }

  const tempInput = path.join(TEMP_DIR, `audio_in_${Date.now()}.${inputExt}`);
  fs.writeFileSync(tempInput, inputBuffer);
  try {
    const args =
      targetFormat === 'wav'
        ? ['-y', '-i', tempInput, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', outputPath]
        : ['-y', '-i', tempInput, '-codec:a', 'libmp3lame', '-b:a', '192k', outputPath];
    await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 10 });
  } finally {
    fs.rmSync(tempInput, { force: true });
  }
}
