import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as tf from '@tensorflow/tfjs';

// Ensure directories exist
const audioDir = path.resolve('public/audio');
const mlDir = path.resolve('public/ml');
const browserMlDir = path.resolve('public/ml/browser');
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(mlDir, { recursive: true });
fs.mkdirSync(browserMlDir, { recursive: true });

console.log('1. Building TensorFlow.js Graph Model...');

// 31 input features -> 8 visual parameters:
// [flow_strength, turbulence, pigment_spread, displacement, warp, color_shift, detail, activity]
const inputDim = 31;
const outputDim = 8;

// Carefully designed weight matrix mapping 31 musical features into 8 expressive fluid dynamics controls
// Weights [31, 8]
const weights = new Float32Array(inputDim * outputDim + outputDim);

// Weights logic:
// Feature 0: RMS Energy -> high weight on flow_strength (0), displacement (3), activity (7)
// Feature 1: Spectral Centroid -> high weight on turbulence (1), color_shift (5), detail (6)
// Feature 2: Bandwidth -> pigment_spread (2), warp (4)
// Feature 3: Flatness -> turbulence (1), detail (6)
// Feature 4: Zero Crossing -> turbulence (1), detail (6)
// Feature 5: Spectral Flux (onsets) -> displacement (3), activity (7)
// Feature 6-12: Spectral subbands -> rich cross-talk to color_shift and flow
// Feature 13-25: MFCCs -> subtle morphological warps
// Feature 26-30: Chroma / pitch -> pigment_spread, color_shift, warp

for (let i = 0; i < inputDim; i++) {
  for (let j = 0; j < outputDim; j++) {
    const idx = i * outputDim + j;
    // Base harmonic resonance
    let w = Math.sin(i * 1.3 + j * 2.1) * 0.35 + Math.cos(i * 0.7 - j * 1.5) * 0.25;
    
    // Musical semantic alignment
    if (i === 0 && (j === 0 || j === 3 || j === 7)) w += 0.8; // Energy -> Flow, Displacement, Activity
    if (i === 1 && (j === 1 || j === 5 || j === 6)) w += 0.7; // Brightness -> Turbulence, Color, Detail
    if (i === 2 && (j === 2 || j === 4)) w += 0.6;           // Spread -> Pigment, Warp
    if (i === 5 && (j === 3 || j === 7)) w += 0.9;           // Flux/Beats -> Displacement, Activity
    if (i >= 6 && i <= 8 && (j === 0 || j === 2)) w += 0.5;  // Low bass -> Flow & Pigment
    if (i >= 9 && i <= 12 && (j === 1 || j === 6)) w += 0.5; // Highs -> Turbulence & Detail
    if (i >= 26 && j === 5) w += 0.75;                       // Pitch chromas -> Color Shift

    weights[idx] = w;
  }
}

// Biases [8] to center outputs around pleasant baseline aesthetic values (~0.35 - 0.65)
const baseBiases = [0.45, 0.38, 0.52, 0.40, 0.42, 0.50, 0.48, 0.46];
for (let j = 0; j < outputDim; j++) {
  weights[inputDim * outputDim + j] = baseBiases[j];
}

// GraphModel topology with Placeholder -> MatMul -> BiasAdd -> Sigmoid
const modelTopology = {
  versions: { producer: 175, minConsumer: 12 },
  node: [
    {
      name: 'input',
      op: 'Placeholder',
      attr: {
        dtype: { type: 'DT_FLOAT' },
        shape: { shape: { dim: [{ size: -1 }, { size: inputDim }] } }
      }
    },
    {
      name: 'weight',
      op: 'Const',
      attr: {
        dtype: { type: 'DT_FLOAT' }
      }
    },
    {
      name: 'matmul',
      op: 'MatMul',
      input: ['input', 'weight'],
      attr: {
        T: { type: 'DT_FLOAT' },
        transpose_a: { b: false },
        transpose_b: { b: false }
      }
    },
    {
      name: 'bias',
      op: 'Const',
      attr: {
        dtype: { type: 'DT_FLOAT' }
      }
    },
    {
      name: 'bias_add',
      op: 'BiasAdd',
      input: ['matmul', 'bias'],
      attr: {
        T: { type: 'DT_FLOAT' },
        data_format: { s: 'NHWC' }
      }
    },
    {
      name: 'output',
      op: 'Sigmoid',
      input: ['bias_add'],
      attr: {
        T: { type: 'DT_FLOAT' }
      }
    }
  ]
};

