---
name: build-deck
description: Build a Farmboy client deck (concept / moodboard stage) in FRAME from a brief and an image folder, render every page, critique and fix it, and export the PDF. Use when asked to build, draft or rebuild a deck or presentation from a brief.
---

# Build a deck from a brief

You edit a real FRAME project through `tools/frame-driver.js`, and FRAME draws every page and
the PDF. Never draw a page or a PDF yourself: house rules (type, footer, margins, image codes)
only hold if FRAME renders it.

## Inputs (ask for anything missing before starting)
- **Brief**: text or file. Client, designer, spaces, art direction, deliverable stage.
- **Image pool**: a folder of candidate artwork. File name = image code (`ZPK.010.00056.jpg`).
  Optional `pool.csv` (image code, artist, title, medium, size, availability). WITHOUT it you
  know NOTHING about an image but its code and what you can see: never name an artist, title,
  medium or size you were not given.
- **Context** (optional): the designer's renders and boards, inspiration. Context is shown with
  a caption saying what it is (e.g. "Grand Entrance Interior Render"); it is never offered as art.
- Output folder.

## The driver
```
node tools/frame-driver.js start                         # FRAME in headless Chrome
node tools/frame-driver.js sheet <dir> <out/prefix>      # contact sheets of a folder (30 a sheet)
node tools/frame-driver.js call <fn> '<json args>'       # any FRAME_API call
node tools/frame-driver.js render <key|all> <png|dir>    # look at pages
node tools/frame-driver.js pdf <out.pdf>                 # FRAME's real export
node tools/frame-driver.js save <out.json>               # the project file, opens in FRAME
node tools/frame-driver.js stop
```
`{"$file": "/abs/path.jpg"}` in args is that file. Calls: `listPages`, `listTemplates`,
`describePage(key)`, `setProject({name, client, attn, date, code, version, location})`,
`setPages({cover, timeline, understanding, narrative, strategy, frameRec, floorplanKey, spec,
slogan, contacts})`, `addPage({template, after, title, texts, images})`,
`fillPage(key, {texts, images})`, `removePage(key)`, `setContentsEntry(key, {hide, label})`,
`listContacts()`, `setContacts([names])`, `addItem`, `setItem`, `setArtwork`, `hang`.
The cover, understanding, narrative, strategy and slogan pages are filled with `fillPage` too
(`fixed:cover` etc.); the contents page writes itself.
`texts` / `images` are arrays in slot order (null skips) or `{slot: value}` maps. An image is
`{image: {"$file": path}, fit: "whole", caption: "code"}`: `fit: "whole"` shows artwork
uncropped (ALWAYS for artwork; cover-crop only for texture/mood photography), `caption: "code"`
prints the image code (no extension), any other caption string prints as given. `false`
takes an unused slot off the page (never leave a grey box).
Pictures go in with SQUARE corners (house moodboards are straight-edged); `radius: n` only if
the user asks. Caption size: `capPt` is set by hand in FRAME, not by the agent.
`describePage` gives each slot's position and size (fractions of the page): read it before
filling, and put the most important piece in the biggest slot.

