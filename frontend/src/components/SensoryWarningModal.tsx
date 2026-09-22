import React, { useState } from 'react';
import { AlertTriangle, Play, X, ShieldAlert, Sparkles, EyeOff, Sun, Eye, Check } from 'lucide-react';
import { PaintingOption } from '../types';
import { PAINTINGS } from '../data/paintings';

interface SensoryWarningModalProps {
  isOpen: boolean;
  onConfirmPlay: (options: { reducedMotion: boolean; rememberSession: boolean }) => void;
  onCancel: () => void;
  initialReducedMotion?: boolean;
  selectedPaintingId?: string;
  onSelectPainting?: (painting: PaintingOption) => void;
}

export const SensoryWarningModal: React.FC<SensoryWarningModalProps> = ({
  isOpen,
  onConfirmPlay,
  onCancel,
  initialReducedMotion = false,
  selectedPaintingId = 'nutcracker',
  onSelectPainting,
}) => {
  const [reducedMotion, setReducedMotion] = useState<boolean>(initialReducedMotion);
  const [rememberChoice, setRememberChoice] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirmPlay({
      reducedMotion,
      rememberSession: rememberChoice,
    });
  };

  const highContrastPaintings = PAINTINGS.filter((p) => p.contrast === 'high');
  const lowContrastPaintings = PAINTINGS.filter((p) => p.contrast === 'low');

  return (
    <div
      id="sensory-warning-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-opacity duration-300"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sensory-warning-title"
    >
      <div
        id="sensory-warning-dialog"
        className="relative max-w-2xl w-full bg-[#0d0d12]/95 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-[#eceae5] shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl" />

        {/* Close Button */}
        <button
          id="sensory-warning-close-btn"
          onClick={onCancel}
          className="absolute top-5 right-5 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close warning"
          title="Cancel and close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative space-y-6">
          {/* Header Badge & Title */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-sans tracking-wider uppercase font-medium mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Sensory & Visual Advisory</span>
            </div>

            <h2
              id="sensory-warning-title"
              className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-wide leading-tight"
            >
              Visual Sensitivity Advisory & Canvas Choice
            </h2>

            <p className="text-xs font-sans tracking-wide text-amber-300 font-medium mt-1">
              Select painting contrast options and motion comfort before playback
            </p>
          </div>

          {/* Warning Body */}
          <div className="text-sm text-neutral-200 font-normal leading-relaxed space-y-3.5 border-t border-white/15 pt-4">
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-400/40 flex gap-3.5 text-amber-100 text-xs sm:text-sm shadow-md">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-amber-200 block text-sm">Dizziness & Eye Reactivity Caution</span>
                <p className="text-neutral-200 leading-normal">
                  Continuous audio-driven fluid simulations feature <strong>rapidly moving shapes, swirling distortions, high-contrast pulses, and shifting bright pigments</strong>.
                  For individuals sensitive to rapid visual motion or bright contrast, we provide <strong>Low Contrast paintings (Claude Monet & Vincent van Gogh)</strong> designed for gentler viewing.
                </p>
              </div>
            </div>
          </div>

          {/* Painting Contrast Options */}
          {onSelectPainting && (
            <div className="space-y-3.5 border-t border-white/15 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-sans tracking-wider text-amber-300 font-medium flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Choose Canvas Painting (4 Options)</span>
                </span>
                <span className="text-xs font-sans text-neutral-300 font-normal">
                  Select before playing
                </span>
              </div>

              {/* Low Contrast Options Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-sans text-teal-300 font-medium uppercase tracking-wider">
                  <Eye className="w-4 h-4 text-teal-400" />
                  <span>Low Contrast Paintings (Recommended for Eye Comfort)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {lowContrastPaintings.map((p) => {
                    const isSelected = p.id === selectedPaintingId;
                    return (
                      <button
                        key={p.id}
                        id={`warning-select-${p.id}`}
                        onClick={() => onSelectPainting(p)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-950/80 border-teal-300 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] ring-1 ring-teal-300'
                            : 'bg-neutral-900/90 border-white/20 hover:border-teal-400/60 text-neutral-200 hover:text-white'
                        }`}
                      >
                        <img
                          src={p.texturePath}
                          alt={p.title}
                          className="w-12 h-12 rounded-lg object-cover border border-white/20 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-serif font-semibold truncate text-white">
                              {p.title}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-teal-300 shrink-0 ml-1 stroke-[2.5]" />}
                          </div>
                          <span className="text-xs font-sans text-teal-200 font-normal block">
                            {p.artist}
                          </span>
                          <span className="text-[11px] text-neutral-300 line-clamp-1">
                            {p.description}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* High Contrast Options Section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-sans text-amber-300 font-medium uppercase tracking-wider">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>High Contrast Paintings (Bold & Vivid Tones)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {highContrastPaintings.map((p) => {
                    const isSelected = p.id === selectedPaintingId;
                    return (
                      <button
                        key={p.id}
                        id={`warning-select-${p.id}`}
                        onClick={() => onSelectPainting(p)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/80 border-amber-300 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] ring-1 ring-amber-300'
                            : 'bg-neutral-900/90 border-white/20 hover:border-amber-400/60 text-neutral-200 hover:text-white'
                        }`}
                      >
                        <img
                          src={p.texturePath}
                          alt={p.title}
                          className="w-12 h-12 rounded-lg object-cover border border-white/20 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-serif font-semibold truncate text-white">
                              {p.title}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-amber-300 shrink-0 ml-1 stroke-[2.5]" />}
                          </div>
                          <span className="text-xs font-sans text-amber-200 font-normal block">
                            {p.artist}
                          </span>
                          <span className="text-[11px] text-neutral-300 line-clamp-1">
                            {p.description}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Accessibility Option: Reduced Motion Toggle */}
          <div className="bg-neutral-900/90 border border-white/20 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-sans uppercase tracking-wider text-amber-300 font-medium">
                  <EyeOff className="w-4 h-4 text-amber-300" />
                  <span>Reduced Motion / Gentle Mode</span>
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed font-sans">
                  Softens fluid displacement, reduces warp speed, and dims aggressive pigment spikes for a gentle viewing experience.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  id="toggle-reduced-motion"
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Remember Choice */}
            <div className="flex items-center gap-2 pt-2.5 border-t border-white/10">
              <input
                id="remember-warning-choice"
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="rounded border-white/30 bg-black/60 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4"
              />
              <label
                htmlFor="remember-warning-choice"
                className="text-xs font-sans text-neutral-300 hover:text-white cursor-pointer select-none font-normal"
              >
                Remember my choice for this session (do not warn again upon unpausing)
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              id="sensory-warning-cancel-btn"
              onClick={onCancel}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-white/15 bg-transparent hover:bg-white/10 text-white/70 hover:text-white text-xs font-sans tracking-wide transition-all font-medium"
            >
              Cancel & Stay Paused
            </button>

            <button
              id="sensory-warning-confirm-btn"
              onClick={handleConfirm}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-medium text-xs font-sans tracking-wide transition-all shadow-lg hover:shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>{reducedMotion ? 'Play in Gentle Mode' : 'I Understand & Play'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
