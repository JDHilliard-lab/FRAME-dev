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
    btnCm.value = true;

    var buttonGroup = win.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignment = ["right", "top"];
    buttonGroup.margins.top = 10;
    var okBtn = buttonGroup.add("button", undefined, "OK", { name: "ok" });
    var cancelBtn = buttonGroup.add("button", undefined, "Cancel", { name: "cancel" });

    if (win.show() !== 1) return;

    var OUTPUT_UNIT = btnIn.value ? "in" : "cm";

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
    var idxFrameW = getColIdx("Frame (Width) (in)");
    if (idxFrameW === -1) idxFrameW = getColIdx("Frame (Width) (cm)");
    var idxArtW = getColIdx("Art Size W (in)");
    if (idxArtW === -1) idxArtW = getColIdx("Art Size W (cm)");
    var idxArtH = getColIdx("Art Size H (in)");
    if (idxArtH === -1) idxArtH = getColIdx("Art Size H (cm)");
    var idxODW = getColIdx("Overall Width (in)");
    if (idxODW === -1) idxODW = getColIdx("Overall Width (cm)");
    var idxODH = getColIdx("Overall Height (in)");
    if (idxODH === -1) idxODH = getColIdx("Overall Height (cm)");

    // The CSV's frame width / dimensions are in whatever unit the user exported
    // from the tool. If they exported in "in", suffix is "(in)". The script's
    // OUTPUT_UNIT may differ from the CSV unit — formatDim handles conversion.
    var CSV_UNIT = (getColIdx("Frame (Width) (cm)") !== -1) ? "cm" : "in";

    var matchedCount = 0;
    var missingFiles = [];

    // InDesign's special "Right Indent Tab" character — the text after this
    // character auto right-aligns to the text frame's right edge, with leader
    // dots filling the space. This is the framing-spec-block layout we want.
    // Don't change this to '\t' — a regular tab needs precise tab-stop math
    // and the result stacks instead of aligning.
    var rightTab = String.fromCharCode(0x08);

    // --- UNIT CONVERSION HELPER ---
    // CSV value is in CSV_UNIT; output rendered in OUTPUT_UNIT.
    function formatDim(valStr, suffixUnits) {
        if (!valStr || valStr === "None" || valStr === "N/A" || valStr === "0" || valStr === "0.000") return "None";
        var num = parseFloat(valStr);
        if (isNaN(num)) return valStr;

        // Convert to inches first as a canonical base
        var inches = (CSV_UNIT === "cm") ? (num / 2.54) : num;

        if (OUTPUT_UNIT === "cm") {
            var cmVal = (inches * 2.54).toFixed(1);
            if (cmVal.substring(cmVal.length - 2) === ".0") {
                cmVal = cmVal.substring(0, cmVal.length - 2);
            }
            var cleanSuffix = (suffixUnits || "").replace(/^\s+/, '');
            return cmVal + " cm" + (cleanSuffix ? " " + cleanSuffix : "");
        } else {
            // Format inches: drop trailing zeros, e.g. 1.000 -> 1, 1.250 -> 1.25
            var inStr = inches.toString();
            return inStr + "\"" + (suffixUnits || "");
        }
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
