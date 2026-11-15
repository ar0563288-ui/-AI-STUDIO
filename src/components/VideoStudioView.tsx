import React, { useEffect, useState } from 'react';
import { Download, Film, Loader2, Scissors, Upload } from 'lucide-react';
import { api, triggerFileDownload } from '../lib/api';
import { GenerationJob } from '../types/studio';
import { RatioSelector } from './RatioSelector';

interface VideoStudioViewProps {
  recentVideos: GenerationJob[];
  recentAudio: GenerationJob[];
  initialPrompt?: string;
  onCompleted: () => void;
}

export function VideoStudioView({
  recentVideos,
  recentAudio,
  initialPrompt,
  onCompleted,
}: VideoStudioViewProps) {
  const [tab, setTab] = useState<'generate' | 'edit'>('generate');
  const [mode, setMode] = useState<'text' | 'image' | 'script'>('text');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [ratioPresetId, setRatioPresetId] = useState('yt_landscape');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [customWidth, setCustomWidth] = useState(16);
  const [customHeight, setCustomHeight] = useState(9);
  const [resolution, setResolution] = useState<'360p' | '720p' | '1080p' | '4k'>('720p');
  const [targetDurationSec, setTargetDurationSec] = useState(60);
  const [quality, setQuality] = useState<'standard' | 'high' | 'ultra'>('high');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);

  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);
  const [refImageBase64, setRefImageBase64] = useState<string | undefined>(undefined);
  const [refImageMime, setRefImageMime] = useState<string | undefined>(undefined);

  const [activeJob, setActiveJob] = useState<GenerationJob | null>(recentVideos[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video Editor state
  const [editSourceUrl, setEditSourceUrl] = useState(recentVideos[0]?.output_url || '');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [trimStart, setTrimStart] = useState('0');
  const [trimEnd, setTrimEnd] = useState('');
  const [editSrt, setEditSrt] = useState('');
  const [editAudioUrl, setEditAudioUrl] = useState('');

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      setMode('script');
    }
  }, [initialPrompt]);

  // Poll active processing job
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'processing') return;
    const timer = setInterval(async () => {
      try {
        const res = await api.getJob(activeJob.id);
        setActiveJob(res.job);
        if (res.job.status === 'completed' || res.job.status === 'failed') {
          clearInterval(timer);
          if (res.job.status === 'failed' && res.job.error_message) {
            setError(res.job.error_message);
          }
          onCompleted();
        }
      } catch {
        clearInterval(timer);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setRefImagePreview(dataUrl);
      setRefImageBase64(dataUrl.split(',')[1]);
      setRefImageMime(file.type || 'image/png');
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const finalRatio = ratioPresetId === 'custom' ? `${customWidth}:${customHeight}` : aspectRatio;
      const res = await api.generateVideo({
        prompt,
        mode,
        aspectRatio: finalRatio,
        customWidth,
        customHeight,
        resolution,
        targetDurationSec,
        quality,
        includeSubtitles,
        referenceImageBase64: refImageBase64,
        referenceMimeType: refImageMime,
      });
      setActiveJob(res.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start video job');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditExport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (editFile) {
        fd.append('video', editFile);
      } else if (editSourceUrl) {
        fd.append('sourceUrl', editSourceUrl);
      }
      if (trimStart) fd.append('trimStart', trimStart);
      if (trimEnd) fd.append('trimEnd', trimEnd);
      const finalRatio = ratioPresetId === 'custom' ? `${customWidth}:${customHeight}` : aspectRatio;
      fd.append('aspectRatio', finalRatio);
      fd.append('resolution', resolution);
      if (editSrt.trim()) fd.append('srtContent', editSrt);
      if (editAudioUrl) fd.append('audioSourceUrl', editAudioUrl);

      const res = await api.editVideo(fd);
      setActiveJob(res.job);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video export failed');
    } finally {
      setSubmitting(false);
    }
  }

  const clipCount = Math.max(1, Math.ceil(targetDurationSec / 15));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Controls */}
      <div className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">AI Video Studio</h2>
            <p className="text-xs text-violet-200/60 mt-0.5">
              60s+ multi-clip stitched MP4 production & editor
            </p>
          </div>
          <div className="flex p-1 rounded-lg bg-[#08050F] border border-violet-500/15 shrink-0">
            <button
              type="button"
              onClick={() => setTab('generate')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'generate' ? 'bg-violet-600 text-white' : 'text-violet-200/70 hover:text-white'
              }`}
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => setTab('edit')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'edit' ? 'bg-violet-600 text-white' : 'text-violet-200/70 hover:text-white'
              }`}
            >
              Editor
            </button>
          </div>
        </div>

        {tab === 'generate' ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#08050F] border border-violet-500/15">
              {[
                { id: 'text', label: 'Text-to-Video' },
                { id: 'image', label: 'Image-to-Video' },
                { id: 'script', label: 'Script-to-Video' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id as typeof mode)}
                  className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === m.id ? 'bg-violet-600 text-white' : 'text-violet-200/70 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'image' && (
              <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-500/30 bg-[#08050F] hover:border-violet-400 p-4 cursor-pointer">
                {refImagePreview ? (
                  <img
                    src={refImagePreview}
                    alt="Starting frame"
                    referrerPolicy="no-referrer"
                    className="max-h-32 rounded-lg object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="w-5 h-5 text-violet-400 mx-auto mb-1.5" />
                    <span className="text-xs text-violet-200/70">Upload starting frame image</span>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            )}

            <div>
              <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
                {mode === 'script' ? 'Full Video Script' : 'Video Scene Prompt'}
              </label>
              <textarea
                rows={4}
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === 'script'
                    ? 'Paste your narration script or storyboard outline. AI STUDIO will segment scenes and stitch a 60s+ film...'
                    : 'A futuristic architectural observatory overlooking a violet nebula at twilight, slow drone push-in...'
                }
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-violet-200/80">Final Video Duration</label>
                <span className="text-xs font-mono tabular-nums text-violet-300/70">
                  {targetDurationSec}s · {clipCount} {clipCount === 1 ? 'clip' : 'clips combined'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[15, 60, 75, 90].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTargetDurationSec(sec)}
                    className={`py-2 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors ${
                      targetDurationSec === sec
                        ? 'bg-violet-600/20 border-violet-500 text-white'
                        : 'bg-[#120D1E] border-violet-500/15 text-violet-200/70 hover:text-white'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <RatioSelector
              selectedPresetId={ratioPresetId}
              customWidth={customWidth}
              customHeight={customHeight}
              onSelect={(id, r) => {
                setRatioPresetId(id);
                setAspectRatio(r);
              }}
              onCustomChange={(w, h) => {
                setCustomWidth(w);
                setCustomHeight(h);
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as typeof resolution)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="360p">360p Preview</option>
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="4k">4K Master</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Export Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as typeof quality)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="standard">Standard MP4</option>
                  <option value="high">High Bitrate MP4</option>
                  <option value="ultra">Ultra Master MP4</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 cursor-pointer">
              <span className="text-xs text-violet-200/85">Auto-burn synchronized subtitles</span>
              <input
                type="checkbox"
                checked={includeSubtitles}
                onChange={(e) => setIncludeSubtitles(e.target.checked)}
                className="accent-violet-500"
              />
            </label>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || activeJob?.status === 'processing'}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2 transition-colors"
            >
              {(submitting || activeJob?.status === 'processing') && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>
                {activeJob?.status === 'processing'
                  ? `Rendering (${activeJob.progress}%)`
                  : `Generate ${targetDurationSec}s Video (${clipCount * 3} cr)`}
              </span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleEditExport} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
                Select Generated Video or Upload MP4
              </label>
              <select
                value={editSourceUrl}
                onChange={(e) => {
                  setEditSourceUrl(e.target.value);
                  setEditFile(null);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white mb-2 focus:border-violet-500 focus:outline-none"
              >
                <option value="">Choose from recent videos...</option>
                {recentVideos
                  .filter((v) => v.output_url)
                  .map((v) => (
                    <option key={v.id} value={v.output_url!}>
                      {v.prompt.slice(0, 48)}
                    </option>
                  ))}
              </select>
              <input
                type="file"
                accept="video/mp4,video/*"
                onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-violet-200/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#161026] file:text-violet-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Trim Start (sec)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs font-mono tabular-nums text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Trim End (sec)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  placeholder="Full length"
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs font-mono tabular-nums text-white"
                />
              </div>
            </div>

            <RatioSelector
              selectedPresetId={ratioPresetId}
              customWidth={customWidth}
              customHeight={customHeight}
              onSelect={(id, r) => {
                setRatioPresetId(id);
                setAspectRatio(r);
              }}
              onCustomChange={(w, h) => {
                setCustomWidth(w);
                setCustomHeight(h);
              }}
            />

            <div>
              <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
                Burn-In Subtitles (.srt format)
              </label>
              <textarea
                rows={3}
                value={editSrt}
                onChange={(e) => setEditSrt(e.target.value)}
                placeholder={'1\n00:00:00,000 --> 00:00:04,000\nWelcome to AI STUDIO.'}
                className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs font-mono text-white placeholder:text-violet-300/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
                Attach Generated Audio Track (Optional)
              </label>
              <select
                value={editAudioUrl}
                onChange={(e) => setEditAudioUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
              >
                <option value="">Keep original audio</option>
                {recentAudio
                  .filter((a) => a.output_url)
                  .map((a) => (
                    <option key={a.id} value={a.output_url!}>
                      {a.job_type.toUpperCase()} · {a.prompt.slice(0, 42)}
                    </option>
                  ))}
              </select>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
              <span>{submitting ? 'Exporting MP4...' : 'Export Edited MP4 (2 cr)'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Player & Job Monitor */}
      <section className="lg:col-span-7 space-y-5">
        <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">Video Monitor</h3>
              {activeJob && (
                <p className="text-xs text-violet-200/60 mt-0.5 truncate">{activeJob.prompt}</p>
              )}
            </div>
            {activeJob?.output_url && activeJob.status === 'completed' && (
              <button
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    activeJob.output_url!,
                    `aistudio_video_${activeJob.id.slice(0, 6)}.mp4`,
                    'mp4',
                    activeJob.id
                  )
                }
                className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export MP4</span>
              </button>
            )}
          </div>

          <div className="rounded-xl bg-[#07050C] border border-violet-500/15 min-h-[360px] flex items-center justify-center overflow-hidden p-4">
            {activeJob?.status === 'processing' ? (
              <div className="w-full max-w-md space-y-3 text-center">
                <Loader2 className="w-7 h-7 animate-spin text-violet-400 mx-auto" />
                <div className="text-sm font-medium text-white">{activeJob.step_label}</div>
                <div className="w-full h-2 rounded-full bg-[#161026] overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>
                <div className="text-xs font-mono tabular-nums text-violet-300/70">
                  {activeJob.progress}% complete
                </div>
              </div>
            ) : activeJob?.output_url && activeJob.status === 'completed' ? (
              <video
                key={activeJob.output_url}
                src={activeJob.output_url}
                controls
                className="max-h-[460px] w-full rounded-lg bg-black"
              />
            ) : (
              <div className="text-center max-w-sm">
                <Film className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                <p className="text-xs text-violet-200/55">
                  Select a 60-second+ duration and aspect ratio to generate multi-clip stitched MP4 video, or open the Video Editor tab.
                </p>
              </div>
            )}
          </div>
        </div>

        {recentVideos.length > 0 && (
          <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Video Render Queue & History</h3>
            <div className="divide-y divide-violet-500/10">
              {recentVideos.slice(0, 6).map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveJob(v)}
                    className="text-left min-w-0 flex-1 hover:text-violet-200"
                  >
                    <div className="text-xs font-medium text-white truncate">{v.prompt}</div>
                    <div className="text-[11px] font-mono tabular-nums text-violet-300/60 mt-0.5">
                      {v.status} · {v.step_label}
                    </div>
                  </button>
                  {v.output_url && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerFileDownload(
                          v.output_url!,
                          `aistudio_video_${v.id.slice(0, 6)}.mp4`,
                          'mp4',
                          v.id
                        )
                      }
                      className="text-xs font-medium text-violet-300 hover:text-white shrink-0"
                    >
                      MP4
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
