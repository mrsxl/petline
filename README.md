# petline

A pet for Claude Code, in a band above the prompt in the Desktop app's Code tab (and the VS Code extension). It walks
the band while Claude works, faster as Claude writes faster, and stretches out when the session is idle; beside it,
what Claude is doing right now, and how much of your 5-hour and 7-day subscription usage has gone. The terminal is
left alone: it keeps its own status line.

The pet is a line cat for now. It is drawn from animations (see Develop), so another animal can take its place.

```
      →🐈                          ✎ 输出中   5h      02:14         7d   3天04:00
                                              ━━━━━━──┃─  42%     ━━━━━┃━━━━  91%
```

One row: the cat's lane at its left, taking all the room the rest leaves, then the status and the usage at its right.
Where the band is too narrow for all of it, the reset times go first, and past that the lane takes a line of its own.
The lane starts from the cells the plugin reckons the rest leaves and grows into whatever is left over: the app's
cells are wider than a plugin can tell, so the lane is drawn to fit any width (see `hooks/lane.ts`).
Widths are measured (wide characters and emoji count two cells) against the status's fixed width, so what the row
keeps depends on the band's width alone, never on the state. Both of the cat's poses are drawn at one scale on one
ground line, so a change of pose moves nothing.

The band is one site that every mod drawing there shares: what the mods placed after this one draw (Token Weather Usage,
say) goes below the row, and a mod placed before it draws its own around it.

### The cat

- A line cat with two poses and no number. While the session works (thinking, writing, running a tool or waiting on a
  permission dialog alike) it walks the lane, the room the row leaves free, from the left end to the right and back
  again, turning at each end; so it never changes animation in the middle of a turn. Once the session is idle it turns
  where it stands, hurries home to the left end at three times its pace, and stretches out there. Woken on the way, it
  sets off rightward from wherever it has got to.
- It walks faster as the output streams faster, the way a game speeds up a walk: one walk at four rates (0.8×, 1.1×,
  1.4×, 1.8× from 25, 60 and 100 tokens per second), its legs and its pace together. Each new rate picks up where the
  cat stands and where its legs have got to, so it never jumps or starts its step over. A new rate comes only once the
  speed has stayed in its step two seconds and the walk has held its rate three.
- It walks on a ground of its own: a line across the lane in the cat's ink, where both its poses stand, with tufts of
  green grass and red, spotted mushrooms along it, behind the cat. Where they grow depends on the lane's width alone,
  so a redraw moves none of them; the left end, where the cat stretches out, stays bare. The ground is there only
  while the cat is up: it goes the moment the cat lies down at home. The lane runs right up to the status, whose
  words sit flush right in a width of their own, and the ground carries on into the room they leave, up to the icon:
  the cat turns at the lane's end, so a status that changes its width never moves it. (The animations' own ground, a line that
  scrolled under the cat walking on the spot, is left out: walking the lane, it would walk with it.)
