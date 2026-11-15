import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AuthenticatedRequest, requireAuth } from '../auth.ts';
import { db, deductCredits, refundCredits } from '../db.ts';
import {
  buildSrtFromScenes,
  formatGeminiError,
  generateLyricsText,
  generateMusicAudio,
  generateOrEditImage,
  generateSocialMediaPack,
  generateSpeechAudio,
  generateVideoClip,
  planVideoScenes,
  transcribeAndGenerateSrt,
} from '../gemini.ts';
import {
  AUDIO_DIR,
  editVideoWithFfmpeg,
  IMAGES_DIR,
  resolveAspectDimensions,
  stitchAndProcessVideo,
  TEMP_DIR,
  transcodeAudioFormat,
  VIDEOS_DIR,
} from '../media.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
});

export const studiosRouter = Router();
studiosRouter.use(requireAuth);

function createJobRecord(params: {
  userId: string;
  projectId?: string | null;
  jobType: string;
  prompt: string;
  jobParams: Record<string, unknown>;
  creditsCost: number;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO generation_jobs (
      id, user_id, project_id, job_type, status, progress, step_label,
      prompt, params_json, credits_cost, created_at
    ) VALUES (?, ?, ?, ?, 'processing', 5, 'Initializing', ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    params.projectId ?? null,
    params.jobType,
    params.prompt,
    JSON.stringify(params.jobParams),
    params.creditsCost,
    now
  );
  return id;
}

function updateJobProgress(jobId: string, progress: number, stepLabel: string): void {
  db.prepare('UPDATE generation_jobs SET progress = ?, step_label = ? WHERE id = ?').run(progress, stepLabel, jobId);
}

function completeJobRecord(jobId: string, outputUrl: string, outputMeta: Record<string, unknown>): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE generation_jobs
    SET status = 'completed', progress = 100, step_label = 'Completed',
        output_url = ?, output_meta_json = ?, completed_at = ?
    WHERE id = ?
  `).run(outputUrl, JSON.stringify(outputMeta), now, jobId);
}

function failJobRecord(jobId: string, errorMessage: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE generation_jobs
    SET status = 'failed', step_label = 'Failed', error_message = ?, completed_at = ?
    WHERE id = ?
  `).run(errorMessage, now, jobId);
}

// ---------- PROJECTS, JOBS, DOWNLOADS & CREDITS ----------

studiosRouter.get('/projects', (req: AuthenticatedRequest, res: Response) => {
  const projects = db
    .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.userId);
  res.json({ projects });
});

