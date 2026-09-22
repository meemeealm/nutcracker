import { PaintingOption } from '../types';

export const PAINTINGS: PaintingOption[] = [
  // High Contrast Paintings
  {
    id: 'nutcracker',
    title: 'The Nutcracker',
    artist: 'Baroque Chiaroscuro',
    year: 'Classical',
    contrast: 'high',
    texturePath: '/textures/default.webp',
    description: 'Dramatic chiaroscuro oil canvas with velvety shadows, fiery carmine pigments, and piercing golden highlights.',
    palette: ['#170c09', '#7f1d1d', '#b45309', '#fef3c7'],
    recommendedFor: 'Bold, dramatic visual immersion with vivid contrast',
  },
  {
    id: 'hokusai-great-wave',
    title: 'The Great Wave off Kanagawa',
    artist: 'Katsushika Hokusai',
    year: '1831',
    contrast: 'high',
    texturePath: '/textures/hokusai_wave.jpg',
    description: 'Intense Prussian blue ocean swells crashing with stark white foam crests, displaying crisp tonal contrast.',
    palette: ['#0b1d3a', '#1e3a8a', '#f8fafc', '#f59e0b'],
    recommendedFor: 'Dynamic surging swells with pronounced edge definition',
  },

  // Low Contrast Paintings (Gentle on the eyes)
  {
    id: 'monet-water-lilies',
    title: 'Water Lilies (Nymphéas)',
    artist: 'Claude Monet',
    year: '1906',
    contrast: 'low',
    texturePath: '/textures/monet_lilies.jpg',
    description: 'Soft diffused impressionist pond with pastel teals, gentle muted greens, and delicate pink blossoms. Soothing and easy on the eyes.',
    palette: ['#334e58', '#5b827e', '#88a282', '#dfb0b6'],
    recommendedFor: 'Soft, gentle viewing with muted pastel transitions',
  },
  {
    id: 'vangogh-almond-blossom',
    title: 'Almond Blossom',
    artist: 'Vincent van Gogh',
    year: '1890',
    contrast: 'low',
    texturePath: '/textures/vangogh_blossom.jpg',
    description: 'Tranquil pale turquoise cyan sky, delicate ivory blossoms, and gentle pastel harmony with seamless tonal transitions.',
    palette: ['#2e6f77', '#4b9aa1', '#a8d5c4', '#fbf4df'],
    recommendedFor: 'Peaceful aesthetic with reduced optical strain',
  },
];

export const DEFAULT_PAINTING = PAINTINGS[0];
