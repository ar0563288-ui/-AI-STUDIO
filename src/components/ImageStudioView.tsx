import React, { useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { api, triggerFileDownload } from '../lib/api';
import { GenerationJob } from '../types/studio';
import { RatioSelector } from './RatioSelector';

interface ImageStudioViewProps {
  recentImages: GenerationJob[];
  onCompleted: () => void;
}

const IMAGE_STYLES = [
  { id: 'none', label: 'Natural' },
  { id: 'Photorealistic 8K Studio', label: 'Photorealistic' },
  { id: 'Cinematic Anamorphic Film', label: 'Cinematic' },
  { id: 'Futuristic Editorial 3D Render', label: '3D Render' },
  { id: 'Minimalist Product Photography', label: 'Product Studio' },
  { id: 'Japanese Anime Key Visual', label: 'Anime' },
  { id: 'High-Contrast Monochrome Editorial', label: 'Noir' },
];

export function ImageStudioView({ recentImages, onCompleted }: ImageStudioViewProps) {
  const [mode, setMode] = useState<'generate' | 'edit' | 'bg_remove'>('generate');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('Photorealistic 8K Studio');
  const [ratioPresetId, setRatioPresetId] = useState('ig_square');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [customWidth, setCustomWidth] = useState(1);
  const [customHeight, setCustomHeight] = useState(1);
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [highQuality, setHighQuality] = useState(false);

  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [refBase64, setRefBase64] = useState<string | undefined>(undefined);
  const [refMime, setRefMime] = useState<string | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<GenerationJob | null>(recentImages[0] ?? null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setRefPreview(dataUrl);
      setRefBase64(dataUrl.split(',')[1]);
      setRefMime(file.type || 'image/png');
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const finalRatio = ratioPresetId === 'custom' ? `${customWidth}:${customHeight}` : aspectRatio;
      const res = await api.generateImage({
        prompt,
        style,
        aspectRatio: finalRatio,
        resolution,
        highQuality,
        mode,
        referenceImageBase64: refBase64,
        referenceMimeType: refMime,
      });
      setActiveResult(res.job);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Controls Column */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-white">AI Image Studio</h2>
          <p className="text-xs text-violet-200/60 mt-0.5">
            Generate artwork, edit uploaded photos, or isolate subjects cleanly.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#08050F] border border-violet-500/15">
          {[
            { id: 'generate', label: 'Text-to-Image' },
            { id: 'edit', label: 'Image Edit' },
            { id: 'bg_remove', label: 'BG Remover' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id as typeof mode)}
              className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === tab.id ? 'bg-violet-600 text-white' : 'text-violet-200/70 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(mode === 'edit' || mode === 'bg_remove') && (
          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
              Source Image
            </label>
            <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-500/30 bg-[#08050F] hover:border-violet-400 p-4 cursor-pointer transition-colors">
              {refPreview ? (
                <img
                  src={refPreview}
                  alt="Uploaded reference preview"
                  referrerPolicy="no-referrer"
                  className="max-h-36 rounded-lg object-contain"
                />
              ) : (
                <div className="text-center">
                  <Upload className="w-5 h-5 text-violet-400 mx-auto mb-1.5" />
                  <span className="text-xs text-violet-200/70">Upload PNG or JPEG image</span>
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
        )}

        {mode !== 'bg_remove' && (
          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">
              {mode === 'edit' ? 'Editing Instruction' : 'Visual Prompt'}
            </label>
            <textarea
              rows={4}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === 'edit'
                  ? 'Replace the studio backdrop with dramatic obsidian architectural lighting...'
                  : 'Minimalist glass synthesizer on brushed dark titanium desk, soft violet rim light...'
              }
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
            />
          </div>
        )}

        {mode === 'generate' && (
          <div>
            <label className="block text-xs font-medium text-violet-200/80 mb-1.5">Style Preset</label>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStyle(st.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    style === st.id
                      ? 'bg-violet-600/20 border-violet-500 text-white'
                      : 'bg-[#120D1E] border-violet-500/15 text-violet-200/70 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <RatioSelector
          selectedPresetId={ratioPresetId}
          customWidth={customWidth}
          customHeight={customHeight}
          onSelect={(id, ratio) => {
            setRatioPresetId(id);
            setAspectRatio(ratio);
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
              onChange={(e) => setResolution(e.target.value as '1K' | '2K' | '4K')}
              className="w-full px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="1K">1K Standard (2 cr)</option>
              <option value="2K">2K High-Res (2 cr)</option>
              <option value="4K">4K Ultra (4 cr)</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 cursor-pointer">
              <span className="text-xs text-violet-200/80">Pro Detail</span>
              <input
                type="checkbox"
                checked={highQuality}
                onChange={(e) => setHighQuality(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium text-white inline-flex items-center justify-center gap-2 transition-colors"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>
            {loading
              ? 'Processing Image...'
              : mode === 'bg_remove'
                ? 'Remove Background'
                : mode === 'edit'
                  ? 'Apply Image Edit'
                  : 'Generate Image'}
          </span>
        </button>
      </form>

      {/* Output & Gallery Column */}
      <section className="lg:col-span-7 space-y-5">
        <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Canvas Preview</h3>
              {activeResult && (
                <p className="text-xs text-violet-200/55 mt-0.5 truncate max-w-md">
                  {activeResult.prompt}
                </p>
              )}
            </div>
            {activeResult?.output_url && (
              <button
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    activeResult.output_url!,
                    `aistudio_image_${activeResult.id.slice(0, 6)}.png`,
                    'png',
                    activeResult.id
                  )
                }
                className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Image</span>
              </button>
            )}
          </div>

          <div className="rounded-xl bg-[#07050C] border border-violet-500/15 min-h-[360px] flex items-center justify-center overflow-hidden p-4">
            {loading ? (
              <div className="text-center">
                <Loader2 className="w-7 h-7 animate-spin text-violet-400 mx-auto mb-2" />
                <p className="text-xs text-violet-200/70">Rendering artwork...</p>
              </div>
            ) : activeResult?.output_url ? (
              <img
                src={activeResult.output_url}
                alt={activeResult.prompt}
                referrerPolicy="no-referrer"
                className="max-h-[480px] w-auto rounded-lg object-contain"
              />
            ) : (
              <div className="text-center max-w-xs">
                <ImageIcon className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                <p className="text-xs text-violet-200/55">
                  Configure your prompt, style, and social ratio on the left to generate or edit an image.
                </p>
              </div>
            )}
          </div>
        </div>

        {recentImages.length > 0 && (
          <div className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Image Generations</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentImages.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveResult(item)}
                  className={`group rounded-lg overflow-hidden border text-left transition-colors ${
                    activeResult?.id === item.id
                      ? 'border-violet-500'
                      : 'border-violet-500/15 hover:border-violet-400/50'
                  }`}
                >
                  <div className="aspect-square bg-[#07050C] flex items-center justify-center overflow-hidden">
                    {item.output_url ? (
                      <img
                        src={item.output_url}
                        alt={item.prompt}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-violet-400/30" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