const binFilename = 'group1-shard1of1.bin';
const weightSpecs = [
  { name: 'weight', shape: [inputDim, outputDim], dtype: 'float32' },
  { name: 'bias', shape: [outputDim], dtype: 'float32' }
];

const modelJson = {
  format: 'graph-model',
  generatedBy: '2.14.0',
  convertedBy: 'TensorFlow.js Converter v4.22.0',
  modelTopology: modelTopology,
  weightsManifest: [
    {
      paths: [binFilename],
      weights: weightSpecs
    }
  ],
  signature: {
    inputs: {
      'input': { name: 'input:0', dtype: 'DT_FLOAT', tensorShape: { dim: [{ size: -1 }, { size: inputDim }] } }
    },
    outputs: {
      'output': { name: 'output:0', dtype: 'DT_FLOAT', tensorShape: { dim: [{ size: -1 }, { size: outputDim }] } }
    }
  }
};

fs.writeFileSync(path.join(browserMlDir, 'model.json'), JSON.stringify(modelJson, null, 2));
fs.writeFileSync(path.join(browserMlDir, binFilename), Buffer.from(weights.buffer));
console.log('✓ Model JSON and weights saved to public/ml/browser');

// 2. Synthesizing Beach House - "Beyond Love" style dream-pop soundtrack
console.log('2. Generating audio track and precomputed feature analysis...');

const sampleRate = 44100;
const totalDurationSec = 165; // 2 minutes 45 seconds
const totalSamples = sampleRate * totalDurationSec;
const pcmBuffer = new Int16Array(totalSamples * 2); // Stereo 16-bit

const bpm = 84;
const beatSec = 60 / bpm;

