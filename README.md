# 🦖 Dino Evolution — AI Summon Runner

A twist on the classic Chrome "no internet" dino game, with a cozy **cel-shaded
indie art style** (soft sunset palette, rounded low-poly shapes, dark outlines —
inspired by [messenger.abeto.co](https://messenger.abeto.co/)). Big additions:

1. **Evolution** — your dino grows and transforms the farther you run:
   `Egg → Hatchling → Raptor → T-Rex → Winged Drake → Cyber-Dragon`.
   New stages unlock abilities like **double-jump** and **gliding**.
2. **AI Summon** — type *anything* and an AI conjures a matching hazard onto
   the dino: meteor showers, alien spaceships with bombs, arrow-firing hunters,
   lightning storms, bird swarms, rolling boulders, and more.
3. **AUTO mode** — flip the **AUTO** toggle and hazards rain down automatically,
   getting more frequent as you go. Hands-free chaos.
4. **Full-screen** canvas that fills the window (plus a ⛶ fullscreen button),
   with **all options in a top navbar**: score/stage/best, summon box,
   quick-summon menu, AUTO toggle, and AI settings.

Runs **fully offline** — no build step, no internet required (fitting the theme).

## Play

Just open `index.html` in any modern browser. Or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Action | Keys |
| --- | --- |
| Jump (double-jump once evolved) | `Space` / `↑` / tap canvas |
| Duck | `↓` |
| Glide (Winged Drake+) | hold jump while falling |
| Summon a hazard | type in the navbar summon box + `Enter` |
| Auto-rain hazards | flip the **AUTO** toggle in the navbar |
| Fullscreen | click **⛶** in the navbar |

## The "AI"

By default summons are interpreted by a built-in **offline engine** that maps
your text to the closest hazard (and improvises one for anything unrecognized,
so *literally anything* works).

Optionally, open the **⚙️ AI** menu in the navbar and paste an Anthropic API key
to let Claude freely interpret your text into hazard type / count / intensity.
The key lives only in the browser tab's memory and is never stored.

## Files

- `index.html` — markup, navbar, overlays
- `style.css` — cel-shaded indie styling + navbar
- `game.js` — the full game engine (loop, physics, evolution, hazards, AI summon, auto mode)
