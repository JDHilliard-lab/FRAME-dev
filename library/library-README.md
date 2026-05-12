# Bundled Frame Swatch Library

The app loads a baseline library of frame swatches at startup so designers don't
have to "Sync Folder" every session. Anyone on the team can add to it just by
dropping image files into the right folder and pushing.

## Folder structure

Put swatches in `library/<vendor>/<collection>/<filename>`:

```
library/
├── Larson-Juhl/
│   ├── Asbury/
│   │   ├── L100ABC_1.25.png
│   │   └── L101DEF_2.png
│   └── Brimfield/
│       └── B5500_0.75.jpg
├── MICH/
│   └── Floaters/
│       ├── MICH-301-22_1.5_0.5.jpg
│       └── MICH-306-30_1.75_0.625.jpg
└── In-House/
    └── Custom/
        └── Walnut_Modern_2.5.png
```

## Filename conventions

### Regular profile frames (2 numeric pieces)

`<code>_<railWidth>.<ext>`

| Filename                  | Code           | Rail Width |
|---------------------------|----------------|------------|
| `L100ABC_1.25.png`        | `L100ABC`      | 1.25       |
| `Black_Modern_2.png`      | `Black Modern` | 2          |
| `Walnut.png`              | `Walnut`       | 1.25       |

The last underscore-separated piece is the rail width. Everything before it is
the frame code (with underscores becoming spaces). If there's no numeric suffix,
the whole base name is the code and width defaults to 1.25".

### Floater profile frames (3 numeric pieces)

`<code>_<railWidth>_<faceWidth>.<ext>`

| Filename                       | Code           | Rail Width | Face Width | Auto Inset |
|--------------------------------|----------------|------------|------------|------------|
| `MICH-301-22_1.5_0.5.jpg`      | `MICH-301-22`  | 1.5        | 0.5        | 0.75       |
| `MICH-306-30_1.75_0.625.jpg`   | `MICH-306-30`  | 1.75       | 0.625      | 0.875      |

The third numeric piece is the **canvas face width** — the visible white edge of
the wrapped canvas you see from the front, taken from the manufacturer's spec
sheet (e.g. the ½" callout on the Series 301 line-art).

When you select a floater swatch in the app, the **floater inset** is computed
automatically:

```
inset = faceWidth + 0.25"   (0.25" = studio-standard shadow reveal)
```

You can still tweak the Inset value per frame in the dashboard if a specific
project needs something non-standard.

### Floater detection

Floater swatches must live in a collection folder whose name contains the word
"Floater" (case-insensitive). When you pick a swatch from such a collection,
the app:

1. Auto-switches the row's Product to "Framed Canvas (Floater)"
2. Disables the mat panel (floaters don't take mats)
3. Shows the canvas settings panel
4. Computes the floater inset from the swatch's face width (if encoded)

A 3-piece filename outside a Floater collection still works — the face width
just won't be auto-applied because the product type stays as a regular Framed
Art and the inset isn't used. The encoded face width gets stored anyway in case
you change the product manually.

### Image format

PNG, JPG, WEBP, or SVG. PNG is recommended for swatches with transparency.
Aim for ~512px on the long side — big enough to look sharp when tiled along a
large frame, small enough to keep page load fast.

For floater swatches, the image content should be a strip showing the frame's
visible-from-front face: rail edge → canvas face → shadow gap. The width of the
swatch image should equal `faceWidth + 0.25"` worth of frame profile.

## How the manifest gets built

A GitHub Action (`.github/workflows/build-library-manifest.yml`) runs on every
push that touches the `library/` folder. It walks the tree, parses filenames,
and writes `library-manifest.json` at the repo root. The app fetches that file
on startup and populates the Vendor → Collection → Frame dropdowns.

You don't edit the manifest by hand. Just push image files; the action does
the rest.

### Building the manifest locally (optional)

If you want to test before pushing:

```bash
node scripts/build-library-manifest.js
```

This writes `library-manifest.json` based on whatever's currently in `library/`.
