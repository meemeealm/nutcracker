import React, { useState, useRef, useEffect } from 'react';
import { Music, Check, ChevronDown, Disc3, Clock } from 'lucide-react';
import { TrackOption } from '../types';
import { TRACKS } from '../data/tracks';

interface TrackSelectorProps {
  selectedTrackId: string;
  onSelectTrack: (track: TrackOption) => void;
  className?: string;
}

export const TrackSelector: React.FC<TrackSelectorProps> = ({
  selectedTrackId,
  onSelectTrack,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedTrack = TRACKS.find((t) => t.id === selectedTrackId) || TRACKS[0];
  const selectedIndex = TRACKS.findIndex((t) => t.id === selectedTrackId);

  const formatTime = (seconds?: number): string => {
    if (!seconds || isNaN(seconds)) return '03:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Scroll active item into view when opening
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen]);

  const handleSelect = (track: TrackOption) => {
    onSelectTrack(track);
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      id="track-dropdown-container"
      className={`relative w-full max-w-xl mx-auto text-left ${className}`}
    >
      {/* Header label above dropdown */}
      <div className="flex items-center justify-between px-1 mb-2">
        <label
          htmlFor="track-dropdown-trigger"
          className="flex items-center gap-2 text-xs font-sans tracking-wider text-amber-300 font-medium uppercase cursor-pointer select-none"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Disc3 className="w-4 h-4 text-amber-400" />
          <span>Select Audio Track ({TRACKS.length} Songs)</span>
        </label>
        <span className="text-xs font-sans text-neutral-300 font-normal">
          {selectedIndex >= 0 ? `Song ${selectedIndex + 1} of ${TRACKS.length}` : ''}
        </span>
      </div>

      {/* Main Dropdown Trigger Button */}
      <button
        id="track-dropdown-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer backdrop-blur-xl flex items-center justify-between gap-3 shadow-xl ring-1 ring-white/10 ${
          isOpen
            ? 'bg-neutral-900 border-amber-300/80 ring-2 ring-amber-300/40 text-white'
            : 'bg-neutral-950/90 border-white/20 hover:border-amber-300/60 hover:bg-neutral-900 text-neutral-200'
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
              isOpen
                ? 'bg-amber-400/25 border-amber-300 text-amber-300'
                : 'bg-amber-400/15 border-amber-300/40 text-amber-300'
            }`}
          >
            <Music className="w-5 h-5 stroke-[2.2]" />
          </div>

          <div className="min-w-0 truncate">
            <div className="text-sm sm:text-base font-serif font-medium tracking-wide text-white truncate drop-shadow-sm">
              {selectedTrack.title}
            </div>
            <div className="text-xs font-sans text-neutral-300 tracking-wide truncate font-normal mt-0.5">
              {selectedTrack.artist} {selectedTrack.album ? `• ${selectedTrack.album}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs font-medium text-amber-300 bg-neutral-900/90 px-2.5 py-1 rounded-lg border border-white/15">
            <Clock className="w-3.5 h-3.5 text-amber-400/80" />
            <span>{formatTime(selectedTrack.duration)}</span>
          </div>

          <div
            className={`p-1 rounded-lg text-amber-300 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : 'text-neutral-400'
            }`}
          >
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </button>

      {/* Dropdown Options List */}
      {isOpen && (
        <div
          id="track-dropdown-menu"
          role="listbox"
          aria-label="Available Songs"
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-neutral-950/95 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-2 ring-1 ring-white/15 animate-in fade-in zoom-in-95 duration-150"
        >
          <div
            ref={listRef}
            className="max-h-64 sm:max-h-72 overflow-y-auto space-y-1 pr-1 custom-scrollbar"
          >
            {TRACKS.map((track, index) => {
              const isSelected = track.id === selectedTrackId;
              const trackNum = (index + 1).toString().padStart(2, '0');

              return (
                <button
                  key={track.id}
                  id={`track-option-${track.id}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isSelected}
                  type="button"
                  onClick={() => handleSelect(track)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-400/20 border-amber-300 text-white shadow-md'
                      : 'bg-neutral-900/60 hover:bg-neutral-800/90 border-transparent hover:border-white/10 text-neutral-200 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-mono tabular-nums font-medium shrink-0 w-6 text-center ${
                        isSelected ? 'text-amber-300' : 'text-neutral-400'
                      }`}
                    >
                      {trackNum}
                    </span>

                    <div className="truncate min-w-0">
                      <div
                        className={`text-sm font-serif tracking-wide truncate ${
                          isSelected ? 'text-white font-medium' : 'text-neutral-100 font-normal'
                        }`}
                      >
                        {track.title}
                      </div>
                      <div className="text-xs font-sans text-neutral-300 font-normal truncate mt-0.5">
                        {track.artist} {track.album ? `• ${track.album}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-neutral-300 font-normal bg-black/50 px-2 py-0.5 rounded border border-white/10">
                      {formatTime(track.duration)}
                    </span>
                    <div className="w-5 flex items-center justify-center">
                      {isSelected && (
                        <Check className="w-4 h-4 text-amber-300 stroke-[2.5]" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

