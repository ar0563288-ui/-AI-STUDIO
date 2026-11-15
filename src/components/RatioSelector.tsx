import { SOCIAL_ASPECT_RATIOS } from '../types/studio';

interface RatioSelectorProps {
  selectedPresetId: string;
  customWidth: number;
  customHeight: number;
  onSelect: (presetId: string, ratio: string) => void;
  onCustomChange: (w: number, h: number) => void;
}

export function RatioSelector({
  selectedPresetId,
  customWidth,
  customHeight,
  onSelect,
  onCustomChange,
}: RatioSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-violet-200/80">Social Media & Frame Ratio</label>
        <span className="text-xs font-mono tabular-nums text-violet-300/70">
          {selectedPresetId === 'custom'
            ? `${customWidth}:${customHeight}`
            : SOCIAL_ASPECT_RATIOS.find((r) => r.id === selectedPresetId)?.ratio ?? '16:9'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SOCIAL_ASPECT_RATIOS.map((preset) => {
          const active = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id, preset.ratio)}
              className={`px-3 py-2 text-left rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                active
                  ? 'bg-violet-600/20 border-violet-500 text-white'
                  : 'bg-[#120D1E] border-violet-500/15 text-violet-200/70 hover:border-violet-400/40 hover:text-white'
              }`}
            >
              <div className="text-xs font-medium truncate">{preset.label}</div>
              <div className="text-[11px] font-mono tabular-nums text-violet-300/60 mt-0.5">
                {preset.ratio === 'custom' ? 'Manual' : `${preset.ratio} · ${preset.platform}`}
              </div>
            </button>
          );
        })}
      </div>

      {selectedPresetId === 'custom' && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] text-violet-300/70 mb-1">Width Ratio</label>
            <input
              type="number"
              min={1}
              max={64}
              value={customWidth}
              onChange={(e) => onCustomChange(Math.max(1, Number(e.target.value) || 1), customHeight)}
              className="w-full px-3 py-2 rounded-lg bg-[#0D0916] border border-violet-500/20 text-sm font-mono tabular-nums text-white focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-violet-300/70 mb-1">Height Ratio</label>
            <input
              type="number"
              min={1}
              max={64}
              value={customHeight}
              onChange={(e) => onCustomChange(customWidth, Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-lg bg-[#0D0916] border border-violet-500/20 text-sm font-mono tabular-nums text-white focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