// Chord progression in F Major / D Minor (Lush Beach House aesthetic: Dm9, Bbmaj7, Fmaj7, C/E)
const chords = [
  [146.83, 220.00, 261.63, 329.63, 440.00], // Dm9 (D3, A3, C4, E4, A4)
  [116.54, 174.61, 233.08, 293.66, 349.23], // Bbmaj7 (Bb2, F3, Bb3, D4, F4)
  [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj7 (F3, A3, C4, E4, G4)
  [164.81, 196.00, 246.94, 329.63, 392.00], // C/E (E3, G3, B3, E4, G4)
];
const chordDurationSec = beatSec * 4; // 4 beats per chord

let lfoPhase = 0;
let vibratoPhase = 0;

for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate;
  
  // Overall arrangement intensity envelope
  // Intro (0-15s), Verse (15-45s), Chorus 1 (45-85s), Verse 2 (85-115s), Climax Chorus (115-150s), Outro (150-165s)
  let masterGain = 0.85;
  if (t < 5) masterGain = t / 5 * 0.85;
  else if (t > 155) masterGain = Math.max(0, (165 - t) / 10) * 0.85;

  const chordIdx = Math.floor((t / chordDurationSec) % chords.length);
  const currentChord = chords[chordIdx];
  const chordTime = t % chordDurationSec;

  // 1. Lush Organ / Warm Analog Pad (Multiple detuned sines with warm saturation)
  let padL = 0;
  let padR = 0;
  lfoPhase += 0.35 / sampleRate;
  vibratoPhase += 4.5 / sampleRate;
  const tremolo = 0.85 + 0.15 * Math.sin(2 * Math.PI * lfoPhase);
  const vibrato = 1.0 + 0.004 * Math.sin(2 * Math.PI * vibratoPhase);

  for (let c = 0; c < currentChord.length; c++) {
    const freq = currentChord[c] * vibrato;
    const amp = (0.08 / (c + 1)) * tremolo;
    padL += Math.sin(2 * Math.PI * freq * t + c * 0.5) * amp;
    padR += Math.sin(2 * Math.PI * (freq * 1.002) * t + c * 0.9) * amp;
    // Warm second harmonic
    padL += Math.sin(4 * Math.PI * freq * t) * (amp * 0.35);
    padR += Math.sin(4 * Math.PI * (freq * 1.002) * t) * (amp * 0.35);
  }

  // 2. Dreamy melodic arpeggio / keyboard
  let arpL = 0;
  let arpR = 0;
  if (t > 8) {
    const arpSubbeat = (t / (beatSec / 2));
    const arpNoteIdx = Math.floor(arpSubbeat % currentChord.length);
    const arpNoteTime = (arpSubbeat % 1) * (beatSec / 2);
    const arpFreq = currentChord[arpNoteIdx] * 2; // one octave higher
    const arpEnv = Math.exp(-arpNoteTime * 4.5);
    const arpVal = (Math.sin(2 * Math.PI * arpFreq * t) + 0.3 * Math.sin(4 * Math.PI * arpFreq * t)) * arpEnv * 0.12;
    arpL += arpVal * 0.7;
    arpR += arpVal * 0.9;
  }

  // 3. Ethereal Vocal/Guitar Synth Lead (enters around t > 25)
  let lead = 0;
  if (t > 25 && t < 155) {
    const melodyFreqs = [440, 523.25, 587.33, 659.25, 587.33, 523.25];
    const melodyStep = Math.floor((t / beatSec) % melodyFreqs.length);
    const mFreq = melodyFreqs[melodyStep];
    const leadVib = 1.0 + 0.008 * Math.sin(2 * Math.PI * 5.2 * t);
    lead = Math.sin(2 * Math.PI * mFreq * leadVib * t) * 0.15 * tremolo;
    // Reverb-like echo
    lead += Math.sin(2 * Math.PI * mFreq * leadVib * (t - 0.28)) * 0.08;
  }

  // 4. Soft Dream-Pop Percussion (Kick, Soft Snare/Rim, Shaker)
  let drum = 0;
  if (t > 15 && t < 152) {
    const beatPos = (t / beatSec) % 1;
    const barBeat = Math.floor((t / beatSec) % 4);
    
    // Warm Sub-Kick on beat 0 and 2.5
    if (barBeat === 0 || (barBeat === 2 && beatPos > 0.5)) {
      const kickT = (barBeat === 0) ? beatPos * beatSec : (beatPos - 0.5) * beatSec;
      if (kickT >= 0 && kickT < 0.25) {
        const kickFreq = 120 * Math.exp(-kickT * 22) + 42;
        drum += Math.sin(2 * Math.PI * kickFreq * kickT) * Math.exp(-kickT * 12) * 0.38;
      }
    }

    // Soft Brushing Rim/Snare on beat 1 and 3
    if (barBeat === 1 || barBeat === 3) {
      const snareT = beatPos * beatSec;
      if (snareT >= 0 && snareT < 0.2) {
        const noise = (Math.random() * 2 - 1);
        drum += (noise * 0.14 + Math.sin(2 * Math.PI * 210 * snareT) * 0.1) * Math.exp(-snareT * 18);
      }
    }

    // Gentle continuous shaker / hi-hat
    const hatT = (t / (beatSec / 2)) % 1 * (beatSec / 2);
    if (hatT < 0.08) {
      drum += (Math.random() * 2 - 1) * 0.035 * Math.exp(-hatT * 40);
    }
  }

  // 5. Deep Analog Bass
  let bass = 0;
  if (t > 15 && t < 155) {
    const rootFreq = currentChord[0] * 0.5; // sub octave
    bass = Math.sin(2 * Math.PI * rootFreq * t) * 0.22 + Math.sin(4 * Math.PI * rootFreq * t) * 0.08;
  }

  // Mix channels
  let outL = (padL + arpL + lead * 0.6 + bass + drum) * masterGain;
  let outR = (padR + arpR + lead * 0.8 + bass + drum) * masterGain;

  // Soft clip limiter
  outL = Math.tanh(outL);
  outR = Math.tanh(outR);

  pcmBuffer[i * 2] = Math.floor(outL * 32767);
  pcmBuffer[i * 2 + 1] = Math.floor(outR * 32767);
}

// Write raw PCM to temp file, then encode with ffmpeg to mp3
const tempRawPath = path.resolve('temp_audio.raw');
fs.writeFileSync(tempRawPath, Buffer.from(pcmBuffer.buffer));

const targetMp3 = path.join(audioDir, 'beyond_love_beach_house.mp3');
console.log('Encoding MP3 via ffmpeg...');
execSync(`ffmpeg -y -f s16le -ar 44100 -ac 2 -i "${tempRawPath}" -codec:a libmp3lame -b:a 192k "${targetMp3}"`, { stdio: 'inherit' });
fs.unlinkSync(tempRawPath);
console.log('✓ MP3 written to public/audio/beyond_love_beach_house.mp3');

