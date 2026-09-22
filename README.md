# Nutcracker

**Nutcracker** is a personal experimental audiovisual artwork.

The concept is:

> A painting listens to music and gradually morphs, flows, dissolves, expands, and reforms as the music progresses.  

The visual effects are algorithm-driven and synchronized with audio playback. Each track has a dedicated precomputed feature JSON containing time-based audio analysis and target painting parameters.  

As the song plays, the application selects the corresponding feature frame based on the current playback time and uses its parameters to drive the fluid painting simulation.

The system therefore produces deterministic, track-specific visual behavior rather than relying on random effects or manually animated sequences.


---

## Components  

- React / TypeScript — application and UI state.  
- Precomputed Feature JSON — provides deterministic, track-specific visual parameters.  
- TimelineLoader — loads and interpolates timeline data where applicable.  
- TensorFlow.js — provides a fallback inference path for frames without precomputed target values.  
- Three.js — manages the WebGL rendering environment.  
- FluidMesh — performs the GPU-based fluid/pigment simulation.  
- Cloudflare CDN/Worker — serves the audio assets.


## Architecture

**Data flow of the Song**
  → MP3 playback
  → audio.currentTime
  → track-specific features.json
  → matching precomputed frame
  → target painting parameters
  → Three.js/WebGL fluid simulation
  → real-time visual artwork

```text
                         ┌──────────────────┐
                         │   User selects   │
                         │      a song      │
                         └────────┬─────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
                 ▼                                 ▼
        ┌─────────────────┐              ┌────────────────────┐
        │   Audio (.mp3)  │              │ Track Features     │
        │                 │              │ /public/ml/*.json  │
        │ Cloudflare CDN  │              │                    │
        └────────┬────────┘              │ Precomputed frames │
                 │                       │ + target controls  │
                 ▼                       └─────────┬──────────┘
        ┌─────────────────┐                        │
        │ HTML5 Audio     │                        │
        │                 │                        │
        │ currentTime     │────────────────────────┘
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────────┐
        │ Time → Frame Lookup │
        │                     │
        │ audio.currentTime   │
        │        ↓            │
        │ matching frame      │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ Painting Parameters │
        │                     │
        │ flow / turbulence   │
        │ spread / displacement│
        │ warp / color shift  │
        │ detail / activity   │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ Three.js + WebGL    │
        │                     │
        │ FluidMesh / GPU     │
        │ fluid simulation    │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Real-Time Artwork  │
        │  Audio-synchronized │
        │  fluid visuals      │
        └─────────────────────┘

