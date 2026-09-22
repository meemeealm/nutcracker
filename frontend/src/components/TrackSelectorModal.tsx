import React from 'react';
import { X, Music } from 'lucide-react';
import { TrackOption } from '../types';
import { TrackSelector } from './TrackSelector';

interface TrackSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackId: string;
  onSelectTrack: (track: TrackOption) => void;
}

export const TrackSelectorModal: React.FC<TrackSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTrackId,
  onSelectTrack,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="track-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-all duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
    >
      <div
        id="track-modal-dialog"
        className="relative max-w-xl w-full bg-neutral-950/95 border border-white/20 rounded-3xl p-6 sm:p-8 text-neutral-100 shadow-2xl overflow-y-auto max-h-[90vh] ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          id="track-modal-close-btn"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-amber-300 text-xs tracking-wider uppercase font-sans font-medium mb-2">
              <Music className="w-4 h-4 text-amber-400" />
              <span>Audio Exhibition</span>
            </div>
            <h2
              id="track-modal-title"
              className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-wide"
            >
              Choose Audio Track
            </h2>
            <p className="text-sm text-neutral-300 font-sans mt-1.5 leading-relaxed">
              Select a musical piece to synthesize with the neural fluid dynamics. Each song drives its own unique 31-dimensional harmonic envelope.
            </p>
          </div>

          <div className="border-t border-white/15 pt-4">
            <TrackSelector
              selectedTrackId={selectedTrackId}
              onSelectTrack={(track) => {
                onSelectTrack(track);
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
