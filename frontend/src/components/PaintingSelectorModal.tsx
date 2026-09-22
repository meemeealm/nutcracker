import React from 'react';
import { X, Palette } from 'lucide-react';
import { PaintingOption } from '../types';
import { PaintingSelector } from './PaintingSelector';

interface PaintingSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPaintingId: string;
  onSelectPainting: (painting: PaintingOption) => void;
}

export const PaintingSelectorModal: React.FC<PaintingSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedPaintingId,
  onSelectPainting,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="painting-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="painting-modal-title"
    >
      <div
        id="painting-modal-dialog"
        className="relative max-w-4xl w-full bg-[#0d0d12]/95 border border-white/10 rounded-2xl p-6 sm:p-8 text-[#eceae5] shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          id="painting-modal-close-btn"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-amber-300 text-xs tracking-wider uppercase font-sans font-medium mb-2">
              <Palette className="w-4 h-4 text-amber-400" />
              <span>Canvas Masterworks</span>
            </div>
            <h2
              id="painting-modal-title"
              className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-wide"
            >
              Choose Canvas Painting
            </h2>
            <p className="text-sm text-neutral-200 font-sans mt-1.5 leading-relaxed">
              Select between High Contrast and Low Contrast paintings. The fluid dynamics and neural pigment flow adapt dynamically to your choice.
            </p>
          </div>

          <div className="border-t border-white/15 pt-5">
            <PaintingSelector
              selectedPaintingId={selectedPaintingId}
              onSelectPainting={(painting) => {
                onSelectPainting(painting);
                onClose();
              }}
              showTitle={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
