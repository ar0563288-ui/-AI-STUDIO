import React, { useState } from 'react';
import { Download, Loader2, Music } from 'lucide-react';
import { api, triggerFileDownload } from '../lib/api';
import { GenerationJob } from '../types/studio';

interface MusicStudioViewProps {
  recentMusic: GenerationJob[];
  onCompleted: () => void;
}

const GENRES = [
  'Synthwave',
  'Cinematic Orchestral',
  'Lo-Fi Chill',
  'Hip-Hop / Trap',
  'Pop',
  'Ambient Electronic',
  'Indie Rock',
  'Neo-Soul / Jazz',
];

export function MusicStudioView({ recentMusic, onCompleted }: MusicStudioViewProps) {
  const [mode, setMode] = useState<'song' | 'instrumental' | 'background'>('song');
  const [genre, setGenre] = useState('Synthwave');
  const [prompt, setPrompt] = useState('');
  const [lyricsTopic, setLyricsTopic] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [fullLength, setFullLength] = useState(true);
  const [format, setFormat] = useState<'mp3' | 'wav'>('mp3');

  const [composingLyrics, setComposingLyrics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<GenerationJob | null>(recentMusic[0] ?? null);

  async function handleComposeLyrics() {
    if (!lyricsTopic.trim() && !prompt.trim()) return;
    setError(null);
    setComposingLyrics(true);
    try {
      const res = await api.composeLyrics({
        topic: lyricsTopic.trim() || prompt.trim(),
        genre,
        mood: 'Evocative and modern',
      });
      setLyrics(res.lyrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compose lyrics');
    } finally {
      setComposingLyrics(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGenerating(true);
    try {
      const res = await api.generateMusic({
        prompt,
        genre,
        mode,
        lyrics: mode === 'song' ? lyrics : undefined,
        fullLength,
        format,
      });
      setActiveTrack(res.job);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Music generation failed');
    } finally {
      setGenerating(false);
    }
  }

  let trackMeta: { mp3Url?: string; wavUrl?: string; lyrics?: string; genre?: string } = {};
  if (activeTrack?.output_meta_json) {
    try {
      trackMeta = JSON.parse(activeTrack.output_meta_json);
    } catch {
      trackMeta = {};
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-white">AI Music Studio</h2>
          <p className="text-xs text-violet-200/60 mt-0.5">
            Compose original songs, AI vocals, instrumentals, and background scores.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#08050F] border border-violet-500/15">
          {[
            { id: 'song', label: 'Full Song + Vocals' },
            { id: 'instrumental', label: 'Instrumental' },
            { id: 'background', label: 'BG Score' },
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

        <div>
          <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Genre</label>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                  genre === g
                    ? 'bg-violet-600/20 border-violet-500 text-white'
                    : 'bg-[#120D1E] border-violet-500/15 text-violet-200/70 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
            Arrangement & Sound Prompt
          </label>
          <textarea
            rows={3}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Pulsing analog arpeggios, warm sub bass, crisp snare, ethereal synth lead at 118 BPM..."
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
          />
        </div>

        {mode === 'song' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-violet-200/80">AI Lyrics & Vocals</label>
              <button
                type="button"
                onClick={handleComposeLyrics}
                disabled={composingLyrics || (!lyricsTopic.trim() && !prompt.trim())}
                className="text-xs font-medium text-violet-300 hover:text-white disabled:opacity-40"
              >
                {composingLyrics ? 'Composing lyrics...' : 'Generate Lyrics'}
              </button>
            </div>
            <input
              type="text"
              value={lyricsTopic}
              onChange={(e) => setLyricsTopic(e.target.value)}
              placeholder="Optional lyric theme (e.g., Midnight skyline drive)..."
              className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white placeholder:text-violet-300/35"
            />
            <textarea
              rows={4}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Write or auto-generate [Verse] and [Chorus] lyrics..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Length Tier</label>
            <select
              value={fullLength ? 'full' : 'clip'}
              onChange={(e) => setFullLength(e.target.value === 'full')}
              className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
            >
              <option value="full">Full Track (5 cr)</option>
              <option value="clip">30s Clip (3 cr)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Master Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'mp3' | 'wav')}
              className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white"
            >
              <option value="mp3">MP3 (192 kbps)</option>
              <option value="wav">WAV (Lossless PCM)</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2 transition-colors"
        >
          {generating && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{generating ? 'Synthesizing Audio...' : 'Generate Track'}</span>
        </button>
      </form>

      {/* Player & Export Column */}
      <section className="lg:col-span-7 space-y-5">
        <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">Master Audio Player</h3>
              {activeTrack && (
                <p className="text-xs text-violet-200/60 mt-0.5 truncate max-w-md">
                  {trackMeta.genre || 'Music'} · {activeTrack.prompt}
                </p>
              )}
            </div>

            {activeTrack?.output_url && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    triggerFileDownload(
                      trackMeta.mp3Url || activeTrack.output_url!,
                      `aistudio_track_${activeTrack.id.slice(0, 6)}.mp3`,
                      'mp3',
                      activeTrack.id
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>MP3</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerFileDownload(
                      trackMeta.wavUrl || activeTrack.output_url!,
                      `aistudio_track_${activeTrack.id.slice(0, 6)}.wav`,
                      'wav',
                      activeTrack.id
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#161026] hover:bg-[#1E1633] border border-violet-500/25 text-xs font-medium text-violet-100 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>WAV</span>
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#07050C] border border-violet-500/15 p-5">
            {generating ? (
              <div className="py-12 text-center">
                <Loader2 className="w-7 h-7 animate-spin text-violet-400 mx-auto mb-2" />
                <p className="text-xs text-violet-200/70">Composing audio stems and mastering...</p>
              </div>
            ) : activeTrack?.output_url ? (
              <div className="space-y-4">
                <audio key={activeTrack.output_url} src={activeTrack.output_url} controls className="w-full" />
                {trackMeta.lyrics && (
                  <div className="pt-4 border-t border-violet-500/15">
                    <div className="text-xs font-medium text-violet-300/80 mb-2">Lyrics & Notes</div>
                    <pre className="text-xs text-violet-100/80 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                      {trackMeta.lyrics}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center">
                <Music className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                <p className="text-xs text-violet-200/55">
                  Select a genre, compose lyrics or enter an arrangement prompt, and generate MP3 & WAV masters.
                </p>
              </div>
            )}
          </div>
        </div>

        {recentMusic.length > 0 && (
          <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Music Tracks</h3>
            <div className="divide-y divide-violet-500/10">
              {recentMusic.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTrack(item)}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:bg-violet-500/5 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-medium text-white truncate">{item.prompt}</div>
                    <div className="text-[11px] font-mono tabular-nums text-violet-300/60 mt-0.5">
                      {new Date(item.created_at).toLocaleDateString()} · {item.status}
                    </div>
                  </div>
                  <span className="text-xs text-violet-300 shrink-0">Play</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