- It walks the lane's real width, turning right at either end, however wide the app makes it. Everything along the
  lane stands at a share of its width, and the cat moves by SMIL across a frame a static CSS scale stretches to that
  width (`100vw` is the width of the lane's own frame), scaled back for the rest of the way. SMIL's clock runs while
  a frame waits out of view; a CSS animation's would only start once the frame came into view, a moment late, and
  the cat would jump at the next swap.
- It never blinks. A new drawing remounts the frame it is drawn in, which is blank while it loads, so the lane has two
  frames at one place: a new drawing loads in the one not shown, pushed far out of view, and comes in a tick later,
  drawn where the cat will be by then and setting off as it comes in. Waking and going home go the same way, a second
  after the session starts or stops working. At home the walking cat gives way to the resting one by opacity: the walk
  shows and hides its own layers by visibility, which would show through a group hidden that way.
- Tokens per second are counted from the reply as it streams (text, thinking and tool arguments, subagents included) and
  calibrated by each reply's usage, smoothed over two seconds. They are an estimate between calibrations.

### Status

- Beside the usage, what the session is doing: a line icon in each state's color, then its words. `✎ 输出中` (green),
  `💭 思考中` (violet), `▣ Bash 12s` for a running tool (amber), `🔒 等你确认 Bash 3s` while a permission dialog is up
  (red), `☾ 空闲` (grey). One width whatever it says, so the lane never moves: a tool's name too long for it is cut,
  the count of the others running beside it going first. Its alt says it all.
- The interface has no event for an approval, so the dialog's status stays until the tool call ends; where another
  plugin answers the permission event first, this one never hears it.
- Every drawing follows the app's light or dark appearance by itself: drawn in its light colors, it carries a style
  that swaps each for its dark one under `prefers-color-scheme: dark`, which the desktop app sets from its own
  Appearance setting (the `theme` setting is the terminal's, so it can't tell). The cat's black lines turn light
  and its white fills the band's grey.
- The meter samples once a second and writes only when something changed: an idle session costs nothing.
- The cat's two animations are on LottieFiles under the Lottie Simple License: see [assets/NOTICE.md](assets/NOTICE.md).

### Usage

- Three looks, which `/usage-style` switches between for every session on this machine (`/usage-style` alone moves
  to the next, `/usage-style 2` or `/usage-style 同心双环` picks one):
  1. 双行仪表 (gauge, the default): the label and the time left over a bar, the percent large beside it. A mark on the
     bar shows how much of the window's time has gone: a bar past it uses faster than time passes.
  2. 同心双环 (rings): both windows in one, the 7-day ring around the 5-hour one, each in its own hue, a line of
     legend for each beside them.
  3. 大字排版 (large type): the percent leads in large type, the label and the time left small beside it, a hairline of
     the share beneath.
- Green under 70%, yellow 70–89%, red 90% and up.
- Each look is an SVG drawn as an image, in the system font (an image reaches none of the app's fonts), its colors
  following the app's appearance as the cat's do. Where nothing draws an SVG (the pane in the terminal) the windows
  are text in your theme's colors.
- The time until each reset reads as hh:mm (`02:14`, `3天04:00`), the same in any time zone. Hover a
  window for the time it resets on this machine's clock (`今天 15:30 重置`, `10月13日 16:00 重置`), in a card the app
  draws above it, moving nothing, the reset times included where the band is too narrow to show them; the rings, a
  drawing of both, have one card for both.
- Hidden when there is no rate-limit data (API-key billing, or before the first reply).
- Redraws when a usage window moves. A reading arrives only with a reply, so each new one is shared through the plugin's store:
  every 30 seconds each session picks up the newest any session on this machine was told of, and moves the countdowns on.
  A window past its reset reads 0%. No git or network calls.
- `/usage-pane` opens the same windows in a pane, one under the other (the bare `/usage` is a built-in command).

## Install

In a Claude Code session:

```
/plugin marketplace add mrsxl/petline
/plugin install petline@petline
```

Pick the user scope: installed there, it loads in the Desktop app's Code tab and the VS Code extension as well. Or
from a shell:

```bash
claude plugin marketplace add mrsxl/petline
claude plugin install petline@petline
```

It needs a Claude Code with mods (the Desktop app's Code tab or the VS Code extension draw it; the terminal does not).
The usage shows on a Claude subscription, from the first reply of a session on.

### From a local clone

```bash
git clone https://github.com/mrsxl/petline
claude plugin marketplace add ./petline
claude plugin install petline@petline
```

A folder marketplace is read in place: edit the files, then run `/reload-plugins` in a session.

To have every session pick up each save by itself, the desktop app's included, load the folder through the
environment instead: in the `env` block of `~/.claude/settings.json` set `CLAUDE_CODE_PLUGIN_DIRS` to the folder and
`CLAUDE_CODE_PLUGIN_DIR_WATCH` to `1`, and disable the copy installed from the marketplace (two copies would draw two
rows). Sessions started after that watch the folder; the plugin's store is then its own file, so `/usage-style`
starts from its default once.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

The data comes from `$.session.usage()`, the `session.measure`, `turn.step`, `tool.call` and `classic.PermissionRequest` events of the [Claude Code mods API](https://code.claude.com/docs/en/plugins/mods/overview).

`hooks/scenes.ts` is generated from `assets/lottie/`: run `python3 tools/serve.py 8771 tools/out`, open
`http://127.0.0.1:8771/tools/export.html` in a browser (it renders each animation frame by frame with lottie-web), then
`python3 tools/lottie_svg.py tools/out hooks/scenes.ts 10`. The converter leaves out a backdrop and the ground line a
figure walks on the spot over, and records where that ground was, so the plugin stands both poses on its own. Every animation is drawn
in paths and SMIL alone, within the 131072 characters an SVG may hold: the Desktop band strips images embedded in an
SVG and runs no script. The converter checks each path's interpolation against every frame, and steps down to fewer
keyframes until a scene fits.

## License

MIT: see [LICENSE](LICENSE). The cat's animations in `assets/lottie/`, and the drawings `hooks/scenes.ts` rebuilds
from them, are free animations from LottieFiles under the Lottie Simple License: see
[assets/NOTICE.md](assets/NOTICE.md).
