import React from 'react';
import { X, Info, Sliders, Cpu, AlertTriangle, EyeOff, Check, Palette, Sun, Eye, Droplets, Layers } from 'lucide-react';
import { VisualParameters, PaintingOption, TrackOption } from '../types';
import { PAINTINGS } from '../data/paintings';

interface ArtworkDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  visualParams: VisualParameters | null;
  reducedMotion?: boolean;
  onToggleReducedMotion?: (enabled: boolean) => void;
  dissolveMode?: boolean;
  onToggleDissolveMode?: (mode?: boolean) => void;
  selectedPainting?: PaintingOption;
  onSelectPainting?: (painting: PaintingOption) => void;
  selectedTrack?: TrackOption;
}

export const ArtworkDetails: React.FC<ArtworkDetailsProps> = ({
  isOpen,
  onClose,
  visualParams,
  reducedMotion = false,
  onToggleReducedMotion,
  dissolveMode = true,
  onToggleDissolveMode,
  selectedPainting,
  onSelectPainting,
  selectedTrack,
}) => {
  if (!isOpen) return null;

  const paramLabels: { key: keyof VisualParameters; label: string; desc: string }[] = [
    { key: 'flow_strength', label: 'Flow Strength', desc: 'Driven by root frequency envelope & low-end rhythm.' },
    { key: 'turbulence', label: 'Turbulence', desc: 'Modulated by high-frequency spectral centroid & dissonance.' },
    { key: 'pigment_spread', label: 'Pigment Spread', desc: 'Diffusion rate reflecting harmonic bandwidth & decay.' },
    { key: 'displacement', label: 'Displacement', desc: 'Surface distortion sparked by transient drum onsets.' },
    { key: 'warp', label: 'Spatial Warp', desc: 'Complex domain foldings mapped from vocal MFCCs.' },
    { key: 'color_shift', label: 'Color Shift', desc: 'Chromatic palette evolution tracking chord chroma.' },
    { key: 'detail', label: 'Impasto Detail', desc: 'Tactile ridge micro-sheen from high-order harmonics.' },
    { key: 'activity', label: 'Activity', desc: 'Overall rhythmic velocity and kinetic momentum.' },
  ];

  return (
    <div
      id="artwork-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-all duration-300"
      onClick={onClose}
    >
      <div
        id="artwork-modal-content"
        className="relative max-w-xl w-full bg-neutral-950/95 border border-white/20 rounded-3xl p-6 sm:p-8 text-neutral-100 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-y-auto max-h-[90vh] ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          id="artwork-modal-close-btn"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 text-amber-300 text-xs tracking-wider uppercase font-sans font-medium mb-2">
              <Info className="w-4 h-4 text-amber-400" />
              <span>Exhibition Catalogue</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-wide">
              {selectedPainting ? selectedPainting.title : 'Nutcracker — Fluid Canvas'}
            </h2>
            <p className="text-sm text-neutral-200 font-sans mt-1.5 leading-relaxed">
              {selectedPainting ? `${selectedPainting.artist} • ` : ''}
              {selectedTrack ? `${selectedTrack.title} • ${selectedTrack.artist}` : 'Beyond Love • Beach House'}
              {selectedTrack?.album ? <span> &bull; <em>{selectedTrack.album}</em></span> : ''}
            </p>
          </div>

          {/* Active Canvas Painting Section & Switcher */}
          {onSelectPainting && (
            <div className="bg-neutral-900/90 border border-white/20 rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-amber-300 font-sans font-medium flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Selected Canvas Painting (4 Options)</span>
                </span>
                {selectedPainting && (
                  <span
                    className={`text-xs font-sans tracking-wide px-2.5 py-0.5 rounded-full border font-medium ${
                      selectedPainting.contrast === 'low'
                        ? 'bg-teal-900/95 border-teal-300 text-teal-100'
                        : 'bg-amber-900/95 border-amber-300 text-amber-100'
                    }`}
                  >
                    {selectedPainting.contrast === 'low' ? 'Low Contrast • Gentle' : 'High Contrast'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PAINTINGS.map((p) => {
                  const isCurrent = selectedPainting?.id === p.id;
                  const isLow = p.contrast === 'low';
                  return (
                    <button
                      key={p.id}
                      id={`catalogue-switch-${p.id}`}
                      onClick={() => onSelectPainting(p)}
                      className={`flex flex-col text-left p-2 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? isLow
                            ? 'bg-teal-950/90 border-teal-300 text-white ring-2 ring-teal-400 shadow-md'
                            : 'bg-amber-950/90 border-amber-300 text-white ring-2 ring-amber-400 shadow-md'
                          : 'bg-neutral-800/80 border-white/15 hover:border-white/40 text-neutral-200 hover:text-white'
                      }`}
                    >
                      <img
                        src={p.texturePath}
                        alt={p.title}
                        className="w-full h-14 rounded-lg object-cover mb-1.5 border border-white/10"
                      />
                      <span className="text-xs font-serif font-medium truncate text-white block">
                        {p.title}
                      </span>
                      <span className="text-xs font-sans text-neutral-300 truncate block mt-0.5">
                        {p.artist}
                      </span>
                      <span
                        className={`text-[10px] font-sans uppercase mt-1 inline-block px-1.5 py-0.5 rounded font-medium ${
                          isLow ? 'text-teal-200 bg-teal-900/80 border border-teal-500/40' : 'text-amber-200 bg-amber-900/80 border border-amber-500/40'
                        }`}
                      >
                        {isLow ? 'Low Contrast' : 'High Contrast'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-sm text-neutral-200 font-sans leading-relaxed space-y-3 border-t border-white/15 pt-4">
            <p>
              Fluid Canvas treats musical structure not as a waveform visualizer, but as an evolving kinetic life force
              acting on physical oil pigments. As the audio progresses, precomputed multi-band audio features are fed
              through a custom neural network, translating acoustic timbres into 8 continuous fluid-mechanical controls.
            </p>
          </div>

          {/* Pipeline flow */}
          <div className="bg-neutral-900/90 border border-white/20 rounded-2xl p-4 space-y-2.5 shadow-lg">
            <div className="text-xs uppercase tracking-wider text-amber-300 font-sans font-medium flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-400" />
              <span>Neural Pipeline Translation</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs py-1">
              <div className="bg-neutral-800/90 border border-white/10 rounded-xl p-2.5">
                <span className="text-amber-300 block font-sans font-semibold text-sm">31 Features</span>
                <span className="text-neutral-300 text-[11px] font-sans font-normal">Audio Extraction</span>
              </div>
              <div className="bg-neutral-800/90 border border-white/10 rounded-xl p-2.5">
                <span className="text-amber-300 block font-sans font-semibold text-sm">TensorFlow.js</span>
                <span className="text-neutral-300 text-[11px] font-sans font-normal">Graph Inference</span>
              </div>
              <div className="bg-neutral-800/90 border border-white/10 rounded-xl p-2.5">
                <span className="text-amber-300 block font-sans font-semibold text-sm">8 Controls</span>
                <span className="text-neutral-300 text-[11px] font-sans font-normal">Fluid Parameters</span>
              </div>
              <div className="bg-neutral-800/90 border border-white/10 rounded-xl p-2.5">
                <span className="text-amber-300 block font-sans font-semibold text-sm">WebGL Shader</span>
                <span className="text-neutral-300 text-[11px] font-sans font-normal">Domain Warping</span>
              </div>
            </div>
          </div>

          {/* Canvas Dynamics Mode (Dissolve vs No Dissolve) */}
          <div className="bg-neutral-900/90 border border-white/20 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-amber-300 font-sans font-medium flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Simulation Dynamics Mode</span>
              </div>
              <span className="text-xs font-sans text-neutral-300 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
                Hotkey: <kbd className="text-amber-300 font-semibold font-mono">D</kbd>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                id="catalogue-select-dissolve-mode-btn"
                type="button"
                onClick={() => onToggleDissolveMode && onToggleDissolveMode(true)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  dissolveMode
                    ? 'bg-amber-950/80 border-amber-400 text-white ring-2 ring-amber-400/50 shadow-md'
                    : 'bg-neutral-800/80 border-white/15 hover:border-white/30 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Droplets className={`w-4 h-4 ${dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
                  <span className="font-sans text-sm font-medium text-white">Dissolve Mode</span>
                  {dissolveMode && (
                    <span className="ml-auto text-[10px] font-sans uppercase bg-amber-400 text-black px-1.5 py-0.5 rounded font-bold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                  Living Navier-Stokes progressive advection, paint melting, 5-tap Laplacian bleeding diffusion, and chromatic mixing.
                </p>
              </button>

              <button
                id="catalogue-select-nodissolve-mode-btn"
                type="button"
                onClick={() => onToggleDissolveMode && onToggleDissolveMode(false)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  !dissolveMode
                    ? 'bg-amber-950/80 border-amber-400 text-white ring-2 ring-amber-400/50 shadow-md'
                    : 'bg-neutral-800/80 border-white/15 hover:border-white/30 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers className={`w-4 h-4 ${!dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
                  <span className="font-sans text-sm font-medium text-white">No Dissolve Mode</span>
                  {!dissolveMode && (
                    <span className="ml-auto text-[10px] font-sans uppercase bg-amber-400 text-black px-1.5 py-0.5 rounded font-bold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                  Preserves pristine artwork brushstrokes and high-detail contours with checkpoint timeline linear interpolation, featuring subtle smooth zoom in-out and an airy dreamy feel during music playback.
                </p>
              </button>
            </div>
          </div>

          {/* Active Live Visual Parameters */}
          {visualParams && (
            <div className="space-y-3 border-t border-white/15 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-amber-300 font-sans font-medium flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Real-Time Parameter State</span>
                </span>
                <span className="text-xs font-sans text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs font-sans">
                {paramLabels.map(({ key, label }) => {
                  const val = visualParams[key] ?? 0;
                  return (
                    <div key={key} className="bg-neutral-900/90 border border-white/15 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                      <div className="flex justify-between items-center text-neutral-200 mb-1.5">
                        <span className="truncate pr-1 font-normal">{label}</span>
                        <span className="text-amber-300 font-mono tabular-nums font-semibold">{(val * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, val * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sensory Advisory & Motion Accessibility */}
          <div className="bg-amber-950/30 border border-amber-400/40 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-amber-300 font-sans font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Sensory & Visual Motion Advisory</span>
              </div>
              {reducedMotion && (
                <span className="text-xs font-sans uppercase tracking-wider text-amber-200 bg-amber-900/80 border border-amber-400/50 px-2.5 py-0.5 rounded-full font-medium">
                  Gentle Mode Active
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-200 leading-relaxed font-sans">
              Living fluid simulation involves rapid pigment displacement, swirling warps, and high-contrast luminosity shifts driven by audio frequencies. If you experience dizziness, visual discomfort, or difficulty with fast-moving bright shapes, activate Gentle Mode to soften shader displacement and kinetic turbulence.
            </p>
            {onToggleReducedMotion && (
              <div className="pt-2.5 border-t border-amber-500/20 flex items-center justify-between">
                <span className="text-xs text-neutral-100 font-sans font-medium flex items-center gap-1.5">
                  <EyeOff className="w-4 h-4 text-amber-300" />
                  Gentle / Reduced Motion Mode
                </span>
                <button
                  id="catalogue-toggle-gentle-mode-btn"
                  onClick={() => onToggleReducedMotion(!reducedMotion)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-sans tracking-wide transition-all border cursor-pointer ${
                    reducedMotion
                      ? 'bg-amber-400 text-black border-amber-300 font-semibold shadow-md'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-white border-white/20 font-medium'
                  }`}
                >
                  {reducedMotion ? 'Enabled' : 'Enable Gentle Mode'}
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="artwork-modal-dismiss-btn"
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-sans tracking-wide rounded-full bg-white text-black font-medium hover:bg-neutral-200 transition-all shadow-lg cursor-pointer"
            >
              Return to Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
