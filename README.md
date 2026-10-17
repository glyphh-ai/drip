# Glyphh Drip: games and drips

Every game and drip for [Glyphh Drip](https://github.com/glyphh-ai/glyphh), the
plugin that plays games and visual effects over Claude. The plugin ships with
Missiles and its drips; everything here shows in its Drip pane, each marked
Glyphh built or @author, and is fetched when it's first played (or with
`/drip get <name>`). `/drip share <name>` sends one of yours here as a pull
request. Make your own
by asking Claude ("make me a Snake game"), then open a pull request here to
share it with everyone.

| | |
| --- | --- |
| `games/<name>/` | One game: `game.json`, `game.html`, `cover.jpg`, optional `icon.svg` |
| `drips/<name>/` | One drip: `drip.json`, `drip.html`, `cover.jpg`, optional `icon.svg` |
| `templates/` | A small working game (Dodge) and drip (Bubbles) to start from |
| `scripts/check.js` | `node scripts/check.js games/snake` checks a folder the way the plugin does |
| `scripts/authors.js` | CI's check that a pull request's folders are its opener's |
| `MAINTAINERS` | Who may publish as `glyphh` (Glyphh built) |
| `index.json` | What `/drip get` and the Drip pane read; written by CI, never by hand |

## A game

```
games/snake/
  game.json     { "title": "Snake", "author": "octocat", "emoji": "🐍", "about": "Eat, grow, don't bite your tail" }
  game.html     the game: one self-contained page
  cover.jpg     its picture (or cover.png)
  icon.svg      optional: a 24×24 outline icon
```

The folder's name is the game's name (`/drip snake`): lowercase letters,
digits and hyphens. `title` is at most 32 characters, `about` at most 60.

`game.html` is a complete page on a transparent background filling the
window. Before it loads, Glyphh Drip puts its kit in front of it as
`window.glyphh`:

| The kit | What it is |
| --- | --- |
| `glyphh.width`, `glyphh.height` | The overlay's size, in CSS pixels |
| `glyphh.best` | The player's top score so far (0 the first time): draw it to beat |
| `glyphh.score(n)` | Posts the score as it rises; the top one is kept |
| `glyphh.end()` | Ends the game: call it after a short end screen (about 2 s) |
| `glyphh.sfx.tone(freq, seconds, wave, volume, slideTo, delay)` | A sound, made in the page |
| `glyphh.sfx.noise(seconds, volume, filterFreq, filterTo, delay)` | A noise burst |
| `glyphh.sfx.notes([[freq, seconds, delay], ...], wave, volume)` | A tune |
| `glyphh.muted()` | Whether sound is off |

The kit handles **Esc** (quits) and **M** (mutes); a game must not use those
keys. A game is endless and gets harder as it goes, with a score to beat; it
ends itself with `glyphh.end()`; keyboard and mouse only.

## A drip

```
drips/snow/
  drip.json     { "title": "Snow", "author": "octocat", "kind": "one-shot" }
  drip.html
  cover.jpg     or cover.png
  icon.svg      optional
```

`kind` is `one-shot` (plays once and ends: call `glyphh.end()` when done, and
within 15 seconds regardless) or `loop` (keeps playing until stopped, drawn at
`glyphh.opacity`). A drip never takes the pointer: clicks go through to
Claude. The kit is the same as a game's, without `best` and `score`.

`emoji` (optional) is one emoji: its icon in the Drip pane and the tray
(a game without one shows 🎮, a drip ✨). `about` is one line, at most 60
characters: drips may have one too.

## Who made it

`author` is the maker's GitHub login. The Drip pane shows it as "@octocat";
Glyphh's own carry `glyphh` and show as **Glyphh built**. A pull request's
folders must be its opener's: CI refuses one that names anyone else, changes
someone else's folder, or uses `glyphh` (only the logins in `MAINTAINERS`
may).

## The cover

Every game and drip has a cover, a picture of it for the gallery and our videos: `cover.jpg` or
`cover.png`, 16:10, 480×300 to 1920×1200 (960×600 is right), at most 300 KB.
A photo of it mid-play on a background of its own colour, with nothing
written over it. The plugin's skills make one with headless Chrome
(`node cover.js <folder>`).

## The rules

`scripts/check.js` enforces them, and so does the plugin:

- One page, at most 512 KB, everything inline. **No network**: no `fetch`,
  no external scripts, styles, fonts or images. Glyphh Drip loads every page
  with the network blocked, so one that reaches for it breaks.
- A transparent background, filling the page.
- An `author` that is a GitHub login, and a cover as above.
- An `icon.svg` of at most 16 KB, with no scripts or links.

## Contributing

**From Glyphh Drip:** `/drip share <name>` checks your game or drip, forks
this repository under your GitHub account, adds it and opens the pull
request. Its `author` must be your login. It needs the GitHub command-line tool, signed in (`brew install gh`,
then `gh auth login`).

**By hand:**

1. Make the game or drip (ask Claude, or start from `templates/`).
2. Put it in `games/<name>/` or `drips/<name>/`, with your GitHub login as
   `author` and its cover, and run
   `node scripts/check.js games/<name>` until it passes.
3. Open a pull request.

Either way, CI runs the check; we play it; it's merged, and `index.json` is
updated. From then on it's in everyone's Drip pane.

By contributing you license your work under this repository's MIT licence.
A game or drip is code that runs on players' Macs: keep it to what it says
on the tin.
