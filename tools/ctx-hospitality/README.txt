HOSPITALITY ELEVATION CONTEXT BLOCKS
53 blocks / 73 views (front + side per catalog), millimetres.

svg/                    one file per view, named from the catalog's CAD filename + _front/_side
                        viewBox = true size in mm, origin top-left, floor = bottom edge
                        width/height attributes in mm, so Illustrator/Inkscape/CAD import at 1:1
frame-context-blocks.js plain script for FRAME: window.FRAME_CONTEXT_BLOCKS = [{id, view, name,
                        category, file, widthMm, heightMm, svg}] (svg = inner markup, wrap in
                        <svg viewBox="0 0 widthMm heightMm">)
sheets/                 one contact sheet per category, common scale, with labels
contact-sheet.html      all categories on one page
Hospitality_Elevation_Context_Block_Library.xlsx  catalog with Status = Drawn and an SVG file(s) column

STYLE: black stroke, one lineweight. stroke-width is set once on the root <g> as 6 (model mm),
which prints about 0.3 mm at 1:20 and 0.12 mm at 1:50; change that one value to retune.
Solid parts fill white so they mask the wall behind them; glass panes are unfilled.
No floor line inside a block (y = 0 is the bottom edge) so blocks sit on your own floor line.
Dimensions are typical placeholders, verify against the specified products.
