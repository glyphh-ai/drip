---
name: make-a-drip
description: Make a drip (a visual effect with sound over Claude's window) for Glyphh Drip, the games and drips plugin for Claude. Use when the person asks to make, build or write a drip, an effect or an animation to play over Claude with /drip or in Glyphh Drip (for example "make me a snow drip").
---

# Make a drip for Glyphh Drip

A Glyphh Drip drip is one folder in `~/.glyphh/drips/<name>/`. Once it's there,
it shows on the Drips tab of `/drip`, plays with `/drip <name>`, and Claude can
play it with the `play_drip` tool.

## The folder

```
~/.glyphh/drips/<name>/
  drip.json     { "title": "Snow", "kind": "one-shot" }
  drip.html     the drip: one self-contained page
  icon.svg      optional: a 24×24 outline icon, stroke only
```

- `<name>`: lowercase letters, digits and hyphens, short (`snow`,
  `rainbow-rain`). It can't be a built-in drip's name (`/drip list` lists them).
- `title`: at most 32 characters.
- `kind`: `one-shot` plays once and ends; `loop` keeps playing until stopped
  (`/drip -1 <name>`, then `/drip stop`).

## The page

Start from `template/` in this skill's folder (Bubbles, a small one-shot) and
change it into the drip asked for.

Glyphh Drip puts its kit in front of the page as `window.glyphh`:

| | |
| --- | --- |
| `glyphh.width`, `glyphh.height` | The size to draw at, in CSS pixels |
| `glyphh.opacity` | For a `loop`: how strongly to draw, 0 to 1 |
| `glyphh.end()` | A `one-shot` calls it when it's done |
| `glyphh.sfx.tone(...)`, `glyphh.sfx.noise(...)`, `glyphh.sfx.notes(...)` | Sounds, as in a game |
| `glyphh.muted()` | Whether sound is off |

The drip must:

- Draw on a transparent background over the whole page, so Claude shows
  through. It never takes the pointer: clicks go through to Claude.
- As a `one-shot`, last a few seconds and call `glyphh.end()`. Glyphh Drip
  ends any one-shot after 15 seconds regardless.
- As a `loop`, keep going smoothly, drawn at `glyphh.opacity`.
- Be one page with everything inline, at most 512 KB. **No network**: no
  `fetch`, no external scripts, styles, fonts or images.

## Steps

1. Pick the name, title and kind with the person if they didn't say.
2. Copy `template/` to `~/.glyphh/drips/<name>/`, then write the drip in
   `drip.html` and fill in `drip.json`.
3. Check it, from this skill's folder:
   ```
   node check.js ~/.glyphh/drips/<name>
   ```
   Fix whatever it reports, and run it again until it passes.
4. Play it with the `play_drip` tool to show the person, and tell them
   `/drip <name>` plays it any time.

To share a drip, the person sends the folder to someone, who puts it in their
own `~/.glyphh/drips/`.
