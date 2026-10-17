# Glyphh Drip

Glyphh Drip plays games and drips over Claude, with sound. Five arcade games
(Missiles, Chickn, Blocks, Rocks, Dash), endless and harder as they go,
your best score to beat; and twenty drips, visual effects like confetti,
fireworks, hearts and a matrix rain. Ask Claude and it makes you new ones.

```
/drip
/drip blocks
/drip confetti
/drip 3 hearts stars
```

Glyphh Drip works in Claude Code on a Mac: in the terminal, or in the desktop
app's Code tab. It's a one-time $5 per machine: `/drip unlock` buys it.

## Requirements

- **macOS** and the **Xcode Command Line Tools**, which bring Swift
  (`xcode-select --install`). Glyphh Drip builds its small overlay program
  with them, to play games and drips over Claude's window or the whole screen.
  Without them, nothing plays: it tells you once what to install.
- **Node.js 18 or newer** (https://nodejs.org). It runs the Drips page: your
  saved drips and the editor.

## Install

In Claude Code, run:

```
/plugin marketplace add glyphh-ai/glyphh
/plugin install glyphh-drip@glyphh
```

To let Glyphh Drip open its page in the desktop app's Browser pane without
asking you each time, allow this call in `~/.claude/settings.json`:

```json
"permissions": {
  "allow": ["mcp__Claude_Browser__preview_start"]
}
```

If you don't, and the app refuses the call, Glyphh Drip asks Claude to open the
page for you.

## Commands

| Command | What it does |
|---|---|
| `/drip` | Opens the Drip pane: every game and drip, Play or Get |
| `/drip <game>` | Starts a game: `/drip blocks`, `/drip missiles` |
| `/drip <recipe>` | Plays a drip, or one of your saved drips by name |
| `/drip list` | Lists the games and the drips |
| `/drip save <name> <recipe>` | Saves a recipe under a name |
| `/drip delete <name>` | Deletes a saved drip |
| `/drip stop` | Stops every effect that keeps playing |
| `/drip page` | Opens the Drips page: your saved drips and an editor |
| `/drip unlock` | Buys Glyphh Drip: $4.99, once, for this machine (Missiles and every drip are free) |
| `/drip key <licence>` | Unlocks Glyphh Drip with a licence bought on another Mac |

`/drip` runs straight away, even while Claude is working.

## The Drip pane

`/drip` (or `/drip list`) opens the **Drip** pane in the side panel: a search,
a filter by type and a table, ten rows a page. Each row is an emoji, the name,
one line, the type, **☆** and **Play**; what the gallery has that isn't on your
Mac yet has **Get** (fetched, then played). The ☆ puts it in the tray above the
prompt, opened by the drip button. Until Glyphh Drip is bought, **Unlock** sits
above the table, and a game other than Missiles opens the payment link.

## Games

Each game plays over Claude's window and takes the keyboard and mouse while
it's on. **Esc** quits, **M** mutes. Each is endless and gets harder as it
goes; your top score is kept and drawn in the next round, to beat.

## Make your own

Ask Claude: "make me a Snake game", "make a snow drip". Glyphh Drip installs
two skills that show Claude how, with a template and a checker. Your games go
in `~/.glyphh/games/<name>/` and your drips in `~/.glyphh/drips/<name>/`, and
they show up on the card straight away.

To share one, send the folder; whoever gets it puts it in their own
`~/.glyphh/games/` or `~/.glyphh/drips/`. A game or drip from someone else is
code that runs on your Mac, so only add ones from people you trust. Glyphh
Drip loads each one with the network blocked.

## The drip button

A **drip** button sits by the prompt: in the terminal, in the hint line
under it; in the desktop app, in the prompt's footer. Press it and a row opens just above the
prompt: **fireworks**, **confetti**, **hearts**, **stars**, and **gunfight**, then your
saved drips, then **■ Stop** while something keeps playing, and **✕** to
close the row. A press plays the effect the way `/drip` does, where your
**Where effects play** setting says. Until Glyphh Drip is bought, the row
says so and **Open Drips** opens the page to buy it. To hide the
button, turn off **Drip button** under Glyphh Drip in `/config`.

## Recipes

A recipe is a few words, in any order:

- **An effect**: `fireworks`, `hearts`, `confetti`, `stars`, `rain`,
  `bubbles`, `sparkle`, `spiral`, `emoji`, `wave`, `thumbsup`, `peace`,
  `cat`, `gunfight`, and the backgrounds `matrix`, `aurora`, `nebula`, `plasma`,
  `fireflies`, `starfield`. Name several and they play one after another.
- **A number from 1 to 10**: how many times to play them. Each effect
  starts 1.5 seconds after the one before.
- **A number between 0 and 1**: how see-through the effect is (`0.4`).
- **`-1`**: keep playing. The effect stays until you play the same
  recipe again, run `/drip stop`, or press Stop in the Drips page. Nothing
  plays for longer than 30 minutes.
- **A saved drip's name**: its effects join in.

`/drip` alone plays fireworks.

## Where effects play

Open `/config` and find **Where effects play** under Glyphh Drip:

- **claude-window** (the default) plays effects over the window Claude is
  running in: the Claude desktop app's window, or the terminal window
  running Claude Code (Ghostty, Terminal, iTerm2, kitty, WezTerm, the
  VS Code and Cursor terminals, and others). The effect sits just above
  that window and moves and resizes with it. Windows in front of Claude,
  menus and notifications stay in front. If Glyphh Drip can't find the window, it
  plays over the screen under the pointer and says so once.
- **fullscreen** plays effects over the whole screen under the pointer,
  above every app and on every Space.

Effects never take the pointer or the keyboard: you can keep working
through them. The first effect over Claude's window or the screen takes a
few seconds longer, while Glyphh Drip builds its small overlay program with
Swift. It's built once and kept in `~/Library/Caches/glyphh-overlay`. Glyphh Drip
needs no extra permission for this: it reads only where Claude's window is
and how big, never what's in it, so macOS doesn't ask for Screen Recording.

Before version 1.1, **claude-window** meant the page in the Browser pane. If
you chose it then, effects now play over Claude's window itself. Version 1.1
had a third choice, **browser-pane**, that played effects in the Drips page;
it's gone since 1.2, and a stored browser-pane plays over Claude's window.

Previews from the Drips page play where every effect plays, and a preview
that keeps playing stops by itself after 12 seconds.


## Sounds

Every effect has its own sound: rockets whistle up and boom in
`fireworks`, a popper goes off in `confetti`, the cat meows, and the
backgrounds play something soft and slow for as long as they stay. Every
sound is made as it plays; none is a recording. To turn them off, open
`/config` and turn off **Sounds** under Glyphh Drip. The faint matrix that plays
while Claude's tools run is always silent.

## The Drips page

`/drip page` opens the page. **Your drips** lists each saved drip with its
recipe and a **Play** button. Search by name or recipe, or click **+ Add**
to make one. Click a drip to edit it:

- **Name**
- **Mode**: **One-shot**, **Counted** (2 to 10 times) or **Persistent
  (toggle on/off)**
- **Effects**: pick one or more; **+ Add effect** adds another
- **Recipe preview**: the recipe your choices make
- **▶ Play** and **■ Stop**, **Save**, **Cancel**, and **Delete** (it asks
  first)

Leaving the editor stops whatever it played.

## Claude can play them too

Claude has two tools: `play_drip` plays a recipe (or stops them), and
`list_drips` lists the effects and your saved drips. Ask Claude to
celebrate and it may.

## Just for fun

Two more rows in `/config`, both off until you turn them on:

- **Confetti after a long turn**: confetti when Claude finishes a turn
  that ran longer than two minutes.
- **Matrix while tools run**: a faint matrix rain while Claude's tools
  run. It goes a moment after the last one finishes. A matrix you started
  yourself is left alone.

## Buying it

Glyphh Drip is a one-time $5 for each machine: no account, no
subscription, no trial. Until you buy it, games and drips don't play
(`/drip list`, `delete` and `stop` still work).

**Buy.** Run `/drip unlock`, or press Play on the card. Stripe's checkout
opens in your browser; pay there, and Glyphh Drip unlocks on its own a few
seconds later, with a notification. **Cancel** in the page stops it waiting.

**Another Mac.** In the Drips page of the Mac you bought it on, press
**Copy licence key**, then on the other Mac run `/drip key <licence>`.

**Offline.** Your licence is checked on your Mac, with a signature, and
Glyphh Drip never calls home once it holds one.

## Where things are kept

Everything stays on your machine. Your saved drips are kept in Claude
Code's store for Glyphh Drip, and so is your licence, with your best scores.
Your own games and drips are in `~/.glyphh/`. The overlay program is kept in
`~/Library/Caches/glyphh-overlay`.

## Security

- The Drips page is served only on `127.0.0.1`, on a random port. Every
  request must carry a random key made for that session. The server
  refuses any other host name or origin, and the page can't be framed by
  another site.
- The session key is never written to a file or a log. The page is opened
  with a one-time address that stops working once it has been used.
- Each effect runs in a sandboxed frame that can run its own animation and
  nothing else: it can't reach the page, your files or the network.
- The overlay is built on your Mac from the source in the plugin
  (`native/overlay.swift`). It shows one effect, ignores the pointer,
  closes when the effect ends or after its time limit (never more than 30
  minutes), and quits if Claude Code goes away. To find Claude's window it
  reads only each window's owner, layer and position, never a title or what
  a window shows.
- Glyphh Drip talks to Glyphh only while you unlock it: it asks glyphh.ai whether
  this install's purchase has gone through, sending the mod's name and a
  random install ID, never your drips or anything about your Mac. The
  licence is never shown to the page or written to a log.

## For developers

This mod is built from the private source repository to the Glyphh mod standard
(`docs/mod-standard.md` there). Its account code in `hooks/licence/` is a copy of the
shared module: change the source and sync, never the copy.

Each drip is one file in `hooks/drips/effects/` that builds its whole
document, listed once in `hooks/drips/effects/index.ts`. A new drip is a new
file there and a line in that list.
