---
name: make-a-game
description: Make a game for Drip, the games and drips plugin for Claude. Use when the person asks to make, build or write a game to play in Claude, over Claude's window, with /drip, or in Drip (for example "make me a Snake game").
user-invocable: false
---

# Make a game for Drip

A Drip game is one folder in `~/.drip/games/<name>/`. Once it's there,
it shows in the Drip pane (`/drip`) and plays with `/drip <name>`, over
Claude's window, beside the built-in games.

## The folder

```
~/.drip/games/<name>/
  game.json     { "title": "Snake", "author": "octocat", "emoji": "🐍", "about": "Eat, grow, don't bite your tail" }
  game.html     the game: one self-contained page
  cover.jpg     its picture: 960×600, made by cover.js
  icon.svg      optional: a 24×24 outline icon, stroke only
```

- `<name>`: lowercase letters, digits and hyphens. It's what the person types
  after `/drip`, so keep it short (`snake`, `space-race`). It can't be a
  built-in game's name: missiles, chickn, blocks, rocks or dash.
- `title`: at most 32 characters. `about`: one short line, at most 60.

- `emoji`: one emoji that says it, its icon in the Drip pane and the tray.

## Who made it, and its cover

- `author`, in the JSON: the person's GitHub login. Find it with
  `gh api user --jq .login`, else `git config github.user`; if neither
  answers, ask them. Never leave `drip` (the template's): that's Drip's
  own, and the check refuses it.
- `cover.jpg`: its picture (for the gallery and our videos), required. Make it with this skill's
  `cover.js` once the page works (below): it plays the page in headless Chrome
  at 960×600 on a background of its own colour and saves the photo. Pick two
  colours that suit it, then **look at the photo**: it should show the game
  mid-play, with nothing written over it. Not right: run it again with a
  different time (the last number, in ms) or colours.

## The page

Start from `template/` in this skill's folder (Dodge, a small finished game)
and change it into the game asked for.

Drip puts its kit in front of the page as `window.drip`:

| | |
| --- | --- |
| `drip.width`, `drip.height` | The size to draw at, in CSS pixels |
| `drip.best` | The player's top score so far: show it, to beat |
| `drip.score(n)` | Post the score whenever it rises |
| `drip.end()` | End the game, after a short end screen (about 2 s) |
| `drip.sfx.tone(freq, seconds, wave, volume, slideTo, delay)` | A sound |
| `drip.sfx.noise(seconds, volume, filterFreq, filterTo, delay)` | A noise burst |
| `drip.sfx.notes([[freq, seconds, delay], ...], wave, volume)` | A tune |
| `drip.muted()` | Whether sound is off |

The kit already handles **Esc** (quits) and **M** (mutes): don't use those keys.

The game must:

- Draw on a transparent background filling the page (a full-window
  `<canvas>`): Drip adds the dimmed, slightly see-through backdrop
  itself, and scales the page to fit Claude's window as it is resized. Lay
  out once at `drip.width` × `drip.height` and read the pointer from
  `clientX`/`clientY` (they stay in the game's pixels).
- Be endless and get harder as it goes, with a score to beat.
- Call `drip.end()` when it's over.
- Use the keyboard and mouse only.
- Be one page with everything inline, at most 512 KB. **No network**: no
  `fetch`, no external scripts, styles, fonts or images. Drip blocks
  the network, so a game that reaches for it breaks.

## Steps

1. Pick the name and title with the person if they didn't say.
2. Copy `template/` to `~/.drip/games/<name>/`, then write the game in
   `game.html` and fill in `game.json` with its title and the person's GitHub
   login as `author`. Add `icon.svg` if a simple outline icon fits.
3. Photograph its cover, from this skill's folder, and look at it:
   ```
   node cover.js ~/.drip/games/<name> '#0e3b4a' '#0f766e' 2600
   ```
4. Check it, from this skill's folder:
   ```
   node check.js ~/.drip/games/<name>
   ```
   Fix whatever it reports, and run it again until it passes.
5. Tell the person it's ready: `/drip list` shows it in the Drip
   pane, and `/drip <name>` plays it.

To share it, the person runs `/drip share <name>`: a pull request to the
gallery, timmetim/drip, from their GitHub account (its `author` must be
them). Once it's merged, anyone can `/drip get <name>`.