studiosRouter.post('/projects', (req: AuthenticatedRequest, res: Response) => {
  const { title, type, description, thumbnailUrl } = req.body as {
    title?: string;
    type?: string;
    description?: string;
    thumbnailUrl?: string;
  };
  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Project title is required.' });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO projects (id, user_id, title, type, description, thumbnail_url, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)
  `).run(id, req.userId, title.trim(), type || 'video', description || '', thumbnailUrl || null, now, now);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ project });
});

studiosRouter.delete('/projects/:id', (req: AuthenticatedRequest, res: Response) => {
  const info = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  res.json({ deleted: true });
});

studiosRouter.get('/jobs', (req: AuthenticatedRequest, res: Response) => {
  const limit = Math.min(100, Number(req.query.limit) || 40);
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  const jobs = type
    ? db
        .prepare('SELECT * FROM generation_jobs WHERE user_id = ? AND job_type = ? ORDER BY created_at DESC LIMIT ?')
        .all(req.userId, type, limit)
    : db
        .prepare('SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(req.userId, limit);
  res.json({ jobs });
});

studiosRouter.get('/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
  const job = db
    .prepare('SELECT * FROM generation_jobs WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!job) {
    res.status(404).json({ error: 'Generation job not found.' });
    return;
  }
  res.json({ job });
});

studiosRouter.get('/downloads', (req: AuthenticatedRequest, res: Response) => {
  const downloads = db
    .prepare('SELECT * FROM downloads WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
    .all(req.userId);
  res.json({ downloads });
});

studiosRouter.post('/downloads', (req: AuthenticatedRequest, res: Response) => {
  const { jobId, fileName, fileUrl, format } = req.body as {
    jobId?: string;
    fileName?: string;
    fileUrl?: string;
    format?: string;
  };
  if (!fileName || !fileUrl) {
    res.status(400).json({ error: 'fileName and fileUrl are required.' });
    return;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO downloads (id, user_id, job_id, file_name, file_url, format, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId, jobId || null, fileName, fileUrl, format || 'file', now);
  res.status(201).json({ id });
});

studiosRouter.get('/credits/history', (req: AuthenticatedRequest, res: Response) => {
  const transactions = db
    .prepare('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 80')
    .all(req.userId);
  res.json({ transactions });
});

// ---------- 1. AI IMAGE STUDIO (Generate, Edit, Background Remover) ----------

studiosRouter.post('/image', async (req: AuthenticatedRequest, res: Response) => {
  const {
    prompt,
    style,
    aspectRatio,
    resolution,
    highQuality,
    mode,
    referenceImageBase64,
    referenceMimeType,
    projectId,
  } = req.body as {
    prompt?: string;
    style?: string;
    aspectRatio?: string;
    resolution?: '1K' | '2K' | '4K';
    highQuality?: boolean;
    mode?: 'generate' | 'edit' | 'bg_remove';
    referenceImageBase64?: string;
    referenceMimeType?: string;
    projectId?: string;
  };

  if (mode !== 'bg_remove' && (!prompt || !prompt.trim())) {
    res.status(400).json({ error: 'Image prompt is required.' });
    return;
  }

  if ((mode === 'edit' || mode === 'bg_remove') && !referenceImageBase64) {
    res.status(400).json({ error: 'Reference image is required for editing or background removal.' });
    return;
  }

  const cost = highQuality || resolution === '4K' ? 4 : 2;
  const effectiveMode = mode || 'generate';
  const jobType = effectiveMode === 'bg_remove' ? 'bg_remove' : effectiveMode === 'edit' ? 'image_edit' : 'image';

  if (!deductCredits(req.userId!, 'image', cost, `Image Studio (${effectiveMode})`)) {
    res.status(402).json({ error: 'Insufficient Image credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    projectId,
    jobType,
    prompt: prompt?.trim() || 'Background removal isolation',
    jobParams: { style, aspectRatio, resolution, highQuality, mode: effectiveMode },
    creditsCost: cost,
  });

  try {
    updateJobProgress(jobId, 45, 'Synthesizing image');
    const result = await generateOrEditImage({
      prompt: prompt?.trim() || '',
      style,
      aspectRatio,
      resolution,
      highQuality,
      referenceImageBase64,
      referenceMimeType,
      mode: effectiveMode,
    });

    const ext = result.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `img_${jobId}.${ext}`;
    const filePath = path.join(IMAGES_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(result.base64, 'base64'));

    const outputUrl = `/media/images/${fileName}`;
    completeJobRecord(jobId, outputUrl, {
      aspectRatio: aspectRatio || '1:1',
      resolution: resolution || '1K',
      style: style || 'none',
      mimeType: result.mimeType,
      caption: result.caption,
    });

    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'image', cost, `Refund failed Image Studio (${effectiveMode})`);
    const formatted = formatGeminiError(err);
    failJobRecord(jobId, formatted.message);
    res.status(formatted.status).json({ error: formatted.message, jobId });
  }
});

// ---------- 2. AI VIDEO STUDIO (>= 60s Multi-Clip Stitching + Video Editor) ----------

studiosRouter.post('/video', async (req: AuthenticatedRequest, res: Response) => {
  const {
    prompt,
    mode,
    aspectRatio,
    customWidth,
    customHeight,
    resolution,
    targetDurationSec,
    quality,
    includeSubtitles,
    referenceImageBase64,
    referenceMimeType,
    projectId,
  } = req.body as {
    prompt?: string;
    mode?: 'text' | 'image' | 'script';
    aspectRatio?: string;
    customWidth?: number;
    customHeight?: number;
    resolution?: '360p' | '720p' | '1080p' | '4k';
    targetDurationSec?: number;
    quality?: 'standard' | 'high' | 'ultra';
    includeSubtitles?: boolean;
    referenceImageBase64?: string;
    referenceMimeType?: string;
    projectId?: string;
  };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'Video prompt or script is required.' });
    return;
  }

  const effectiveMode = mode || 'text';
  if (effectiveMode === 'image' && !referenceImageBase64) {
    res.status(400).json({ error: 'A starting frame image is required for Image-to-Video.' });
    return;
  }

  const requestedSec = Math.max(10, Math.min(120, Number(targetDurationSec) || 60));
  const clipCount = Math.max(1, Math.ceil(requestedSec / 15));
  const cost = clipCount * 3;

  if (!deductCredits(req.userId!, 'video', cost, `Video Studio (${requestedSec}s, ${clipCount} clips)`)) {
    res.status(402).json({ error: `Insufficient Video credits (${cost} required for ${requestedSec}s production).` });
    return;
  }

  const dims = resolveAspectDimensions(aspectRatio || '16:9', resolution || '720p', customWidth, customHeight);
  const jobId = createJobRecord({
    userId: req.userId!,
    projectId,
    jobType: 'video',
    prompt: prompt.trim(),
    jobParams: {
      mode: effectiveMode,
      aspectRatio: aspectRatio || '16:9',
      resolution: resolution || '720p',
      targetDurationSec: requestedSec,
      quality: quality || 'high',
      includeSubtitles: Boolean(includeSubtitles),
      clipCount,
    },
    creditsCost: cost,
  });

  // Return 202 Accepted immediately and process background multi-clip generation + FFmpeg stitching
  res.status(202).json({
    job: db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId),
  });

  // Async background pipeline
  (async () => {
    const tempClipPaths: string[] = [];
    try {
      updateJobProgress(jobId, 10, `Planning ${clipCount}-scene storyboard`);
      const scenes = await planVideoScenes({
        prompt: prompt.trim(),
        targetDurationSec: requestedSec,
        mode: effectiveMode,
      });

      let prevInteractionId: string | undefined;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const pct = 15 + Math.round((i / scenes.length) * 65);
        updateJobProgress(jobId, pct, `Rendering clip ${i + 1} of ${scenes.length} (${scene.durationSec}s)`);

        const clip = await generateVideoClip({
          prompt: scene.visualPrompt,
          aspectRatio: dims.nativeProviderRatio,
          durationSec: scene.durationSec,
          resolution: resolution || '720p',
          previousInteractionId: i > 0 ? prevInteractionId : undefined,
          imageBase64: i === 0 ? referenceImageBase64 : undefined,
          imageMimeType: i === 0 ? referenceMimeType : undefined,
        });

        prevInteractionId = clip.interactionId;
        const clipPath = path.join(TEMP_DIR, `clip_${jobId}_${i}.mp4`);
        fs.writeFileSync(clipPath, clip.buffer);
        tempClipPaths.push(clipPath);
      }

      updateJobProgress(jobId, 86, 'Stitching clips & framing social ratio via FFmpeg');
      const srtContent = includeSubtitles ? buildSrtFromScenes(scenes) : undefined;
      const outFileName = `video_${jobId}.mp4`;
      const outPath = path.join(VIDEOS_DIR, outFileName);

      const stitched = await stitchAndProcessVideo({
        clipPaths: tempClipPaths,
        outputPath: outPath,
        width: dims.width,
        height: dims.height,
        quality: quality || 'high',
        srtContent,
      });

      completeJobRecord(jobId, `/media/videos/${outFileName}`, {
        durationSec: Math.round(stitched.duration),
        fileSizeBytes: stitched.fileSizeBytes,
        width: dims.width,
        height: dims.height,
        aspectRatio: aspectRatio || '16:9',
        format: 'mp4',
        clipsCombined: scenes.length,
        srt: srtContent || '',
        scenes,
      });
    } catch (err) {
      refundCredits(req.userId!, 'video', cost, `Refund failed Video Studio job ${jobId}`);
      const formatted = formatGeminiError(err);
      failJobRecord(jobId, formatted.message);
    } finally {
      for (const tmp of tempClipPaths) {
        fs.rmSync(tmp, { force: true });
      }
    }
  })();
});

// Video Editor endpoint: trim, reframe social ratio, burn SRT subtitles, attach audio track
studiosRouter.post('/video/edit', upload.single('video'), async (req: AuthenticatedRequest, res: Response) => {
  const {
    sourceUrl,
    trimStart,
    trimEnd,
    aspectRatio,
    resolution,
    srtContent,
    audioSourceUrl,
  } = req.body as {
    sourceUrl?: string;
    trimStart?: string;
    trimEnd?: string;
    aspectRatio?: string;
    resolution?: string;
    srtContent?: string;
    audioSourceUrl?: string;
  };

  let inputPath = '';
  let shouldCleanupInput = false;

  if (req.file) {
    inputPath = path.join(TEMP_DIR, `edit_in_${Date.now()}.mp4`);
    fs.writeFileSync(inputPath, req.file.buffer);
    shouldCleanupInput = true;
  } else if (sourceUrl && sourceUrl.startsWith('/media/videos/')) {
    const safeName = path.basename(sourceUrl);
    inputPath = path.join(VIDEOS_DIR, safeName);
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    res.status(400).json({ error: 'Provide an uploaded MP4 file or select an existing generated video.' });
    return;
  }

  if (!deductCredits(req.userId!, 'video', 2, 'Video Editor Export')) {
    if (shouldCleanupInput) fs.rmSync(inputPath, { force: true });
    res.status(402).json({ error: 'Insufficient Video credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    jobType: 'video_edit',
    prompt: `Video edit (${aspectRatio || 'original'}, ${srtContent ? 'with subtitles' : 'no subtitles'})`,
    jobParams: { trimStart, trimEnd, aspectRatio, resolution },
    creditsCost: 2,
  });

  try {
    let audioOverlayPath: string | undefined;
    if (audioSourceUrl && audioSourceUrl.startsWith('/media/audio/')) {
      const safeAudio = path.basename(audioSourceUrl);
      const candidate = path.join(AUDIO_DIR, safeAudio);
      if (fs.existsSync(candidate)) audioOverlayPath = candidate;
    }

    const outName = `edited_${jobId}.mp4`;
    const outPath = path.join(VIDEOS_DIR, outName);

    const edited = await editVideoWithFfmpeg({
      inputPath,
      outputPath: outPath,
      trimStart: trimStart ? Number(trimStart) : undefined,
      trimEnd: trimEnd ? Number(trimEnd) : undefined,
      aspectRatio: aspectRatio || undefined,
      resolution: resolution || '720p',
      srtContent,
      audioOverlayPath,
    });

    completeJobRecord(jobId, `/media/videos/${outName}`, {
      durationSec: Math.round(edited.duration),
      fileSizeBytes: edited.fileSizeBytes,
      aspectRatio: aspectRatio || 'original',
      format: 'mp4',
    });

    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'video', 2, 'Refund failed Video Editor Export');
    const msg = err instanceof Error ? err.message : String(err);
    failJobRecord(jobId, msg);
    res.status(500).json({ error: msg });
  } finally {
    if (shouldCleanupInput) fs.rmSync(inputPath, { force: true });
  }
});

// ---------- 3. AI MUSIC STUDIO (Songs, Lyrics, Vocals, Instrumental, MP3/WAV) ----------

studiosRouter.post('/music/lyrics', async (req: AuthenticatedRequest, res: Response) => {
  const { topic, genre, mood } = req.body as { topic?: string; genre?: string; mood?: string };
  if (!topic || !topic.trim()) {
    res.status(400).json({ error: 'Song topic is required to compose lyrics.' });
    return;
  }

  try {
    const lyrics = await generateLyricsText({
      topic: topic.trim(),
      genre: genre || 'Synthwave',
      mood: mood || 'Atmospheric',
    });
    res.json({ lyrics });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

studiosRouter.post('/music', async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, genre, mode, lyrics, fullLength, format, projectId } = req.body as {
    prompt?: string;
    genre?: string;
    mode?: 'song' | 'instrumental' | 'background';
    lyrics?: string;
    fullLength?: boolean;
    format?: 'mp3' | 'wav';
    projectId?: string;
  };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'Music description prompt is required.' });
    return;
  }

  const cost = fullLength ? 5 : 3;
  if (!deductCredits(req.userId!, 'music', cost, `Music Studio (${fullLength ? 'Full Song' : '30s Clip'})`)) {
    res.status(402).json({ error: 'Insufficient Music credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    projectId,
    jobType: 'music',
    prompt: prompt.trim(),
    jobParams: { genre, mode, fullLength, format: format || 'mp3' },
    creditsCost: cost,
  });

  try {
    updateJobProgress(jobId, 40, 'Composing audio via Lyria');
    const result = await generateMusicAudio({
      prompt: prompt.trim(),
      genre: genre || 'Electronic',
      mode: mode || 'song',
      lyrics,
      fullLength: Boolean(fullLength),
    });

    const inputExt: 'mp3' | 'wav' = result.mimeType.includes('wav') ? 'wav' : 'mp3';
    const mp3Name = `track_${jobId}.mp3`;
    const wavName = `track_${jobId}.wav`;
    const mp3Path = path.join(AUDIO_DIR, mp3Name);
    const wavPath = path.join(AUDIO_DIR, wavName);

    updateJobProgress(jobId, 82, 'Encoding MP3 and WAV masters');
    await transcodeAudioFormat(result.buffer, inputExt, 'mp3', mp3Path);
    await transcodeAudioFormat(result.buffer, inputExt, 'wav', wavPath);

    const primaryFormat = format === 'wav' ? 'wav' : 'mp3';
    const primaryUrl = `/media/audio/${primaryFormat === 'wav' ? wavName : mp3Name}`;

    completeJobRecord(jobId, primaryUrl, {
      mp3Url: `/media/audio/${mp3Name}`,
      wavUrl: `/media/audio/${wavName}`,
      genre: genre || 'Electronic',
      mode: mode || 'song',
      lyrics: result.generatedLyrics || lyrics || '',
      format: primaryFormat,
    });

    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'music', cost, 'Refund failed Music Studio track');
    const formatted = formatGeminiError(err);
    failJobRecord(jobId, formatted.message);
    res.status(formatted.status).json({ error: formatted.message, jobId });
  }
});

// ---------- 4. VOICE GENERATOR / TTS, CAPTIONS & SOCIAL STUDIO ----------

studiosRouter.post('/voice', async (req: AuthenticatedRequest, res: Response) => {
  const { text, voiceName, style, dualSpeaker, secondSpeakerText, secondVoiceName, secondStyle, format } =
    req.body as {
      text?: string;
      voiceName?: string;
      style?: string;
      dualSpeaker?: boolean;
      secondSpeakerText?: string;
      secondVoiceName?: string;
      secondStyle?: string;
      format?: 'wav' | 'mp3';
    };

  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Voice script text is required.' });
    return;
  }

  const cost = dualSpeaker ? 2 : 1;
  if (!deductCredits(req.userId!, 'voice', cost, `Voice TTS (${dualSpeaker ? 'Dual' : 'Single'})`)) {
    res.status(402).json({ error: 'Insufficient Voice credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    jobType: 'voice',
    prompt: text.trim().slice(0, 120),
    jobParams: { voiceName, style, dualSpeaker, format: format || 'wav' },
    creditsCost: cost,
  });

  try {
    const wavBuffer = await generateSpeechAudio({
      text: text.trim(),
      voiceName: voiceName || 'Kore',
      style,
      dualSpeaker,
      secondSpeakerText,
      secondVoiceName,
      secondStyle,
    });

    const wavName = `voice_${jobId}.wav`;
    const mp3Name = `voice_${jobId}.mp3`;
    const wavPath = path.join(AUDIO_DIR, wavName);
    const mp3Path = path.join(AUDIO_DIR, mp3Name);

    fs.writeFileSync(wavPath, wavBuffer);
    await transcodeAudioFormat(wavBuffer, 'wav', 'mp3', mp3Path);

    const primaryUrl = format === 'mp3' ? `/media/audio/${mp3Name}` : `/media/audio/${wavName}`;
    completeJobRecord(jobId, primaryUrl, {
      wavUrl: `/media/audio/${wavName}`,
      mp3Url: `/media/audio/${mp3Name}`,
      voiceName: voiceName || 'Kore',
      format: format || 'wav',
    });

    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'voice', cost, 'Refund failed Voice TTS');
    const formatted = formatGeminiError(err);
    failJobRecord(jobId, formatted.message);
    res.status(formatted.status).json({ error: formatted.message, jobId });
  }
});

studiosRouter.post('/captions', upload.single('media'), async (req: AuthenticatedRequest, res: Response) => {
  const { mediaBase64, mimeType } = req.body as { mediaBase64?: string; mimeType?: string };
  let base64 = mediaBase64 || '';
  let resolvedMime = mimeType || 'audio/mp3';

  if (req.file) {
    base64 = req.file.buffer.toString('base64');
    resolvedMime = req.file.mimetype || 'audio/mp3';
  }

  if (!base64) {
    res.status(400).json({ error: 'Upload an audio or video file to generate automatic captions.' });
    return;
  }

  if (!deductCredits(req.userId!, 'voice', 2, 'Automatic Captions & Transcription')) {
    res.status(402).json({ error: 'Insufficient Voice credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    jobType: 'captions',
    prompt: 'Automatic Audio/Video Transcription & SRT Generation',
    jobParams: { mimeType: resolvedMime },
    creditsCost: 2,
  });

  try {
    const result = await transcribeAndGenerateSrt({ audioBase64: base64, mimeType: resolvedMime });
    const srtName = `captions_${jobId}.srt`;
    const srtPath = path.join(AUDIO_DIR, srtName);
    fs.writeFileSync(srtPath, result.srt, 'utf8');

    completeJobRecord(jobId, `/media/audio/${srtName}`, {
      transcript: result.transcript,
      srt: result.srt,
      format: 'srt',
    });

    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'voice', 2, 'Refund failed Automatic Captions');
    const formatted = formatGeminiError(err);
    failJobRecord(jobId, formatted.message);
    res.status(formatted.status).json({ error: formatted.message, jobId });
  }
});

studiosRouter.post('/social', async (req: AuthenticatedRequest, res: Response) => {
  const { topic, platform, aspectRatio, tone } = req.body as {
    topic?: string;
    platform?: string;
    aspectRatio?: string;
    tone?: string;
  };

  if (!topic || !topic.trim()) {
    res.status(400).json({ error: 'Campaign topic is required.' });
    return;
  }

  if (!deductCredits(req.userId!, 'chat', 2, `Social Media Generator (${platform || 'TikTok'})`)) {
    res.status(402).json({ error: 'Insufficient Chat credits.' });
    return;
  }

  const jobId = createJobRecord({
    userId: req.userId!,
    jobType: 'social',
    prompt: topic.trim(),
    jobParams: { platform, aspectRatio, tone },
    creditsCost: 2,
  });

  try {
    const pack = await generateSocialMediaPack({
      topic: topic.trim(),
      platform: platform || 'TikTok',
      aspectRatio: aspectRatio || '9:16',
      tone: tone || 'High-Retention Editorial',
    });

    completeJobRecord(jobId, '', pack);
    const job = db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(jobId);
    res.status(201).json({ job });
  } catch (err) {
    refundCredits(req.userId!, 'chat', 2, 'Refund failed Social Media Generator');
    const formatted = formatGeminiError(err);
    failJobRecord(jobId, formatted.message);
    res.status(formatted.status).json({ error: formatted.message, jobId });
  }
});
