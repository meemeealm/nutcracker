import React, { useEffect, useRef, useState, useCallback } from 'react';

import * as THREE from 'three';

import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Info,
  AlertCircle,
  AlertTriangle,
  EyeOff,
  Palette,
  Music,
  Droplets,
  Layers,
} from 'lucide-react';

import { ModelInference } from '../ml/ModelInference.js';
import { TimelineLoader } from '../ml/TimelineLoader.js';
import { FluidMesh } from '../graphics/FluidMesh.js';
import { clampVisualParameters, clampDeltaTime } from '../utils/Random.js';
import {
  ML_CONFIG,
  getModelPathForTrack,
  getFeaturesPathForTrack,
  lerpVisualParameters,
} from '@/config/index';
import { ArtworkDetails } from './ArtworkDetails';
import { SensoryWarningModal } from './SensoryWarningModal';
import { PaintingSelector } from './PaintingSelector';
import { PaintingSelectorModal } from './PaintingSelectorModal';
import { TrackSelector } from './TrackSelector';
import { TrackSelectorModal } from './TrackSelectorModal';
import { PAINTINGS, DEFAULT_PAINTING } from '../data/paintings';
import { TRACKS, DEFAULT_TRACK } from '../data/tracks';

import { VisualParameters, PlaybackStatus, PaintingOption, TrackOption } from '../types';

/* ============================================================
   FEATURE FILE TYPES (matches beach_house.json schema 1.0)
   ============================================================ */

interface FeatureFrame {
  index: number;
  time: number;

  features: {
    rms: number;
    zero_crossing_rate: number;
    spectral_centroid: number;
    spectral_bandwidth: number;
    spectral_rolloff: number;
    mfcc: number[];
  };

  semantic: Record<string, number>;
}

interface FeatureFile {
  track?: string;
  artist?: string;
  duration?: number;
  fps?: number;
  analysis?: {
    hop_seconds?: number;
    feature_order?: string[];
    input_size?: number;
  };
  frames: FeatureFrame[];
}

/* ============================================================
   CONSTANTS
   ============================================================ */

const INPUT_SIZE = 31;
const MFCC_COUNT = 13;
const DEFAULT_FPS = 10;

/** ~22 model inferences per second. Rendering still runs at display rate. */
const INFERENCE_INTERVAL_MS = 45;

/** React state (timeline) is refreshed 10x per second, not 60x. */
const UI_TIME_UPDATE_MS = 100;

const SEMANTIC_NAMES = [
  'voice',
  'singing',
  'music',
  'drums',
  'bass',
  'guitar',
  'piano',
  'strings',
  'electronic',
  'ambient',
  'noise',
  'clap',
  'impact',
] as const;

const EXPECTED_FEATURE_ORDER: string[] = [
  'rms',
  'zero_crossing_rate',
  'spectral_centroid',
  'spectral_bandwidth',
  'spectral_rolloff',
  ...Array.from({ length: MFCC_COUNT }, (_, i) => `mfcc_${i}`),
  ...SEMANTIC_NAMES,
];

/**
 * NORMALIZATION
 *
 * These divisors MUST match whatever was used when the model was trained
 * (or be removed if ModelInference normalizes internally).
 *
 * Warning: beach_house.json stores raw MFCCs (mfcc_0 is -1131.37 on
 * silence). Dividing by 40 and clamping to [-1, 1] will pin mfcc_0 at -1
 * for almost every frame. Replace with your training scaler's values.
 */
const NORM = {
  spectralCentroid: 8000,
  spectralBandwidth: 5000,
  spectralRolloff: 8000,
  mfcc: 40,
} as const;

/* ============================================================
   HELPERS
   ============================================================ */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeDispose(obj: unknown): void {
  try {
    (obj as { dispose?: () => void } | null)?.dispose?.();
  } catch (err) {
    console.warn('[Nutcracker] dispose failed:', err);
  }
}

/**
 * Converts one JSON frame into the 31-element model input:
 *
 *  0-4    rms, zcr, centroid, bandwidth, rolloff
 *  5-17   mfcc[0..12]
 *  18-30  semantic features
 */
function buildFeatureVector(frame: FeatureFrame): number[] {
  if (!frame) {
    throw new Error('Feature frame is missing.');
  }

  // Support precomputed 31-element feature arrays from beach_house.json
  if (Array.isArray((frame as any).features) && (frame as any).features.length === INPUT_SIZE) {
    return (frame as any).features;
  }

  if (Array.isArray(frame) && (frame as any).length === INPUT_SIZE) {
    return frame as any;
  }

  const { features, semantic } = frame;

  if (!features) {
    throw new Error(`Frame ${frame.index} has no features object.`);
  }

  if (!semantic) {
    throw new Error(`Frame ${frame.index} has no semantic object.`);
  }

  if (!Array.isArray(features.mfcc) || features.mfcc.length !== MFCC_COUNT) {
    throw new Error(
      `Frame ${frame.index} has invalid MFCC data. Expected ${MFCC_COUNT} values, received ${
        Array.isArray(features.mfcc) ? features.mfcc.length : 0
      }.`
    );
  }

  const vector: number[] = [
    clamp(Number(features.rms ?? 0), 0, 1),
    clamp(Number(features.zero_crossing_rate ?? 0), 0, 1),
    clamp(Number(features.spectral_centroid ?? 0) / NORM.spectralCentroid, 0, 1),
    clamp(Number(features.spectral_bandwidth ?? 0) / NORM.spectralBandwidth, 0, 1),
    clamp(Number(features.spectral_rolloff ?? 0) / NORM.spectralRolloff, 0, 1),

    ...features.mfcc.map((value) => clamp(Number(value) / NORM.mfcc, -1, 1)),

    ...SEMANTIC_NAMES.map((name) => clamp(Number(semantic[name] ?? 0), 0, 1)),
  ];

  if (vector.length !== INPUT_SIZE) {
    throw new Error(
      `Invalid feature vector for frame ${frame.index}: expected ${INPUT_SIZE}, received ${vector.length}.`
    );
  }

  return vector;
}

const DEFAULT_VISUAL_PARAMS: VisualParameters = {
  flow_strength: 0.5,
  turbulence: 0.4,
  pigment_spread: 0.5,
  displacement: 0.3,
  warp: 0.3,
  color_shift: 0.2,
  detail: 0.5,
  activity: 0.5,
};

