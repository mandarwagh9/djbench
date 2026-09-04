# DJbench

A benchmark for taste. Six language models are handed the same crowd, the same room and the same
hour, and asked which real records they would play. Listeners hear two sets blind, ride a
crossfader between them, and vote on who read the room.

The models are not making music. They are selecting and sequencing it, which is the part of DJing
being measured.

## How a battle works

Two YouTube players run the same position in two different setlists. A single wall clock drives
both, so deck A track 3 and deck B track 3 always start together no matter how either one buffers.
The crossfader is an equal-power gain law across the two players, exactly like a two-channel mixer:
both sit at about 0.71 in the middle rather than dipping to 0.5.

The video is real, and it is treated as club projection: laid out at quarter scale, blurred there,
then scaled back up by four. That is the same look as a full-size blur for one sixteenth of the
pixels, which matters because blurring two full-viewport playing videos was enough to lock up the
renderer. Playback is also pinned to low quality, since the projection is blurred past recognition
and decoding HD would burn GPU for nothing. "Show video" pulls the scrim back so anyone can confirm
the audio is real.

A vote only unlocks once the listener has actually sat on both channels. Model identity stays
hidden until the ballot is cast, so the benchmark measures the set rather than the brand.

## The roster

| DJ | Model | Where it runs |
| --- | --- | --- |
| Gemini 2.5 Pro | `gemini-2.5-pro` | Vertex AI, global |
| Gemini 2.5 Flash | `gemini-2.5-flash` | Vertex AI, global |
| GPT-OSS 120B | `openai/gpt-oss-120b-maas` | Vertex AI, us-central1 |
| DeepSeek R1 | `deepseek-ai/deepseek-r1-0528-maas` | Vertex AI, us-central1 |
| Qwen3 235B | `qwen/qwen3-235b-a22b-instruct-2507-maas` | Vertex AI, us-south1 |
| Claude Opus 5 | `claude-opus-5` | Authored in-session by the model itself |

Five labs. Every set was produced by the model it is credited to, from the identical prompt in
`scripts/prompt.mjs`. Nothing is attributed to a model that did not write it.

## Pipeline

Curation happens offline, so no YouTube or model API is ever touched on a user request.

```
scripts/gen-vertex.mjs     one setlist per (model x brief) -> data/raw/
scripts/gen-claude.py      the Claude Opus 5 sets, same prompt -> data/raw/
scripts/resolve.py         yt-dlp search, then YouTube Data API videos.list to confirm
                           status.embeddable and no region restriction -> data/track-cache.json
scripts/compile.mjs        joins raw sets to resolved videos -> data/sets.json
```

Search costs no quota. Validation costs one unit per fifty videos. The cache is keyed on
`artist :: title`, so models converging on the same record cost one lookup.

Current catalog: 36 sets, 210 selections, 174 unique videos, 6 rooms, all playable by all 6 models.

Of 185 unique records the models named, 179 resolved to a real embeddable video. The six that did
not are themselves a result: a model that invents records is worse at this job. `compile.mjs`
records the count per set as `dropped`.

## Rooms

The 3AM Warehouse, The Wedding at 10:15 PM, Rooftop at Golden Hour, The Last 30 Minutes,
Main Stage at Peak, The Basement at 1AM. Each one rewards a different skill, from hypnotic depth
to keeping a grandmother and the groomsmen on the same floor.

## Scoring

Elo, K-factor 24, everyone starting at 1500. Beating a highly rated model earns more than beating a
struggling one. Ties move both toward each other. Votes and standings live in Firestore.

## Running it

```bash
npm install
npm run dev
```

Environment:

- `GCP_SA_KEY` (runtime): base64 of a service-account key with `roles/datastore.user`. Without it
  the arena still works end to end and only the tally is unavailable.
- `YOUTUBE_API_KEY` (pipeline only): used by `scripts/resolve.py` for embeddability checks.
- Regenerating setlists additionally needs `gcloud auth application-default login`.

## A note on the waveform

The bar shape is a stable signature derived from the track identity, not an analysis of the audio.
A cross-origin YouTube iframe exposes no audio buffer. The playhead riding across it is real
playback position.
