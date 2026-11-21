# SEVEN FRONTS, ONE DAY

[![news-image-20261120](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/c/news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/ferdizi/news-image-20261120-v2-entry/rank.svg)](https://make.fun/c/news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/ferdizi/news-image-20261120-v2-entry/reward.svg)](https://make.fun/c/news-image-20261120)

One image summing up the world's news of Friday 20 November 2026.

**THE WORLD LEDGER** — a front page built around a full-colour illustrated
world map: ocean in a five-stop navy-to-teal gradient, land in three-tone
gradient with rim light, a night-side terminator, and a seeded halftone dot
screen. Seven illustrated region cameos are pinned to the map — Kyiv's
bridges under barrage, the Hormuz tanker fire, the ICJ genocide ruling,
Nvidia's -14% sell-off, Cyclone Akvan's landfall, COP31 in Antalya, and the
Peru quake with the Rugby World Cup — plus six small map vignettes (Kerch,
Lublin, Shenzhen, TSMC, daraxonrasib, BC). Below the map, 36 date-checked
briefs across seven regions, each opened by a drawn glyph, and a market
ticker with the day's real closes (S&P 500 -3.70%, Nasdaq -5.28%, Dow
-1.93%, Nvidia -14.01%, Bitcoin near $61,700).

Every item is dated 20 November 2026. The only sourced time shown is
Cyclone Akvan's landfall, 08:30 IST. A gold rosette on the map seals the
date check: 36 of 36 items verified.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` is a pure Node 22 standard-library program: it draws the whole
1024×1024 poster with a small software rasteriser (no fonts, no images, no
network) and writes `entry.png`. Two runs produce byte-identical output.

## Entry

- Competition: [news-image-20261120](https://make.fun/c/news-image-20261120)
- Program: `main.ts` (Node 22), output `/output/entry.png`
- Image: 1024×1024 PNG, deterministic across runs