/* ============================================================
   COMPONENT
   ============================================================ */

export const FluidCanvas: React.FC = () => {
  /* ---------- DOM refs ---------- */

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ---------- Three.js / ML refs ---------- */

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const fluidMeshRef = useRef<FluidMesh | null>(null);
  const modelInferenceRef = useRef<ModelInference | null>(null);
  const timelineLoaderRef = useRef<TimelineLoader | null>(null);
  const featureDataRef = useRef<FeatureFile | null>(null);

  const lastInferenceTimeRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);
  const currentVisualParamsRef = useRef<VisualParameters | null>({ ...DEFAULT_VISUAL_PARAMS });
  const targetVisualParamsRef = useRef<VisualParameters | null>({ ...DEFAULT_VISUAL_PARAMS });
  const animationFrameIdRef = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const accumulatedShaderTimeRef = useRef<number>(0);
  const lastActiveTimestampRef = useRef<number | null>(null);

  /* ---------- Track and Painting Selection State ---------- */

  const [selectedTrack, setSelectedTrack] = useState<TrackOption>(() => {
    try {
      const savedId = sessionStorage.getItem('fluid_canvas_selected_track_id');
      if (savedId) {
        const found = TRACKS.find((t) => t.id === savedId);
        if (found) return found;
      }
    } catch {
      // ignore
    }
    return DEFAULT_TRACK;
  });
  const selectedTrackRef = useRef<TrackOption>(selectedTrack);
  selectedTrackRef.current = selectedTrack;

  const [selectedPainting, setSelectedPainting] = useState<PaintingOption>(() => {
    try {
      const savedId = sessionStorage.getItem('fluid_canvas_selected_painting_id');
      if (savedId) {
        const found = PAINTINGS.find((p) => p.id === savedId);
        if (found) return found;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PAINTING;
  });
  const selectedPaintingRef = useRef<PaintingOption>(selectedPainting);
  selectedPaintingRef.current = selectedPainting;

  /* ---------- UI state ---------- */

  const [playbackStatus, setPlaybackStatus] =
    useState<PlaybackStatus>('unstarted');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(() => selectedTrack.duration || 165);
  const durationRef = useRef<number>(selectedTrack.duration || 165);

  const updateDuration = useCallback((newDuration: number) => {
    if (isNaN(newDuration) || !isFinite(newDuration) || newDuration <= 0) return;
    durationRef.current = newDuration;
    setDuration(newDuration);
  }, []);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [showPaintingModal, setShowPaintingModal] = useState<boolean>(false);
  const [showTrackModal, setShowTrackModal] = useState<boolean>(false);

  const [hasAcknowledgedWarning, setHasAcknowledgedWarning] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('fluid_canvas_sensory_warning_accepted') === 'true';
    } catch {
      return false;
    }
  });
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('fluid_canvas_reduced_motion') === 'true';
    } catch {
      return false;
    }
  });
  const reducedMotionRef = useRef<boolean>(reducedMotion);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHoveringTimeline, setIsHoveringTimeline] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  /* ---------- Dynamics Mode (Dissolve Mode vs No Dissolve Mode) ---------- */
  const [dissolveMode, setDissolveMode] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('fluid_canvas_dissolve_mode');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // ignore
    }
    return true; // Default: Dissolve Mode (current state)
  });
  const dissolveModeRef = useRef<boolean>(dissolveMode);
  dissolveModeRef.current = dissolveMode;

  const handleToggleDissolveMode = useCallback((mode?: boolean) => {
    const nextMode = mode !== undefined ? mode : !dissolveModeRef.current;
    setDissolveMode(nextMode);
    dissolveModeRef.current = nextMode;
    try {
      sessionStorage.setItem('fluid_canvas_dissolve_mode', String(nextMode));
    } catch {
      // ignore
    }
    if (fluidMeshRef.current) {
      fluidMeshRef.current.setDissolveMode(nextMode);
    }
  }, []);

  /* ---------- Time formatter ---------- */

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) {
      return '00:00';
    }

    const totalSeconds = Math.floor(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  /* ---------- Painting Selection Handler ---------- */

  const handleSelectPainting = useCallback((painting: PaintingOption) => {
    setSelectedPainting(painting);
    selectedPaintingRef.current = painting;
    try {
      sessionStorage.setItem('fluid_canvas_selected_painting_id', painting.id);
    } catch {
      // ignore
    }
    if (fluidMeshRef.current) {
      fluidMeshRef.current.setTexture(painting.texturePath);
    }
  }, []);

  /* ---------- Track Selection Handler ---------- */

  const handleSelectTrack = useCallback((track: TrackOption) => {
    if (track.id === selectedTrackRef.current.id) return;

    setSelectedTrack(track);
    selectedTrackRef.current = track;
    try {
      sessionStorage.setItem('fluid_canvas_selected_track_id', track.id);
    } catch {
      // ignore
    }

    const wasPlaying = playbackStatus === 'playing';

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    setCurrentTime(0);
    accumulatedShaderTimeRef.current = 0;
    lastActiveTimestampRef.current = null;
    featureDataRef.current = null;
    currentVisualParamsRef.current = { ...DEFAULT_VISUAL_PARAMS };
    targetVisualParamsRef.current = { ...DEFAULT_VISUAL_PARAMS };
    setPlaybackStatus(wasPlaying ? 'loading' : 'unstarted');

    // Dynamically switch ML model if the selected song specifies a dedicated model path
    const targetModelPath = getModelPathForTrack(track.id);
    if (modelInferenceRef.current) {
      modelInferenceRef.current.switchModel(targetModelPath).catch((err: unknown) => {
        console.warn('[Nutcracker] Failed to switch model for track:', err);
      });
    }

    // Immediately reflect the track's known duration in state and ref
    if (track.duration && track.duration > 0) {
      updateDuration(track.duration);
    }

    const featuresUrl = getFeaturesPathForTrack(track.id, track.featuresPath);
    if (timelineLoaderRef.current) {
      timelineLoaderRef.current.load(featuresUrl).catch((err) => {
        console.warn('[Nutcracker] TimelineLoader switch error:', err);
      });
    }

    fetch(featuresUrl)
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          return null;
        }
        return res.json();
      })
      .then((data: FeatureFile | null) => {
        if (!data) return;
        featureDataRef.current = data;
        if (data.duration && data.duration > 0) {
          updateDuration(data.duration);
        }
      })
      .catch((err) => {
        console.warn('[Nutcracker] Failed to load features for track:', err);
      });

    const audio = new Audio(track.audioPath);
    audio.preload = 'auto';
    audio.muted = isMuted;

    const syncDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        updateDuration(audio.duration);
      }
    };

    audio.addEventListener('loadedmetadata', () => {
      syncDuration();
      if (!wasPlaying) {
        setPlaybackStatus('ready');
      }
    });

    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('canplay', syncDuration);

    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime !== undefined && !isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
        syncDuration();
        if (audio.currentTime > durationRef.current) {
          updateDuration(Math.ceil(audio.currentTime));
        }
      }
    });

    audio.addEventListener('ended', () => {
      setPlaybackStatus('ended');
      setShowControls(true);
    });

    audio.addEventListener('error', (e) => {
    const mediaErr = audio.error;

    console.warn('[Nutcracker] Audio error event:', {
    });

  // Don't show an error here.
  // The `playing`, `canplay`, `waiting`, and `stalled` events
  // should determine the actual playback state.

    });

    audioRef.current = audio;

    // Immediately trigger playback inside this click handler to preserve browser user activation
    if (wasPlaying) {
      setPlaybackStatus('loading');
      setErrorMessage(null);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setPlaybackStatus('playing');
            setErrorMessage(null);
          })
          .catch((playErr: any) => {
            console.warn('[Nutcracker] Switched track play error:', playErr);
            if (playErr?.name === 'NotAllowedError') {
              setErrorMessage('Browser blocked autoplay. Click Play to start sound.');
              setPlaybackStatus('paused');
            } else {
              setErrorMessage(`Could not start audio for "${track.title}": ${playErr?.message || 'Stream error'}`);
              setPlaybackStatus('error');
            }
          });
      }
    }
  }, [isMuted, playbackStatus, updateDuration]);

  /* ---------- User activity (auto-hide controls) ---------- */

  const handleUserActivity = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }

    if (playbackStatus === 'playing' && !showInfo) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [playbackStatus, showInfo]);

  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) {
      return;
    }

    let isDisposed = false;
    let lastLoggedError = '';

    /*
     * Logs an error once per distinct message so a per-frame failure
     * cannot flood the console at 60 lines per second.
     */
    const reportError = (label: string, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);

      if (message === lastLoggedError) {
        return;
      }

      lastLoggedError = message;
      console.error(`[Nutcracker] ${label}:`, err);
    };

    const guarded = (label: string, fn: () => void) => {
      try {
        fn();
      } catch (err) {
        reportError(label, err);
      }
    };

    /* ---------- 1. WebGL support check ---------- */

    try {
      const testCanvas = document.createElement('canvas');

      const gl =
        testCanvas.getContext('webgl') ||
        testCanvas.getContext('experimental-webgl');

      if (!gl) {
        setErrorMessage('WebGL is not supported on this browser or device.');
        setPlaybackStatus('error');
        return;
      }
    } catch {
      setErrorMessage('Unable to initialize WebGL hardware acceleration.');
      setPlaybackStatus('error');
      return;
    }

    /* ---------- 2. Renderer ---------- */

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;

    /* ---------- 3. Scene ---------- */

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    /* ---------- 4. Camera ---------- */

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    cameraRef.current = camera;

    /* ---------- 5. FluidMesh ----------
     *
     * constructor(scene, texturePath, renderer) adds its own mesh to the scene
     * and initializes GPU ping-pong Navier-Stokes & pigment render targets.
     */

    const fluidMesh = new FluidMesh(
      scene,
      selectedPaintingRef.current.texturePath,
      renderer
    );
    fluidMesh.setDissolveMode(dissolveModeRef.current);
    fluidMeshRef.current = fluidMesh;

    /* ---------- 6. Model ---------- */

    const initialModelPath = getModelPathForTrack(selectedTrackRef.current.id);
    const model = new ModelInference(initialModelPath);
    modelInferenceRef.current = model;

    model
      .load()
      .then(() => {
        if (!isDisposed) {
          console.log(`[Nutcracker] TensorFlow.js model loaded (${initialModelPath}).`);
        }
      })
      .catch((err) => {
        console.warn('[Nutcracker] Model load note:', err);
      });

    /* ---------- 7. Feature data & Timeline Loader ---------- */

    const initialFeaturesUrl = getFeaturesPathForTrack(
      selectedTrackRef.current.id,
      selectedTrackRef.current.featuresPath
    );

    const timelineLoader = new TimelineLoader({ path: initialFeaturesUrl });
    timelineLoaderRef.current = timelineLoader;
    timelineLoader.load().catch((err) => {
      console.warn('[Nutcracker] Initial TimelineLoader note:', err);
    });

    fetch(initialFeaturesUrl)
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          return null;
        }

        return res.json();
      })
      .then((data: FeatureFile | null) => {
        if (isDisposed || !data) {
          return;
        }

        if (!Array.isArray(data.frames) || data.frames.length === 0) {
          return;
        }

        const order = data.analysis?.feature_order;

        if (order && order.join(',') !== EXPECTED_FEATURE_ORDER.join(',')) {
          console.error(
            '[Nutcracker] feature_order in the JSON does not match the order used by buildFeatureVector.',
            { expected: EXPECTED_FEATURE_ORDER, received: order }
          );
        }

        featureDataRef.current = data;

        if (data.duration && data.duration > 0) {
          updateDuration(data.duration);
        }

        console.log(
          `[Nutcracker] Loaded ${data.frames.length} precomputed feature frames for ${selectedTrackRef.current.title}.`
        );
      })
      .catch((err) => {
        console.warn('[Nutcracker] Feature JSON loading notice:', err);
      });

    /* ---------- 8. Audio ---------- */

    const audio = new Audio(selectedTrackRef.current.audioPath);
    audio.preload = 'auto';
    audioRef.current = audio;

    const syncInitialAudioDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        updateDuration(audio.duration);
      } else if (selectedTrackRef.current.duration && selectedTrackRef.current.duration > 0) {
        updateDuration(selectedTrackRef.current.duration);
      }
    };

    const handleLoadedMetadata = () => {
      syncInitialAudioDuration();
    };

    const handleDurationChange = () => {
      syncInitialAudioDuration();
    };

    const handleCanPlay = () => {
      syncInitialAudioDuration();
    };

    const handleTimeUpdate = () => {
      if (audio.currentTime !== undefined && !isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
        syncInitialAudioDuration();
        if (audio.currentTime > durationRef.current) {
          updateDuration(Math.ceil(audio.currentTime));
        }
      }
    };

    const handleEnded = () => {
      setPlaybackStatus('ended');
      setShowControls(true);
    };

    const handleAudioError = (e: Event) => {
      const mediaErr = audio.error;
      console.warn('[Nutcracker] Initial audio loading error:', mediaErr, e);
      let detail = 'Please verify Cloudflare audio host connection.';
      if (mediaErr?.code === 4) {
        detail = 'File not found on Cloudflare (HTTP 404).';
      } else if (mediaErr?.code === 2) {
        detail = 'Network transfer interrupted.';
      }
      setErrorMessage(`Audio stream for "${selectedTrackRef.current.title}" failed: ${detail}`);
      setPlaybackStatus('error');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleAudioError);

    /* ---------- 9. Resize ---------- */

    const handleResize = () => {
      if (
        !containerRef.current ||
        !rendererRef.current ||
        !fluidMeshRef.current
      ) {
        return;
      }

      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      rendererRef.current.setSize(w, h);
      rendererRef.current.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
      );

      if (typeof (fluidMeshRef.current as any)?.resize === 'function') {
        (fluidMeshRef.current as any).resize(w, h);
      }
    };

    window.addEventListener('resize', handleResize);

    /* ---------- 10. Inference & Timeline Interpolation ---------- */

    const runInference = (audioTime: number, timeNow: number) => {
      let visual: VisualParameters | null = null;

      // 1. High Priority: TimelineLoader with Sub-Frame Linear Interpolation (60 FPS LERP)
      if (timelineLoaderRef.current && timelineLoaderRef.current.isLoaded) {
        try {
          const timelineVisual = timelineLoaderRef.current.getVisualState(audioTime);
          if (timelineVisual) {
            visual = {
              flow_strength: Number(timelineVisual.flow_strength ?? 0.5),
              turbulence: Number(timelineVisual.turbulence ?? 0.4),
              pigment_spread: Number(timelineVisual.pigment_spread ?? 0.5),
              displacement: Number(timelineVisual.displacement ?? 0.3),
              warp: Number(timelineVisual.warp ?? 0.3),
              color_shift: Number(timelineVisual.color_shift ?? 0.2),
              detail: Number(timelineVisual.detail ?? 0.5),
              activity: Number(timelineVisual.activity ?? 0.5),
            };
          }
        } catch (err) {
          console.warn('[Nutcracker] TimelineLoader interpolation error:', err);
        }
      }

      // 2. Secondary: Discrete Frame Data or Neural Model Inference
      if (!visual) {
        if (timeNow - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS) {
          lastInferenceTimeRef.current = timeNow;

          const data = featureDataRef.current;
          const inference = modelInferenceRef.current;

          if (data && data.frames && data.frames.length > 0) {
            const hop = data.analysis?.hop_seconds;
            const fps = hop && hop > 0 ? 1 / hop : DEFAULT_FPS;
            const frameIndex = clamp(
              Math.floor(audioTime * fps),
              0,
              data.frames.length - 1
            );
            const frame = data.frames[frameIndex];

            if (frame && (frame as any).target) {
              const t = (frame as any).target;
              visual = {
                flow_strength: Number(t.flow_strength ?? 0.5),
                turbulence: Number(t.turbulence ?? 0.4),
                pigment_spread: Number(t.pigment_spread ?? 0.5),
                displacement: Number(t.displacement ?? 0.3),
                warp: Number(t.warp ?? 0.3),
                color_shift: Number(t.color_shift ?? 0.2),
                detail: Number(t.detail ?? 0.5),
                activity: Number(t.activity ?? 0.5),
              };
            } else if (inference?.model && frame) {
              try {
                const vector = buildFeatureVector(frame);
                visual = inference.predict(vector);
              } catch {
                // Keep current visuals if frame vector is malformed
              }
            }
          }
        }
      }

      // 3. Fallback: Continuous harmonic acoustic dynamics
      // Guarantees immediate fluid morphing and progressive pigment flow as soon as audio plays
      if (!visual) {
        visual = {
          flow_strength: 0.5 + 0.35 * Math.sin(audioTime * 1.3),
          turbulence: 0.45 + 0.3 * Math.cos(audioTime * 1.1 + 0.5),
          pigment_spread: 0.52 + 0.2 * Math.sin(audioTime * 0.7),
          displacement: 0.38 + 0.25 * Math.sin(audioTime * 2.1),
          warp: 0.35 + 0.25 * Math.cos(audioTime * 1.7),
          color_shift: 0.25 + 0.2 * Math.sin(audioTime * 0.4),
          detail: 0.5 + 0.25 * Math.cos(audioTime * 0.9),
          activity: 0.6 + 0.35 * Math.sin(audioTime * 1.8),
        };
      }

      const safeVisual = clampVisualParameters(visual);
      targetVisualParamsRef.current = safeVisual;
      if (!currentVisualParamsRef.current) {
        currentVisualParamsRef.current = safeVisual;
      }
    };

    /* ---------- 11. Render loop ---------- */

    const renderLoop = (timeNow: number) => {
      if (isDisposed) {
        return;
      }

      /* Schedule first so one bad frame can never stop the loop. */
      animationFrameIdRef.current = requestAnimationFrame(renderLoop);

      guarded('Frame update failed', () => {
        const currentAudio = audioRef.current;

        const isAudioPlaying =
          !!currentAudio && !currentAudio.paused && !currentAudio.ended;

        if (isAudioPlaying && currentAudio) {
          const audioTime = currentAudio.currentTime;

          if (timeNow - lastUiUpdateRef.current >= UI_TIME_UPDATE_MS) {
            lastUiUpdateRef.current = timeNow;
            setCurrentTime(audioTime);

            if (
              currentAudio.duration &&
              !isNaN(currentAudio.duration) &&
              isFinite(currentAudio.duration) &&
              currentAudio.duration > 0
            ) {
              if (Math.abs(durationRef.current - currentAudio.duration) > 0.5) {
                updateDuration(currentAudio.duration);
              }
            } else if (audioTime > durationRef.current) {
              updateDuration(Math.ceil(audioTime));
            }
          }

          runInference(audioTime, timeNow);

          if (lastActiveTimestampRef.current !== null) {
            const dt = (timeNow - lastActiveTimestampRef.current) * 0.001;
            accumulatedShaderTimeRef.current += clampDeltaTime(dt, 0.05);
          }
          lastActiveTimestampRef.current = timeNow;
        } else {
          lastActiveTimestampRef.current = null;
        }

        /*
         * Smooth visual parameters interpolation (gliding towards target predictions)
         */
        if (targetVisualParamsRef.current) {
          if (!currentVisualParamsRef.current) {
            currentVisualParamsRef.current = targetVisualParamsRef.current;
          } else {
            currentVisualParamsRef.current = lerpVisualParameters(
              currentVisualParamsRef.current,
              targetVisualParamsRef.current
            );
          }
        }

        /*
         * FluidMesh.update(visual, time) reads properties from `visual`,
         * so it must never receive null. Before the first prediction
         * exists we skip the update.
         * The shader time only advances when audio is actively playing,
         * so the fluid canvas freezes gracefully when stopped.
         */
        const params = currentVisualParamsRef.current;
        const shaderTime = accumulatedShaderTimeRef.current;

        if (fluidMeshRef.current && params) {
          if (reducedMotionRef.current) {
            fluidMeshRef.current.update(
              {
                flow_strength: params.flow_strength * 0.45,
                turbulence: params.turbulence * 0.35,
                pigment_spread: params.pigment_spread * 0.55,
                displacement: params.displacement * 0.3,
                warp: params.warp * 0.3,
                color_shift: params.color_shift * 0.35,
                detail: params.detail * 0.5,
                activity: params.activity * 0.4,
              },
              shaderTime,
              renderer,
              { isPlaying: isAudioPlaying, reducedMotion: true }
            );
          } else {
            fluidMeshRef.current.update(
              params,
              shaderTime,
              renderer,
              { isPlaying: isAudioPlaying, reducedMotion: false }
            );
          }
        }
      });

      guarded('Render failed', () => {
        renderer.render(scene, camera);
      });
    };

    animationFrameIdRef.current = requestAnimationFrame(renderLoop);

    /* ---------- Cleanup ---------- */

    return () => {
      isDisposed = true;

      window.removeEventListener('resize', handleResize);

      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleAudioError);

      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }

      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      audio.pause();
      audio.src = '';

      safeDispose(modelInferenceRef.current);
      modelInferenceRef.current = null;

      safeDispose(fluidMeshRef.current);
      fluidMeshRef.current = null;

      safeDispose(rendererRef.current);
      rendererRef.current = null;

      sceneRef.current = null;
      cameraRef.current = null;
      audioRef.current = null;
      featureDataRef.current = null;
      currentVisualParamsRef.current = null;
      lastInferenceTimeRef.current = 0;
      lastUiUpdateRef.current = 0;
    };
  }, []);

  /* ==========================================================
     HANDLERS
     ========================================================== */

  const executePlay = async () => {
    if (!audioRef.current) {
      return;
    }

    setErrorMessage(null);

    try {
      if (audioRef.current.paused) {
        await audioRef.current.play();
        setPlaybackStatus('playing');
        handleUserActivity();
      } else {
        audioRef.current.pause();
        setPlaybackStatus('paused');
        setShowControls(true);
      }
    } catch (err: any) {
      console.warn('[Nutcracker] Playback error or restriction:', err);

      const mediaErr = audioRef.current?.error;

      if (err?.name === 'NotAllowedError') {
        setErrorMessage(
          'Browser autoplay restriction active. Click anywhere on the canvas or tap "Resume" to enable sound.'
        );
        setPlaybackStatus('paused');
      } else if (mediaErr?.code === 4) {
        // code 4 is NOT equivalent to HTTP 404.
        console.warn('[Nutcracker] Browser reported media error code 4:', {
          error: mediaErr,
          src: audioRef.current?.currentSrc,
        });

        setErrorMessage(null);
        setPlaybackStatus('loading');
      } else if (err?.name === 'NotSupportedError' || mediaErr) {
        setErrorMessage(
          `Cannot play "${selectedTrack.title}": Audio resource could not be loaded.`
        );
        setPlaybackStatus('error');
      } else {
        setErrorMessage(null);
        setPlaybackStatus('loading');
      }
    }
  };

  const handleTogglePlay = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!audioRef.current) {
      return;
    }

    // Intercept with sensory warning if paused/unstarted and not yet acknowledged
    if (audioRef.current.paused && !hasAcknowledgedWarning) {
      setShowWarningModal(true);
      return;
    }

    await executePlay();
  };

  const handleConfirmWarning = async (options: {
    reducedMotion: boolean;
    rememberSession: boolean;
  }) => {
    setHasAcknowledgedWarning(true);
    setReducedMotion(options.reducedMotion);
    reducedMotionRef.current = options.reducedMotion;

    if (options.rememberSession) {
      try {
        sessionStorage.setItem('fluid_canvas_sensory_warning_accepted', 'true');
        if (options.reducedMotion) {
          sessionStorage.setItem('fluid_canvas_reduced_motion', 'true');
        } else {
          sessionStorage.removeItem('fluid_canvas_reduced_motion');
        }
      } catch {
        // ignore
      }
    }

    setShowWarningModal(false);
    await executePlay();
  };

  const handleToggleReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled);
    reducedMotionRef.current = enabled;
    try {
      if (enabled) {
        sessionStorage.setItem('fluid_canvas_reduced_motion', 'true');
      } else {
        sessionStorage.removeItem('fluid_canvas_reduced_motion');
      }
    } catch {
      // ignore
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const currentAudio = audioRef.current;
    if (!currentAudio) return;

    const actualDuration =
      currentAudio.duration && isFinite(currentAudio.duration) && currentAudio.duration > 0
        ? currentAudio.duration
        : Math.max(duration, currentTime, 1);

    if (actualDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percentage * actualDuration;

    currentAudio.currentTime = targetTime;
    setCurrentTime(targetTime);
    handleUserActivity();
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const currentAudio = audioRef.current;
    const actualDuration =
      currentAudio?.duration && isFinite(currentAudio.duration) && currentAudio.duration > 0
        ? currentAudio.duration
        : Math.max(duration, currentTime, 1);

    const rect = e.currentTarget.getBoundingClientRect();
    const moveX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, moveX / rect.width));

    setHoverTime(percentage * actualDuration);
    setIsHoveringTimeline(true);
  };

  const handleReturnHome = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    accumulatedShaderTimeRef.current = 0;
    lastActiveTimestampRef.current = null;
    setPlaybackStatus('unstarted');
    setShowControls(true);
    setShowInfo(false);
    setShowWarningModal(false);
    setShowPaintingModal(false);
    setShowTrackModal(false);
    setErrorMessage(null);
  };

  const handleRestart = () => {
    if (!audioRef.current) {
      return;
    }

    if (!hasAcknowledgedWarning) {
      setShowWarningModal(true);
      return;
    }

    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    accumulatedShaderTimeRef.current = 0;
    lastActiveTimestampRef.current = null;

    audioRef.current
      .play()
      .then(() => {
        setPlaybackStatus('playing');
        handleUserActivity();
      })
      .catch((err) => {
        console.warn('Restart playback error:', err);
      });
  };

  const handleToggleMute = () => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.muted = !audioRef.current.muted;
    setIsMuted(audioRef.current.muted);
    handleUserActivity();
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch(console.warn);
    } else {
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
        })
        .catch(console.warn);
    }

    handleUserActivity();
  };

  /* ---------- Keyboard shortcuts ---------- */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFullscreen();
      } else if (e.key === 'd' || e.key === 'D') {
        handleToggleDissolveMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playbackStatus, hasAcknowledgedWarning]);

  /* ---------- Derived UI state ---------- */

  const effectiveDuration = Math.max(duration, currentTime, 1);
  const progress = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));
  const isPlaying = playbackStatus === 'playing';
  const isInitialState = playbackStatus === 'unstarted';

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      ref={containerRef}
      id="fluid-canvas-container"
      className="relative w-screen h-screen overflow-hidden bg-[#070709] cursor-default select-none"
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      onClick={(e) => {
        handleUserActivity();
        // Only trigger canvas click-to-play if directly clicking the canvas background
        const target = e.target as HTMLElement | null;
        const isCanvasBackground =
          target === canvasRef.current ||
          target?.id === 'gallery-ambient-vignette' ||
          target?.id === 'fluid-canvas-container';

        if (
          isCanvasBackground &&
          audioRef.current &&
          audioRef.current.paused &&
          hasAcknowledgedWarning &&
          playbackStatus !== 'error' &&
          playbackStatus !== 'loading'
        ) {
          executePlay();
        }
      }}
    >
      {/* Three.js canvas */}
      <canvas
        ref={canvasRef}
        id="painting-webgl-canvas"
        className="absolute inset-0 w-full h-full block z-0"
      />

      {/* Vignette */}
      <div
        id="gallery-ambient-vignette"
        className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_120px_rgba(0,0,0,0.7)]"
      />

      {/* Header */}
      <header
        id="canvas-header"
        className={`absolute top-0 left-0 right-0 z-30 p-6 sm:p-8 flex justify-between items-start transition-opacity duration-700 ${
          showControls || isInitialState
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          id="brand-home-button"
          onClick={(e) => {
            e.stopPropagation();
            handleReturnHome();
          }}
          className="group flex flex-col items-start p-1 pointer-events-auto cursor-pointer text-left focus:outline-none transition-transform active:scale-[0.98]"
          title="Return to Home"
          aria-label="Return to Home: Fluid Canvas Living Oil Pigment Synthesis"
        >
          <span className="font-serif tracking-widest text-xs uppercase text-amber-300 group-hover:text-amber-200 font-semibold drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] transition-colors">
            FLUID CANVAS
          </span>

          <span className="text-xs font-sans tracking-wide text-neutral-300 group-hover:text-white font-normal mt-0.5 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] transition-colors">
            Living Oil Pigment Synthesis
          </span>
        </button>

        <div className="flex items-center gap-3 pointer-events-auto">
          {reducedMotion && (
            <span
              id="reduced-motion-active-indicator"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/50 text-amber-200 text-xs font-sans font-medium shadow-sm backdrop-blur-md"
              title="Gentle / Reduced Motion mode is active"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-300" />
              <span>Gentle Mode</span>
            </span>
          )}

          {/* Mode Selector: Dissolve Mode vs No Dissolve Mode */}
          <div
            id="dynamics-mode-segmented-control"
            className="flex items-center p-1 rounded-2xl bg-neutral-950/85 border border-white/20 backdrop-blur-xl shadow-xl text-xs font-sans font-medium"
            role="group"
            aria-label="Simulation Dynamics Mode"
          >
            <button
              id="header-mode-dissolve-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleDissolveMode(true);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                dissolveMode
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
              title="Dissolve Mode (Current State): Fluid advection, pigment melting, Laplacian bleeding & vortex dispersion (Hotkey: D)"
              aria-pressed={dissolveMode}
            >
              <Droplets className={`w-3.5 h-3.5 ${dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
              <span className="hidden sm:inline font-medium">Dissolve</span>
            </button>

            <button
              id="header-mode-nodissolve-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleDissolveMode(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                !dissolveMode
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
              title="No Dissolve Mode: Preserves original pristine artwork with timeline linear interpolation (Hotkey: D)"
              aria-pressed={!dissolveMode}
            >
              <Layers className={`w-3.5 h-3.5 ${!dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
              <span className="hidden sm:inline font-medium">No Dissolve</span>
            </button>
          </div>

          {/* Track Switcher Header Button */}
          <button
            id="track-switcher-header-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowTrackModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-neutral-950/85 hover:bg-neutral-900 border border-white/20 hover:border-amber-300/60 text-neutral-100 hover:text-white transition-all backdrop-blur-xl text-xs font-sans shadow-xl cursor-pointer"
            title="Change Audio Track"
            aria-label="Change Audio Track"
          >
            <Music className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline font-serif font-medium truncate max-w-[130px]">
              {selectedTrack.title}
            </span>
          </button>

          {/* Painting Switcher Header Button */}
          <button
            id="paintings-switcher-header-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowPaintingModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-neutral-950/85 hover:bg-neutral-900 border border-white/20 hover:border-amber-300/60 text-neutral-100 hover:text-white transition-all backdrop-blur-xl text-xs font-sans shadow-xl cursor-pointer"
            title="Change Canvas Painting (High & Low Contrast)"
            aria-label="Change Canvas Painting"
          >
            <Palette className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline font-serif font-medium truncate max-w-[130px]">
              {selectedPainting.title}
            </span>
          </button>

          <button
            id="sensory-advisory-header-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowWarningModal(true);
            }}
            className="p-2.5 rounded-2xl bg-neutral-950/85 hover:bg-neutral-900 border border-amber-400/50 hover:border-amber-300 text-amber-300 hover:text-amber-200 transition-all backdrop-blur-xl shadow-xl cursor-pointer"
            title="Sensory & Visual Motion Advisory (Dizziness / Bright shapes)"
            aria-label="Sensory Advisory"
          >
            <AlertTriangle className="w-4 h-4" />
          </button>

          <button
            id="curator-info-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(true);
            }}
            className="p-2.5 rounded-2xl bg-neutral-950/85 hover:bg-neutral-900 border border-white/20 text-neutral-200 hover:text-white transition-all backdrop-blur-xl shadow-xl cursor-pointer"
            title="Artwork & Neural Pipeline Info"
            aria-label="Artwork Information"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Initial play screen */}
      {isInitialState && (
        <div
          id="initial-hero-overlay"
          className="absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-black/75 backdrop-blur-md pointer-events-auto transition-opacity duration-700"
        >
          <div className="min-h-full w-full flex flex-col items-center p-4 sm:p-6 pt-16 sm:pt-20 pb-16 sm:pb-20 text-center">
            <div className="max-w-4xl w-full bg-neutral-950/95 border border-white/20 rounded-3xl p-6 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.85)] ring-1 ring-white/10 space-y-6 sm:space-y-7 flex flex-col items-center my-auto">
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-widest font-sans text-amber-300 font-medium block drop-shadow-sm">
                  NUTCRACKER
                </span>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                  {selectedTrack.title}
                </h1>

                <p className="text-xs sm:text-sm tracking-wide text-neutral-300 font-sans font-medium mt-1">
                  {selectedTrack.artist}
                </p>
              </div>

              {/* Play Button */}
              <div className="flex flex-col items-center space-y-2.5">
                <button
                  id="initial-play-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(e);
                  }}
                  className="group relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 hover:border-amber-300/80 transition-all duration-500 flex items-center justify-center backdrop-blur-md shadow-2xl hover:scale-105 active:scale-95 cursor-pointer"
                  aria-label="Begin Exhibition Playback"
                >
                  <div className="absolute inset-0 rounded-full border border-amber-300/20 group-hover:border-amber-300/40 animate-ping opacity-30" />

                  <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-amber-200 transition-colors ml-1" />
                </button>

                <div className="text-xs font-sans text-amber-200 tracking-wide font-medium drop-shadow-sm">
                  Press Play to Awaken Canvas
                </div>
              </div>

              {/* Audio Track Selector */}
              <TrackSelector
                selectedTrackId={selectedTrack.id}
                onSelectTrack={handleSelectTrack}
              />

              {/* Painting Options Choice Before Playing */}
              <PaintingSelector
                selectedPaintingId={selectedPainting.id}
                onSelectPainting={handleSelectPainting}
                className="pt-1"
              />

              {/* Dynamics Mode Choice Before Playing */}
              <div className="w-full max-w-sm pt-1">
                <div className="text-xs font-sans text-neutral-300 tracking-wide text-center mb-1.5 font-medium">
                  Canvas Dynamics Mode
                </div>
                <div className="grid grid-cols-2 gap-2 w-full p-1 bg-neutral-900/90 border border-white/15 rounded-2xl backdrop-blur-md">
                  <button
                    id="hero-mode-dissolve-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDissolveMode(true);
                    }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-center transition-all cursor-pointer ${
                      dissolveMode
                        ? 'bg-amber-500/25 border border-amber-400/60 text-white shadow-md'
                        : 'hover:bg-white/5 text-neutral-400 hover:text-neutral-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-sans text-xs font-semibold">
                      <Droplets className={`w-3.5 h-3.5 ${dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
                      <span className={dissolveMode ? 'text-amber-200' : 'text-neutral-300'}>Dissolve Mode</span>
                    </div>
                    <span className="text-[11px] text-neutral-300 font-sans leading-tight">
                      Living paint advection, melting &amp; fluid bleeding
                    </span>
                  </button>

                  <button
                    id="hero-mode-nodissolve-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDissolveMode(false);
                    }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-center transition-all cursor-pointer ${
                      !dissolveMode
                        ? 'bg-amber-500/25 border border-amber-400/60 text-white shadow-md'
                        : 'hover:bg-white/5 text-neutral-400 hover:text-neutral-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-sans text-xs font-semibold">
                      <Layers className={`w-3.5 h-3.5 ${!dissolveMode ? 'text-amber-300' : 'text-neutral-400'}`} />
                      <span className={!dissolveMode ? 'text-amber-200' : 'text-neutral-300'}>No Dissolve</span>
                    </div>
                    <span className="text-[11px] text-neutral-300 font-sans leading-tight">
                      Pristine artwork, timeline interpolation, airy dreamy feel &amp; smooth zoom
                    </span>
                  </button>
                </div>
              </div>

              {/* Warning script notice badge before playing music */}
              <div className="pt-1">
                <button
                  id="hero-sensory-warning-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWarningModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 hover:border-amber-300 text-amber-200 text-xs font-sans font-medium transition-all backdrop-blur-md shadow-sm cursor-pointer"
                  title="Review motion, dizziness, and visual sensitivity warning"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-medium">Sensory Notice: Rapid motion &amp; bright shapes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div
          id="error-notification-banner"
          className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-neutral-950/95 border border-red-500/50 text-red-200 text-xs px-4 py-3 rounded-2xl backdrop-blur-xl flex items-center gap-3 shadow-2xl max-w-lg w-[92%] sm:w-auto ring-1 ring-red-500/20 font-sans"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />

          <span className="flex-1 leading-snug">{errorMessage}</span>

          {playbackStatus === 'error' && (
            <button
              id="error-switch-track-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowTrackModal(true);
                setErrorMessage(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-sans text-xs transition-colors shrink-0 cursor-pointer border border-white/15 font-medium"
            >
              Change Track
            </button>
          )}

          {playbackStatus === 'paused' && (
            <button
              id="error-resume-audio-btn"
              onClick={(e) => {
                e.stopPropagation();
                executePlay();
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-sans text-xs transition-colors shrink-0 font-medium cursor-pointer border border-amber-400/30"
            >
              Enable Sound
            </button>
          )}

          <button
            id="error-notification-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setErrorMessage(null);
            }}
            className="ml-1 text-white/50 hover:text-white p-1 cursor-pointer"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <footer
        id="artistic-controls-footer"
        className={`absolute bottom-0 inset-x-0 z-30 p-4 sm:p-6 pointer-events-none transition-all duration-700 ${
          showControls && !isInitialState
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-3xl mx-auto backdrop-blur-xl bg-neutral-950/90 border border-white/20 rounded-2xl p-3.5 sm:p-4 pointer-events-auto space-y-3 shadow-[0_15px_40px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
        >
          {/* Timeline */}
          <div
            id="brushstroke-timeline-container"
            className="group relative w-full h-8 flex items-center cursor-pointer"
            onClick={handleTimelineClick}
            onMouseMove={handleTimelineMouseMove}
            onMouseLeave={() => {
              setIsHoveringTimeline(false);
              setHoverTime(null);
            }}
          >
            <div className="relative w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden transition-all duration-200 group-hover:h-2 border border-white/10">
              <div
                id="timeline-progress-fill"
                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-200 rounded-full transition-all duration-100 relative shadow-sm"
                style={{ width: `${progress}%` }}
              />
            </div>

            {isHoveringTimeline && hoverTime !== null && (
              <div
                id="timeline-hover-time-tooltip"
                className="absolute -top-7 px-2.5 py-1 text-xs font-mono bg-neutral-900 border border-white/20 text-amber-300 font-semibold rounded-lg pointer-events-none -translate-x-1/2 shadow-lg"
                style={{
                  left: `${Math.min(
                    95,
                    Math.max(5, (hoverTime / effectiveDuration) * 100)
                  )}%`,
                }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            <div
              id="timeline-brush-tip"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)] ring-2 ring-black"
              style={{ left: `${progress}%` }}
            />
          </div>

          {/* Control row */}
          <div className="flex items-center justify-between text-neutral-200">
            <div className="flex items-center gap-3">
              <button
                id="footer-play-pause-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePlay(e);
                }}
                className="w-10 h-10 rounded-full bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition-all shadow-md cursor-pointer font-bold"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black ml-0.5" />
                )}
              </button>

              <button
                id="footer-restart-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestart();
                }}
                className="p-2 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                aria-label="Restart song"
                title="Restart from beginning"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div className="flex flex-col pl-2">
                <span className="text-sm font-serif font-medium tracking-wide text-white drop-shadow-sm">
                  {selectedTrack.title}
                </span>

                <div className="flex items-center gap-2 text-xs font-sans text-neutral-300">
                  <span className="text-neutral-200 font-normal">{selectedTrack.artist}</span>
                  <span className="text-neutral-500">&bull;</span>
                  <span className="font-mono tabular-nums text-amber-300 font-medium">
                    {formatTime(currentTime)} / {formatTime(effectiveDuration)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="footer-mode-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleDissolveMode();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-neutral-200 text-xs font-sans font-medium transition-colors cursor-pointer"
                aria-label={`Toggle simulation dynamics mode (currently ${dissolveMode ? 'Dissolve' : 'No Dissolve'})`}
                title={`Dynamics Mode: ${dissolveMode ? 'Dissolve Mode' : 'No Dissolve Mode'} — Click to toggle (Hotkey: D)`}
              >
                {dissolveMode ? (
                  <>
                    <Droplets className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden sm:inline">Dissolve</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden sm:inline">No Dissolve</span>
                  </>
                )}
              </button>

              <button
                id="footer-mute-toggle-btn"
                onClick={handleToggleMute}
                className="p-2 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <button
                id="footer-fullscreen-toggle-btn"
                onClick={handleToggleFullscreen}
                className="p-2 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors hidden sm:inline-flex cursor-pointer"
                aria-label="Toggle Fullscreen"
                title="Fullscreen (F)"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Artwork information */}
      <ArtworkDetails
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        visualParams={currentVisualParamsRef.current}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={handleToggleReducedMotion}
        dissolveMode={dissolveMode}
        onToggleDissolveMode={handleToggleDissolveMode}
        selectedPainting={selectedPainting}
        onSelectPainting={handleSelectPainting}
        selectedTrack={selectedTrack}
      />

      {/* Visual Sensitivity & Dizziness Warning Script/Modal */}
      <SensoryWarningModal
        isOpen={showWarningModal}
        initialReducedMotion={reducedMotion}
        selectedPaintingId={selectedPainting.id}
        onSelectPainting={handleSelectPainting}
        onConfirmPlay={handleConfirmWarning}
        onCancel={() => setShowWarningModal(false)}
      />

      {/* Choose Painting Modal */}
      <PaintingSelectorModal
        isOpen={showPaintingModal}
        onClose={() => setShowPaintingModal(false)}
        selectedPaintingId={selectedPainting.id}
        onSelectPainting={handleSelectPainting}
      />

      {/* Choose Audio Track Modal */}
      <TrackSelectorModal
        isOpen={showTrackModal}
        onClose={() => setShowTrackModal(false)}
        selectedTrackId={selectedTrack.id}
        onSelectTrack={handleSelectTrack}
      />
    </div>
  );
};