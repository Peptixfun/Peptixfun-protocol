# Peptix

Curiosity, priced in public.

[![Live site](https://img.shields.io/badge/live-peptix.fun-807dce?style=flat-square)](https://peptix.fun)
![Chain](https://img.shields.io/badge/chain-Solana-382d8b?style=flat-square)

**Chain:** Solana  
**Contract address:** `pending`

## Overview

Peptix is a Solana token for builders who want the lab door left ajar. The site pairs the project story with a live board of the most active Solana pools, so the market is always in view next to the mission.

## Features

- Always-visible contract address slot with click-to-copy (inert until the address is stated)
- Live board: top 10 Solana pools by 24h volume, with price, change, volume, liquidity and per-address copy
- Ticker, skeleton loaders, count-up values and change flashes on every refresh
- Refresh every 60 seconds, paused while the tab is hidden, exponential backoff on failure
- Full reduced-motion support
- Static output, no runtime dependencies

## Links

- Site: https://peptix.fun
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build   # writes dist/
npm run gates   # runs every gate against dist/ and against mutated registers
npm run serve   # preview dist/ on http://localhost:4173
```

Deploy by dragging `dist/` to Cloudflare Pages.

Every external fact lives in `src/register.json` as one record with a state of `stated`, `absent` or `unconfirmed`. Records that are not stated render inert: no value, no link.

## License

MIT