## Process
1. **Read the brief** and write down, before touching images: the stage and what it must
   contain, the spaces (in the designer's order), per space the mood words, and the hard rules
   (forbidden subjects, colours, "shoppable, no concept imagery", etc.).
2. **Look at everything.** `sheet` the context and the pool; read every sheet. Note per image:
   code, subject, palette, texture, fit to which space. Reject what breaks a hard rule.
3. **Plan the deck in a short outline** (page by page: template, heading, words, images).
   Concept stage default: cover, contents (Contents template, it fills itself), timeline,
   project understanding, keywords, a divider, ONE page per space, objects / sculptures,
   Good Art Good People, thank you. Switch off standard pages you do not use (`setPages`).
4. **Write the copy** in the house voice: short, plain, confident, no em dashes, no hype words
   the brief did not use. Mood lines are three words with ` / ` (`Bold / Dynamic / Abstract`).
   Project understanding paraphrases the brief, never invents facts about the client.
5. **Build**: `setProject` first (it feeds the cover and every footer), then pages in order.
   Per space: the designer's render with its caption, then 4-7 artworks, `fit: "whole"`,
   `caption: "code"`. Vary pieces between spaces; never repeat an image in the deck.
6. **Review every page**: `render all <dir>` and LOOK at each PNG. Fix: empty grey slots
   (fill or choose a template with fewer), placeholder words left from a template ("SECTION
   SUBHEADING", "Keyword", lorem text), text running off or over images, a weak lead image,
   two near-identical pieces side by side, colour that fights the mood line. Re-render after
   fixing. Two passes minimum.
7. **Export**: `pdf`, and `save` the project so a designer can open and finish it in FRAME.
8. **Report** to the user: the outline, every image used per page, what you could not decide
   (and why), and anything the brief asked for that the pool could not supply.

## What the first brief taught (Caesars Forum Villas, Oct 2026)
- **Artwork pages: `Moodboard (Alt)`** (6 slots, none overlapping: two large, one tall, one
  wide for the designer's render or board, two small). `Moodboard (Float)` and `(Abstract)`
  LAYER their boxes: with whole artworks a picture covers its neighbour's code. Objects and
  sculpture: `Moodboard (Standard)`, slots 5 and 6 removed (too small for an object).
- **Headings are one line in a ~0.29-wide box**: "LIVING + ENTERTAINMENT" and "SCULPTURES FOR
  PEDESTALS" ran into the subheading. Shorten the heading, move the rest to the subheading.
  `Divider (Center)` has the widest heading box.
- A Keywords page puts its whole block on the contents page: `setContentsEntry(key, {hide: true})`.
- Contact-sheet labels are cut short: take file names from the folder, never from a sheet.
- The brief may name people by initials (LM): `listContacts` resolves them; anyone unnamed
  (AD/PM) is a question for the user, not a guess.
- Check the real PDF as well as the renders: render a few PDF pages back to PNG at the end.

## What five real projects taught (V1 to IFS, read from the studio's records, Nov 2026)
Full write-ups live outside the repo (the designer's `FRAME Agent Training` folder); these are the rules.
- **The stages.** V1 concept = themes or moods, NEVER placements: no sizes, no image codes (small
  artist or technique notes only). V2 development = one spec page per placement in floor-plan
  order, each level opened by a breaker built from the client's rendering. IFS = approved pieces
  only, no OPTION headings, real sizes, frame codes that match the approved samples. Ask which
  stage the brief is before building; never put V2 material in a V1.
- **V1 structure that worked:** a themes page (one image and one line per theme), then 5 to 8
  pages per theme with the theme name as the heading and its paragraph small top right on every
  page of that theme. Open SOFT: no dark, sepia or black-and-white pages first.
- **Show framing and matting in concept mockups;** flat unframed images read as stock.
- **Callouts name real specifics** from the brief (local plants, a festival, the building's own
  history), never generic words ("tropical", "urban").
- **The client's words are the rules.** Their codes and plan numbers, gaps included (ART-01, 02,
  04); their room names (a space the plan does not have is a question, never a guess); their
  colour words carried verbatim into the next version.
- **Art only on walls the client dimensioned,** never on walls with fire panels or equipment.
- **A rejected theme is removed everywhere at once,** cover and closing pages included.
- **Revising a deck:** keep page numbers stable (clients answer "the piece on page 9"), leave
  approved pages unchanged, change only the stage word on the cover.
- **Options:** label `OPTION ONE` top right; option 1 can take the spec-page format and the rest
  a summary page with location and image code. A set gets a grouping page before its pieces.
- **Missing drawings get a labelled grey box** ("Floorplan Pending"), never a gap; but an issued
  deck never says "Pending" under a real drawing, and never prints `0"W x 0"H`, "Frame Code,
  Colour" or "N/A". A reference image that is not the art says "Concept imagery only".
- **Every image code carries a house prefix,** a client's own photo included (never a camera
  file name). The studio's old decks printed `.jpg` after codes: do not copy that.
- **Thank You:** the creative director, the AD/PM AND the sales partner named in the handover
  (missed for several versions in two projects). Proofread keywords and the copyright year.
- **Plain words in client copy:** "graphic" or "illustrative", not studio jargon like "vector".
- **By project type:** residential model suites are persona-led (one persona per suite, its name
  and paragraph on every page, a page per room scheme at relative scale, objects on the plan
  too). Corporate archive projects start as a wireframe (grey boxes at true scale, narrative and
  keywords from the brief), stay on THAT site's own history, and show archive photos unedited.
  Local-artist projects give each artist a bio breaker, confirm licensing first, and offer the
  artist beside a house option.

## Rules
- The pool is the only source of art. If a space needs something the pool lacks, leave a
  slot empty and say so; never use a context image as art.
- Image codes print without a file extension.
- Spend the designer's attention well: an honest "unsure between these two" beats a confident
  wrong pick.
