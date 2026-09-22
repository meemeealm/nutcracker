import React, { useState } from 'react';
import { Palette, Check, Sun, Eye } from 'lucide-react';
import { PaintingOption, ContrastType } from '../types';
import { PAINTINGS } from '../data/paintings';

interface PaintingSelectorProps {
  selectedPaintingId: string;
  onSelectPainting: (painting: PaintingOption) => void;
  className?: string;
  showTitle?: boolean;
}

export const PaintingSelector: React.FC<PaintingSelectorProps> = ({
  selectedPaintingId,
  onSelectPainting,
  className = '',
  showTitle = true,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | ContrastType>('all');

  const filteredPaintings = PAINTINGS.filter((p) => {
    if (activeFilter === 'all') return true;
    return p.contrast === activeFilter;
  });

  return (
    <div id="painting-selector-container" className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* Header with Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        {showTitle && (
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-amber-300" />
            <span className="text-xs uppercase tracking-wider font-sans text-amber-200 font-medium drop-shadow-sm">
              Select Canvas Painting
            </span>
          </div>
        )}

        {/* Filter Pills with Solid Contrast */}
        <div
          id="painting-contrast-filter-group"
          className="inline-flex p-1 rounded-full bg-neutral-900/95 border border-white/20 backdrop-blur-xl text-xs font-sans shadow-lg"
        >
          <button
            id="filter-all-paintings-btn"
            onClick={(e) => {
              e.stopPropagation();
              setActiveFilter('all');
            }}
            className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-white text-black font-semibold shadow-md'
                : 'text-neutral-300 hover:text-white font-normal'
            }`}
          >
            All Paintings (4)
          </button>

          <button
            id="filter-high-contrast-btn"
            onClick={(e) => {
              e.stopPropagation();
              setActiveFilter('high');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
              activeFilter === 'high'
                ? 'bg-amber-400 text-black font-semibold shadow-md'
                : 'text-amber-200 hover:text-amber-100 font-normal'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>High Contrast (2)</span>
          </button>

          <button
            id="filter-low-contrast-btn"
            onClick={(e) => {
              e.stopPropagation();
              setActiveFilter('low');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
              activeFilter === 'low'
                ? 'bg-teal-400 text-black font-semibold shadow-md'
                : 'text-teal-200 hover:text-teal-100 font-normal'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Low Contrast • Gentle (2)</span>
          </button>
        </div>
      </div>

      {/* Paintings Grid */}
      <div
        id="paintings-cards-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-left"
      >
        {filteredPaintings.map((painting) => {
          const isSelected = painting.id === selectedPaintingId;
          const isLowContrast = painting.contrast === 'low';

          return (
            <button
              key={painting.id}
              id={`painting-card-${painting.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPainting(painting);
              }}
              className={`group relative flex flex-col p-3 rounded-2xl border text-left transition-all duration-300 overflow-hidden cursor-pointer shadow-xl backdrop-blur-xl ${
                isSelected
                  ? isLowContrast
                    ? 'bg-teal-950/85 border-teal-300 shadow-[0_0_30px_rgba(20,184,166,0.35)] ring-2 ring-teal-300'
                    : 'bg-amber-950/85 border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.35)] ring-2 ring-amber-300'
                  : 'bg-neutral-900/90 border-white/20 hover:border-white/40 hover:bg-neutral-850'
              }`}
            >
              {/* Thumbnail with overlay gradient */}
              <div className="relative w-full h-28 rounded-xl overflow-hidden mb-3 bg-black border border-white/15">
                <img
                  src={painting.texturePath}
                  alt={painting.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Gradient vignette for thumbnail label clarity */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                {/* Selected Checkmark Badge */}
                {isSelected && (
                  <div
                    id={`painting-selected-badge-${painting.id}`}
                    className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/40 ${
                      isLowContrast ? 'bg-teal-400 text-black' : 'bg-amber-400 text-black'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                )}

                {/* Contrast Pill on thumbnail */}
                <div className="absolute bottom-2 left-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans tracking-wide uppercase font-medium border shadow-md ${
                      isLowContrast
                        ? 'bg-teal-900/95 border-teal-300 text-teal-100'
                        : 'bg-amber-900/95 border-amber-300 text-amber-100'
                    }`}
                  >
                    {isLowContrast ? 'Low Contrast' : 'High Contrast'}
                  </span>
                </div>
              </div>

              {/* Text metadata */}
              <div className="flex-1 flex flex-col justify-between space-y-1.5">
                <div>
                  <h3
                    className="text-sm font-serif font-medium leading-snug line-clamp-1 text-white drop-shadow-sm"
                    title={painting.title}
                  >
                    {painting.title}
                  </h3>

                  <p className="text-xs font-sans text-neutral-300 tracking-wide font-normal mt-0.5">
                    {painting.artist} {painting.year ? `(${painting.year})` : ''}
                  </p>
                </div>

                <p className="text-xs text-neutral-300 font-sans font-normal leading-relaxed line-clamp-2 pt-1.5 border-t border-white/15">
                  {painting.description}
                </p>

                {/* Color Palette Indicators */}
                <div className="flex items-center gap-1.5 pt-1.5">
                  {painting.palette.map((c, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded-full border border-black/60 shadow-sm"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  <span className="text-[10px] font-sans text-neutral-300 font-medium ml-auto uppercase tracking-wide">
                    {isLowContrast ? 'Soft Tone' : 'Bold Tone'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
