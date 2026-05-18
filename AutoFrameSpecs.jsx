// AutoFrameSpecs.jsx — Simplified Edition (CSV-driven)
//
// Reads pre-formatted "Application" and "Matboard Description" columns from
// the Frame Builder Tool's CSV export, so this script no longer has to know
// anything about product types, mat configurations, float mount, or torn
// edges. The single source of truth lives in the Frame Builder Tool's
// `buildSpecStrings()` function — change wording there, both the CSV and
// the InDesign output update consistently.
//
// Required CSV columns:
//   - Image_Filename   (last column; matches the InDesign-placed image's filename)
//   - PRODUCT          (used as fallback if Application is missing)
//   - Frame Code, Frame (Width), Mat Top, Mat Right, Mat Bottom, Mat Left
//   - Mat Code, Mat 2 Reveal
//   - Art Size W, Art Size H, Overall Width, Overall Height
//   - Application      (NEW — pre-formatted product type for the spec block)
//   - Matboard Description (NEW — pre-formatted matboard description)

#target indesign

// ==========================================
// 🛠️ TYPOGRAPHY SETTINGS 🛠️
// ==========================================
var FONT_NAME = "Messina Serif";
var FONT_SIZE = 11;
var LINE_SPACING = 18;
// ==========================================

function main() {
    if (app.documents.length === 0) {
        alert("Please open an InDesign document first.");
        return;
    }

    var doc = app.activeDocument;
    var sel = app.selection;

    if (sel.length === 0) {
        alert("Please select one or more framed images first.");
        return;
    }

    // --- 1. POP-UP UI DIALOG ---
    var win = new Window("dialog", "Frame Spec Configuration");
    win.orientation = "column";
    win.alignChildren = ["left", "top"];
    win.margins = 20;

    win.add("statictext", undefined, "Select Output Measurement:");

    var radioGroup = win.add("group");
    radioGroup.orientation = "row";
    var btnIn = radioGroup.add("radiobutton", undefined, "Inches (in)");
    var btnCm = radioGroup.add("radiobutton", undefined, "Centimeters (cm)");
    var btnMm = radioGroup.add("radiobutton", undefined, "Millimeters (mm)");
    btnCm.value = true;

    var buttonGroup = win.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignment = ["right", "top"];
    buttonGroup.margins.top = 10;
    var okBtn = buttonGroup.add("button", undefined, "OK", { name: "ok" });
    var cancelBtn = buttonGroup.add("button", undefined, "Cancel", { name: "cancel" });

    if (win.show() !== 1) return;

    var OUTPUT_UNIT = btnIn.value ? "in" : (btnMm.value ? "mm" : "cm");

    // --- 2. SETUP CHARACTER STYLE FOR GREY DOTS ---
    var greyColor;
    try {
        greyColor = doc.colors.itemByName("Light Grey Leader");
        greyColor.name;
    } catch (e) {
        greyColor = doc.colors.add({
            name: "Light Grey Leader",
            model: ColorModel.PROCESS,
            space: ColorSpace.CMYK,
            colorValue: [0, 0, 0, 30]
        });
    }

    var leaderStyle;
    try {
        leaderStyle = doc.characterStyles.itemByName("Grey Leader");
        leaderStyle.name;
    } catch (e) {
        leaderStyle = doc.characterStyles.add({
            name: "Grey Leader",
            fillColor: greyColor
        });
    }

    // --- 3. LOAD CSV ---
    var csvFile = File.openDialog("Select your exported RFI_Project_Tracker.csv", "*.csv");
    if (!csvFile) return;

    csvFile.open("r");
    var csvContent = csvFile.read();
    csvFile.close();

    // --- 4. PARSE CSV ---
    var lines = csvContent.split('\n');
    var headerIndex = -1;

    for (var i = 0; i < lines.length; i++) {
        // Detect the data table header. Phase A renamed columns: "Item Code" → "ITEM CODE",
        // and dropped "LEVEL" from the visible columns. The combination of "ITEM CODE"
        // and "PRODUCT" reliably identifies the header row across both old and new CSVs.
        if (lines[i].indexOf("ITEM CODE") > -1 && lines[i].indexOf("PRODUCT") > -1) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        alert("Could not find the table headers in the CSV. Make sure you selected the right file.");
        return;
    }

    function parseCSVLine(lineStr) {
        // CSV-RFC-style parser. Two important behaviors:
        //   1. A bare " toggles whether we're inside a quoted field.
        //   2. Inside a quoted field, "" is an ESCAPED literal " — must
        //      contribute a single " to the cell value, not a no-op toggle.
        // The original implementation only handled #1, which broke any cell
        // containing escaped quotes (e.g. JSON values like the Spec Lines
        // column). Result was that eval() saw ""label"" instead of "label"
        // and threw, falling back silently to legacy mode.
        var result = [];
        var current = "";
        var inQuotes = false;
        for (var j = 0; j < lineStr.length; j++) {
            var c = lineStr[j];
            if (c === '"') {
                if (inQuotes && lineStr[j + 1] === '"') {
                    // Escaped quote inside a quoted field: contribute a literal "
                    current += '"';
                    j++; // skip the second " of the pair
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                result.push(current.replace(/^\s+|\s+$/g, ''));
                current = "";
            } else {
                current += c;
            }
        }
        result.push(current.replace(/^\s+|\s+$/g, ''));
        return result;
    }

    var headers = parseCSVLine(lines[headerIndex].replace(/[\r\n]+/g, ''));
    var dataMap = {};

    // Exact-match column lookup (the original substring match could silently
    // resolve to the wrong column when columns shared name prefixes).
    function getColIdx(name) {
        for (var c = 0; c < headers.length; c++) {
            if (headers[c] === name) return c;
        }
        return -1;
    }

    var idxFileName = getColIdx("Image_Filename");
    if (idxFileName === -1) {
        alert("CSV is missing the 'Image_Filename' column. Cannot match images. Re-export from the Frame Builder Tool.");
        return;
    }

    for (var k = headerIndex + 1; k < lines.length; k++) {
        var line = lines[k].replace(/[\r\n]+/g, '');
        if (line === "") continue;

        var row = parseCSVLine(line);
        var filename = row[idxFileName];

        if (filename) {
            dataMap[filename.toLowerCase()] = row;
        }
    }

    // Column indices — fail loud if the new spec columns are missing.
    var idxApp = getColIdx("Application");
    var idxMatboard = getColIdx("Matboard Description");
    // New rich spec lines column (Phase 1 of richer spec block). Optional —
    // when present, the spec block uses the per-product line list from the tool.
    // When absent, falls back to the legacy 5-line format using Application
    // and Matboard Description directly.
    var idxSpecLines = getColIdx("Spec Lines");
    if (idxApp === -1 || idxMatboard === -1) {
        alert("CSV is missing the 'Application' or 'Matboard Description' columns.\n\nThis script requires the updated CSV format from the Frame Builder Tool. Re-export from the tool and try again.");
        return;
    }

    var idxProd = getColIdx("PRODUCT");
    // Frame Code-Color is the composite cell preferred for the spec block
    // (e.g. "MICH-41-12 / Black Maple"). Fall back to the backend "Frame Code"
    // (just the code) if the composite cell is empty for some reason.
    var idxFrameCodeColor = getColIdx("Frame Code-Color");
    var idxFrameCode = getColIdx("Frame Code");
    // Each numeric-dimension column may have one of three unit suffixes:
    // (in), (cm), or (mm), depending on what the user exported. Try each.
    var idxFrameW = getColIdx("Frame (Width) (in)");
    if (idxFrameW === -1) idxFrameW = getColIdx("Frame (Width) (cm)");
    if (idxFrameW === -1) idxFrameW = getColIdx("Frame (Width) (mm)");
    var idxArtW = getColIdx("Art Size W (in)");
    if (idxArtW === -1) idxArtW = getColIdx("Art Size W (cm)");
    if (idxArtW === -1) idxArtW = getColIdx("Art Size W (mm)");
    var idxArtH = getColIdx("Art Size H (in)");
    if (idxArtH === -1) idxArtH = getColIdx("Art Size H (cm)");
    if (idxArtH === -1) idxArtH = getColIdx("Art Size H (mm)");
    var idxODW = getColIdx("Overall Width (in)");
    if (idxODW === -1) idxODW = getColIdx("Overall Width (cm)");
    if (idxODW === -1) idxODW = getColIdx("Overall Width (mm)");
    var idxODH = getColIdx("Overall Height (in)");
    if (idxODH === -1) idxODH = getColIdx("Overall Height (cm)");
    if (idxODH === -1) idxODH = getColIdx("Overall Height (mm)");

    // The CSV's frame width / dimensions are in whatever unit the user exported
    // from the tool. Determine by which column suffix is present. Order of
    // checks matters: pick the most specific match first. Default falls
    // through to "in" if neither CM nor MM suffix is found.
    var CSV_UNIT = "in";
    if (getColIdx("Frame (Width) (cm)") !== -1) CSV_UNIT = "cm";
    else if (getColIdx("Frame (Width) (mm)") !== -1) CSV_UNIT = "mm";

    // Raw-inch column lookups. These columns are present in CSVs exported
    // from updated versions of the Frame Builder Tool. They always carry
    // values in inches regardless of the dashboard's display unit, so the
    // script can re-render spec lines in any output unit without parsing
    // the pre-formatted strings. -1 means the column isn't present (older
    // CSV) — in that case the script falls back to the pre-formatted spec
    // lines as-is.
    var idxRawFW = getColIdx("RAW Frame W (in)");
    var idxRawFH = getColIdx("RAW Frame H (in)");
    var idxRawRabbet = getColIdx("RAW Rabbet (in)");
    var idxRawMatT = getColIdx("RAW Mat T (in)");
    var idxRawMatB = getColIdx("RAW Mat B (in)");
    var idxRawMatL = getColIdx("RAW Mat L (in)");
    var idxRawMatR = getColIdx("RAW Mat R (in)");
    var idxRawM2 = getColIdx("RAW Mat 2 Reveal (in)");
    var idxRawPaperW = getColIdx("RAW Paper W (in)");
    var idxRawPaperH = getColIdx("RAW Paper H (in)");
    var idxRawWB = getColIdx("RAW White Border (in)");
    var hasRawColumns = (idxRawFW !== -1);  // any one present → all present

    // Warn only when raw-inch columns are NOT available (older CSVs). When
    // they ARE available, the script rebuilds spec lines from raw values in
    // the output unit, so no mismatch is possible.
    if (!hasRawColumns && OUTPUT_UNIT !== CSV_UNIT) {
        var unitNames = { "in": "Inches", "cm": "Centimeters", "mm": "Millimeters" };
        var warning = "Unit mismatch:\n\n" +
            "CSV is in " + unitNames[CSV_UNIT] + ", but you chose " + unitNames[OUTPUT_UNIT] + " output.\n\n" +
            "Art Dimensions and Overall Dimensions will convert to " + unitNames[OUTPUT_UNIT] + ", but pre-formatted lines (Frame Size, Mat 1, Mat 2) will stay in " + unitNames[CSV_UNIT] + " — the result will mix units.\n\n" +
            "For consistent output: re-export the CSV from the Frame Builder Tool with the dashboard set to " + unitNames[OUTPUT_UNIT] + ".\n\n" +
            "Continue anyway?";
        if (!confirm(warning)) return;
    }

    var matchedCount = 0;
    var missingFiles = [];

    // InDesign's special "Right Indent Tab" character — the text after this
    // character auto right-aligns to the text frame's right edge, with leader
    // dots filling the space. This is the framing-spec-block layout we want.
    // Don't change this to '\t' — a regular tab needs precise tab-stop math
    // and the result stacks instead of aligning.
    var rightTab = String.fromCharCode(0x08);

    // --- UNIT CONVERSION HELPER ---
    // CSV value is in CSV_UNIT; output rendered in OUTPUT_UNIT. Supports
    // any of in/cm/mm for both input and output (9 combinations total).
    // Strategy: convert to inches as canonical base, then to output unit.
    //
    // Display conventions (match the Frame Builder Tool's elevation view):
    //   IN — whole numbers preferred, trailing zeros stripped, suffix `"`
    //   CM — 1 decimal place, trailing `.0` stripped, suffix ` cm`
    //   MM — whole numbers preferred, trailing `.0` stripped, suffix ` mm`
    function formatDim(valStr, suffixUnits) {
        if (!valStr || valStr === "None" || valStr === "N/A" || valStr === "0" || valStr === "0.000") return "None";
        var num = parseFloat(valStr);
        if (isNaN(num)) return valStr;

        // Step 1: convert to inches as canonical base
        var inches;
        if (CSV_UNIT === "cm") inches = num / 2.54;
        else if (CSV_UNIT === "mm") inches = num / 25.4;
        else inches = num;

        // Step 2: convert inches to output unit and format
        if (OUTPUT_UNIT === "cm") {
            var cmVal = (inches * 2.54).toFixed(1);
            if (cmVal.substring(cmVal.length - 2) === ".0") {
                cmVal = cmVal.substring(0, cmVal.length - 2);
            }
            var cleanSuffix = (suffixUnits || "").replace(/^\s+/, '');
            return cmVal + " cm" + (cleanSuffix ? " " + cleanSuffix : "");
        } else if (OUTPUT_UNIT === "mm") {
            // MM values are typically much larger, so 1 decimal max — strip .0
            var mmVal = (inches * 25.4).toFixed(1);
            if (mmVal.substring(mmVal.length - 2) === ".0") {
                mmVal = mmVal.substring(0, mmVal.length - 2);
            }
            var cleanSuffixMm = (suffixUnits || "").replace(/^\s+/, '');
            return mmVal + " mm" + (cleanSuffixMm ? " " + cleanSuffixMm : "");
        } else {
            // Inches output. Round to 4 decimal places to scrub float noise
            // from unit conversions (e.g. 609.6mm / 25.4 = 24.000000000000004
            // in pure float math). parseFloat strips trailing zeros so
            // 24.0000 becomes "24". 4 decimal places is well below any
            // meaningful framing precision (saw kerf is ~1/32" = 0.03125").
            var inStr = parseFloat(inches.toFixed(4)).toString();
            return inStr + "\"" + (suffixUnits || "");
        }
    }

    // --- SPEC LINE REBUILDER (for raw-inch CSVs) ---
    // When raw-inch columns are present in the CSV, we rebuild the value of
    // unit-baked spec lines (Frame Size, Mat 1, Mat 2, Paper Size, White
    // Border) using the raw values in the chosen OUTPUT_UNIT. This makes one
    // CSV usable for any output unit — the script does the conversion
    // entirely from canonical inches.
    //
    // Returns the new value string, or null if the label isn't one we rebuild
    // (in which case the caller uses the original pre-formatted value).
    //
    // suf/sufTight/sufLoose mirror the same convention buildSpecStrings uses
    // in the tool: tight for letter directions (W/D/T/B/L/R), loose for
    // multi-letter words (AA, Reveal).
    function rebuildSpecValue(label, rowData, originalValue) {
        if (!hasRawColumns) return null;  // no raw cols → can't rebuild

        // Decide unit suffixes based on OUTPUT_UNIT, matching the tool's logic.
        var sufTight, sufLoose;
        if (OUTPUT_UNIT === "in") { sufTight = "\""; sufLoose = "\" "; }
        else if (OUTPUT_UNIT === "cm") { sufTight = " cm "; sufLoose = " cm "; }
        else { sufTight = " mm "; sufLoose = " mm "; }

        // Helper: convert raw-inch numeric to output unit + format with
        // trailing-zero strip. Returns null for empty/zero input.
        function fmtRawIn(rawInStr) {
            if (rawInStr === undefined || rawInStr === null || rawInStr === "") return null;
            var v = parseFloat(rawInStr);
            if (isNaN(v) || v === 0) return null;
            // Convert inches → output unit
            var converted;
            if (OUTPUT_UNIT === "cm") converted = v * 2.54;
            else if (OUTPUT_UNIT === "mm") converted = v * 25.4;
            else converted = v;
            // Round to 3 decimals + strip trailing zeros via parseFloat.
            return parseFloat(converted.toFixed(3)).toString();
        }

        // Get the trailing color/name from the original value (after the
        // first comma). Lets us preserve "B 97 White" in "3" AA, B 97 White".
        function tailAfterComma(s) {
            if (!s) return "";
            var idx = s.indexOf(",");
            return (idx > -1) ? s.substring(idx) : "";  // includes the comma
        }

        if (label === "Frame Size") {
            var fw = fmtRawIn(rowData[idxRawFW]);
            var fh = fmtRawIn(rowData[idxRawFH]);
            var rab = fmtRawIn(rowData[idxRawRabbet]);
            var parts = [];
            if (fw) parts.push(fw + sufTight + "W");
            if (fh) parts.push(fh + sufTight + "D");
            var primary = parts.join(" \xD7 ");  // × multiplication sign
            if (rab) primary = primary ? (primary + ", Rabbet " + rab + sufTight + "D") : ("Rabbet " + rab + sufTight + "D");
            return primary || originalValue;
        }
        if (label === "Mat 1") {
            var T = parseFloat(rowData[idxRawMatT]) || 0;
            var B = parseFloat(rowData[idxRawMatB]) || 0;
            var L = parseFloat(rowData[idxRawMatL]) || 0;
            var R = parseFloat(rowData[idxRawMatR]) || 0;
            var dims;
            if (T === B && T === L && T === R && T > 0) {
                dims = fmtRawIn(rowData[idxRawMatT]) + sufLoose + "AA";
            } else if (T + B + L + R > 0) {
                dims = (fmtRawIn(rowData[idxRawMatT]) || "0") + sufTight + "T \xD7 " +
                       (fmtRawIn(rowData[idxRawMatB]) || "0") + sufTight + "B \xD7 " +
                       (fmtRawIn(rowData[idxRawMatL]) || "0") + sufTight + "L \xD7 " +
                       (fmtRawIn(rowData[idxRawMatR]) || "0") + sufTight + "R";
            } else {
                return originalValue;  // mats off, keep whatever was there
            }
            return dims + tailAfterComma(originalValue);
        }
        if (label === "Mat 2") {
            var m2val = fmtRawIn(rowData[idxRawM2]);
            if (!m2val) return originalValue;
            return m2val + sufLoose + "Reveal" + tailAfterComma(originalValue);
        }
        if (label === "Paper Size") {
            var pw = fmtRawIn(rowData[idxRawPaperW]);
            var ph = fmtRawIn(rowData[idxRawPaperH]);
            if (!pw || !ph) return originalValue;
            return pw + sufTight + "W \xD7 " + ph + sufTight + "H";
        }
        if (label === "White Border") {
            var wb = fmtRawIn(rowData[idxRawWB]);
            if (!wb) return originalValue;
            return wb + sufLoose + "AA";
        }
        // Label not unit-baked (Application, Frame Code, Mount, etc.) — leave as-is.
        return null;
    }

    // --- 5. PROCESS IMAGES ---
    for (var s = 0; s < sel.length; s++) {
        var item = sel[s];
        var imgLink = null;

        if (item.hasOwnProperty("images") && item.images.length > 0) {
            imgLink = item.images[0].itemLink;
        } else if (item.constructor.name === "Image" || item.constructor.name === "EPS" || item.constructor.name === "PDF") {
            imgLink = item.itemLink;
            item = item.parent;
        }

        if (!imgLink) continue;

        var imgName = imgLink.name;
        var rowData = dataMap[imgName.toLowerCase()];

        if (rowData) {
            matchedCount++;
            var bounds = item.geometricBounds;

            var tf = doc.pages.item(item.parentPage.name).textFrames.add();
            tf.geometricBounds = [bounds[2] + 0.125, bounds[1], bounds[2] + 2.0, bounds[3]];

            // Pull pre-formatted strings directly from the CSV.
            // Application falls back to the raw PRODUCT cell as title-case (not uppercase)
            // since the spec block now uses natural case throughout.
            var application = rowData[idxApp] || rowData[idxProd] || "N/A";
            var matboardDesc = rowData[idxMatboard] || "No Mat";
            // Prefer the composite "Frame Code-Color" cell (e.g. "MICH-41-12 / Black Maple").
            // Fall back to just the bare frame code if the composite is empty.
            var fCode = "N/A";
            if (idxFrameCodeColor > -1 && rowData[idxFrameCodeColor]) {
                fCode = rowData[idxFrameCodeColor];
            } else if (idxFrameCode > -1 && rowData[idxFrameCode]) {
                fCode = rowData[idxFrameCode];
            }
            var fW = (idxFrameW > -1) ? (rowData[idxFrameW] || "0") : "0";
            var aW = (idxArtW > -1) ? (rowData[idxArtW] || "0") : "0";
            var aH = (idxArtH > -1) ? (rowData[idxArtH] || "0") : "0";
            var oW = (idxODW > -1) ? (rowData[idxODW] || "0") : "0";
            var oH = (idxODH > -1) ? (rowData[idxODH] || "0") : "0";

            // Build the spec block content. If "Spec Lines" column is present,
            // use the rich per-product line list from the tool. Otherwise fall
            // back to the legacy 5-line layout for backward compat.
            var specLinesArr = null;
            if (idxSpecLines > -1 && rowData[idxSpecLines]) {
                try {
                    // The CSV cell contains JSON like [{"label":"Application","value":"Framed Art"},...].
                    // ExtendScript doesn't have JSON.parse natively, so we use eval()
                    // on a parenthesized version. Safe here because we control the data
                    // (our own buildSpecStrings produces it).
                    specLinesArr = eval('(' + rowData[idxSpecLines] + ')');
                } catch (e) {
                    specLinesArr = null;
                }
            }

            var content = "";
            if (specLinesArr && specLinesArr.length > 0) {
                // Rich layout: iterate the list, one line per entry.
                for (var li = 0; li < specLinesArr.length; li++) {
                    var ln = specLinesArr[li];
                    if (!ln || !ln.label) continue;
                    var v = (ln.value !== undefined && ln.value !== null) ? String(ln.value) : "";
                    // If raw-inch columns are present and this label is one
                    // that has unit-baked values, rebuild it in the chosen
                    // OUTPUT_UNIT. Otherwise pass through unchanged.
                    var rebuilt = rebuildSpecValue(ln.label, rowData, v);
                    if (rebuilt !== null) v = rebuilt;
                    content += ln.label + rightTab + v + "\r";
                }
                // Append product-specific dimension lines at the end.
                // Per studio convention:
                //   - Framed Canvas (Floater):   "Image Size" + "Overall Dimensions"
                //                                ("Image Size" = Art Size col = visible canvas)
                //   - Frameless Canvas (Wrapped): "Overall Dimensions" only (image=overall)
                //   - All other products:        "Art Dimensions" + "Overall Dimensions"
                // Unit conversion via formatDim() — uses the user's IN/CM choice.
                var rowProduct = (idxProd > -1) ? rowData[idxProd] : "";
                var isFloater = (rowProduct === "Framed Canvas (Floater)");
                var isWrapped = (rowProduct === "Frameless Canvas (Wrapped)");
                if (isFloater) {
                    content += "Image Size" + rightTab + formatDim(aW, "W") + " \xD7 " + formatDim(aH, "H") + "\r";
                } else if (!isWrapped) {
                    content += "Art Dimensions" + rightTab + formatDim(aW, "W") + " \xD7 " + formatDim(aH, "H") + "\r";
                }
                content += "Overall Dimensions" + rightTab + formatDim(oW, "W") + " \xD7 " + formatDim(oH, "H");
            } else {
                // Legacy 5-line fallback for older CSVs.
                content = "Application" + rightTab + application + "\r" +
                          "Frame" + rightTab + formatDim(fW, "W") + ", " + fCode + "\r" +
                          "Matboard" + rightTab + matboardDesc + "\r" +
                          "Art Dimensions" + rightTab + formatDim(aW, "W") + " \xD7 " + formatDim(aH, "H") + "\r" +
                          "Overall Dimensions" + rightTab + formatDim(oW, "W") + " \xD7 " + formatDim(oH, "H");
            }

            tf.contents = content;

            // --- 6. STYLING ---
            var story = tf.parentStory;
            story.clearOverrides(OverrideType.ALL);

            try {
                story.texts.everyItem().appliedFont = app.fonts.item(FONT_NAME);
                story.texts.everyItem().fontStyle = "Regular";
            } catch (e) {}

            story.texts.everyItem().pointSize = FONT_SIZE;
            story.texts.everyItem().leading = LINE_SPACING;
            story.paragraphs.everyItem().spaceAfter = 0;
            story.paragraphs.everyItem().spaceBefore = 0;

            for (var p = 0; p < story.paragraphs.length; p++) {
                var para = story.paragraphs[p];
                para.tabStops.everyItem().remove();

                // The actual right-alignment is handled by the Right Indent Tab
                // character (0x08). This tab stop exists ONLY to contribute its
                // leader dots — the position is set far beyond any reasonable
                // frame width so it never constrains the layout.
                //
                // Why this matters for dynamic resizing: with this setup the user
                // can resize the text frame freely after the script runs, and the
                // right-aligned values stay glued to the frame's right edge with
                // leader dots filling the gap automatically. No need to revisit
                // Type > Tabs.
                para.tabStops.add({
                    alignment: TabStopAlignment.RIGHT_ALIGN,
                    position: 10000,
                    leader: "."
                });

                var tabIdx = para.contents.indexOf(rightTab);
                if (tabIdx > -1) {
                    para.characters.item(tabIdx).appliedCharacterStyle = leaderStyle;
                    try {
                        para.characters.itemByRange(0, tabIdx - 1).fontStyle = "Bold";
                    } catch (e) {}
                }
            }

            // Frame auto-sizing: HEIGHT_AND_WIDTH would shrink the frame to fit
            // text, defeating the dynamic-width goal. HEIGHT_ONLY keeps the
            // user's chosen width intact while letting the height grow with
            // content. The Right Indent Tab + huge-position tab stop above
            // ensures the right-aligned values follow whatever width the user
            // sets without needing to re-run the script.
            tf.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_ONLY;
            tf.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.TOP_CENTER_POINT;

        } else {
            missingFiles.push(imgName);
        }
    }

    if (matchedCount > 0) {
        if (missingFiles.length > 0) {
            alert("Generated " + matchedCount + " specs.\n\nHowever, these files were not found in the CSV:\n" + missingFiles.join("\n").substring(0, 200));
        }
    } else {
        var msg = "No matching filenames found in the CSV.\n\nMake sure the PNG filename in InDesign exactly matches the 'Image_Filename' column in your CSV.\n\nInDesign is looking for:\n" + missingFiles.join("\n").substring(0, 250);
        alert(msg);
    }
}

app.doScript(main, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Generate Frame Specs");
