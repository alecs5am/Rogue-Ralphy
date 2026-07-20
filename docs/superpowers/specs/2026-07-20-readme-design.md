# Rogue Ralphy README Design

## Goal

Turn the repository front page into a compact game-jam landing page that makes visitors want to launch the browser demo immediately, while still giving contributors enough information to run it locally.

## Audience and language

- Public GitHub visitors, Build Week participants, players, and potential contributors.
- English throughout.
- Energetic Western-horror tone without long marketing copy.

## Structure

1. Centered title, one-sentence pitch, and the strongest menu screenshot.
2. Prominent links to **Play in browser**, the Ralphy website, and the test room.
3. Short feature list covering arena waves, 36 unique artifacts, weapon synergies, rewards, enemies, and boss fight.
4. Gameplay gallery with two complementary screenshots: active combat and the wide arena.
5. Compact controls table.
6. Minimal local-development commands using the repository's existing package manager and scripts.
7. Build Week note and project links.

## Visual direction

- Reuse committed game screenshots; do not introduce external image hosts or generated placeholder art.
- Make `docs/screenshots/demo-menu-1440x900.png` the hero image.
- Use `demo-final-1440x900.png` and `demo-polished-3440x1440.png` for the gallery.
- Keep decorative HTML small and GitHub-compatible; the README must remain readable in plain Markdown.

## Acceptance criteria

- A first-time visitor can understand the game and reach the live demo without scrolling far.
- All image and navigation links resolve on GitHub.
- Local setup commands match `package.json`.
- No unrelated or user-owned files are committed.
