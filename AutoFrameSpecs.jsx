// AutoFrameSpecs.jsx — v2 (Tier A + B improvements)
//
// Reads pre-formatted "Application" and "Matboard Description" columns from
// the Frame Builder Tool's CSV export, so this script no longer has to know
// anything about product types, mat configurations, float mount, or torn
// edges. The single source of truth lives in the Frame Builder Tool's
// `buildSpecStrings()` function — change wording there, both the CSV and
// the InDesign output update consistently.
//
// v2 features:
//   - Unified settings dialog (one OK click instead of cascading prompts)
//   - Settings persist between runs (saved to ~/AutoFrameSpecs-settings.txt)
//   - Mode: process selection OR all matching images in the document
//   - Placement: Below image | Top-Left | Top-Right | Custom (X/Y/Width)
//   - Re-run safe: existing script-generated spec blocks are deleted and
//     re-created so you can re-run with new settings without buildup
//
// Required CSV columns:
//   - Image_Filename   (last column; matches the InDesign-placed image's filename)
//   - PRODUCT          (used as fallback if Application is missing)
//   - Frame Code, Frame (Width), Mat Top, Mat Right, Mat Bottom, Mat Left
//   - Mat Code, Mat 2 Reveal
//   - Art Size W, Art Size H, Overall Width, Overall Height
//   - Application      (pre-formatted product type for the spec block)
//   - Matboard Description (pre-formatted matboard description)

#target indesign

// ==========================================
// TYPOGRAPHY SETTINGS
// ==========================================
var FONT_NAME = "Messina Serif";
var FONT_SIZE = 11;
var LINE_SPACING = 18;
// ==========================================

// ==========================================
// SETTINGS PERSISTENCE
// ==========================================
// Settings live in a tiny key=value text file in the user-data folder.
// ExtendScript has no JSON.parse so we use a simple line-based format:
//   key=value
// Lines starting with # are comments. Values are read as strings; callers
// coerce to number/bool as needed.
//
// On a brand-new machine, the file doesn't exist yet — we fall back to
// defaults. Each successful run writes the file so the user's last choices
// re-appear on the next run.

var SETTINGS_FILE = File(Folder.userData + "/AutoFrameSpecs-settings.txt");

var DEFAULTS = {
    csvPath: "",
    unit: "in",
    mode: "all",            // "selection" or "all"
    placement: "topLeft",   // "below" | "topLeft" | "topRight" | "custom"
    specWidth: 250,         // pt — width of the spec text frame
    marginEdge: 40,         // pt — distance from page edge for corner placements
    customX: 40,            // pt — only used when placement === "custom"
    customY: 40             // pt — only used when placement === "custom"
};

function loadSettings() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    if (!SETTINGS_FILE.exists) return s;
    try {
        SETTINGS_FILE.open("r");
        var content = SETTINGS_FILE.read();
        SETTINGS_FILE.close();
        var lines = content.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^\s+|\s+$/g, '');
            if (!line || line.charAt(0) === "#") continue;
            var eq = line.indexOf("=");
            if (eq < 0) continue;
            var key = line.substring(0, eq).replace(/\s+$/, '');
            var val = line.substring(eq + 1).replace(/^\s+/, '');
            // Coerce numeric fields
            if (key === "specWidth" || key === "marginEdge" ||
                key === "customX"  || key === "customY") {
                var n = parseFloat(val);
                s[key] = isNaN(n) ? DEFAULTS[key] : n;
            } else {
                s[key] = val;
            }
        }
    } catch (e) { /* silently fall through to defaults */ }
    return s;
}

function saveSettings(cfg) {
    try {
        SETTINGS_FILE.open("w");
        SETTINGS_FILE.write(
            "# AutoFrameSpecs settings — auto-written by the script.\r" +
            "# Delete this file to reset to defaults.\r" +
            "csvPath=" + (cfg.csvPath || "") + "\r" +
            "unit=" + cfg.unit + "\r" +
            "mode=" + cfg.mode + "\r" +
            "placement=" + cfg.placement + "\r" +
            "specWidth=" + cfg.specWidth + "\r" +
            "marginEdge=" + cfg.marginEdge + "\r" +
            "customX=" + cfg.customX + "\r" +
            "customY=" + cfg.customY + "\r"
        );
        SETTINGS_FILE.close();
    } catch (e) { /* nonfatal — settings just won't persist this run */ }
}