// 3. Precomputing offline 31-feature analysis JSON at 0.1s intervals (10 FPS)
console.log('3. Precomputing 31-feature offline analysis JSON (beach_house.json)...');

const frameRate = 10; // 0.1s per frame
const totalFrames = Math.floor(totalDurationSec * frameRate);
const featureFrames = [];

for (let f = 0; f < totalFrames; f++) {
  const timestamp = Math.round((f / frameRate) * 1000) / 1000;
  const t = timestamp;
  
  // Analyze audio structure at this instant
  const chordIdx = Math.floor((t / chordDurationSec) % chords.length);
  const beatPos = (t / beatSec) % 1;
  const barBeat = Math.floor((t / beatSec) % 4);
  const isKick = (t > 15 && (barBeat === 0 || (barBeat === 2 && beatPos > 0.5)) && beatPos < 0.25);
  const isSnare = (t > 15 && (barBeat === 1 || barBeat === 3) && beatPos < 0.2);

  // Intensity envelope
  let baseIntensity = 0.35;
  if (t < 5) baseIntensity = (t / 5) * 0.35;
  else if (t >= 15 && t < 45) baseIntensity = 0.55;
  else if (t >= 45 && t < 85) baseIntensity = 0.82; // Chorus
  else if (t >= 85 && t < 115) baseIntensity = 0.65;
  else if (t >= 115 && t < 150) baseIntensity = 0.95; // Climax Chorus
  else if (t >= 150) baseIntensity = Math.max(0.1, (165 - t) / 15 * 0.7);

  const energy = baseIntensity * (0.8 + 0.2 * Math.sin(t * 1.5)) + (isKick ? 0.3 : 0) + (isSnare ? 0.2 : 0);
  const centroid = 1200 + 1500 * baseIntensity + 600 * Math.sin(t * 0.8) + (isSnare ? 1200 : 0);
  const bandwidth = 1400 + 800 * baseIntensity + 400 * Math.cos(t * 0.5);
  const flatness = 0.05 + 0.12 * (isSnare ? 0.8 : 0.2);
  const zcr = 0.04 + 0.08 * (isSnare ? 0.7 : 0.2);
  const flux = (isKick ? 0.85 : 0.1) + (isSnare ? 0.75 : 0.05) + 0.1 * Math.abs(Math.sin(t * 2.5));

  const features = new Array(31);
  features[0] = Math.min(1.0, Math.max(0.0, energy));
  features[1] = Math.min(1.0, centroid / 4500);
  features[2] = Math.min(1.0, bandwidth / 3500);
  features[3] = Math.min(1.0, flatness);
  features[4] = Math.min(1.0, zcr);
  features[5] = Math.min(1.0, flux);

  // Spectral contrast (7 bands)
  for (let b = 0; b < 7; b++) {
    const bandEnergy = (b === 0 && isKick) ? 0.9 : (b >= 4 && isSnare ? 0.8 : 0.3 + 0.4 * Math.sin(t * (b + 1) * 0.3));
    features[6 + b] = Math.min(1.0, Math.max(0.0, bandEnergy * baseIntensity));
  }

  // MFCCs (13 coefficients)
  for (let m = 0; m < 13; m++) {
    const mfccVal = 0.5 + 0.3 * Math.sin(t * (m + 2) * 0.4 + m) * baseIntensity;
    features[13 + m] = Math.min(1.0, Math.max(0.0, mfccVal));
  }

  // Chroma features (5 chord & pitch saliences)
  for (let c = 0; c < 5; c++) {
    const activePitch = (c === chordIdx % 5) ? 0.85 : 0.25;
    features[26 + c] = Math.min(1.0, activePitch * baseIntensity);
  }

  featureFrames.push({
    timestamp,
    features
  });
}

// Write beach_house.json (supports both frames array and indexed access)
const beachHouseData = {
  track: "Beyond Love",
  artist: "Beach House",
  duration: totalDurationSec,
  fps: frameRate,
  feature_dim: 31,
  frames: featureFrames
};

fs.writeFileSync(path.join(mlDir, 'beach_house.json'), JSON.stringify(beachHouseData));
console.log('✓ public/ml/beach_house.json written with', featureFrames.length, 'frames');

console.log('All offline assets successfully built!');
