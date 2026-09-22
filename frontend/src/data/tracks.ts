import { TrackOption } from '../types';
import { getFeaturesPathForTrack } from '@/config/index';

/**
 * CLOUDFLARE PAGES / CDN AUDIO CONFIGURATION
 *
 * When hosting your 20 MP3 files on Cloudflare Pages:
 * 1. Set your Cloudflare Pages domain here (e.g. 'https://my-audio-tracks.pages.dev')
 *    or define VITE_AUDIO_BASE_URL in your .env / Netlify environment variables.
 * 2. If left empty (''), it will default to local project paths (e.g. '/audio/...').
 */
export const AUDIO_CDN_BASE: string =
  ((import.meta.env.VITE_AUDIO_BASE_URL as string | undefined) || 'https://nutcracker.acapella20nov.workers.dev').replace(/\/+$/, '');

/**
 * Helper to resolve audio file path:
 * If the path starts with http:// or https://, it is used as-is.
 * If AUDIO_CDN_BASE is configured, it prepends the CDN domain.
 * Otherwise, it falls back to the local relative path.
 * Safely URL-encodes special characters and spaces so browsers fetch them reliably.
 */
export const resolveAudioPath = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${AUDIO_CDN_BASE}${cleanPath}`;

  try {
    return encodeURI(decodeURI(fullUrl));
  } catch {
    return encodeURI(fullUrl);
  }
};

/**
 * TRACK CATALOG (20 TRACKS)
 * 
 * To add a new song to Fluid Canvas:
 * 1. Upload your MP3 to Cloudflare Pages (e.g. in folder /audio/track_name.mp3)
 * 2. Put the 31-feature extraction JSON in /public/ml/ (e.g. /public/ml/track_name.json)
 * 3. Add the track metadata entry below.
 */
export const TRACKS: TrackOption[] = [
  {
    id: 'beyond-love',
    title: 'Beyond Love',
    artist: 'Beach House',
    album: 'Thank Your Lucky Stars',
    duration: 165,
    audioPath: resolveAudioPath('/audio/beyond_love_beach_house.mp3'),
    featuresPath: getFeaturesPathForTrack('beyond-love', '/ml/beyond_love_beach_house_features.json'),
    description: 'Dream pop with expansive reverbs, lush vintage organs, and intimate vocals.',
  },
  {
    id: 'catch-the-rainbow',
    title: 'Catch the Rainbow',
    artist: 'Rainbow',
    album: 'Ritchie Blackmore\'s Rainbow',
    duration: 396,
    audioPath: resolveAudioPath('/audio/catch_the_rainbow.mp3'),
    featuresPath: getFeaturesPathForTrack('catch-the-rainbow', '/ml/Catch_the_Rainbow_features.json'),
    description: 'Classic rock ballad featuring melodic guitar solos and soulful vocals.',
  },
  {
    id: 'comfortably-numb',
    title: 'Comfortably Numb',
    artist: 'Pink Floyd',
    album: 'The Wall',
    duration: 382,
    audioPath: resolveAudioPath('/audio/comfortably_numb.mp3'),
    featuresPath: getFeaturesPathForTrack('comfortably-numb', '/ml/comfortably_numb_features.json'),
    description: 'Iconic progressive rock track renowned for its soaring guitar solos and atmospheric production.',
  },
  {
    id: 'waltz-no-2',
    title: 'Waltz No. 2',
    artist: 'Dmitri Shostakovich',
    album: 'Suite for Variety Orchestra',
    duration: 220,
    audioPath: resolveAudioPath('/audio/dmitri-shostakovich _waltz_num_2.mp3'),
    featuresPath: getFeaturesPathForTrack('waltz-no-2', '/ml/Dmitri-Shostakovich _Waltz_num_2_features.json'),
    description: 'Dramatic and evocative classical waltz featuring rich orchestral brass and woodwinds.',
  },
  {
    id: 'gymnopédie-no-1',
    title: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    album: '3 Gymnopédies',
    duration: 180,
    audioPath: resolveAudioPath('/audio/erik_satie_gymnopedie_num_1.mp3'),
    featuresPath: getFeaturesPathForTrack('gymnopédie-no-1', '/ml/Erik_Satie_Gymnopédie_num_1_features.json'),
    description: 'Gentle, ambient minimalist piano composition with a relaxed, reflective mood.',
  },
  {
    id: 'goodbye-yellow-brick-road',
    title: 'Goodbye Yellow Brick Road',
    artist: 'Elton John',
    album: 'Goodbye Yellow Brick Road',
    duration: 193,
    audioPath: resolveAudioPath('/audio/goodbye_yellow_brick_road_elton_john.mp3'),
    featuresPath: getFeaturesPathForTrack('goodbye-yellow-brick-road', '/ml/Goodbye_Yellow_Brick_Road_Elton_John_features.json'),
    description: 'Classic 70s soft rock track driven by signature piano arrangements and rich vocal harmonies.',
  },
  {
    id: 'clint-eastwood',
    title: 'Clint Eastwood',
    artist: 'Gorillaz',
    album: 'Gorillaz',
    duration: 340,
    audioPath: resolveAudioPath('/audio/gorillaz_clint_eastwood.mp3'),
    featuresPath: getFeaturesPathForTrack('clint-eastwood', '/ml/Gorillaz - Clint Eastwood_features.json'),
    description: 'Trip-hop blend of dub reggae basslines, hip-hop beats, and laid-back vocals.',
  },
  {
    id: 'just-the-two-of-us',
    title: 'Just the Two of Us',
    artist: 'Bill Withers',
    album: 'Winelight',
    duration: 238,
    audioPath: resolveAudioPath('/audio/just_the_two_of_us_bill_withers.mp3'),
    featuresPath: getFeaturesPathForTrack('just-the-two-of-us', '/ml/just_the_two_of_us_bill_withers_features.json'),
    description: 'Smooth R&B and smooth jazz classic with grooving electric piano and saxophone hooks.',
  },
  {
    id: 'mariage-d-amour',
    title: 'Mariage d\'Amour',
    artist: 'Paul de Senneville',
    album: 'Mariage d\'amour',
    duration: 160,
    audioPath: resolveAudioPath('/audio/mariage_d_amour.mp3'),
    featuresPath: getFeaturesPathForTrack('mariage-d-amour', '/ml/mariage_d_amour_features.json'),
    description: 'Expressive contemporary solo piano piece filled with romantic melodies.',
  },
  {
    id: 'billie-jean',
    title: 'Billie Jean',
    artist: 'Michael Jackson',
    album: 'Thriller',
    duration: 294,
    audioPath: resolveAudioPath('/audio/michael_jackson_billie_jean.mp3'),
    featuresPath: getFeaturesPathForTrack('billie-jean', '/ml/Michael_Jackson_Billie_Jean_features.json'),
    description: 'Legendary dance-pop track with an iconic bassline and crisp synth arrangements.',
  },
  {
    id: 'lacrimosa-requiem',
    title: 'Lacrimosa (Requiem)',
    artist: 'Wolfgang Amadeus Mozart',
    album: 'Requiem in D minor',
    duration: 180,
    audioPath: resolveAudioPath('/audio/mozart_requiem.mp3'),
    featuresPath: getFeaturesPathForTrack('lacrimosa-requiem', '/ml/Mozart_Requiem_features.json'),
    description: 'Hauntingly beautiful choral and orchestral masterpiece in D minor.',
  },
  {
    id: 'planet-caravan',
    title: 'Planet Caravan',
    artist: 'Black Sabbath',
    album: 'Paranoid',
    duration: 272,
    audioPath: resolveAudioPath('/audio/planet_caraven_black_sabbath.mp3'),
    featuresPath: getFeaturesPathForTrack('planet-caravan', '/ml/planet_caraven_black_sabbath_features.json'),
    description: 'Psychedelic, atmospheric rock track with soft percussion and warm, reverberant vocals.',
  },
  {
    id: 'serenade',
    title: 'Serenade',
    artist: 'Franz Schubert',
    album: 'Schwanengesang',
    duration: 250,
    audioPath: resolveAudioPath('/audio/schubert_serenade.mp3'),
    featuresPath: getFeaturesPathForTrack('serenade', '/ml/Schubert_Serenade_features.json'),
    description: 'Melancholic classical piece with expressive piano and emotive melodic phrasings.',
  },
  {
    id: 'sparks',
    title: 'Sparks',
    artist: 'Coldplay',
    album: 'Parachutes',
    duration: 227,
    audioPath: resolveAudioPath('/audio/sparks_coldplay.mp3'),
    featuresPath: getFeaturesPathForTrack('sparks', '/ml/sparks_coldplay_features.json'),
    description: 'Mellow alternative indie track featuring acoustic guitars and warm basslines.',
  },
  {
    id: 'pas-de-deux',
    title: 'Pas de deux (The Nutcracker)',
    artist: 'Pyotr Ilyich Tchaikovsky',
    album: 'The Nutcracker, Op. 71',
    duration: 320,
    audioPath: resolveAudioPath('/audio/tchaikovsky_pas_de_deux.mp3'),
    featuresPath: getFeaturesPathForTrack('pas-de-deux', '/ml/Tchaikovsky_pas_de_deux_features.json'),
    description: 'Sweeping orchestral masterpiece with dramatic climaxes and lush string arrangements.',
  },
  {
    id: 'where-is-the-love',
    title: 'Where Is the Love?',
    artist: 'The Black Eyed Peas',
    album: 'Elephunk',
    duration: 272,
    audioPath: resolveAudioPath('/audio/the_black_eyed_peas_where_is_the_love.mp3'),
    featuresPath: getFeaturesPathForTrack('where-is-the-love', '/ml/The_Black_Eyed_Peas_Where-Is-The_Love_features.json'),
    description: 'Uplifting early 2000s hip-hop track with acoustic rhythm guitars and catchy chorus hooks.',
  },
  {
    id: 'wish-you-were-here',
    title: 'Wish You Were Here',
    artist: 'Pink Floyd',
    album: 'Wish You Were Here',
    duration: 334,
    audioPath: resolveAudioPath('/audio/wish_you_were_here_pink_floyd.mp3'),
    featuresPath: getFeaturesPathForTrack('wish-you-were-here', '/ml/wish_you_were_here_pink_floyd_features.json'),
    description: 'Timeless acoustic rock anthem featuring 12-string guitars and soulful vocal performances.',
  },
];

export const DEFAULT_TRACK = TRACKS[0];




