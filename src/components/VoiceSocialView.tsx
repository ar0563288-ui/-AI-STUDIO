import React, { useState } from 'react';
import { ArrowRight, Download, Loader2, Mic, Subtitles, Upload } from 'lucide-react';
import { api, triggerFileDownload } from '../lib/api';
import { GenerationJob } from '../types/studio';

interface VoiceSocialViewProps {
  onSendScriptToVideo: (scriptPrompt: string) => void;
  onCompleted: () => void;
}

const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

interface SocialPackOutput {
  title?: string;
  hook?: string;
  script?: string;
  caption?: string;
  hashtags?: string[];
  shotList?: string[];
  videoPrompt?: string;
}

export function VoiceSocialView({ onSendScriptToVideo, onCompleted }: VoiceSocialViewProps) {
  const [tab, setTab] = useState<'voice' | 'captions' | 'social'>('voice');

  // Voice / TTS State
  const [voiceText, setVoiceText] = useState('');
  const [voiceName, setVoiceName] = useState('Kore');
  const [voiceStyle, setVoiceStyle] = useState('Clear, cinematic studio narrator');
  const [dualSpeaker, setDualSpeaker] = useState(false);
  const [secondText, setSecondText] = useState('');
  const [secondVoice, setSecondVoice] = useState('Puck');
  const [voiceFormat, setVoiceFormat] = useState<'wav' | 'mp3'>('wav');
  const [voiceJob, setVoiceJob] = useState<GenerationJob | null>(null);

  // Captions State
  const [captionFile, setCaptionFile] = useState<File | null>(null);
  const [captionJob, setCaptionJob] = useState<GenerationJob | null>(null);

  // Social Media Generator State
  const [socialTopic, setSocialTopic] = useState('');
  const [socialPlatform, setSocialPlatform] = useState('TikTok');
  const [socialRatio, setSocialRatio] = useState('9:16');
  const [socialTone, setSocialTone] = useState('High-Retention Editorial');
  const [socialPack, setSocialPack] = useState<SocialPackOutput | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.generateVoice({
        text: voiceText,
        voiceName,
        style: voiceStyle,
        dualSpeaker,
        secondSpeakerText: dualSpeaker ? secondText : undefined,
        secondVoiceName: dualSpeaker ? secondVoice : undefined,
        format: voiceFormat,
      });
      setVoiceJob(res.job);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCaptionsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captionFile) return;
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('media', captionFile);
      const res = await api.generateCaptions(fd);
      setCaptionJob(res.job);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caption extraction failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.generateSocialPack({
        topic: socialTopic,
        platform: socialPlatform,
        aspectRatio: socialRatio,
        tone: socialTone,
      });
      const parsed = JSON.parse(res.job.output_meta_json || '{}') as SocialPackOutput;
      setSocialPack(parsed);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Social content generation failed');
    } finally {
      setLoading(false);
    }
  }

  const captionMeta = captionJob?.output_meta_json
    ? (JSON.parse(captionJob.output_meta_json) as { transcript?: string; srt?: string })
    : {};

  return (
    <div className="space-y-6">
      {/* Segmented Tool Bar */}
      <div className="inline-flex p-1 rounded-lg bg-[#0E0A18] border border-violet-500/20">
        {[
          { id: 'voice', label: 'AI Voice & TTS' },
          { id: 'captions', label: 'Automatic Captions' },
          { id: 'social', label: 'Social Content Generator' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id as typeof tab);
              setError(null);
            }}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === item.id ? 'bg-violet-600 text-white' : 'text-violet-200/70 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
          {error}
        </div>
      )}

      {tab === 'voice' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleVoiceSubmit}
            className="lg:col-span-6 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">AI Voice & Text-to-Speech</h2>
              <label className="inline-flex items-center gap-2 text-xs text-violet-200/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dualSpeaker}
                  onChange={(e) => setDualSpeaker(e.target.checked)}
                  className="accent-violet-500"
                />
                <span>Dual-Speaker Podcast</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Primary Voice</label>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
                >
                  {VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Output Format</label>
                <select
                  value={voiceFormat}
                  onChange={(e) => setVoiceFormat(e.target.value as 'wav' | 'mp3')}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
                >
                  <option value="wav">WAV (24kHz Studio)</option>
                  <option value="mp3">MP3 (Compressed)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-violet-200/75 mb-1">Delivery Style</label>
              <input
                type="text"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value)}
                placeholder="Warm, articulate documentary narrator"
                className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-violet-200/75 mb-1">
                {dualSpeaker ? 'Speaker A Dialogue' : 'Script Text'}
              </label>
              <textarea
                rows={4}
                required
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="Enter narration, ad copy, or dialogue..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {dualSpeaker && (
              <div className="space-y-3 pt-2 border-t border-violet-500/15">
                <div>
                  <label className="block text-xs text-violet-200/75 mb-1">Speaker B Voice</label>
                  <select
                    value={secondVoice}
                    onChange={(e) => setSecondVoice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
                  >
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-violet-200/75 mb-1">Speaker B Dialogue</label>
                  <textarea
                    rows={3}
                    required
                    value={secondText}
                    onChange={(e) => setSecondText(e.target.value)}
                    placeholder="Co-host response..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Synthesizing Voice...' : 'Generate Voice Audio'}</span>
            </button>
          </form>

          <section className="lg:col-span-6 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Voice Output</h3>
              {voiceJob?.output_url ? (
                <div className="space-y-4">
                  <audio key={voiceJob.output_url} src={voiceJob.output_url} controls className="w-full" />
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        voiceJob.output_url!,
                        `aistudio_voice_${voiceJob.id.slice(0, 6)}.${voiceFormat}`,
                        voiceFormat,
                        voiceJob.id
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {voiceFormat.toUpperCase()}</span>
                  </button>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <Mic className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                  <p className="text-xs text-violet-200/55">
                    Generate natural single-speaker voiceovers or dual-speaker podcasts.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'captions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCaptionsSubmit}
            className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-white">Automatic Captions & Transcription</h2>
            <p className="text-xs text-violet-200/60">
              Upload audio (MP3, WAV, M4A) or MP4 video to generate a transcript and timed .SRT subtitles.
            </p>

            <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-500/30 bg-[#08050F] hover:border-violet-400 p-8 cursor-pointer">
              <Upload className="w-6 h-6 text-violet-400 mb-2" />
              <span className="text-xs text-violet-100">
                {captionFile ? captionFile.name : 'Choose audio or video file'}
              </span>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => setCaptionFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>

            <button
              type="submit"
              disabled={loading || !captionFile}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Transcribing Media...' : 'Generate Transcript & SRT (2 cr)'}</span>
            </button>
          </form>

          <section className="lg:col-span-7 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Transcript & SubRip (.SRT)</h3>
              {captionJob?.output_url && (
                <button
                  type="button"
                  onClick={() =>
                    triggerFileDownload(
                      captionJob.output_url!,
                      `captions_${captionJob.id.slice(0, 6)}.srt`,
                      'srt',
                      captionJob.id
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .SRT</span>
                </button>
              )}
            </div>

            {captionMeta.transcript ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-violet-300/70 mb-1">Full Transcript</div>
                  <div className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-xs text-violet-100 leading-relaxed max-h-40 overflow-y-auto">
                    {captionMeta.transcript}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-violet-300/70 mb-1">Timed Subtitles (.SRT)</div>
                  <pre className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-xs font-mono text-violet-200 max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {captionMeta.srt}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-14 text-center">
                <Subtitles className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                <p className="text-xs text-violet-200/55">
                  Upload any clip to extract speech and download ready-to-burn .SRT captions.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'social' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSocialSubmit}
            className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-white">Social Media Content Generator</h2>
            <p className="text-xs text-violet-200/60">
              Create platform-specific hooks, 60s scripts, captions, hashtags, and shot lists.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Target Platform</label>
                <select
                  value={socialPlatform}
                  onChange={(e) => {
                    const p = e.target.value;
                    setSocialPlatform(p);
                    if (p === 'YouTube Landscape') setSocialRatio('16:9');
                    else if (p === 'Instagram Square') setSocialRatio('1:1');
                    else if (p === 'Instagram Portrait') setSocialRatio('4:5');
                    else setSocialRatio('9:16');
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
                >
                  <option value="TikTok">TikTok (9:16)</option>
                  <option value="YouTube Shorts">YouTube Shorts (9:16)</option>
                  <option value="YouTube Landscape">YouTube Landscape (16:9)</option>
                  <option value="Instagram Reels">Instagram Reels (9:16)</option>
                  <option value="Instagram Square">Instagram Square (1:1)</option>
                  <option value="Instagram Portrait">Instagram Portrait (4:5)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-violet-200/75 mb-1">Tone</label>
                <input
                  type="text"
                  value={socialTone}
                  onChange={(e) => setSocialTone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-violet-200/75 mb-1">Campaign Topic</label>
              <textarea
                rows={4}
                required
                value={socialTopic}
                onChange={(e) => setSocialTopic(e.target.value)}
                placeholder="How independent creators can produce 60-second cinematic product launches using AI..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Generating Pack...' : 'Generate Campaign Pack (2 cr)'}</span>
            </button>
          </form>

          <section className="lg:col-span-7 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Campaign Package</h3>
              {socialPack?.videoPrompt && (
                <button
                  type="button"
                  onClick={() => onSendScriptToVideo(socialPack.script || socialPack.videoPrompt || '')}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5"
                >
                  <span>Send Script to Video Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {socialPack ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="text-violet-300/70 mb-1">Opening Hook</div>
                  <div className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-sm font-medium text-white">
                    {socialPack.hook}
                  </div>
                </div>
                <div>
                  <div className="text-violet-300/70 mb-1">Full Script</div>
                  <div className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-violet-100 whitespace-pre-wrap leading-relaxed">
                    {socialPack.script}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-violet-300/70 mb-1">Caption & Hashtags</div>
                    <div className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-violet-100 space-y-2">
                      <p>{socialPack.caption}</p>
                      <p className="text-violet-300 font-mono">
                        {(socialPack.hashtags || []).join(' ')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="text-violet-300/70 mb-1">Shot List</div>
                    <ul className="p-3 rounded-lg bg-[#08050F] border border-violet-500/15 text-violet-100 space-y-1.5 list-disc list-inside">
                      {(socialPack.shotList || []).map((shot, i) => (
                        <li key={i}>{shot}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-violet-200/55">
                Generate ready-to-shoot scripts, hooks, hashtags, and shot lists for any social aspect ratio.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
