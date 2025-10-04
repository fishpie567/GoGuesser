# AtlasQuest Arena

AtlasQuest Arena is a multiplayer-ready geography guessing experience that runs entirely on static hosting such as GitHub Pages. Host lobbies, share room codes with friends, and battle through rounds of globe pinpointing while collecting cosmetics and climbing the rank ladder.

## Features

- **Peer-to-peer multiplayer** – create or join real-time lobbies using PeerJS with host-synchronised rounds, chat, and scoreboards.
- **Ranked and casual play** – toggle ranked ladders, earn wins toward Bronze through Aurora tiers, and gain coins for victories.
- **Cosmetics economy** – unlock avatars and animated nameplates with coins earned from match wins, then equip them in your profile.
- **Player safety tools** – built-in profanity blocking for names, a reporting centre with exportable logs, and an auto-mod that issues one-day ranked suspensions for suspicious precision streaks.
- **Profile progression** – persistent stats, coin balances, cosmetics, and restrictions saved to local storage.

## Getting started

The project is pure HTML/CSS/JS with no build step. To preview locally:

```bash
# From the repository root
python -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173) in a browser.

## Hosting

Because the app is static, deploy by serving the repository contents via any static host (including GitHub Pages). Peer-to-peer connectivity relies on the public PeerJS cloud server, so no extra backend configuration is required.

## Development notes

- Location imagery references publicly accessible Unsplash photographs.
- Multiplayer sync uses PeerJS; replace with a self-hosted PeerServer if you need complete control.
- Reports export as JSON for manual moderation workflows.