// ==========================================
// SCRIPT LABEL FOR RE-RUN SAFETY
// ==========================================
// Every text frame the script creates gets this label so re-runs can find
// and delete prior spec blocks before generating fresh ones. Without this,
// repeated runs would stack new blocks on top of old ones.
var SCRIPT_LABEL = "AutoFrameSpecs:v2";

function main() {
    if (app.documents.length === 0) {
        alert("Please open an InDesign document first.");
        return;
    }

    var doc = app.activeDocument;
    var settings = loadSettings();

    // Save the document's current measurement units so we can restore them
    // at the end. Forcing points for the script's duration makes all
    // coordinate math predictable — `page.bounds`, `geometricBounds`, and
    // `tf.geometricBounds = [...]` all read/write in points while the script
    // runs. Without this, doc-in-inches + my pt-based math = subtle errors
    // (worst case: text frames placed at coordinates that blow out the
    // pasteboard, requiring an InDesign restart).
    var origHUnits = doc.viewPreferences.horizontalMeasurementUnits;
    var origVUnits = doc.viewPreferences.verticalMeasurementUnits;
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;

    // Wrap the entire body in try/finally so units always get restored,
    // even if an error or early return happens. mainBody returns the same
    // way main used to (no return value).
    try {
        mainBody(doc, settings);
    } finally {
        doc.viewPreferences.horizontalMeasurementUnits = origHUnits;
        doc.viewPreferences.verticalMeasurementUnits = origVUnits;
    }
}

