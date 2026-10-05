# Icarus

A pixel-art loop in the style of 16-bit console RPGs. He builds wings, flies at the sun, the wax melts and he falls. Each attempt he changes one thing about the wings and climbs for longer. On the fifth attempt the wax holds and he reaches the sun, then the story starts over with a newly generated wing design, so no two cycles look the same.

Everything is drawn in code: the character rig, the wings, the sky, the font and the chiptune. There are no image files and no AI models.

Live on [okohedeki.github.io](https://okohedeki.github.io/).

## Embed it

```html
<div data-icarus></div>
<script src="https://okohedeki.github.io/icarus/icarus.js"></script>
```

The animation fills the width of its container at 16:9.

## Files

- `icarus.js`: the whole thing, one file, no dependencies.
- `index.html`: a demo page.
- `tools/render.js`: renders frames headlessly with Node, for checking art and exporting video.

```bash
node tools/render.js 12.5                 # out/frame-12.5.png at 4x
node tools/render.js --sheet 2,12,40      # out/sheet.png, a contact sheet
node tools/render.js --video 0 140 24     # out/seq/*.png, then turn into a video with ffmpeg
```

`index.html?t=12.5` freezes the story at 12.5 seconds.
