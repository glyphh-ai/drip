# Drip

Drip plays arcade games and drips (visual effects with sound) over Claude's
window. It's a plugin for **Claude Code on a Mac**: the `claude` command in a
terminal, the Code tab of the Claude desktop app, or Claude Code in VS Code.
Missiles and twenty drips (confetti, fireworks, hearts, a matrix rain) come
with it; the gallery here has Blocks, Bricks, Snake, Solitaire, Sudoku and
more. Ask Claude and it makes you new ones. Everything is free.

```
/drip              the Drip pane: every game and drip
/drip snake        play a game (Esc quits, M mutes)
/drip confetti     play a drip
/drip 3 hearts stars
```

## Install

It needs macOS with the Xcode Command Line Tools (`xcode-select --install`,
for the overlay it draws in) and Node.js 18 or newer. In Claude Code:

```
/plugin marketplace add timmetim/drip
/plugin install drip@drip
```

[plugins/drip/README.md](plugins/drip/README.md) has the rest: every
command, recipes, the settings in `/config` and where things are kept.
Coming from 1.x, when Drip had another name and marketplace: uninstall that
one, install as above, and your saved drips, stars, best scores and own games
and drips come over the first time 2.0.0 starts.

## What's here

| | |
| --- | --- |
| `plugins/drip/` | The Claude Code plugin; `.claude-plugin/marketplace.json` makes this repository its marketplace |
| `games/<name>/` | One game: `game.json`, `game.html`, `cover.jpg`, optional `icon.svg` |
| `drips/<name>/` | One drip: `drip.json`, `drip.html`, `cover.jpg`, optional `icon.svg` |
| `templates/` | A small working game (Dodge) and drip (Bubbles) to start from |
| `scripts/check.js` | `node scripts/check.js games/snake` checks a folder the way the plugin does |
| `scripts/authors.js` | CI's check that a pull request's folders are its opener's |
| `MAINTAINERS` | Who may publish as `drip` (Drip built) |
| `index.json` | What `/drip get` and the Drip pane read; written by CI, never by hand |
| `docs/games.md` | The games still to build, and what done means |

Every game and drip in `games/` and `drips/` shows in the Drip pane, marked
Drip built or @author, and is fetched when it's first played (or with
`/drip get <name>`).

## Make your own

Ask Claude: "make me a Snake game", "make a snow drip". The plugin's two
skills (make-a-game, make-a-drip) show Claude how, with a template, a cover
maker and a checker. Your games go in `~/.drip/games/<name>/` and your drips
in `~/.drip/drips/<name>/`, and show in the Drip pane straight away. What
follows is the format, if you'd rather write one by hand.

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
window. Drip puts it on a dimmed, slightly see-through backdrop and
keeps it fitted to Claude's window as that is resized (pointer coordinates
stay in the game's own pixels). Before it loads, Drip puts its kit in front of it as
`window.drip`:

| The kit | What it is |
| --- | --- |
| `drip.width`, `drip.height` | The overlay's size, in CSS pixels |
| `drip.best` | The player's top score so far (0 the first time): draw it to beat |
| `drip.score(n)` | Posts the score as it rises; the top one is kept |
| `drip.end()` | Ends the game: call it after a short end screen (about 2 s) |
| `drip.sfx.tone(freq, seconds, wave, volume, slideTo, delay)` | A sound, made in the page |
| `drip.sfx.noise(seconds, volume, filterFreq, filterTo, delay)` | A noise burst |
| `drip.sfx.notes([[freq, seconds, delay], ...], wave, volume)` | A tune |
| `drip.muted()` | Whether sound is off |

The kit handles **Esc** (quits) and **M** (mutes); a game must not use those
keys. A game is endless and gets harder as it goes, with a score to beat; it
ends itself with `drip.end()`; keyboard and mouse only.

## A drip

```
drips/snow/
  drip.json     { "title": "Snow", "author": "octocat", "kind": "one-shot" }
  drip.html
  cover.jpg     or cover.png
  icon.svg      optional
```

`kind` is `one-shot` (plays once and ends: call `drip.end()` when done, and
within 15 seconds regardless) or `loop` (keeps playing until stopped, drawn at
`drip.opacity`). A drip never takes the pointer: clicks go through to
Claude. The kit is the same as a game's, without `best` and `score`.

`emoji` (optional) is one emoji: its icon in the Drip pane and the tray
(a game without one shows 🎮, a drip ✨). `about` is one line, at most 60
characters: drips may have one too.

## Who made it

`author` is the maker's GitHub login. The Drip pane shows it as "@octocat";
Drip's own carry `drip` and show as **Drip built**. A pull request's
folders must be its opener's: CI refuses one that names anyone else, changes
someone else's folder, or uses `drip` (only the logins in `MAINTAINERS`
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
  no external scripts, styles, fonts or images. Drip loads every page
  with the network blocked, so one that reaches for it breaks.
- A transparent background, filling the page.
- An `author` that is a GitHub login, and a cover as above.
- An `icon.svg` of at most 16 KB, with no scripts or links.

## Contributing

Games and drips are welcome, and so are fixes to the plugin (run its tests
and validation as CI does: with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`,
`claude plugin test plugins/drip` and `claude plugin validate plugins/drip`).

**A game or drip, from Drip:** `/drip share <name>` checks your game or drip, forks
this repository under your GitHub account, adds it and opens the pull
request. Its `author` must be your login. It needs the GitHub command-line tool, signed in (`brew install gh`,
then `gh auth login`).

**A game or drip, by hand:**

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
