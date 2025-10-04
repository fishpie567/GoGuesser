# GlobeTrek Arena

GlobeTrek Arena is a fully client-side geography guessing game designed for GitHub Pages. Explore 5 rounds of photo-based challenges, drop guesses on an interactive map, climb a multi-stage rank ladder, and customize your explorer profile with avatars and animated nameplates.

## Features

- **Fresh visual identity** – neon-space palette, glassmorphism panels, and responsive layout.
- **Interactive gameplay** – Leaflet world map, photo clues, hints, reveal tools, and precise distance scoring.
- **Ranked & casual modes** – ranked ladder with anti-cheat timeout, casual for relaxed play.
- **Economy & cosmetics** – earn coins from wins to unlock avatars, nameplate decorations, and profile flair.
- **Player safety** – profanity filter for usernames, report center with export, and auto-mod against pinpoint hacking streaks.
- **Offline storage** – localStorage keeps stats, cosmetics, rank, and reports between sessions.

## Development

The project is plain HTML/CSS/JS with no build step. To work locally:

```bash
# From the repository root
python -m http.server 4173
```

Then visit [http://localhost:4173](http://localhost:4173) in your browser.

## Deployment

Because the site is static it can be deployed directly to GitHub Pages. Ensure the repository's Pages settings use the root folder of the `main` branch.