function mainBody(doc, settings) {

    // --- 1. UNIFIED SETTINGS DIALOG -------------------------------------
    // One dialog covers: CSV path, unit, mode, placement (with sub-fields).
    // Values pre-filled from last-saved settings; user adjusts only what
    // differs this run, hits OK once.
    var win = new Window("dialog", "Frame Spec Configuration");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 16;
    win.spacing = 10;

    // --- CSV path ---
    var csvGroup = win.add("panel", undefined, "RFI CSV");
    csvGroup.orientation = "row";
    csvGroup.alignChildren = ["left", "center"];
    csvGroup.margins = [10, 14, 10, 10];
    var csvField = csvGroup.add("edittext", undefined, settings.csvPath || "");
    csvField.characters = 40;
    var csvBrowse = csvGroup.add("button", undefined, "Browse…");
    csvBrowse.onClick = function () {
        var picked = File.openDialog("Select your exported RFI_Project_Tracker.csv", "*.csv");
        if (picked) csvField.text = picked.fsName;
    };

    // --- Unit ---
    var unitGroup = win.add("panel", undefined, "Output Measurement");
    unitGroup.orientation = "row";
    unitGroup.margins = [10, 14, 10, 10];
    var btnIn = unitGroup.add("radiobutton", undefined, "Inches (in)");
    var btnCm = unitGroup.add("radiobutton", undefined, "Centimeters (cm)");
    var btnMm = unitGroup.add("radiobutton", undefined, "Millimeters (mm)");
    btnIn.value = (settings.unit === "in");
    btnCm.value = (settings.unit === "cm");
    btnMm.value = (settings.unit === "mm");
    if (!btnIn.value && !btnCm.value && !btnMm.value) btnIn.value = true;
    btnIn.onClick = function () { btnCm.value = false; btnMm.value = false; };
    btnCm.onClick = function () { btnIn.value = false; btnMm.value = false; };
    btnMm.onClick = function () { btnIn.value = false; btnCm.value = false; };

    // --- Mode ---
    var modeGroup = win.add("panel", undefined, "Process");
    modeGroup.orientation = "row";
    modeGroup.margins = [10, 14, 10, 10];
    var btnSelection = modeGroup.add("radiobutton", undefined, "Selected images only");
    var btnAll = modeGroup.add("radiobutton", undefined, "All images in this document");
    btnSelection.value = (settings.mode === "selection");
    btnAll.value = (settings.mode === "all");
    if (!btnSelection.value && !btnAll.value) btnAll.value = true;
    btnSelection.onClick = function () { btnAll.value = false; };
    btnAll.onClick = function () { btnSelection.value = false; };

    // --- Placement ---
    var placeGroup = win.add("panel", undefined, "Spec Block Placement");
    placeGroup.orientation = "column";
    placeGroup.alignChildren = ["fill", "top"];
    placeGroup.margins = [10, 14, 10, 10];
    placeGroup.spacing = 6;

    var placeRow1 = placeGroup.add("group");
    placeRow1.orientation = "row";
    placeRow1.add("statictext", undefined, "Position:");
    // Dropdown instead of radios — radios in ScriptUI have known mutex bugs
    // across InDesign versions where multiple radios can stay `value=true`
    // simultaneously even after clicking, leading to the read cascade
    // picking the wrong option. A dropdown has no such issue (single
    // .selection at a time). The mapping from index to placement key is
    // straightforward and explicit.
    var placeDropdown = placeRow1.add("dropdownlist", undefined, [
        "Below image",
        "Top-left of page",
        "Top-right of page",
        "Custom X/Y"
    ]);
    var PLACEMENT_KEYS = ["below", "topLeft", "topRight", "custom"];
    // Pre-select the saved placement
    var savedIdx = 0;
    for (var pIdx = 0; pIdx < PLACEMENT_KEYS.length; pIdx++) {
        if (PLACEMENT_KEYS[pIdx] === settings.placement) { savedIdx = pIdx; break; }
    }
    placeDropdown.selection = savedIdx;

    var placeRow2 = placeGroup.add("group");
    placeRow2.orientation = "row";
    placeRow2.spacing = 12;
    placeRow2.add("statictext", undefined, "Spec width (pt):");
    var widthField = placeRow2.add("edittext", undefined, String(settings.specWidth));
    widthField.characters = 6;
    placeRow2.add("statictext", undefined, "Margin from edge (pt):");
    var marginField = placeRow2.add("edittext", undefined, String(settings.marginEdge));
    marginField.characters = 6;

    var placeRow3 = placeGroup.add("group");
    placeRow3.orientation = "row";
    placeRow3.spacing = 12;
    placeRow3.add("statictext", undefined, "Custom X (pt):");
    var customXField = placeRow3.add("edittext", undefined, String(settings.customX));
    customXField.characters = 6;
    placeRow3.add("statictext", undefined, "Custom Y (pt):");
    var customYField = placeRow3.add("edittext", undefined, String(settings.customY));
    customYField.characters = 6;

    // --- Buttons ---
    var buttonGroup = win.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignment = ["right", "top"];
    var okBtn = buttonGroup.add("button", undefined, "OK", { name: "ok" });
    var cancelBtn = buttonGroup.add("button", undefined, "Cancel", { name: "cancel" });

    if (win.show() !== 1) return;

    // Read dialog values into a settings object
    var pickedIdx = placeDropdown.selection ? placeDropdown.selection.index : 0;
    var cfg = {
        csvPath: csvField.text,
        unit: btnIn.value ? "in" : (btnMm.value ? "mm" : "cm"),
        mode: btnSelection.value ? "selection" : "all",
        placement: PLACEMENT_KEYS[pickedIdx] || "topLeft",
        specWidth: parseFloat(widthField.text) || DEFAULTS.specWidth,
        marginEdge: parseFloat(marginField.text) || DEFAULTS.marginEdge,
        customX: parseFloat(customXField.text) || DEFAULTS.customX,
        customY: parseFloat(customYField.text) || DEFAULTS.customY
    };

    if (!cfg.csvPath) {
        alert("Please select a CSV file before continuing.");
        return;
    }

    // Persist for next run
    saveSettings(cfg);

    var OUTPUT_UNIT = cfg.unit;

    // --- 2. SETUP CHARACTER STYLE FOR GREY DOTS -------------------------
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

    // --- 3. LOAD CSV ----------------------------------------------------
    var csvFile = File(cfg.csvPath);
    if (!csvFile.exists) {
        alert("CSV file not found:\n" + cfg.csvPath);
        return;
    }

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
    // Prefix map: keyed by everything before the first underscore (the ITEM
    // CODE). This lets users rename exported PNGs as long as the prefix
    // stays intact — InDesign matches first by full filename, then by prefix.
    // See FRAME-File-Naming-Proposal: "anything after the underscore is free
    // for personal organization."
    var prefixMap = {};

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

    // Helper: extract the ITEM CODE prefix from a filename. The prefix is
    // everything before the first underscore (or the whole base name if no
    // underscore). E.g. "ART.001_FA_MICH-41-35_24x36.png" → "art.001".
    function filenamePrefix(name) {
        var base = String(name || '').toLowerCase();
        // Strip the .png extension first
        base = base.replace(/\.png$/, '');
        var us = base.indexOf('_');
        if (us > -1) base = base.substring(0, us);
        return base;
    }

    for (var k = headerIndex + 1; k < lines.length; k++) {
        var line = lines[k].replace(/[\r\n]+/g, '');
        if (line === "") continue;

        var row = parseCSVLine(line);
        var filename = row[idxFileName];

        if (filename) {
            dataMap[filename.toLowerCase()] = row;
            // Also index by prefix so renamed PNGs still match. If two rows
            // somehow have the same prefix (shouldn't happen — ITEM CODEs are
            // unique), the LAST row wins. Full-filename match still works for
            // both because dataMap is keyed by the full name.
            var prefix = filenamePrefix(filename);
            if (prefix) prefixMap[prefix] = row;
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
    var outOfBounds = [];  // images whose placement would land outside the page

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
        // Format a numeric inch value into the chosen output unit. Returns
        // null for zero/NaN, matching fmtRawIn's behavior. Used by
        // formatMatSides for per-side number formatting after grouping.
        function fmtInchNum(v) {
            if (!v || isNaN(v) || v === 0) return null;
            var converted;
            if (OUTPUT_UNIT === "cm") converted = v * 2.54;
            else if (OUTPUT_UNIT === "mm") converted = v * 25.4;
            else converted = v;
            return parseFloat(converted.toFixed(3)).toString();
        }

        // formatMatSides — group sides that share the same value for compact
        // call-outs. Returns formatted dims string in chosen output unit.
        //   [3,3,3,3]   → "3" AA"            (all equal)
        //   [3,10,3,3]  → "3"T/L/R × 10"B"   (3 sides match)
        //   [3,3,5,5]   → "3"T/B × 5"L/R"    (two pairs)
        //   [3,3,5,6]   → "3"T/B × 5"L × 6"R"
        //   [2,3,4,5]   → "2"T × 3"B × 4"L × 5"R"  (all different — fallback)
        // Returns "" when all four (after applying reveal offset) are zero.
        //
        // The `reveal` arg is added uniformly to each side — used to derive
        // Mat 2 from Mat 1's geometry (Mat 2 = Mat 1 + reveal on every side).
        // Pass 0 for Mat 1 (no offset).
        function formatMatSides(T_in, B_in, L_in, R_in, reveal) {
            var T = (T_in || 0) + reveal;
            var B = (B_in || 0) + reveal;
            var L = (L_in || 0) + reveal;
            var R = (R_in || 0) + reveal;
            if (T + B + L + R === 0) return "";
            if (T === B && T === L && T === R && T > 0) {
                return fmtInchNum(T) + sufLoose + "AA";
            }
            // Group sides by value, preserving T-B-L-R reading order.
            var sides = [["T", T], ["B", B], ["L", L], ["R", R]];
            var groups = [];        // { val, labels }
            var groupIdxMap = {};   // String(val) → index in groups
            for (var i = 0; i < sides.length; i++) {
                var lbl = sides[i][0];
                var v = sides[i][1];
                var key = String(v);
                if (groupIdxMap[key] === undefined) {
                    groupIdxMap[key] = groups.length;
                    groups.push({ val: v, labels: [lbl] });
                } else {
                    groups[groupIdxMap[key]].labels.push(lbl);
                }
            }
            var out = [];
            for (var g = 0; g < groups.length; g++) {
                out.push((fmtInchNum(groups[g].val) || "0") + sufTight + groups[g].labels.join("/"));
            }
            return out.join(" \xD7 ");
        }

        if (label === "Mat 1") {
            var T = parseFloat(rowData[idxRawMatT]) || 0;
            var B = parseFloat(rowData[idxRawMatB]) || 0;
            var L = parseFloat(rowData[idxRawMatL]) || 0;
            var R = parseFloat(rowData[idxRawMatR]) || 0;
            var dims = formatMatSides(T, B, L, R, 0);
            if (!dims) return originalValue;  // mats off, keep whatever was there
            return dims + tailAfterComma(originalValue);
        }
        if (label === "Mat 2") {
            // Mat 2 = Mat 1 sides + reveal, with same grouping. Matches the
            // web tool's spec output so InDesign reads consistently with the
            // dashboard. Reveal is read from the raw "Mat 2 Reveal" column.
            var m2reveal = parseFloat(rowData[idxRawM2]) || 0;
            if (m2reveal === 0) return originalValue;
            var m1T = parseFloat(rowData[idxRawMatT]) || 0;
            var m1B = parseFloat(rowData[idxRawMatB]) || 0;
            var m1L = parseFloat(rowData[idxRawMatL]) || 0;
            var m1R = parseFloat(rowData[idxRawMatR]) || 0;
            var dims = formatMatSides(m1T, m1B, m1L, m1R, m2reveal);
            if (!dims) return originalValue;
            return dims + tailAfterComma(originalValue);
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

    // --- 5. COLLECT ITEMS TO PROCESS ------------------------------------
    // Mode determines what we iterate:
    //   "selection" — only currently-selected images (legacy behavior)
    //   "all"       — every image on every page of the document (batch mode)
    // The downstream logic doesn't care which source — both end up as a flat
    // array of "container item" references (text frames or images) from
    // which we extract the underlying itemLink.
    var itemsToProcess = [];
    if (cfg.mode === "selection") {
        if (app.selection.length === 0) {
            alert("Mode is 'Selected images only' but nothing is selected.\n\nSelect one or more images, or re-run with 'All images in this document'.");
            return;
        }
        // Filter the selection to only image-bearing items. Without this
        // filter, stray selections (Document, Page, text frame, menu item)
        // can fall through and cause the script to place text frames at
        // garbage coordinates — which blows out the pasteboard and forces
        // an InDesign restart. We accept the same item types as batch mode:
        //   - Rectangle / Polygon / Oval that contain a placed image
        //   - Direct Image / EPS / PDF objects
        for (var si = 0; si < app.selection.length; si++) {
            var selItem = app.selection[si];
            var selCtor = "";
            try { selCtor = selItem.constructor.name; } catch (e) { continue; }
            if (selCtor === "Rectangle" || selCtor === "Polygon" || selCtor === "Oval") {
                if (selItem.images && selItem.images.length > 0) itemsToProcess.push(selItem);
            } else if (selCtor === "Image" || selCtor === "EPS" || selCtor === "PDF") {
                itemsToProcess.push(selItem);
            }
            // Anything else (Document, Page, TextFrame, guide, etc.) — ignore
        }
        if (itemsToProcess.length === 0) {
            alert("Selection mode is on, but the current selection contains no images.\n\nSelect one or more placed image frames, or switch to 'All images in this document'.");
            return;
        }
    } else {
        // Batch mode: scan every page for placed images. Both Rectangle
        // containers (with .images) and bare Image/EPS/PDF objects are
        // gathered. allPageItems is the cheapest deep scan available.
        for (var pi = 0; pi < doc.pages.length; pi++) {
            var page = doc.pages[pi];
            var pageItems = page.allPageItems;
            for (var qi = 0; qi < pageItems.length; qi++) {
                var pit = pageItems[qi];
                var ctor = pit.constructor.name;
                // Image-bearing container or direct image
                if (ctor === "Rectangle" || ctor === "Polygon" || ctor === "Oval") {
                    if (pit.images && pit.images.length > 0) itemsToProcess.push(pit);
                } else if (ctor === "Image" || ctor === "EPS" || ctor === "PDF") {
                    itemsToProcess.push(pit);
                }
            }
        }
    }

    // --- 6. PLACEMENT HELPER --------------------------------------------
    // Given the image's bounding box + the user's placement settings,
    // compute the geometric bounds for the new spec text frame.
    //
    // The doc has been temporarily switched to points (see main()), so
    // page.bounds, item.geometricBounds, and the returned bounds are all
    // in points. cfg.specWidth/marginEdge/customX/customY are point values
    // and used directly with no conversion.
    //
    // InDesign geometric bounds format: [y1, x1, y2, x2] (TOP, LEFT, BOTTOM, RIGHT).
    //
    // Returns null if the computed bounds would place the frame way outside
    // the page (likely a typo in Custom X/Y) — caller skips and warns.
    var _diagLogged = false;
    function computeSpecBounds(item, page) {
        var pageBounds = page.bounds;  // [y1, x1, y2, x2] in POINTS
        var imgBounds = item.geometricBounds;  // also in POINTS
        var pageW = pageBounds[3] - pageBounds[1];
        var pageH = pageBounds[2] - pageBounds[0];

        var width = cfg.specWidth;
        var margin = cfg.marginEdge;
        var height = 4.0 * 72;  // 4 inches tall — auto-trims to text in InDesign

        var bounds;
        if (cfg.placement === "below") {
            // Below the image, full image width. ~9pt gap = 0.125in.
            var gap = 9;
            var heightB = 2.0 * 72;  // 2-inch default for below
            bounds = [imgBounds[2] + gap, imgBounds[1], imgBounds[2] + gap + heightB, imgBounds[3]];
        } else if (cfg.placement === "topLeft") {
            var xTL = pageBounds[1] + margin;
            var yTL = pageBounds[0] + margin;
            bounds = [yTL, xTL, yTL + height, xTL + width];
        } else if (cfg.placement === "topRight") {
            var xTR_right = pageBounds[3] - margin;
            var yTR = pageBounds[0] + margin;
            bounds = [yTR, xTR_right - width, yTR + height, xTR_right];
        } else {  // custom
            var xc = pageBounds[1] + cfg.customX;
            var yc = pageBounds[0] + cfg.customY;
            bounds = [yc, xc, yc + height, xc + width];
        }

        // One-shot diagnostic log so we can verify placement is correct
        // without spamming alerts on every image. Writes a small text file
        // next to the settings file. Inspect it if a mode misbehaves.
        if (!_diagLogged) {
            _diagLogged = true;
            try {
                var diag = File(Folder.userData + "/AutoFrameSpecs-debug.txt");
                diag.open("w");
                diag.write(
                    "AutoFrameSpecs debug — written on first computeSpecBounds call\r" +
                    "Placement key: " + cfg.placement + "\r" +
                    "Spec width: " + cfg.specWidth + " pt\r" +
                    "Margin: " + cfg.marginEdge + " pt\r" +
                    "Custom X/Y: " + cfg.customX + ", " + cfg.customY + " pt\r" +
                    "Page bounds [y1,x1,y2,x2]: " + pageBounds.join(", ") + "\r" +
                    "Image bounds [y1,x1,y2,x2]: " + imgBounds.join(", ") + "\r" +
                    "Computed bounds [y1,x1,y2,x2]: " + bounds.join(", ") + "\r"
                );
                diag.close();
            } catch (e) {}
        }

        // Sanity check: refuse to place a frame more than 2 page-widths/
        // heights outside the page. Catches typos like Custom Y = 5000 that
        // would otherwise expand the pasteboard and force an InDesign
        // restart. Some legitimate overflow is fine (e.g., margin bleed).
        var slackX = pageW * 2;
        var slackY = pageH * 2;
        if (bounds[0] < pageBounds[0] - slackY || bounds[2] > pageBounds[2] + slackY ||
            bounds[1] < pageBounds[1] - slackX || bounds[3] > pageBounds[3] + slackX) {
            return null;
        }
        return bounds;
    }

    // --- 7. CLEAN UP EXISTING SPEC BLOCKS -------------------------------
    // Find any text frame previously created by this script (identified by
    // script label) whose target image is one we're about to process, and
    // delete it. Without this, re-runs would stack new blocks on top of old.
    // Match key: the imgName stored in the text frame's label.
    function removeExistingSpecFor(imgName) {
        var key = imgName.toLowerCase();
        for (var ppi = 0; ppi < doc.pages.length; ppi++) {
            var ppage = doc.pages[ppi];
            var tfs = ppage.textFrames;
            // Iterate descending — we may remove items mid-loop
            for (var tfi = tfs.length - 1; tfi >= 0; tfi--) {
                var t = tfs[tfi];
                try {
                    if (t.label && t.label.indexOf(SCRIPT_LABEL) === 0) {
                        // Label format: "AutoFrameSpecs:v2|<imgNameLower>"
                        var pipe = t.label.indexOf("|");
                        if (pipe > -1 && t.label.substring(pipe + 1) === key) {
                            t.remove();
                        }
                    }
                } catch (e) {}
            }
        }
    }

    // --- 8. PROCESS IMAGES ---
    for (var s_i = 0; s_i < itemsToProcess.length; s_i++) {
        var item = itemsToProcess[s_i];
        var imgLink = null;

        if (item.hasOwnProperty("images") && item.images.length > 0) {
            imgLink = item.images[0].itemLink;
        } else if (item.constructor.name === "Image" || item.constructor.name === "EPS" || item.constructor.name === "PDF") {
            imgLink = item.itemLink;
            item = item.parent;
        }

        if (!imgLink) continue;

        var imgName = imgLink.name;
        // Match strategy: try the full filename first (auto-generated names
        // exported straight from the tool will hit here), then fall back to
        // the ITEM CODE prefix (lets users freely rename PNGs as long as the
        // ART.NNN_ prefix stays intact).
        var rowData = dataMap[imgName.toLowerCase()];
        if (!rowData) {
            var pfx = filenamePrefix(imgName);
            if (pfx) rowData = prefixMap[pfx];
        }

        if (rowData) {
            var page = item.parentPage;
            if (!page) continue;  // image on pasteboard — skip
            var specBounds = computeSpecBounds(item, page);
            if (!specBounds) {
                // Custom X/Y produces an absurd location (likely a typo)
                outOfBounds.push(imgName);
                continue;
            }
            matchedCount++;
            // Re-run safety: delete any spec block this script previously
            // generated for the same image.
            removeExistingSpecFor(imgName);

            var tf = doc.pages.item(page.name).textFrames.add();
            tf.geometricBounds = specBounds;
            // Tag the text frame so a future run can find and replace it.
            tf.label = SCRIPT_LABEL + "|" + imgName.toLowerCase();

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

    // --- 9. SUMMARY -----------------------------------------------------
    // Report what happened so the user can verify expected results,
    // especially in batch mode where no selection was made up front.
    var modeLabel = (cfg.mode === "selection") ? "Selected images" : "All images in document";
    // Silent success: when at least one spec block was generated, don't show
    // a popup at all. Most "missing from CSV" entries come from template
    // reference images (page thumbnails, plan views) that are never going
    // to be in the RFI — surfacing them on every run is noise.
    //
    // Only alert when something actually went wrong (matchedCount === 0).
    // The out-of-bounds list is also only shown then, since it'd usually
    // be empty when everything worked.
    if (matchedCount > 0) {
        // success — no popup
    } else if (outOfBounds.length > 0) {
        alert("No spec blocks were generated. All " + outOfBounds.length + " matched image(s) would have landed outside the page bounds.\n\nCheck your Custom X / Custom Y values — they may be too large for this page size.");
    } else {
        var msg = "No matching filenames found in the CSV.\n\n" +
                  "Mode: " + modeLabel + "\n" +
                  "Items scanned: " + itemsToProcess.length + "\n\n" +
                  "Make sure the PNG filename in InDesign exactly matches the 'Image_Filename' column in your CSV.\n\n" +
                  "InDesign was looking for:\n" + missingFiles.join("\n").substring(0, 250);
        alert(msg);
    }
}

app.doScript(main, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Generate Frame Specs");
