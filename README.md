# nexiliary

Heroes of the Storm auxiliary web app.

From the moment you spawn into a match it tells you what is coming and when, spoken aloud
and shown on a phone or second screen: objective spawns, camp timings, minion waves, talent
tier windows, and short prompts about what to prepare.

The game has no live data available to a web app, so nexiliary works from the match clock
plus a small number of anchor taps, and is explicit about how confident it is in any given
number. It never asserts something it cannot derive.

## Status

Design complete, implementation not started. Architecture design is the next step.

- [`docs/spec.md`](docs/spec.md) - the approved design
- [`docs/features.md`](docs/features.md) - full feature catalogue, v1 and deferred
- [`docs/research.md`](docs/research.md) - timing data, constraints, sources
- [`docs/design/live-view-mockup.html`](docs/design/live-view-mockup.html) - visual direction
- [`CLAUDE.md`](CLAUDE.md) - orientation for AI agents working in this repo
