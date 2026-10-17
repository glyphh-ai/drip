# The games to build

Glyphh Drip is $4.99 once. Missiles and every drip are free; the games are
what people pay for, so the library has to hold the game someone already
wants. These eleven join the five there are (Missiles, Chickn, Blocks, Rocks,
Dash). Each is one folder in `games/<name>/` in this repository's format
(README.md), checked with `node scripts/check.js games/<name>`.

Names are our own: the famous ones are trademarks. Never use the original
game's name, logo, characters or art in a title, a page or an icon.

## What every game must be

- **One page, everything inline, at most 512 KB, no network** (README.md).
- **Drawn on a transparent background** over Claude's window: the play area
  can have its own panel, but the page itself is transparent outside it.
  Glyphh Drip adds a dimmed, slightly see-through backdrop and fits the page
  to Claude's window as it is resized.
- **Endless and harder as it goes**, with a score, and `glyphh.score(n)`
  posted as it rises. A puzzle game (Mines, Sudoku, Solitaire, Five) scores
  a won round and starts the next, harder one.
- **A title screen** with the game's name, its controls in one line and
  `BEST <n>` from `glyphh.best`, then play on any key or click.
- **A short end screen** ("Game over: 1,240"), then `glyphh.end()` after
  about two seconds.
- **Sound** through `glyphh.sfx` for the moments that matter (a hit, a clear,
  a loss); nothing constant.
- **Esc and M are the kit's** (quit, mute): no game uses them. P pauses.
- **Keyboard first; mouse where it's natural** (Mines, Solitaire, Merge).
- **Looks like its own game**: its own colours and style, crisp at any size
  (draw with canvas, scale to `glyphh.width` and `glyphh.height`).
- **`icon.svg`**: a 24×24 outline icon, stroke only, that says the game.
- **`cover.jpg`**: its picture, 960×600, a photo of it mid-play
  on a background of its own colour, nothing written over it (README.md,
  The cover). Photograph it with the plugin's
  `skills/make-a-game/cover.js` and look at it.
- **`game.json`**: `title` as below, `author` `"glyphh"` (these are Glyphh
  built), `about` one line of at most 60 characters.

## The eleven

| Folder | Title | Like | The game |
| --- | --- | --- | --- |
| `snake` | Snake | Snake | Arrows steer a snake that grows with each apple; walls and its own tail end it. Speeds up every five apples. |
| `bricks` | Bricks | Breakout | A paddle (←→ or mouse) bounces a ball into rows of bricks; clear the wall for the next, faster one; three balls. |
| `paddle` | Paddle | Pong | Two paddles and a ball. One player against the computer (W/S or ↑↓), or two on one keyboard (W/S and ↑↓). The ball speeds up each rally; first to 7 wins a round. |
| `swarm` | Swarm | Space Invaders, Galaga | Waves of aliens march and dive; ←→ moves, space fires; shields wear down; each wave faster and meaner. |
| `chomp` | Chomp | Pac-Man | A maze of dots and four ghosts; eat every dot to clear the maze; power pellets turn the ghosts; ghosts get faster each maze. Our own maze and characters. |
| `flap` | Flap | Flappy Bird | One key (space, ↑ or click) flaps a bird through gaps in pipes; one point per gap; the gaps narrow. |
| `merge` | Merge | 2048 | Arrows slide numbered tiles on a 4×4 grid; equal tiles merge and double; the score is the sum of merges; over when no move is left. |
| `mines` | Mines | Minesweeper | Click to open, right-click (or F) to flag; numbers count neighbouring mines; each cleared board is bigger, with more mines. |
| `five` | Five | Wordle | Guess a five-letter word in six tries; tiles colour for right letter in the right place, right letter in the wrong place, and not in the word. Endless: a new word after each round; the score counts solved words in a row. Word list inline. |
| `lander` | Lander | Lunar Lander | Thrust (↑) and rotate (←→) to land gently on a pad; fuel is limited; each landing brings rougher ground and smaller pads. |
| `solitaire` | Solitaire | Klondike | Klondike, drawing one. Click or drag cards; double-click sends to the foundations. Score per card to the foundations; a won deal deals the next. |
| `sudoku` | Sudoku | Sudoku | A 9×9 puzzle with one solution; arrows and digits, or click; mistakes show red. Each solved puzzle is harder; score by difficulty and time. |

## Done means

1. `node scripts/check.js games/<name>` passes.
2. The game was played in a browser from title screen to end screen (open
   `game.html` with the kit shim below, or screenshot it with headless
   Chrome), and it's fun for a minute.
3. Nothing else in the repository changed.

A kit shim for trying a page in a browser, pasted at the top of `<body>`
while testing and removed after (the plugin supplies the real kit):

```html
<script>window.glyphh={width:innerWidth,height:innerHeight,best:0,opacity:1,score:function(n){console.log('score',n)},end:function(){console.log('end')},sfx:{tone:function(){},noise:function(){},notes:function(){}},muted:function(){return true}}</script>
```
