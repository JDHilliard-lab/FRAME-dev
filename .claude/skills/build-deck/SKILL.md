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

## What the first brief taught (a resort villas package, Oct 2026)
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

## What five more taught, start to finish (production, install, close-out, Nov 2026)
- **The deck the installers use is the spec deck,** so everything they need is ON the page:
  client code, room, art size, overall size, art type, frame, mat, mount, glass, stretcher
  depth, title, artist (spelled as the artist wants, with affiliation where the client asks),
  year, and a production note. No field left as `TBD`, `N/A`, `0"` or a template label.
- **One code means one place everywhere:** unique across floors (prefix by level, `L2-A01`,
  when the client's numbers repeat), the same spelling in deck, plan, vendor sheet, crate list
  and install guide (the client's format, e.g. `ART-01`, never a house format swapped in).
- **The version, stage, year and project name are right on every page,** cover and footers
  included; never another project's footer.
- **Art type follows how the piece is bought,** and the disclaimer matches: commission wording
  only on commissions. Show an original or object in its true colour and finish, never a
  seller's render. Never show a commission or original before artist, licence and size are
  confirmed.
- **Spec values add up and use one vocabulary:** overall = art + mat + frame; one name per
  product ("Framed Canvas"); the frame deep enough for its mat. Check the image file can print
  at the size before proposing the size.
- **When scope, price or vendor changes,** the next IFS lists what is not going ahead, matches
  the quote's sizes, and carries the new frame codes.
- **Millwork and furniture set the size:** keep a reveal inside a panel, clear lamps, draw the
  furniture with dimension lines; with no client elevation, draw one and mark it
  "ELEVATION REQUIRED".
- **An install guide carries only what is being installed** (on-hold codes off the plan too):
  one page per placement, scaled elevation, sizes, code, ONE hang rule, a centreline label over
  furniture (CL CREDENZA), site instructions in red beside the drawing, a hardware note and a
  general notes page.
- **Healthcare and community art:** the client's content rules are hard rules (no cultural
  shorthand imagery; balance people shown), calm work in public areas, labels planned from the
  start (title, artist and affiliation, size, year).
- **A corporate finance space wants conservative work** (mostly product, some landscape,
  little abstract); photographs never get a deckled edge.
- **Multi-package projects:** packages that run at the same time each get a scope prefix on
  the version (`GR.V4`, `CORR.V1`, `LL-L7.V5`) so no two issued files share a version, and the
  prefix is on the cover, footer and file name alike.

## What the studio's best designers do (twenty more projects, four designers' craft, Nov 2026)
Studied from the designers' own packages; the full write-ups are outside the repo.

**Structure**
- **Skeleton first.** Build the whole deck at the first stage (plans, breakers, one page per
  placement with grey scale walls) and change content per stage; the page the client picks
  in development becomes the IFS page. But a skeleton must never look finished: template
  defaults fail the review at every stage after the wireframe.
- **Large decks need navigation:** level breaker, a key plan by sector, then a plan per sector
  with its code list. A long corridor reads best as a plan strip over the unrolled wall with
  leader lines to each piece; at volume, a catalogue page plus one thumbnail plan per floor.
- **The wall before the pieces.** A set or room opens with a summary of every piece at relative
  scale on one baseline; every piece page also shows its whole group to scale over the
  furniture, with the furniture size and the group's overall size in a dashed box.
- **Many similar rooms become a few rules:** a room-types page (single, triptych, diptych...)
  with standard sizes, and a room-number matrix as the approval document when there are no
  elevations.
- **Frames in a legend up front** with mount photos, built from the frames actually used.
- **Label the stage honestly.** A fully specced deck sent as "development" gets approved as the
  IFS unchecked. An IFS that still carries OPTION labels is a development round.

**Notes on the page (four kinds, each in its fixed place)**
- **Client caveat, red, top right:** a gap ("ELEVATION REQUIRED / Artwork size to be
  confirmed"), a size limit with both sizes ("78"W x 47"H not achievable; suggest 64"W x
  44"H"), a resolution or availability risk. Never a silent blank field: a field still at a
  template value carries a red reason ("FRAME SPEC PENDING CLIENT SAMPLE APPROVAL").
- **Site condition, red, on the drawing:** "Wall finish is fabric - review on site".
- **Trade instruction, black text in a red box with a leader line:** "End film at control
  joint", "GC to paint door and trim to match".
- **Installer note, red bullets on install pages:** name the obstacle and what is measured
  from ("centred on the wall, not including counter tops", "bottom 8" above counter top").
- **A short story caption** under each group (grey italic, 3 to 5 lines: what it is, why here,
  how it is made). Thumbnails are captioned with what they show, never "Reference Image".
- Draft-only status stamps ("WIP / NEED ORIGINAL FILE", "WIP / TO BE SPECCED") are useful
  internally and must never reach a client build.

**Spec maths and data the review checks**
- Overall = art + 2 x mat + 2 x frame face (or reveal); depth from the frame; never blank.
  Overall is the finished size: bleed is a note, never inside a size line.
- The artist field follows the image code; an image swap clears the old artist and title, a
  rotated piece updates the size in its code. `N @` counts equal the letters in the code.
- One code per physical piece: split panels, layers and discs get lettered codes, each with its
  size and file. Codes come from the client's schedule or show TBC in red; never invent one,
  and check codes across scopes.
- "Files built" includes a resolution check at the print size.
- Build each version from what the client last saw (if the PDF was edited at send time, those
  edits go back in first), and say what changed since the last issue.

**Built things, not framed art**
- **Glass film (EGD):** one line per glass leaf, doors included, laid out on the glazing shop
  drawing (keep its notes: V.I.F., equal daylight openings, elevation letters). Per leaf: width
  and height, measured from what, surface, ink layers with percentages, privacy level, panel
  split and seams against the vendor's maximum width. Pane widths add up to the run; the
  elevation height equals the spec height; each privacy name means one opacity spec; every
  drawn leaf has a code and a print file. Show an opacity legend as rendered examples.
- **Wallcovering:** numbered segments matching the plan, panel width, a seam diagram shown to
  the client before quoting, bleed as a note, and an end condition for each side.
- **Fabricated pieces** get a build page: layer legend (material, thickness), flat pattern per
  layer, an exploded render, fixing, finish, weight. No TBD dimensions at IFS.

**Install guides**
- Install pages only (drop concept and narrative pages): general notes, care and a hardware
  page first, then a page for EVERY placement, glass and wallcovering included.
- Per group: letters on each piece, an install sequence ("B, C, A, D"), the typical gap, a
  dashed box with the group's overall size, red centrelines and dimension lines, and a weight.
- **Every height names its datum** from the client's markup (floor, chair rail, panel, counter,
  niche). Print AFF only when the line reaches the floor; keep the client's own rule words.
- Close with the team page, not the proposal's "Thank you for your consideration".

**Fixed text and the final read**
- Cover, subline, footer, file name, city and year come from the project record; flag any other
  project's or city's name on a page, hidden text inside placed files, a footer version that
  differs from the file name, and a cover stage word that differs from the request.
- Converting a deck to the next stage means re-reading every page, not only those in the brief.
- Every designer, the best included, ships these slips; run the review on every deck.

## Rules
- The pool is the only source of art. If a space needs something the pool lacks, leave a
  slot empty and say so; never use a context image as art.
- Image codes print without a file extension.
- Spend the designer's attention well: an honest "unsure between these two" beats a confident
  wrong pick.
