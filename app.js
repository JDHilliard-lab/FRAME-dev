// =========================================================================
// GLOBAL APP STATE & ICONS
// =========================================================================

// Version indicator. Shown in the header bar (small label + colored dot).
// Update APP_VERSION on each release. Set APP_BUILD to 'dev' in the dev
// repo fork — the version pill turns orange to make it visually obvious
// you're on the development build, not the production one users see.
const APP_VERSION = '1.1';
const APP_BUILD = 'dev';  // 'prod' (green dot) or 'dev' (orange dot)

let currentView = 'dashboard';
let dashUnit = 'in';
const emptyImgUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let dashActiveImageObj = new Image(); 
dashActiveImageObj.src = emptyImgUrl;
let dashSelectedRowIndex = 0;
// Multi-selection state for the dashboard table.
// - dashMultiSelectedIndices: Set of row indices included in the multi-selection
//   (the primary dashSelectedRowIndex is always conceptually part of it, but
//    we don't store it in the Set to avoid double-tracking).
// - dashLastClickedIndex: anchor for shift-range selection. When the user
//   shift-clicks, the range from this anchor to the new click is selected.
//   Updated on plain-click and ctrl-click; NOT updated on shift-click so
//   repeated shift-clicks extend from the same anchor.
let dashMultiSelectedIndices = new Set();
let dashLastClickedIndex = 0;
let dashTempHoverUrl = null;
let dashLocalLibrary = {}; 

// Studio standard for the canvas shadow reveal — the small dark gap between the
// canvas edge and the frame's inner wall on a floater. We derive the floaterInset
// for a swatch as: insetForSwatch = swatchFaceWidth + FLOATER_SHADOW_REVEAL.
// This is constant across all swatches; only the canvas face width varies per profile.
const FLOATER_SHADOW_REVEAL = 0.25;

// Canonical list of product types. Used by the project table's row dropdown
// to keep its options in sync with the dashboard form's <select>. Update both
// here AND in index.html when adding a new product type — the form's static
// markup is still hardcoded, but the table reads from this list so they don't
// drift out of sync.
const FRAME_PRODUCTS = [
    "Framed Art",
    "Framed Art (Shadow Box)",
    "Framed Canvas (Floater)",
    "Frameless Canvas (Wrapped)",
    "Sourced Object"
];

// A library "file" entry can be either:
//   - a real File object (when user manually used Sync Folder)
//   - a URL string (when the entry came from the bundled library-manifest.json)
// These two helpers normalize that difference so the rest of the code doesn't care.

function _libEntryToUrl(entry) {
    // Returns a URL usable as <img src> or background-image. Caller is responsible
    // for revoking object URLs created from File objects.
    if (typeof entry === 'string') return entry;
    if (entry instanceof File || entry instanceof Blob) return URL.createObjectURL(entry);
    return null;
}

function _libEntryToDataUrl(entry) {
    // Returns a Promise<dataURL> - the format swatchDataUrl needs to be saved as
    // (data: URL so the project JSON is self-contained when exported).
    return new Promise((resolve, reject) => {
        if (entry instanceof File || entry instanceof Blob) {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.onerror = () => reject(new Error('FileReader failed'));
            r.readAsDataURL(entry);
            return;
        }
        if (typeof entry === 'string') {
            // Fetch the URL and convert the response Blob to a data URL
            fetch(entry).then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            }).then(blob => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.onerror = () => reject(new Error('FileReader failed'));
                r.readAsDataURL(blob);
            }).catch(reject);
            return;
        }
        reject(new Error('Unknown entry type'));
    });
}

// Minimalist SVGs
const svgMove = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20"/></svg>`;
const svgEdit = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const svgDup = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const svgTrash = `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;

// Short, square-proportioned arrows for the EDGE GAP toggles. Each is a
// stubby arrow with a clearly visible head and a short shaft — no long
// tails like the Unicode ↑↓←→ characters. 24x24 viewBox so they sit at
// the same visual weight as the other icon-btn SVGs in the icon row.
//
// Geometry: shaft from center (12,12) out to a tip near the edge, with
// two diagonal lines forming the chevron head. Head spans ~6px wide
// for a balanced, "square-ish" look.
const svgArrowUp    = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 18V8M8 12l4-4 4 4"/></svg>`;
const svgArrowDown  = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 6v10M8 12l4 4 4-4"/></svg>`;
const svgArrowLeft  = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 12H8M12 8l-4 4 4 4"/></svg>`;
const svgArrowRight = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 12h10M12 8l4 4-4 4"/></svg>`;

// Edge-gap collapsed icon: a central rectangle (the frame) with four short
// arrows pointing outward to suggest "distance to wall edges in all 4
// directions." Compact, distinct from the individual direction icons.
const svgEdgeGap = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="6" height="6" fill="none"/><path d="M12 7V3M12 21v-4M7 12H3M21 12h-4"/></svg>`;

// Per-frame quick-alignment icons.
// svgSnapHang: frame outline with a horizontal line through its middle —
//   suggests "snap this frame's center to a horizontal reference line."
// svgSnapWallCenter: frame outline with a vertical line through its middle —
//   suggests "snap this frame's center to a vertical wall-center reference."
const svgSnapHang = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="6" y="7" width="12" height="10" rx="1"/><path d="M3 12h18" stroke-dasharray="2 2"/></svg>`;
const svgSnapWallCenter = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="12" rx="1"/><path d="M12 3v18" stroke-dasharray="2 2"/></svg>`;

// ─── Sidebar icon set ────────────────────────────────────────────────────
// Used by the elevation sidebar's section headers and inline button icons.
// All 24x24 viewBox, single-stroke style so they harmonize with each other.
// svgImport: down-arrow into a tray — "bring frames in"
const svgImport = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`;
// svgPlus: simple plus — Add Selected button
const svgPlus = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
// svgZoom: magnifying glass with plus inside (zoom in) — generic zoom icon
const svgZoom = `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M8 11h6M11 8v6"/></svg>`;
// svgFit: corners pointing outward — fit content to viewport
const svgFit = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/></svg>`;
// svgDownload: down-arrow over baseline — export/download (used for PNG export)
const svgDownload = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 15V3M7 10l5 5 5-5M3 19h18"/></svg>`;
// svgWallWidth: horizontal arrows between two posts — width measurement
const svgWallWidth = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 6v12M20 6v12M6 12h12M6 12l3-3M6 12l3 3M18 12l-3-3M18 12l-3 3"/></svg>`;
// svgWallHeight: vertical arrows between top/bottom — height measurement
const svgWallHeight = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 4h12M6 20h12M12 6v12M12 6l-3 3M12 6l3 3M12 18l-3-3M12 18l3-3"/></svg>`;
// svgHang: small picture-frame at a hang line — "where art centers vertically"
const svgHang = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="8" rx="1"/><path d="M3 18h18"/></svg>`;
// svgFont: capital A with subtle baseline — font-size adjust
const svgFont = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 20l5-14h4l5 14M7 15h10"/></svg>`;
// svgLabel: text "A" — labels toggle (existing button became icon)
const svgLabelIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 20l5-14h4l5 14M7 15h10"/></svg>`;
// svgOd: measurement bracket [ — ] — OD dimensions
const svgOdIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 6v12M21 6v12M3 12h18"/></svg>`;
// svgSpacing: dashed horizontal line with end-ticks — spacing dims
const svgSpacingIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 12h2M9 12h2M14 12h2M19 12h2M4 8v8M21 8v8"/></svg>`;
// svgPersonIcon: simple person silhouette — already in HTML, kept here for reference
const svgPersonIcon = `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm-1.5 19v-5.5H9V10c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v5.5h-1.5V21h-3z"/></svg>`;
// svgGuides: vertical ruler with tick marks
const svgGuidesIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 3v18M9 6h6M9 10h6M9 14h6M9 18h6"/></svg>`;
// svgGrid: 3x3 grid
const svgGridIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`;
// svgCenters: crosshair
const svgCentersIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>`;
// svgAlign: stacked horizontal lines (alignment indicator)
const svgAlign = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 6h12M3 12h18M3 18h9"/></svg>`;
// svgSort: A above Z with down-arrow — alphabetical sort
const svgSort = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 4v16M3 17l3 3 3-3M14 4h7l-7 7h7M14 13h7l-7 7h7"/></svg>`;

const dashDefaultData = { 
    id: "ART.001", imageCode: "TBD", level: "1", qty: 0, product: "Framed Art", location: "LOBBY", 
    // Phase A additions: artwork attribution + frame profile depth + paper type.
    // These are visible to the team in the dashboard form and the CSV. Several
    // are optional: empty values render as blank cells in CSV and are skipped
    // in InDesign spec blocks (no "TBD" placeholders).
    artist: "", artworkTitle: "", artType: "",
    fColorName: "", fHeight: 0, rabbetDepth: 0,
    paperType: "Fine Art Paper",
    bleed: 0.25, canvasDepth: "", canvasWrap: "", floaterInset: 0.75,
    // Float Mount fields. useFloatMount controls whether the row uses Mat Controls
    // or Float Mount as its inner-area treatment. Defaults to false (mats).
    // The Shadow Box product auto-flips this to true on selection. The fields
    // themselves coexist with mat fields on every row — only one path renders at a time.
    useFloatMount: false,
    // Faux Mat: in standard mat mode (useFloatMount=false), if useFauxMat is on,
    // the print has a white border baked into the paper. Same as float mount's
    // sbPaperBorder concept — same field is reused — but it stacks below any
    // mat 1 / mat 2 instead of being the only treatment. Lets designers fake
    // a mat look without a real mat board, or add a paper white border under
    // existing mats for production reasons.
    useFauxMat: false,
    sbBackerColorName: "B 97 White", sbBackerColorHex: "#ffffff",
    sbPaperColorName: "White", sbPaperColorHex: "#ffffff",
    sbPaperMargin: 1.5, sbPaperBorder: 0.5,
    sbPaperEdge: "clean", sbPaperEdgeSeed: 0,
    extW: 24, extH: 24, fType: "color", fW: 0.75, fColor: "#000000", fCode: "Standard Black", 
    swatchDataUrl: "", swatchName: "",
    m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1Locked: false, m1ColorName: "B 97 White", m1ColorHex: "#ffffff",
    m2A: false, m2: 0.25, m2ColorName: "B 97 White", m2ColorHex: "#ffffff", matsLinked: true,
    glass: "2mm Standard", hardware: "3-Point Security", mount: "Standard Mount", backing: "Foamcore", notes: "", prodNotes: "" 
};
let dashProjectData = [ JSON.parse(JSON.stringify(dashDefaultData)) ];

let warnedLinkedFrames = new Set(); 

let elevUnit = 'in';

// Unit info table. Single source of truth for unit-specific values used
// throughout the tool. When adding/changing units, update only this.
// - factor: multiplier from INCHES to this unit (1 in = factor of <unit>)
// - suffix: how the unit appears next to a dimension value (e.g. '24"')
// - label: short text for unit toggles
// - decimals: how many decimal places to show in displayed dimensions
const UNIT_INFO = {
    in: { factor: 1,    suffix: '"',   label: 'IN', decimals: 0 },
    cm: { factor: 2.54, suffix: ' cm', label: 'CM', decimals: 1 },
    mm: { factor: 25.4, suffix: ' mm', label: 'MM', decimals: 0 },
};
function unitInfo(u) { return UNIT_INFO[u] || UNIT_INFO.in; }
// Conversion multiplier between any two units. unitFactor('in', 'cm') = 2.54.
// Math: 1 in = X (unit_to / unit_from) means factor = UNIT[to]/UNIT[from].
function unitFactor(from, to) {
    return unitInfo(to).factor / unitInfo(from).factor;
}
let elevations = [{ name: "Elevation 1", frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }];
let currentElevIndex = 0;
let elevFrames = elevations[0].frames;
// When true, uploaded artwork images fill frame openings in the elevation.
// The PDF "beauty" page uses true; the technical drawing page sets it false.
let _showArtwork = true;
let elevPersonPos = elevations[0].personPos;
let elevScale = 1;
// Precise wall dims resolved each drawElevAll (full precision, not the
// rounded input field). Sub-renderers read these so edge-gap and other
// wall-dependent dims don't drift/jitter on unit toggles.
let elevResolvedWallW = 1;
let elevResolvedWallH = 1;
let elevZoomFactor = 1;

let pendingDuplicateIndex = null;

// ─────────────────────────────────────────────────────────────────────
// UNDO / REDO HISTORY SYSTEM
// ─────────────────────────────────────────────────────────────────────
// Two stacks of project snapshots. A snapshot is a deep JSON-clone of all
// project state (dashboard rows, elevations, active index). On user action,
// the change is applied normally and then pushHistory() captures a new
// snapshot. Undo restores the previous snapshot; redo replays a snapshot
// that was previously undone.
//
// Contract for callers:
//   1. Apply the state change first (mutate dashProjectData / elevations).
//   2. Update the UI (drawElevAll, initElevControls, etc).
//   3. THEN call pushHistory().
// This order means "the snapshot represents the state AFTER the change."
// On undo, we pop one snapshot and restore the one BEFORE it — which is
// why we also push an initial snapshot of the starting state on load.
//
// Drag operations push only on mouseup (not on every move frame) — they
// represent ONE undoable action even though they fire many mousemove events.
const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];

// Snapshot current project state as a plain JS object (deep-cloned).
function snapshotProjectState() {
    return {
        dashProjectData: JSON.parse(JSON.stringify(dashProjectData)),
        elevations: JSON.parse(JSON.stringify(elevations)),
        currentElevIndex: currentElevIndex,
    };
}

// Restore the given snapshot in-place. Re-binds derived references
// (elevFrames, elevPersonPos) so existing code keeps working.
function restoreProjectState(snap) {
    // CRITICAL: deep-clone the snapshot BEFORE installing into live state.
    // Without this, the live state shares object references with the snapshot
    // stored in undoStack. Any subsequent mutation to elevFrames or any
    // elevation property would mutate the stored snapshot too — corrupting
    // the history. (Previously caused "import frames again after undo" to
    // overwrite the post-undo snapshot, breaking the timeline.)
    const cloned = JSON.parse(JSON.stringify(snap));
    // Replace the arrays' contents in-place instead of reassigning,
    // because some code holds references to the original arrays.
    dashProjectData.length = 0;
    cloned.dashProjectData.forEach(r => dashProjectData.push(r));
    elevations.length = 0;
    cloned.elevations.forEach(e => elevations.push(e));
    currentElevIndex = cloned.currentElevIndex;
    // Re-bind derived globals
    if (elevations[currentElevIndex]) {
        elevFrames = elevations[currentElevIndex].frames;
        elevPersonPos = elevations[currentElevIndex].personPos;
    }
}

// After a state change, capture it for undo. Clears the redo stack
// (any new action invalidates the redo timeline). Caps history depth.
// Also marks the project as having unsaved changes and schedules an
// autosave to localStorage. The initial snapshot on page load is the
// exception — it doesn't represent a user change so doesn't mark dirty.
let _isFirstHistoryPush = true;
function pushHistory() {
    undoStack.push(snapshotProjectState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;  // new action invalidates future
    updateUndoButtons();
    if (_isFirstHistoryPush) {
        _isFirstHistoryPush = false;
    } else {
        markDirty();
        scheduleAutosave();
    }
}

// Undo: pop current state into redo, restore previous state.
// We need at least 2 snapshots: current and the one we're going back to.
function undo() {
    if (undoStack.length < 2) return;  // nothing to undo
    const current = undoStack.pop();
    redoStack.push(current);
    const previous = undoStack[undoStack.length - 1];
    restoreProjectState(previous);
    refreshAllViews();
    updateUndoButtons();
}

// Redo: pop from redo stack, push back to undo stack, restore.
function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(next);
    restoreProjectState(next);
    refreshAllViews();
    updateUndoButtons();
}

// Re-render everything after a state restore. Called by undo/redo.
// Both views are refreshed so the user sees the change wherever they
// happen to be looking. Also syncs DOM inputs (wall width/height) from
// the restored data — otherwise input fields would show stale values.
function refreshAllViews() {
    // Sync wall dimension inputs from restored elevation data
    const ce = elevations[currentElevIndex];
    if (ce) {
        const wW = document.getElementById('wallW');
        const wH = document.getElementById('wallH');
        if (wW && ce.wallW != null) wW.value = ce.wallW;
        if (wH && ce.wallH != null) wH.value = ce.wallH;
    }

    // Dashboard refresh: re-render the table, reload the form inputs from
    // the currently selected row, refresh the push-to-wall selector.
    if (typeof renderDashTable === 'function') renderDashTable();
    if (typeof loadDashDataIntoControls === 'function' && dashProjectData[dashSelectedRowIndex]) {
        // Clamp selected row index in case current selection no longer exists
        if (dashSelectedRowIndex >= dashProjectData.length) {
            dashSelectedRowIndex = Math.max(0, dashProjectData.length - 1);
        }
        loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    }
    if (typeof populateDashPushSelector === 'function') populateDashPushSelector();
    if (typeof recalculateDashboardQuantities === 'function') recalculateDashboardQuantities();

    // Elevation refresh — re-render panels and wall
    if (typeof initElevControls === 'function') initElevControls();
    if (typeof drawElevAll === 'function') drawElevAll();

    // Nav tabs — re-render so tab list reflects current elevations array
    // and the active tab highlight follows the current view.
    if (typeof renderNavTabs === 'function') renderNavTabs();

    // Import dropdown — repopulate from restored dashProjectData so its checkbox
    // value indices match the actual data. Without this, ctrl+z past an "add
    // dashboard row" event would leave the dropdown showing stale row counts.
    if (typeof populateElevBulkList === 'function') populateElevBulkList();
}

// Update Undo/Redo button enabled state based on stack contents.
// Buttons are disabled when there's nothing to undo/redo.
function updateUndoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = undoStack.length < 2;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// Keyboard shortcuts: Ctrl+Z / Cmd+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo.
// Listening at document level so it works from anywhere in the tool.
// Skips shortcut if focus is in a text input/textarea (so users can still
// undo their typing inside form fields without it triggering app undo).
document.addEventListener('keydown', function(e) {
    const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (inField) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    // Normalize key to lowercase because Shift makes letter keys uppercase
    // in e.key. Without this, the e.shiftKey + e.key==='z' check would
    // never match (it'd be 'Z' instead) and Ctrl+Shift+Z wouldn't redo.
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
});

// ─────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS FOR ELEVATION VIEW
// ─────────────────────────────────────────────────────────────────────
// Bindings (only fire when elevation view is active, focus is outside any
// text input, and at least one frame is selected for the operations that
// need a selection target):
//
//   ←  ↑  →  ↓       Nudge selected frames by SMALL step (defaults: 1" or 1cm)
//   Shift+arrows     Nudge selected frames by BIG step (defaults: 10" or 10cm)
//   Delete / Backspace   Remove all selected frames
//   Escape           Deselect all (also closes modals — see modal handlers)
//   Ctrl+D / Cmd+D   Duplicate the FIRST selected frame (single-target action)
//   Ctrl+G / Cmd+G   Toggle group on all selected frames
//
// Default nudge steps. Used as fallback if the DOM inputs aren't present
// or have invalid values. User can override via inputs in the elevation
// sidebar. Values are interpreted in whatever the current unit (in/cm) is.
const NUDGE_SMALL_DEFAULT = 1;
const NUDGE_BIG_DEFAULT = 10;

function getNudgeStep(big) {
    const id = big ? 'nudgeBig' : 'nudgeSmall';
    const el = document.getElementById(id);
    if (el) {
        const val = parseFloat(el.value);
        if (!isNaN(val) && val > 0) return val;
    }
    return big ? NUDGE_BIG_DEFAULT : NUDGE_SMALL_DEFAULT;
}

// Called on every input change to the nudge fields. Currently does nothing
// (values are read fresh on each keypress) but reserved for future side
// effects like saving to localStorage.
function updateNudgeSteps() {
    // No-op for now — values are read live by getNudgeStep on each keypress.
    // If we later want to persist these across page loads, save to
    // localStorage here.
}

// Called when user changes the visual Grid Size in Settings. Re-renders
// the elevation so the grid lines update at the new spacing immediately.
function updateGridSize() {
    if (typeof drawElevAll === 'function') drawElevAll();
}

// Called when user changes the Drag Snap increment in Settings. No
// immediate visual change — the new value is read on the next drag.
// Kept as a function for symmetry with updateGridSize and future use
// (e.g. saving to localStorage, showing a hint).
function updateDragSnap() {
    // No-op for now; value is read live by the drag handler.
}

// Open the Precision modal — shows nudge config + keyboard shortcuts cheatsheet.
// Triggered by the gear icon in the Layout Guides section. The modal shares
// nudgeSmall/nudgeBig inputs with the (now-removed) sidebar inputs, so
// existing getNudgeStep() still works since it looks up by ID.
function openPrecisionModal() {
    seedAnnotationStyleInputs();
    const snapCb = document.getElementById('snapEnabledToggle');
    if (snapCb) snapCb.checked = elevSnapEnabled;
    const dimSnapCb = document.getElementById('dimSnapEnabledToggle');
    if (dimSnapCb) dimSnapCb.checked = elevDimSnapEnabled;
    document.getElementById('precisionModal').style.display = 'flex';
}

// Seed the Label & Dimension Style inputs (now living in the Settings modal)
// from the current global annotationStyle.
function seedAnnotationStyleInputs() {
    const c = document.getElementById('annotColor');
    const w = document.getElementById('annotWeight');
    const fs = document.getElementById('annotFontSize');
    if (c) { c.value = annotationStyle.color; const hx = document.getElementById('annotColorHex'); if (hx) hx.textContent = annotationStyle.color; }
    if (w) { w.value = annotationStyle.weight; const wv = document.getElementById('annotWeightVal'); if (wv) wv.textContent = annotationStyle.weight + 'px'; }
    if (fs) { fs.value = annotationStyle.fontSize; const fv = document.getElementById('annotFontSizeVal'); if (fv) fv.textContent = annotationStyle.fontSize + 'px'; }
    setAnnotDash(annotationStyle.dash);
    // Font family dropdown
    const ff = document.getElementById('annotFontFamily');
    if (ff) ff.value = annotationStyle.fontFamily || 'Arial, Helvetica, sans-serif';
    // Weight buttons
    const fw = annotationStyle.fontWeight || 600;
    const wReg = document.getElementById('annotWeightReg');
    const wSemi = document.getElementById('annotWeightSemi');
    const wBold = document.getElementById('annotWeightBold');
    if (wReg) wReg.classList.toggle('active', fw === 400);
    if (wSemi) wSemi.classList.toggle('active', fw === 600);
    if (wBold) wBold.classList.toggle('active', fw === 700);
    // SVG frame mode buttons
    const mTex = document.getElementById('svgModeTexture');
    const mCol = document.getElementById('svgModeColor');
    if (mTex) mTex.classList.toggle('active', svgFrameMode === 'texture');
    if (mCol) mCol.classList.toggle('active', svgFrameMode === 'autocolor');
}

function setAnnotFontWeight(wt) {
    annotationStyle.fontWeight = wt;
    ['annotWeightReg','annotWeightSemi','annotWeightBold'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.remove('active');
    });
    const map = { 400: 'annotWeightReg', 600: 'annotWeightSemi', 700: 'annotWeightBold' };
    const b = document.getElementById(map[wt]);
    if (b) b.classList.add('active');
    applyAnnotationStyleFromModal();
}

function setSvgFrameMode(mode) {
    svgFrameMode = mode;
    saveSvgFrameMode();
    const mTex = document.getElementById('svgModeTexture');
    const mCol = document.getElementById('svgModeColor');
    if (mTex) mTex.classList.toggle('active', mode === 'texture');
    if (mCol) mCol.classList.toggle('active', mode === 'autocolor');
}

// Returns array of selected-and-active frames (refs into elevFrames).
// Selection-only contract per user decision — no fallback to all-active.
function getSelectedFrames() {
    return elevFrames.filter(f => f.selected && f.active);
}

// ──────────────────────────────────────────────────────────────────────────
// GROUP DIMENSION CALLOUTS
// ──────────────────────────────────────────────────────────────────────────
// A group-dimension is a dashed bounding box drawn around a set of selected
// frames, with width + height measurement callouts. Stored per-elevation in
// elevations[i].groupDims. Each entry references frames by LETTER so the box
// auto-recomputes (tracks frame moves) on every render. Style is per-entry,
// seeded from the global default below, and editable in the settings popup.

// Global default style for new annotations (group dims, and later text/lines).
// Persisted to localStorage so a user's preferred look sticks across sessions.
let annotationStyle = {
    color: '#e00000',   // red, matching the client's install-drawing convention
    weight: 2,          // line weight in px
    dash: true,         // dashed (true) vs solid (false)
    fontSize: 13,       // measurement label font size in px
    // Font family for all dimension text. Arial is installed on virtually
    // every Mac and PC, so SVG exports open without missing-font errors in
    // Illustrator/InDesign regardless of platform.
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: 600,    // 400=Regular, 600=Semibold, 700=Bold
};

// SVG export frame mode: 'texture' embeds the rendered frame raster (crisp
// but large files); 'autocolor' draws frames as solid vector rects colored to
// match the swatch's average color (tiny files, fully vector). Persisted.
let svgFrameMode = 'texture';

function loadSvgFrameMode() {
    try {
        const v = localStorage.getItem('svgFrameMode');
        if (v === 'autocolor' || v === 'texture') svgFrameMode = v;
    } catch (e) { /* default */ }
}
function saveSvgFrameMode() {
    try { localStorage.setItem('svgFrameMode', svgFrameMode); } catch (e) {}
}

// Compute the average color of an image (drawn small for speed). Returns a
// hex string. Used by autocolor SVG mode so a wood-grain swatch becomes a
// representative solid color.
function averageColorOfImage(img) {
    try {
        const c = document.createElement('canvas');
        const S = 16;
        c.width = S; c.height = S;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, S, S);
        const data = x.getImageData(0, 0, S, S).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue; // skip transparent
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (n === 0) return null;
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
}

function loadAnnotationStyle() {
    try {
        const raw = localStorage.getItem('annotationStyle');
        if (raw) {
            const s = JSON.parse(raw);
            if (s && typeof s === 'object') annotationStyle = Object.assign(annotationStyle, s);
        }
    } catch (e) { /* keep defaults */ }
    applyAnnotationStyleToCSSVars();
}

// Push the current annotationStyle into the :root CSS variables that drive
// every dimension/label type (arch dims, frame dims, OD tags, center lines,
// floor/ceiling dims). This is what makes the single style panel control
// ALL dimension callouts, not just the group dims. The group-dim renderer
// reads annotationStyle directly (its elements are JS-positioned), but it
// uses the same source object, so everything stays consistent.
function applyAnnotationStyleToCSSVars() {
    const root = document.documentElement;
    root.style.setProperty('--dim-color', annotationStyle.color);
    root.style.setProperty('--dim-font-size', (annotationStyle.fontSize || 13) + 'px');
    root.style.setProperty('--dim-weight', (annotationStyle.weight || 2) + 'px');
    root.style.setProperty('--dim-line-style', annotationStyle.dash ? 'dashed' : 'solid');
    root.style.setProperty('--dim-font-family', annotationStyle.fontFamily || 'Arial, Helvetica, sans-serif');
    root.style.setProperty('--dim-font-weight', annotationStyle.fontWeight || 600);
}

function saveAnnotationStyle() {
    try { localStorage.setItem('annotationStyle', JSON.stringify(annotationStyle)); }
    catch (e) { /* ignore */ }
}

// Ensure the current elevation has a groupDims array (older saved projects
// won't have it). Returns the array.
function getElevGroupDims() {
    const ce = elevations[currentElevIndex];
    if (!ce) return [];
    if (!Array.isArray(ce.groupDims)) ce.groupDims = [];
    return ce.groupDims;
}

// Create a group-dimension callout from the currently-selected frames.
// Needs at least 1 selected frame (1 frame = its own bounding box, which is
// occasionally useful, but we require 2+ to be meaningful as a "group").
let groupDimSeq = 0;
function createGroupDimFromSelection() {
    const sel = getSelectedFrames();
    if (sel.length < 2) {
        showInfoModal('Select Frames First',
            'Select at least two frames (Shift-click or drag a selection box) before adding a group dimension.');
        return;
    }
    const dims = getElevGroupDims();
    const entry = {
        id: 'gd_' + (Date.now().toString(36)) + '_' + (groupDimSeq++),
        frameLetters: sel.map(f => f.letter),
        showWidth: true,
        showHeight: true,
        // Per-entry style snapshot from the current global default.
        style: Object.assign({}, annotationStyle),
    };
    dims.push(entry);
    if (typeof dimVisibility !== 'undefined') { dimVisibility.groupBox = true; saveDimVisibility(); }
    drawElevAll();
    pushHistory();
}

// Remove a group dimension by id.
function removeGroupDim(id) {
    const dims = getElevGroupDims();
    const idx = dims.findIndex(d => d.id === id);
    if (idx >= 0) {
        dims.splice(idx, 1);
        drawElevAll();
        pushHistory();
    }
}

// Compute the bounding box (in inches, elevation coords) of the frames a
// group-dim references. Returns null if no referenced frames are still
// present/active (e.g. user deleted them after creating the callout).
function computeGroupDimBBox(entry) {
    const refs = elevFrames.filter(f => f.active && entry.frameLetters.indexOf(f.letter) >= 0);
    if (refs.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    refs.forEach(f => {
        if (f.x < minX) minX = f.x;
        if (f.y < minY) minY = f.y;
        if (f.x + f.w > maxX) maxX = f.x + f.w;
        if (f.y + f.h > maxY) maxY = f.y + f.h;
    });
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Nudge selected frames by (dx, dy) inches. dx negative = left, dy negative = down.
function nudgeSelectedFrames(dx, dy) {
    const sel = getSelectedFrames();
    if (!sel.length) return;
    sel.forEach(f => { f.x += dx; f.y += dy; });
    drawElevAll();
    pushHistory();
}

// Remove all selected frames. Confirms via showInfoModal-style prompt
// only if multiple are selected, to prevent accidents.
function deleteSelectedFrames() {
    const sel = getSelectedFrames();
    if (!sel.length) return;
    // Find indices in elevFrames (reverse order so splice doesn't shift remaining indices)
    const indicesToRemove = [];
    elevFrames.forEach((f, i) => { if (f.selected && f.active) indicesToRemove.push(i); });
    indicesToRemove.sort((a, b) => b - a);
    indicesToRemove.forEach(i => elevFrames.splice(i, 1));
    // Re-letter remaining frames so labels stay sequential A, B, C...
    elevFrames.forEach((f, i) => { f.letter = getElevLetter(i); });
    initElevControls();
    drawElevAll();
    if (typeof recalculateDashboardQuantities === 'function') recalculateDashboardQuantities();
    pushHistory();
}

// Duplicate the first selected frame using existing duplicate logic.
// Opens the duplicate modal (which asks new ID vs same ID) — same as
// clicking the per-frame Duplicate button.
function duplicateSelectedFrames() {
    const sel = getSelectedFrames();
    if (!sel.length) return;
    // Find the index of the first selected frame in elevFrames
    const idx = elevFrames.findIndex(f => f.selected && f.active);
    if (idx >= 0) {
        pendingDuplicateIndex = idx;
        document.getElementById('duplicateModal').style.display = 'flex';
    }
}

// Toggle group on all selected frames. If any are not grouped, group all.
// If all are grouped, ungroup all. Same selection-as-input pattern.
function toggleGroupSelectedFrames() {
    const sel = getSelectedFrames();
    if (!sel.length) return;
    const anyNotGrouped = sel.some(f => !f.isGrouped);
    sel.forEach(f => { f.isGrouped = anyNotGrouped; });
    initElevControls();
    drawElevAll();
    pushHistory();
}

// Clear all selections (Escape key).
function deselectAllFrames() {
    let changed = false;
    elevFrames.forEach(f => { if (f.selected) { f.selected = false; changed = true; } });
    if (changed) drawElevAll();
    // Selection isn't undoable so no pushHistory()
}

// Returns true if elevation view is the currently active view.
function isElevationViewActive() {
    const elev = document.getElementById('view-elevation');
    return elev && getComputedStyle(elev).display !== 'none';
}

document.addEventListener('keydown', function(e) {
    // Skip if user is typing into a field — they need normal text input behavior
    const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (inField) return;
    // Only operate in elevation view (these all act on elevation frames)
    if (!isElevationViewActive()) return;
    const ctrlOrMeta = e.ctrlKey || e.metaKey;

    // Arrow keys: nudge selected frames
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        const sel = getSelectedFrames();
        if (!sel.length) return;  // nothing to nudge; let key event pass through
        const step = getNudgeStep(e.shiftKey);
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft')  dx = -step;
        if (e.key === 'ArrowRight') dx =  step;
        if (e.key === 'ArrowUp')    dy =  step;   // y is up-positive in elevation coords
        if (e.key === 'ArrowDown')  dy = -step;
        e.preventDefault();
        nudgeSelectedFrames(dx, dy);
        return;
    }

    // Delete / Backspace: remove selected frames
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = getSelectedFrames();
        if (!sel.length) return;
        e.preventDefault();
        deleteSelectedFrames();
        return;
    }

    // Escape: deselect all (dashboard clears multi-select; elevation deselects frames)
    if (e.key === 'Escape') {
        if (currentView === 'dashboard') {
            clearDashMultiSelection();
        } else {
            deselectAllFrames();
        }
        return;
    }

    // Ctrl+D / Cmd+D: duplicate first selected frame
    if (ctrlOrMeta && (e.key === 'd' || e.key === 'D')) {
        const sel = getSelectedFrames();
        if (!sel.length) return;
        e.preventDefault();  // prevent browser's "bookmark this page"
        duplicateSelectedFrames();
        return;
    }

    // Ctrl+G / Cmd+G: toggle group on selected
    if (ctrlOrMeta && (e.key === 'g' || e.key === 'G')) {
        const sel = getSelectedFrames();
        if (!sel.length) return;
        e.preventDefault();  // prevent browser's "find next"
        toggleGroupSelectedFrames();
        return;
    }
});
// ─────────────────────────────────────────────────────────────────────
// END KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────

// Capture initial state on load so the first undo has somewhere to go back to.
// Wrapped in DOMContentLoaded so the rest of the app has finished initializing.
// Also renders the version pill in the header (depends on the #versionPill
// element existing in the DOM).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        pushHistory();
        renderVersionPill();
        initDashViewMode();
    });
} else {
    pushHistory();
    renderVersionPill();
    initDashViewMode();
}
// ─────────────────────────────────────────────────────────────────────
// END UNDO / REDO HISTORY SYSTEM
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// SAVE / AUTOSAVE / UNSAVED-CHANGES INDICATOR
// ─────────────────────────────────────────────────────────────────────
// "Dirty" tracking: a flag indicating the project has changes not yet saved
// to a JSON file. Set by pushHistory() on every state change. Cleared when
// the user explicitly saves via the Save Project button or Ctrl+S, or
// loads a fresh project.
//
// Autosave: a separate mechanism that periodically writes the current state
// to localStorage so a browser crash or accidental close doesn't lose work.
// Doesn't replace explicit save — that's still file-based. On page load we
// check for a recent autosave and offer to restore it.
//
// Indicator: a small visible dot in the page title area showing the
// project has unsaved changes. Also a beforeunload handler that prompts
// before closing the tab if there are unsaved changes.

let _isDirty = false;
const AUTOSAVE_KEY = 'frame-tool-autosave';
const AUTOSAVE_DEBOUNCE_MS = 500;  // wait this long after last change before autosaving
let _autosaveTimer = null;

// Mark the project as having unsaved changes. Updates the visual indicator.
function markDirty() {
    if (!_isDirty) {
        _isDirty = true;
        updateDirtyIndicator();
    }
}

// Mark the project as clean (saved). Called by save and load operations.
function markClean() {
    if (_isDirty) {
        _isDirty = false;
        updateDirtyIndicator();
    }
}

// Update the small "unsaved" dot next to the Save Project button. Created
// on first call if not present. Hidden via display:none when clean. Placed
// next to the Save button so the visual marker is paired with the action
// that clears it.
function updateDirtyIndicator() {
    let dot = document.getElementById('unsavedIndicator');
    if (!dot) {
        dot = document.createElement('span');
        dot.id = 'unsavedIndicator';
        dot.title = 'Unsaved changes — press Ctrl+S to save';
        dot.style.cssText = 'display:none; width:10px; height:10px; border-radius:50%; background:#ff8c00; flex-shrink:0; box-shadow: 0 0 6px rgba(255,140,0,0.5);';
        // Insert right before the Save Project button so the dot lives next
        // to its remedy. Find the Save button by its visible text.
        const buttons = document.querySelectorAll('.app-top-nav button');
        let saveBtn = null;
        buttons.forEach(b => { if (b.textContent.trim() === 'Save Project') saveBtn = b; });
        if (saveBtn && saveBtn.parentNode) {
            saveBtn.parentNode.insertBefore(dot, saveBtn);
        } else {
            // Fallback: stick it in the top nav somewhere
            const topNav = document.querySelector('.app-top-nav');
            if (topNav) topNav.appendChild(dot);
        }
    }
    dot.style.display = _isDirty ? 'inline-block' : 'none';
}

// Schedule an autosave to localStorage. Debounced — repeated calls within
// AUTOSAVE_DEBOUNCE_MS reset the timer, so rapid changes only trigger one
// save at the end of the burst.
function scheduleAutosave() {
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(performAutosave, AUTOSAVE_DEBOUNCE_MS);
}

// Actually write to localStorage. Wrapped in try/catch because localStorage
// can throw on quota exceeded (~5MB limit), private browsing mode, or
// disabled storage. We silently skip on error rather than crashing the app.
function performAutosave() {
    try {
        const projName = (document.getElementById('g_projName') || {}).value || 'Untitled';
        const payload = {
            type: 'master-studio-autosave-v1',
            timestamp: Date.now(),
            projName: projName,
            data: snapshotProjectState(),  // reuses the undo snapshot format
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch (err) {
        // Quota exceeded, private mode, etc. Silent failure — autosave is a
        // safety net, not a primary feature.
        console.warn('Autosave failed:', err);
    }
}

// Clear the autosave slot. Called after a successful save or load — at
// that point the in-memory state matches a known file, so the autosave
// is no longer the most-recent unsaved work.
function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (err) {}
}

// On page load, check for an autosave. If one exists from this session
// (less than 7 days old to avoid restoring ancient work) and the current
// project hasn't been modified, offer to restore.
function checkAutosaveOnLoad() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (payload.type !== 'master-studio-autosave-v1') return;
        const ageDays = (Date.now() - payload.timestamp) / (1000 * 60 * 60 * 24);
        if (ageDays > 7) {
            // Stale — clear and skip
            clearAutosave();
            return;
        }
        // Format a human-readable "how long ago"
        const minutesAgo = Math.round((Date.now() - payload.timestamp) / 60000);
        let timeStr;
        if (minutesAgo < 1) timeStr = 'less than a minute ago';
        else if (minutesAgo < 60) timeStr = `${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`;
        else timeStr = `${Math.round(minutesAgo / 60)} hour${minutesAgo < 120 ? '' : 's'} ago`;

        // Don't auto-restore — ask. Use a small custom prompt rather than
        // confirm() so we can style it consistently.
        const projName = payload.projName || 'Untitled';
        if (confirm(`Found unsaved work from ${timeStr}\n("${projName}")\n\nRestore it?\n\nClick OK to restore, Cancel to discard.`)) {
            restoreProjectState(payload.data);
            refreshAllViews();
            // After restore, push fresh history (clearing prior so undo doesn't
            // jump back to the pre-restore empty state).
            undoStack.length = 0;
            redoStack.length = 0;
            _isFirstHistoryPush = true;
            pushHistory();
            markDirty();  // the restored state isn't yet saved to a file
        } else {
            clearAutosave();
        }
    } catch (err) {
        console.warn('Autosave check failed:', err);
    }
}

// Save the project to a JSON file with a sensible name. Thin wrapper over
// saveMasterProject for use by the Ctrl+S handler. saveMasterProject itself
// handles markClean and clearAutosave so we don't need to duplicate here.
function saveProjectWithIndicator() {
    if (typeof saveMasterProject === 'function') saveMasterProject();
}

// Beforeunload handler: warn before closing/refreshing if there are unsaved
// changes. The browser shows its own generic message; we just need to
// returnValue to a non-empty string to trigger it.
window.addEventListener('beforeunload', function(e) {
    if (_isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

// Ctrl+S to save. Works anywhere in the app, including when focus is in a
// text field — saving is a global action users expect to always work.
// Browser's default "save page as" is suppressed.
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveProjectWithIndicator();
    }
});

// Initialize dirty indicator on app load (creates the dot, hidden).
// Wrapped in DOMContentLoaded so DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateDirtyIndicator();
        // Check for autosave AFTER a small delay so the rest of the app's
        // init code (which calls pushHistory) has finished. Otherwise the
        // restore would be overwritten by the initial pushHistory.
        setTimeout(checkAutosaveOnLoad, 200);
    });
} else {
    updateDirtyIndicator();
    setTimeout(checkAutosaveOnLoad, 200);
}
// ─────────────────────────────────────────────────────────────────────
// END SAVE / AUTOSAVE / UNSAVED-CHANGES
// ─────────────────────────────────────────────────────────────────────

// =========================================================================
// INITIALIZATION & NAVIGATION
// =========================================================================
function initMasterApp() {
    document.getElementById('g_date').valueAsDate = new Date();
    renderNavTabs();
    selectDashRow(0); 
    populateDashPushSelector();
    updateDimFontSize();
    loadBundledLibrary().then(() => {
        // After the bundled library is loaded, restore any swatches the user
        // previously uploaded. Saved entries override bundled ones with the
        // same code, matching the precedence rule of live syncDashLibraryFolder.
        restoreCustomLibraryFromStorage();
    });
    loadAnnotationStyle(); // restore saved annotation color/weight/dash defaults
    loadDimVisibility();   // restore saved per-element dimension hide flags
    loadUnitSuffixPref();  // restore interior unit-suffix on/off preference
    loadSvgFrameMode();    // restore SVG frame export mode (texture/autocolor)
    loadSnapPref();        // restore snap-to-align on/off preference
    loadDimSnapPref();     // restore dimension-drag snap preference

    // Custom measured-line tool: wall click (capture phase so it runs before
    // frame handlers when the tool is active), 'M' shortcut, Delete to remove.
    const wallEl = document.getElementById('wall');
    if (wallEl) {
        wallEl.addEventListener('mousedown', function (e) {
            if (lineToolActive) { handleLineToolClick(e); return; }
            // Click on empty space (not a dim/line) deselects.
            if ((selectedCustomLine || selectedDimId) && !e.target.closest('.custom-line') && !e.target.closest('.arch-dim')) {
                selectedCustomLine = null;
                selectedDimId = null;
                drawElevAll();
            }
        }, true);
        // Live anchor-point indicator: blue dot snaps to the nearest anchor
        // while the measure tool is active.
        wallEl.addEventListener('mousemove', function (e) {
            if (!lineToolActive) return;
            updateAnchorHoverDot(e);
        });
        wallEl.addEventListener('mouseleave', function () {
            const d = document.getElementById('anchor-hover-dot');
            if (d) d.style.display = 'none';
        });
    }
    document.addEventListener('keydown', function (e) {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
        if (typing) return;
        // Only act when the elevation view is visible.
        const elevVisible = (() => { const v = document.getElementById('view-elevation'); return v && getComputedStyle(v).display !== 'none'; })();
        if (!elevVisible) return;
        if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
            toggleLineTool();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCustomLine) {
            e.preventDefault();
            deleteCustomLine(selectedCustomLine);
        } else if (selectedCustomLine && e.key.indexOf('Arrow') === 0) {
            // Nudge the selected custom line's perpendicular offset.
            e.preventDefault();
            const L = getElevCustomLines().find(l => l.id === selectedCustomLine);
            if (L) {
                const stepIn = (e.shiftKey ? 5 : 1); // inches per press
                if (L.type === 'h') {
                    if (e.key === 'ArrowUp') L.off = (L.off || 0) + stepIn;
                    else if (e.key === 'ArrowDown') L.off = (L.off || 0) - stepIn;
                } else {
                    if (e.key === 'ArrowRight') L.off = (L.off || 0) + stepIn;
                    else if (e.key === 'ArrowLeft') L.off = (L.off || 0) - stepIn;
                }
                if (typeof pushHistory === 'function') pushHistory();
                drawElevAll();
            }
        } else if (e.key === 'Escape' && (lineToolActive || lineToolFirstPt || selectedCustomLine || selectedDimId)) {
            lineToolFirstPt = null;
            lineToolFirstAnchor = null;
            selectedCustomLine = null;
            selectedDimId = null;
            if (lineToolActive) toggleLineTool(false); else drawElevAll();
        }
    });
    
    document.addEventListener('click', function(event) {
        const container = document.getElementById('customSwatchContainer');
        const sList = document.getElementById('swatchDropdownList');
        if (container && !container.contains(event.target)) {
            if (sList && sList.style.display === 'block') { sList.style.display = 'none'; restoreDashThumbnail(); }
        }
        const bList = document.getElementById('bulkDropdownList');
        const bBtn = document.getElementById('bulkImportBtn');
        if (bList && bList.style.display === 'block') {
            if (bBtn && !bBtn.contains(event.target) && !bList.contains(event.target)) {
                bList.style.display = 'none';
            }
        }
    });

    // Auto-select content of number inputs on focus. Without this, clicking into
    // a field with an existing value (like "0" or "3") and typing causes the new
    // digits to be appended ("01", "33") instead of replacing — feels broken.
    // Scoped to number inputs only so text fields keep cursor-position focus behavior.
    document.addEventListener('focusin', function(event) {
        if (event.target && event.target.tagName === 'INPUT' && event.target.type === 'number') {
            // Defer the select() to next tick. Browsers sometimes ignore select()
            // called inside the focus event itself.
            setTimeout(() => { try { event.target.select(); } catch (e) {} }, 0);
        }
    });

    // Wire the Library Sync modal's drag-and-drop zone. Idempotent.
    initLibraryDropZone();
}

// Pull the bundled library manifest at startup. The manifest is generated by
// the GitHub Action in .github/workflows/build-library-manifest.yml, which
// scans the library/ folder on every push and writes library-manifest.json.
//
// The manifest format is a flat array of:
//   { vendor: "Larson-Juhl", collection: "Asbury", code: "L100ABC", width: 1.25, path: "library/Larson-Juhl/Asbury/L100ABC_1.25.png" }
//
// On 404 (no manifest yet), we fail silently so the app still works for users
// who only ever sync local folders.
async function loadBundledLibrary() {
    try {
        const res = await fetch('library-manifest.json', { cache: 'no-cache' });
        if (!res.ok) return; // no manifest published yet — that's fine
        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) return;
        items.forEach(it => {
            if (!it.vendor || !it.collection || !it.code || !it.path) return;
            if (!dashLocalLibrary[it.vendor]) dashLocalLibrary[it.vendor] = {};
            if (!dashLocalLibrary[it.vendor][it.collection]) dashLocalLibrary[it.vendor][it.collection] = [];
            // Skip if a duplicate code is already present (manual sync took priority)
            if (dashLocalLibrary[it.vendor][it.collection].some(x => x.code === it.code)) return;
            const entry = {
                code: it.code,
                width: parseFloat(it.width) || 1.25,
                file: it.path, // string path — _libEntryToUrl/_libEntryToDataUrl handle the URL case
            };
            // Floater swatches carry a faceWidth (canvas face visible from front);
            // floaterInset = faceWidth + FLOATER_SHADOW_REVEAL is computed at swatch-pick time.
            if (it.faceWidth !== undefined && it.faceWidth !== null && !isNaN(parseFloat(it.faceWidth))) {
                entry.faceWidth = parseFloat(it.faceWidth);
            }
            // Optional profile depth (Fr.H) and rabbet depth — captured from
            // filename tags _d<depth> and _r<rabbet>. Both auto-populate the
            // dashboard form fields when this swatch is picked.
            if (it.depth !== undefined && it.depth !== null && !isNaN(parseFloat(it.depth))) {
                entry.depth = parseFloat(it.depth);
            }
            if (it.rabbet !== undefined && it.rabbet !== null && !isNaN(parseFloat(it.rabbet))) {
                entry.rabbet = parseFloat(it.rabbet);
            }
            dashLocalLibrary[it.vendor][it.collection].push(entry);
        });
        populateDashVendorDropdown();
    } catch (e) {
        // network error, parse error, etc. — non-fatal, app still works.
        console.warn('Bundled library manifest could not be loaded:', e);
    }
}

// ──────────────────────────────────────────────────────────────────────────
// CUSTOM LIBRARY PERSISTENCE (localStorage)
// ──────────────────────────────────────────────────────────────────────────
// User-uploaded swatches (from the Sync Folder workflow) get auto-resized
// to a max dimension and saved to localStorage so they persist across
// browser sessions. The bundled GitHub library is unaffected — bundled
// entries store URL paths (strings), not data URLs, so they're naturally
// excluded from persistence (we serialise only data-URL entries).
//
// Size tradeoff: localStorage is ~5MB per domain. Resizing swatches to
// 600px max keeps each one to ~50-100KB after base64 encoding, so users
// can store ~50 swatches before hitting the limit.
//
// Override semantics: a saved entry with the same vendor/collection/code
// as a bundled entry wins (matches the existing manual-sync behaviour).

const CUSTOM_LIBRARY_STORAGE_KEY = 'dashCustomLibrary';
const CUSTOM_LIBRARY_MAX_DIMENSION = 600; // px on the longest side
const CUSTOM_LIBRARY_QUOTA_BYTES = 5 * 1024 * 1024; // 5MB conservative estimate

// Resize a data URL to fit within maxSize on its longest dimension. Returns
// the resized data URL via callback. Preserves aspect ratio. PNG output so
// transparency is kept (frame swatches sometimes use transparent corners).
// If the source is already smaller than maxSize, pass through unchanged.
function resizeImageDataUrl(srcDataUrl, maxSize, callback) {
    const img = new Image();
    img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w <= maxSize && h <= maxSize) {
            // Already small enough — no resize needed
            callback(srcDataUrl);
            return;
        }
        const scale = maxSize / Math.max(w, h);
        const newW = Math.round(w * scale);
        const newH = Math.round(h * scale);
        const c = document.createElement('canvas');
        c.width = newW; c.height = newH;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, newW, newH);
        // PNG (lossless) preserves transparency in frame swatches. The size
        // saving comes from the dimension reduction, not lossy compression.
        callback(c.toDataURL('image/png'));
    };
    img.onerror = () => callback(srcDataUrl); // fall back to original on error
    img.src = srcDataUrl;
}

// Serialise every user-uploaded swatch to localStorage. We walk the
// dashLocalLibrary structure and only persist entries whose `file` is a
// data URL string (which is the format manually uploaded swatches use after
// being read by FileReader.readAsDataURL). Bundled entries have URL paths
// like "library/vendor/collection/file.png" and are NOT data URLs, so they
// pass through this filter naturally.
function saveCustomLibraryToStorage() {
    try {
        const customEntries = [];
        Object.keys(dashLocalLibrary).forEach(vendor => {
            Object.keys(dashLocalLibrary[vendor]).forEach(collection => {
                dashLocalLibrary[vendor][collection].forEach(entry => {
                    // file may be a File object, a URL string (bundled), or a
                    // data URL string (manually uploaded + resized). We only
                    // persist data URLs.
                    if (typeof entry.file === 'string' && entry.file.startsWith('data:')) {
                        const persisted = {
                            vendor, collection,
                            code: entry.code,
                            width: entry.width,
                            file: entry.file,
                        };
                        if (entry.faceWidth !== undefined) persisted.faceWidth = entry.faceWidth;
                        if (entry.depth !== undefined) persisted.depth = entry.depth;
                        if (entry.rabbet !== undefined) persisted.rabbet = entry.rabbet;
                        customEntries.push(persisted);
                    }
                });
            });
        });
        const serialized = JSON.stringify(customEntries);
        localStorage.setItem(CUSTOM_LIBRARY_STORAGE_KEY, serialized);
        return { ok: true, count: customEntries.length, bytes: serialized.length };
    } catch (err) {
        // Most likely cause: QuotaExceededError. Don't blow up — return the
        // failure so the caller can surface a friendly message.
        return { ok: false, error: err.message || String(err) };
    }
}

// Restore previously-saved swatches into dashLocalLibrary. Called once on
// startup AFTER loadBundledLibrary completes. A saved entry overrides a
// bundled entry with the same vendor/collection/code (same precedence rule
// as the live syncDashLibraryFolder workflow). After hydration, refreshes
// the vendor dropdown so the user immediately sees their library.
function restoreCustomLibraryFromStorage() {
    try {
        const raw = localStorage.getItem(CUSTOM_LIBRARY_STORAGE_KEY);
        if (!raw) return;
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries) || entries.length === 0) return;
        entries.forEach(e => {
            if (!e.vendor || !e.collection || !e.code || !e.file) return;
            if (!dashLocalLibrary[e.vendor]) dashLocalLibrary[e.vendor] = {};
            if (!dashLocalLibrary[e.vendor][e.collection]) dashLocalLibrary[e.vendor][e.collection] = [];
            const arr = dashLocalLibrary[e.vendor][e.collection];
            const existing = arr.find(x => x.code === e.code);
            const entry = {
                code: e.code,
                width: e.width,
                file: e.file, // data URL
            };
            if (e.faceWidth !== undefined) entry.faceWidth = e.faceWidth;
            if (e.depth !== undefined) entry.depth = e.depth;
            if (e.rabbet !== undefined) entry.rabbet = e.rabbet;
            if (existing) {
                // Saved entry overrides bundled (matches sync-folder behaviour)
                Object.assign(existing, entry);
            } else {
                arr.push(entry);
            }
        });
        populateDashVendorDropdown();
    } catch (err) {
        // Corrupted JSON or unexpected error — non-fatal. User still gets the
        // bundled library, just loses their previous personal swatches.
        console.warn('Could not restore custom library from storage:', err);
    }
}

// Return stats about persisted library size for the UI indicator.
function getCustomLibraryStorageStats() {
    try {
        const raw = localStorage.getItem(CUSTOM_LIBRARY_STORAGE_KEY) || '';
        const bytes = raw.length; // approximate; UTF-16 internally but base64 is ASCII
        const entries = raw ? JSON.parse(raw) : [];
        const count = Array.isArray(entries) ? entries.length : 0;
        const pct = Math.round((bytes / CUSTOM_LIBRARY_QUOTA_BYTES) * 100);
        return { count, bytes, percentOfLimit: pct };
    } catch (e) {
        return { count: 0, bytes: 0, percentOfLimit: 0 };
    }
}

// Wipe all persisted custom swatches and remove them from the in-memory
// library. Used by the "Clear my swatches" UI affordance.
function clearCustomLibrary() {
    try {
        localStorage.removeItem(CUSTOM_LIBRARY_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    // Remove all data-URL-backed entries from dashLocalLibrary in memory.
    Object.keys(dashLocalLibrary).forEach(vendor => {
        Object.keys(dashLocalLibrary[vendor]).forEach(collection => {
            dashLocalLibrary[vendor][collection] = dashLocalLibrary[vendor][collection].filter(
                e => !(typeof e.file === 'string' && e.file.startsWith('data:'))
            );
            // Clean up empty collections
            if (dashLocalLibrary[vendor][collection].length === 0) {
                delete dashLocalLibrary[vendor][collection];
            }
        });
        // Clean up empty vendors
        if (Object.keys(dashLocalLibrary[vendor]).length === 0) {
            delete dashLocalLibrary[vendor];
        }
    });
    populateDashVendorDropdown();
}

// Visibility flags for the two Layout Guides toggle buttons that don't map
// to a simple layer (group box + edge gaps). letters/spacing/wall already
// have their own Layout Guides layer toggles, so they're not duplicated here.
// Persisted to localStorage. Default: visible.
let dimVisibility = {
    groupBox: true,   // group dimension callouts
    edgeGap: true,    // edge-gap (distance-to-wall) dimensions
    wallDims: true,   // overall wall width/height dimensions (default ON)
    customLines: true, // custom measure-tool lines
};

function loadDimVisibility() {
    try {
        const raw = localStorage.getItem('dimVisibility');
        if (raw) {
            const v = JSON.parse(raw);
            if (v && typeof v === 'object') dimVisibility = Object.assign(dimVisibility, v);
        }
    } catch (e) { /* defaults */ }
}

function saveDimVisibility() {
    try { localStorage.setItem('dimVisibility', JSON.stringify(dimVisibility)); }
    catch (e) { /* ignore */ }
}

// Does the current elevation have at least one group dimension?
function anyGroupDimExists() {
    const ce = elevations[currentElevIndex];
    return !!(ce && Array.isArray(ce.groupDims) && ce.groupDims.length > 0);
}

// Does any frame in the current elevation have an edge-gap toggle enabled?
function anyEdgeGapActive() {
    return elevFrames.some(f => {
        const dt = f.distToggles;
        return dt && (dt.ceiling || dt.floor || dt.left || dt.right);
    });
}

// Sync the two Layout Guides toggle buttons' blue (active) state:
//   - Group Box button: blue when a group dim exists AND it's visible
//   - Edge Gap button: blue when any edge gap is active AND visible
// Called after drawElevAll and after creating/removing group dims or edge gaps.
function syncLayoutGuideButtonStates() {
    const gbBtn = document.getElementById('groupBoxToggle');
    if (gbBtn) {
        const exists = anyGroupDimExists();
        gbBtn.classList.toggle('active', exists && dimVisibility.groupBox);
        gbBtn.style.opacity = exists ? '1' : '0.4'; // dim when nothing to toggle
    }
    const egBtn = document.getElementById('edgeGapToggle');
    if (egBtn) {
        const exists = anyEdgeGapActive();
        egBtn.classList.toggle('active', exists && dimVisibility.edgeGap);
        egBtn.style.opacity = exists ? '1' : '0.4';
    }
    // Wall dims: always available (not conditional on existence). Keep the
    // arch-dim-layer display + button blue state in sync with the flag.
    const wdBtn = document.getElementById('wallDimToggle');
    const archLayer = document.getElementById('arch-dim-layer');
    if (archLayer) archLayer.style.display = dimVisibility.wallDims ? 'block' : 'none';
    if (wdBtn) wdBtn.classList.toggle('active', dimVisibility.wallDims);
    // Unit suffix toggle: active when interior suffix is shown.
    const usBtn = document.getElementById('unitSuffixToggle');
    if (usBtn) usBtn.classList.toggle('active', showUnitSuffix);
    // Custom lines toggle: blue when lines exist + visible; dim when none.
    const clBtn = document.getElementById('customLinesToggle');
    if (clBtn) {
        const exists = (typeof getElevCustomLines === 'function') && getElevCustomLines().length > 0;
        clBtn.classList.toggle('active', exists && dimVisibility.customLines);
        clBtn.style.opacity = exists ? '1' : '0.4';
    }
}

// Toggle group-box visibility (only meaningful if one exists).
function toggleGroupBoxVisibility(btn) {
    if (!anyGroupDimExists()) return; // nothing to toggle
    dimVisibility.groupBox = !dimVisibility.groupBox;
    saveDimVisibility();
    drawElevAll();
}

// Toggle edge-gap dimension visibility (only meaningful if one exists).
function toggleEdgeGapVisibility(btn) {
    if (!anyEdgeGapActive()) return;
    dimVisibility.edgeGap = !dimVisibility.edgeGap;
    saveDimVisibility();
    drawElevAll();
}

// Toggle wall dimension visibility (arch-dim-layer). Default ON.
function toggleWallDims(btn) {
    dimVisibility.wallDims = !dimVisibility.wallDims;
    saveDimVisibility();
    const layer = document.getElementById('arch-dim-layer');
    if (layer) layer.style.display = dimVisibility.wallDims ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', dimVisibility.wallDims);
    drawElevAll();
}

// Toggle custom measure-tool line visibility (Layout Guides ruler button).
function toggleCustomLinesVisibility(btn) {
    const anyLines = getElevCustomLines().length > 0;
    if (!anyLines) return;
    dimVisibility.customLines = !dimVisibility.customLines;
    saveDimVisibility();
    if (btn) btn.classList.toggle('active', dimVisibility.customLines);
    drawElevAll();
}

function toggleTheme() { document.body.classList.toggle('light-theme'); }

// ──────────────────────────────────────────────────────────────────────────
// DASHBOARD VIEW MODE 2 (preview overlay with resizable container)
// ──────────────────────────────────────────────────────────────────────────
// Mode 2 floats the preview-wrapper as a fixed-positioned panel anchored to
// the right side of the table area. The user can drag the LEFT edge of the
// preview wider to see the frame in more detail. The container's aspect
// ratio always matches the CURRENT frame's aspect — so a 12×12 frame shows
// in a square container, a 31×12 frame shows in a wide rectangle, etc.
// Empty space around the frame is minimized regardless of frame proportions.
//
// State persisted to localStorage:
//   dashViewMode  — '1' or '2'
//   dashPreviewSize — user-chosen "longest dimension" in px (e.g. 400)

// User-controlled longest dimension for the Mode 2 preview container. The
// actual container W/H are derived from this + the current frame aspect.
let dashPreviewSize = 400;
const DASH_PREVIEW_SIZE_MIN = 200;
const DASH_PREVIEW_SIZE_DEFAULT = 400;

// ──────────────────────────────────────────────────────────────────────────
// OUTER SHADOW TOGGLE
// ──────────────────────────────────────────────────────────────────────────
// Global flag: when false, all OUTER drop shadows (frame casting onto the
// wall) are suppressed in the preview, PNG export, and elevation views.
// This addresses the workflow problem of dropping exported PNGs into
// InDesign boxes where the drop shadow shows up as unwanted bleed area
// outside the frame.
//
// INNER shadows (frame casting onto mat 1, mat 1 onto mat 2, etc.) are
// NOT affected by this toggle — they describe real physical depth and are
// always rendered. They also get a global ~25% bump in intensity to keep
// the frame visually grounded when outer shadows are off.
let dashOuterShadowsOn = true;

// Re-render everything that uses shadows after a toggle change. The CSS
// classes drive the live preview (via .no-outer-shadows on body), but the
// PNG renderer and elevation rendering need explicit re-rendering since
// their shadow values are baked into the draw calls.
function applyOuterShadowsState(on) {
    dashOuterShadowsOn = !!on;
    document.body.classList.toggle('no-outer-shadows', !on);
    const btn = document.getElementById('outerShadowToggle');
    if (btn) btn.classList.toggle('active', !on); // button "active" = shadow OFF state
    // Re-render the dashboard preview (CSS box-shadow on .frame-vis updates
    // via the class, but the float-mount paper shadow is inline-style so we
    // also need to re-run updateDashVisualsFromDOM).
    if (typeof updateDashVisualsFromDOM === 'function') {
        updateDashVisualsFromDOM();
    }
    // Re-render any open elevation view.
    if (typeof drawElevAll === 'function' && typeof elevations !== 'undefined' && elevations.length > 0) {
        drawElevAll();
    }
}

function toggleOuterShadows() {
    applyOuterShadowsState(!dashOuterShadowsOn);
    try {
        localStorage.setItem('dashOuterShadowsOn', dashOuterShadowsOn ? '1' : '0');
    } catch (e) { /* private mode — skip persistence */ }
}

function initOuterShadowsToggle() {
    try {
        const saved = localStorage.getItem('dashOuterShadowsOn');
        if (saved === '0') {
            // Apply the OFF state. Don't call applyOuterShadowsState until DOM
            // is ready — set the class directly now, defer render to first
            // updateDashVisualsFromDOM call.
            dashOuterShadowsOn = false;
            document.body.classList.add('no-outer-shadows');
            const btn = document.getElementById('outerShadowToggle');
            if (btn) btn.classList.add('active');
        }
    } catch (e) { /* ignore */ }
}

// Compute the container W and H for Mode 2 given the frame's real dimensions.
// Returns { w, h } in CSS pixels. The longer of the two dimensions equals the
// user's preferred size; the shorter scales proportionally. Then both are
// clamped to viewport-safe maxes so the preview never overflows the screen.
function computeDashPreviewDims(extW, extH) {
    const ew = Math.max(1, parseFloat(extW) || 1);
    const eh = Math.max(1, parseFloat(extH) || 1);
    const aspect = ew / eh;
    let w, h;
    if (aspect >= 1) {
        // Landscape or square — width is the longer dimension
        w = dashPreviewSize;
        h = dashPreviewSize / aspect;
    } else {
        // Portrait — height is the longer dimension
        h = dashPreviewSize;
        w = dashPreviewSize * aspect;
    }
    // Viewport-safe clamps. The preview panel has 20px padding around
    // the container + ~50px for the canvas toolbar below it = ~90px chrome.
    // Plus the panel sits at top:156 and the right edge is 460px from
    // viewport right (form pane room).
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const maxW = vpW - 460 - 40 - 40; // form pane + left margin + panel padding
    const maxH = vpH - 156 - 20 - 50 - 40; // top + bottom margin + toolbar + padding
    if (w > maxW) {
        const k = maxW / w;
        w *= k; h *= k;
    }
    if (h > maxH) {
        const k = maxH / h;
        w *= k; h *= k;
    }
    return { w: Math.max(50, Math.round(w)), h: Math.max(50, Math.round(h)) };
}

// Apply the computed dims to the preview container's inline style. Only
// has effect when Mode 2 is active (CSS for Mode 1 keeps its own sizing).
// Called from updateDashVisualsFromDOM whenever the frame is re-rendered,
// and from the drag handler during a resize.
function updateDashPreviewContainerSize() {
    if (!document.body.classList.contains('dash-view-2')) return;
    const data = dashProjectData[dashSelectedRowIndex];
    if (!data) return;
    const container = document.querySelector('.preview-container');
    if (!container) return;
    const dims = computeDashPreviewDims(data.extW, data.extH);
    container.style.width = dims.w + 'px';
    container.style.height = dims.h + 'px';
    container.style.aspectRatio = 'auto';   // override the 1/1 default
    container.style.maxWidth = 'none';
    container.style.maxHeight = 'none';
}

function applyDashViewMode(mode2) {
    document.body.classList.toggle('dash-view-2', mode2);
    const btn = document.getElementById('dashViewToggle');
    if (btn) btn.classList.toggle('active', mode2);
    if (mode2) {
        // Restore the saved size before first render so the container is
        // correct on entry.
        try {
            const saved = parseFloat(localStorage.getItem('dashPreviewSize'));
            if (!isNaN(saved) && saved >= DASH_PREVIEW_SIZE_MIN) {
                dashPreviewSize = saved;
            }
        } catch (e) { /* ignore */ }
    } else {
        // Returning to Mode 1: clear the inline style so the CSS-driven
        // 1/1 aspect + 320px max applies again.
        const container = document.querySelector('.preview-container');
        if (container) {
            container.style.width = '';
            container.style.height = '';
            container.style.aspectRatio = '';
            container.style.maxWidth = '';
            container.style.maxHeight = '';
        }
    }
    // Re-render the preview after the layout shifts so the frame visual
    // sizes itself to the new container dimensions.
    if (typeof updateDashVisualsFromDOM === 'function') {
        requestAnimationFrame(() => updateDashVisualsFromDOM());
    }
}

function toggleDashView() {
    const wasMode2 = document.body.classList.contains('dash-view-2');
    applyDashViewMode(!wasMode2);
    try {
        localStorage.setItem('dashViewMode', !wasMode2 ? '2' : '1');
    } catch (e) { /* private mode — skip persistence */ }
}

// Restore the saved dashboard view mode on page load. Called from the
// existing init flow alongside theme restoration.
function initDashViewMode() {
    try {
        const savedSize = parseFloat(localStorage.getItem('dashPreviewSize'));
        if (!isNaN(savedSize) && savedSize >= DASH_PREVIEW_SIZE_MIN) {
            dashPreviewSize = savedSize;
        }
        const saved = localStorage.getItem('dashViewMode');
        if (saved === '2') {
            applyDashViewMode(true);
        }
    } catch (e) {
        // Ignore — start in default Mode 1 at default size
    }
    // Wire up the drag handle for Mode 2 resize. Runs once on first load.
    setupDashPreviewDragHandle();
    // Restore the outer-shadow toggle state (default ON).
    initOuterShadowsToggle();
}

// Wire up the left-edge drag handle that lets the user resize the Mode 2
// preview. The handle is a CSS pseudo-element on .preview-wrapper but we
// attach the actual drag handlers to the wrapper itself, gated to only
// react when the mousedown is in the leftmost 10px (the handle region).
//
// During drag we update dashPreviewSize based on cursor movement, then call
// updateDashPreviewContainerSize to apply, then re-render the frame visual
// so it scales with the new container size. Persist on mouseup.
function setupDashPreviewDragHandle() {
    const wrapper = document.querySelector('.preview-wrapper');
    if (!wrapper) return;
    if (wrapper.dataset.dragWired) return; // idempotent
    wrapper.dataset.dragWired = '1';
    const HANDLE_WIDTH = 10;  // leftmost N pixels react as a drag handle
    let dragState = null;     // { startX, startSize } when actively dragging

    // Hover state: only show resize cursor when in Mode 2 AND mouse is over
    // the leftmost N pixels. Pure JS (vs CSS) so we don't need to add a
    // separate handle element.
    wrapper.addEventListener('mousemove', (e) => {
        if (!document.body.classList.contains('dash-view-2')) return;
        if (dragState) return; // cursor is locked during active drag
        const rect = wrapper.getBoundingClientRect();
        const onHandle = (e.clientX - rect.left) < HANDLE_WIDTH;
        wrapper.style.cursor = onHandle ? 'ew-resize' : '';
    });
    wrapper.addEventListener('mouseleave', () => {
        if (!dragState) wrapper.style.cursor = '';
    });

    wrapper.addEventListener('mousedown', (e) => {
        if (!document.body.classList.contains('dash-view-2')) return;
        const rect = wrapper.getBoundingClientRect();
        const inHandle = (e.clientX - rect.left) < HANDLE_WIDTH;
        if (!inHandle) return;
        e.preventDefault();
        e.stopPropagation();
        dragState = { startX: e.clientX, startSize: dashPreviewSize };
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        // Dragging LEFT (negative delta from start) GROWS the container.
        // Dragging RIGHT shrinks it.
        const delta = dragState.startX - e.clientX;
        let newSize = dragState.startSize + delta;
        if (newSize < DASH_PREVIEW_SIZE_MIN) newSize = DASH_PREVIEW_SIZE_MIN;
        // Aspect-aware max-size clamp. `size` is the longest dimension of
        // the container. Whether that's the WIDTH or the HEIGHT depends on
        // the current frame's aspect ratio. The other (shorter) dimension
        // is size/aspect (for landscape) or size*aspect (for portrait), and
        // it ALSO needs to fit within its viewport limit. So we compute the
        // max-size in two ways and use the tighter.
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const maxByW = vpW - 460 - 80;  // form pane + side margins
        const maxByH = vpH - 256;       // top + bottom + toolbar
        const data = dashProjectData[dashSelectedRowIndex];
        const ew = Math.max(1, parseFloat(data && data.extW) || 1);
        const eh = Math.max(1, parseFloat(data && data.extH) || 1);
        const aspect = ew / eh;
        let maxSize;
        if (aspect >= 1) {
            // Landscape: size = width. Width≤maxByW, height = size/aspect ≤ maxByH
            maxSize = Math.min(maxByW, maxByH * aspect);
        } else {
            // Portrait: size = height. Height≤maxByH, width = size*aspect ≤ maxByW
            maxSize = Math.min(maxByH, maxByW / aspect);
        }
        if (maxSize < DASH_PREVIEW_SIZE_MIN) maxSize = DASH_PREVIEW_SIZE_MIN;
        if (newSize > maxSize) newSize = maxSize;
        dashPreviewSize = newSize;
        updateDashPreviewContainerSize();
        if (typeof updateDashVisualsFromDOM === 'function') {
            updateDashVisualsFromDOM();
        }
    });

    document.addEventListener('mouseup', () => {
        if (!dragState) return;
        dragState = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Persist the chosen size
        try {
            localStorage.setItem('dashPreviewSize', String(dashPreviewSize));
        } catch (e) { /* ignore */ }
    });
}

// Re-render the preview when the window resizes. The frame visual is sized
// from the preview-container's actual dimensions, so a window resize needs
// to trigger a redraw + size recalculation (so Mode 2's viewport-bound
// clamps stay valid). Debounced to avoid hammering the renderer.
(function setupDashResizeListener() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            updateDashPreviewContainerSize();
            if (typeof updateDashVisualsFromDOM === 'function') {
                updateDashVisualsFromDOM();
            }
        }, 200);
    });
})();

function renderNavTabs() {
    const container = document.getElementById('nav-tabs-container');
    const fixed = document.getElementById('nav-tabs-fixed');
    const dashHtml = `<div class="nav-tab ${currentView==='dashboard'?'active':''}" onclick="switchView('dashboard')">Frame Dashboard</div><div class="tab-divider"></div>`;

    // Preserve the horizontal scroll position across rebuilds — innerHTML
    // assignment resets scrollLeft to 0, which made the bar jump to the far
    // left after deleting/renaming a far-right elevation.
    const prevScroll = container.scrollLeft;

    let html = '';
    if (fixed) {
        // Frame Dashboard tab lives in the fixed (non-scrolling) container so
        // it stays pinned while the elevation tabs scroll beside it.
        fixed.innerHTML = dashHtml;
    } else {
        // Fallback for stale HTML: keep the old single-container layout.
        html = dashHtml;
    }

    elevations.forEach((elev, idx) => {
        let isActive = (currentView === 'elevation' && currentElevIndex === idx) ? 'active' : '';
        // draggable=true enables HTML5 drag-and-drop. data-tab-idx is read by
        // the drag handlers to know which tab is being moved + where it's
        // being dropped. The drag/dragover/drop handlers are wired up
        // imperatively after innerHTML assignment (cleaner than inline
        // attributes since they need access to the event object's dataTransfer).
        html += `<div class="nav-tab ${isActive}" draggable="true" data-tab-idx="${idx}" onclick="switchView('elevation', ${idx})">
                    <span>${elev.name}</span>
                    <span class="tab-close" onclick="deleteElevation(${idx}, event)" title="Delete Wall">×</span>
                 </div>`;
    });
    container.innerHTML = html;
    container.scrollLeft = prevScroll;
    // Wire up drag-and-drop on the elevation tabs (skip the Frame Dashboard
    // tab — it always stays first).
    container.querySelectorAll('.nav-tab[draggable="true"]').forEach(tab => {
        tab.addEventListener('dragstart', handleTabDragStart);
        tab.addEventListener('dragover', handleTabDragOver);
        tab.addEventListener('dragleave', handleTabDragLeave);
        tab.addEventListener('drop', handleTabDrop);
        tab.addEventListener('dragend', handleTabDragEnd);
    });

    // Overflow ergonomics for projects with many elevations:
    // 1) Vertical mouse-wheel over the tab bar scrolls it horizontally
    //    (wired once — guarded by a flag on the container).
    if (!container._wheelWired) {
        container._wheelWired = true;
        container.addEventListener('wheel', (e) => {
            // Only intercept when the bar actually overflows and the wheel is
            // predominantly vertical (trackpads emit real deltaX themselves).
            if (container.scrollWidth <= container.clientWidth) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        }, { passive: false });
    }
    // 2) Keep the ACTIVE tab visible — when switching/adding elevations the
    //    active tab may sit past the right edge; bring it into view.
    const activeTab = container.querySelector('.nav-tab.active');
    if (activeTab && container.scrollWidth > container.clientWidth) {
        const cRect = container.getBoundingClientRect();
        const tRect = activeTab.getBoundingClientRect();
        if (tRect.left < cRect.left || tRect.right > cRect.right) {
            activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// ELEVATION TAB DRAG-TO-REORDER
// ──────────────────────────────────────────────────────────────────────────
// HTML5 drag-and-drop implementation. The dragged tab's index is stored in
// dataTransfer (string, since DataTransfer only accepts strings). During
// dragover, we compute which side of the hovered target the cursor is on
// to decide whether the drop will be "before" or "after" that target,
// and apply a CSS class to show a visual drop indicator (colored border).
// On drop, we splice the elevations array, fix up currentElevIndex so the
// active tab follows the move, fix up variationOf references, re-render
// tabs, and push history.

let _draggingTabIdx = null;

function handleTabDragStart(e) {
    _draggingTabIdx = parseInt(e.currentTarget.dataset.tabIdx, 10);
    // Use 'move' effect to signal a reorder (vs 'copy'). dataTransfer needs
    // something set to avoid browsers rejecting the drop in some cases.
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(_draggingTabIdx));
    e.currentTarget.classList.add('dragging');
}

function handleTabDragOver(e) {
    e.preventDefault();  // required to enable drop
    e.dataTransfer.dropEffect = 'move';
    const tab = e.currentTarget;
    const targetIdx = parseInt(tab.dataset.tabIdx, 10);
    if (targetIdx === _draggingTabIdx) return;  // can't drop on self
    // Decide before-or-after based on cursor position vs tab midpoint
    const rect = tab.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const dropBefore = e.clientX < midX;
    // Clear both classes on all tabs first, then set the right one on
    // this target. (Cleaner than tracking which tab last had the indicator.)
    document.querySelectorAll('.nav-tab.drop-before, .nav-tab.drop-after')
        .forEach(t => t.classList.remove('drop-before', 'drop-after'));
    tab.classList.add(dropBefore ? 'drop-before' : 'drop-after');
}

function handleTabDragLeave(e) {
    // Only clear if we're really leaving the tab (not just moving over a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drop-before', 'drop-after');
    }
}

function handleTabDrop(e) {
    e.preventDefault();
    const targetTab = e.currentTarget;
    const targetIdx = parseInt(targetTab.dataset.tabIdx, 10);
    targetTab.classList.remove('drop-before', 'drop-after');
    if (_draggingTabIdx === null || _draggingTabIdx === targetIdx) return;
    // Same before-or-after calc as in dragover
    const rect = targetTab.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const dropBefore = e.clientX < midX;
    let insertIdx = dropBefore ? targetIdx : targetIdx + 1;
    // Adjust if removing the dragged item from earlier in the array shifts
    // the target's effective position
    if (_draggingTabIdx < insertIdx) insertIdx--;
    reorderElevation(_draggingTabIdx, insertIdx);
}

function handleTabDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.nav-tab.drop-before, .nav-tab.drop-after')
        .forEach(t => t.classList.remove('drop-before', 'drop-after'));
    _draggingTabIdx = null;
}

// Move the elevation at `fromIdx` to `toIdx` in the elevations array.
// Also fixes up currentElevIndex (so the active tab stays active after
// the move) and variationOf references (so variation→source links survive
// the reorder). Pushes history so the reorder is undoable.
function reorderElevation(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= elevations.length) return;
    if (toIdx < 0 || toIdx >= elevations.length) return;

    // Track which elevation was active so we can restore currentElevIndex
    // after the splice. Use object identity rather than index because the
    // index changes during the move.
    const wasActive = elevations[currentElevIndex];

    // Move via splice-remove + splice-insert. Standard array reorder pattern.
    const [moved] = elevations.splice(fromIdx, 1);
    elevations.splice(toIdx, 0, moved);

    // Rebuild variationOf indices. The cleanest way is to map each
    // variation's old source identity to its new index. We do this by
    // remembering the source object reference, then looking it up after
    // the splice. variationOf is just an integer hint; if the source can't
    // be found (deleted), we clear it.
    //
    // Note: this requires us to capture identities BEFORE the splice for
    // any variations that referenced fromIdx or any index between fromIdx
    // and toIdx. Easier approach: since variationOf is metadata (currently
    // unused by any feature), just clear it if the index is now stale.
    // Simpler and avoids the bookkeeping.
    elevations.forEach((elev, i) => {
        if (typeof elev.variationOf !== 'number') return;
        // If it pointed at the moved item, update to the moved item's new pos
        if (elev.variationOf === fromIdx) {
            elev.variationOf = toIdx;
            return;
        }
        // Otherwise, the index may have shifted due to the splice
        // The moved item went from fromIdx to toIdx; everything between
        // shifts by 1 in the opposite direction.
        if (fromIdx < toIdx) {
            // Moved right: indices in (fromIdx, toIdx] shift left by 1
            if (elev.variationOf > fromIdx && elev.variationOf <= toIdx) elev.variationOf--;
        } else {
            // Moved left: indices in [toIdx, fromIdx) shift right by 1
            if (elev.variationOf >= toIdx && elev.variationOf < fromIdx) elev.variationOf++;
        }
    });

    // Restore currentElevIndex by object identity
    const newActiveIdx = elevations.indexOf(wasActive);
    if (newActiveIdx >= 0) currentElevIndex = newActiveIdx;

    renderNavTabs();
    populateDashPushSelector();
    pushHistory();
}

function updateElevationNameFromInput(newName) {
    if (newName.trim() !== "") { elevations[currentElevIndex].name = newName; renderNavTabs(); populateDashPushSelector(); }
}

function deleteElevation(idx, e) {
    e.stopPropagation();
    if(confirm("Delete this entire elevation wall? This cannot be undone.")) {
        // If deleting the source of any variations, promote those variations
        // to primary status. Otherwise they'd stay flagged as `isVariation`
        // and get skipped by recalculateDashboardQuantities, making qty
        // unexpectedly 0 for frames that ARE physically being ordered.
        elevations.forEach(other => {
            if (other.variationOf === idx) {
                delete other.isVariation;
                delete other.variationOf;
            }
        });
        elevations.splice(idx, 1);
        // Fix up any remaining variationOf indices to account for the splice.
        // variationOf indices >= idx need to shift down by 1.
        elevations.forEach(other => {
            if (typeof other.variationOf === 'number' && other.variationOf > idx) {
                other.variationOf--;
            }
        });
        if (elevations.length === 0) {
            const uf = unitFactor('in', elevUnit);
            let w = parseFloat((185 * uf).toFixed(2));
            let h = parseFloat((108 * uf).toFixed(2));
            let px = parseFloat((-60 * uf).toFixed(2));
            elevations.push({ name: "Elevation 1", frames: [], wallW: w, wallH: h, personPos: {x: px} });
            currentElevIndex = 0;
        } else if (currentElevIndex > idx) { currentElevIndex--; }
        if (currentElevIndex === idx || elevations.length === 1) switchView('dashboard');
        
        renderNavTabs(); populateDashPushSelector(); recalculateDashboardQuantities();
        pushHistory();
    }
}

// Duplicate the currently-active elevation into a new tab inserted right
// after it. Used when the user wants to show layout variations of the same
// approved design (e.g. three different arrangements for a client review).
//
// Important: the duplicate references the SAME dashboard rows (same .id
// values on frames) — variations share their underlying product list with
// the original. This means editing a frame's spec in the dashboard affects
// every variation that uses it (usually desirable: 'change the mat color
// once, applies everywhere it's shown').
//
// To avoid double-counting in the dashboard's qty column, duplicates are
// flagged `isVariation: true`. recalculateDashboardQuantities() skips
// flagged elevations so the qty reflects the number of UNIQUE physical
// frames, not the number of times they're visualized across variations.
function duplicateCurrentElevation() {
    if (currentView !== 'elevation') return;
    const srcIdx = currentElevIndex;
    const src = elevations[srcIdx];
    if (!src) return;

    // Deep clone so subsequent edits to the copy don't bleed into the
    // original. JSON roundtrip is safe here because everything in an
    // elevation is plain data (no functions, no DOM refs).
    const copy = JSON.parse(JSON.stringify(src));
    copy.name = `${src.name} (Copy)`;
    copy.isVariation = true;
    copy.variationOf = srcIdx;

    // Insert right after the source so variations sit next to their
    // original in the tab strip. Then switch to it so the user lands
    // on the new tab ready to edit.
    elevations.splice(srcIdx + 1, 0, copy);
    currentElevIndex = srcIdx + 1;

    renderNavTabs();
    populateDashPushSelector();
    switchView('elevation', srcIdx + 1);
    recalculateDashboardQuantities();
    pushHistory();
}

function addNewElevationTab() {
    let newIndex = elevations.length;
    const uf = unitFactor('in', elevUnit);
    let w = parseFloat((185 * uf).toFixed(2));
    let h = parseFloat((108 * uf).toFixed(2));
    let px = parseFloat((-60 * uf).toFixed(2));
    
    elevations.push({ name: "Elevation " + (newIndex + 1), frames: [], wallW: w, wallH: h, personPos: {x: px} });
    renderNavTabs(); populateDashPushSelector(); switchView('elevation', newIndex);
    pushHistory();
}

function switchView(viewType, index = 0) {
    if (currentView === 'elevation' && elevations[currentElevIndex]) {
        elevations[currentElevIndex].wallW = parseFloat(document.getElementById('wallW').value) || 185;
        elevations[currentElevIndex].wallH = parseFloat(document.getElementById('wallH').value) || 108;
    }

    if (viewType === 'dashboard') {
        document.getElementById('view-dashboard').classList.add('active');
        document.getElementById('view-elevation').classList.remove('active');
        currentView = 'dashboard';
        recalculateDashboardQuantities(); 
    } else {
        document.getElementById('view-dashboard').classList.remove('active');
        document.getElementById('view-elevation').classList.add('active');
        currentView = 'elevation'; currentElevIndex = index;
        
        let elev = elevations[currentElevIndex];
        document.getElementById('elev-title-input').value = elev.name;
        document.getElementById('wallW').value = elev.wallW;
        document.getElementById('wallH').value = elev.wallH;
        elevFrames = elev.frames; elevPersonPos = elev.personPos;
        
        populateElevBulkList(); initElevControls(); drawElevAll();
    }
    renderNavTabs();
}

// Helper: turn a free-form string into a filesystem-safe slug.
// Spaces → underscores; strips anything not alphanumeric / dash / underscore.
// If the result is empty (e.g. user only had emoji or non-Latin), falls
// back to 'Untitled' so we never download "_2026-05-16.json" with no name.
function slugifyForFilename(s) {
    if (!s) return 'Untitled';
    const slug = String(s).trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    return slug || 'Untitled';
}

function saveMasterProject() {
    if(currentView === 'elevation' && elevations[currentElevIndex]) {
        elevations[currentElevIndex].wallW = parseFloat(document.getElementById('wallW').value) || 185;
        elevations[currentElevIndex].wallH = parseFloat(document.getElementById('wallH').value) || 108;
    }
    const getStr = (id) => document.getElementById(id).value;
    const globalMeta = { projName: getStr('g_projName'), desc: getStr('g_desc'), date: getStr('g_date'), issued: getStr('g_issued'), client: getStr('g_client'), attn: getStr('g_attn'), delivery: getStr('g_delivery') };
    const masterData = { type: 'master-studio-v6', dashUnit: dashUnit, elevUnit: elevUnit, globalMeta: globalMeta, dashProjectData: dashProjectData, elevations: elevations };
    const blob = new Blob([JSON.stringify(masterData, null, 2)], { type: 'application/json' });
    // Filename uses the user's Project Name + today's date so multiple
    // projects don't overwrite each other in Downloads.
    const projSlug = slugifyForFilename(globalMeta.projName);
    const dateStr = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
    const filename = `${projSlug}_${dateStr}.json`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
    // Successful save → no longer dirty, clear autosave (file is canonical now).
    if (typeof markClean === 'function') markClean();
    if (typeof clearAutosave === 'function') clearAutosave();
}

function loadMasterProject(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.type && data.type.startsWith('master-studio')) {
                // Unit handling: prefer dashUnit (it's the CSV-canonical one).
                // If only elevUnit exists (older format edge case) use that.
                // Force both internal vars equal to the chosen value since
                // they're now treated as one unified setting.
                const chosenUnit = data.dashUnit || data.elevUnit || 'in';
                dashUnit = chosenUnit;
                elevUnit = chosenUnit;
                if (data.globalMeta) {
                    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
                    setVal('g_projName', data.globalMeta.projName); setVal('g_desc', data.globalMeta.desc); setVal('g_date', data.globalMeta.date);
                    setVal('g_issued', data.globalMeta.issued); setVal('g_client', data.globalMeta.client); setVal('g_attn', data.globalMeta.attn); setVal('g_delivery', data.globalMeta.delivery);
                }
                if (data.dashProjectData) dashProjectData = data.dashProjectData;
                if (data.elevations) elevations = data.elevations;
                // If the loaded project had divergent dashUnit / elevUnit
                // (a relic of the pre-unified era), the elevations array
                // values are in elevUnit while dashProjectData is in
                // dashUnit. We picked dashUnit as canonical, so convert
                // elevation values to match. Skip if they were already equal.
                const origElevUnit = data.elevUnit || chosenUnit;
                if (origElevUnit !== chosenUnit) {
                    const f = unitFactor(origElevUnit, chosenUnit);
                    elevations.forEach(elev => {
                        elev.wallW = parseFloat((parseFloat(elev.wallW) * f).toFixed(2));
                        elev.wallH = parseFloat((parseFloat(elev.wallH) * f).toFixed(2));
                        elev.frames.forEach(fr => {
                            ['w','h','fW','fHeight','rabbetDepth','floaterInset','sbPaperMargin','sbPaperBorder','m1T','m1B','m1L','m1R','m2','x','y'].forEach(p => {
                                fr[p] = parseFloat((parseFloat(fr[p] || 0) * f).toFixed(4));
                            });
                        });
                        if (elev.personPos) elev.personPos.x = parseFloat((parseFloat(elev.personPos.x || 0) * f).toFixed(2));
                    });
                }
            } else { return alert("Invalid format. Please build a new project in Master Studio."); }

            // Sync all 3 toggle-button trios. Each guarded since not every
            // trio is present in every state.
            [
                ['dashBtnInch', 'dashBtnCm', 'dashBtnMm'],
                ['elevBtnInch', 'elevBtnCm', 'elevBtnMm'],
                ['globalBtnInch', 'globalBtnCm', 'globalBtnMm'],
            ].forEach(([inId, cmId, mmId]) => {
                const inEl = document.getElementById(inId);
                const cmEl = document.getElementById(cmId);
                const mmEl = document.getElementById(mmId);
                if (inEl) inEl.classList.toggle('active', dashUnit === 'in');
                if (cmEl) cmEl.classList.toggle('active', dashUnit === 'cm');
                if (mmEl) mmEl.classList.toggle('active', dashUnit === 'mm');
            });
            
            recalculateDashboardQuantities(); selectDashRow(0); renderNavTabs(); switchView('dashboard');
            // Loaded project becomes the new canonical state. Reset undo
            // history (no point in being able to undo back to "before the
            // load") and clear dirty flag.
            if (typeof undoStack !== 'undefined') {
                undoStack.length = 0;
                redoStack.length = 0;
                _isFirstHistoryPush = true;
                pushHistory();
            }
            if (typeof markClean === 'function') markClean();
            if (typeof clearAutosave === 'function') clearAutosave();
        } catch (err) { alert("Invalid project file."); }
    };
    reader.readAsText(file); event.target.value = '';
}

// =========================================================================
// THE BRIDGE: DROPDOWN BULK CHECKBOXES & DASHBOARD PUSH
// =========================================================================
function recalculateDashboardQuantities() {
    let counts = {};
    // Skip variations: a duplicated elevation visualizes the same physical
    // frames as its source, so counting them would double-bill. Quantities
    // reflect the number of UNIQUE physical frames across primary walls.
    elevations.forEach(elev => {
        if (elev.isVariation) return;
        elev.frames.forEach(f => { if (f.active && f.id) counts[f.id] = (counts[f.id] || 0) + 1; });
    });
    dashProjectData.forEach(d => { d.qty = counts[d.id] !== undefined ? counts[d.id] : 0; });
    if (currentView === 'dashboard') { loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]); renderDashTable(); }
}

function toggleBulkDropdown() {
    const list = document.getElementById('bulkDropdownList');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function populateElevBulkList() {
    const container = document.getElementById('bulkImportCheckboxes');
    if(!container) return;
    container.innerHTML = '';
    dashProjectData.forEach((f, idx) => {
        container.innerHTML += `
            <label style="display: flex; align-items: center; gap: 6px; padding: 6px; border-bottom: 1px solid var(--border-color); cursor: pointer; text-transform: none; color: var(--text-strong); font-size: 0.75rem; margin:0;">
                <input type="checkbox" class="bulk-import-cb" value="${idx}">
                <b>${f.id}</b> <span style="color:var(--text-muted);">(${f.product})</span>
            </label>
        `;
    });
}

function importSelectedFramesBulk() {
    const cbs = document.querySelectorAll('.bulk-import-cb:checked');
    if(cbs.length === 0) return alert("Select at least one frame from the list!");
    
    let factor = unitFactor(dashUnit, elevUnit);
    let startX = 10;
    if (elevFrames.length > 0) {
        let maxRight = 0;
        elevFrames.forEach(fr => { if (fr.x + fr.w > maxRight) maxRight = fr.x + fr.w; });
        startX = maxRight + 10;
    }

    cbs.forEach(cb => {
        const f = dashProjectData[parseInt(cb.value)];
        // Defensive: if the dropdown is out of sync with dashProjectData
        // (e.g. after an undo restored older state), the checkbox value may
        // point to a row that no longer exists. Skip it rather than crash.
        if (!f) return;
        const newFrame = {
            id: f.id, letter: getElevLetter(elevFrames.length),
            w: (parseFloat(f.extW) || 24) * factor, h: (parseFloat(f.extH) || 30) * factor,
            fW: (parseFloat(f.fW) || 1.25) * factor, fType: f.fType || 'color', fColor: f.fColor || '#1a1a1a', fCode: f.fCode || '', swatchDataUrl: f.swatchDataUrl || '',
            product: f.product || '', floaterInset: (parseFloat(f.floaterInset) || 0.75) * factor,
            // Phase A fields carried through. Dimensional ones get factor-converted; text fields pass through.
            artist: f.artist || '', artworkTitle: f.artworkTitle || '', artType: f.artType || '', artworkUrl: f.artworkUrl || '',
            fColorName: f.fColorName || '', paperType: f.paperType || '',
            fHeight: (parseFloat(f.fHeight) || 0) * factor,
            rabbetDepth: (parseFloat(f.rabbetDepth) || 0) * factor,
            // Float mount fields propagated to the elevation copy.
            // useFloatMount carries the per-row toggle state so elevation rendering matches dashboard.
            useFloatMount: f.useFloatMount === true,
            sbBackerColorHex: f.sbBackerColorHex || '#ffffff', sbBackerColorName: f.sbBackerColorName || 'B 97 White',
            sbPaperColorHex: f.sbPaperColorHex || '#ffffff', sbPaperColorName: f.sbPaperColorName || 'White',
            sbPaperMargin: (isNaN(parseFloat(f.sbPaperMargin)) ? 1.5 : parseFloat(f.sbPaperMargin)) * factor,
            sbPaperBorder: (isNaN(parseFloat(f.sbPaperBorder)) ? 0.5 : parseFloat(f.sbPaperBorder)) * factor,
            sbPaperEdge: f.sbPaperEdge || 'clean',
            sbPaperEdgeSeed: f.sbPaperEdgeSeed || 0,
            m1T: (parseFloat(f.m1T) || 0) * factor, m1B: (parseFloat(f.m1B) || 0) * factor, m1L: (parseFloat(f.m1L) || 0) * factor, m1R: (parseFloat(f.m1R) || 0) * factor,
            m1A: f.m1A !== false, m1Locked: f.m1Locked || false, m1ColorHex: f.m1ColorHex || '#ffffff',
            m2: (parseFloat(f.m2) || 0) * factor, m2A: f.m2A || false, m2ColorHex: f.m2ColorHex || '#ffffff',
            x: startX, y: 10, isOpen: false, isGrouped: false, dimTo: [], active: true,
            // Click-to-select state. False by default. Set true by mousedown
            // (without drag) on the frame element. Persists until user clicks
            // the wall background to clear all selections. Triggers blue
            // outline + ABC panel highlight (same visual as hover).
            selected: false,
            // Per-frame distance dimension toggles. Each frame independently controls
            // which architectural distance dims it shows (to ceiling/floor/left/right
            // walls). Default all off — designer enables per-frame in the ABC panel.
            distToggles: { ceiling: false, floor: false, left: false, right: false }
        };
        elevFrames.push(newFrame); startX += (newFrame.w + 5); cb.checked = false; 
    });
    
    document.getElementById('bulkDropdownList').style.display = 'none';
    initElevControls(); drawElevAll(); recalculateDashboardQuantities();
    pushHistory();
}

function populateDashPushSelector() {
    const select = document.getElementById('dashPushSelector');
    if(!select) return;
    select.innerHTML = '<option value="">-- Push to Wall --</option>';
    elevations.forEach((e, idx) => {
        const opt = document.createElement('option'); opt.value = idx; opt.textContent = e.name; select.appendChild(opt);
    });
}

function pushFrameToElevation() {
    const select = document.getElementById('dashPushSelector');
    if (select.value === "") return alert("Select an elevation first!");
    const eIdx = parseInt(select.value);
    const targetElev = elevations[eIdx];
    const f = dashProjectData[dashSelectedRowIndex];
    
    let factor = unitFactor(dashUnit, elevUnit);
    let startX = 10;
    if (targetElev.frames.length > 0) {
        let maxRight = 0;
        targetElev.frames.forEach(fr => { if (fr.x + fr.w > maxRight) maxRight = fr.x + fr.w; });
        startX = maxRight + 10;
    }

    targetElev.frames.push({
        id: f.id, letter: getElevLetter(targetElev.frames.length),
        w: (parseFloat(f.extW) || 24) * factor, h: (parseFloat(f.extH) || 30) * factor,
        fW: (parseFloat(f.fW) || 1.25) * factor, fType: f.fType || 'color', fColor: f.fColor || '#1a1a1a', fCode: f.fCode || '', swatchDataUrl: f.swatchDataUrl || '',
        product: f.product || '', floaterInset: (parseFloat(f.floaterInset) || 0.75) * factor,
        artist: f.artist || '', artworkTitle: f.artworkTitle || '', artType: f.artType || '', artworkUrl: f.artworkUrl || '',
        fColorName: f.fColorName || '', paperType: f.paperType || '',
        fHeight: (parseFloat(f.fHeight) || 0) * factor,
        rabbetDepth: (parseFloat(f.rabbetDepth) || 0) * factor,
        useFloatMount: f.useFloatMount === true,
        sbBackerColorHex: f.sbBackerColorHex || '#ffffff', sbBackerColorName: f.sbBackerColorName || 'B 97 White',
        sbPaperColorHex: f.sbPaperColorHex || '#ffffff', sbPaperColorName: f.sbPaperColorName || 'White',
        sbPaperMargin: (isNaN(parseFloat(f.sbPaperMargin)) ? 1.5 : parseFloat(f.sbPaperMargin)) * factor,
        sbPaperBorder: (isNaN(parseFloat(f.sbPaperBorder)) ? 0.5 : parseFloat(f.sbPaperBorder)) * factor,
        sbPaperEdge: f.sbPaperEdge || 'clean',
        sbPaperEdgeSeed: f.sbPaperEdgeSeed || 0,
        m1T: (parseFloat(f.m1T) || 0) * factor, m1B: (parseFloat(f.m1B) || 0) * factor, m1L: (parseFloat(f.m1L) || 0) * factor, m1R: (parseFloat(f.m1R) || 0) * factor,
        m1A: f.m1A !== false, m1Locked: f.m1Locked || false, m1ColorHex: f.m1ColorHex || '#ffffff',
        m2: (parseFloat(f.m2) || 0) * factor, m2A: f.m2A || false, m2ColorHex: f.m2ColorHex || '#ffffff',
        x: startX, y: 10, isOpen: false, isGrouped: false, dimTo: [], active: true,
        selected: false,
        distToggles: { ceiling: false, floor: false, left: false, right: false }
    });
    
    recalculateDashboardQuantities(); 
    pushHistory();
    alert(`Pushed ${f.id} to ${targetElev.name}!`);
}

function jumpToDashboard(frameId) {
    const targetIdx = dashProjectData.findIndex(d => d.id === frameId);
    if (targetIdx !== -1) { switchView('dashboard'); selectDashRow(targetIdx); }
}

function checkGlobalEditingWarning(id) {
    // Always recompute and update the banner based on the currently selected row.
    // (Previously this returned early if the row was 'already warned', which left the
    //  banner stuck open when the user switched to a row with zero wall references.)
    let count = 0;
    elevations.forEach(e => { e.frames.forEach(f => { if(f.id === id) count++; }); });
    
    const banner = document.getElementById('linkedWarningBanner');
    if (count > 1) {
        // Only show the banner when the spec is genuinely shared across multiple instances.
        // A single instance on one wall is the normal case and doesn't need a warning.
        document.getElementById('linkedCount').innerText = count;
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
    return true;
}

function pushUpdatesToElevations(dashIndex) {
    const d = dashProjectData[dashIndex];
    let factor = unitFactor(dashUnit, elevUnit);

    // Sync all dashboard-owned fields onto every matching elevation frame.
    // Earlier this only synced 9 basic fields (geometry + mats), leaving
    // useFloatMount / canvas / float-mount paper / frame profile / etc. stale
    // on elevations. That meant changes like Mat ↔ Float, edge style, paper
    // border, canvas depth, rabbet, frame color name, etc. all silently
    // failed to propagate. The set below mirrors the renderer's read sites:
    // anything that affects how an elevation frame draws gets synced.
    //
    // We don't touch elevation-local state (x, y, isOpen, isGrouped, dimTo,
    // active) — those are positioning/grouping concerns owned by the elevation,
    // not the dashboard.
    elevations.forEach(elev => {
        elev.frames.forEach(f => {
            if (f.id === d.id) {
                // Product type + mode flags
                f.product = d.product || '';
                f.useFloatMount = d.useFloatMount === true;
                f.useFauxMat = d.useFauxMat === true;

                // Geometry — dimensions in elevation units
                f.w = (parseFloat(d.extW) || 24) * factor;
                f.h = (parseFloat(d.extH) || 30) * factor;
                f.fW = (parseFloat(d.fW) || 1.25) * factor;
                f.fHeight = (parseFloat(d.fHeight) || 0) * factor;
                f.rabbetDepth = (parseFloat(d.rabbetDepth) || 0) * factor;
                f.bleed = (parseFloat(d.bleed) || 0) * factor;

                // Frame appearance
                f.fType = d.fType;
                f.fColor = d.fColor;
                f.fColorName = d.fColorName || '';
                f.fCode = d.fCode || '';
                f.swatchDataUrl = d.swatchDataUrl;

                // Mats (standard mount)
                f.m1A = d.m1A !== false;
                f.m1T = (parseFloat(d.m1T) || 0) * factor;
                f.m1B = (parseFloat(d.m1B) || 0) * factor;
                f.m1L = (parseFloat(d.m1L) || 0) * factor;
                f.m1R = (parseFloat(d.m1R) || 0) * factor;
                f.m1ColorName = d.m1ColorName || '';
                f.m1ColorHex = d.m1ColorHex;
                f.m2A = d.m2A;
                f.m2 = (parseFloat(d.m2) || 0) * factor;
                f.m2ColorName = d.m2ColorName || '';
                f.m2ColorHex = d.m2ColorHex;

                // Canvas (floater + frameless)
                f.canvasDepth = d.canvasDepth;
                f.canvasWrap = d.canvasWrap;
                f.floaterInset = (parseFloat(d.floaterInset) || 0.75) * factor;
                f._faceWidth = d._faceWidth;

                // Float mount (paper + backer + edge)
                f.sbBackerColorHex = d.sbBackerColorHex || '#ffffff';
                f.sbBackerColorName = d.sbBackerColorName || 'B 97 White';
                f.sbPaperColorHex = d.sbPaperColorHex || '#ffffff';
                f.sbPaperColorName = d.sbPaperColorName || 'White';
                f.sbPaperMargin = (isNaN(parseFloat(d.sbPaperMargin)) ? 1.5 : parseFloat(d.sbPaperMargin)) * factor;
                f.sbPaperBorder = (isNaN(parseFloat(d.sbPaperBorder)) ? 0.5 : parseFloat(d.sbPaperBorder)) * factor;
                f.sbPaperEdge = d.sbPaperEdge || 'clean';
                f.sbPaperEdgeSeed = d.sbPaperEdgeSeed || 0;
                f.paperType = d.paperType || '';

                // Production / spec
                f.glass = d.glass || '';
                f.hardware = d.hardware || '';
                f.backing = d.backing || '';
                f.mount = d.mount || '';
                f.notes = d.notes || '';
                f.prodNotes = d.prodNotes || '';
                f.location = d.location || '';
                f.imageCode = d.imageCode || '';

                // Caption fields (hidden in form but persisted)
                f.artist = d.artist || '';
                f.artworkTitle = d.artworkTitle || '';
                f.artType = d.artType || '';
            }
        });
    });
}

// =========================================================================
// DASHBOARD LOGIC
// =========================================================================
const dashFmt = (num) => {
    let n = Number(num);
    if (num === "" || num === undefined || num === null || isNaN(n)) return 0; 
    return parseFloat(n.toFixed(3)); 
};

function generateNextItemCode() {
    let max = 0;
    dashProjectData.forEach(d => {
        if (d.id.startsWith("ART.")) {
            let num = parseInt(d.id.replace("ART.", ""), 10);
            if (!isNaN(num) && num > max) max = num;
        }
    });
    return "ART." + String(max + 1).padStart(3, '0');
}

function toggleDashSection(id, btn) {
    const sec = document.getElementById(id);
    const span = btn.querySelector('span');
    if (sec.classList.contains('open')) {
        sec.classList.remove('open'); span.innerHTML = `<svg class="svg-icon" style="width:10px; height:10px; transform:rotate(-90deg);" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    } else {
        sec.classList.add('open'); span.innerHTML = `<svg class="svg-icon" style="width:10px; height:10px;" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }
}

function toggleDashSwatchDropdown() {
    const s = document.getElementById('swatchDropdownList');
    s.style.display = s.style.display === 'block' ? 'none' : 'block';
}

function setDashUnit(newUnit) {
    setUnit(newUnit);
}

// Unified unit setter. Called by all 3 toggle locations (dashboard, elevation
// Settings modal, header bar). Converts dashboard rows AND elevation frames
// AND all unit-aware inputs to the new unit, then updates all button states
// so all toggles stay in sync. Keeps dashUnit and elevUnit always equal —
// they exist as separate variables only because lots of call sites read
// them independently, but they're functionally one value now.
function setUnit(newUnit) {
    if (!UNIT_INFO[newUnit]) return;  // unknown unit, ignore
    if (dashUnit === newUnit && elevUnit === newUnit) return;  // already set

    // Conversion factor based on whichever was the "active" old unit. Since
    // we keep them in sync going forward, dashUnit is the canonical "from"
    // (it's where CSV exports originate). On first call after a load where
    // they might differ, we fall back to dashUnit too.
    const oldUnit = dashUnit;
    const f = unitFactor(oldUnit, newUnit);

    // Convert dashboard rows
    dashProjectData.forEach(row => {
        ['extW', 'extH', 'fW', 'fHeight', 'rabbetDepth', 'bleed', 'canvasDepth', 'canvasWrap', 'floaterInset', 'sbPaperMargin', 'sbPaperBorder', 'm1T', 'm1B', 'm1L', 'm1R', 'm2'].forEach(prop => {
            if (row[prop] !== "" && row[prop] !== undefined && !isNaN(row[prop])) {
                row[prop] = dashFmt(row[prop] * f);
            }
        });
    });
    dashUnit = newUnit;

    // Convert elevation data — frames, wall dimensions, person position.
    // Must use the SAME factor (oldUnit→newUnit) since elevUnit was equal
    // to oldUnit when this call started.
    elevations.forEach(elev => {
        // Use the SAME rounding precision (4 decimals) for wall, frames, and
        // person so they don't drift relative to each other across repeated
        // unit toggles. Mixed precision (wall .toFixed(2) vs frames .toFixed(4))
        // was causing dimension lines to visibly jitter when switching units.
        elev.wallW = parseFloat((parseFloat(elev.wallW) * f).toFixed(4));
        elev.wallH = parseFloat((parseFloat(elev.wallH) * f).toFixed(4));
        elev.frames.forEach(fr => {
            ['w','h','fW','fHeight','rabbetDepth','floaterInset','sbPaperMargin','sbPaperBorder','m1T','m1B','m1L','m1R','m2','x','y'].forEach(p => {
                fr[p] = parseFloat((parseFloat(fr[p] || 0) * f).toFixed(4));
            });
        });
        if (elev.personPos) elev.personPos.x = parseFloat((parseFloat(elev.personPos.x || 0) * f).toFixed(4));
    });
    elevUnit = newUnit;

    // Update wall inputs if elevation view is loaded
    const wallWEl = document.getElementById('wallW');
    const wallHEl = document.getElementById('wallH');
    if (wallWEl && elevations[currentElevIndex]) wallWEl.value = parseFloat(elevations[currentElevIndex].wallW.toFixed(2));
    if (wallHEl && elevations[currentElevIndex]) wallHEl.value = parseFloat(elevations[currentElevIndex].wallH.toFixed(2));

    // Convert all settings-modal inputs (Hang, Font, Nudge, Grid, Drag Snap)
    // and their unit labels.
    const labelText = newUnit === 'in' ? 'in' : (newUnit === 'cm' ? 'cm' : 'mm');
    [['hangHeight', null], ['baseboardHeight', null], ['nudgeSmall', null], ['nudgeBig', null],
     ['gridSize', null], ['dragSnap', null], ['alignGapValue', null]].forEach(([id, _]) => {
        const el = document.getElementById(id);
        if (el && el.value) el.value = parseFloat((parseFloat(el.value) * f).toFixed(2));
    });
    ['nudgeUnitLabel1', 'nudgeUnitLabel2', 'gridSizeUnitLabel', 'dragSnapUnitLabel', 'alignGapUnit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = labelText;
    });

    // Update ALL three trio button-states. Each may or may not exist in the
    // DOM (depending on which view is active and whether modal is built),
    // so guard each.
    [
        ['dashBtnInch', 'dashBtnCm', 'dashBtnMm'],
        ['elevBtnInch', 'elevBtnCm', 'elevBtnMm'],
        ['globalBtnInch', 'globalBtnCm', 'globalBtnMm'],
    ].forEach(([inId, cmId, mmId]) => {
        const inEl = document.getElementById(inId);
        const cmEl = document.getElementById(cmId);
        const mmEl = document.getElementById(mmId);
        if (inEl) inEl.classList.toggle('active', newUnit === 'in');
        if (cmEl) cmEl.classList.toggle('active', newUnit === 'cm');
        if (mmEl) mmEl.classList.toggle('active', newUnit === 'mm');
    });

    // Re-render both views so the new unit is reflected immediately.
    if (typeof loadDashDataIntoControls === 'function' && dashProjectData[dashSelectedRowIndex]) {
        loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    }
    // Critical: renderDashTable rebuilds the CSV preview area. Without this,
    // changing the unit updates the form inputs but the CSV stays in the
    // old unit until the user navigates away and back (which triggers a
    // re-render via switchView). User reported this as a bug.
    if (typeof renderDashTable === 'function') renderDashTable();
    if (typeof initElevControls === 'function') initElevControls();
    if (typeof drawElevAll === 'function') drawElevAll();
}

function selectDashRow(index) {
    if (index >= dashProjectData.length) return; 
    dashSelectedRowIndex = index;
    loadDashDataIntoControls(dashProjectData[index]);
    applyDashSelectionStyling();
    checkGlobalEditingWarning(dashProjectData[index].id);
}

// Multi-selection helpers
// ───────────────────────
// Visual states layered on each row:
//   .selected         = the primary selected row (form panel shows this one)
//   .multi-selected   = also part of the multi-selection but not the primary
// The primary is always conceptually part of the multi-selection too, but
// we don't add it to the Set to keep the data clean.

function applyDashSelectionStyling() {
    document.querySelectorAll('#rfiBody tr').forEach((tr, i) => {
        tr.classList.toggle('selected', i === dashSelectedRowIndex);
        tr.classList.toggle('multi-selected', dashMultiSelectedIndices.has(i) && i !== dashSelectedRowIndex);
    });
}

// Toggle a row in/out of the multi-selection. If the primary is being
// toggled OFF, promote one of the remaining multi-selected indices to
// primary (or clear primary if multi is empty).
function dashToggleMultiSelect(index) {
    if (index === dashSelectedRowIndex) {
        // Toggling off the primary: promote one of the multi-selected to primary,
        // or if multi is empty, just leave primary (single click would do
        // that — we're just being graceful for ctrl-click on primary).
        if (dashMultiSelectedIndices.size > 0) {
            const next = dashMultiSelectedIndices.values().next().value;
            dashMultiSelectedIndices.delete(next);
            selectDashRow(next);
        }
        return;
    }
    if (dashMultiSelectedIndices.has(index)) {
        dashMultiSelectedIndices.delete(index);
    } else {
        dashMultiSelectedIndices.add(index);
    }
    applyDashSelectionStyling();
}

// Select an inclusive range from `from` to `to`. The primary becomes `to`
// (mimics standard list-selection UX: shift-click sets the focused row).
function dashSelectRange(from, to) {
    if (from > to) [from, to] = [to, from];
    dashMultiSelectedIndices.clear();
    for (let i = from; i <= to; i++) {
        if (i !== to) dashMultiSelectedIndices.add(i);
    }
    selectDashRow(to);
}

// Clear the multi-selection. Primary selection stays. Bound to Esc on
// the dashboard.
function clearDashMultiSelection() {
    if (dashMultiSelectedIndices.size === 0) return;
    dashMultiSelectedIndices.clear();
    applyDashSelectionStyling();
}

// Return all currently-selected row indices in ascending order, including
// the primary. Used by group operations (drag, move-to).
function dashGetSelectedIndices() {
    const set = new Set(dashMultiSelectedIndices);
    set.add(dashSelectedRowIndex);
    return Array.from(set).sort((a, b) => a - b);
}

// ──────────────────────────────────────────────────────────────────────────
// MOVE TO MODAL
// ──────────────────────────────────────────────────────────────────────────
// User picks a target ITEM CODE + Above/Below to relocate selected row(s).
// Works for single selection (one row) and multi-selection (a group moves
// together preserving relative order). Helpful when the table has many
// rows and dragging would be tedious — and matches the "PDF order tracks
// CSV order" workflow goal.

function openMoveToModal() {
    if (!dashProjectData || dashProjectData.length < 2) {
        showInfoModal('Nothing to move', 'You need at least two rows for Move To to make sense.');
        return;
    }
    const selected = dashGetSelectedIndices();
    const summary = document.getElementById('moveToSummary');
    if (selected.length === 1) {
        const row = dashProjectData[selected[0]];
        summary.innerHTML = `Move <strong>${row.id}</strong> to a new position.`;
    } else {
        summary.innerHTML = `Move <strong>${selected.length}</strong> selected rows as a group.`;
    }
    // Populate the dropdown with all rows that are NOT in the current
    // selection (you can't reference yourself).
    const sel = new Set(selected);
    const select = document.getElementById('moveToTarget');
    select.innerHTML = '';
    dashProjectData.forEach((row, i) => {
        if (sel.has(i)) return;
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = row.id || `Row ${i + 1}`;
        select.appendChild(opt);
    });
    if (select.options.length === 0) {
        showInfoModal('No targets', 'There are no other rows to move next to.');
        return;
    }
    // Default position: above (the radio's default checked attribute already
    // sets this, but reset in case the user previously chose below)
    document.querySelector('input[name="moveToPos"][value="above"]').checked = true;
    document.getElementById('moveToModal').style.display = 'flex';
}

function applyMoveTo() {
    const select = document.getElementById('moveToTarget');
    const targetIdx = parseInt(select.value, 10);
    if (isNaN(targetIdx)) return;
    const pos = document.querySelector('input[name="moveToPos"]:checked').value;
    const insertBefore = pos === 'above' ? targetIdx : targetIdx + 1;

    document.getElementById('moveToModal').style.display = 'none';

    const selected = dashGetSelectedIndices();
    if (selected.length === 1) {
        // Single-row move. Adjust insert index if the source was before target.
        let insertIdx = insertBefore;
        if (selected[0] < insertIdx) insertIdx--;
        reorderDashRow(selected[0], insertIdx);
    } else {
        reorderDashRows(selected, insertBefore);
    }
}

// ──────────────────────────────────────────────────────────────────────────
// BULK EDIT + DUPLICATE AS SERIES
// ──────────────────────────────────────────────────────────────────────────
// Two operations that work on the dashboard multi-selection:
//   - Bulk Edit: set ONE field to the same value on all selected rows
//   - Duplicate as Series: from one source row, create N copies with
//     sequential IDs (e.g. ART.001 → ART.002…ART.012)
//
// Both push a single history entry (so Ctrl+Z reverts the whole batch).

// ── BULK EDIT (real dashboard form, scratch-edited) ──────────────────────────
// Instead of a separate mini-form, Bulk Edit MOVES the actual dashboard form
// panel into a blurred "Bulk Edit" modal. Because it's the real form node
// (moved, not cloned), it's a 1:1 of the dashboard with no invented fields and
// the frame code + swatch visible together. Edits go to a standalone SCRATCH
// object (see syncDashAndCalculate's _bulkEditing branch) so NOTHING in the
// project changes until Apply. Fields whose values differ across the selected
// rows are greyed out — you can only bulk-change fields the rows already share.

let _bulkEditing = false;
let _bulkScratch = null;       // the row object the moved form reads/writes
let _bulkBaseline = null;      // snapshot of the scratch at open (to diff on Apply)
let _bulkSelected = [];        // real selected row indices to apply to
let _bulkFormHome = null;      // { parent, next } to restore the moved panel
let _bulkSavedIndex = 0;       // dashSelectedRowIndex to restore

// Map each comparable data key → the input element id(s) it lives in, so we can
// (a) detect which fields differ across the selection and (b) grey those out.
// Item Code / Image Code / dimensions are per-row unique and always locked.
const BULK_FIELD_ELEMENTS = {
    product: ['m_product'], location: ['m_location'], level: ['m_level'],
    artType: ['m_artType'], paperType: ['m_paperType'],
    fW: ['fW'], fHeight: ['fHeight'], rabbetDepth: ['rabbetDepth'],
    fColor: ['fColor'], fCode: ['m_fCode'], fColorName: ['m_fColorName'],
    m1T: ['m1T'], m1B: ['m1B'], m1L: ['m1L'], m1R: ['m1R'],
    m1ColorName: ['m1_color'], m1ColorHex: ['m1_colorHex'],
    m2: ['m2'], m2ColorName: ['m2_color'], m2ColorHex: ['m2_colorHex'],
    glass: ['m_glass'], hardware: ['m_hardware'], mount: ['m_mount'],
    backing: ['m_backing'], notes: ['m_notes'], prodNotes: ['m_prodNotes'],
    canvasDepth: ['canvasDepth'], canvasWrap: ['canvasWrap'], floaterInset: ['floaterInset'],
    bleed: ['m_bleed'],
    // Float Mount paper fields (the panel shown when FLOAT mode is on).
    sbBackerColorName: ['sbBackerColorName'], sbBackerColorHex: ['sbBackerColorHex'],
    sbPaperColorName: ['sbPaperColorName'], sbPaperColorHex: ['sbPaperColorHex'],
    sbPaperMargin: ['sbPaperMargin'], sbPaperBorder: ['sbPaperBorder'],
};
// Mode/data keys with NO single dedicated input (driven by toggle buttons or
// derived) that must still be diffed + carried on Apply so things like the
// MAT↔FLOAT mode switch, faux-mat toggle, and paper-edge style propagate.
const BULK_EXTRA_KEYS = ['useFloatMount', 'useFauxMat', 'sbPaperEdge'];
// Keys that are inherently per-row and must never be bulk-applied.
const BULK_LOCKED_ELEMENTS = ['m_itemCode', 'm_imageCode', 'extW', 'extH', 'm_qty'];

function openBulkEditModal() {
    if (!dashProjectData || dashProjectData.length === 0) {
        showInfoModal('Nothing to edit', 'Add some rows first.');
        return;
    }
    const selected = dashGetSelectedIndices();
    _bulkSelected = selected.slice();
    _bulkSavedIndex = dashSelectedRowIndex;

    // Header summary.
    const summary = document.getElementById('bulkEditSummary');
    if (selected.length === 1) {
        summary.innerHTML = `Editing <strong>${dashProjectData[selected[0]].id}</strong>. Tip: select multiple rows (Shift/Ctrl-click) to bulk edit. Greyed fields differ across the selection.`;
    } else {
        summary.innerHTML = `Editing <strong>${selected.length}</strong> rows. Greyed-out fields differ across the selection — only fields the rows share can be changed together.`;
    }

    // Scratch = deep copy of the PRIMARY row. The form edits this, never the
    // real data. (structuredClone falls back to JSON for older engines.)
    const primary = dashProjectData[dashSelectedRowIndex];
    _bulkScratch = (typeof structuredClone === 'function') ? structuredClone(primary) : JSON.parse(JSON.stringify(primary));

    _bulkEditing = true;

    // Move the real form panel into the modal mount, then load the scratch.
    const pane = document.getElementById('dashRightPane');
    const mount = document.getElementById('bulkFormMount');
    if (pane && mount) {
        _bulkFormHome = { parent: pane.parentNode, next: pane.nextSibling };
        mount.appendChild(pane);
        pane.classList.add('bulk-mode');
    }
    loadDashDataIntoControls(_bulkScratch);

    // Grey out fields that differ across the selection (+ always-locked ones).
    _bulkApplyDifferingGreyout(selected);

    // Baseline AFTER loading the form, so Apply diffs only the user's changes.
    _bulkBaseline = (typeof structuredClone === 'function') ? structuredClone(_bulkScratch) : JSON.parse(JSON.stringify(_bulkScratch));

    document.getElementById('bulkEditModal').style.display = 'flex';
}

// Disable inputs for keys whose value isn't shared by every selected row, plus
// the always-locked per-row fields. Differing inputs get a title hint + dim.
function _bulkApplyDifferingGreyout(selected) {
    const sameAcross = (key) => {
        const first = dashProjectData[selected[0]][key];
        return selected.every(i => String(dashProjectData[i][key] === undefined ? '' : dashProjectData[i][key]) === String(first === undefined ? '' : first));
    };
    const setDisabled = (id, off, reason) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = off;
        const cell = el.closest('div');
        if (cell) cell.classList.toggle('bulk-locked-field', off);
        if (off && reason) el.title = reason;
    };
    // Reset any previous greyout first.
    Object.values(BULK_FIELD_ELEMENTS).flat().concat(BULK_LOCKED_ELEMENTS).forEach(id => setDisabled(id, false, ''));
    // Per-row unique fields: always locked.
    BULK_LOCKED_ELEMENTS.forEach(id => setDisabled(id, true, 'Per-row value — not bulk-editable'));
    // Differing fields: lock.
    Object.keys(BULK_FIELD_ELEMENTS).forEach(key => {
        if (!sameAcross(key)) {
            BULK_FIELD_ELEMENTS[key].forEach(id => setDisabled(id, true, 'Differs across selected rows — change them individually'));
        }
    });
}

// Apply: diff the scratch against its baseline; copy changed + editable fields
// to every selected row. Excludes locked/differing fields (their inputs are
// disabled, so they can't have changed anyway).
function applyBulkEdit() {
    if (!_bulkEditing || !_bulkScratch || !_bulkBaseline) { _bulkTeardown(false); return; }

    // Which data keys did the user actually change?
    const changedKeys = [];
    const lockedIds = new Set(BULK_LOCKED_ELEMENTS);
    Object.keys(BULK_FIELD_ELEMENTS).forEach(key => {
        // Skip if any mapped input is disabled (locked/differing).
        const anyDisabled = BULK_FIELD_ELEMENTS[key].some(id => { const el = document.getElementById(id); return el && el.disabled; });
        if (anyDisabled) return;
        const a = _bulkScratch[key], b = _bulkBaseline[key];
        if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) changedKeys.push(key);
    });
    // Mode/derived keys without a dedicated input (MAT↔FLOAT, faux mat, edge).
    BULK_EXTRA_KEYS.forEach(key => {
        const a = _bulkScratch[key], b = _bulkBaseline[key];
        if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) changedKeys.push(key);
    });
    // If the MAT↔FLOAT mode itself changed, carry the complete float-paper field
    // set so every selected row fully switches mode (not just the toggle flag).
    const floatModeChanged = changedKeys.indexOf('useFloatMount') >= 0;
    const floatCarry = ['useFloatMount', 'sbBackerColorName', 'sbBackerColorHex', 'sbPaperColorName', 'sbPaperColorHex', 'sbPaperMargin', 'sbPaperBorder', 'sbPaperEdge'];

    // Frame swatch: if the user picked a library swatch, fType becomes 'image'
    // and swatchDataUrl/swatchName/fW/fHeight/rabbet change — carry those too.
    const swatchChanged = _bulkScratch.swatchDataUrl !== _bulkBaseline.swatchDataUrl || _bulkScratch.swatchName !== _bulkBaseline.swatchName || _bulkScratch.fType !== _bulkBaseline.fType;
    const carryWithSwatch = ['fType', 'swatchDataUrl', 'swatchName', 'fW', 'fHeight', 'rabbetDepth', 'fCode', 'product', 'floaterInset', '_faceWidth', 'useFloatMount'];

    if (changedKeys.length === 0 && !swatchChanged) { _bulkTeardown(false); return; }

    _bulkSelected.forEach(idx => {
        const target = dashProjectData[idx];
        changedKeys.forEach(k => { target[k] = _bulkScratch[k]; });
        if (floatModeChanged) floatCarry.forEach(k => { if (_bulkScratch[k] !== undefined) target[k] = _bulkScratch[k]; });
        if (swatchChanged) carryWithSwatch.forEach(k => { if (_bulkScratch[k] !== undefined) target[k] = _bulkScratch[k]; });
        // Keep the Shadow Box float-mount flag consistent if product changed.
        if (changedKeys.indexOf('product') >= 0) target.useFloatMount = (_bulkScratch.product === 'Framed Art (Shadow Box)');
    });

    _bulkTeardown(true);
}

// Restore: move the form panel home, exit bulk mode, reload the real row.
// commit=true means we just applied (recalc/render/history + push elevations).
function _bulkTeardown(commit) {
    _bulkEditing = false;
    const pane = document.getElementById('dashRightPane');
    if (pane && _bulkFormHome && _bulkFormHome.parent) {
        pane.classList.remove('bulk-mode');
        _bulkFormHome.parent.insertBefore(pane, _bulkFormHome.next);
    }
    _bulkFormHome = null;

    // Clear any greyout so the live form is fully editable again.
    Object.values(BULK_FIELD_ELEMENTS).flat().concat(BULK_LOCKED_ELEMENTS).forEach(id => {
        const el = document.getElementById(id); if (el) { el.disabled = false; const c = el.closest('div'); if (c) c.classList.remove('bulk-locked-field'); }
    });
    // m_qty is genuinely always disabled (auto-calculated) — restore that.
    const qty = document.getElementById('m_qty'); if (qty) qty.disabled = true;

    document.getElementById('bulkEditModal').style.display = 'none';

    // Restore selection + the live form to the real primary row.
    dashSelectedRowIndex = Math.min(_bulkSavedIndex, dashProjectData.length - 1);
    _bulkScratch = null; _bulkBaseline = null;

    if (commit) {
        recalculateDashboardQuantities();
        renderDashTable();
        _bulkSelected.forEach(idx => { if (typeof pushUpdatesToElevations === 'function') pushUpdatesToElevations(idx); });
        if (typeof loadDashDataIntoControls === 'function' && dashProjectData[dashSelectedRowIndex]) loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
        if (typeof updateDashVisualsFromDOM === 'function') updateDashVisualsFromDOM();
        pushHistory();
    } else {
        if (typeof loadDashDataIntoControls === 'function' && dashProjectData[dashSelectedRowIndex]) loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
        if (typeof updateDashVisualsFromDOM === 'function') updateDashVisualsFromDOM();
        renderDashTable();
    }
}

function cancelBulkEdit() { _bulkTeardown(false); }


// ── DUPLICATE AS SERIES ──

function openDuplicateSeriesModal() {
    if (!dashProjectData || dashProjectData.length === 0) {
        showInfoModal('Nothing to duplicate', 'Add a row first.');
        return;
    }
    const sourceIdx = dashSelectedRowIndex;
    const source = dashProjectData[sourceIdx];
    document.getElementById('dupSeriesSummary').innerHTML =
        `Duplicating <strong>${source.id}</strong>. New rows inherit all its settings.`;

    // Default pattern: try to detect the source's ID pattern and reuse it.
    // E.g. ART.005 → pattern "ART.{n}", starting at 006 (or whatever's next free).
    const patternInput = document.getElementById('dupSeriesPattern');
    const startInput = document.getElementById('dupSeriesStart');
    const padInput = document.getElementById('dupSeriesPad');
    // Parse source ID: looks for trailing digits
    const m = source.id.match(/^(.*?)(\d+)(\D*)$/);
    if (m) {
        patternInput.value = m[1] + '{n}' + m[3];
        startInput.value = String(parseInt(m[2], 10) + 1);
        padInput.value = String(m[2].length);
    } else {
        patternInput.value = source.id + '.{n}';
        startInput.value = '1';
        padInput.value = '3';
    }
    document.getElementById('dupSeriesCount').value = '5';
    updateDupSeriesPreview();
    document.getElementById('duplicateSeriesModal').style.display = 'flex';
}

function buildDupSeriesIds() {
    const count = parseInt(document.getElementById('dupSeriesCount').value, 10) || 0;
    const pattern = document.getElementById('dupSeriesPattern').value || 'ART.{n}';
    const start = parseInt(document.getElementById('dupSeriesStart').value, 10) || 1;
    const pad = parseInt(document.getElementById('dupSeriesPad').value, 10) || 1;
    const ids = [];
    for (let i = 0; i < count; i++) {
        const n = String(start + i).padStart(pad, '0');
        ids.push(pattern.replace('{n}', n));
    }
    return ids;
}

function updateDupSeriesPreview() {
    const ids = buildDupSeriesIds();
    const previewDiv = document.getElementById('dupSeriesPreview');
    if (ids.length === 0) {
        previewDiv.innerHTML = '<span style="color:var(--text-muted);">(no IDs to preview)</span>';
        return;
    }
    // Find collisions with existing rows
    const existing = new Set(dashProjectData.map(r => r.id));
    const lines = ids.map(id => {
        if (existing.has(id)) {
            return `<span style="color:#e74c3c;">${id} ⚠ collision</span>`;
        }
        return id;
    });
    previewDiv.innerHTML = lines.join('<br>');
}

function applyDuplicateSeries() {
    const ids = buildDupSeriesIds();
    if (ids.length === 0) {
        showInfoModal('Nothing to do', 'Set a count of at least 1.');
        return;
    }
    // Validate: check for collisions with existing IDs and with each other
    const existing = new Set(dashProjectData.map(r => r.id));
    const collisions = [];
    const seen = new Set();
    ids.forEach(id => {
        if (existing.has(id)) collisions.push(id + ' (exists)');
        else if (seen.has(id)) collisions.push(id + ' (duplicate in series)');
        seen.add(id);
    });
    if (collisions.length > 0) {
        showInfoModal('ID collision',
            `These IDs would collide with existing rows or each other:\n${collisions.slice(0, 8).join('\n')}` +
            (collisions.length > 8 ? `\n…and ${collisions.length - 8} more` : '') +
            '\n\nAdjust the starting number or pattern.');
        return;
    }

    // Generate the new rows. Source = primary selected row. Each copy deep-
    // clones the source then overrides the id. Inserted directly after the
    // source, in order.
    const sourceIdx = dashSelectedRowIndex;
    const source = dashProjectData[sourceIdx];
    const newRows = ids.map(id => {
        const copy = JSON.parse(JSON.stringify(source));
        copy.id = id;
        return copy;
    });
    // Insert all new rows just after source
    dashProjectData.splice(sourceIdx + 1, 0, ...newRows);

    recalculateDashboardQuantities();
    renderDashTable();
    pushHistory();
    document.getElementById('duplicateSeriesModal').style.display = 'none';
}

function addDashRow() {
    const newRow = JSON.parse(JSON.stringify(dashDefaultData)); 
    newRow.id = generateNextItemCode();
    // dashDefaultData holds INCH values. Convert every dimensional (length)
    // field to the current unit so a fresh item is the same physical size
    // regardless of the active unit (e.g. a 3" mat stays 3" → ~76mm in mm).
    const _f = unitFactor('in', dashUnit);
    const lenFields = ['extW','extH','fW','fHeight','rabbetDepth','bleed','floaterInset',
        'sbPaperMargin','sbPaperBorder','m1T','m1B','m1L','m1R','m2'];
    lenFields.forEach(k => {
        const v = parseFloat(newRow[k]);
        if (!isNaN(v)) newRow[k] = dashFmt(v * _f);
    });
    newRow.fType = "color"; newRow.fColor = "#000000"; newRow.fCode = "Standard Black";
    
    // Insert right after the currently-selected row (so the new row appears
    // visually adjacent to where the user was working). Falls back to
    // pushing at the end if the selection is out of bounds (e.g. empty table).
    const insertAt = (dashSelectedRowIndex >= 0 && dashSelectedRowIndex < dashProjectData.length)
        ? dashSelectedRowIndex + 1
        : dashProjectData.length;
    dashProjectData.splice(insertAt, 0, newRow);
    dashSelectedRowIndex = insertAt;
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    renderDashTable(); checkGlobalEditingWarning(newRow.id);
    pushHistory();
}

function duplicateDashRow() {
    const newRow = JSON.parse(JSON.stringify(dashProjectData[dashSelectedRowIndex])); 
    newRow.id = generateNextItemCode(); 
    newRow.qty = 0; 
    // Insert right after the source row so the dupe lands visually next to
    // its original. (Was previously pushing to the end of the array, which
    // forced users to scroll/search to find the dupe and reorder manually.)
    const insertAt = (dashSelectedRowIndex >= 0 && dashSelectedRowIndex < dashProjectData.length)
        ? dashSelectedRowIndex + 1
        : dashProjectData.length;
    dashProjectData.splice(insertAt, 0, newRow);
    dashSelectedRowIndex = insertAt;
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    renderDashTable(); checkGlobalEditingWarning(newRow.id);
    pushHistory();
}

function detachDashRow() {
    // duplicateDashRow already creates a new spec with a fresh item code and qty=0,
    // and selects it. Existing wall references stay on the original spec.
    duplicateDashRow();
    const newId = dashProjectData[dashSelectedRowIndex].id;
    // Force the banner to re-evaluate against the new (un-linked) spec.
    checkGlobalEditingWarning(newId);
    alert(`Detached. Settings copied to a new independent item code (${newId}). The walls still reference the original; you can now edit this new spec without affecting them, or push it to new walls.`);
}

function deleteDashRow() {
    if(dashProjectData.length <= 1) return alert("Cannot delete the last row.");
    const idToDelete = dashProjectData[dashSelectedRowIndex].id;
    dashProjectData.splice(dashSelectedRowIndex, 1);
    dashSelectedRowIndex = Math.max(0, dashSelectedRowIndex - 1);
    
    elevations.forEach(elev => { elev.frames = elev.frames.filter(f => f.id !== idToDelete); });
    
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    renderDashTable(); checkGlobalEditingWarning(dashProjectData[dashSelectedRowIndex].id);
    pushHistory();
}

function loadDashDataIntoControls(data) {
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
    setVal('m_itemCode', data.id); setVal('m_imageCode', data.imageCode); setVal('m_level', data.level); setVal('m_qty', data.qty);
    setVal('m_product', data.product); setVal('m_location', data.location); setVal('m_bleed', dashFmt(data.bleed)); setVal('canvasDepth', dashFmt(data.canvasDepth)); setVal('canvasWrap', dashFmt(data.canvasWrap)); setVal('floaterInset', dashFmt(data.floaterInset !== undefined ? data.floaterInset : 0.75));
    // Phase A: artwork attribution + frame profile depth + paper type.
    // All optional — defaulted to '' / 0 for older saved rows that don't have them yet.
    setVal('m_artist', data.artist !== undefined ? data.artist : '');
    setVal('m_artworkTitle', data.artworkTitle !== undefined ? data.artworkTitle : '');
    setVal('m_artType', data.artType !== undefined ? data.artType : '');
    updateDashArtworkThumb(data.artworkUrl || '');
    setVal('m_fColorName', data.fColorName !== undefined ? data.fColorName : 'Standard Black');
    // Render zero-valued numeric fields as blank instead of "0" so the input is
    // empty when the user clicks in. Otherwise the leading "0" gets prepended to
    // their typing (you'd type "1.25" and the field shows "01.25"). 0 in data
    // means "not set" for these optional profile-depth fields.
    setVal('fHeight', (data.fHeight && data.fHeight !== 0) ? dashFmt(data.fHeight) : '');
    setVal('rabbetDepth', (data.rabbetDepth && data.rabbetDepth !== 0) ? dashFmt(data.rabbetDepth) : '');
    setVal('m_paperType', data.paperType !== undefined ? data.paperType : 'Fine Art Paper');
    // Shadow box / Float Mount fields (defaulted for older saved projects)
    setVal('sbBackerColorName', data.sbBackerColorName !== undefined ? data.sbBackerColorName : 'B 97 White');
    setVal('sbBackerColorHex', data.sbBackerColorHex !== undefined ? data.sbBackerColorHex : '#ffffff');
    setVal('sbPaperColorName', data.sbPaperColorName !== undefined ? data.sbPaperColorName : 'White');
    setVal('sbPaperColorHex', data.sbPaperColorHex !== undefined ? data.sbPaperColorHex : '#ffffff');
    setVal('sbPaperMargin', dashFmt(data.sbPaperMargin !== undefined ? data.sbPaperMargin : 1.5));
    setVal('sbPaperBorder', dashFmt(data.sbPaperBorder !== undefined ? data.sbPaperBorder : 0.5));
    const sbEdge = data.sbPaperEdge || 'clean';
    setVal('sbPaperEdge', sbEdge);
    document.getElementById('sbEdgeBtnClean').classList.toggle('active', sbEdge === 'clean');
    document.getElementById('sbEdgeBtnTorn').classList.toggle('active', sbEdge === 'torn');
    // Mat / Float toggle — read the row's stored mode and update the UI accordingly.
    applyMatFloatModeUI(!!data.useFloatMount);
    setVal('extW', dashFmt(data.extW)); setVal('extH', dashFmt(data.extH)); setVal('fType', data.fType); setVal('fW', dashFmt(data.fW)); 
    setVal('fColor', data.fColor); setVal('m_fCode', data.fCode); 
    // Reflect frame style on the toggle buttons (hidden #fType is the source of truth)
    document.getElementById('fTypeBtnLibrary').classList.toggle('active', data.fType === 'image');
    document.getElementById('fTypeBtnSolid').classList.toggle('active', data.fType === 'color');
    applyFrameStyleDimming(data.fType);
    setVal('m1_color', data.m1ColorName); setVal('m1_colorHex', data.m1ColorHex || '#ffffff');
    setVal('m2_color', data.m2ColorName); setVal('m2_colorHex', data.m2ColorHex || '#ffffff');
    setVal('m_glass', data.glass); setVal('m_hardware', data.hardware); setVal('m_mount', data.mount); setVal('m_backing', data.backing); setVal('m_notes', data.notes); setVal('m_prodNotes', data.prodNotes);

    const m1On = data.m1A !== false;
    document.getElementById('m1Toggle').classList.toggle('active', m1On); document.getElementById('m1Toggle').innerText = m1On ? 'ON' : 'OFF';
    document.querySelectorAll('.m1-input').forEach(el => el.disabled = !m1On);
    
    // M2 follows M1: it can only be active when M1 is active. The toggle is disabled when M1 is off.
    const m2EffectivelyOn = m1On && data.m2A;
    const m2Btn = document.getElementById('m2Toggle');
    m2Btn.classList.toggle('active', m2EffectivelyOn); m2Btn.innerText = m2EffectivelyOn ? 'ON' : 'OFF';
    m2Btn.disabled = !m1On;
    m2Btn.style.opacity = m1On ? '1' : '0.4';
    m2Btn.style.cursor = m1On ? 'pointer' : 'not-allowed';
    document.getElementById('m2').disabled = !m2EffectivelyOn;
    
    document.getElementById('m1Lock').classList.toggle('active', data.m1Locked); document.getElementById('m1Lock').innerText = data.m1Locked ? 'LOCKED' : 'UNLOCKED';
    
    const linkBtn = document.getElementById('matLinkBtn');
    linkBtn.classList.toggle('active', data.matsLinked !== false);
    linkBtn.style.color = linkBtn.classList.contains('active') ? 'var(--accent)' : 'var(--text-muted)';
    
    setVal('m1T', dashFmt(data.m1T)); setVal('m1B', dashFmt(data.m1B)); setVal('m1L', dashFmt(data.m1L)); setVal('m1R', dashFmt(data.m1R)); setVal('m2', dashFmt(data.m2));

    // Faux Mat: restore toggle + border input from row data. Shares sbPaperBorder
    // with the float mount panel — the active input depends on mode, but the
    // underlying value is the same.
    const fauxOn = data.useFauxMat === true;
    const fauxBtn = document.getElementById('fauxMatToggle');
    if (fauxBtn) {
        fauxBtn.classList.toggle('active', fauxOn);
        fauxBtn.innerText = fauxOn ? 'ON' : 'OFF';
    }
    const fauxBorderInput = document.getElementById('fauxBorder');
    if (fauxBorderInput) {
        fauxBorderInput.value = fauxOn ? dashFmt(data.sbPaperBorder || 0) : '';
        fauxBorderInput.disabled = !fauxOn;
    }

    handleDashProductChange(false);
    document.getElementById('swatchSelectedDisplay').textContent = (data.fType === 'image' && data.swatchName) ? data.swatchName : 'Frame';

    if(data.swatchDataUrl && data.fType === 'image') { dashActiveImageObj.src = data.swatchDataUrl; document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${data.swatchDataUrl})`; } 
    else { dashActiveImageObj.src = emptyImgUrl; document.getElementById('swatchThumbPreview').style.backgroundImage = `none`; }
    updateDashVisualsFromDOM();
    // Surface any constraint warnings for this row immediately on load.
    updateDashboardWarnings();
}

// Update table from a table input. The fourth arg (`fromTable`) lets the caller
// signal that the update came from a table-row input — in that case we DON'T
// re-render the whole tbody, because doing so would destroy the input the user
// is currently typing into and kick focus away (the "can only type one digit"
// bug). We instead update just the calculated cells of the affected row in
// place. Form-side and other callers leave fromTable undefined → full re-render.
function dashHtIn(idx, field, val, fromTable) {
    let row = dashProjectData[idx];
    if(['qty','extW','extH','fW','fHeight','m1T','m1R','m1B','m1L','m2','m_bleed','canvasDepth','canvasWrap'].includes(field)) val = parseFloat(val) || 0;
    if (field === 'id') { const oldId = row.id; elevations.forEach(elev => { elev.frames.forEach(f => { if (f.id === oldId) f.id = val; }); }); }
    row[field] = val;

    if (idx === dashSelectedRowIndex) {
        const map = { 'id':'m_itemCode', 'imageCode':'m_imageCode', 'level':'m_level', 'qty':'m_qty', 'location':'m_location', 'extW':'extW', 'extH':'extH', 'fCode':'m_fCode', 'fW':'fW', 'fHeight':'fHeight', 'canvasDepth':'canvasDepth', 'canvasWrap':'canvasWrap', 'm1ColorName':'m1_color', 'm1ColorHex':'m1_colorHex', 'm2ColorName':'m2_color', 'm2ColorHex':'m2_colorHex', 'm1T':'m1T', 'm1R':'m1R', 'm1B':'m1B', 'm1L':'m1L', 'm2':'m2', 'glass':'m_glass', 'hardware':'m_hardware', 'backing':'m_backing', 'mount':'m_mount', 'notes':'m_notes', 'prodNotes':'m_prodNotes' };
        if(map[field] && document.getElementById(map[field])) document.getElementById(map[field]).value = field.includes('Color') ? val : dashFmt(row[field]);
        if(field === 'product') { document.getElementById('m_product').value = row.product; handleDashProductChange(false); }
        updateDashVisualsFromDOM();
        pushUpdatesToElevations(idx);
    }

    if (fromTable) {
        // Lightweight in-place update: refresh the affected row's calculated
        // cells (Open W/H, Print W/H) without rebuilding the row, so the
        // input the user is typing into stays alive.
        updateTableRowCalcs(idx);
    } else {
        // Form-side update or product change — full re-render is fine since
        // user isn't typing into a table input.
        renderDashTable();
    }
    // Recalc qty after id changes — but only for non-table edits. Calling
    // recalculateDashboardQuantities from a table input re-renders the whole
    // table, which destroys the input the user is typing into (causes focus
    // loss + scroll jumps). For renames, the qty is functionally unchanged
    // anyway (the new id propagates to all elev frame refs at the top of
    // this function, so total references stay the same).
    if (field === 'id' && !fromTable) recalculateDashboardQuantities();
}

// Update only the calculated (display-only) cells of a table row.
// Called from dashHtIn when the change came from a table input — avoids the
// destroy-and-recreate cycle that kills focus during typing.
function updateTableRowCalcs(idx) {
    const row = dashProjectData[idx];
    if (!row) return;
    const isC = (row.product === "Framed Canvas (Floater)");
    const isFL = (row.product === "Frameless Canvas (Wrapped)");
    const useFM = !isC && !isFL && (row.useFloatMount === true);
    const sbPM = useFM ? (parseFloat(row.sbPaperMargin) || 0) : 0;
    const sbPB = useFM ? (parseFloat(row.sbPaperBorder) || 0) : 0;
    const insetVal = isC ? (parseFloat(row.floaterInset) || 0.75) : 0;
    const mT = (row.m1A !== false && !isC && !isFL && !useFM) ? (parseFloat(row.m1T) || 0) : 0;
    const mB = (row.m1A !== false && !isC && !isFL && !useFM) ? (parseFloat(row.m1B) || 0) : 0;
    const mL = (row.m1A !== false && !isC && !isFL && !useFM) ? (parseFloat(row.m1L) || 0) : 0;
    const mR = (row.m1A !== false && !isC && !isFL && !useFM) ? (parseFloat(row.m1R) || 0) : 0;
    const m2v = (row.m2A && !isC && !isFL && !useFM) ? (parseFloat(row.m2) || 0) : 0;
    const fW = parseFloat(row.fW) || 0;

    let finalW, finalH;
    if (isC) { finalW = row.extW - insetVal*2; finalH = row.extH - insetVal*2; }
    else if (isFL) { finalW = row.extW; finalH = row.extH; }
    else if (useFM) { finalW = row.extW - (fW*2) - sbPM*2 - sbPB*2; finalH = row.extH - (fW*2) - sbPM*2 - sbPB*2; }
    else { finalW = row.extW - (fW*2) - mL - mR - (m2v*2); finalH = row.extH - (fW*2) - mT - mB - (m2v*2); }

    let imgW, imgH;
    if (isC) { imgW = finalW; imgH = finalH; }
    else if (isFL) {
        const wrap = parseFloat(row.canvasWrap) || 0;
        imgW = finalW + wrap*2; imgH = finalH + wrap*2;
    }
    else { imgW = finalW + ((row.bleed || 0) * 2); imgH = finalH + ((row.bleed || 0) * 2); }

    const setCell = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = dashFmt(Math.max(0, val));
    };
    setCell(`calc-openW-${idx}`, finalW);
    setCell(`calc-openH-${idx}`, finalH);
    setCell(`calc-printW-${idx}`, imgW);
    setCell(`calc-printH-${idx}`, imgH);
}

function syncDashAndCalculate() {
    const getRaw = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const getVal = (id) => parseFloat(getRaw(id)) || 0;
    const getStr = (id) => getRaw(id);
    const row = _bulkEditing ? (_bulkScratch || {}) : dashProjectData[dashSelectedRowIndex];
    
    const oldId = row.id; const newId = getStr('m_itemCode');
    if (!_bulkEditing && oldId !== newId) { elevations.forEach(elev => { elev.frames.forEach(f => { if (f.id === oldId) f.id = newId; }); }); }

    const isColor = getStr('fType') === 'color';
    const isLinked = document.getElementById('matLinkBtn').classList.contains('active');
    
    let m1Name = getStr('m1_color'); let m1Hex = getStr('m1_colorHex');
    let m2Name = isLinked ? m1Name : getStr('m2_color'); let m2Hex = isLinked ? m1Hex : getStr('m2_colorHex');
    
    if (isLinked) { document.getElementById('m2_color').value = m2Name; document.getElementById('m2_colorHex').value = m2Hex; }

    const m1Active = document.getElementById('m1Toggle').classList.contains('active');
    // M2 can never be active if M1 is off (M2 sits inside M1).
    const m2Active = m1Active && document.getElementById('m2Toggle').classList.contains('active');

    const _assembledRow = {
        id: newId, imageCode: getStr('m_imageCode'), level: getStr('m_level'), qty: getVal('m_qty'), product: getStr('m_product'), location: getStr('m_location'),
        // Phase A artwork attribution fields. Empty values are preserved as-is — they
        // render as blank cells in CSV and skipped lines in the InDesign spec block.
        artist: getStr('m_artist'), artworkTitle: getStr('m_artworkTitle'), artType: getStr('m_artType'),
        artworkUrl: row.artworkUrl || '',
        // Frame profile geometry: face width (fW) is the visible frame edge; fHeight is the
        // total profile depth front-to-back; rabbetDepth is the L-pocket depth where
        // mat/print/glass/backing stack up. fHeight ≥ rabbetDepth (rabbet is a notch in the rail).
        fHeight: getVal('fHeight') || 0,
        rabbetDepth: getVal('rabbetDepth') || 0,
        fColorName: getStr('m_fColorName') || '',
        paperType: getStr('m_paperType') || '',
        bleed: getVal('m_bleed'), canvasDepth: getRaw('canvasDepth'), canvasWrap: getRaw('canvasWrap'), floaterInset: getVal('floaterInset') || 0.75,
        // Preserved from prior row state — set when a floater swatch was picked.
        // Used by buildSpecStrings to derive Float Reveal = floaterInset - faceWidth.
        // Not surfaced in the form (it's swatch metadata, not user-edited).
        _faceWidth: row._faceWidth,
        extW: getVal('extW'), extH: getVal('extH'), fType: getStr('fType'), fW: getVal('fW'), fColor: getStr('fColor'), fCode: getStr('m_fCode'),
        swatchDataUrl: isColor ? "" : row.swatchDataUrl, swatchName: isColor ? "" : row.swatchName,
        m1A: m1Active, 
        m1T: getVal('m1T'), m1B: getVal('m1B'), m1L: getVal('m1L'), m1R: getVal('m1R'), m1Locked: document.getElementById('m1Lock').classList.contains('active'), 
        m1ColorName: m1Name, m1ColorHex: m1Hex,
        m2A: m2Active, m2: getVal('m2'),
        m2ColorName: m2Name, m2ColorHex: m2Hex, matsLinked: isLinked,
        // Shadow box / Float Mount: persist colors, paper margins, edge style, and the
        // random seed (preserved from the prior row data so the torn outline doesn't
        // shift on every sync). useFloatMount is the toggle state, persisted per-row.
        useFloatMount: row.useFloatMount === true,
        // Faux Mat (mat-mode equivalent of float mount's paper-with-border idea).
        // Only meaningful when useFloatMount is false; ignored in float mode.
        useFauxMat: row.useFloatMount !== true && document.getElementById('fauxMatToggle').classList.contains('active'),
        sbBackerColorName: getStr('sbBackerColorName') || 'B 97 White',
        sbBackerColorHex: getStr('sbBackerColorHex') || '#ffffff',
        sbPaperColorName: getStr('sbPaperColorName') || 'White',
        sbPaperColorHex: getStr('sbPaperColorHex') || '#ffffff',
        sbPaperMargin: getVal('sbPaperMargin') || 0,
        // Reused field for both float-mount paper border AND faux mat border —
        // same semantic (white margin around image on print paper). The active
        // input field depends on which mode is on: float mode uses #sbPaperBorder,
        // mat mode with faux mat uses #fauxBorder. Same data field, two inputs.
        sbPaperBorder: row.useFloatMount === true ? (getVal('sbPaperBorder') || 0) : (getVal('fauxBorder') || 0),
        sbPaperEdge: getStr('sbPaperEdge') || 'clean',
        sbPaperEdgeSeed: row.sbPaperEdgeSeed || 0,
        glass: getStr('m_glass'), hardware: getStr('m_hardware'), mount: getStr('m_mount'), backing: getStr('m_backing'), notes: getStr('m_notes'), prodNotes: getStr('m_prodNotes')
    };

    // BULK EDIT scratch mode: the moved-in dashboard form edits a standalone
    // scratch object — NOT real project data. We only refresh the live preview;
    // no table render, no elevation push, no recalc. Nothing is committed until
    // the user clicks Apply (which diffs the scratch against its baseline).
    if (_bulkEditing) {
        _bulkScratch = _assembledRow;
        updateDashVisualsFromDOM();
        return;
    }

    dashProjectData[dashSelectedRowIndex] = _assembledRow;

    updateDashVisualsFromDOM(); renderDashTable(); pushUpdatesToElevations(dashSelectedRowIndex);
    // Validate the just-saved row and update warning indicators on the dashboard form.
    // The project table renders its own warnings via renderDashTable() above.
    updateDashboardWarnings();
    if (oldId !== newId) recalculateDashboardQuantities();
}

function updateDashVisualsFromDOM() {
    const data = _bulkEditing ? (_bulkScratch || {}) : dashProjectData[dashSelectedRowIndex];
    const fVis = document.getElementById('dash-frame-visual');
    const viewObj = document.getElementById('view-dashboard');
    
    // Both Library and Color rows stay visible; the inactive side dims.
    // (Previously imageControls was display:none in Color mode, which felt jarring.)
    document.getElementById('imageControls').style.display = 'flex';
    applyFrameStyleDimming(data.fType);
    if (data.fType === 'color') {
        viewObj.style.setProperty('--frame-bg', `none`);
        document.getElementById('swatchSelectedDisplay').textContent = "Frame";
        document.getElementById('swatchThumbPreview').style.backgroundImage = `none`;
    } else {
        viewObj.style.setProperty('--frame-bg', `url(${data.swatchDataUrl})`);
    }

    const isCanvas = (data.product === "Framed Canvas (Floater)");
    const isFrameless = (data.product === "Frameless Canvas (Wrapped)");
    // Float Mount runs on any non-canvas product when the row's toggle is set.
    // (Shadow Box auto-flips this to true; regular Framed Art respects user choice.)
    const useFM = !isCanvas && !isFrameless && (data.useFloatMount === true);

    // Strict Boolean Enforcment to clear dead visual layers
    // Mats are inactive when float mount, floater, or frameless canvas are active.
    const effM1A = (data.m1A !== false && !isCanvas && !isFrameless && !useFM);
    const effM2A = (data.m2A === true && !isCanvas && !isFrameless && !useFM);
    
    const effM1T = effM1A ? data.m1T : 0; const effM1B = effM1A ? data.m1B : 0; const effM1L = effM1A ? data.m1L : 0; const effM1R = effM1A ? data.m1R : 0;
    const effM2 = effM2A ? data.m2 : 0;
    
    const mat1Color = data.m1ColorHex || '#ffffff';
    const mat2Color = data.m2ColorHex || '#ffffff';

    // Image opening computation per product:
    //   FLOATER:  opening = extW - floaterInset*2 (inset from outer edge).
    //   FRAMELESS CANVAS: opening = extW (no frame, the whole face IS the art).
    //   FLOAT MOUNT:  opening = extW - fW*2 - paperMargin*2 - paperBorder*2.
    //   FRAMED ART:   opening = extW - fW*2 - mats.
    const floaterInsetVal = isCanvas ? (parseFloat(data.floaterInset) || 0.75) : 0;
    const sbPaperMargin = useFM ? (parseFloat(data.sbPaperMargin) || 0) : 0;
    const sbPaperBorder = useFM ? (parseFloat(data.sbPaperBorder) || 0) : 0;
    let finalW, finalH;
    if (isCanvas) {
        finalW = data.extW - floaterInsetVal * 2;
        finalH = data.extH - floaterInsetVal * 2;
    } else if (isFrameless) {
        finalW = data.extW;
        finalH = data.extH;
    } else if (useFM) {
        finalW = data.extW - (data.fW * 2) - sbPaperMargin * 2 - sbPaperBorder * 2;
        finalH = data.extH - (data.fW * 2) - sbPaperMargin * 2 - sbPaperBorder * 2;
    } else {
        finalW = data.extW - (data.fW * 2) - effM1L - effM1R - (effM2 * 2);
        finalH = data.extH - (data.fW * 2) - effM1T - effM1B - (effM2 * 2);
    }
    
    document.getElementById('disp_openW').innerText = dashFmt(Math.max(0, finalW));
    document.getElementById('disp_openH').innerText = dashFmt(Math.max(0, finalH));
    // Print file dimensions:
    //   FLOATER & FRAMELESS: print = canvas image (no bleed since canvas is wrapped not printed-with-margin).
    //     Frameless adds canvasWrap×2 since the print needs to wrap around the stretcher bars.
    //     Floater's swatch already includes wrap visually so no extra wrap math here.
    //   Others: opening + bleed×2.
    let printW, printH;
    if (isCanvas) {
        printW = Math.max(0, finalW); printH = Math.max(0, finalH);
    } else if (isFrameless) {
        const wrap = parseFloat(data.canvasWrap) || 0;
        printW = Math.max(0, finalW) + wrap * 2;
        printH = Math.max(0, finalH) + wrap * 2;
    } else {
        printW = Math.max(0, finalW) + data.bleed * 2;
        printH = Math.max(0, finalH) + data.bleed * 2;
    }
    document.getElementById('printFileDisplay').innerText = `${dashFmt(printW)} x ${dashFmt(printH)}`;

    // Frame visual ratio: how many CSS pixels per "real" inch.
    // In Mode 2, the preview-container's aspect ratio is set to match the
    // current frame's aspect (via updateDashPreviewContainerSize), so the
    // frame fits with minimal empty space. We compute ratio as the minimum
    // of (container_w / frame_w) and (container_h / frame_h), times 0.95
    // for a small breathing margin. This works for any container shape.
    updateDashPreviewContainerSize();
    const previewContainer = document.querySelector('.preview-container');
    let ratio = 300 / Math.max(data.extW, data.extH); // fallback
    if (previewContainer) {
        const r = previewContainer.getBoundingClientRect();
        if (r.width > 50 && r.height > 50) {
            const rByW = r.width / data.extW;
            const rByH = r.height / data.extH;
            ratio = Math.min(rByW, rByH) * 0.95;
        }
    }
    
    fVis.innerHTML = ''; 
    fVis.style.width = (data.extW * ratio) + "px"; fVis.style.height = (data.extH * ratio) + "px";

    // For both floaters and non-floaters, rails draw at the structural rail width fW.
    // (For floaters the opening will overlap the inner part of the rails — see below.)
    const effFw_dash = data.fW;

    if (isFrameless) {
        // FRAMELESS CANVAS: no frame, no mats, no paper. Render the canvas face as
        // a placeholder rect with a subtle drop shadow to suggest depth on the wall.
        // No rails, no border. Art-rect below renders as the entire face area.
        fVis.className = 'frame-vis';
        fVis.style.border = 'none';
        fVis.style.background = 'transparent';
        // Outer shadow gated by dashOuterShadowsOn.
        fVis.style.boxShadow = dashOuterShadowsOn
            ? '0 6px 20px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)'
            : 'none';
    } else if (data.fType === 'color') {
        fVis.className = 'frame-vis frame-vis-solid';
        fVis.style.border = `${effFw_dash * ratio}px solid ${data.fColor}`;
        viewObj.style.setProperty('--frame-color', data.fColor);
    } else {
        fVis.className = 'frame-vis frame-vis-image';
        fVis.style.border = 'none';
        viewObj.style.setProperty('--fW', (effFw_dash * ratio) + 'px'); 
        viewObj.style.setProperty('--frame-W', (data.extW * ratio) + 'px');
        const rails = ['top', 'bottom', 'left', 'right'];
        rails.forEach(pos => {
            const rail = document.createElement('div'); rail.className = `frame-rail rail-${pos}`; rail.innerHTML = `<div class="rail-bg"></div>`; fVis.appendChild(rail);
        });
    }

    let offsetW = (data.fType === 'color' || isFrameless) ? 0 : (effFw_dash * ratio);

    if(effM1A) { 
        const m1Vis = document.createElement('div'); m1Vis.className = 'mat-visual'; m1Vis.id = 'dash-mat1-visual';
        m1Vis.style.top = offsetW + "px"; m1Vis.style.left = offsetW + "px"; 
        m1Vis.style.width = ((data.extW - (data.fW * 2)) * ratio) + "px"; m1Vis.style.height = ((data.extH - (data.fW * 2)) * ratio) + "px"; 
        m1Vis.style.borderTopWidth = (data.m1T * ratio) + 'px'; m1Vis.style.borderBottomWidth = (data.m1B * ratio) + 'px';
        m1Vis.style.borderLeftWidth = (data.m1L * ratio) + 'px'; m1Vis.style.borderRightWidth = (data.m1R * ratio) + 'px';
        m1Vis.style.borderColor = mat1Color; viewObj.style.setProperty('--m1-color', mat1Color); fVis.appendChild(m1Vis);
    }
    
    if(effM2A) { 
        const m2Vis = document.createElement('div'); m2Vis.className = 'mat2-visual'; m2Vis.id = 'dash-mat2-visual';
        let m2TopOffset = (data.fType === 'color') ? (data.m1T * ratio) : ((data.fW + data.m1T) * ratio);
        let m2LeftOffset = (data.fType === 'color') ? (data.m1L * ratio) : ((data.fW + data.m1L) * ratio);
        m2Vis.style.top = m2TopOffset + "px"; m2Vis.style.left = m2LeftOffset + "px"; 
        m2Vis.style.width = ((data.extW - (data.fW * 2) - effM1L - effM1R) * ratio) + "px"; m2Vis.style.height = ((data.extH - (data.fW * 2) - effM1T - effM1B) * ratio) + "px"; 
        m2Vis.style.borderWidth = (data.m2 * ratio) + 'px'; m2Vis.style.borderColor = mat2Color; viewObj.style.setProperty('--m2-color', mat2Color); fVis.appendChild(m2Vis);
    }

    // FAUX MAT preview: print has a white border baked in. Visible white band
    // around the image area. Sits inside whatever opening is above (mat 2 if on,
    // mat 1 if on, frame if no mats). Only active in standard mat mode — float
    // mount uses its own paper rendering above.
    const effFauxOn = (data.useFauxMat === true && !isCanvas && !isFrameless && !useFM);
    if (effFauxOn) {
        const border = parseFloat(data.sbPaperBorder) || 0;
        if (border > 0) {
            const fauxVis = document.createElement('div');
            fauxVis.className = 'faux-mat-visual';
            // Position: sits inside the innermost mat opening, or inside the frame
            // if no mats. The conditional frameInset (0 for color mode where the
            // frame is a CSS border on fVis, fW*ratio for library mode where rails
            // sit inside fVis) matches what Mat 1 / Mat 2 do for top/left offset.
            // The WIDTH calculation, however, always subtracts the full frame on
            // both sides regardless of mode — same as Mat 1's width formula on
            // line ~1015. Without this, the faux mat was offset correctly in
            // color mode but its width still spanned the OD instead of the inner
            // opening, making it look misaligned vs the mat.
            const frameInset = (data.fType === 'color') ? 0 : (data.fW * ratio);
            const frameSizeDeduction = data.fW * 2 * ratio;
            const m1InsetT = effM1A ? data.m1T * ratio : 0;
            const m1InsetB = effM1A ? data.m1B * ratio : 0;
            const m1InsetL = effM1A ? data.m1L * ratio : 0;
            const m1InsetR = effM1A ? data.m1R * ratio : 0;
            const m2Inset = effM2A ? data.m2 * ratio : 0;
            const top = frameInset + m1InsetT + m2Inset;
            const left = frameInset + m1InsetL + m2Inset;
            const width = (data.extW * ratio) - frameSizeDeduction - m1InsetL - m1InsetR - m2Inset * 2;
            const height = (data.extH * ratio) - frameSizeDeduction - m1InsetT - m1InsetB - m2Inset * 2;
            // White paper showing as a band. The border (CSS) width is the white border value.
            fauxVis.style.cssText = `position:absolute; top:${top}px; left:${left}px; width:${Math.max(0, width)}px; height:${Math.max(0, height)}px; border:${border * ratio}px solid #ffffff; box-sizing:border-box; pointer-events:none;`;
            fVis.appendChild(fauxVis);
        }
    }

    // FLOAT MOUNT preview: backer fills frame interior; paper sits inside with drop shadow.
    if (useFM) {
        const backerColor = data.sbBackerColorHex || '#ffffff';
        const paperColor = data.sbPaperColorHex || '#ffffff';
        const sbPM = (parseFloat(data.sbPaperMargin) || 0);

        // Backer fills the frame interior
        const backerVis = document.createElement('div');
        backerVis.className = 'sb-backer-visual';
        const frameInsetPx = (data.fType === 'color') ? 0 : (data.fW * ratio);
        backerVis.style.cssText = `position:absolute; top:${frameInsetPx}px; left:${frameInsetPx}px; width:${(data.extW - data.fW*2) * ratio}px; height:${(data.extH - data.fW*2) * ratio}px; background:${backerColor}; pointer-events:none;`;
        fVis.appendChild(backerVis);

        // Paper on top of backer, offset by paperMargin. Drop shadow + dashed/solid edge.
        const paperVis = document.createElement('div');
        paperVis.className = 'sb-paper-visual';
        const paperX = frameInsetPx + sbPM * ratio;
        const paperY = frameInsetPx + sbPM * ratio;
        const paperW = (data.extW - data.fW*2 - sbPM*2) * ratio;
        const paperH = (data.extH - data.fW*2 - sbPM*2) * ratio;
        const isTorn = (data.sbPaperEdge || 'clean') === 'torn';
        // Torn edge gets a dashed border in the preview as a visual hint; the export
        // does the actual irregular outline via the canvas renderer.
        paperVis.style.cssText = `position:absolute; box-sizing:border-box; top:${paperY}px; left:${paperX}px; width:${paperW}px; height:${paperH}px; background:${paperColor}; box-shadow: 2px 4px 12px rgba(0,0,0,0.56); ${isTorn ? 'border:1px dashed rgba(0,0,0,0.4); border-radius:2px;' : ''} pointer-events:none;`;
        fVis.appendChild(paperVis);
    }
    
    const artVis = document.createElement('div'); artVis.className = 'art-visual'; artVis.id = 'dash-art-visual';
    // For floater, frameless, & float mount: subtle dashed border (suggests transparent opening) instead of a heavy 4px black stroke.
    artVis.style.border = (isCanvas || isFrameless || useFM) ? "1px dashed rgba(0,0,0,0.25)" : "1px solid #aaa";
    // Float mount / frameless: opaque print fill so the white paper beneath
    // doesn't bleed through (keeps dashboard + elevation identical).
    if (isFrameless || useFM) artVis.style.background = 'rgb(120,120,120)';
    
    let artTopOffset, artLeftOffset;
    if (isCanvas) {
        // Floater: opening starts at floaterInsetVal from the outer edge
        artTopOffset = floaterInsetVal * ratio;
        artLeftOffset = floaterInsetVal * ratio;
    } else if (isFrameless) {
        // Frameless canvas: the entire face IS the artwork. No offset.
        artTopOffset = 0;
        artLeftOffset = 0;
    } else if (useFM) {
        // Float mount: opening sits inside the paper at paperBorder offset
        const sbPM = (parseFloat(data.sbPaperMargin) || 0);
        const sbPB = (parseFloat(data.sbPaperBorder) || 0);
        const frameInset = (data.fType === 'color') ? 0 : data.fW;
        artTopOffset = (frameInset + sbPM + sbPB) * ratio;
        artLeftOffset = (frameInset + sbPM + sbPB) * ratio;
    } else if (data.fType === 'color') {
        artTopOffset = (effM1T + effM2) * ratio;
        artLeftOffset = (effM1L + effM2) * ratio;
    } else {
        artTopOffset = (data.fW + effM1T + effM2) * ratio;
        artLeftOffset = (data.fW + effM1L + effM2) * ratio;
    }
    
    artVis.style.top = artTopOffset + "px"; artVis.style.left = artLeftOffset + "px";
    artVis.style.width = (Math.max(0, finalW) * ratio) + "px"; artVis.style.height = (Math.max(0, finalH) * ratio) + "px";
    // Suffix matches the unit. unitInfo() gives '"' for IN, ' cm' for CM, ' mm' for MM.
    const dashSuf = unitInfo(dashUnit).suffix;
    artVis.innerText = `${dashFmt(Math.max(0, finalW))}${dashSuf} × ${dashFmt(Math.max(0, finalH))}${dashSuf}`;
    fVis.appendChild(artVis);
}

// CSV IMPORT PARSER
function importDashCSV(e) {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
        const text = ev.target.result;
        const lines = text.split(/\r?\n/);

        // Find the header row. Phase A renamed columns: it's now "Qty,ITEM CODE,PRODUCT..."
        // (LEVEL was dropped). Detect by ITEM CODE + PRODUCT both being present.
        let headerIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('ITEM CODE') && lines[i].includes('PRODUCT')) {
                headerIdx = i;
                break;
            }
        }
        if (headerIdx === -1) {
            return showInfoModal('Import Failed', 'CSV is missing the data table header (looking for ITEM CODE + PRODUCT columns). Make sure you\'re importing a CSV exported from this tool.');
        }

        // Proper CSV parser: handles quoted fields with embedded commas + the
        // RFC "" escape sequence for literal quotes. The InDesign script needed
        // the same fix recently — same logic here.
        const parseCSVLine = (lineStr) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < lineStr.length; j++) {
                const c = lineStr[j];
                if (c === '"') {
                    if (inQuotes && lineStr[j + 1] === '"') {
                        current += '"';
                        j++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (c === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += c;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseCSVLine(lines[headerIdx]);

        // Build a name → index lookup. Strip unit suffixes like "(in)"/"(cm)" so
        // a single lookup name works regardless of which unit the CSV was exported in.
        const headerIdxByName = {};
        headers.forEach((h, idx) => {
            headerIdxByName[h] = idx;
            const stripped = h.replace(/\s*\((in|cm)\)\s*$/, '');
            if (stripped !== h && headerIdxByName[stripped] === undefined) {
                headerIdxByName[stripped] = idx;
            }
        });
        const col = (name) => {
            const i = headerIdxByName[name];
            return (i === undefined) ? -1 : i;
        };
        const cellOr = (cols, name, fallback) => {
            const i = col(name);
            if (i === -1 || i >= cols.length) return fallback;
            const v = cols[i];
            return (v === undefined || v === '') ? fallback : v;
        };
        const cellNum = (cols, name, fallback) => {
            const v = cellOr(cols, name, undefined);
            if (v === undefined) return fallback;
            const n = parseFloat(v);
            return isNaN(n) ? fallback : n;
        };

        // Mat Code-Color is a composite: "B 97 White" or "B 97 White (w/ 0.25" Black reveal)".
        // Pull Mat 1 name from the front of the cell; if the "(w/ ... reveal)" suffix is
        // present, extract Mat 2 size + name from it.
        const parseMatCell = (cell) => {
            const result = { m1Name: '', m2: 0, m2Name: '', hasMat2: false };
            if (!cell) return result;
            const reveal = /^(.+?)\s*\(w\/\s*([\d.]+)"\s*(.+?)\s*reveal\)\s*$/i.exec(cell);
            if (reveal) {
                result.m1Name = reveal[1].trim();
                result.m2 = parseFloat(reveal[2]) || 0;
                result.m2Name = reveal[3].trim();
                result.hasMat2 = true;
            } else {
                result.m1Name = cell.trim();
            }
            return result;
        };

        // Frame Code-Color is "MICH-41-12 / Black Maple" or just "MICH-41-12".
        // Split on the first " / " to separate code from color name.
        const parseFrameCell = (cell) => {
            if (!cell) return { code: '', color: '' };
            const parts = cell.split(/\s*\/\s*/);
            if (parts.length >= 2) return { code: parts[0].trim(), color: parts.slice(1).join(' / ').trim() };
            return { code: cell.trim(), color: '' };
        };

        // Paper Type is "Fine Art Paper / Deckled Edge" or "Fine Art Paper / Straight Cut".
        // Split on "/" to get type + edge style.
        const parsePaperTypeCell = (cell) => {
            if (!cell) return { type: 'Fine Art Paper', edge: 'clean' };
            const parts = cell.split(/\s*\/\s*/);
            const type = parts[0] ? parts[0].trim() : 'Fine Art Paper';
            const edgeText = parts[1] ? parts[1].trim().toLowerCase() : '';
            const edge = edgeText.includes('deckled') ? 'torn' : 'clean';
            return { type, edge };
        };

        const newData = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = parseCSVLine(lines[i]);
            if (cols.length < 5) continue;

            // Row must have at least an ITEM CODE — guards against trailing junk lines.
            const itemCode = cellOr(cols, 'ITEM CODE', '');
            if (!itemCode) continue;

            const d = JSON.parse(JSON.stringify(dashDefaultData));
            d.id = itemCode;
            d.qty = parseInt(cellOr(cols, 'Qty', '0')) || 0;
            d.product = cellOr(cols, 'PRODUCT', 'Framed Art');
            d.location = cellOr(cols, 'LOCATION', '');
            d.imageCode = cellOr(cols, 'Image code', '');

            // Dimensions
            d.extW = cellNum(cols, 'Overall Width', 24);
            d.extH = cellNum(cols, 'Overall Height', 24);

            // Canvas-specific (only meaningful for canvas products; harmless for others)
            const cd = cellOr(cols, 'Canvas Stretcher Depth', '');
            d.canvasDepth = cd ? cd : '';
            const cw = cellOr(cols, 'Canvas Image Wrap', '');
            d.canvasWrap = cw ? cw : '';

            // Mats — parse the composite Mat Code-Color cell, then mat dimensions
            const matCell = cellOr(cols, 'Mat Code-Color', '');
            const matInfo = parseMatCell(matCell);
            d.m1ColorName = matInfo.m1Name || 'B 97 White';
            d.m1A = (d.m1ColorName !== '');
            d.m1T = cellNum(cols, 'Mat Top', 0);
            d.m1R = cellNum(cols, 'Mat Right', 0);
            d.m1B = cellNum(cols, 'Mat Bottom', 0);
            d.m1L = cellNum(cols, 'Mat Left', 0);
            d.m2A = matInfo.hasMat2;
            d.m2 = matInfo.hasMat2 ? matInfo.m2 : 0;
            d.m2ColorName = matInfo.hasMat2 ? matInfo.m2Name : '';

            // Glass + frame cells
            d.glass = cellOr(cols, 'Glass', '');
            const frameInfo = parseFrameCell(cellOr(cols, 'Frame Code-Color', ''));
            // Backend "Frame Code" / "Frame Color Name" cells take precedence if present
            // (they're the "raw" values; the composite cell is just a display convenience).
            d.fCode = cellOr(cols, 'Frame Code', frameInfo.code);
            d.fColorName = cellOr(cols, 'Frame Color Name', frameInfo.color);
            d.fColor = cellOr(cols, 'Frame Color Hex', '#1a1a1a');
            d.fW = cellNum(cols, 'Frame (Width)', 1.25);
            d.fHeight = cellNum(cols, 'Frame (Height)', 0);
            d.rabbetDepth = cellNum(cols, 'Rabbet Depth', 0);
            // Floater face width (swatch _f tag), stored in inches in the CSV.
            // Restore in the current dashboard unit. Only meaningful for floaters.
            {
                const rawFace = cellOr(cols, 'RAW Frame Face W (in)', '');
                if (rawFace !== '' && !isNaN(parseFloat(rawFace))) {
                    d._faceWidth = dashFmt(parseFloat(rawFace) * unitFactor('in', dashUnit));
                }
            }

            // Float mount fields. These are populated only when product is float-mount-active.
            // Auto-detect by reading the FM Backer Name column — if present, the row uses float mount.
            const fmBackerName = cellOr(cols, 'FM Backer Name', '');
            const isFloatMount = (fmBackerName !== '');
            d.useFloatMount = isFloatMount;
            if (isFloatMount) {
                d.sbBackerColorName = fmBackerName;
                d.sbBackerColorHex = cellOr(cols, 'FM Backer Hex', '#ffffff');
                d.sbPaperColorName = cellOr(cols, 'FM Paper Name', 'White');
                d.sbPaperColorHex = cellOr(cols, 'FM Paper Hex', '#ffffff');
                d.sbPaperEdge = cellOr(cols, 'FM Paper Edge', 'clean');
                d.sbPaperMargin = cellNum(cols, 'FM Paper Margin', 1.5);
                d.sbPaperBorder = cellNum(cols, 'White Border AA', 0);
                // Paper Type composite: "Fine Art Paper / Deckled Edge"
                const ptInfo = parsePaperTypeCell(cellOr(cols, 'Paper Type', ''));
                d.paperType = ptInfo.type;
                // Edge from FM column wins; fall back to paper type cell parsing
                if (!cellOr(cols, 'FM Paper Edge', '')) d.sbPaperEdge = ptInfo.edge;
            } else {
                // Faux Mat detection (non-float-mount rows): a Paper Type cell or
                // a positive White Border AA value indicates the row uses a paper
                // with white border under the mats. No dedicated column — we
                // reconstruct from these signals so the CSV format stays compact.
                const wbAA = cellNum(cols, 'White Border AA', 0);
                const paperTypeCell = cellOr(cols, 'Paper Type', '');
                if (wbAA > 0 || paperTypeCell) {
                    d.useFauxMat = true;
                    d.sbPaperBorder = wbAA;
                    if (paperTypeCell) {
                        const ptInfo = parsePaperTypeCell(paperTypeCell);
                        d.paperType = ptInfo.type;
                    }
                }
            }

            // Hidden columns — Artist/Title/Art Type for caption use
            d.artist = cellOr(cols, 'Artist', '');
            d.artworkTitle = cellOr(cols, 'Artwork Title', '');
            d.artType = cellOr(cols, 'Art Type', '');

            // Production fields
            d.hardware = cellOr(cols, 'Security Hardware', '');
            // The column was renamed from "Substrate" → "Backing Board" — accept either
            // so old CSVs from before the rename still load. New "Backing Board" wins
            // if both are somehow present (shouldn't happen, but tie-breaker).
            d.backing = cellOr(cols, 'Backing Board', cellOr(cols, 'Substrate', ''));
            d.mount = cellOr(cols, 'Mount', '');
            d.notes = cellOr(cols, 'Notes', '');
            d.prodNotes = cellOr(cols, 'Production Notes', '');

            newData.push(d);
        }

        if (newData.length === 0) {
            return showInfoModal('Import Failed', 'No valid rows found in the CSV. Each row needs at least an ITEM CODE.');
        }

        dashProjectData = newData;
        dashSelectedRowIndex = 0;
        loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
        renderDashTable();
        elevations.forEach(elev => elev.frames = []);
        recalculateDashboardQuantities();
        showInfoModal('Import Complete', `Imported ${newData.length} items successfully.`);
    };
    r.readAsText(f); e.target.value = '';
}

// RESTORED SYNC & DB FUNCTIONS
function handleDashProductChange(shouldSync = true) {
    const val = document.getElementById('m_product').value;
    const matWrapper = document.getElementById('matWrapper');
    const matFloatToggle = document.getElementById('matFloatToggle');
    const bleedSettings = document.getElementById('bleedSettings');
    const canvasSettings = document.getElementById('canvasSettings');
    const isFloater = (val === "Framed Canvas (Floater)");
    const isFrameless = (val === "Frameless Canvas (Wrapped)");
    const isShadowBox = (val === "Framed Art (Shadow Box)");
    const data = dashProjectData[dashSelectedRowIndex];

    // Persist the chosen product to the row so subsequent reads see the
    // current state. CSV export picks up data.product directly.
    if (data) data.product = val;

    // Frameless Canvas: no frame applies, so visually disable the Frame
    // Style section and the Fr.W / Fr.H / Rabbet cells. The data underneath
    // stays intact so switching back to a framed product restores prior
    // values. Other canvas (Floater) keeps these enabled — Floater DOES
    // have a frame around the canvas.
    const frameStyleSection = document.getElementById('frameStyleSection');
    if (frameStyleSection) frameStyleSection.classList.toggle('fl-disabled', isFrameless);
    document.querySelectorAll('.frame-dim-cell').forEach(el => {
        el.classList.toggle('fl-disabled', isFrameless);
    });

    // FLOATER & FRAMELESS CANVAS: both hide the mat/float wrapper since neither
    // uses traditional mats or float-mounted paper. Both show canvas settings
    // (depth, wrap, optional inset). bleedSettings stays visible — Print File
    // is computed correctly for canvas (uses wrap instead of bleed), and
    // designers want to see canvas print dimensions for production.
    // The Inset field is only meaningful for Floater (canvas face + shadow
    // gap); Frameless ignores it (no frame to inset from).
    if (isFloater || isFrameless) {
        matWrapper.style.display = 'none';
        canvasSettings.style.display = 'grid';
        bleedSettings.style.display = 'grid';
        // For frameless canvas, dim out the Inset field (it's irrelevant — there's no frame).
        const insetCell = document.getElementById('floaterInset');
        if (insetCell && insetCell.parentElement) {
            insetCell.parentElement.style.opacity = isFrameless ? '0.4' : '1';
            insetCell.disabled = isFrameless;
        }
        // Default canvas products (Floater AND Frameless) to a 2"D stretcher
        // bar + 2" wrap when the field is empty. Studio standard: 2" stretcher
        // bars are the most common size, and image wraps 2" around the sides
        // (the remaining stretcher depth becomes back-staple area). User can
        // override after. Both Floater and Frameless use the same default
        // because the physical canvas object is identical — what differs is
        // whether it sits inside a floater frame or not.
        const depthEl = document.getElementById('canvasDepth');
        const wrapEl = document.getElementById('canvasWrap');
        const currentDepth = parseFloat(depthEl ? depthEl.value : '') || 0;
        if (depthEl && currentDepth === 0) {
            depthEl.value = '2';
            if (wrapEl && (parseFloat(wrapEl.value) || 0) === 0) {
                wrapEl.value = '2';
            }
        }
        if(shouldSync) syncDashAndCalculate();
        return;
    }

    // Re-enable the inset field if we're switching back to non-frameless products
    const insetCell = document.getElementById('floaterInset');
    if (insetCell && insetCell.parentElement) {
        insetCell.parentElement.style.opacity = '1';
        insetCell.disabled = false;
    }

    // Non-floater, non-frameless: show wrapper, hide canvas settings, show bleed.
    matWrapper.style.display = 'block';
    canvasSettings.style.display = 'none';
    bleedSettings.style.display = 'grid';

    // SHADOW BOX product: auto-flip the toggle to Float Mount (and persist) on
    // selection. The user can still toggle back to Mat manually if they want.
    if (isShadowBox && data) {
        data.useFloatMount = true;
    }

    // Determine the effective mat/float mode from the row data.
    const useFloat = !!(data && data.useFloatMount);
    applyMatFloatModeUI(useFloat);

    // Restore mat toggle UI from the row data (only meaningful when in mat mode,
    // but harmless to set either way — the panel is hidden in float mode).
    if (data) {
        const m1On = data.m1A !== false;
        const m1Btn = document.getElementById('m1Toggle');
        if (m1Btn) {
            m1Btn.classList.toggle('active', m1On);
            m1Btn.innerText = m1On ? 'ON' : 'OFF';
        }
        document.querySelectorAll('.m1-input').forEach(e => e.disabled = !m1On);

        const m2EffectivelyOn = m1On && data.m2A;
        const m2Btn = document.getElementById('m2Toggle');
        if (m2Btn) {
            m2Btn.classList.toggle('active', m2EffectivelyOn);
            m2Btn.innerText = m2EffectivelyOn ? 'ON' : 'OFF';
            m2Btn.disabled = !m1On;
            m2Btn.style.opacity = m1On ? '1' : '0.4';
            m2Btn.style.cursor = m1On ? 'pointer' : 'not-allowed';
        }
        const m2In = document.getElementById('m2'); if (m2In) m2In.disabled = !m2EffectivelyOn;
    }

    // Auto-seed the torn-edge randomization if user is in float mount with torn
    // already chosen, so the outline is stable across redraws.
    if (useFloat && data) {
        const edge = (document.getElementById('sbPaperEdge').value) || data.sbPaperEdge || 'clean';
        if (edge === 'torn' && (!data.sbPaperEdgeSeed || data.sbPaperEdgeSeed === 0)) {
            data.sbPaperEdgeSeed = Math.floor(Math.random() * 1e9);
        }
    }

    if(shouldSync) syncDashAndCalculate();
}

function toggleDashMat(id) {
    const b = document.getElementById(id + 'Toggle');
    b.classList.toggle('active');
    b.innerText = b.classList.contains('active') ? 'ON' : 'OFF';
    
    if (id === 'm1') {
        const m1On = b.classList.contains('active');
        document.querySelectorAll('.m1-input').forEach(e => e.disabled = !m1On);
        // Mat 2 is nested inside Mat 1. If Mat 1 turns off, force Mat 2 off too,
        // and disable the M2 toggle so the user can't enable an orphaned mat.
        const m2Btn = document.getElementById('m2Toggle');
        if (!m1On && m2Btn.classList.contains('active')) {
            m2Btn.classList.remove('active');
            m2Btn.innerText = 'OFF';
            document.getElementById('m2').disabled = true;
        }
        m2Btn.disabled = !m1On;
        m2Btn.style.opacity = m1On ? '1' : '0.4';
        m2Btn.style.cursor = m1On ? 'pointer' : 'not-allowed';
    } else {
        document.getElementById('m2').disabled = !b.classList.contains('active');
    }
    syncDashAndCalculate();
}

function toggleDashFauxMat() {
    const b = document.getElementById('fauxMatToggle');
    b.classList.toggle('active');
    const isOn = b.classList.contains('active');
    b.innerText = isOn ? 'ON' : 'OFF';
    const borderInput = document.getElementById('fauxBorder');
    borderInput.disabled = !isOn;
    // First-enable: seed border to 0.5" so the user has a sensible default
    // (matches float mount's typical border value). User can override.
    if (isOn && (!borderInput.value || parseFloat(borderInput.value) === 0)) {
        borderInput.value = dashFmt(0.5 * unitFactor('in', dashUnit));
    }
    syncDashAndCalculate();
}

function toggleDashLock() {
    const b = document.getElementById('m1Lock');
    b.classList.toggle('active'); b.innerText = b.classList.contains('active') ? 'LOCKED' : 'UNLOCKED';
    handleDashMatSync('m1T');
}

// Frame Style toggle (Library / Color). Writes through to the hidden #fType input
// so the existing syncDashAndCalculate plumbing keeps working unchanged.
function setFrameStyle(val) {
    document.getElementById('fType').value = val;
    document.getElementById('fTypeBtnLibrary').classList.toggle('active', val === 'image');
    document.getElementById('fTypeBtnSolid').classList.toggle('active', val === 'color');
    applyFrameStyleDimming(val);
    syncDashAndCalculate();
}

// Dim the accessory controls on the side that's NOT in use:
//   Library mode → dim the color swatch
//   Color mode   → dim the folder icon AND the library row (vendor/collection/swatch/upload)
function applyFrameStyleDimming(val) {
    const libSide = (val !== 'image'); // dim library accessories when NOT in library mode
    const colSide = (val !== 'color'); // dim color swatch when NOT in color mode
    document.getElementById('libFolderBtn').classList.toggle('fstyle-disabled', libSide);
    document.getElementById('fColor').classList.toggle('fstyle-disabled', colSide);
    // The vendor/collection/frame/upload row is also library-side
    const imageControls = document.getElementById('imageControls');
    if (imageControls) imageControls.classList.toggle('fstyle-disabled', libSide);
}

// Shadow Box: edge-style toggle (clean | torn). Writes to hidden #sbPaperEdge so
// existing sync flow picks it up. Generates a fixed seed the first time TORN is
// chosen so the irregular outline is stable across redraws of the same frame.
// Rabbet field has special behavior on floaters: changing it auto-suggests
// BOTH the canvasDepth (stretcher bar must be flush with rabbet pocket)
// AND the canvasWrap (= rabbet + 0.5" safety margin). Both are suggestions —
// the fields stay editable so a user can override for unusual vendor specs.
// The pattern: only auto-fill when the field was empty or matches the prior
// suggestion, so manually-typed values aren't clobbered.
function handleRabbetChange() {
    const row = dashProjectData[dashSelectedRowIndex];
    if (row && row.product === "Framed Canvas (Floater)") {
        const rabbetEl = document.getElementById('rabbetDepth');
        const depthEl = document.getElementById('canvasDepth');
        const wrapEl = document.getElementById('canvasWrap');
        const rabbet = parseFloat(rabbetEl.value) || 0;
        if (rabbet > 0) {
            const prevRabbet = parseFloat(row.rabbetDepth) || 0;

            // Auto-fill canvasDepth = rabbet (stretcher bar fits the rabbet pocket).
            if (depthEl) {
                const currentDepth = parseFloat(depthEl.value) || 0;
                const isUnsetOrAutoFilled = (currentDepth === 0) ||
                    (prevRabbet > 0 && Math.abs(currentDepth - prevRabbet) < 0.001);
                if (isUnsetOrAutoFilled) {
                    depthEl.value = dashFmt(rabbet);
                }
            }

            // Auto-fill canvasWrap = rabbet + 0.5" (printer safety margin).
            if (wrapEl) {
                const prevWrapSuggestion = prevRabbet > 0 ? prevRabbet + 0.5 : null;
                const currentWrap = parseFloat(wrapEl.value) || 0;
                const isUnsetOrAutoFilled = (currentWrap === 0) ||
                    (prevWrapSuggestion !== null && Math.abs(currentWrap - prevWrapSuggestion) < 0.001);
                if (isUnsetOrAutoFilled) {
                    wrapEl.value = dashFmt(rabbet + 0.5);
                }
            }
        }
    }
    syncDashAndCalculate();
}

// Canvas depth handler. For Frameless Canvas, the wrap auto-fills to match the
// stretcher depth (per studio convention: image wraps exactly around the bar,
// no extra material). The wrap stays editable for printers that need more.
// For Floater, this is just a regular sync — the wrap there is driven by
// rabbet, not stretcher (since stretcher = rabbet anyway).
function handleCanvasDepthChange() {
    const row = dashProjectData[dashSelectedRowIndex];
    if (row && row.product === "Frameless Canvas (Wrapped)") {
        const depthEl = document.getElementById('canvasDepth');
        const wrapEl = document.getElementById('canvasWrap');
        const depth = parseFloat(depthEl.value) || 0;
        if (depth > 0 && wrapEl) {
            // Auto-fill wrap = depth (no safety margin for frameless per studio convention).
            // Smart override: only fill if wrap was empty or matched the prior depth.
            const prevDepth = parseFloat(row.canvasDepth) || 0;
            const currentWrap = parseFloat(wrapEl.value) || 0;
            const isUnsetOrAutoFilled = (currentWrap === 0) ||
                (prevDepth > 0 && Math.abs(currentWrap - prevDepth) < 0.001);
            if (isUnsetOrAutoFilled) {
                wrapEl.value = dashFmt(depth);
            }
        }
    }
    syncDashAndCalculate();
}

// Surface constraint warnings on the dashboard form. Looks up each warning's
// `field` (an input id), finds its containing label-cell, and injects/updates
// a warning icon. Tooltip on the icon shows the rule message. Idempotent —
// clears all existing warnings first so removing the offending state cleans up
// the UI.
function updateDashboardWarnings() {
    // Clear any prior warning markers
    document.querySelectorAll('.constraint-warning-icon').forEach(el => el.remove());
    document.querySelectorAll('.constraint-warning-field').forEach(el => el.classList.remove('constraint-warning-field'));

    const row = dashProjectData[dashSelectedRowIndex];
    if (!row) return;
    const warnings = validateRow(row);
    if (warnings.length === 0) return;

    // Group warnings by field id (a field can have multiple violations stacked)
    const byField = {};
    warnings.forEach(w => {
        if (!byField[w.field]) byField[w.field] = [];
        byField[w.field].push(w);
    });

    Object.keys(byField).forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (!input) return;
        const cell = input.parentElement;  // the <div> wrapping label + input
        if (!cell) return;
        cell.classList.add('constraint-warning-field');
        // Build the icon. Stack multiple messages with newlines in the title attr.
        const icon = document.createElement('span');
        icon.className = 'constraint-warning-icon';
        icon.innerText = '⚠';
        icon.title = byField[fieldId].map(w => w.message).join('\n');
        cell.appendChild(icon);
    });
}

function setShadowBoxEdge(val) {
    document.getElementById('sbPaperEdge').value = val;
    document.getElementById('sbEdgeBtnClean').classList.toggle('active', val === 'clean');
    document.getElementById('sbEdgeBtnTorn').classList.toggle('active', val === 'torn');
    if (val === 'torn') {
        const row = dashProjectData[dashSelectedRowIndex];
        if (row && (!row.sbPaperEdgeSeed || row.sbPaperEdgeSeed === 0)) {
            row.sbPaperEdgeSeed = Math.floor(Math.random() * 1e9);
        }
    }
    syncDashAndCalculate();
}

// MAT / FLOAT MOUNT mode toggle. Either 'mat' or 'float'. The row data holds
// useFloatMount (boolean); this function syncs UI, data, and triggers a redraw.
// Both modes' data fields are preserved on the row regardless of the toggle —
// switching modes just changes which one renders.
function setMatFloatMode(mode) {
    const useFloat = (mode === 'float');
    const row = _bulkEditing ? _bulkScratch : dashProjectData[dashSelectedRowIndex];
    if (row) row.useFloatMount = useFloat;
    applyMatFloatModeUI(useFloat);
    syncDashAndCalculate();
}

// Pure-UI helper: swap which panel is visible and update toggle button states.
// Doesn't touch data — used both by setMatFloatMode (user-driven) and by
// loadDashDataIntoControls / handleDashProductChange (data-driven).
function applyMatFloatModeUI(useFloat) {
    document.getElementById('matModeBtnMat').classList.toggle('active', !useFloat);
    document.getElementById('matModeBtnFloat').classList.toggle('active', useFloat);
    document.getElementById('matModePanel').style.display = useFloat ? 'none' : 'flex';
    document.getElementById('floatMountPanel').style.display = useFloat ? 'flex' : 'none';
    const titleEl = document.getElementById('matFloatTitle');
    if (titleEl) titleEl.innerText = useFloat ? 'Float Mount' : 'Mat Controls';
}

function toggleMatLink() {
    const b = document.getElementById('matLinkBtn'); 
    b.classList.toggle('active'); 
    b.style.color = b.classList.contains('active') ? 'var(--accent)' : 'var(--text-muted)';
    syncDashAndCalculate();
}

function handleDashMatSync(id) {
    if (document.getElementById('m1Lock').classList.contains('active')) {
        const v = document.getElementById(id).value;
        ['m1T','m1B','m1L','m1R'].forEach(x => document.getElementById(x).value = v);
    }
    syncDashAndCalculate();
}

function restoreDashThumbnail() {
    const d = dashProjectData[dashSelectedRowIndex];
    const t = document.getElementById('swatchThumbPreview');
    if (d.fType === 'image' && d.swatchDataUrl) t.style.backgroundImage = `url(${d.swatchDataUrl})`;
    else t.style.backgroundImage = 'none';
    if(dashTempHoverUrl) { URL.revokeObjectURL(dashTempHoverUrl); dashTempHoverUrl = null; }
}

// Parse a swatch filename into { code, width, depth?, rabbet?, faceWidth? }.
//
// Schema (option C — tagged prefixes, additive over the old positional format):
//
//   <code>_<width>[_d<depth>][_r<rabbet>][_f<face>].<ext>
//
//   - <code>      : whatever's before the first numeric segment. Codes can contain
//                   dashes (MICH-41-12) since we split on `_` not `-`.
//   - <width>     : required. First unmarked number after the code. The visible
//                   frame face width.
//   - _d<depth>   : optional. Frame profile depth (Fr.H, front-to-back).
//   - _r<rabbet>  : optional. Rabbet pocket depth.
//   - _f<face>    : optional. Floater visible face width (the part NOT covered by canvas).
//
// Examples:
//   MICH-41-12_1.25.jpg                          → { code:"MICH-41-12", width:1.25 }
//   MICH-41-12_1.25_d1.625_r0.625.jpg            → +depth:1.625, rabbet:0.625
//   MICH-41-12_1.25_r0.625.jpg                   → +rabbet:0.625 (depth omitted)
//   MICH-301-22_1.5_f0.5.jpg                     → +faceWidth:0.5 (floater)
//   MICH-301-22_1.5_f0.5_r2.0.jpg                → floater + rabbet
//
// Backward compatibility: the old positional floater format (<code>_<rail>_<face>
// with no _f tag) is still recognized via folder name (collection contains
// "floater"). This is handled in syncDashLibraryFolder, not here.
//
// Tag detection: a segment matches /^([drf])([\d.]+)$/ (single letter then digits).
// Anything else is treated as part of the code. Order of tags doesn't matter.
function parseSwatchFilename(filename) {
    const dot = filename.lastIndexOf('.');
    const baseName = dot > 0 ? filename.substring(0, dot) : filename;
    const parts = baseName.split('_');
    const isNum = s => s !== '' && !isNaN(parseFloat(s)) && isFinite(s);
    // A tagged segment: single letter d/r/f followed immediately by a number (e.g. "d1.625").
    const tagMatch = (s) => {
        const m = /^([drf])([\d.]+)$/.exec(s);
        if (!m) return null;
        const v = parseFloat(m[2]);
        if (isNaN(v)) return null;
        return { tag: m[1], value: v };
    };

    // First pass: extract any tagged segments. The remaining parts form the
    // "positional" segments (code + width + maybe a legacy face number).
    const positional = [];
    const tags = {};
    for (const part of parts) {
        const t = tagMatch(part);
        if (t) {
            // First wins if a tag appears multiple times (rare; user typo)
            if (tags[t.tag] === undefined) tags[t.tag] = t.value;
        } else {
            positional.push(part);
        }
    }

    // Now classify the positional segments. From the back, peel off numeric
    // pieces (these are width, and possibly a legacy floater face width).
    // Codes themselves can contain digits (e.g. "MICH-41-12") so we only treat
    // a piece as "numeric" if it parses cleanly and stands alone in its segment.
    let width;
    let legacyFace;  // the old positional <code>_<width>_<face> format
    if (positional.length >= 3 && isNum(positional[positional.length - 1]) && isNum(positional[positional.length - 2])) {
        // Old floater convention: last two are both numeric (rail + face)
        legacyFace = parseFloat(positional[positional.length - 1]);
        width = parseFloat(positional[positional.length - 2]);
        positional.length -= 2;
    } else if (positional.length >= 2 && isNum(positional[positional.length - 1])) {
        width = parseFloat(positional[positional.length - 1]);
        positional.length -= 1;
    }
    // Whatever's left is the code. Preserve underscores as underscores (don't
    // collapse to spaces) — display-side substitution handles spacing for the
    // spec block. Filename code "MICH-41-12" stays "MICH-41-12" in the data.
    const code = positional.length > 0 ? positional.join('_') : baseName;

    // Build the result, omitting undefined optional fields so existing callers
    // that check `if (parsed.faceWidth !== undefined)` still work as before.
    const result = { code, width: width !== undefined ? width : 1.25 };
    if (tags.d !== undefined) result.depth = tags.d;
    if (tags.r !== undefined) result.rabbet = tags.r;
    // faceWidth: tag wins over the legacy positional form (in case both present)
    if (tags.f !== undefined) result.faceWidth = tags.f;
    else if (legacyFace !== undefined) result.faceWidth = legacyFace;
    return result;
}

// Sync swatch files into the local library. Two callers:
//   1. The hidden <input webkitdirectory> change event from "browse" path —
//      uses file.webkitRelativePath to determine vendor/collection.
//   2. The drag-and-drop path — passes a getPath() resolver since dropped
//      File objects have read-only webkitRelativePath that can't be mutated.
//
// `getPath(file)` returns the relative path (e.g. "Frame Library/MICH/Std/foo.png").
// If omitted, falls back to file.webkitRelativePath.
function syncDashLibraryFolder(e, getPath) {
    const f = e.target.files;
    if(!f || f.length === 0) return;
    // Note: we MERGE into dashLocalLibrary instead of wiping it, so the bundled
    // library stays available alongside whatever the user is syncing in.
    //
    // Each swatch goes through: FileReader (file → data URL) → resize to
    // CUSTOM_LIBRARY_MAX_DIMENSION → store as a data URL string in entry.file.
    // After all files finish, persist to localStorage so the swatches survive
    // browser sessions. The FileReader / resize step is async, so we count
    // completed files and only finalize once all are done.
    let c = 0;
    let pendingFiles = 0;
    let processedFiles = 0;

    const finalize = () => {
        // Persist all data-URL entries to localStorage. Show the result modal
        // here (after the saveSync) so the user gets accurate feedback about
        // both swatches synced AND storage state.
        const result = saveCustomLibraryToStorage();
        populateDashVendorDropdown();
        closeLibrarySyncModal();
        if (result.ok) {
            const stats = getCustomLibraryStorageStats();
            showInfoModal('Library Synced',
                `Synced ${c} swatches from your local folder.\n\n` +
                `Persisted ${stats.count} custom swatches to browser storage (${stats.percentOfLimit}% of limit used).\n\n` +
                `These will reload automatically next time you open the tool.`);
        } else {
            showInfoModal('Storage Limit Reached',
                `Synced ${c} swatches into memory, but couldn't save them all to browser storage:\n\n${result.error}\n\n` +
                `Try removing some custom swatches via Clear, or push your swatches to the GitHub library for permanent storage.`);
        }
    };

    for(let file of f) {
        const ext = file.name.split('.').pop().toLowerCase();
        const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext);
        if(!isImage) continue;

        const relPath = getPath ? getPath(file) : file.webkitRelativePath;
        const parts = relPath.split('/');
        const filename = parts[parts.length - 1];
        const vendor = parts.length > 2 ? parts[parts.length - 3] : (parts.length > 1 ? parts[parts.length - 2] : parts[0]);
        const collection = parts.length > 2 ? parts[parts.length - 2] : "General";

        const parsed = parseSwatchFilename(filename);
        const code = parsed.code;
        const w = parsed.width;

        if(!dashLocalLibrary[vendor]) dashLocalLibrary[vendor] = {};
        if(!dashLocalLibrary[vendor][collection]) dashLocalLibrary[vendor][collection] = [];

        c++;
        pendingFiles++;

        // Read file → resize → store as data URL. We close over the parsed
        // metadata + position so each callback knows where to put its result.
        const reader = new FileReader();
        // eslint-disable-next-line no-loop-func -- closures intentional here
        reader.onload = (ev) => {
            resizeImageDataUrl(ev.target.result, CUSTOM_LIBRARY_MAX_DIMENSION, (resizedDataUrl) => {
                const existing = dashLocalLibrary[vendor][collection].find(x => x.code === code);
                const entry = { code, width: w, file: resizedDataUrl };
                if (parsed.faceWidth !== undefined) entry.faceWidth = parsed.faceWidth;
                if (parsed.depth !== undefined) entry.depth = parsed.depth;
                if (parsed.rabbet !== undefined) entry.rabbet = parsed.rabbet;
                if (existing) {
                    Object.assign(existing, entry);
                } else {
                    dashLocalLibrary[vendor][collection].push(entry);
                }
                processedFiles++;
                if (processedFiles === pendingFiles) finalize();
            });
        };
        reader.onerror = () => {
            processedFiles++;
            if (processedFiles === pendingFiles) finalize();
        };
        reader.readAsDataURL(file);
    }

    // Edge case: no valid images at all (counter never increments)
    if (pendingFiles === 0) {
        closeLibrarySyncModal();
        showInfoModal('No images found', 'The folder contained no image files.');
    }
}

// =====================================================================
// Library Sync modal: show, hide, and handle drag-and-drop folder input.
// The "browse" path uses the existing hidden #libFolderInput. The drag-drop
// path uses webkitGetAsEntry to recursively walk the dropped folder, then
// constructs File objects with .webkitRelativePath set so syncDashLibraryFolder
// (which already expects that property) consumes them unchanged.
// =====================================================================

function openLibrarySyncModal() {
    document.getElementById('librarySyncModal').style.display = 'flex';
    // Reset the drop zone visual to its idle state
    const zone = document.getElementById('libraryDropZone');
    zone.classList.remove('drag-over', 'processing');
    document.getElementById('libraryDropZoneText').innerText = 'Drop folder here';
    // Refresh the storage indicator each time the modal opens — counts/bytes
    // are live so the user always sees current state.
    refreshLibraryStorageStatus();
    // Reset the clear button to its idle label (in case it was in
    // confirm-armed state from a previous open).
    const clearBtn = document.getElementById('libraryClearBtn');
    if (clearBtn) {
        clearBtn.textContent = 'Clear My Saved Swatches';
        clearBtn.dataset.confirmArmed = '0';
    }
}

// Populate the saved-swatches status row inside the sync modal. Called on
// modal open and after every sync. Reads stats directly from localStorage
// so the numbers are always live.
function refreshLibraryStorageStatus() {
    const el = document.getElementById('libraryStorageStatus');
    if (!el) return;
    const stats = getCustomLibraryStorageStats();
    if (stats.count === 0) {
        el.innerHTML = '<strong>No saved swatches yet.</strong> Swatches you sync here will persist in your browser for next time.';
        return;
    }
    const kb = (stats.bytes / 1024).toFixed(0);
    el.innerHTML =
        `<strong>${stats.count} swatch${stats.count === 1 ? '' : 'es'} saved</strong> in your browser ` +
        `(${kb} KB, ${stats.percentOfLimit}% of storage used). ` +
        `Auto-reloads next time you open the tool.`;
}

// Clear button uses two-step confirm: first click warns + arms; second click
// within 5 seconds actually clears. Prevents accidental wipes.
function handleClearCustomLibrary() {
    const btn = document.getElementById('libraryClearBtn');
    if (!btn) return;
    if (btn.dataset.confirmArmed !== '1') {
        btn.textContent = 'Click again to confirm — this clears all saved swatches';
        btn.dataset.confirmArmed = '1';
        // Auto-disarm after 5 seconds so the user doesn't accidentally hit it
        // later thinking it's the normal button.
        setTimeout(() => {
            if (btn.dataset.confirmArmed === '1') {
                btn.textContent = 'Clear My Saved Swatches';
                btn.dataset.confirmArmed = '0';
            }
        }, 5000);
        return;
    }
    clearCustomLibrary();
    btn.textContent = 'Clear My Saved Swatches';
    btn.dataset.confirmArmed = '0';
    refreshLibraryStorageStatus();
}

function closeLibrarySyncModal() {
    document.getElementById('librarySyncModal').style.display = 'none';
}

// Wire up the drop zone events. Done at boot via initLibraryDropZone() which
// the app calls in its DOMContentLoaded handler. Idempotent — safe to call twice.
function initLibraryDropZone() {
    const zone = document.getElementById('libraryDropZone');
    if (!zone || zone.dataset.wired === '1') return;
    zone.dataset.wired = '1';

    // dragenter/over: show "drop me" highlight. preventDefault is required so
    // the browser doesn't navigate away when the file is released.
    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });
    });

    zone.addEventListener('drop', async (e) => {
        console.log('[DROP] Drop event fired');
        const items = e.dataTransfer && e.dataTransfer.items ? Array.from(e.dataTransfer.items) : [];
        console.log('[DROP] dataTransfer.items count:', items.length);
        if (items.length === 0) {
            console.warn('[DROP] No items in dataTransfer — drop ignored.');
            return;
        }
        zone.classList.add('processing');
        const zoneText = document.getElementById('libraryDropZoneText');
        zoneText.innerText = 'Reading folder...';

        // Capture both legacy entries AND modern handles up-front. We need to
        // do this synchronously because dataTransfer.items becomes stale after
        // the drop handler suspends on `await`. Two parallel paths:
        //   - legacyEntries: from webkitGetAsEntry() — used by walkEntry()
        //   - modernHandles: from getAsFileSystemHandle() — used by walkHandle()
        // The modern API is the fallback when the legacy walker returns nothing.
        const legacyEntries = [];
        const modernHandlePromises = [];
        for (const item of items) {
            if (item.webkitGetAsEntry) {
                const entry = item.webkitGetAsEntry();
                if (entry) legacyEntries.push(entry);
            }
            if (typeof item.getAsFileSystemHandle === 'function') {
                modernHandlePromises.push(item.getAsFileSystemHandle());
            }
        }

        const pathMap = new WeakMap();
        const allFiles = [];
        const allEntries = [];
        const samplePaths = [];
        const dirsVisited = { count: 0 };

        const progressTimer = setInterval(() => {
            zoneText.innerText = `Reading folder... (${dirsVisited.count} dirs, ${allEntries.length} files seen)`;
        }, 100);

        // PASS 1: legacy walk via FileSystemEntry. Works for most browsers but
        // can fail on Windows Chrome with deeply-nested folders due to the
        // readEntries-returns-empty bug. The retry loop in walkEntry mitigates
        // most cases; the modern API fallback handles the rest.
        try {
            for (let i = 0; i < legacyEntries.length; i++) {
                const entry = legacyEntries[i];
                console.log(`[DROP] Legacy entry ${i}: name="${entry.name}", isFile=${entry.isFile}, isDirectory=${entry.isDirectory}`);
                await walkEntry(entry, '', allFiles, pathMap, dirsVisited, allEntries, samplePaths);
            }
        } catch (err) {
            console.error('[DROP] Legacy walker threw:', err);
        }

        // PASS 2: if legacy walk found nothing useful but modern handles are
        // available, retry with the modern File System Access API. Different
        // implementation, so the readEntries-empty bug doesn't apply.
        if (allFiles.length === 0 && modernHandlePromises.length > 0) {
            console.log('[DROP] Legacy walk returned 0 files — falling back to modern File System Access API');
            zoneText.innerText = 'Retrying with modern API...';
            try {
                const handles = await Promise.all(modernHandlePromises);
                // Reset diagnostic counters for the retry pass
                dirsVisited.count = 0;
                allEntries.length = 0;
                samplePaths.length = 0;
                for (let i = 0; i < handles.length; i++) {
                    const h = handles[i];
                    if (!h) continue;
                    console.log(`[DROP] Modern handle ${i}: name="${h.name}", kind=${h.kind}`);
                    await walkHandle(h, '', allFiles, pathMap, dirsVisited, allEntries, samplePaths);
                }
            } catch (err) {
                console.error('[DROP] Modern walker threw:', err);
                clearInterval(progressTimer);
                zone.classList.remove('processing');
                zoneText.innerText = `Both walkers failed: ${err.message || err}. Try the browse button.`;
                return;
            }
        }

        clearInterval(progressTimer);
        console.log(`[DROP] Walk complete. Visited ${dirsVisited.count} dirs, found ${allEntries.length} total files (${allFiles.length} images).`);
        console.log('[DROP] Sample paths (any extension):', samplePaths);

        if (allFiles.length === 0) {
            zone.classList.remove('processing');
            if (allEntries.length === 0 && dirsVisited.count === 0) {
                zoneText.innerText = `Walker saw nothing. Try the browse button instead.`;
            } else if (allEntries.length === 0) {
                zoneText.innerText = `Walked ${dirsVisited.count} folders but found 0 files. Try the browse button.`;
            } else {
                const sampleNames = samplePaths.slice(0, 3).map(p => p.split('/').pop()).join(', ');
                zoneText.innerText = `Found ${allEntries.length} files but none are images. Saw: ${sampleNames}. Filter expects .png/.jpg/.jpeg/.webp/.svg.`;
            }
            return;
        }

        // Pass a getPath resolver that pulls from the WeakMap. The sync function
        // uses this instead of the file's read-only webkitRelativePath.
        syncDashLibraryFolder(
            { target: { files: allFiles } },
            (file) => pathMap.get(file) || file.name
        );
    });
}

// Recursively walk a FileSystemEntry, collecting File objects into `out` and
// recording their relative path in `pathMap` (a WeakMap keyed by File). We
// can't write to file.webkitRelativePath on real dropped files (read-only,
// non-configurable native property in Chrome), so the path lives on the side.
//
// `dirsVisited` is a {count: number} object passed by reference so the drop
// handler can show live progress in the UI as the walk runs.
// `allEntries` collects EVERY file regardless of extension (for diagnostics).
// `samplePaths` collects the first few paths seen (for diagnostic display).
//
// IMPORTANT: the legacy FileSystem API has a known bug where readEntries() can
// return an empty array on the FIRST call even when the directory has children.
// This happens because the directory contents may not be fully resolved at the
// moment the walker starts. The fix is to retry readEntries a few times with
// small delays before concluding the directory is empty.
async function walkEntry(entry, prefix, out, pathMap, dirsVisited, allEntries, samplePaths) {
    if (entry.isFile) {
        try {
            const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
            });
            const path = (prefix ? prefix + '/' : '') + entry.name;
            if (allEntries) allEntries.push(file);
            if (samplePaths && samplePaths.length < 5) samplePaths.push(path);
            const ext = entry.name.split('.').pop().toLowerCase();
            const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext);
            if (isImage) {
                pathMap.set(file, path);
                out.push(file);
            }
        } catch (err) {
            console.warn(`[WALK] Failed to read file "${entry.name}":`, err);
        }
    } else if (entry.isDirectory) {
        if (dirsVisited) dirsVisited.count++;
        const reader = entry.createReader();
        let batch;
        let safetyCounter = 0;
        let isFirstBatch = true;
        do {
            try {
                batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            } catch (err) {
                console.warn(`[WALK] readEntries failed for dir "${entry.name}":`, err);
                break;
            }
            console.log(`[WALK] Dir "${entry.name}" batch ${safetyCounter}: ${batch.length} children`);

            // RETRY workaround: if the very first batch comes back empty, the
            // directory may not be fully resolved yet. Retry up to 3 times with
            // increasing delays. After 3 empty retries, accept that the dir
            // really is empty (or irrecoverably stuck).
            if (isFirstBatch && batch.length === 0) {
                let retries = 0;
                while (retries < 3 && batch.length === 0) {
                    retries++;
                    console.log(`[WALK] Dir "${entry.name}" first batch empty — retry ${retries}/3`);
                    await new Promise(r => setTimeout(r, 50 * retries));
                    try {
                        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
                    } catch (err) {
                        console.warn(`[WALK] retry readEntries failed for "${entry.name}":`, err);
                        break;
                    }
                    if (batch.length > 0) {
                        console.log(`[WALK] Retry ${retries} succeeded with ${batch.length} children`);
                    }
                }
            }
            isFirstBatch = false;

            for (const child of batch) {
                await walkEntry(child, (prefix ? prefix + '/' : '') + entry.name, out, pathMap, dirsVisited, allEntries, samplePaths);
            }
            safetyCounter++;
            if (safetyCounter > 1000) {
                console.error(`[WALK] Safety limit hit walking "${entry.name}" — too many batches.`);
                break;
            }
        } while (batch.length > 0);
    }
}

// Modern File System Access API walker (Chrome 86+). Used as a fallback when
// the legacy FileSystemEntry API returns empty for a directory. Different
// underlying implementation that doesn't suffer the readEntries-empty bug.
//
// Takes a FileSystemDirectoryHandle (from item.getAsFileSystemHandle())
// rather than a FileSystemEntry. Output shape matches walkEntry — collects
// File objects into `out` and paths into `pathMap`.
async function walkHandle(handle, prefix, out, pathMap, dirsVisited, allEntries, samplePaths) {
    if (handle.kind === 'file') {
        try {
            const file = await handle.getFile();
            const path = (prefix ? prefix + '/' : '') + handle.name;
            if (allEntries) allEntries.push(file);
            if (samplePaths && samplePaths.length < 5) samplePaths.push(path);
            const ext = handle.name.split('.').pop().toLowerCase();
            const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext);
            if (isImage) {
                pathMap.set(file, path);
                out.push(file);
            }
        } catch (err) {
            console.warn(`[WALK-H] Failed to read file "${handle.name}":`, err);
        }
    } else if (handle.kind === 'directory') {
        if (dirsVisited) dirsVisited.count++;
        let childCount = 0;
        // for-await iterates the directory handle, yielding each child handle.
        // Doesn't suffer the readEntries-empty bug since it's a different API.
        for await (const child of handle.values()) {
            childCount++;
            await walkHandle(child, (prefix ? prefix + '/' : '') + handle.name, out, pathMap, dirsVisited, allEntries, samplePaths);
        }
        console.log(`[WALK-H] Dir "${handle.name}": ${childCount} children`);
    }
}

function populateDashVendorDropdown() {
    const v = document.getElementById('libVendor'); v.innerHTML = '<option value="">Vendor</option>';
    Object.keys(dashLocalLibrary).sort().forEach(k => v.innerHTML += `<option value="${k}">${k}</option>`);
}

function updateDashCollectionDropdown() {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection');
    c.innerHTML = '<option value="">Collection</option>';
    if(!v || !dashLocalLibrary[v]) return;
    Object.keys(dashLocalLibrary[v]).sort().forEach(k => c.innerHTML += `<option value="${k}">${k}</option>`);
    if(c.options.length === 2) { c.selectedIndex = 1; updateDashCustomSwatchDropdown(); }
}

// Track object URLs created for dropdown thumbnails so we can revoke them when the
// dropdown is rebuilt or hidden — avoids leaking memory across many list refreshes.
let dashSwatchThumbUrls = [];
function _clearDashSwatchThumbUrls() {
    dashSwatchThumbUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch(e) {} });
    dashSwatchThumbUrls = [];
}

function updateDashCustomSwatchDropdown() {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection').value;
    const s = document.getElementById('swatchDropdownList'); s.innerHTML = '';
    _clearDashSwatchThumbUrls();
    if(!v || !c || !dashLocalLibrary[v][c]) return;
    dashLocalLibrary[v][c].forEach((i, idx) => {
        const li = document.createElement('li');
        // Build a row: [22x22 swatch preview] [code (width")]
        li.style.cssText = 'display:flex; align-items:center; gap:6px;';
        const thumbUrl = _libEntryToUrl(i.file);
        // Only track object URLs for revocation; bundled-library URLs are static and shouldn't be revoked.
        if (i.file instanceof File || i.file instanceof Blob) dashSwatchThumbUrls.push(thumbUrl);
        const thumb = document.createElement('span');
        thumb.style.cssText = `flex-shrink:0; width:22px; height:22px; border-radius:3px; border:1px solid var(--border-color); background-image:url(${thumbUrl}); background-size:cover; background-position:center;`;
        const txt = document.createElement('span');
        txt.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        txt.textContent = `${i.code} (${i.width}")`;
        li.appendChild(thumb); li.appendChild(txt);
        // Searchable text for the dropdown's existing filter logic, if any
        li.dataset.label = `${i.code} (${i.width}")`;

        li.onmouseenter = () => {
            // Only revoke if previous was an object URL (don't revoke bundled-library URLs)
            if(dashTempHoverUrl && dashTempHoverUrl.startsWith('blob:')) URL.revokeObjectURL(dashTempHoverUrl);
            dashTempHoverUrl = _libEntryToUrl(i.file);
            document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${dashTempHoverUrl})`;
        };
        li.onclick = () => { document.getElementById('swatchSelectedDisplay').textContent = li.dataset.label; s.style.display = 'none'; loadDashFromCustomLibrary(idx); };
        s.appendChild(li);
    });
    s.onmouseleave = restoreDashThumbnail;
}

// Core swatch applier — writes a library swatch's full data onto a row's data
// object (profile image, width, code, type=image; plus depth/rabbet and, for
// floater collections, inset + faceWidth). Pure data: no DOM/form writes, so
// it's safe to call in a loop for bulk edits. `dataUrl` is the resolved image.
// Returns true if it changed the row.
// ── Artwork image (per-row) ──────────────────────────────────────────────
// Uploaded image that fills the frame opening in the elevation "beauty" view
// and the presentation PDF. Downscaled on import to bound memory/project size
// while keeping presentation-grade resolution.
function handleDashArtworkUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 1200;
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > MAX || h > MAX) {
                const s = MAX / Math.max(w, h);
                w = Math.round(w * s); h = Math.round(h * s);
            }
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            // JPEG keeps data-URL size reasonable for photos; quality 0.85.
            const dataUrl = c.toDataURL('image/jpeg', 0.85);
            const row = _bulkEditing ? _bulkScratch : dashProjectData[dashSelectedRowIndex];
            if (row) row.artworkUrl = dataUrl;
            updateDashArtworkThumb(dataUrl);
            syncDashAndCalculate();
        };
        img.onerror = () => showInfoModal('Image Error', 'That file could not be read as an image.');
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';  // allow re-uploading the same file
}

function clearDashArtwork() {
    const row = _bulkEditing ? _bulkScratch : dashProjectData[dashSelectedRowIndex];
    if (row) row.artworkUrl = '';
    updateDashArtworkThumb('');
    syncDashAndCalculate();
}

function updateDashArtworkThumb(dataUrl) {
    const thumb = document.getElementById('m_artworkThumb');
    const clearBtn = document.getElementById('m_artworkClear');
    if (thumb) thumb.style.backgroundImage = dataUrl ? `url(${dataUrl})` : 'none';
    if (clearBtn) clearBtn.style.display = dataUrl ? 'inline-block' : 'none';
}

function applySwatchToRow(rowIdx, collectionName, item, dataUrl) {
    // In bulk-edit mode, target the scratch object (the form's data source),
    // never a real project row. rowIdx is ignored while bulk editing.
    const row = _bulkEditing ? _bulkScratch : dashProjectData[rowIdx];
    if (!row || !item) return false;
    const _uf = unitFactor('in', dashUnit);
    row.fType = 'image';
    row.fW = dashFmt(item.width * _uf);
    row.fCode = item.code;
    row.swatchDataUrl = dataUrl;
    row.swatchName = item.code;

    // Floater collections: switch product + derive inset/faceWidth.
    const isFloaterCollection = /floater/i.test(collectionName || '');
    if (isFloaterCollection) {
        row.product = 'Framed Canvas (Floater)';
        row.useFloatMount = false;
        if (item.faceWidth !== undefined) {
            row.floaterInset = dashFmt((parseFloat(item.faceWidth) + FLOATER_SHADOW_REVEAL) * _uf);
            row._faceWidth = dashFmt(parseFloat(item.faceWidth) * _uf);
        }
    }
    // Depth / rabbet from the swatch metadata if encoded.
    if (item.depth !== undefined) row.fHeight = dashFmt(parseFloat(item.depth) * _uf);
    if (item.rabbet !== undefined) row.rabbetDepth = dashFmt(parseFloat(item.rabbet) * _uf);
    return true;
}

function loadDashFromCustomLibrary(idx) {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection').value;
    if(!v || !c || idx === undefined) return;
    const item = dashLocalLibrary[v][c][idx];
    _libEntryToDataUrl(item.file).then(u => {
        // Apply the full swatch to the active row (single source of truth).
        applySwatchToRow(dashSelectedRowIndex, c, item, u);
        const row = _bulkEditing ? _bulkScratch : dashProjectData[dashSelectedRowIndex];

        // Reflect the new values in the form controls.
        document.getElementById('fW').value = row.fW;
        document.getElementById('m_fCode').value = row.fCode;
        document.getElementById('view-dashboard').style.setProperty('--frame-bg', `url(${u})`);
        document.getElementById('fType').value = 'image';
        document.getElementById('fTypeBtnLibrary').classList.add('active');
        document.getElementById('fTypeBtnSolid').classList.remove('active');

        const productSelect = document.getElementById('m_product');
        if (/floater/i.test(c) && productSelect && productSelect.value !== "Framed Canvas (Floater)") {
            productSelect.value = "Framed Canvas (Floater)";
            handleDashProductChange(false);
        }
        const insetInput = document.getElementById('floaterInset');
        if (insetInput && row.floaterInset !== undefined) insetInput.value = row.floaterInset;
        const fHeightInput = document.getElementById('fHeight');
        if (fHeightInput && row.fHeight !== undefined) fHeightInput.value = row.fHeight;
        const rabbetInput = document.getElementById('rabbetDepth');
        if (rabbetInput && row.rabbetDepth !== undefined) rabbetInput.value = row.rabbetDepth;

        dashActiveImageObj.src = u; dashActiveImageObj.onload = () => syncDashAndCalculate();
    }).catch(err => {
        console.error('Failed to load swatch', err);
        alert('Could not load that swatch from the library.');
    });
}

function loadDashCustomSwatch(e) {
    const f = e.target.files[0]; if(!f) return;
    const n = f.name.split('.')[0]; const r = new FileReader();
    r.onload = e => {
        document.getElementById('fType').value = 'image';
        document.getElementById('fTypeBtnLibrary').classList.add('active');
        document.getElementById('fTypeBtnSolid').classList.remove('active');
        document.getElementById('view-dashboard').style.setProperty('--frame-bg', `url(${e.target.result})`);
        dashProjectData[dashSelectedRowIndex].fType = 'image'; dashProjectData[dashSelectedRowIndex].swatchDataUrl = e.target.result; dashProjectData[dashSelectedRowIndex].swatchName = n;
        document.getElementById('m_fCode').value = n; document.getElementById('swatchSelectedDisplay').textContent = 'Frame';
        document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${e.target.result})`;
        dashActiveImageObj.src = e.target.result; dashActiveImageObj.onload = () => syncDashAndCalculate();
    };
    r.readAsDataURL(f);
}

function saveFramePreset() {
    const d = { type: 'frame-preset', unit: dashUnit, frame: dashProjectData[dashSelectedRowIndex] };
    const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `Preset_${d.frame.fCode ? d.frame.fCode.replace(/[^a-z0-9]/gi, '_') : 'Frame'}.json`; a.click();
}

function loadFramePreset(e) {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            if(d.type === 'frame-preset' && d.frame) {
                const c = dashProjectData[dashSelectedRowIndex];
                d.frame.id = c.id; d.frame.location = c.location; d.frame.level = c.level; d.frame.qty = c.qty; d.frame.imageCode = c.imageCode;
                if(d.unit && d.unit !== dashUnit) {
                    // Preset stores its source unit; convert to current dash unit.
                    // unitFactor handles all 6 transitions for in/cm/mm.
                    const factor = unitFactor(d.unit, dashUnit);
                    ['extW','extH','fW','fHeight','rabbetDepth','bleed','canvasDepth','canvasWrap','m1T','m1B','m1L','m1R','m2'].forEach(p => { if(d.frame[p] !== undefined && !isNaN(d.frame[p])) d.frame[p] = dashFmt(d.frame[p]*factor); });
                }
                dashProjectData[dashSelectedRowIndex] = d.frame; loadDashDataIntoControls(d.frame); renderDashTable(); pushUpdatesToElevations(dashSelectedRowIndex);
            } else alert("Invalid preset.");
        } catch(err) { alert("Error loading file."); }
    };
    r.readAsText(f); e.target.value = '';
}

// =========================================================================
// SHARED FRAME CANVAS RENDERER
// Used by both Frame Dashboard PNG export and Elevation PNG export so the
// frames look identical in both. Returns a canvas with the frame drawn,
// fully padded with shadow space.
// =========================================================================

// Convert a frame data object to inches regardless of the current display unit.
// All the renderer's shadow/stroke/blur magic numbers are calibrated for inches
// at 72 dpi — feeding cm-valued data in produces a 2.54× bigger canvas with
// proportionally tinier shadows, which makes cm exports look different from
// inch exports of the same physical frame. Always render in inches.
function _frameDataInInches(d, sourceUnit) {
    if (sourceUnit === 'in') return d;  // no conversion needed
    // Convert from sourceUnit to inches. unitFactor handles all 3 units
    // (in/cm/mm). Was hardcoded to 1/2.54 (CM only) before — MM input was
    // getting multiplied by 0.394 instead of 0.039, producing a canvas
    // 10× too big and silently failing to render.
    const factor = unitFactor(sourceUnit, 'in');
    const out = Object.assign({}, d);
    ['extW', 'extH', 'fW', 'fHeight', 'rabbetDepth', 'm1T', 'm1B', 'm1L', 'm1R', 'm2', 'floaterInset', 'sbPaperMargin', 'sbPaperBorder'].forEach(k => {
        if (out[k] !== undefined && out[k] !== '' && !isNaN(parseFloat(out[k]))) {
            out[k] = parseFloat(out[k]) * factor;
        }
    });
    return out;
}

function renderFrameToCanvas(d, swatchImg, opts) {
    opts = opts || {};
    const dpi = opts.dpi || 72;
    const pad = opts.pad !== undefined ? opts.pad : 40;
    const w = d.extW * dpi;
    const h = d.extH * dpi;
    const fw = d.fW * dpi;

    const isC = (d.product === "Framed Canvas (Floater)");
    const isFrameless = (d.product === "Frameless Canvas (Wrapped)");

    // FRAMELESS CANVAS: no frame, no mats, no paper. The entire face is the
    // transparent image area. We only paint an outer drop shadow halo so the
    // canvas reads as having depth when composited in InDesign.
    if (isFrameless) {
        const c = document.createElement('canvas');
        c.width = w + (pad * 2);
        c.height = h + (pad * 2);
        const x = c.getContext('2d');
        x.translate(pad, pad);
        // Outer drop shadow (matches the floater's ambient shadow strength).
        // Gated on the global toggle — when off, no outer shadow is painted,
        // resulting in a cleaner PNG for compositing in InDesign without an
        // unwanted bleed halo around the frame.
        if (dashOuterShadowsOn) {
            x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
            x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
            x.shadowColor = 'transparent';
        }
        // Cut a transparent hole for the entire face — the artwork composited behind
        // shows through. No baked inner shadow (frameless canvas has no surrounding
        // material to project a shadow onto the artwork).
        x.clearRect(0, 0, w, h);
        return { canvas: c, pad: pad, frameW: w, frameH: h };
    }
    // FLOATER GEOMETRY:
    //   - Rails draw at full structural fW (e.g. 1.5" — the actual profile width).
    //   - The image opening is inset from the outer edge by floaterInset (e.g. 0.75").
    //   - Since opening (10.5x10.5 for a 12x12 with 0.75 inset) is BIGGER than the
    //     rail-inner area (9x9), it cuts into the rails: the inner (fW - inset) of
    //     each rail gets cleared. What's left visible is a (inset)-wide ring around
    //     the opening — the canvas face + shadow gap that you see from the front.
    //   - A drop shadow on the opening edge projects OUTWARD onto the visible rail.
    const insetPx = isC ? ((d.floaterInset !== undefined ? d.floaterInset : 0.75) * dpi) : 0;
    // Rails always draw at structural fw. Clear rect determines where the opening lands.
    const drawFw = fw;

    const c = document.createElement('canvas');
    c.width = w + (pad * 2);
    c.height = h + (pad * 2);
    const x = c.getContext('2d');
    x.translate(pad, pad);

    // Outer drop shadow under the whole frame — strong enough to read in elevation
    // exports where the frame sits on a wall background. Gated on the global
    // toggle — when off, no outer shadow is painted, giving cleaner PNGs for
    // InDesign compositing without an unwanted bleed halo.
    if (dashOuterShadowsOn) {
        x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
        x.shadowColor = 'transparent';
    } else {
        // Still paint the base frame rectangle so the rails / interior render
        // correctly on top, just without the drop-shadow layer underneath.
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    }

    // Shade a color toward black (negative pct) or white (positive pct).
    // pct is a fraction in [-1, 1]. Used by the color-mode 3D shading helpers
    // below to derive inner/outer rail tones from a single base color. Handles
    // both #rrggbb and #rgb forms; falls back to passthrough for other formats.
    function shadeColor(hex, pct) {
        const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        let h = m[1];
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        let r = parseInt(h.slice(0, 2), 16);
        let g = parseInt(h.slice(2, 4), 16);
        let b = parseInt(h.slice(4, 6), 16);
        const adj = (v) => {
            if (pct >= 0) return Math.round(v + (255 - v) * pct);
            return Math.round(v * (1 + pct));
        };
        r = Math.max(0, Math.min(255, adj(r)));
        g = Math.max(0, Math.min(255, adj(g)));
        b = Math.max(0, Math.min(255, adj(b)));
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    }

    // Rail fill: either patterned swatch (Library) or solid color.
    // Color-mode rails get a subtle linear gradient that simulates light raking
    // across the frame profile — slightly darker at the inner edge (where the
    // rail descends toward the rabbet pocket / art) and slightly lighter at the
    // outer edge (where the rail catches frontal light). Magnitudes are small
    // (~12% darker, ~7% lighter) so the effect reads as "this is a 3D rail"
    // not "this is a stripe." Library swatches keep their photographic fidelity
    // — no gradient applied to those.
    function fR(img, rw, rh, sx, sy) {
        const useColor = (!img || img.src === emptyImgUrl || d.fType === 'color' || !img.complete || !img.naturalWidth);
        if (useColor) {
            const base = d.fColor || '#1a1a1a';
            // The gradient runs along the rail's WIDTH (the short dimension).
            // Inner edge of rail = closer to the art (lower x for left rail when
            // the rail is drawn pre-clip in its local coordinate space). Since
            // each rail is drawn with its own clip + transform, the gradient is
            // applied here in the rail's local space: from x=0 (outer edge) to
            // x=rw (inner edge). The four rails are mirrored/rotated by their
            // callers, so this consistent local-space gradient looks correct
            // on all four sides.
            const grad = x.createLinearGradient(0, 0, rw, 0);
            grad.addColorStop(0, shadeColor(base, 0.07));   // outer edge: slightly lighter
            grad.addColorStop(0.55, base);                   // mid-rail: base color
            grad.addColorStop(1, shadeColor(base, -0.12));  // inner edge: slightly darker
            x.fillStyle = grad;
            x.fillRect(sx, sy, rw, rh);
            return;
        }
        const s = rw / img.width;
        const pt = x.createPattern(img, 'repeat');
        const m = new DOMMatrix().translate(sx, sy).scale(s, s);
        pt.setTransform(m); x.fillStyle = pt; x.fillRect(sx, sy, rw, rh);
    }

    // Mitered frame rails (4 trapezoidal clips). For floaters, drawFw includes the
    // canvas-face/shadow-gap region so the swatch image covers it visually.
    x.save(); x.beginPath(); x.moveTo(0,0); x.lineTo(drawFw,drawFw); x.lineTo(drawFw,h-drawFw); x.lineTo(0,h); x.closePath(); x.clip(); fR(swatchImg,drawFw,h,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(w,0); x.lineTo(w-drawFw,drawFw); x.lineTo(w-drawFw,h-drawFw); x.lineTo(w,h); x.closePath(); x.clip(); x.translate(w,0); x.scale(-1,1); fR(swatchImg,drawFw,h,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(0,0); x.lineTo(w,0); x.lineTo(w-drawFw,drawFw); x.lineTo(drawFw,drawFw); x.closePath(); x.clip(); x.translate(w/2,drawFw/2); x.rotate(90*Math.PI/180); x.translate(-drawFw/2,-w/2); fR(swatchImg,drawFw,w,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(0,h); x.lineTo(w,h); x.lineTo(w-drawFw,h-drawFw); x.lineTo(drawFw,h-drawFw); x.closePath(); x.clip(); x.translate(w/2,h-drawFw/2); x.rotate(-90*Math.PI/180); x.translate(-drawFw/2,-w/2); fR(swatchImg,drawFw,w,0,0); x.restore();

    // Miter seam lines at the 4 corner joints — only for color-mode frames.
    // Real frames are 4 mitered pieces; without these lines a flat solid color
    // reads as a single moulded shape. Drawn AFTER rails so they sit on top.
    // Miter color is a darker shade of the base; line width scales gently with
    // frame size so it stays visible at small render sizes without dominating
    // at large ones.
    if (d.fType === 'color') {
        const miterColor = shadeColor(d.fColor || '#1a1a1a', -0.35);
        const miterW = Math.max(0.5, Math.min(2, drawFw * 0.015));
        x.save();
        x.strokeStyle = miterColor;
        x.lineWidth = miterW;
        x.lineCap = 'round';
        x.beginPath();
        // Top-left miter: outer corner (0,0) → inner corner (drawFw, drawFw)
        x.moveTo(0, 0); x.lineTo(drawFw, drawFw);
        // Top-right miter: outer (w,0) → inner (w-drawFw, drawFw)
        x.moveTo(w, 0); x.lineTo(w - drawFw, drawFw);
        // Bottom-left miter: outer (0,h) → inner (drawFw, h-drawFw)
        x.moveTo(0, h); x.lineTo(drawFw, h - drawFw);
        // Bottom-right miter: outer (w,h) → inner (w-drawFw, h-drawFw)
        x.moveTo(w, h); x.lineTo(w - drawFw, h - drawFw);
        x.stroke();
        x.restore();
    }

    // Drop-inset shadow helper for mat & art bevels.
    // The stroke must lie entirely OUTSIDE the clip — if it touches the clip boundary
    // its anti-aliasing leaks across as a 1px black line. Stroke center at (bx-15, by-15)
    // with width 10 means the stroke spans (bx-20..bx-10) — fully outside (bx, by, bw, bh).
    //
    // op (opacity) gets multiplied by the global INNER_SHADOW_BOOST factor (~1.25)
    // so all inner shadows render slightly darker than their original calibration.
    // This makes the frame look properly "grounded" even when the outer drop
    // shadow is off (user toggle). Clamped to 1.0 so we don't oversaturate.
    function dIS(bx, by, bw, bh, bl, os, op) {
        const boostedOp = Math.min(1.0, op * 1.25);
        x.save(); x.beginPath(); x.rect(bx,by,bw,bh); x.clip();
        x.shadowColor = `rgba(0,0,0,${boostedOp})`; x.shadowBlur = bl; x.shadowOffsetY = os;
        x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeRect(bx-15, by-15, bw+30, bh+30);
        x.restore();
    }

    const iX = drawFw, iY = drawFw, iW = w - (drawFw*2), iH = h - (drawFw*2);
    // Float mount runs whenever the row's toggle is set on a non-floater frame.
    const useFM = !isC && (d.useFloatMount === true);
    // Mat 2 only renders when Mat 1 is also active (M2 sits inside M1)
    const m1On = (d.m1A !== false && !isC && !useFM);
    const m2On = (m1On && d.m2A === true && !isC && !useFM);
    const mT = m1On ? d.m1T : 0, mB = m1On ? d.m1B : 0, mL = m1On ? d.m1L : 0, mR = m1On ? d.m1R : 0;
    const m2 = m2On ? d.m2 : 0;
    const mat1Color = d.m1ColorHex || '#ffffff';
    const mat2Color = d.m2ColorHex || '#ffffff';

    if (m1On) {
        x.fillStyle = mat1Color; x.fillRect(iX, iY, iW, iH);
        // Frame casts a strong inset shadow onto Mat 1 (bumped per user request:
        // gives clearer visual separation between frame profile and mat surface).
        dIS(iX, iY, iW, iH, 35, 14, 0.6);
        x.strokeStyle = "#cccccc"; x.lineWidth = 1; x.strokeRect(iX, iY, iW, iH);
    }
    const m2X = iX + (mL*dpi), m2Y = iY + (mT*dpi);
    const m2W = iW - ((mL+mR)*dpi), m2H = iH - ((mT+mB)*dpi);
    if (m2On) {
        x.fillStyle = mat2Color; x.fillRect(m2X, m2Y, m2W, m2H);
        // Mat 1 casts a moderate inset shadow onto Mat 2 (slightly bumped to match)
        dIS(m2X, m2Y, m2W, m2H, 20, 8, 0.45);
        x.strokeStyle = "#cccccc"; x.lineWidth = 1; x.strokeRect(m2X, m2Y, m2W, m2H);
    }

    // FAUX MAT layer: a white paper that sits inside whatever opening is above
    // (mat 2 if on, mat 1 if on, frame if no mats). The mat above casts an inset
    // shadow onto the paper, same as the frame casts onto mat 1. The paper
    // itself has no thickness, so it does NOT cast a shadow onto the image
    // hole — the image is flat against the paper.
    //
    // Layout: the white paper fills the innermost-mat-or-frame opening. The
    // image hole, calculated later as aX/aY/aW/aH, will be repositioned inside
    // the paper offset by sbPaperBorder on each side, leaving the visible
    // white band ("faux mat" effect).
    const useFauxMat = !isC && !useFM && (d.useFauxMat === true);
    let fauxX = 0, fauxY = 0, fauxW = 0, fauxH = 0;
    if (useFauxMat) {
        // Determine the bounds of the white paper based on what's above:
        //   - Mat 2 on → paper fills mat 2's opening (m2 reveal already accounted for in art-opening math below)
        //   - Mat 1 on (no mat 2) → paper fills mat 1's opening
        //   - No mats → paper fills frame's opening (iX, iY, iW, iH already point there)
        // Mat 2 is special: its "opening" is m2W minus m2 reveal × 2, so we apply that offset here.
        if (m2On) {
            const m2RevPx = (parseFloat(d.m2) || 0) * dpi;
            fauxX = m2X + m2RevPx; fauxY = m2Y + m2RevPx;
            fauxW = m2W - m2RevPx * 2; fauxH = m2H - m2RevPx * 2;
        } else if (m1On) {
            fauxX = m2X; fauxY = m2Y;
            fauxW = m2W; fauxH = m2H;
        } else {
            fauxX = iX; fauxY = iY;
            fauxW = iW; fauxH = iH;
        }
        if (fauxW > 0 && fauxH > 0) {
            x.fillStyle = '#ffffff';
            x.fillRect(fauxX, fauxY, fauxW, fauxH);
            // Cast shadow of the mat (or frame, if no mats) above onto the white paper.
            // Magnitude matches the shadow Mat 2 / Mat 1 would project onto each other.
            if (m1On || m2On) {
                dIS(fauxX, fauxY, fauxW, fauxH, 20, 8, 0.45);
            } else {
                // No mats — the frame casts a stronger shadow (same as Mat 1 would get)
                dIS(fauxX, fauxY, fauxW, fauxH, 35, 14, 0.6);
            }
            // Subtle outline so the paper edge is visible against the mat above
            x.strokeStyle = "#cccccc"; x.lineWidth = 1;
            x.strokeRect(fauxX, fauxY, fauxW, fauxH);
        }
    }

    // FLOAT MOUNT layers: backer fills the frame interior; paper sits on top of
    // the backer offset by paperMargin; image hole is inside the paper offset
    // by paperBorder (set to 0 for full bleed).
    let sbPaperX, sbPaperY, sbPaperW, sbPaperH;
    if (useFM) {
        const paperMarginPx = (parseFloat(d.sbPaperMargin) || 0) * dpi;
        const paperBorderPx = (parseFloat(d.sbPaperBorder) || 0) * dpi;
        const backerColor = d.sbBackerColorHex || '#ffffff';
        const paperColor = d.sbPaperColorHex || '#ffffff';

        // Fill the entire frame interior with the backer color
        x.fillStyle = backerColor;
        x.fillRect(iX, iY, iW, iH);
        // Frame casts a strong inset shadow onto the backer too (matches the bumped
        // mat shadow above for visual consistency across products).
        dIS(iX, iY, iW, iH, 35, 14, 0.6);

        // Paper rectangle, inset from frame inner edge by paperMargin
        sbPaperX = iX + paperMarginPx; sbPaperY = iY + paperMarginPx;
        sbPaperW = iW - paperMarginPx * 2; sbPaperH = iH - paperMarginPx * 2;

        // Determine the paper outline: clean = simple rect; torn = irregular polyline
        const edgeStyle = d.sbPaperEdge || 'clean';
        const paperPath = new Path2D();
        if (edgeStyle === 'torn' && sbPaperW > 0 && sbPaperH > 0) {
            // Procedural torn edge: seeded RNG produces a stable irregular outline.
            // Magnitudes scale with paper size so it reads as "torn" at any size.
            const seed = d.sbPaperEdgeSeed || 1;
            const rng = (function makeRng(s) {
                // Mulberry32 — small, fast, well-distributed seeded PRNG
                let st = s >>> 0;
                return function() {
                    st = (st + 0x6D2B79F5) >>> 0;
                    let t = st;
                    t = Math.imul(t ^ (t >>> 15), t | 1);
                    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            })(seed);
            // Roughness magnitude proportional to paper size; ~0.15% of the smaller dim
            // gives a paper-fiber look that reads as deckled without looking torn-up.
            // (Real deckled edges have ~1-2mm peak-to-peak variance; this matches that
            // scale on screen rather than overstating it.) Base of 0.4px keeps the
            // edge visibly non-straight even at small render sizes.
            const rough = Math.min(sbPaperW, sbPaperH) * 0.0015 + 0.4;
            // Number of segments per side proportional to length so density is consistent.
            // Higher density (24 vs original 8) means smaller, more frequent variations —
            // the eye reads it as "fiber texture" rather than "ragged tooth."
            const segPerInch = 24;
            const segH = Math.max(20, Math.round((sbPaperW / dpi) * segPerInch));
            const segV = Math.max(20, Math.round((sbPaperH / dpi) * segPerInch));
            const jitter = () => (rng() - 0.5) * 2 * rough;

            // Top edge (left → right)
            paperPath.moveTo(sbPaperX + jitter(), sbPaperY + jitter());
            for (let i = 1; i <= segH; i++) {
                paperPath.lineTo(sbPaperX + (sbPaperW * i / segH) + jitter(), sbPaperY + jitter());
            }
            // Right edge (top → bottom)
            for (let i = 1; i <= segV; i++) {
                paperPath.lineTo(sbPaperX + sbPaperW + jitter(), sbPaperY + (sbPaperH * i / segV) + jitter());
            }
            // Bottom edge (right → left)
            for (let i = 1; i <= segH; i++) {
                paperPath.lineTo(sbPaperX + sbPaperW - (sbPaperW * i / segH) + jitter(), sbPaperY + sbPaperH + jitter());
            }
            // Left edge (bottom → top, back to start)
            for (let i = 1; i <= segV; i++) {
                paperPath.lineTo(sbPaperX + jitter(), sbPaperY + sbPaperH - (sbPaperH * i / segV) + jitter());
            }
            paperPath.closePath();
        } else {
            paperPath.rect(sbPaperX, sbPaperY, sbPaperW, sbPaperH);
        }

        // Drop shadow under the paper, projecting onto the backer.
        // Inner shadow — boosted by ~25% to match other inner-shadow values
        // (rgba opacity 0.55 * 1.25 = ~0.69, rounded to 0.7).
        // Use a separate save/restore so the shadow doesn't bleed onto subsequent draws.
        x.save();
        x.shadowColor = 'rgba(0,0,0,0.7)'; x.shadowBlur = 18; x.shadowOffsetX = 2; x.shadowOffsetY = 4;
        x.fillStyle = paperColor;
        x.fill(paperPath);
        x.restore();

        // Image hole goes inside the paper, offset by paperBorder on each side.
        // (Set sbPaperBorder=0 for full bleed: hole = paper.)
        // We override aX/aY/aW/aH below so the existing clearRect / inner-shadow code
        // operates on the right rectangle for shadow box.
    }

    // Art opening
    let aX = m2X + (m2*dpi), aY = m2Y + (m2*dpi);
    let aW = m2W - (m2*2*dpi), aH = m2H - (m2*2*dpi);
    if (isC) {
        // Floater: opening is positioned by floaterInset from the outer edge —
        // typically BIGGER than the rail-inner area (drawFw, drawFw, w-drawFw*2, h-drawFw*2).
        // The opening cuts INTO the rails, leaving only an inset-wide ring of frame
        // visible from the front (= the canvas face + shadow gap).
        aX = insetPx; aY = insetPx;
        aW = w - (insetPx * 2); aH = h - (insetPx * 2);
    } else if (useFM) {
        // Float mount: opening sits inside the paper at paperBorder offset.
        // (Set sbPaperBorder=0 for full bleed = paper edge.)
        const paperBorderPx = (parseFloat(d.sbPaperBorder) || 0) * dpi;
        aX = sbPaperX + paperBorderPx; aY = sbPaperY + paperBorderPx;
        aW = sbPaperW - paperBorderPx * 2; aH = sbPaperH - paperBorderPx * 2;
    } else if (useFauxMat && fauxW > 0 && fauxH > 0) {
        // Faux mat: image hole sits inside the white paper at fauxBorder offset.
        // Reuses sbPaperBorder (same data field, same semantic — white border
        // around image on the print paper).
        const fauxBorderPx = (parseFloat(d.sbPaperBorder) || 0) * dpi;
        aX = fauxX + fauxBorderPx; aY = fauxY + fauxBorderPx;
        aW = fauxW - fauxBorderPx * 2; aH = fauxH - fauxBorderPx * 2;
    }
    x.clearRect(aX, aY, aW, aH);

    if (isC) {
        // FLOATER: opening is fully transparent so artwork composited behind shows
        // through. Bake an outward-projecting drop shadow on the boundary onto the
        // surrounding rail face. Shadow does NOT fall on the artwork.
        x.save();
        x.beginPath();
        x.rect(-pad, -pad, c.width, c.height);
        x.rect(aX, aY, aW, aH);
        x.clip('evenodd');
        x.shadowColor = `rgba(0,0,0,0.8)`; x.shadowBlur = 25; x.shadowOffsetX = 0; x.shadowOffsetY = 3;
        x.lineWidth = 6; x.strokeStyle = '#000';
        x.strokeRect(aX + 4, aY + 4, aW - 8, aH - 8);
        x.restore();
    } else if (useFM || useFauxMat) {
        // FLOAT MOUNT / FAUX MAT: per user spec — image opening must NOT cast a
        // shadow onto the paper layer. The print is flat against the paper, no
        // thickness, no shadow. The only shadow on the paper comes from the
        // mat above, handled in the faux mat / paper fill blocks above.
        // (Intentionally no shadow drawn here.)
    } else {
        dIS(aX, aY, aW, aH, 8, 3, 0.25);
        x.strokeStyle = "#aaaaaa"; x.lineWidth = 1; x.strokeRect(aX, aY, aW, aH);
    }

    // Optional art-opening size label (for elevation export — dashboard already shows this elsewhere)
    if (opts.showArtLabel && aW > 0 && aH > 0) {
        const unitSuffix = unitInfo(opts.unit || 'in').suffix;
        const fontSize = Math.max(10, Math.min(aW, aH) * 0.08);
        x.fillStyle = 'rgba(60,60,60,0.65)';
        x.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const cx = aX + aW/2, cy = aY + aH/2;
        const lineH = fontSize * 1.15;
        x.fillText(`${(d.extW - d.fW*2 - mL - mR - m2*2).toFixed(1)}${unitSuffix}`, cx, cy - lineH);
        x.fillText(`x`, cx, cy);
        x.fillText(`${(d.extH - d.fW*2 - mT - mB - m2*2).toFixed(1)}${unitSuffix}`, cx, cy + lineH);
    }

    return { canvas: c, pad: pad, frameW: w, frameH: h };
}

// Build a Self-Explanatory PNG filename for a row.
// Format: ITEM_CODE_PRODUCT_FRAMECODE_WxH_M..._R...png
// Per the FRAME File Naming Proposal:
//   ART.001_FA_MICH-41-35_24x36_M3_R0.25.png
//
// Tokens appear conditionally based on product type and row state.
// The ITEM CODE is always first — InDesign's AutoFrameSpecs matches by
// the ART.NNN_ prefix, so users can rename safely as long as they leave
// the prefix intact.
//
// Numeric values in the filename use whatever unit the project is in. To
// keep names short, the team should export with the project set to inches
// when possible. Numbers drop trailing zeros (3 instead of 3.0, 2.5
// instead of 2.50).
function buildPngFilename(row) {
    if (!row) return 'Frame.png';
    // Strip characters that are invalid in filenames on Windows/macOS/Linux.
    // Slashes, colons, quotes, etc. become underscores; parens are removed
    // (they're noise in filenames).
    const sanitize = (s) => String(s || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/[()]/g, '')
        .replace(/\s+/g, '_');
    const itemCode = sanitize(row.id) || 'Frame';

    // Format a numeric value: drop trailing zeros so 3.000 → 3 and 2.500 → 2.5.
    // Numbers are written in the project's current unit (whatever the row data
    // is stored in). Values < 0.0001 are treated as 0.
    const num = (v) => {
        const n = parseFloat(v);
        if (isNaN(n) || Math.abs(n) < 0.0001) return '0';
        // toFixed(4) then strip trailing zeros and trailing dot.
        let s = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
        return s;
    };

    // Product code per the proposal's decoder ring.
    const product = row.product || '';
    const useFM = (row.useFloatMount === true);
    let productCode;
    if (product === 'Frameless Canvas (Wrapped)') productCode = 'FLW';
    else if (product === 'Framed Canvas (Floater)') productCode = 'FCF';
    else if (product === 'Sourced Object')          productCode = 'SO';
    else if (product === 'Framed Art (Shadow Box)') productCode = 'FAFM';  // Shadow Box = Float Mount
    else if (useFM)                                 productCode = 'FAFM';  // any other product flagged float-mount
    else                                            productCode = 'FA';    // Framed Art (default)

    const tokens = [itemCode, productCode];

    // FRAME CODE — sanitized. Omitted for Frameless (no frame) and Sourced
    // Object (no frame applies). Other products include it even if empty,
    // skipping only when the field is blank.
    const frameCodeOmitted = (productCode === 'FLW' || productCode === 'SO');
    if (!frameCodeOmitted) {
        const fCode = sanitize(row.fCode);
        if (fCode) tokens.push(fCode);
    }

    // SIZE — always included. WxH using extW × extH.
    const sizeToken = `${num(row.extW)}x${num(row.extH)}`;
    tokens.push(sizeToken);

    // MAT 1 — only for Framed Art (FA) and Framed Art Shadow Box (FAFM).
    // Canvas products and Sourced Object don't have mats.
    const hasMats = (productCode === 'FA');  // standard mat only; FAFM uses float-mount instead
    if (hasMats && row.m1A !== false) {
        const T = parseFloat(row.m1T) || 0;
        const B = parseFloat(row.m1B) || 0;
        const L = parseFloat(row.m1L) || 0;
        const R = parseFloat(row.m1R) || 0;
        if (T + B + L + R > 0) {
            // Equal on all 4 sides → M<n>; otherwise M<T>T-<B>B-<L>L-<R>R
            if (T === B && T === L && T === R) {
                tokens.push(`M${num(T)}`);
            } else {
                tokens.push(`M${num(T)}T-${num(B)}B-${num(L)}L-${num(R)}R`);
            }
        }
    }

    // MAT 2 REVEAL — only for Framed Art with Mat 2 active and reveal > 0
    if (hasMats && row.m2A === true) {
        const rev = parseFloat(row.m2) || 0;
        if (rev > 0) tokens.push(`R${num(rev)}`);
    }

    // FAUX MAT (printed paper border under standard mats) — Framed Art only
    if (hasMats && row.useFauxMat === true) {
        const fx = parseFloat(row.sbPaperBorder) || 0;
        if (fx > 0) tokens.push(`FX${num(fx)}`);
    }

    // FLOAT MOUNT white border — Shadow Box / Float Mount only
    if (productCode === 'FAFM') {
        const fm = parseFloat(row.sbPaperBorder) || 0;
        // FM0 IS meaningful (bleed edge — no border) per the proposal
        tokens.push(`FM${num(fm)}`);
    }

    // FLOATER INSET — Floater canvas only
    if (productCode === 'FCF') {
        const inset = parseFloat(row.floaterInset);
        // Only include if non-default and non-zero. Floater default is 0.75
        // but spec includes it always since it's the defining gap measurement.
        if (!isNaN(inset) && inset > 0) {
            tokens.push(`I${num(inset)}`);
        }
    }

    // CANVAS DEPTH — Frameless Canvas only
    if (productCode === 'FLW') {
        const depth = parseFloat(row.canvasDepth);
        if (!isNaN(depth) && depth > 0) {
            tokens.push(`D${num(depth)}`);
        }
    }

    return tokens.join('_') + '.png';
}

function exportDashNativePNG() {
    const d = dashProjectData[dashSelectedRowIndex];
    // Always render in inches so cm-mode and in-mode exports look identical.
    const dInches = _frameDataInInches(d, dashUnit);
    // Pad reserves transparent space for the drop shadow to render into.
    // When shadows are off, designers don't want the empty margin — it
    // makes alignment in InDesign harder (the frame edge ≠ the bounding
    // box edge). So pad:0 when shadows are off; pad:40 when on.
    const exportPad = dashOuterShadowsOn ? 40 : 0;
    const { canvas } = renderFrameToCanvas(dInches, dashActiveImageObj, { dpi: 72, pad: exportPad });
    const a = document.createElement('a');
    a.download = buildPngFilename(d);
    a.href = canvas.toDataURL("image/png");
    a.click();
}

// Build the human-readable Application + Matboard description strings for a row.
// These are written into two new CSV columns and consumed by the InDesign
// AutoFrameSpecs.jsx script, which drops them directly into the spec block under
// each image without any product-aware branching of its own.
//
// This function is the single source of truth for spec wording — change product
// names, adjust capitalization, or add new variants here and both the CSV export
// AND the InDesign output update consistently.
//
// Input: a row from dashProjectData. Output: { application: string, matboard: string }.
// Constraint validation engine.
//
// Centralized place for all per-row validation rules. Each rule is a pure
// function: takes a row, returns a Warning object if violated, or null if
// the row passes. Rules run in order; all warnings are collected and shown
// together (rules don't short-circuit each other).
//
// To add a new rule: write a function that takes (r) and returns either
// null or { field, message, severity }. Then add it to RULES below. That's it.
//
// Severity values:
//   - 'warning' (yellow): a soft check; the spec might still work but is risky
//   - 'error' (red): a hard violation; production will likely fail
//
// Field is the dashboard form input id, used by the UI to position the warning
// indicator next to the offending field.
const CONSTRAINT_RULES = [
    // Rabbet must be ≥ 0.625" when float mount is active (covers the 0.25" raised
    // spacer + paper + glass + backing stack). Below this and the frame can't
    // close over the layered materials.
    function rabbetMinForFloatMount(r) {
        const isFloater = (r.product === "Framed Canvas (Floater)");
        const isFrameless = (r.product === "Frameless Canvas (Wrapped)");
        const useFM = !isFloater && !isFrameless && r.useFloatMount === true;
        if (!useFM) return null;
        const rabbet = parseFloat(r.rabbetDepth) || 0;
        if (rabbet === 0) return null; // Empty rabbet is not a violation; user hasn't filled it in
        if (rabbet >= 0.625) return null;
        return {
            field: 'rabbetDepth',
            message: `Rabbet must be ≥ 0.625" for raised float mount (current: ${rabbet}")`,
            severity: 'warning'
        };
    },

    // Rabbet must be ≥ 0.75" when both Mat 1 and Mat 2 are active (double mat).
    // The double-thickness mat stack plus print, glass, and backing exceeds the
    // standard rabbet depth most frame profiles ship with.
    function rabbetMinForDoubleMat(r) {
        const isFloater = (r.product === "Framed Canvas (Floater)");
        const isFrameless = (r.product === "Frameless Canvas (Wrapped)");
        const useFM = !isFloater && !isFrameless && r.useFloatMount === true;
        const m1On = !isFloater && !isFrameless && !useFM && r.m1A !== false;
        const m2On = m1On && r.m2A === true;
        if (!m2On) return null;
        const rabbet = parseFloat(r.rabbetDepth) || 0;
        if (rabbet === 0) return null;
        if (rabbet >= 0.75) return null;
        return {
            field: 'rabbetDepth',
            message: `Rabbet must be ≥ 0.75" for double mat (current: ${rabbet}")`,
            severity: 'warning'
        };
    },
];

// Run all rules against a row. Returns array of warnings (empty if row passes).
function validateRow(r) {
    const warnings = [];
    for (const rule of CONSTRAINT_RULES) {
        try {
            const w = rule(r);
            if (w) warnings.push(w);
        } catch (e) {
            console.warn('Constraint rule threw:', e);
        }
    }
    return warnings;
}

// Floater-specific helper: derive the suggested canvasWrap from the rabbet
// depth. Used by the dashboard form to auto-fill canvasWrap when rabbet
// changes on a floater row. Formula per studio convention: wrap = rabbet + 0.5"
// (the +0.5" is safety margin for the printer + stretching allowance).
//
// Returns null when the input doesn't make sense (no rabbet, or product isn't
// a floater) — caller should leave canvasWrap untouched in that case.
function suggestedCanvasWrapFromRabbet(r) {
    if (r.product !== "Framed Canvas (Floater)") return null;
    const rabbet = parseFloat(r.rabbetDepth) || 0;
    if (rabbet <= 0) return null;
    return rabbet + 0.5;
}

// buildSpecStrings — single source of truth for spec block content.
//
// Returns:
//   {
//     application: <legacy>,   // kept for old InDesign scripts that expect it
//     matboard:    <legacy>,   // kept for old InDesign scripts that expect it
//     lines:       [           // new rich format — array of label/value pairs
//       { label: "Application",  value: "Framed Art" },
//       { label: "Frame Size",   value: "1.25\"W × 1.625\"D, Rabbet 0.625\"" },
//       ...
//     ]
//   }
//
// Lines are product-specific. Empty-valued lines are skipped (no "N/A" placeholders).
// Per-product behavior:
//   - Wrapped Canvas: Application, Mount, Hardware, Art Dimensions, Overall Dimensions
//                     (no Frame Size, Frame Code, Mat lines, Glass)
//   - Floater:        + Frame Size, Frame Code (no Mat lines)
//   - Framed Art (Float Mount): + Matboard line (= float mount description), no Mat 2
//   - Framed Art (Standard):    + Mat 1, optional Mat 2 each on its own line
//
// Mount line auto-composes "Float Mount, 0.25\" Reveal" when useFloatMount.
// Otherwise uses the user's Mount field text.
function buildSpecStrings(r) {
    const isC = (r.product === "Framed Canvas (Floater)");
    const isFL = (r.product === "Frameless Canvas (Wrapped)");
    const isFM = !isC && !isFL && (r.useFloatMount === true);
    const m1On = (r.m1A !== false) && !isC && !isFL && !isFM;
    const m2On = m1On && r.m2A === true;

    // Format a number naturally — drop trailing zeros (1.0 → "1", 1.250 → "1.25").
    // Format a number naturally — round to 3 decimals to kill float noise
    // from unit conversions (e.g. 18.5 * 2.54 = 46.99000000000001 in float
    // math), then strip trailing zeros via parseFloat (1.250 → "1.25",
    // 24.000 → "24"). Returns null for zero/empty so calling code can
    // detect "not set" vs "set to zero".
    const fmt = (v) => {
        const n = parseFloat(v);
        if (isNaN(n) || n === 0) return null;
        return parseFloat(n.toFixed(3)).toString();
    };

    // Unit suffix used in human-readable strings throughout this function.
    // Two variants to preserve the legacy formatting conventions:
    //   sufTight — between a value and a single-letter direction (W/D/T/B/L/R).
    //              For inches, no space: "1.25\"W". CM/MM use spaces because
    //              "1.25cmW" reads worse than "1.25 cm W".
    //   sufLoose — between a value and a multi-letter word (AA, Reveal).
    //              For inches, a trailing space: "3\" AA". CM/MM same as tight.
    // This matches what buildSpecStrings produced before MM support was added.
    const _u = (typeof dashUnit !== 'undefined') ? dashUnit : 'in';
    const sufTight = _u === 'in' ? '"' : (_u === 'cm' ? ' cm ' : ' mm ');
    const sufLoose = _u === 'in' ? '" ' : (_u === 'cm' ? ' cm ' : ' mm ');

    // ── Application ────────────────────────────────────────────────────────
    let application;
    if (isC)        application = "Framed Canvas (Floater)";
    else if (isFL)  application = "Wrapped Canvas";
    else if (isFM)  application = (r.product === "Framed Art (Shadow Box)") ? "Framed Art (Shadow Box)" : "Framed Art";
    else            application = "Framed Art";

    // ── Frame Size: "<W><suf>W × <D><suf>D, Rabbet <R><suf>D" ─────────────
    // Skipped entirely for Wrapped Canvas (no frame at all).
    let frameSize = '';
    if (!isFL) {
        // For floaters, the visible frame "width" is the canvas FACE width (the
        // swatch _f tag, stored as _faceWidth), not the moulding profile width.
        let widthForSize = r.fW;
        if (isC && r._faceWidth !== undefined && r._faceWidth !== null && r._faceWidth !== '' && parseFloat(r._faceWidth) > 0) {
            widthForSize = r._faceWidth;
        }
        const fwStr = fmt(widthForSize);
        const fhStr = fmt(r.fHeight);
        const rabStr = fmt(r.rabbetDepth);
        const parts = [];
        if (fwStr) parts.push(`${fwStr}${sufTight}W`);
        if (fhStr) parts.push(`${fhStr}${sufTight}D`);
        let primary = parts.join(' × ');
        if (rabStr) primary = primary ? `${primary}, Rabbet ${rabStr}${sufTight}` : `Rabbet ${rabStr}${sufTight}`;
        frameSize = primary;
    }

    // ── Frame Code: "<code>, <color>" ──────────────────────────────────────
    // Display substitution: the FIRST dash between letters and digits in the
    // code becomes a space (e.g. "MICH-41-12" → "MICH 41-12"). Per user request
    // — the letters-to-numbers boundary reads cleaner with a space, but mid-
    // code dashes stay so the structure is preserved. Color names untouched.
    let frameCode = '';
    if (!isFL) {
        const code = (r.fCode || '').trim().replace(/^([A-Za-z]+)-(\d)/, '$1 $2');
        const color = (r.fColorName || '').trim();
        if (code && color) frameCode = `${code}, ${color}`;
        else frameCode = code || color || '';
    }

    // ── Mat 1 / Mat 2 — separate lines per the studio template ────────────
    // formatMatSides groups equal-valued sides for readability:
    //   [3,3,3,3]   → "3" AA"            (all equal — special "all-around" form)
    //   [3,10,3,3]  → "3" T/L/R × 10" B"   (3 sides match)
    //   [3,3,5,5]   → "3" T/B × 5" L/R"   (two pairs)
    //   [3,3,5,6]   → "3" T/B × 5" L × 6" R"
    //   [3,5,4,6]   → "3" T × 5" B × 4" L × 6" R"  (fully asymmetric — current fallback)
    //
    // Algorithm: collect (label, value) pairs; group by value; output groups
    // in canonical T-B-L-R order; within each group, sort labels in T-B-L-R
    // order and join with "/". For the all-equal case, switch to "AA".
    const formatMatSides = (T, B, L, R) => {
        // All zero/missing → no dims string at all (caller decides what to do).
        if (T + B + L + R === 0) return '';
        // All 4 equal AND positive → "3" AA"
        if (T === B && T === L && T === R && T > 0) {
            return `${fmt(T)}${sufLoose}AA`;
        }
        // Group sides by value. Build a map: value → ordered list of labels.
        // Iterate in canonical T-B-L-R order so groups stay in reading order.
        const sides = [['T', T], ['B', B], ['L', L], ['R', R]];
        const groups = [];  // preserves insertion order
        const groupIdx = {};
        for (const [label, val] of sides) {
            const key = String(val);
            if (groupIdx[key] === undefined) {
                groupIdx[key] = groups.length;
                groups.push({ val, labels: [label] });
            } else {
                groups[groupIdx[key]].labels.push(label);
            }
        }
        // Emit each group as "<val><sufTight><labels-joined>". For values of 0
        // we still emit the side (a 0" side is a valid spec) so all 4 sides
        // are represented in the output.
        return groups.map(g => `${fmt(g.val) || 0}${sufTight}${g.labels.join('/')}`).join(' × ');
    };

    let mat1Line = '';
    let mat2Line = '';
    if (m1On) {
        const T = parseFloat(r.m1T) || 0;
        const B = parseFloat(r.m1B) || 0;
        const L = parseFloat(r.m1L) || 0;
        const R = parseFloat(r.m1R) || 0;
        const dims = formatMatSides(T, B, L, R);
        const matName = (r.m1ColorName || '').trim();
        if (dims && matName) mat1Line = `${dims}, ${matName}`;
        else if (dims) mat1Line = dims;
        else if (matName) mat1Line = matName;
    }
    if (m2On) {
        // Mat 2 is a uniform reveal added to every side of Mat 1. Express it
        // in the same side-grouped form so the relationship to Mat 1 is
        // immediately readable:
        //   Mat 1: 3" T/L/R × 10" B
        //   Mat 2: 4" T/L/R × 11" B   (reveal = 1")
        // If reveal is 0 the Mat 2 line is omitted (no visible exposure to
        // describe). Mat 2 name alone still shows for the unusual case of
        // a 0 reveal with a named board (matches prior behavior).
        const reveal = parseFloat(r.m2) || 0;
        const m2Name = (r.m2ColorName || '').trim();
        if (reveal > 0) {
            const T = (parseFloat(r.m1T) || 0) + reveal;
            const B = (parseFloat(r.m1B) || 0) + reveal;
            const L = (parseFloat(r.m1L) || 0) + reveal;
            const R = (parseFloat(r.m1R) || 0) + reveal;
            const dims = formatMatSides(T, B, L, R);
            if (dims && m2Name) mat2Line = `${dims}, ${m2Name}`;
            else if (dims) mat2Line = dims;
            else if (m2Name) mat2Line = m2Name;
        } else if (m2Name) {
            mat2Line = m2Name;
        }
    }

    // ── Matboard (legacy float mount description) ─────────────────────────
    // For float mount: "Float Mounted (Deckled Edge Paper, 0.5\" White Border)"
    // ── Float Mount lines (PDF-style, multiple separate lines) ─────────────
    // For float-mount rows we don't pack everything into one Matboard string.
    // Instead we emit multiple distinct lines matching the studio spec PDF
    // page 10 convention:
    //   Matboard:    "<backer> Mat Box"           (always present for float mount)
    //   Paper Type:  "<paper kind> / <edge style>" (e.g. "Fine Art Paper / Deckled Edge")
    //   Paper Size:  "<W>"W × <H>"H"               (image + 2 × white border)
    //   White Border: "<n>" AA"                    (only when border > 0)
    //
    // For non-float-mount we use the regular Mat 1 / Mat 2 layout from earlier.
    let matboardLine = '';      // backer description (replaces old combined Matboard)
    let paperTypeLine = '';     // for float mount only
    let paperSizeLine = '';     // for float mount only
    let whiteBorderLine = '';   // for float mount only, when border > 0
    if (isFM) {
        // Backer description: "<name> Mat Box". The "Mat Box" suffix is studio
        // convention for the float-mount backer (per PDF spec examples like
        // "B97 Polar White Mat Box").
        const backerName = (r.sbBackerColorName || 'B 97 White').trim();
        matboardLine = `${backerName} Mat Box`;

        // Paper Type: "<paper kind> / <edge>" — composed from the row's paperType
        // text field plus the edge button state. Defaults to "Fine Art Paper" if
        // user hasn't typed anything.
        const paperKind = (r.paperType || 'Fine Art Paper').trim();
        const edge = (r.sbPaperEdge || 'clean');
        const edgeWord = edge === 'torn' ? 'Deckled Edge' : 'Straight Cut';
        paperTypeLine = `${paperKind} / ${edgeWord}`;

        // Paper Size: derived from art opening + 2× white border. Re-derive the
        // art opening here using the same math the CSV export uses, so the spec
        // and CSV stay in sync. Skipped if the math underflows to zero (no
        // dimensions yet on the row).
        const fW = parseFloat(r.fW) || 0;
        const extW = parseFloat(r.extW) || 0;
        const extH = parseFloat(r.extH) || 0;
        const sbPM = parseFloat(r.sbPaperMargin) || 0;
        const sbPB = parseFloat(r.sbPaperBorder) || 0;
        const artW = Math.max(0, extW - fW * 2 - sbPM * 2 - sbPB * 2);
        const artH = Math.max(0, extH - fW * 2 - sbPM * 2 - sbPB * 2);
        const paperW = artW + sbPB * 2;
        const paperH = artH + sbPB * 2;
        if (paperW > 0 && paperH > 0) {
            // Round to 3 decimals + strip trailing zeros to kill float noise.
            // 18.5 * 25.4 = 469.90000000000003 in float math; we want 469.9.
            // parseFloat(toFixed(3)) handles both (469.900 → 469.9, 24.000 → 24).
            const wStr = parseFloat(paperW.toFixed(3)).toString();
            const hStr = parseFloat(paperH.toFixed(3)).toString();
            paperSizeLine = `${wStr}${sufTight}W × ${hStr}${sufTight}H`;
        }

        // White Border: only when border value is greater than 0. Full-bleed
        // (0 border) doesn't get a line since there's nothing to show.
        if (sbPB > 0) {
            whiteBorderLine = `${fmt(sbPB)}${sufLoose}AA`;
        }
    }

    // ── Mount line ─────────────────────────────────────────────────────────
    // Float mount: clean "Float Mount" — the spacer detail goes in Notes per
    // PDF studio convention. Non-float-mount: uses the user's Mount field text.
    let mountLine = '';
    if (isFM) {
        mountLine = 'Float Mount';
    } else {
        mountLine = (r.mount || '').trim();
    }

    // ── Notes line is intentionally NOT auto-composed. Per studio decision,
    // the production note (e.g. "Print float-mounted over mat w/ 0.25\" spacers")
    // is hand-added in InDesign when needed, since not every piece warrants it.
    // The user's typed Notes on the dashboard still get included if they exist.
    const notesLine = (r.notes || '').trim();

    // ── Float Reveal (floaters only) ───────────────────────────────────────
    // Per studio convention: Float Reveal is the air gap between the canvas
    // edge and the visible frame face. Computed as floaterInset - faceWidth
    // when both known. The faceWidth is captured from the swatch filename's
    // _f<face> tag (or legacy positional 3rd number) when the user picks a
    // floater swatch. When unknown (e.g. user picked Color mode, or filename
    // didn't encode it), falls back to the studio standard "0.25\" AA".
    let floatRevealLine = '';
    if (isC) {
        const fInset = parseFloat(r.floaterInset);
        const fwSwatch = parseFloat(r._faceWidth);
        if (!isNaN(fInset) && !isNaN(fwSwatch) && fInset > fwSwatch) {
            const reveal = fInset - fwSwatch;
            floatRevealLine = `${fmt(reveal) || 0}${sufLoose}AA`;
        } else {
            // Studio default 0.25" — expressed in the CURRENT display unit so
            // the value and its suffix never disagree (e.g. cm value with an
            // inch mark). 0.25in → 0.635cm → 6.35mm.
            const defReveal = 0.25 * unitFactor('in', _u);
            floatRevealLine = `${fmt(defReveal)}${sufLoose}AA`;
        }
    }

    // ── Canvas Stretcher Depth (canvas products only) ──────────────────────
    let stretcherLine = '';
    if (isC || isFL) {
        const cd = parseFloat(r.canvasDepth) || 0;
        if (cd > 0) stretcherLine = `${fmt(cd)}${sufTight}`;
    }

    // ── Substrate (any product where user typed something) ─────────────────
    // Per scope decision: appears on every product type when the field has content.
    const substrateLine = (r.backing || '').trim();

    // ── Build the rich lines array per product ─────────────────────────────
    // Each line is { label, value }. Empty-valued lines are filtered out at the end.
    //
    // Layout order (per studio convention):
    //   1. Identifying info: Application, Frame Size, Frame Code
    //   2. Mat / Paper / Float details (product-specific)
    //   3. Production attributes: Mount, Hardware, Glass
    //   4. Physical: Substrate
    //   5. Dimensions: Image Size + Overall Dimensions appended in InDesign script
    //   6. Notes (when user typed them)
    const lines = [];
    lines.push({ label: 'Application', value: application });

    if (frameSize) lines.push({ label: 'Frame Size', value: frameSize });
    if (frameCode) lines.push({ label: 'Frame Code', value: frameCode });

    // Mat / Paper / Float details — different per product
    if (isFM) {
        // Float mount paper: separate Matboard, Paper Type, Paper Size, White Border lines
        if (matboardLine) lines.push({ label: 'Matboard', value: matboardLine });
        if (paperTypeLine) lines.push({ label: 'Paper Type', value: paperTypeLine });
        if (paperSizeLine) lines.push({ label: 'Paper Size', value: paperSizeLine });
        if (whiteBorderLine) lines.push({ label: 'White Border', value: whiteBorderLine });
    } else if (isC) {
        // Floater canvas: Float Reveal + Stretcher Bar
        if (floatRevealLine) lines.push({ label: 'Float Reveal', value: floatRevealLine });
        if (stretcherLine) lines.push({ label: 'Stretcher Bar', value: stretcherLine });
    } else if (isFL) {
        // Wrapped canvas: just Stretcher Bar (no frame, no reveal)
        if (stretcherLine) lines.push({ label: 'Stretcher Bar', value: stretcherLine });
    } else {
        // Standard framed art: Mat 1, optional Mat 2, optional Faux Mat (paper with border)
        if (mat1Line) lines.push({ label: 'Mat 1', value: mat1Line });
        if (mat2Line) lines.push({ label: 'Mat 2', value: mat2Line });
        // Faux Mat: print with white border baked into paper. Adds Paper Size +
        // White Border lines. Paper size = image opening + border × 2; image
        // opening depends on what's above (frame only, or +mat 1, or +mat 1 + mat 2 reveal).
        if (r.useFauxMat === true) {
            const fauxBorder = parseFloat(r.sbPaperBorder) || 0;
            if (fauxBorder > 0) {
                const fW = parseFloat(r.fW) || 0;
                const extW = parseFloat(r.extW) || 0;
                const extH = parseFloat(r.extH) || 0;
                const mT = m1On ? (parseFloat(r.m1T) || 0) : 0;
                const mB = m1On ? (parseFloat(r.m1B) || 0) : 0;
                const mL = m1On ? (parseFloat(r.m1L) || 0) : 0;
                const mR = m1On ? (parseFloat(r.m1R) || 0) : 0;
                const m2v = m2On ? (parseFloat(r.m2) || 0) : 0;
                // Image opening = OD - frame×2 - mat 1 dimensions - mat 2 reveal×2.
                const imgW = Math.max(0, extW - fW * 2 - mL - mR - m2v * 2);
                const imgH = Math.max(0, extH - fW * 2 - mT - mB - m2v * 2);
                const paperW = imgW + fauxBorder * 2;
                const paperH = imgH + fauxBorder * 2;
                if (paperW > 0 && paperH > 0) {
                    const wStr = parseFloat(paperW.toFixed(3)).toString();
                    const hStr = parseFloat(paperH.toFixed(3)).toString();
                    lines.push({ label: 'Paper Size', value: `${wStr}${sufTight}W × ${hStr}${sufTight}H` });
                }
                lines.push({ label: 'White Border', value: `${fmt(fauxBorder)}${sufLoose}AA` });
            }
        }
    }

    // Production attributes
    if (mountLine) lines.push({ label: 'Mount', value: mountLine });
    if ((r.hardware || '').trim()) lines.push({ label: 'Hardware', value: r.hardware.trim() });
    // Glass is not meaningful for canvas products
    if (!isC && !isFL && (r.glass || '').trim()) {
        lines.push({ label: 'Glass', value: r.glass.trim() });
    }

    // Physical: rigid panel behind the artwork providing structural support.
    // Called "Backing Board" across all current product types. The internal
    // data field is `backing` (no rename — internal stability) but the user-
    // facing label in dashboard, CSV, and spec block all read "Backing Board"
    // for consistency.
    if (substrateLine) {
        lines.push({ label: 'Backing Board', value: substrateLine });
    }

    // Notes (if user typed something — auto-fill is intentionally skipped per
    // latest decision; designers add production notes by hand in InDesign)
    if (notesLine) lines.push({ label: 'Notes', value: notesLine });

    // Art / Overall dimensions are added by the InDesign script using the
    // computed Art Size W/H and Overall Width/Height columns from the CSV
    // (unit conversion happens there). We don't include them here so the
    // unit-conversion logic stays in the JSX where the user picks IN vs CM.

    // Legacy single-string matboard for backward compat with old InDesign scripts
    // that read the "Matboard Description" column directly. Preserves the old
    // packed-into-one-line format. New scripts use the lines array instead.
    let matboard = '';
    if (isFM) {
        const edgeWord = (r.sbPaperEdge === 'torn') ? 'Deckled' : 'Straight Cut';
        const borderVal = parseFloat(r.sbPaperBorder) || 0;
        let inner = `${edgeWord} Edge Paper`;
        if (borderVal > 0) inner += `, ${fmt(borderVal)}" White Border`;
        matboard = `Float Mounted (${inner})`;
        const backerName = (r.sbBackerColorName || '').trim();
        const lc = backerName.toLowerCase();
        const isDefaultBacker = (
            !backerName ||
            lc === 'b 97 white' || lc === 'b97 white' ||
            lc === 'b 97 polar white' || lc === 'b97 polar white' ||
            lc === 'white'
        );
        if (!isDefaultBacker) matboard += ` on ${backerName} Backer`;
    }

    return { application, matboard, lines };
}

// Build the project CSV as a string. Returns the full CSV text without
// triggering any download. Used by both:
//   - exportDashCSV (single CSV download)
//   - batchDownloadAllFramesAsZip (CSV inside a ZIP)
// The split exists so the ZIP path can capture the CSV bytes without going
// through a synthetic <a> click.
function buildDashCSVString() {
    const g = (id) => document.getElementById(id).value; const u = ` (${dashUnit})`;

    // Helper: format a number for output, blank string for zero/missing.
    // Used to suppress 0 values in optional dimensional fields (rabbet, frame height, etc.)
    // so the CSV reads cleanly when the team hasn't filled them in yet.
    const numOrBlank = (v) => {
        const n = parseFloat(v);
        return (isNaN(n) || n === 0) ? '' : dashFmt(n);
    };

    // Composite Mat Code-Color cell. Single mat: "B 97 Polar White".
    // Double mat: "B 97 Polar White (w/ 0.25" Black reveal)" — Mat 2 squeezed
    // into the same cell since the colleagues' Excel template doesn't have a
    // separate Mat 2 column.
    const buildMatCell = (r, matsHidden) => {
        if (matsHidden || r.m1A === false) return '';
        const m1 = (r.m1ColorName || '').trim();
        if (r.m2A && r.m2 > 0) {
            const m2v = (r.m2 % 1 === 0) ? parseFloat(r.m2).toFixed(0) : dashFmt(r.m2);
            const m2Name = (r.m2ColorName || '').trim();
            return `${m1} (w/ ${m2v}" ${m2Name} reveal)`;
        }
        return m1;
    };

    // Composite Frame Code-Color cell: "MICH-41-12 / Black Maple".
    // If color name is missing, just return the code. If code is missing, just the color.
    const buildFrameCell = (r) => {
        const code = (r.fCode || '').trim();
        const color = (r.fColorName || '').trim();
        if (code && color) return `${code} / ${color}`;
        return code || color || '';
    };

    // Composite Paper Type cell: "Fine Art Paper / Straight Cut" or "Fine Art Paper / Deckled Edge".
    // Only meaningful when float mount is active. Empty for other products.
    // Paper Type cell. Used for any product where the print has a meaningful
    // paper description: float mount AND faux mat. Composes:
    //   <paperType> / <edge style>
    // Edge is always "Straight Cut" for faux mat (the paper is hidden under
    // the mat and isn't deckled). Float mount respects the user's edge toggle.
    const buildPaperTypeCell = (r, iFM, isFauxMat) => {
        if (!iFM && !isFauxMat) return '';
        const base = (r.paperType || 'Fine Art Paper').trim();
        const edge = (iFM && r.sbPaperEdge === 'torn') ? 'Deckled Edge' : 'Straight Cut';
        return `${base} / ${edge}`;
    };

    // CSV header — matches the colleagues' Excel template column order.
    // Visible columns come first; the last block (Application / Matboard Description / hex codes /
    // Image_Filename) is for InDesign script + backend use and can be hidden in Excel.
    let csv = `,RFI,PROJECT NAME,${g('g_projName')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,DESCRIPTION,${g('g_desc')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,DATE,${g('g_date')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,ISSUED BY,${g('g_issued')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,CLIENT NAME,${g('g_client')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,Attn:,${g('g_attn')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,Delivery,${g('g_delivery')},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n\n` +
        `Qty,ITEM CODE,PRODUCT,LOCATION,Image code,` +
        `Overall Width${u},Overall Height${u},` +
        `Art Size W${u},Art Size H${u},` +
        `Image Size W${u},Image Size H${u},` +
        `Canvas Stretcher Depth${u},Canvas Image Wrap${u},` +
        `Mat Code-Color,Mat Top,Mat Right,Mat Bottom,Mat Left,` +
        `Glass,` +
        `Paper Type,Paper Size W${u},Paper Size H${u},White Border AA${u},` +
        `Frame Code-Color,Frame (Width)${u},Frame (Height)${u},` +
        `Security Hardware,Backing Board,Mount,Notes,Production Notes,` +
        // — End visible columns. Below this point: InDesign helpers + backend data. —
        `Artist,Artwork Title,Art Type,Rabbet Depth${u},` +
        `Application,Matboard Description,Spec Lines,` +
        `FM Backer Name,FM Backer Hex,FM Paper Name,FM Paper Hex,FM Paper Edge,FM Paper Margin${u},Frame Code,Frame Color Name,Frame Color Hex,` +
        `Image_Filename,` +
        // — Raw-inch canonical columns for InDesign unit-independent processing —
        // These mirror the dimensions that get baked into spec lines, but always
        // in inches regardless of the dashboard unit. The InDesign script reads
        // these to rebuild Frame Size / Mat 1 / Mat 2 / Paper Size / White Border
        // in whatever output unit the user picks, so one CSV can be re-rendered
        // in any of IN/CM/MM cleanly.
        `RAW Frame W (in),RAW Frame H (in),RAW Rabbet (in),` +
        `RAW Frame Face W (in),` +
        `RAW Mat T (in),RAW Mat B (in),RAW Mat L (in),RAW Mat R (in),` +
        `RAW Mat 2 Reveal (in),` +
        `RAW Paper W (in),RAW Paper H (in),RAW White Border (in),` +
        `RAW Float Reveal (in),RAW Stretcher Depth (in)\n`;

    dashProjectData.forEach(r => {
        // Factor to convert this row's display values back to inches.
        // Used for the RAW columns at the end of the row so InDesign can
        // re-render in any output unit without unit-suffix parsing.
        const _toIn = unitFactor(dashUnit, 'in');

        const iC = (r.product === "Framed Canvas (Floater)");
        const iFL = (r.product === "Frameless Canvas (Wrapped)");
        const iFM = !iC && !iFL && (r.useFloatMount === true);
        const matsHidden = iC || iFL || iFM;
        const mT = (r.m1A !== false && !matsHidden) ? r.m1T : 0;
        const mB = (r.m1A !== false && !matsHidden) ? r.m1B : 0;
        const mL = (r.m1A !== false && !matsHidden) ? r.m1L : 0;
        const mR = (r.m1A !== false && !matsHidden) ? r.m1R : 0;
        const m2 = (r.m2A && !matsHidden) ? r.m2 : 0;
        const insetVal = iC ? (parseFloat(r.floaterInset) || 0.75) : 0;
        const sbPM = iFM ? (parseFloat(r.sbPaperMargin) || 0) : 0;
        const sbPB = iFM ? (parseFloat(r.sbPaperBorder) || 0) : 0;

        // Art size (visible artwork) per product.
        let artW, artH;
        if (iC) { artW = r.extW - insetVal*2; artH = r.extH - insetVal*2; }
        else if (iFL) { artW = r.extW; artH = r.extH; }
        else if (iFM) { artW = r.extW - (r.fW*2) - sbPM*2 - sbPB*2; artH = r.extH - (r.fW*2) - sbPM*2 - sbPB*2; }
        else { artW = r.extW - (r.fW*2) - mL - mR - (m2*2); artH = r.extH - (r.fW*2) - mT - mB - (m2*2); }

        // Image size (print file). Floater: art-only. Frameless: art + wrap×2. Other: art + bleed×2.
        let imgW, imgH;
        if (iC) { imgW = artW; imgH = artH; }
        else if (iFL) {
            const wrap = parseFloat(r.canvasWrap) || 0;
            imgW = artW + wrap*2; imgH = artH + wrap*2;
        }
        else { imgW = artW + (r.bleed*2); imgH = artH + (r.bleed*2); }

        // Paper Size: covers BOTH float mount AND faux mat (mat-mode print w/ border).
        //   Float mount: paperSize = imageSize + whiteBorder × 2
        //   Faux Mat:    paperSize = imageSize + fauxBorder × 2 (same math, different semantic)
        //   Where imageSize is the visible artwork (artW, artH).
        // When border = 0, paperSize = artW (image fills paper edge-to-edge).
        const isFauxMat = !iC && !iFL && !iFM && r.useFauxMat === true;
        const whiteBorder = iFM ? sbPB : (isFauxMat ? (parseFloat(r.sbPaperBorder) || 0) : 0);
        const paperSizeW = (iFM || isFauxMat) ? (artW + whiteBorder * 2) : 0;
        const paperSizeH = (iFM || isFauxMat) ? (artH + whiteBorder * 2) : 0;

        // Composite cells
        const matCell = buildMatCell(r, matsHidden);
        const frameCell = buildFrameCell(r);
        const paperTypeCell = buildPaperTypeCell(r, iFM, isFauxMat);

        // Pre-formatted spec strings for InDesign auto-spec script consumption
        const specs = buildSpecStrings(r);

        const d = [
            // Visible columns —
            r.qty, r.id, r.product, r.location, r.imageCode,
            dashFmt(r.extW), dashFmt(r.extH),
            dashFmt(Math.max(0, artW)), dashFmt(Math.max(0, artH)),
            dashFmt(Math.max(0, imgW)), dashFmt(Math.max(0, imgH)),
            // Canvas columns filtered by product: only emit values for actual
            // canvas products. Without this, a row that visited canvas then
            // switched back to Framed Art would emit stale canvasDepth/Wrap
            // values from when the auto-fill set them to "2"/"2". Filtering at
            // export time keeps the row data intact (so the user can switch
            // back to canvas without re-typing) while keeping the CSV clean.
            (iC || iFL) ? (r.canvasDepth ? dashFmt(r.canvasDepth) : '') : '',
            (iC || iFL) ? (r.canvasWrap ? dashFmt(r.canvasWrap) : '') : '',
            matCell,
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1T) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1R) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1B) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1L) : '',
            r.glass || '',
            paperTypeCell,
            (iFM || isFauxMat) ? dashFmt(Math.max(0, paperSizeW)) : '',
            (iFM || isFauxMat) ? dashFmt(Math.max(0, paperSizeH)) : '',
            (iFM || isFauxMat) ? dashFmt(whiteBorder) : '',
            // Frame columns filtered for Frameless Canvas: no frame applies,
            // so fW/fHeight/rabbet/frameCell are all empty regardless of
            // what's stored on the row from a previous product switch.
            // Floater is NOT filtered — it has a real frame around the canvas.
            iFL ? '' : frameCell,
            iFL ? '' : numOrBlank(r.fW),
            iFL ? '' : numOrBlank(r.fHeight),
            r.hardware || '',
            r.backing || '',
            r.mount || '',
            r.notes || '',
            r.prodNotes || '',
            // — Hidden / backend columns —
            r.artist || '',
            r.artworkTitle || '',
            r.artType || '',
            iFL ? '' : numOrBlank(r.rabbetDepth),
            specs.application,
            specs.matboard,
            JSON.stringify(specs.lines || []),
            iFM ? (r.sbBackerColorName || '') : '',
            iFM ? (r.sbBackerColorHex || '') : '',
            iFM ? (r.sbPaperColorName || '') : '',
            iFM ? (r.sbPaperColorHex || '') : '',
            iFM ? (r.sbPaperEdge || '') : '',
            iFM ? dashFmt(sbPM) : '',
            r.fCode || '',
            r.fColorName || '',
            r.fColor || '',
            buildPngFilename(r),
            // — Raw-inch canonical values. Each is the display value converted
            //   back to inches via unitFactor. Empty for fields that don't apply
            //   to this product (mats hidden for canvas, frame hidden for
            //   Frameless, paper for non-mount). —
            iFL ? '' : dashFmt((parseFloat(r.fW) || 0) * _toIn),
            iFL ? '' : dashFmt((parseFloat(r.fHeight) || 0) * _toIn),
            iFL ? '' : (r.rabbetDepth ? dashFmt(parseFloat(r.rabbetDepth) * _toIn) : ''),
            // Floater face width (the swatch's _f tag): the visible frame face
            // on a floater. Used by the InDesign spec script as the floater's
            // "Frame Size" width. Only floaters have it; blank otherwise.
            (iC && r._faceWidth !== undefined && r._faceWidth !== null && r._faceWidth !== '')
                ? dashFmt((parseFloat(r._faceWidth) || 0) * _toIn) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt((parseFloat(r.m1T) || 0) * _toIn) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt((parseFloat(r.m1B) || 0) * _toIn) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt((parseFloat(r.m1L) || 0) * _toIn) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt((parseFloat(r.m1R) || 0) * _toIn) : '',
            (r.m2A && !matsHidden) ? dashFmt((parseFloat(r.m2) || 0) * _toIn) : '',
            (iFM || isFauxMat) ? dashFmt(Math.max(0, paperSizeW) * _toIn) : '',
            (iFM || isFauxMat) ? dashFmt(Math.max(0, paperSizeH) * _toIn) : '',
            (iFM || isFauxMat) ? dashFmt(whiteBorder * _toIn) : '',
            // RAW Float Reveal (in): the air gap on a floater. Derived as
            // floaterInset - faceWidth when both known, else the studio default
            // 0.25". Always in inches so the script can render it in any unit.
            (function() {
                if (!iC) return '';
                const fi = parseFloat(r.floaterInset);
                const fwS = parseFloat(r._faceWidth);
                let revIn;
                if (!isNaN(fi) && !isNaN(fwS) && fi > fwS) {
                    revIn = (fi - fwS) * _toIn;   // display units → inches
                } else {
                    revIn = 0.25;                  // studio default, already inches
                }
                return dashFmt(revIn);
            })(),
            // RAW Stretcher Depth (in): canvas depth in inches (canvas products).
            (iC || iFL) ? (r.canvasDepth ? dashFmt(parseFloat(r.canvasDepth) * _toIn) : '') : ''
        ];
        csv += d.map(s => `"${String(s).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    return csv;
}

// Public download trigger. Builds the CSV string then triggers a save.
function exportDashCSV() {
    const csv = buildDashCSVString();
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `RFI_Project_Tracker.csv`;
    a.click();
}

function renderDashTable() {
    const tbody = document.getElementById('rfiBody'); tbody.innerHTML = '';

    // Empty state: when no frames have been added yet (or all deleted), show
    // a friendly hint row in the table spanning all columns. The + Add and
    // Import CSV buttons in the toolbar above remain clickable — this is
    // pure guidance, not a blocker.
    if (dashProjectData.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'dash-empty-row';
        emptyRow.innerHTML = `
            <td colspan="40" style="text-align:center; padding: 36px 20px; color: var(--text-muted);">
                <div style="display:inline-block; max-width: 380px;">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:32px; height:32px; opacity:0.55; margin-bottom:10px; color: var(--text-muted);"><rect x="4" y="6" width="16" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M4 10h16" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/></svg>
                    <h4 style="margin:0 0 6px; font-size: 0.85rem; color: var(--text-strong); font-weight:600;">No frames yet</h4>
                    <p style="margin:0; font-size: 0.72rem; line-height:1.45;">Click <strong style="color:var(--text-main);">+ Add</strong> in the toolbar to create your first frame, or <strong style="color:var(--text-main);">Import CSV</strong> to load an existing project.</p>
                </div>
            </td>
        `;
        tbody.appendChild(emptyRow);
        return;
    }

    dashProjectData.forEach((row, index) => {
        const isCanvas = (row.product === "Framed Canvas (Floater)");
        const isFrameless = (row.product === "Frameless Canvas (Wrapped)");
        const useFM = !isCanvas && !isFrameless && (row.useFloatMount === true);
        // Mats hidden for canvas products always; for non-canvas, hidden when float mount active.
        const matsHidden = isCanvas || isFrameless || useFM;
        const m1T = (row.m1A !== false && !matsHidden) ? row.m1T : 0;
        const m1B = (row.m1A !== false && !matsHidden) ? row.m1B : 0;
        const m1L = (row.m1A !== false && !matsHidden) ? row.m1L : 0;
        const m1R = (row.m1A !== false && !matsHidden) ? row.m1R : 0;
        const m2 = (row.m2A && !matsHidden) ? row.m2 : 0;
        const floaterInsetVal = isCanvas ? (parseFloat(row.floaterInset) || 0.75) : 0;
        const sbPaperMargin = useFM ? (parseFloat(row.sbPaperMargin) || 0) : 0;
        const sbPaperBorder = useFM ? (parseFloat(row.sbPaperBorder) || 0) : 0;

        let finalW, finalH;
        if (isCanvas) {
            finalW = row.extW - floaterInsetVal * 2;
            finalH = row.extH - floaterInsetVal * 2;
        } else if (isFrameless) {
            finalW = row.extW;
            finalH = row.extH;
        } else if (useFM) {
            finalW = row.extW - (row.fW * 2) - sbPaperMargin * 2 - sbPaperBorder * 2;
            finalH = row.extH - (row.fW * 2) - sbPaperMargin * 2 - sbPaperBorder * 2;
        } else {
            finalW = row.extW - (row.fW * 2) - m1L - m1R - (m2 * 2);
            finalH = row.extH - (row.fW * 2) - m1T - m1B - (m2 * 2);
        }
        // Print size: floater = canvas face (no bleed). Frameless = face + wrap×2 (image
        // wraps around stretcher bars). Float mount & regular = opening + bleed×2.
        let imgW, imgH;
        if (isCanvas) {
            imgW = dashFmt(Math.max(0, finalW)); imgH = dashFmt(Math.max(0, finalH));
        } else if (isFrameless) {
            const wrap = parseFloat(row.canvasWrap) || 0;
            imgW = dashFmt(Math.max(0, finalW) + wrap * 2);
            imgH = dashFmt(Math.max(0, finalH) + wrap * 2);
        } else {
            imgW = dashFmt(Math.max(0, finalW) + (row.bleed * 2));
            imgH = dashFmt(Math.max(0, finalH) + (row.bleed * 2));
        }
        
        const tr = document.createElement('tr');
        if (index === dashSelectedRowIndex) tr.className = 'selected';
        // If the row has constraint violations, mark it with a yellow indicator
        // and stash the messages on the title attribute (hover tooltip).
        const rowWarnings = validateRow(row);
        if (rowWarnings.length > 0) {
            tr.classList.add('constraint-warning-row');
            tr.title = rowWarnings.map(w => '⚠ ' + w.message).join('\n');
        }
        tr.addEventListener('click', (ev) => {
            // Don't intercept clicks meant for inputs/buttons/etc inside the row —
            // those need to focus the input or run their own onclick.
            const t = ev.target;
            if (t && t.matches && t.matches('input, textarea, select, button, [contenteditable]')) return;

            if (ev.shiftKey) {
                // Shift-click: select range from anchor to this row (inclusive).
                // Doesn't update the anchor — so repeated shift-clicks expand
                // from the original anchor, matching standard list selection UX.
                dashSelectRange(dashLastClickedIndex, index);
            } else if (ev.ctrlKey || ev.metaKey) {
                // Ctrl/Cmd-click: toggle this row in the multi-selection.
                // Updates the anchor so subsequent shift-clicks span from here.
                dashToggleMultiSelect(index);
                dashLastClickedIndex = index;
            } else {
                // Plain click: single-select, clear any multi-selection.
                if (dashSelectedRowIndex !== index) selectDashRow(index);
                dashMultiSelectedIndices.clear();
                dashLastClickedIndex = index;
                applyDashSelectionStyling();
            }
        });
        // Drag-to-reorder support. draggable=true on the tr enables the
        // browser's HTML5 drag API. data-row-idx stores the row's position
        // so the drag/drop handlers know which row to move. The handlers
        // themselves are wired up in renderDashTable's post-render loop
        // (see below).
        tr.draggable = true;
        tr.dataset.rowIdx = String(index);
        tr.addEventListener('mousedown', handleDashRowMouseDown);
        tr.addEventListener('dragstart', handleDashRowDragStart);
        tr.addEventListener('dragover', handleDashRowDragOver);
        tr.addEventListener('dragleave', handleDashRowDragLeave);
        tr.addEventListener('drop', handleDashRowDrop);
        tr.addEventListener('dragend', handleDashRowDragEnd);
        
        tr.innerHTML = `
            <td class="drag-handle-cell" title="Drag to reorder">
                ${svgMove}
            </td>
            <td><input class="tbl-in" type="number" value="${row.qty}" disabled style="width:30px; opacity:0.6; background:transparent;"></td>
            <td style="font-weight:bold;"><input class="tbl-in" type="text" value="${row.id}" oninput="dashHtIn(${index}, 'id', this.value, true)" ondragstart="event.preventDefault()" style="width:80px; font-weight:bold;"></td>
            <td><select class="tbl-in no-arrow" onchange="dashHtIn(${index}, 'product', this.value)">${FRAME_PRODUCTS.map(p => `<option ${row.product === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
            <td><input class="tbl-in" type="text" value="${row.location}" oninput="dashHtIn(${index}, 'location', this.value, true)" ondragstart="event.preventDefault()" style="width:90px;"></td>
            <td><input class="tbl-in" type="text" value="${row.imageCode}" oninput="dashHtIn(${index}, 'imageCode', this.value, true)" ondragstart="event.preventDefault()" style="width:200px;"></td>
            <td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.extW)}" oninput="dashHtIn(${index}, 'extW', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;"></td>
            <td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.extH)}" oninput="dashHtIn(${index}, 'extH', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;"></td>
            <td id="calc-openW-${index}" style="padding: 4px 8px; color:var(--accent); font-weight:bold;">${dashFmt(Math.max(0, finalW))}</td><td id="calc-openH-${index}" style="padding: 4px 8px; color:var(--accent); font-weight:bold;">${dashFmt(Math.max(0, finalH))}</td><td id="calc-printW-${index}" style="color:var(--accent); font-weight:bold; padding: 4px 8px;">${imgW}</td><td id="calc-printH-${index}" style="color:var(--accent); font-weight:bold; padding: 4px 8px;">${imgH}</td>
            <td><input class="tbl-in" type="number" step="0.125" value="${row.canvasDepth || ''}" oninput="dashHtIn(${index}, 'canvasDepth', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;"></td>
            <td><input class="tbl-in" type="number" step="0.125" value="${row.canvasWrap || ''}" oninput="dashHtIn(${index}, 'canvasWrap', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;"></td>
            <td><input class="tbl-in" type="text" value="${row.m1ColorName}" oninput="dashHtIn(${index}, 'm1ColorName', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td>
            <td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.m1T)}" oninput="dashHtIn(${index}, 'm1T', this.value, true)" ondragstart="event.preventDefault()" style="width:40px;"></td><td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.m1B)}" oninput="dashHtIn(${index}, 'm1B', this.value, true)" ondragstart="event.preventDefault()" style="width:40px;"></td><td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.m1L)}" oninput="dashHtIn(${index}, 'm1L', this.value, true)" ondragstart="event.preventDefault()" style="width:40px;"></td><td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.m1R)}" oninput="dashHtIn(${index}, 'm1R', this.value, true)" ondragstart="event.preventDefault()" style="width:40px;"></td>
            <td><input class="tbl-in" type="text" value="${row.m2ColorName}" oninput="dashHtIn(${index}, 'm2ColorName', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td>
            <td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.m2)}" oninput="dashHtIn(${index}, 'm2', this.value, true)" ondragstart="event.preventDefault()" style="width:40px;"></td>
            <td><input class="tbl-in" type="text" value="${row.glass}" oninput="dashHtIn(${index}, 'glass', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td>${(() => {
                if (!useFM) {
                    return `<td></td><td></td><td></td><td></td>`;
                }
                const edgeWord = (row.sbPaperEdge === 'torn') ? 'Deckled Edge' : 'Straight Cut';
                const paperTypeText = `${row.paperType || 'Fine Art Paper'} / ${edgeWord}`;
                const paperW = Math.max(0, finalW + sbPaperBorder * 2);
                const paperH = Math.max(0, finalH + sbPaperBorder * 2);
                return `<td style="font-size:0.7em;">${paperTypeText}</td>` +
                       `<td>${dashFmt(paperW)}</td>` +
                       `<td>${dashFmt(paperH)}</td>` +
                       `<td>${dashFmt(sbPaperBorder)}</td>`;
            })()}<td><input class="tbl-in" type="text" value="${row.fCode}" oninput="dashHtIn(${index}, 'fCode', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td><td><input class="tbl-in" type="number" step="0.125" value="${dashFmt(row.fW)}" oninput="dashHtIn(${index}, 'fW', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;"></td><td><input class="tbl-in" type="number" step="0.0625" value="${row.fHeight ? dashFmt(row.fHeight) : ''}" oninput="dashHtIn(${index}, 'fHeight', this.value, true)" ondragstart="event.preventDefault()" style="width:45px;" placeholder="depth"></td>
            <td><input class="tbl-in" type="text" value="${row.hardware}" oninput="dashHtIn(${index}, 'hardware', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td><td><input class="tbl-in" type="text" value="${row.backing}" oninput="dashHtIn(${index}, 'backing', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td><td><input class="tbl-in" type="text" value="${row.mount}" oninput="dashHtIn(${index}, 'mount', this.value, true)" ondragstart="event.preventDefault()" style="width:80px;"></td><td><input class="tbl-in" type="text" value="${row.notes}" oninput="dashHtIn(${index}, 'notes', this.value, true)" ondragstart="event.preventDefault()" style="width:90px;"></td><td><input class="tbl-in" type="text" value="${row.prodNotes}" oninput="dashHtIn(${index}, 'prodNotes', this.value, true)" ondragstart="event.preventDefault()" style="width:90px;"></td>
        `;
        tbody.appendChild(tr);
    });
    // Re-apply selection highlighting — the innerHTML rebuild above drops the
    // .selected / .multi-selected classes, so without this a table refresh
    // (e.g. after editing any field) visually clears a shift/ctrl selection
    // even though the selection set is still intact. This is what made
    // shift-select appear to "stop highlighting" after editing.
    applyDashSelectionStyling();
}

// ──────────────────────────────────────────────────────────────────────────
// DASHBOARD ROW DRAG-TO-REORDER
// ──────────────────────────────────────────────────────────────────────────
// HTML5 drag-and-drop on table rows. Drag any row up or down — a horizontal
// blue line appears on the target row showing where the drop will land
// (above or below depending on which half of the target the cursor is on).
// Releasing the drag moves the row in dashProjectData via reorderDashRow,
// which preserves the user's selection by object identity (so the same row
// stays "selected" before and after the move).
//
// Why drag the whole row vs just a handle: simpler interaction model, and
// the input fields already block dragstart via ondragstart="event.preventDefault()"
// so they remain editable without triggering accidental drags.

let _draggingDashRowIdx = null;

function handleDashRowDragStart(e) {
    // Defense-in-depth: even with the mousedown-based toggle below, also
    // bail here if the dragstart's target is somehow editable. The browser's
    // dragstart can fire with target=TR even when mousedown was on an input,
    // so the real fix is the mousedown handler — this is just a safety net.
    const t = e.target;
    if (t && t.matches) {
        const isEditable = t.matches('input, textarea, select, [contenteditable], [contenteditable=""], [contenteditable="true"]');
        if (isEditable) {
            e.preventDefault();
            return;
        }
    }
    _draggingDashRowIdx = parseInt(e.currentTarget.dataset.rowIdx, 10);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(_draggingDashRowIdx));
    // If the dragged row is part of the current selection, drag ALL selected
    // rows as a group — apply row-dragging to each so the user sees what
    // they're moving. If the dragged row is NOT selected, clear selection
    // and drag just this one (standard Finder/Explorer behavior).
    const selected = dashGetSelectedIndices();
    if (selected.includes(_draggingDashRowIdx) && selected.length > 1) {
        selected.forEach(i => {
            const tr = document.querySelector(`#rfiBody tr[data-row-idx="${i}"]`);
            if (tr) tr.classList.add('row-dragging');
        });
    } else {
        // Not part of multi-select — clear it so the drag affects only this row
        dashMultiSelectedIndices.clear();
        if (dashSelectedRowIndex !== _draggingDashRowIdx) {
            dashSelectedRowIndex = _draggingDashRowIdx;
            loadDashDataIntoControls(dashProjectData[_draggingDashRowIdx]);
        }
        applyDashSelectionStyling();
        e.currentTarget.classList.add('row-dragging');
    }
}

// On mousedown, if the user clicked on an editable element (input/textarea/
// select/contenteditable), temporarily disable the row's draggable attribute
// so the browser doesn't start a drag — text-selection-by-drag works normally.
// Restore draggable on mouseup or mouseleave.
//
// This is more reliable than checking dragstart's e.target because the
// browser's hit-testing between mousedown and dragstart can shift target
// to the TR even when the user pressed down on an input. The mousedown
// target is what they actually clicked, before any drag motion.
function handleDashRowMouseDown(e) {
    const t = e.target;
    if (!t || !t.matches) return;
    const isEditable = t.matches('input, textarea, select, [contenteditable], [contenteditable=""], [contenteditable="true"]');
    if (isEditable) {
        const tr = e.currentTarget;
        tr.draggable = false;
        // Restore after the click/drag interaction is over. We listen for
        // mouseup anywhere (in case user releases outside the row) and also
        // mouseleave on the row as a safety net.
        const restore = () => {
            tr.draggable = true;
            document.removeEventListener('mouseup', restore);
            tr.removeEventListener('mouseleave', restore);
        };
        document.addEventListener('mouseup', restore);
        tr.addEventListener('mouseleave', restore);
    }
}

function handleDashRowDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.currentTarget;
    const targetIdx = parseInt(row.dataset.rowIdx, 10);
    if (targetIdx === _draggingDashRowIdx) return;
    // Decide above-or-below based on cursor position vs row vertical midpoint
    const rect = row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropAbove = e.clientY < midY;
    // Clear all existing drop indicators, then set the right one on target
    document.querySelectorAll('#rfiBody tr.drop-above, #rfiBody tr.drop-below')
        .forEach(t => t.classList.remove('drop-above', 'drop-below'));
    row.classList.add(dropAbove ? 'drop-above' : 'drop-below');
}

function handleDashRowDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drop-above', 'drop-below');
    }
}

function handleDashRowDrop(e) {
    e.preventDefault();
    const targetRow = e.currentTarget;
    const targetIdx = parseInt(targetRow.dataset.rowIdx, 10);
    targetRow.classList.remove('drop-above', 'drop-below');
    if (_draggingDashRowIdx === null) return;
    const rect = targetRow.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropAbove = e.clientY < midY;
    const insertBefore = dropAbove ? targetIdx : targetIdx + 1;

    // If the dragged row is part of a multi-selection (>1 rows), move them
    // all as a group preserving their internal order. Otherwise move just
    // the single dragged row.
    const selected = dashGetSelectedIndices();
    if (selected.includes(_draggingDashRowIdx) && selected.length > 1) {
        // Don't drop into the selection block
        if (selected.includes(targetIdx)) return;
        reorderDashRows(selected, insertBefore);
    } else {
        if (_draggingDashRowIdx === targetIdx) return;
        let insertIdx = insertBefore;
        if (_draggingDashRowIdx < insertIdx) insertIdx--;
        reorderDashRow(_draggingDashRowIdx, insertIdx);
    }
}

function handleDashRowDragEnd(e) {
    // Clear row-dragging from ALL rows (group drag could have applied it to many)
    document.querySelectorAll('#rfiBody tr.row-dragging')
        .forEach(t => t.classList.remove('row-dragging'));
    document.querySelectorAll('#rfiBody tr.drop-above, #rfiBody tr.drop-below')
        .forEach(t => t.classList.remove('drop-above', 'drop-below'));
    _draggingDashRowIdx = null;
}

// Move the dashboard row at `fromIdx` to `toIdx`. Preserves the selection
// by tracking row identity (not index). Pushes history so the reorder is
// undoable. The dashboard rows are referenced externally by .id, not index,
// so no other state needs fixing up.
function reorderDashRow(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= dashProjectData.length) return;
    if (toIdx < 0 || toIdx >= dashProjectData.length) return;
    // Remember which row was selected by identity so the selection follows
    // the move (or stays put if a different row was selected).
    const selectedRow = dashProjectData[dashSelectedRowIndex];
    const [moved] = dashProjectData.splice(fromIdx, 1);
    dashProjectData.splice(toIdx, 0, moved);
    // Restore selection by identity
    const newSelectedIdx = dashProjectData.indexOf(selectedRow);
    if (newSelectedIdx >= 0) dashSelectedRowIndex = newSelectedIdx;
    renderDashTable();
    pushHistory();
}

// Move multiple rows (by their CURRENT indices) to a new position. The rows
// are moved as a contiguous block in their original relative order. The
// target position is given in CURRENT indexing (where to insert "before"
// counting from the unmoved array). After the move, the same rows remain
// selected (multi-select preserved by row identity).
//
// Implementation: pull the selected rows out of the array (captured by
// identity), compute the insert index after removal accounting for which
// of the removed rows came before the target, then splice them back in.
function reorderDashRows(indices, insertBefore) {
    if (!indices || indices.length === 0) return;
    // Sort ascending so the slice/splice math is straightforward
    const sortedIdx = [...indices].sort((a, b) => a - b);

    // Capture the row objects by identity (so we can find them after splice)
    const movingRows = sortedIdx.map(i => dashProjectData[i]);
    const primaryRow = dashProjectData[dashSelectedRowIndex];

    // Adjust insertBefore: every selected row before insertBefore shifts the
    // target down by one when we remove them.
    let adjustedInsert = insertBefore;
    for (const i of sortedIdx) {
        if (i < insertBefore) adjustedInsert--;
    }

    // Remove the selected rows (descending so indices stay valid)
    for (let i = sortedIdx.length - 1; i >= 0; i--) {
        dashProjectData.splice(sortedIdx[i], 1);
    }
    // Insert the block at the adjusted position
    dashProjectData.splice(adjustedInsert, 0, ...movingRows);

    // Restore primary + multi selection by identity
    const newPrimary = dashProjectData.indexOf(primaryRow);
    if (newPrimary >= 0) dashSelectedRowIndex = newPrimary;
    dashMultiSelectedIndices.clear();
    movingRows.forEach(r => {
        const i = dashProjectData.indexOf(r);
        if (i >= 0 && i !== dashSelectedRowIndex) dashMultiSelectedIndices.add(i);
    });

    renderDashTable();
    pushHistory();
}

// =========================================================================
// VIEW 2: ELEVATION LOGIC
// =========================================================================
function getElevLetter(index) { let res = ""; let curr = index; while (curr >= 0) { res = String.fromCharCode((curr % 26) + 65) + res; curr = Math.floor(curr / 26) - 1; } return res; }
function updateElevZoom(val) { elevZoomFactor = parseFloat(val); drawElevAll(); }
function fitElevZoom() { elevZoomFactor = 1; document.getElementById('zoomSlider').value = 1; drawElevAll(); }
function updateElevWall() {
    elevations[currentElevIndex].wallW = parseFloat(document.getElementById('wallW').value) || 185;
    elevations[currentElevIndex].wallH = parseFloat(document.getElementById('wallH').value) || 108;
    drawElevAll();
}
function updateDimFontSize() {
    // The dedicated elevDimFontSize input was merged into the Label &
    // Dimension Style section (annotFontSize). If the old input still exists
    // (older cached HTML), honor it; otherwise the font size is driven by
    // annotationStyle via applyAnnotationStyleToCSSVars().
    const el = document.getElementById('elevDimFontSize');
    if (el) {
        document.documentElement.style.setProperty('--dim-font-size', (el.value || 12) + 'px');
    } else if (typeof applyAnnotationStyleToCSSVars === 'function') {
        applyAnnotationStyleToCSSVars();
    }
}

function autoElevRelabel() {
    let sortedFrames = [...elevFrames].sort((a, b) => a.x - b.x);
    let letterMap = {};
    sortedFrames.forEach((f, i) => { letterMap[f.letter] = getElevLetter(i); f.letter = getElevLetter(i); });
    sortedFrames.forEach(f => { if (f.dimTo && f.dimTo.length > 0) f.dimTo = f.dimTo.map(t => letterMap[t] || t); });
    elevFrames = sortedFrames;
    // CRITICAL: also assign the sorted array back into the elevation's stored
    // .frames slot, otherwise switching views will overwrite elevFrames from
    // the stale unsorted reference and lose the sort. This was the bug behind
    // "Sort A-Z gets undone after switching views and coming back."
    if (elevations[currentElevIndex]) elevations[currentElevIndex].frames = sortedFrames;
    initElevControls(); drawElevAll();
    pushHistory();
}

// ──────────────────────────────────────────────────────────────────────────
// ITEM CODE EDITING (from the elevation panel)
// ──────────────────────────────────────────────────────────────────────────
// Two entry points:
//   - renameFrameId: single-frame rename triggered by the inline input under
//     each panel row. User types a new code → it's applied to the underlying
//     dashboard row (which propagates everywhere by id reference).
//   - renumberElevation: bulk re-number all frames in the active elevation
//     using a template like "ART.{LOC}-{LET}". Optionally reorders the
//     dashboard rows to match the elevation's letter order.
//
// Both functions share the same invariant: ITEM CODE is a property of the
// dashboard row. Frames in elevations reference the row by id. So renaming
// the row's id requires updating every frame in every elevation that
// referenced the OLD id. The dashboard row itself is the single source of
// truth; we keep all frame.id references in sync.

// Apply a single rename from the inline editor input.
// inputEl is the <input>; idx is the frame's index in elevFrames.
function renameFrameId(inputEl, idx) {
    const newId = (inputEl.value || '').trim();
    const oldId = inputEl.dataset.originalId;
    if (!newId || newId === oldId) {
        inputEl.value = oldId;  // restore if blank
        return;
    }
    // Collision check: is newId already used by a DIFFERENT dashboard row?
    const collidingRow = dashProjectData.find(r => r.id === newId && r.id !== oldId);
    if (collidingRow) {
        showInfoModal(
            'Code already in use',
            `"${newId}" is already used by another dashboard row. Pick a different code, or delete the conflicting row first.`
        );
        inputEl.value = oldId;
        return;
    }
    applyIdRename(oldId, newId);
    inputEl.dataset.originalId = newId;
    pushHistory();
}

// Core rename: update the dashboard row's id + every frame.id reference in
// every elevation. Caller is responsible for collision-checking and for
// pushing history.
function applyIdRename(oldId, newId) {
    if (oldId === newId) return;
    // Rename in dashboard
    const dashRow = dashProjectData.find(r => r.id === oldId);
    if (dashRow) dashRow.id = newId;
    // Update every elevation's frame references
    elevations.forEach(elev => {
        elev.frames.forEach(f => { if (f.id === oldId) f.id = newId; });
    });
    // Re-render to show the change
    initElevControls();
    drawElevAll();
    if (currentView === 'dashboard') renderDashTable();
    populateDashPushSelector();
}

// Bulk re-number all frames in the current elevation following a template.
// Default template: "ART.{LOC}-{LET}" where {LOC} is a 3-digit location
// number (padded) and {LET} is the frame's elevation letter (A, B, C...).
//
// Two passes to avoid temporary collisions during the rename:
//   1. Rename everything to a temporary unique prefix ("__TMP_<idx>__")
//   2. Rename from temp → final code
// This way if the final code "ART.001-A" happens to match another existing
// id mid-rename, we won't trip the collision check.
//
// If reorderDashboard is true, also reorders dashProjectData so the
// re-numbered rows appear contiguously at the top in elevation letter order.
function renumberElevation(template, locValue, reorderDashboard) {
    if (!elevFrames || elevFrames.length === 0) return;
    template = template || 'ART.{LOC}-{LET}';
    const locStr = String(locValue || '001').padStart(3, '0');

    // Compute the target id for each frame based on its current letter.
    // We sort by letter so the iteration order is deterministic (A, B, C...).
    // The output map preserves original order for the reorder step.
    const sortedFrames = [...elevFrames].sort((a, b) => {
        const la = a.letter || '', lb = b.letter || '';
        if (la.length !== lb.length) return la.length - lb.length;
        return la < lb ? -1 : la > lb ? 1 : 0;
    });

    // Build the rename plan: [{oldId, newId}, ...]
    const plan = sortedFrames.map(f => ({
        oldId: f.id,
        newId: template.replace('{LOC}', locStr).replace('{LET}', f.letter || ''),
        letter: f.letter,
    }));

    // Validate: any duplicate newIds in the plan itself?
    const seen = new Set();
    for (const p of plan) {
        if (seen.has(p.newId)) {
            showInfoModal(
                'Template Produces Duplicate Codes',
                `The template "${template}" with location "${locStr}" would produce duplicate codes (e.g. "${p.newId}"). Try a template that includes {LET} so each frame gets a unique suffix.`
            );
            return;
        }
        seen.add(p.newId);
    }

    // Validate: any newIds that collide with EXISTING dashboard rows not in
    // this elevation? (Frames already in this elevation are OK — they're
    // the ones being renamed.)
    const frameIdsInThisElev = new Set(elevFrames.map(f => f.id));
    for (const p of plan) {
        // Skip if this code is one we're currently renaming away from
        if (frameIdsInThisElev.has(p.newId)) continue;
        // Skip if newId is the row's own oldId (no real change)
        if (p.newId === p.oldId) continue;
        // Otherwise check the dashboard
        if (dashProjectData.some(r => r.id === p.newId)) {
            showInfoModal(
                'Code Conflict',
                `"${p.newId}" is already used by a dashboard row outside this elevation. Pick a different location number or delete the conflicting row first.`
            );
            return;
        }
    }

    // Two-pass rename. Pass 1: every frame → unique temp id.
    // Capturing stamp ONCE outside the loop is critical — each Date.now()
    // call returns a different value, which would mean pass 1 writes to one
    // temp id and pass 2 looks for a different one. Single stamp ensures
    // pass 1's outputs are exactly what pass 2 reads.
    const stamp = Date.now();
    plan.forEach((p, i) => {
        applyIdRename(p.oldId, `__RNTMP_${i}_${stamp}__`);
    });
    // Pass 2: temp id → final newId.
    plan.forEach((p, i) => {
        applyIdRename(`__RNTMP_${i}_${stamp}__`, p.newId);
    });

    // Optional: reorder dashboard rows so the re-numbered ones are contiguous
    // at the top of the table in elevation letter order. Preserves the
    // selection by identity.
    if (reorderDashboard) {
        const reorderedIds = plan.map(p => p.newId);
        const selectedRow = dashProjectData[dashSelectedRowIndex];
        // Partition: rows in our plan (in plan order), then everything else
        // in its current relative order.
        const inPlan = [];
        const rest = [];
        dashProjectData.forEach(row => {
            const idx = reorderedIds.indexOf(row.id);
            if (idx >= 0) inPlan[idx] = row;
            else rest.push(row);
        });
        // Filter out any undefined gaps (defensive — every reorderedId
        // should resolve to a row, but just in case)
        const ordered = inPlan.filter(Boolean);
        dashProjectData.length = 0;
        ordered.forEach(r => dashProjectData.push(r));
        rest.forEach(r => dashProjectData.push(r));
        // Restore selection by identity
        const newIdx = dashProjectData.indexOf(selectedRow);
        if (newIdx >= 0) dashSelectedRowIndex = newIdx;
        if (currentView === 'dashboard') renderDashTable();
    }

    pushHistory();
}

// Modal: open with sensible defaults. Location defaults to the current
// elevation's index + 1 (so wall 1 = "001", wall 2 = "002") padded to 3 digits.
function openRenumberModal() {
    if (currentView !== 'elevation' || !elevFrames || elevFrames.length === 0) {
        showInfoModal('Nothing to re-number', 'Add some frames to this elevation first, then come back to this button.');
        return;
    }
    const defaultLoc = String((currentElevIndex || 0) + 1).padStart(3, '0');
    document.getElementById('renumberLoc').value = defaultLoc;
    // Don't reset template — let it persist across opens so a project's
    // chosen convention sticks
    if (!document.getElementById('renumberTemplate').value) {
        document.getElementById('renumberTemplate').value = 'ART.{LOC}-{LET}';
    }
    document.getElementById('renumberReorderDash').checked = true;
    updateRenumberPreview();
    document.getElementById('renumberModal').style.display = 'flex';
}

// Refresh the preview area based on current template + location inputs.
// Shows each frame's letter → resulting ITEM CODE, one line per frame.
function updateRenumberPreview() {
    const tmpl = document.getElementById('renumberTemplate').value || 'ART.{LOC}-{LET}';
    const locRaw = document.getElementById('renumberLoc').value || '';
    // Pad if pure-numeric, otherwise leave as-is (lets user put alpha codes like "LBY")
    const loc = /^\d+$/.test(locRaw) ? locRaw.padStart(3, '0') : locRaw;
    const sortedFrames = [...elevFrames].sort((a, b) => {
        const la = a.letter || '', lb = b.letter || '';
        if (la.length !== lb.length) return la.length - lb.length;
        return la < lb ? -1 : la > lb ? 1 : 0;
    });
    const lines = sortedFrames.map(f => {
        const newId = tmpl.replace('{LOC}', loc).replace('{LET}', f.letter || '');
        return `${f.letter || '?'}: <strong>${f.id}</strong> → <strong style="color:var(--accent);">${newId}</strong>`;
    });
    document.getElementById('renumberPreview').innerHTML = lines.join('<br>');
}

// Read modal inputs and run renumberElevation. Closes the modal on success.
function applyRenumber() {
    const tmpl = document.getElementById('renumberTemplate').value || 'ART.{LOC}-{LET}';
    const loc = document.getElementById('renumberLoc').value || '001';
    const reorder = document.getElementById('renumberReorderDash').checked;
    document.getElementById('renumberModal').style.display = 'none';
    renumberElevation(tmpl, loc, reorder);
}

function initElevControls() {
    const container = document.getElementById('frame-controls');
    // Empty state: when no frames are placed yet on this elevation, show a
    // helpful hint about the dashboard→elevation workflow. The container is
    // re-populated on every state change, so this hint auto-clears the
    // moment the user adds a frame. The message is intentionally compact
    // since the panel sidebar is narrow.
    if (elevFrames.length === 0) {
        container.innerHTML = `
            <div class="elev-empty-state">
                <svg class="svg-icon elev-empty-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
                <h4>No frames on this wall yet</h4>
                <p>Build frames in the <strong>Frame Dashboard</strong>, then use <strong>Push to Wall</strong> to send them here.</p>
                <p class="elev-empty-tip">Or click <strong>+ Add</strong> above to place a generic frame and customize it inline.</p>
            </div>
        `;
        return;
    }
    let html = ``;
    // Render rows sorted by letter (A, B, C, D, ...) regardless of the
    // underlying elevFrames array order. This decouples panel order from
    // array storage order — important because various code paths can leave
    // the array order desynced from letter order (e.g. after some sequences
    // of sort + view switch + edit). The original index is preserved as
    // `idx` so event handlers (which look up elevFrames[idx]) still work.
    const renderOrder = elevFrames
        .map((f, idx) => ({ f, idx }))
        .sort((a, b) => {
            // Letter comparison handles single-letter (A < B) and multi-letter
            // labels (Z < AA) by length-then-string sort.
            const la = a.f.letter || '';
            const lb = b.f.letter || '';
            if (la.length !== lb.length) return la.length - lb.length;
            return la < lb ? -1 : la > lb ? 1 : 0;
        });
    renderOrder.forEach(({ f, idx }) => {
        const activeNeighbors = elevFrames.filter(n => n.letter !== f.letter && n.active).slice().sort((a, b) => {
            const la = a.letter || '';
            const lb = b.letter || '';
            if (la.length !== lb.length) return la.length - lb.length;
            return la < lb ? -1 : la > lb ? 1 : 0;
        });
        const targetButtons = activeNeighbors.map(n => `<button class="toggle-status ${f.dimTo.includes(n.letter)?'active':''}" style="padding:1px 3px; font-size:8px; border-radius:2px;" onclick="toggleElevDimTarget(${idx}, '${n.letter}', event)">${n.letter}</button>`).join('');

        // 4 distance-dim icon buttons: ↑ ceiling, ↓ floor, ← left wall, → right wall.
        // Tiny so they fit alongside the existing letter targets. Tooltips clarify.
        // distToggles is per-frame state — default false, persists with the frame.
        const dt = f.distToggles || { ceiling: false, floor: false, left: false, right: false };

        // data-frame-letter attaches the letter for hover pairing — pure-CSS hover
        // wouldn't work since the elements aren't siblings in the DOM, so we use
        // JS event handlers (added after render) that look up the matching panel
        // / frame by this attribute.
        //
        // Layout: distance dim toggles sit at the LEFT END of the icon row,
        // styled as icon-btn (same as Move/Edit/Duplicate/Remove). Active state
        // uses .active class on icon-btn which matches the .grouped treatment
        // (accent background, white arrow). Tooltips use the consistent
        // "Distance to <wall>" pattern.
        // Count of active edge-gap toggles — used for the indicator dot on
        // the collapsed edge-gap button. Showing the count instead of just
        // a binary on/off makes it possible to glance at the row and see
        // "ah, this frame has 2 distance dims set."
        const dtActiveCount = (dt.ceiling?1:0) + (dt.floor?1:0) + (dt.left?1:0) + (dt.right?1:0);
        html += `
            <div class="compact-frame-item" data-frame-letter="${f.letter}">
                <div class="frame-item-top-row">
                    <div class="frame-item-label">
                        <span class="frame-letter-large">${f.letter}</span>
                    </div>
                    <div class="frame-item-icons">
                        <!-- ITEM CODE — matches header item-code column via shared grid template. -->
                        <div class="frame-col">
                            <input type="text" class="frame-item-id frame-item-id-edit frame-item-id-inline"
                                   value="${f.id}"
                                   data-original-id="${f.id}"
                                   onchange="renameFrameId(this, ${idx})"
                                   onclick="event.stopPropagation()"
                                   ondragstart="event.preventDefault()"
                                   title="Edit ITEM CODE — applies to all elevations using this frame">
                        </div>
                        <!-- WALL ALIGN — 2 sub-buttons inside this column. -->
                        <div class="frame-col" style="gap:0; flex-direction:row;">
                            <div style="width:26px; display:flex; justify-content:center;">
                                <button class="icon-btn" title="Snap to Hang Height" onclick="snapFrameToHang(${idx}, event)">${svgSnapHang}</button>
                            </div>
                            <div style="width:26px; display:flex; justify-content:center;">
                                <button class="icon-btn" title="Snap to Wall Center" onclick="snapFrameToWallCenter(${idx}, event)">${svgSnapWallCenter}</button>
                            </div>
                        </div>
                        <!-- EDGE GAP collapsed: opens popover. -->
                        <div class="frame-col">
                            <button class="icon-btn edge-gap-trigger ${dtActiveCount>0?'has-active':''}" title="Edge Gap — distance to wall edges" onclick="openEdgeGapPopover(${idx}, this, event)">
                                ${svgEdgeGap}
                                ${dtActiveCount>0 ? `<span class="edge-gap-badge">${dtActiveCount}</span>` : ''}
                            </button>
                        </div>
                        <!-- Toggle (active on/off). -->
                        <div class="frame-col">
                            <button class="pill-toggle ${f.active?'active':''}" title="${f.active?'Hide on elevation':'Show on elevation'}" onclick="toggleElevActive(${idx}, event)">
                                <span class="pill-toggle-knob"></span>
                            </button>
                        </div>
                        <!-- Move/Group. -->
                        <div class="frame-col">
                            <button class="icon-btn ${f.isGrouped ? 'grouped' : ''}" title="Move/Group" onclick="toggleElevGroup(${idx}, event)">${svgMove}</button>
                        </div>
                        <!-- Edit. -->
                        <div class="frame-col">
                            <button class="icon-btn" title="Edit Master" onclick="jumpToDashboard('${f.id}')">${svgEdit}</button>
                        </div>
                        <!-- Dupe. -->
                        <div class="frame-col">
                            <button class="icon-btn" title="Duplicate" onclick="duplicateElevFrame(${idx}, event)">${svgDup}</button>
                        </div>
                        <!-- Del. -->
                        <div class="frame-col">
                            <button class="icon-btn" title="Remove" onclick="removeElevFrame(${idx}, event)">${svgTrash}</button>
                        </div>
                    </div>
                </div>
                ${targetButtons ? `<div class="frame-item-targets-row"><span class="frame-item-targets-inline">${targetButtons}</span></div>` : ''}
            </div>`;
    });
    container.innerHTML = html;
    // Hover-pair wiring is done by drawElevAll after frame DOM is rendered,
    // since panels and frames need their events attached at the same time
    // and frame elements only exist after drawElevAll runs.

    // Sync global ON/OFF pill toggle in the column header. It's "active" only
    // when EVERY frame on this elevation is active; otherwise off (so that
    // clicking it flips ALL frames to a single uniform state).
    const globalToggle = document.getElementById('globalActiveToggle');
    if (globalToggle) {
        const allOn = elevFrames.length > 0 && elevFrames.every(f => f.active);
        globalToggle.classList.toggle('active', allOn);
    }
}

// Per-frame distance dimension toggle. Stores under f.distToggles[which].
// Re-renders both the panel (to flip active state) and the wall (to draw or
// hide the dim line).
function toggleFrameDistDim(idx, which, e) {
    e.stopPropagation();
    const f = elevFrames[idx];
    if (!f.distToggles) f.distToggles = { ceiling: false, floor: false, left: false, right: false };
    f.distToggles[which] = !f.distToggles[which];
    // If enabling, make sure edge-gap dims are visible so it shows.
    if (f.distToggles[which] && typeof dimVisibility !== 'undefined') {
        dimVisibility.edgeGap = true;
        saveDimVisibility();
    }
    initElevControls();
    drawElevAll();
    pushHistory();
}

// ──────────────────────────────────────────────────────────────────────────
// EDGE GAP POPOVER
// ──────────────────────────────────────────────────────────────────────────
// One global popover element, repositioned and repopulated each time it
// opens. Clicking a direction toggle inside the popover updates the canvas
// + the trigger's badge WITHOUT rebuilding the panel — so the popover stays
// open for fast multi-toggle workflows. Click outside or on the trigger
// again to close.
//
// State:
//   _edgeGapPopoverOpen: bool — whether the popover is currently shown
//   _edgeGapPopoverIdx:  frame index whose toggles the popover controls
//   _edgeGapPopoverTrigger: the button that opened it (for re-anchoring)

let _edgeGapPopoverOpen = false;
let _edgeGapPopoverIdx = null;
let _edgeGapPopoverTrigger = null;

function openEdgeGapPopover(idx, triggerBtn, e) {
    if (e) e.stopPropagation();
    // Toggle behavior: clicking the same trigger again closes the popover
    if (_edgeGapPopoverOpen && _edgeGapPopoverIdx === idx) {
        closeEdgeGapPopover();
        return;
    }
    _edgeGapPopoverIdx = idx;
    _edgeGapPopoverTrigger = triggerBtn;
    _edgeGapPopoverOpen = true;

    let pop = document.getElementById('edgeGapPopover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'edgeGapPopover';
        pop.className = 'edge-gap-popover';
        document.body.appendChild(pop);
    }
    renderEdgeGapPopover();
    positionEdgeGapPopover();
    // Bind outside-click dismissal on next tick so the current click doesn't
    // immediately dismiss the popover we just opened.
    setTimeout(() => {
        document.addEventListener('click', edgeGapPopoverOutsideClick, true);
    }, 0);
}

function closeEdgeGapPopover() {
    _edgeGapPopoverOpen = false;
    _edgeGapPopoverIdx = null;
    _edgeGapPopoverTrigger = null;
    const pop = document.getElementById('edgeGapPopover');
    if (pop) pop.style.display = 'none';
    document.removeEventListener('click', edgeGapPopoverOutsideClick, true);
}

function edgeGapPopoverOutsideClick(e) {
    const pop = document.getElementById('edgeGapPopover');
    if (!pop) return;
    if (pop.contains(e.target)) return;
    // Also don't close if user clicked the trigger button (its own onclick
    // will toggle the popover off — letting outside-click ALSO close would
    // re-open it via the toggle logic, which is confusing).
    if (_edgeGapPopoverTrigger && _edgeGapPopoverTrigger.contains(e.target)) return;
    closeEdgeGapPopover();
}

function renderEdgeGapPopover() {
    const pop = document.getElementById('edgeGapPopover');
    if (!pop) return;
    const f = elevFrames[_edgeGapPopoverIdx];
    if (!f) return;
    const dt = f.distToggles || { ceiling: false, floor: false, left: false, right: false };
    pop.innerHTML = `
        <div class="edge-gap-popover-grid">
            <div></div>
            <button class="icon-btn ${dt.ceiling?'active':''}" title="Ceiling" onclick="toggleEdgeGapFromPopover('ceiling')">${svgArrowUp}</button>
            <div></div>
            <button class="icon-btn ${dt.left?'active':''}" title="Left Wall" onclick="toggleEdgeGapFromPopover('left')">${svgArrowLeft}</button>
            <div class="edge-gap-popover-center"></div>
            <button class="icon-btn ${dt.right?'active':''}" title="Right Wall" onclick="toggleEdgeGapFromPopover('right')">${svgArrowRight}</button>
            <div></div>
            <button class="icon-btn ${dt.floor?'active':''}" title="Floor" onclick="toggleEdgeGapFromPopover('floor')">${svgArrowDown}</button>
            <div></div>
        </div>
    `;
    pop.style.display = 'block';
}

function positionEdgeGapPopover() {
    const pop = document.getElementById('edgeGapPopover');
    if (!pop || !_edgeGapPopoverTrigger) return;
    const rect = _edgeGapPopoverTrigger.getBoundingClientRect();
    // Anchor below the trigger by default, but flip above if not enough room
    const popHeight = 116;  // approximate; refine if content changes
    const popWidth = 110;
    let top = rect.bottom + 4;
    let left = rect.left + rect.width / 2 - popWidth / 2;
    // Clamp to viewport
    if (top + popHeight > window.innerHeight - 8) {
        top = rect.top - popHeight - 4;
    }
    if (left < 8) left = 8;
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
}

// Toggle a direction from inside the popover. Updates frame state, redraws
// the canvas dimensions, and updates the trigger's badge in place — without
// rebuilding the panel, so the popover stays open for multiple toggles.
function toggleEdgeGapFromPopover(which) {
    const idx = _edgeGapPopoverIdx;
    if (idx === null) return;
    const f = elevFrames[idx];
    if (!f.distToggles) f.distToggles = { ceiling: false, floor: false, left: false, right: false };
    f.distToggles[which] = !f.distToggles[which];
    if (f.distToggles[which] && typeof dimVisibility !== 'undefined') {
        dimVisibility.edgeGap = true;
        saveDimVisibility();
    }
    drawElevAll();
    pushHistory();
    // Re-render the popover so its own active states refresh
    renderEdgeGapPopover();
    // Update the trigger button's badge in place
    if (_edgeGapPopoverTrigger) {
        const dt = f.distToggles;
        const count = (dt.ceiling?1:0)+(dt.floor?1:0)+(dt.left?1:0)+(dt.right?1:0);
        const oldBadge = _edgeGapPopoverTrigger.querySelector('.edge-gap-badge');
        if (oldBadge) oldBadge.remove();
        _edgeGapPopoverTrigger.classList.toggle('has-active', count > 0);
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'edge-gap-badge';
            badge.textContent = String(count);
            _edgeGapPopoverTrigger.appendChild(badge);
        }
    }
}

// Hover pairing + click-to-select highlight: panels and frames on the wall
// stay visually paired. The highlight class is applied when:
//   (a) the frame is `selected` (click-set, persists until cleared)
//   (b) the frame is part of group-all (every frame isGrouped)
//   (c) the user is currently hovering the frame or panel (temporary)
//
// Mouseleave removes the highlight ONLY if neither (a) nor (b) apply —
// otherwise the selection/group highlight persists.
function wireElevHoverPairing() {
    const allGrouped = elevFrames.length > 0 && elevFrames.every(f => f.isGrouped);

    // Returns true if the frame at this letter should stay highlighted
    // independent of hover state.
    const isStickyHighlight = (letter) => {
        if (allGrouped) return true;
        const f = elevFrames.find(fr => fr.letter === letter);
        return f && f.selected === true;
    };

    document.querySelectorAll('#frame-controls .compact-frame-item').forEach(panel => {
        const letter = panel.dataset.frameLetter;
        if (!letter) return;
        // Apply sticky state at render time
        if (isStickyHighlight(letter)) panel.classList.add('selection-highlight');
        else panel.classList.remove('selection-highlight');

        panel.addEventListener('mouseenter', () => {
            panel.classList.add('selection-highlight');
            const frameEl = document.querySelector(`#frame-layer [data-frame-letter="${letter}"]`);
            if (frameEl) frameEl.classList.add('selection-highlight');
        });
        panel.addEventListener('mouseleave', () => {
            if (!isStickyHighlight(letter)) {
                panel.classList.remove('selection-highlight');
                const frameEl = document.querySelector(`#frame-layer [data-frame-letter="${letter}"]`);
                if (frameEl) frameEl.classList.remove('selection-highlight');
            }
        });
    });

    document.querySelectorAll('#frame-layer [data-frame-letter]').forEach(frameEl => {
        const letter = frameEl.dataset.frameLetter;
        if (!letter) return;
        if (isStickyHighlight(letter)) frameEl.classList.add('selection-highlight');
        else frameEl.classList.remove('selection-highlight');

        frameEl.addEventListener('mouseenter', () => {
            frameEl.classList.add('selection-highlight');
            const panel = document.querySelector(`#frame-controls [data-frame-letter="${letter}"]`);
            if (panel) panel.classList.add('selection-highlight');
        });
        frameEl.addEventListener('mouseleave', () => {
            if (!isStickyHighlight(letter)) {
                frameEl.classList.remove('selection-highlight');
                const panel = document.querySelector(`#frame-controls [data-frame-letter="${letter}"]`);
                if (panel) panel.classList.remove('selection-highlight');
            }
        });
    });
}

function toggleElevDimTarget(idx, targetLetter, e) {
    e.stopPropagation(); const arr = elevFrames[idx].dimTo || [];
    if (arr.includes(targetLetter)) elevFrames[idx].dimTo = arr.filter(l => l !== targetLetter);
    else elevFrames[idx].dimTo.push(targetLetter);
    initElevControls(); drawElevAll(); pushHistory();
}

function toggleElevGroup(idx, e) { e.stopPropagation(); elevFrames[idx].isGrouped = !elevFrames[idx].isGrouped; initElevControls(); pushHistory(); }
function removeElevFrame(idx, e) { e.stopPropagation(); elevFrames.splice(idx, 1); elevFrames.forEach((f, i) => f.letter = getElevLetter(i)); initElevControls(); drawElevAll(); recalculateDashboardQuantities(); pushHistory(); }
function toggleElevActive(idx, e) { e.stopPropagation(); elevFrames[idx].active = !elevFrames[idx].active; initElevControls(); drawElevAll(); recalculateDashboardQuantities(); pushHistory(); }

// Global ON/OFF for all frames on the current elevation. If every frame is
// active, turn them all OFF. Otherwise (any frame is inactive), turn them
// all ON. Bound to the pill toggle in the column header row between Edge
// Gap and the Move icon. The header pill's visual state (knob position +
// track color) reflects "ALL frames active" — set in initElevControls
// based on whether elevFrames.every(f => f.active).
function toggleAllElevActive() {
    if (!elevFrames.length) return;
    const allOn = elevFrames.every(f => f.active);
    const newState = !allOn;
    elevFrames.forEach(f => { f.active = newState; });
    initElevControls();
    drawElevAll();
    recalculateDashboardQuantities();
    pushHistory();
}

function duplicateElevFrame(idx, e) { 
    e.stopPropagation(); 
    pendingDuplicateIndex = idx;
    document.getElementById('duplicateModal').style.display = 'flex';
}

function closeDuplicateModal() {
    document.getElementById('duplicateModal').style.display = 'none';
    pendingDuplicateIndex = null;
}

// Styled drop-in replacement for window.alert(). Single OK button.
// Reuses #infoModal in index.html. Title + body fill in dynamically.
//
// Usage: showInfoModal('Library Synced', 'Synced 9 swatches from your folder.');
//        showInfoModal('Library Synced', '...', () => { /* runs on OK */ });
function showInfoModal(title, body, onOk) {
    document.getElementById('infoModalTitle').innerText = title;
    document.getElementById('infoModalBody').innerText = body;
    const btnRow = document.getElementById('infoModalButtons');
    btnRow.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.className = 'action-btn';
    okBtn.style.height = '32px';
    okBtn.innerText = 'OK';
    okBtn.onclick = () => {
        document.getElementById('infoModal').style.display = 'none';
        if (typeof onOk === 'function') onOk();
    };
    btnRow.appendChild(okBtn);
    document.getElementById('infoModal').style.display = 'flex';
}

// Styled drop-in replacement for window.confirm(). Two buttons, calls onYes
// or onNo callback based on user choice. Buttons are styled like the duplicate
// modal (primary action up top, cancel-style at bottom).
//
// Usage: showConfirmModal('Delete row?', 'This cannot be undone.', 'Delete', 'Cancel', onYes, onNo);
function showConfirmModal(title, body, yesLabel, noLabel, onYes, onNo) {
    document.getElementById('infoModalTitle').innerText = title;
    document.getElementById('infoModalBody').innerText = body;
    const btnRow = document.getElementById('infoModalButtons');
    btnRow.innerHTML = '';
    const yesBtn = document.createElement('button');
    yesBtn.className = 'action-btn';
    yesBtn.style.height = '32px';
    yesBtn.innerText = yesLabel || 'OK';
    yesBtn.onclick = () => {
        document.getElementById('infoModal').style.display = 'none';
        if (typeof onYes === 'function') onYes();
    };
    const noBtn = document.createElement('button');
    noBtn.className = 'action-btn btn-outline';
    noBtn.style.height = '32px';
    noBtn.style.marginTop = '5px';
    noBtn.style.color = 'var(--text-main)';
    noBtn.style.borderColor = 'var(--border-color)';
    noBtn.innerText = noLabel || 'Cancel';
    noBtn.onclick = () => {
        document.getElementById('infoModal').style.display = 'none';
        if (typeof onNo === 'function') onNo();
    };
    btnRow.appendChild(yesBtn);
    btnRow.appendChild(noBtn);
    document.getElementById('infoModal').style.display = 'flex';
}

// ──────────────────────────────────────────────────────────────────────────
// HELP MODAL
// ──────────────────────────────────────────────────────────────────────────
// Opens via the ? button in the header. Two tabs: Video (placeholder until
// HELP_VIDEO_URL is set) and Reference (curated docs for every feature).
//
// To plug in a tutorial video later, set HELP_VIDEO_URL to one of:
//   - A YouTube embed URL: "https://www.youtube.com/embed/VIDEO_ID"
//   - A Vimeo embed URL:   "https://player.vimeo.com/video/VIDEO_ID"
//   - A direct MP4 path:   "tutorial.mp4" (place file in repo root)
// The renderer auto-detects which form by the extension/host. To override
// detection set HELP_VIDEO_TYPE to 'youtube' | 'vimeo' | 'mp4'.
let HELP_VIDEO_URL = '';   // empty until a video is produced
let HELP_VIDEO_TYPE = '';  // optional override

// Module state remembers which tab + section was last viewed so reopening
// the modal returns to where the user left off.
let _helpActiveTab = 'video';
let _helpActiveSection = 'getting-started';

// Reference content. Each section is a group of entries. Entry titles
// match the visible UI labels users will search for. Body HTML supports
// inline <strong>, <span class="help-kbd">…</span> for keyboard chips.
const HELP_REFERENCE_DATA = [
    {
        id: 'getting-started',
        title: 'Getting Started',
        intro: 'The tool has two main views — the Frame Dashboard, where you spec individual frames, and Elevations, where you arrange them on walls.',
        entries: [
            {
                title: 'The Workflow',
                body: 'Spec a frame in the <strong>Frame Dashboard</strong> (set the product, frame profile, mats, finish), then use <strong>Push to Wall</strong> to send it to the active elevation. Once frames are on the wall, drag them into place and use the alignment tools to lock the layout in.'
            },
            {
                title: 'Project Units',
                body: 'The unit toggle in the header (<strong>IN / CM / MM</strong>) applies to the whole project. All values across the dashboard, elevations, and CSV export convert automatically when you switch. Pick the unit your team works in.'
            },
            {
                title: 'Save & Load Projects',
                body: '<strong>Save Project</strong> downloads a .json file containing every frame, elevation, and setting. <strong>Load Project</strong> restores it. The tool also auto-saves locally to your browser; if you close the tab and come back, you\'ll be offered to restore.'
            },
            {
                title: 'Export for Production',
                body: 'When the project is final, export the CSV (toolbar in dashboard) and the PNG frame swatches (single via the download icon per row, or <strong>Batch PNGs</strong> for everything in one ZIP). Export elevations individually or use <strong>ALL PNG / ALL SVG</strong> to bundle every wall into one ZIP. The CSV feeds the AutoFrameSpecs.jsx InDesign script to generate spec sheets.'
            }
        ]
    },
    {
        id: 'dashboard',
        title: 'Frame Dashboard',
        intro: 'Build and edit individual frames. The selected row syncs with the form and preview on the right.',
        entries: [
            {
                title: '+ Add (new row)',
                body: 'Creates a new row with default values. The new row inherits the current unit. Each row gets an auto-generated ITEM CODE like <strong>ART.001</strong>.'
            },
            {
                title: 'Product Type',
                body: 'Five options: <strong>Framed Art</strong>, <strong>Framed Art (Shadow Box)</strong>, <strong>Framed Canvas (Floater)</strong>, <strong>Frameless Canvas (Wrapped)</strong>, or <strong>Sourced Object</strong>. Selecting Canvas variants hides mat controls. Sourced Object skips frame and mat fields entirely.'
            },
            {
                title: 'Frame Profile (Library / Solid)',
                body: '<strong>Library</strong> pulls real frame profiles from the synced folder (with depth and rabbet metadata if encoded in the filename). <strong>Solid</strong> uses a flat color for quick mockups. Toggle between them with the buttons under the swatch.'
            },
            {
                title: 'Mat 1, Mat 2, Faux Mat',
                body: '<strong>Mat 1</strong> is the primary mat — set T/B/L/R values (or use AA for "all around"). <strong>Mat 2</strong> adds a contrasting reveal under Mat 1. <strong>Faux Mat</strong> is a printed white border on the paper instead of an actual mat board (use for cheap or modern looks).'
            },
            {
                title: 'Sync Mat Colors (Chain Icon)',
                body: 'Between Mat 1 and Mat 2: when active (blue), Mat 2\'s color matches Mat 1 automatically. Turn it off to set them independently. Useful for the common case of matching mats with a small reveal.'
            },
            {
                title: 'Float Mount Mode',
                body: 'Activates when you switch the panel to <strong>FLOAT</strong> mode. The art floats above a paper backing with white margin around it (no traditional mat). Sets Paper Size, Paper Margin, and White Border separately.'
            },
            {
                title: 'Lock Mat Values',
                body: 'The <strong>UNLOCKED / LOCKED</strong> toggle next to Mat 1 controls whether T/B/L/R sync. When locked, editing one updates all four (treats them as AA). Convenient for symmetric mats; turn off when you want offset mats.'
            },
            {
                title: 'Download PNG (single frame)',
                body: 'The download icon in the toolbar exports the currently-selected row as a standalone PNG showing the frame, mats, and art opening with dim labels.'
            },
            {
                title: 'Batch PNGs',
                body: 'Exports every row as a PNG and bundles them with the project CSV into a single ZIP. Progress modal shows during work. ZIP filename uses your project name + today\'s date.'
            },
            {
                title: 'Import / Export CSV',
                body: 'The CSV roundtrips — export to share with collaborators or feed into the InDesign script, then re-import to continue editing. Includes raw-inch columns at the end so the InDesign script can render in any output unit.'
            }
        ]
    },
    {
        id: 'elevation',
        title: 'Elevation View',
        intro: 'Arrange frames on walls. Each tab at the top is a separate elevation (wall).',
        entries: [
            {
                title: 'Push to Wall',
                body: 'On the dashboard, pick a frame from the <strong>Push to Wall</strong> dropdown and click <strong>Send</strong>. The frame appears on the active elevation, ready to position. Resending a frame creates additional copies (each copy is independent).'
            },
            {
                title: '+ Add (in elevation)',
                body: 'Adds a generic frame directly to the wall without going through the dashboard. Useful for placeholders. Customize it inline or push a designed frame later to override.'
            },
            {
                title: 'Drag to Position',
                body: 'Click and drag any frame to move it. Drag snaps to a configurable grid (set in <strong>Settings → Drag Snap</strong>). Shift-click to select multiple frames; drag any selected frame to move the group.'
            },
            {
                title: 'Multi-Select',
                body: 'Click one frame, then Shift-click others to add to the selection. Or drag a marquee box around them. <span class="help-kbd">Esc</span> deselects everything.'
            },
            {
                title: 'Grouping',
                body: 'Select multiple frames and press <span class="help-kbd">Ctrl+G</span> (or click the group icon in the panel). Grouped frames move together as one unit. Press again to ungroup.'
            },
            {
                title: 'Align & Distribute',
                body: 'Click the <strong>Align</strong> icon in the panel header to open the alignment dialog. Options: equal vertical gap, equal horizontal gap, snap-tops, snap-centers, snap-bottoms, distribute. Works on the current selection.'
            },
            {
                title: 'Sort A-Z',
                body: 'Reorders the frame panel list alphabetically by frame letter (A, B, C…). Visual placement on the wall is unchanged.'
            },
            {
                title: 'Wall Dimensions + Settings Gear',
                body: 'The W and H inputs set the wall size. The gear icon next to them opens <strong>Settings</strong>: units, hang height, font size, grid, drag snap, nudge step, and keyboard shortcut reference.'
            },
            {
                title: 'Layout Guides',
                body: 'Toggle icons control on-canvas overlays: <strong>Labels</strong> (A, B, C…), <strong>Frame OD</strong> (outer dimensions), <strong>Spacing</strong> (dim callouts), <strong>Person</strong> (6ft scale figure), <strong>Guides</strong> (center + hang height lines), <strong>Grid</strong>, <strong>Centers</strong> (frame crosshairs), <strong>Custom Lines</strong> (your drawn measure lines), and the <strong>Unit Suffix</strong> toggle.'
            },
            {
                title: 'Zoom + Fit',
                body: 'The slider zooms the elevation in/out. The <strong>Fit</strong> button auto-fits the wall to the available viewport area.'
            },
            {
                title: 'Export Elevation as PNG',
                body: 'The download icon in the Wall Dimensions row exports the current elevation including all visible guides as a single PNG. Hide guides you don\'t want baked in before exporting.'
            },
            {
                title: 'Measure Line Tool (M)',
                body: 'Press <span class="help-kbd">M</span> or click the measure-line button to draw your own dimension lines. Click two points to place a line — endpoints snap to frame corners, frame mid-edges, and wall edges (a blue dot shows the snap target). Drag a placed line away from a frame and a dashed leader bridges the gap only once it clears the frame edge. Select a line and use the arrow handles to slide it, the number to reposition the value, or <span class="help-kbd">Delete</span> to remove it. Toggle line visibility under Layout Guides.'
            },
            {
                title: 'Adjustable Dimension Lines',
                body: 'Every measurement type — spacing, edge-gap, hang-height, group-box, and drawn measure lines — behaves the same way. Click a line to select it, then drag its 4-way arrows to move the line, drag the number to slide it along the line, and use the × to hide it (where applicable). Dashed leaders only appear when a line is pulled clear of a frame, and never run along floor, ceiling, wall, or frame edges.'
            },
            {
                title: 'Baseboard',
                body: 'Set a baseboard height in <strong>Settings</strong> (shares the row with Units and Hang Height). It draws a horizontal line at that height across the wall, at the wall lineweight, and exports to SVG/PNG. Set it to 0 to turn it off. Default is 4".'
            },
            {
                title: 'Unit Suffix & Legend',
                body: 'The <strong>Unit Suffix</strong> toggle in Layout Guides controls how units appear. On: every number shows its unit (3", 6.3 cm, 64 mm). Off: numbers are bare and a single <strong>ALL DIMENSIONS IN INCHES / CENTIMETERS / MILLIMETERS</strong> legend is shown instead (and exported) — useful when per-number suffixes take up too much space.'
            },
            {
                title: 'Export All Elevations (Bulk ZIP)',
                body: 'The <strong>ALL PNG</strong> and <strong>ALL SVG</strong> buttons render every elevation in the project and bundle them into a single ZIP, one file per elevation named exactly like its tab. A progress bar shows during the run (with Cancel), and you\'re returned to the elevation you were working on when it finishes.'
            },
            {
                title: 'Managing Elevation Tabs',
                body: 'Each wall is a tab at the top. <strong>Drag tabs</strong> to reorder them. With many elevations the tab strip scrolls horizontally — use the scrollbar or hover and scroll your mouse wheel. The <strong>Frame Dashboard</strong> tab stays pinned on the left. Use <strong>+ Add Wall</strong> to create a new elevation and the × on a tab to delete one.'
            }
        ]
    },
    {
        id: 'settings',
        title: 'Settings',
        intro: 'Open via the gear icon next to Wall Dimensions in the elevation view.',
        entries: [
            {
                title: 'Hang Height',
                body: 'The vertical center line where the average viewer\'s eyes land. Studio standard is <strong>57"</strong> (144.78 cm / 1447.8 mm). The Guides overlay draws a horizontal line at this height for reference. Shares the top row of Settings with Units and Baseboard.'
            },
            {
                title: 'Baseboard',
                body: 'Draws a horizontal line at the set height from the floor, at the wall lineweight, on the elevation and in SVG/PNG exports. Default <strong>4"</strong>; set to 0 to turn it off. Converts automatically when you switch units.'
            },
            {
                title: 'Dimension Font Size',
                body: 'Controls the size of all on-canvas labels (frame letters, OD callouts, spacing dimensions). Increase for client review screenshots, decrease for dense walls.'
            },
            {
                title: 'Grid Size',
                body: 'The visible grid spacing when the Grid layer is on. Independent of Drag Snap — you can have a 6" visible grid but a 1" snap, or vice versa.'
            },
            {
                title: 'Drag Snap',
                body: 'How far frames "snap" to when dragged. Smaller = more freedom but more fiddly. Larger = cleaner grid alignment but less flexibility. 1" is a good default.'
            },
            {
                title: 'Nudge Step',
                body: 'Arrow keys nudge selected frames by the <strong>small</strong> value; <span class="help-kbd">Shift+Arrow</span> nudges by the <strong>big</strong> value. Defaults are 1" small and 10" big.'
            }
        ]
    },
    {
        id: 'shortcuts',
        title: 'Keyboard Shortcuts',
        intro: 'Available throughout the elevation view (when no input field is focused).',
        entries: [
            {
                title: 'Selection',
                body: '<span class="help-kbd">Click</span> selects one frame. <span class="help-kbd">Ctrl+Click</span> adds/removes from multi-selection. <span class="help-kbd">Esc</span> deselects everything.'
            },
            {
                title: 'Nudging',
                body: '<span class="help-kbd">↑</span> <span class="help-kbd">↓</span> <span class="help-kbd">←</span> <span class="help-kbd">→</span> nudge selected frames by the small step. Hold <span class="help-kbd">Shift</span> for the big step.'
            },
            {
                title: 'Duplicate',
                body: '<span class="help-kbd">Ctrl+D</span> duplicates the selected frame(s) with an offset so they\'re visible.'
            },
            {
                title: 'Group / Ungroup',
                body: '<span class="help-kbd">Ctrl+G</span> toggles grouping on the current selection.'
            },
            {
                title: 'Delete',
                body: '<span class="help-kbd">Delete</span> removes selected frames from the wall (not from the dashboard). With a measure line selected, it removes that line.'
            },
            {
                title: 'Measure Line Tool',
                body: '<span class="help-kbd">M</span> toggles the measure-line tool. With a line selected, the arrow keys move it (<span class="help-kbd">Shift</span> for a bigger step) and <span class="help-kbd">Esc</span> exits the tool or clears the selected line.'
            },
            {
                title: 'Undo / Redo',
                body: '<span class="help-kbd">Ctrl+Z</span> undoes the last action. <span class="help-kbd">Ctrl+Shift+Z</span> or <span class="help-kbd">Ctrl+Y</span> redoes.'
            },
            {
                title: 'Save',
                body: '<span class="help-kbd">Ctrl+S</span> triggers Save Project (downloads the .json).'
            }
        ]
    },
    {
        id: 'export-indesign',
        title: 'Export & InDesign',
        intro: 'Hand the CSV + PNG pack off to InDesign for spec sheet generation.',
        entries: [
            {
                title: 'Get the InDesign Script',
                body: 'Click the <strong>InDesign Script</strong> button to download <strong>AutoFrameSpecs.jsx</strong>. The install instructions modal explains where to place it in your InDesign Scripts folder.'
            },
            {
                title: 'Run the Script',
                body: 'In InDesign, with a document open and frame images selected on the page, open <strong>Window → Utilities → Scripts</strong>, double-click AutoFrameSpecs.jsx, point it at the project CSV, and pick your output unit (IN / CM / MM). The script generates spec blocks under each image.'
            },
            {
                title: 'One CSV, Any Output Unit',
                body: 'The CSV includes raw-inch canonical columns so you can export once and run the script in any unit. Dashboard set to IN? Run the script in MM — it converts everything cleanly with no mixed-unit output.'
            },
            {
                title: 'Batch PNGs (ZIP Export)',
                body: 'The <strong>Batch PNGs</strong> button bundles every frame plus the project CSV into a single ZIP. Unzip into a folder, place all PNGs in your InDesign doc, then run AutoFrameSpecs.jsx pointed at the CSV in the same folder — the script auto-matches each image to its data.'
            },
            {
                title: 'Bulk Elevation Export',
                body: 'In the elevation view, <strong>ALL PNG</strong> / <strong>ALL SVG</strong> export every wall into one ZIP, each file named after its elevation tab. SVG opens crisp in Illustrator/InDesign; PNG is a flat raster.'
            },
            {
                title: 'Floater Frame Width in Specs',
                body: 'For floater frames, the spec\'s Frame Size width reports the visible canvas <strong>face width</strong> (the swatch\'s <code>_f</code> value), not the full moulding profile. The Float Reveal defaults to 0.25" and renders in whatever unit you run the script in.'
            },
            {
                title: 'Consistent Units in Output',
                body: 'Every dimension in the generated spec — Frame Size, Rabbet, mats, paper, Float Reveal, Stretcher — renders in the single unit you pick when running the script, regardless of the unit the CSV was exported in. No mixed in/cm/mm output.'
            }
        ]
    },
    {
        id: 'tips',
        title: 'Tips & Gotchas',
        entries: [
            {
                title: 'Match Mat Color With Reveal',
                body: 'For the classic "white mat with thin black reveal" look: set Mat 1 to white, turn off the chain icon, set Mat 2 reveal to 0.25" with black color. Or click the chain to sync mat colors when you want them to match.'
            },
            {
                title: 'Float Mount Needs Enough Rabbet',
                body: 'The float mount stack (paper + spacer + glass + backing) needs at least <strong>0.625" rabbet depth</strong>. The tool warns when rabbet is too shallow for float mount. Increase rabbet or switch to a deeper frame profile.'
            },
            {
                title: 'Sourced Object — No Frame Spec',
                body: 'For 3D objects, sculptures, or pre-framed pieces from other vendors: pick <strong>Sourced Object</strong> as the product. The dashboard hides frame/mat fields. The wall layout still shows the object\'s overall dimensions.'
            },
            {
                title: 'Use Custom Frame Profiles',
                body: 'Put profile images in a folder (one PNG per profile), click the folder icon in the Frame Library section, and select that folder. The tool reads filenames for code, width, depth, and rabbet — e.g. <strong>MICH-41-12_1.75_0.625.png</strong> means code MICH-41-12, 1.75" wide, 0.625" rabbet.'
            },
            {
                title: 'Switching Themes',
                body: 'The sun/moon icon in the header toggles light/dark. The choice persists between sessions.'
            }
        ]
    },
    {
        id: 'version',
        title: 'Version',
        intro: 'About this build of the FRAME tool.',
        entries: [
            {
                title: 'Current Version',
                // Body is built dynamically when the section renders so it
                // picks up the live APP_VERSION / APP_BUILD constants. The
                // marker placeholders below are replaced at render time.
                body: '<strong>Version:</strong> {{APP_VERSION}}<br><strong>Build:</strong> {{APP_BUILD}}<br><br>The colored dot in the header pill indicates which build you\'re on at a glance: <strong style="color:#46c772;">green</strong> for production, <strong style="color:#f0883e;">orange</strong> for development.'
            },
            {
                title: 'What\'s New',
                body: '<strong>v1.1</strong> — Measure-line (M) tool with frame/wall snapping; unified, draggable dimension lines (spacing, edge-gap, hang-height, group-box, custom) with smart dashed leaders that only appear once a line clears a frame; adjustable baseboard; unit-suffix legend; flush-to-floor vertical dims. Bulk elevation export (ALL PNG / ALL SVG to one ZIP); draggable + scrolling elevation tabs with a pinned dashboard tab; export filenames preserved exactly as named. InDesign AutoFrameSpecs: floater face-width in Frame Size, consistent units across all spec lines (incl. Float Reveal + Stretcher), Rabbet without trailing "D", natural-case text, no frame stroke or breaker line, and adjustable below-image gap/width.<br><br><em>Maintainers: edit this list in <code>HELP_REFERENCE_DATA</code> in <code>app.js</code>.</em>'
            },
            {
                title: 'Reporting Issues',
                body: 'If something\'s not working as expected, note your version (shown above) and the steps to reproduce. Screenshots help. Send to the project maintainer.'
            }
        ]
    }
];

function openHelpModal() {
    document.getElementById('helpModal').style.display = 'flex';
    // Populate the reference sidebar + content (idempotent — re-rendering
    // is cheap and ensures any data updates take effect).
    populateHelpReference();
    setHelpTab(_helpActiveTab);
    // If a video URL is configured, render it; otherwise the empty-state
    // placeholder stays visible.
    if (HELP_VIDEO_URL) renderHelpVideo();
}

function closeHelpModal() {
    document.getElementById('helpModal').style.display = 'none';
}

function setHelpTab(name) {
    _helpActiveTab = name;
    document.getElementById('helpTabVideo').classList.toggle('active', name === 'video');
    document.getElementById('helpTabReference').classList.toggle('active', name === 'reference');
    document.getElementById('helpVideoPanel').style.display = (name === 'video') ? 'block' : 'none';
    document.getElementById('helpReferencePanel').style.display = (name === 'reference') ? 'flex' : 'none';
}

// Build the Reference tab's sidebar + content from HELP_REFERENCE_DATA.
// Idempotent — safe to call repeatedly.
function populateHelpReference() {
    const nav = document.getElementById('helpRefNav');
    nav.innerHTML = '';
    HELP_REFERENCE_DATA.forEach(section => {
        const b = document.createElement('button');
        b.textContent = section.title;
        b.dataset.section = section.id;
        b.onclick = () => renderHelpRefSection(section.id);
        if (section.id === _helpActiveSection) b.classList.add('active');
        nav.appendChild(b);
    });
    renderHelpRefSection(_helpActiveSection);
}

// Render a single section's content into the right panel and update the
// nav's active state.
function renderHelpRefSection(sectionId) {
    _helpActiveSection = sectionId;
    const section = HELP_REFERENCE_DATA.find(s => s.id === sectionId);
    if (!section) return;
    const content = document.getElementById('helpRefContent');
    // Placeholder substitution: any {{TOKEN}} in entry bodies gets replaced
    // with the live value from this map. Keeps the data structure static
    // while letting dynamic values (current version, build) flow through.
    const replacements = {
        '{{APP_VERSION}}': APP_VERSION,
        '{{APP_BUILD}}': APP_BUILD,
    };
    const fill = (s) => {
        let out = s;
        for (const k in replacements) out = out.split(k).join(replacements[k]);
        return out;
    };
    let html = `<h4>${section.title}</h4>`;
    if (section.intro) html += `<p class="help-section-intro">${fill(section.intro)}</p>`;
    section.entries.forEach(e => {
        html += `<div class="help-entry"><h5>${e.title}</h5><p>${fill(e.body)}</p></div>`;
    });
    content.innerHTML = html;
    // Update active nav button
    document.querySelectorAll('#helpRefNav button').forEach(b => {
        b.classList.toggle('active', b.dataset.section === sectionId);
    });
    // Scroll the content panel back to top when switching sections
    content.scrollTop = 0;
}

// Render the configured video URL into the Video panel. Auto-detects type
// from URL unless HELP_VIDEO_TYPE is set explicitly.
function renderHelpVideo() {
    const url = HELP_VIDEO_URL;
    if (!url) return;
    let type = HELP_VIDEO_TYPE;
    if (!type) {
        if (/youtube\.com|youtu\.be/i.test(url)) type = 'youtube';
        else if (/vimeo\.com/i.test(url)) type = 'vimeo';
        else type = 'mp4';
    }
    const embed = document.getElementById('helpVideoEmbed');
    const empty = document.getElementById('helpVideoEmpty');
    if (type === 'youtube' || type === 'vimeo') {
        embed.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:0; border-radius: 6px;" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    } else {
        embed.innerHTML = `<video src="${url}" controls style="width:100%; height:100%; border-radius: 6px; background: black;"></video>`;
    }
    empty.style.display = 'none';
    embed.style.display = 'block';
}

// Public API to set the video URL at runtime (used when plugging in a video
// later). Sets the URL and re-renders if the modal is already open.
function setHelpVideoUrl(url, type) {
    HELP_VIDEO_URL = url || '';
    HELP_VIDEO_TYPE = type || '';
    if (document.getElementById('helpModal').style.display === 'flex') {
        if (HELP_VIDEO_URL) renderHelpVideo();
    }
}

// ──────────────────────────────────────────────────────────────────────────
// VERSION PILL
// ──────────────────────────────────────────────────────────────────────────
// Populates the version indicator in the header bar using APP_VERSION and
// APP_BUILD constants from the top of this file. Called once on page load.
// The pill shows e.g. "v1.0" with a colored dot — green for production,
// orange for development. Click opens Help modal scrolled to Version section.
function renderVersionPill() {
    const pill = document.getElementById('versionPill');
    if (!pill) return;
    pill.textContent = 'v' + APP_VERSION + (APP_BUILD === 'dev' ? '-dev' : '');
    pill.classList.toggle('dev', APP_BUILD === 'dev');
}

function openVersionInfo() {
    // Open the help modal, jump to the version section, scroll into view.
    openHelpModal();
    setHelpTab('reference');
    renderHelpRefSection('version');
}

function confirmDuplicate(type) {
    if (pendingDuplicateIndex === null) return;
    const idx = pendingDuplicateIndex;
    
    const temp = elevFrames[idx]; 
    const nF = JSON.parse(JSON.stringify(temp));
    nF.letter = getElevLetter(elevFrames.length); 
    const moveFactor = 10 * unitFactor('in', elevUnit);
    nF.x = temp.x + moveFactor; nF.y = temp.y - moveFactor; 

    if(type === 'new') {
        const dashSrc = dashProjectData.find(d => d.id === temp.id);
        const newDash = JSON.parse(JSON.stringify(dashSrc || dashDefaultData));
        newDash.id = generateNextItemCode();
        newDash.qty = 0;
        dashProjectData.push(newDash);
        nF.id = newDash.id;
    }

    elevFrames.push(nF); 
    initElevControls(); drawElevAll(); recalculateDashboardQuantities(); 
    closeDuplicateModal();
    pushHistory();
}

function toggleElevLayer(id, btn) {
    const layer = document.getElementById(id);
    const isHidden = (layer.style.display === 'none' || layer.style.display === '');
    layer.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('active', isHidden);

    // Special behavior: when turning Person ON, if the figure is currently
    // outside the visible wall (which is the default at x=-60), pull it
    // Person first-show convenience: if the figure has NEVER been moved by
    // the user (still at its default spawn position and not yet flagged as
    // placed), pull it just inside the left edge so it's findable. Once the
    // user has dragged it anywhere — including parking it beside the wall —
    // we lock that position and never auto-move it again.
    if (id === 'person-wrap' && isHidden && elevPersonPos) {
        const neverPlaced = !elevPersonPos.placed;
        if (neverPlaced) {
            elevPersonPos.x = parseFloat((6 * unitFactor('in', elevUnit)).toFixed(2));
            elevPersonPos.placed = true; // from now on, respect user position
            drawElevAll();
            pushHistory();
        }
    }
}

function selectAllElevFrames() {
    elevFrames.forEach(f => f.active = true);
    initElevControls(); drawElevAll(); recalculateDashboardQuantities();
}

function deselectAllElevFrames() {
    elevFrames.forEach(f => f.active = false);
    initElevControls(); drawElevAll(); recalculateDashboardQuantities();
}

function toggleGroupAllElevFrames(e) {
    e.stopPropagation();
    const btn = document.getElementById('groupAllBtn');
    const anyGrouped = elevFrames.some(f => f.isGrouped);
    elevFrames.forEach(f => f.isGrouped = !anyGrouped);
    btn.classList.toggle('active', !anyGrouped);
    initElevControls();
}

// Module-level flag the batch loop polls each iteration to honor Cancel
// clicks. Reset to false at the start of every batch run.
let _batchZipCancelled = false;

// Public entry point — kept as the same name so the existing button onclick
// in index.html continues to work. Calls the new ZIP-based implementation.
async function batchDownloadAllFrames() {
    return batchDownloadAllFramesAsZip();
}

// New batch export: collect all frame PNGs + the project CSV into a single
// ZIP and trigger one download. Replaces the old N-individual-downloads flow
// which produced N save dialogs (painful for projects with 25–100 frames).
//
// Flow:
//   1. Show progress modal in 'running' state
//   2. For each row:
//      a. Load its swatch image (if any) using _loadImg
//      b. Render the frame to a canvas via _frameDataInInches +
//         renderFrameToCanvas (same path as the single-frame export, so the
//         output is pixel-identical)
//      c. Convert the canvas to a Blob (PNG)
//      d. Add to the ZIP under a collision-safe filename
//      e. Update progress UI and yield with a 0ms timeout so the browser
//         actually paints the new progress state before the next iteration
//   3. Add the project CSV (built via buildDashCSVString — no second
//      download is triggered, just the string)
//   4. Generate the final ZIP blob and trigger one download
//   5. Switch modal to 'done' state with a summary
//
// Cancellation: at the top of each iteration we check _batchZipCancelled.
// If true, we abort, hide the modal, and produce nothing. Partial ZIPs are
// discarded — either the user gets a complete pack or nothing.
async function batchDownloadAllFramesAsZip() {
    if (dashProjectData.length === 0) {
        return showInfoModal('Nothing to Pack', 'There are no frames in the project yet. Add some via the Dashboard before running a batch export.');
    }
    if (typeof JSZip === 'undefined') {
        return showInfoModal('Library Not Loaded', 'JSZip failed to load (network issue?). Refresh the page and try again — if it keeps failing the CDN may be blocked by your network.');
    }

    // Reset cancel flag for this run; show modal in 'running' state
    _batchZipCancelled = false;
    const modal = document.getElementById('batchZipModal');
    document.getElementById('batchZipRunning').style.display = 'block';
    document.getElementById('batchZipDone').style.display = 'none';
    document.getElementById('batchZipError').style.display = 'none';
    document.getElementById('batchZipProgressBar').style.width = '0%';
    document.getElementById('batchZipPercentLabel').textContent = '0%';
    document.getElementById('batchZipCountLabel').textContent = `0 / ${dashProjectData.length}`;
    document.getElementById('batchZipCurrentFile').textContent = '';
    // The modal is shared with the bulk elevation export — re-assert the
    // frame-pack wording in case the other feature ran last.
    (function(){ const t=document.getElementById('batchZipTitle'); if(t) t.textContent='Building Frame Pack';
        const d=document.getElementById('batchZipDesc'); if(d) d.textContent='Generating PNG files and bundling with the project CSV into a single ZIP.';
        const dt=document.getElementById('batchZipDoneTitle'); if(dt) dt.textContent='Frame Pack Ready'; })();
    modal.style.display = 'flex';

    const zip = new JSZip();
    const totalFrames = dashProjectData.length;
    let successCount = 0;
    let failureCount = 0;
    const failures = [];
    // Track used filenames to detect collisions (defensive — ITEM CODE should
    // be unique in practice). On collision append `-2`, `-3`, etc.
    const usedNames = {};

    try {
        for (let i = 0; i < totalFrames; i++) {
            if (_batchZipCancelled) {
                modal.style.display = 'none';
                return;
            }

            const row = dashProjectData[i];
            const baseName = buildPngFilename(row).replace(/\.png$/i, '');
            let fileName = `${baseName}.png`;
            if (usedNames[fileName]) {
                let n = 2;
                while (usedNames[`${baseName}-${n}.png`]) n++;
                fileName = `${baseName}-${n}.png`;
            }
            usedNames[fileName] = true;

            // Update progress UI BEFORE the heavy work so the user sees movement
            document.getElementById('batchZipCurrentFile').textContent = `Rendering ${fileName}…`;
            document.getElementById('batchZipCountLabel').textContent = `${i} / ${totalFrames}`;
            const pct = Math.round((i / totalFrames) * 100);
            document.getElementById('batchZipProgressBar').style.width = pct + '%';
            document.getElementById('batchZipPercentLabel').textContent = pct + '%';
            // Yield so the browser can paint the new progress state
            await new Promise(r => setTimeout(r, 0));

            try {
                const swatchImg = row.swatchDataUrl ? await _loadImg(row.swatchDataUrl) : null;
                const dInches = _frameDataInInches(row, dashUnit);
                // Match single-PNG export: no pad when shadows are off so the
                // bounding box equals the frame edge (easier InDesign alignment).
                const exportPad = dashOuterShadowsOn ? 40 : 0;
                const { canvas } = renderFrameToCanvas(dInches, swatchImg, { dpi: 72, pad: exportPad });
                // canvas.toBlob is async via a callback — wrap in a Promise so
                // we can await it. Quality arg N/A for PNG (it's lossless).
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (!blob) throw new Error('canvas.toBlob returned null');
                zip.file(fileName, blob);
                successCount++;
            } catch (frameErr) {
                failureCount++;
                failures.push(`${row.id || `Row ${i + 1}`}: ${frameErr.message || frameErr}`);
                // Continue on failure — one bad frame shouldn't tank the whole batch
            }
        }

        if (_batchZipCancelled) {
            modal.style.display = 'none';
            return;
        }

        // Include the project CSV. Built via buildDashCSVString (no download).
        document.getElementById('batchZipCurrentFile').textContent = 'Adding project CSV…';
        await new Promise(r => setTimeout(r, 0));
        try {
            const csvText = buildDashCSVString();
            zip.file('RFI_Project_Tracker.csv', csvText);
        } catch (csvErr) {
            // Don't fail the whole batch over a CSV problem
            failures.push(`CSV: ${csvErr.message || csvErr}`);
        }

        // Generate final ZIP. JSZip's generateAsync supports a progress callback
        // which we use to push the bar past the rendering phase smoothly.
        document.getElementById('batchZipCurrentFile').textContent = 'Compressing…';
        const zipBlob = await zip.generateAsync(
            { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
            (metadata) => {
                // metadata.percent is 0-100 of the compression phase
                const pct = Math.round(metadata.percent);
                document.getElementById('batchZipProgressBar').style.width = pct + '%';
                document.getElementById('batchZipPercentLabel').textContent = pct + '%';
            }
        );

        if (_batchZipCancelled) {
            modal.style.display = 'none';
            return;
        }

        // Build a meaningful ZIP filename. Prefer the project name from the
        // global meta field if present; fall back to a date-stamped default.
        const projName = (document.getElementById('g_projName')?.value || '').trim();
        const dateStr = new Date().toISOString().slice(0, 10);
        const safeName = projName ? projName.replace(/[\\/:*?"<>|]/g, '_') : 'Frame_Pack';
        const zipFileName = `${safeName}_${dateStr}.zip`;

        // Trigger the single download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke after a short delay to ensure the browser has started the download
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);

        // Switch modal to 'done' state with summary
        document.getElementById('batchZipRunning').style.display = 'none';
        document.getElementById('batchZipDone').style.display = 'block';
        let msg = `${successCount} frame${successCount === 1 ? '' : 's'} packed into <strong>${zipFileName}</strong>.`;
        if (failureCount > 0) {
            msg += `<br><br><span style="color:#e87474;">${failureCount} frame${failureCount === 1 ? '' : 's'} failed:</span><br>` +
                failures.slice(0, 5).map(f => `• ${f}`).join('<br>') +
                (failures.length > 5 ? `<br>…and ${failures.length - 5} more` : '');
        }
        document.getElementById('batchZipDoneMsg').innerHTML = msg;

    } catch (err) {
        // Catastrophic failure (e.g. JSZip itself failing, out of memory)
        document.getElementById('batchZipRunning').style.display = 'none';
        document.getElementById('batchZipError').style.display = 'block';
        document.getElementById('batchZipErrorMsg').textContent =
            `An unexpected error stopped the batch: ${err.message || err}`;
    }
}

// Set the cancellation flag. The running loop polls this and bails on the
// next iteration. Doesn't synchronously stop work — the current frame may
// finish rendering before the loop notices.
function cancelBatchZip() {
    _batchZipCancelled = true;
    // Update modal to show cancellation is in progress
    document.getElementById('batchZipCurrentFile').textContent = 'Cancelling…';
}

// ──────────────────────────────────────────────────────────────────────────
// BULK ELEVATION EXPORT (ZIP)
// ──────────────────────────────────────────────────────────────────────────
// Renders EVERY elevation to SVG or PNG and bundles them into one ZIP.
// Reuses the batch ZIP modal (progress bar + cancel) and the single-export
// renderers via their returnBlob mode, so bulk output is pixel/byte-identical
// to individual exports. The user's current elevation is restored at the end.
// Per-elevation failures are recorded and reported without aborting the run.
async function bulkExportElevations(format) {
    const isSvg = (format === 'svg');
    if (!elevations.length) {
        return showInfoModal('Nothing to Export', 'There are no elevations in the project yet.');
    }
    if (typeof JSZip === 'undefined') {
        return showInfoModal('Library Not Loaded', 'JSZip failed to load. Refresh the page and try again.');
    }

    // Remember where the user was so we can put them back afterwards.
    const origView = currentView;
    const origIndex = currentElevIndex;

    _batchZipCancelled = false;
    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    const modal = document.getElementById('batchZipModal');
    document.getElementById('batchZipRunning').style.display = 'block';
    document.getElementById('batchZipDone').style.display = 'none';
    document.getElementById('batchZipError').style.display = 'none';
    document.getElementById('batchZipProgressBar').style.width = '0%';
    setTxt('batchZipPercentLabel', '0%');
    setTxt('batchZipCountLabel', `0 / ${elevations.length}`);
    setTxt('batchZipCurrentFile', '');
    setTxt('batchZipTitle', isSvg ? 'Exporting All Elevations (SVG)' : 'Exporting All Elevations (PNG)');
    setTxt('batchZipDesc', 'Rendering each elevation and bundling everything into a single ZIP.');
    modal.style.display = 'flex';

    const zip = new JSZip();
    const total = elevations.length;
    let successCount = 0;
    let failureCount = 0;
    const failures = [];
    const usedNames = {};
    const restoreUserView = () => {
        if (origView === 'elevation' && elevations[origIndex]) switchView('elevation', origIndex);
        else if (origView === 'dashboard') switchView('dashboard');
    };

    try {
        for (let i = 0; i < total; i++) {
            if (_batchZipCancelled) {
                modal.style.display = 'none';
                restoreUserView();
                return;
            }

            // Load this elevation into the live view (the renderers read the
            // live DOM) and let layout settle before capturing.
            switchView('elevation', i);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            const elevName = (elevations[i] && elevations[i].name) || `Elevation_${i + 1}`;
            setTxt('batchZipCurrentFile', `Rendering ${elevName}…`);
            setTxt('batchZipCountLabel', `${i} / ${total}`);
            const pct = Math.round((i / total) * 100);
            document.getElementById('batchZipProgressBar').style.width = pct + '%';
            setTxt('batchZipPercentLabel', pct + '%');
            await new Promise(r => setTimeout(r, 0));  // let the modal paint

            try {
                const res = isSvg
                    ? await exportElevSVG({ returnBlob: true })
                    : await exportElevPNG({ returnBlob: true });
                if (!res || !res.blob) throw new Error('renderer returned no data');
                // Collision-safe filenames (two elevations could share a name)
                const ext = isSvg ? '.svg' : '.png';
                const base = res.filename.replace(new RegExp(ext.replace('.', '\\.') + '$', 'i'), '');
                let fileName = base + ext;
                if (usedNames[fileName]) {
                    let n = 2;
                    while (usedNames[`${base}-${n}${ext}`]) n++;
                    fileName = `${base}-${n}${ext}`;
                }
                usedNames[fileName] = true;
                zip.file(fileName, res.blob);
                successCount++;
            } catch (elevErr) {
                failureCount++;
                failures.push(`${elevName}: ${elevErr.message || elevErr}`);
            }
        }

        // Put the user back on their elevation before the (possibly slow)
        // ZIP generation so the workspace looks normal again immediately.
        restoreUserView();

        if (_batchZipCancelled) { modal.style.display = 'none'; return; }
        if (successCount === 0) {
            document.getElementById('batchZipRunning').style.display = 'none';
            document.getElementById('batchZipError').style.display = 'block';
            setTxt('batchZipErrorMsg', `No elevations could be rendered. ${failures.join(' · ')}`);
            return;
        }

        setTxt('batchZipCurrentFile', 'Building ZIP…');
        const zipBlob = await zip.generateAsync(
            { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
            (meta) => {
                document.getElementById('batchZipProgressBar').style.width = meta.percent.toFixed(0) + '%';
                setTxt('batchZipPercentLabel', meta.percent.toFixed(0) + '%');
            }
        );

        const projEl = document.getElementById('g_projName');
        const projSlug = slugifyForFilename(projEl ? projEl.value : '');
        const zipName = `${projSlug}-Elevations-${isSvg ? 'SVG' : 'PNG'}.zip`;
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.download = zipName;
        a.href = url;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        document.getElementById('batchZipRunning').style.display = 'none';
        document.getElementById('batchZipDone').style.display = 'block';
        setTxt('batchZipDoneTitle', 'Elevations Exported');
        let doneMsg = `${successCount} elevation${successCount === 1 ? '' : 's'} exported to ${zipName}.`;
        if (failureCount > 0) doneMsg += ` ${failureCount} failed: ${failures.join(' · ')}`;
        setTxt('batchZipDoneMsg', doneMsg);
    } catch (err) {
        console.error('Bulk elevation export failed:', err);
        restoreUserView();
        document.getElementById('batchZipRunning').style.display = 'none';
        document.getElementById('batchZipError').style.display = 'block';
        setTxt('batchZipErrorMsg', `An unexpected error stopped the export: ${err.message || err}`);
    }
}

// Download the InDesign script (AutoFrameSpecs.jsx). Fetched from the deployed
// site root, which on GitHub Pages serves the same file that lives at the repo
// root. Wrapping in a Blob with application/javascript MIME type ensures the
// browser triggers a download instead of trying to display the JSX as text.
// After download succeeds, the install instructions modal pops up. If the
// fetch fails (offline, file missing from deploy), a helpful fallback message
// points the user to the GitHub raw URL.
async function downloadInDesignScript() {
    try {
        const res = await fetch('AutoFrameSpecs.jsx');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // Validate it's actually the script and not an HTML 404 page
        if (text.length < 100 || text.toLowerCase().includes('<!doctype html')) {
            throw new Error('File appears to be empty or wrong content type');
        }
        const blob = new Blob([text], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AutoFrameSpecs.jsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // Show install instructions
        document.getElementById('installModal').style.display = 'flex';
    } catch (err) {
        console.error('Download failed:', err);
        showInfoModal(
            'Download Failed',
            `Could not download AutoFrameSpecs.jsx. You can grab the latest version directly from GitHub: https://github.com/JDHilliard-lab/FRAME/blob/main/AutoFrameSpecs.jsx`
        );
    }
}

function elevFmt(val) {
    // Display precision per unit. INCHES default to whole numbers; CM to 1 decimal;
    // MM to whole numbers (mm precision is already very fine).
    const dec = unitInfo(elevUnit).decimals;
    return dec === 0 ? Math.round(val).toString() : parseFloat(val).toFixed(dec);
}

// Centralized hang-height getter — reads the user-editable input, falls back
// to studio standard (57" worth, in whatever unit is active) if blank.
// Used by the guide line, alignment helpers, and floor/ceiling dim layer.
function getHangHeight() {
    const el = document.getElementById('hangHeight');
    const v = el ? parseFloat(el.value) : NaN;
    if (!isNaN(v) && v > 0) return v;
    return 57 * unitFactor('in', elevUnit);
}

// Baseboard height (current unit). 0/blank = no baseboard. Read directly from
// the input like the hang height; converted alongside other values on unit
// change via setElevUnit's input-conversion pass.
function getBaseboardHeight() {
    const el = document.getElementById('baseboardHeight');
    const v = el ? parseFloat(el.value) : NaN;
    if (!isNaN(v) && v > 0) return v;
    return 0;
}
function updateBaseboard() { drawElevAll(); }

// ──────────── ALIGNMENT & DISTRIBUTION HELPERS ────────────
// Module-level state: which axis the spacing operation uses. Persists between
// dialog opens so the user's last choice is remembered until they change it.
let alignAxis = 'h';

function openAlignmentDialog() {
    // Refresh the unit label to match current elevation unit
    const unitLabel = document.getElementById('alignGapUnit');
    if (unitLabel) unitLabel.textContent = elevUnit;
    document.getElementById('alignModal').style.display = 'flex';
}

function setAlignAxis(axis) {
    alignAxis = axis;
    document.getElementById('alignAxisH').classList.toggle('active', axis === 'h');
    document.getElementById('alignAxisV').classList.toggle('active', axis === 'v');
}

// Distribute active frames evenly along the chosen axis with the specified gap.
// HORIZONTAL: sort frames left-to-right by x, place them in sequence starting
// from the leftmost frame's current x. Each subsequent frame's x =
// previous frame's right edge + gap.
// VERTICAL: same logic but bottom-to-top by y, building upward.
// Frames are NOT centered or moved as a group — we preserve the leftmost
// (or bottommost) frame's position and pack the rest against it.
function applyAutoSpace() {
    const activeFrames = elevFrames.filter(f => f.active);
    if (activeFrames.length < 2) {
        showInfoModal('Need More Frames', 'Auto-spacing requires at least 2 visible frames in this elevation.');
        return;
    }
    const gap = parseFloat(document.getElementById('alignGapValue').value) || 0;
    if (gap < 0) {
        showInfoModal('Invalid Gap', 'Gap must be 0 or greater.');
        return;
    }

    if (alignAxis === 'h') {
        // Sort by x ascending, then pack left-to-right with the gap between each
        const sorted = [...activeFrames].sort((a, b) => a.x - b.x);
        let cursor = sorted[0].x; // anchor: leftmost frame stays put
        sorted.forEach((f, i) => {
            if (i === 0) {
                cursor = f.x + f.w; // first frame's right edge is the next cursor
            } else {
                f.x = cursor + gap;
                cursor = f.x + f.w;
            }
        });
    } else {
        // Vertical: sort by y ascending, pack bottom-to-top
        const sorted = [...activeFrames].sort((a, b) => a.y - b.y);
        let cursor = sorted[0].y;
        sorted.forEach((f, i) => {
            if (i === 0) {
                cursor = f.y + f.h;
            } else {
                f.y = cursor + gap;
                cursor = f.y + f.h;
            }
        });
    }
    drawElevAll();
    initElevControls();
    pushHistory();
}

// Shift the entire group of active frames horizontally so the group's
// bounding box is centered on the wall. Vertical positions are preserved.
// "Group center" = midpoint between leftmost edge and rightmost edge of
// any active frame.
//
// Behavior splits on grouping: if any active frames are grouped (Group All
// or individual group toggles set), only the GROUPED frames get moved as a
// unit. If nothing is grouped, all active frames move as one group.
function centerGroupOnWall() {
    const activeFrames = elevFrames.filter(f => f.active);
    if (activeFrames.length === 0) {
        showInfoModal('No Visible Frames', 'No active frames to center. Toggle on the frames you want to align.');
        return;
    }
    // Use grouped subset if any are grouped, otherwise all active
    const anyGrouped = activeFrames.some(f => f.isGrouped);
    const movingFrames = anyGrouped ? activeFrames.filter(f => f.isGrouped) : activeFrames;
    if (movingFrames.length === 0) return;

    const wallW = parseFloat(document.getElementById('wallW').value) || 1;
    let minX = Infinity, maxX = -Infinity;
    movingFrames.forEach(f => {
        if (f.x < minX) minX = f.x;
        if (f.x + f.w > maxX) maxX = f.x + f.w;
    });
    const groupCenterX = (minX + maxX) / 2;
    const wallCenterX = wallW / 2;
    const shift = wallCenterX - groupCenterX;
    movingFrames.forEach(f => { f.x += shift; });

    drawElevAll();
    initElevControls();
    pushHistory();
}

// Align the active frames to the hang-height line.
//
// Two modes based on grouping:
//   - If ANY active frames are grouped: treat the grouped frames as a UNIT.
//     Compute their bounding-box vertical center, shift all grouped frames
//     by the same delta so the group's center lands on hang height.
//     Relative vertical positions WITHIN the group are preserved — useful
//     when you want to center a multi-frame layout as a single composition
//     rather than collapsing every frame to the same line.
//   - If NO frames are grouped: per-frame alignment — each frame's own
//     vertical center sits on the hang line, regardless of size. Convenient
//     for hanging a row of mismatched-size frames at the same gallery-
//     standard center-of-art height.
function alignToHangHeight() {
    const activeFrames = elevFrames.filter(f => f.active);
    if (activeFrames.length === 0) {
        showInfoModal('No Visible Frames', 'No active frames to align. Toggle on the frames you want to align.');
        return;
    }
    const hangY = getHangHeight();
    const anyGrouped = activeFrames.some(f => f.isGrouped);

    if (anyGrouped) {
        // GROUP mode: preserve relative positions, shift the group as a unit
        const groupedFrames = activeFrames.filter(f => f.isGrouped);
        if (groupedFrames.length === 0) return;
        let minY = Infinity, maxY = -Infinity;
        groupedFrames.forEach(f => {
            if (f.y < minY) minY = f.y;
            if (f.y + f.h > maxY) maxY = f.y + f.h;
        });
        const groupCenterY = (minY + maxY) / 2;
        const shift = hangY - groupCenterY;
        groupedFrames.forEach(f => { f.y += shift; });
    } else {
        // PER-FRAME mode: each frame's own center → hang line
        activeFrames.forEach(f => {
            f.y = hangY - f.h / 2;
        });
    }

    drawElevAll();
    initElevControls();
    pushHistory();
}

// Per-frame quick alignment: snap ONE frame's OD center to the hang line.
// Independent of selection/grouping — operates on the indexed frame only.
// Used by the per-frame "snap to hang" icon button in the ABC panel.
function snapFrameToHang(idx, e) {
    if (e) e.stopPropagation();
    const f = elevFrames[idx];
    if (!f) return;
    const hangY = getHangHeight();
    f.y = hangY - f.h / 2;
    drawElevAll();
    pushHistory();
}

// Per-frame quick alignment: snap ONE frame's horizontal center to the wall's
// horizontal center. Independent of selection/grouping. Used by the per-frame
// "snap to wall center" icon button in the ABC panel.
function snapFrameToWallCenter(idx, e) {
    if (e) e.stopPropagation();
    const f = elevFrames[idx];
    if (!f) return;
    const wallW = parseFloat(document.getElementById('wallW').value) || 1;
    f.x = (wallW - f.w) / 2;
    drawElevAll();
    pushHistory();
}

function drawElevAll() {
    // Prefer the precise stored wall dims over the input field (which displays
    // a 2-decimal rounded value). Reading the rounded field while frames use
    // precise values caused the wall to drift relative to the frames on unit
    // toggles (dimension-line jitter). If the stored value rounds to the same
    // 2-decimal display as the input, the user hasn't just typed a new number,
    // so we use the precise stored value; otherwise honor the input edit.
    const _ce = elevations[currentElevIndex];
    const _wwInput = parseFloat(document.getElementById('wallW').value) || 1;
    const _whInput = parseFloat(document.getElementById('wallH').value) || 1;
    let wallW = _wwInput, wallH = _whInput;
    if (_ce && typeof _ce.wallW === 'number' && parseFloat(_ce.wallW.toFixed(2)) === _wwInput) wallW = _ce.wallW;
    if (_ce && typeof _ce.wallH === 'number' && parseFloat(_ce.wallH.toFixed(2)) === _whInput) wallH = _ce.wallH;
    // Publish the resolved precise wall dims so sub-renderers (edge-gap dims,
    // group dims, etc.) use the SAME values and don't re-read the rounded
    // input field (which caused edge-gap lines to jitter on unit toggles).
    elevResolvedWallW = wallW;
    elevResolvedWallH = wallH;
    const workspace = document.querySelector('#view-elevation .workspace');
    
    let baseScale = Math.min((workspace.clientWidth - 160)/wallW, (workspace.clientHeight - 160)/wallH);
    elevScale = baseScale * elevZoomFactor;
    
    const wall = document.getElementById('wall');
    wall.style.width = (wallW * elevScale) + 'px'; wall.style.height = (wallH * elevScale) + 'px';

    // Baseboard: a horizontal line at the baseboard height from the floor,
    // spanning the wall width, drawn with the wall lineweight. 0 = none.
    {
        const old = document.getElementById('baseboard-line');
        if (old) old.remove();
        const bb = getBaseboardHeight();
        if (bb > 0 && bb < wallH) {
            const cs = getComputedStyle(wall);
            const lw = Math.max(1, Math.round(parseFloat(cs.borderTopWidth) || 1));
            const line = document.createElement('div');
            line.id = 'baseboard-line';
            line.setAttribute('data-baseboard', '1');
            const wallLineColor = (getComputedStyle(document.documentElement).getPropertyValue('--wall-line') || '#333').trim();
            line.style.cssText =
                `position:absolute; left:0; right:0; bottom:${bb * elevScale}px; height:0;` +
                `border-top:${lw}px solid ${wallLineColor}; pointer-events:none; z-index:2;`;
            wall.appendChild(line);
        }
    }

    const gridLayer = document.getElementById('grid-layer');
    // Grid cell size — visual grid spacing in inches/cm. User-configurable
    // via Settings (gridSize input). Defaults to 1 if input not present.
    let gridUnitVal = 1;
    const gridSizeEl = document.getElementById('gridSize');
    if (gridSizeEl) {
        const v = parseFloat(gridSizeEl.value);
        if (!isNaN(v) && v > 0) gridUnitVal = v;
    }
    const gridCellSize = gridUnitVal * elevScale;
    gridLayer.style.backgroundSize = gridCellSize + 'px ' + gridCellSize + 'px';
    gridLayer.style.backgroundImage = 'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to top, rgba(0,0,0,0.06) 1px, transparent 1px)';

    const personHeightIn = 72; 
    const personHeight = parseFloat((personHeightIn * unitFactor('in', elevUnit)).toFixed(2));
    const pWrap = document.getElementById('person-wrap');
    document.getElementById('person').style.height = (personHeight * elevScale) + 'px';
    pWrap.style.left = (elevPersonPos.x * elevScale) + 'px';

    const frameLayer = document.getElementById('frame-layer'); frameLayer.innerHTML = '';
    const labelLayer = document.getElementById('label-layer'); labelLayer.innerHTML = '';
    const odLayer = document.getElementById('od-layer'); odLayer.innerHTML = '';
    const centerLayer = document.getElementById('frame-center-layer'); centerLayer.innerHTML = '';
    const groupDimLayer = document.getElementById('group-dim-layer'); if (groupDimLayer) groupDimLayer.innerHTML = '';
    
    elevFrames.forEach((f, idx) => {
        if(!f.active) return;
        
        const el = document.createElement('div'); el.className = 'draggable frame-vis';
        el.dataset.frameLetter = f.letter;
        el.style.cssText = `width:${f.w*elevScale}px; height:${f.h*elevScale}px; left:${f.x*elevScale}px; bottom:${f.y*elevScale}px;`;
        
        // For floaters, rails draw at structural fW like normal frames. The visible-
        // from-front geometry (only floaterInset of the rail visible) is achieved by
        // sizing the art rect bigger than rail-inner so it overlaps the inner part
        // of the rails. Export uses the canvas overlay which renders this correctly.
        const isFloater = (f.product === "Framed Canvas (Floater)");
        const isFrameless = (f.product === "Frameless Canvas (Wrapped)");
        // Float mount runs on any non-canvas frame when toggle is set on the row.
        const useFM = !isFloater && !isFrameless && (f.useFloatMount === true);
        const floaterInsetVal = isFloater ? (parseFloat(f.floaterInset) || 0.75) : 0;
        const sbPaperMarginVal = useFM ? (parseFloat(f.sbPaperMargin) || 0) : 0;
        const sbPaperBorderVal = useFM ? (parseFloat(f.sbPaperBorder) || 0) : 0;
        const effFw = f.fW;

        // Outer drop-shadow strings (used by all three render branches below).
        // Gated on dashOuterShadowsOn: when off, the shadow halo is suppressed
        // so elevations match the toggle-off PNG export look.
        const elevOuterShadow = dashOuterShadowsOn
            ? `0 ${16 * elevScale}px ${40 * elevScale}px rgba(0,0,0,0.45), 0 ${6 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.3)`
            : 'none';

        if (isFrameless) {
            // Frameless canvas: no rails, no border. Just a drop shadow halo
            // around the canvas-face area to suggest depth on the wall.
            el.classList.add('frame-vis-solid');
            el.style.border = 'none';
            el.style.background = 'transparent';
            el.style.boxShadow = elevOuterShadow;
        } else if (f.fType === 'color') {
            el.classList.add('frame-vis-solid');
            el.style.border = `${effFw * elevScale}px solid ${f.fColor || '#1a1a1a'}`;
            el.style.setProperty('--frame-color', f.fColor || '#1a1a1a');
            // Frame color outline (1.5px) is part of the frame visual, NOT an
            // outer shadow, so it stays regardless of the toggle. Only the
            // ambient/contact shadows are conditional.
            el.style.boxShadow = dashOuterShadowsOn
                ? `0 0 0 1.5px ${f.fColor || '#1a1a1a'}, 0 ${16 * elevScale}px ${40 * elevScale}px rgba(0,0,0,0.45), 0 ${6 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.3)`
                : `0 0 0 1.5px ${f.fColor || '#1a1a1a'}`;
        } else {
            el.classList.add('frame-vis-image');
            el.style.setProperty('--fW', (effFw * elevScale) + 'px');
            el.style.setProperty('--frame-W', (f.w * elevScale) + 'px');
            el.style.setProperty('--frame-bg', `url(${f.swatchDataUrl})`);
            el.style.boxShadow = elevOuterShadow;
            const rails = ['top', 'bottom', 'left', 'right'];
            rails.forEach(pos => {
                const rail = document.createElement('div'); rail.className = `frame-rail rail-${pos}`; rail.innerHTML = `<div class="rail-bg"></div>`; el.appendChild(rail);
            });
        }

        let offsetW = (f.fType === 'color' || isFrameless) ? 0 : (effFw * elevScale);

        // Mat 2 is nested inside Mat 1. If Mat 1 is off, Mat 2 is implicitly off too.
        // Floaters, frameless canvas, & float mount: mats are forced off — the canvas/paper
        // sits inside the inner area or the canvas IS the artwork.
        const m1Active = !isFloater && !isFrameless && !useFM && (f.m1A !== false);
        const m2Active = m1Active && f.m2A;

        if (m1Active) {
            const m1 = document.createElement('div'); m1.className = 'mat-visual';
            const m1Color = f.m1ColorHex || '#ffffff';
            m1.style.cssText = `top:${offsetW}px; left:${offsetW}px; width:${(f.w - effFw*2)*elevScale}px; height:${(f.h - effFw*2)*elevScale}px; border-top-width:${f.m1T*elevScale}px; border-bottom-width:${f.m1B*elevScale}px; border-left-width:${f.m1L*elevScale}px; border-right-width:${f.m1R*elevScale}px;`;
            // Explicit borderColor — must NOT depend on inherited theme color
            m1.style.borderColor = m1Color;
            el.style.setProperty('--m1-color', m1Color);
            // Bumped inset shadow: frame casts a stronger shadow onto the mat surface
            // (matches the canvas renderer's bumped shadow for visual consistency).
            m1.style.boxShadow = `0 0 0 1.5px ${m1Color}, inset 0 ${4 * elevScale}px ${10 * elevScale}px rgba(0,0,0,0.45), 0 ${2 * elevScale}px ${5 * elevScale}px rgba(0,0,0,0.15)`;
            el.appendChild(m1);
        }
        
        let m2Val = m2Active ? f.m2 : 0;
        if (m2Active) {
            const m2 = document.createElement('div'); m2.className = 'mat2-visual';
            const m2Color = f.m2ColorHex || '#ffffff';
            let m2TopOffset = (f.fType === 'color') ? (f.m1T * elevScale) : ((effFw + f.m1T) * elevScale);
            let m2LeftOffset = (f.fType === 'color') ? (f.m1L * elevScale) : ((effFw + f.m1L) * elevScale);
            m2.style.cssText = `top:${m2TopOffset}px; left:${m2LeftOffset}px; width:${(f.w - effFw*2 - f.m1L - f.m1R)*elevScale}px; height:${(f.h - effFw*2 - f.m1T - f.m1B)*elevScale}px; border-width:${m2Val*elevScale}px;`;
            // Explicit borderColor — must NOT depend on inherited theme color
            m2.style.borderColor = m2Color;
            el.style.setProperty('--m2-color', m2Color);
            m2.style.boxShadow = `0 0 0 1.5px ${m2Color}, inset 0 ${2 * elevScale}px ${6 * elevScale}px rgba(0,0,0,0.3), 0 ${2 * elevScale}px ${5 * elevScale}px rgba(0,0,0,0.15)`;
            el.appendChild(m2);
        }

        // FAUX MAT layer in elevation: a white paper band visible between the
        // innermost mat (or frame inner edge if no mats) and the image. Same
        // logic as the dashboard preview and canvas export — third renderer
        // for the same feature. The mat above casts an inset shadow onto the
        // white paper; the paper itself does NOT shadow the image (print is
        // flat against paper, no thickness, no shadow).
        const useFauxMat = !isFloater && !isFrameless && !useFM && (f.useFauxMat === true);
        if (useFauxMat) {
            const border = parseFloat(f.sbPaperBorder) || 0;
            if (border > 0) {
                const faux = document.createElement('div');
                faux.className = 'faux-mat-visual';
                // Position: sits inside whatever opening is above it. Same conditional
                // pattern as Mat 1/2 — frameInset is 0 when frame is a CSS border
                // (color mode), or fW*elevScale when frame is composed of rail divs
                // (library mode). Size deduction is always fW*2 regardless of mode.
                const frameInset = (f.fType === 'color' || isFrameless) ? 0 : (effFw * elevScale);
                const frameDeduct = effFw * 2 * elevScale;
                const m1IT = m1Active ? f.m1T * elevScale : 0;
                const m1IB = m1Active ? f.m1B * elevScale : 0;
                const m1IL = m1Active ? f.m1L * elevScale : 0;
                const m1IR = m1Active ? f.m1R * elevScale : 0;
                const m2I = m2Active ? m2Val * elevScale : 0;
                const top = frameInset + m1IT + m2I;
                const left = frameInset + m1IL + m2I;
                const width = (f.w * elevScale) - frameDeduct - m1IL - m1IR - m2I * 2;
                const height = (f.h * elevScale) - frameDeduct - m1IT - m1IB - m2I * 2;
                // CSS-border approach: faux mat is a div with white CSS border.
                // The inner area (cleared by the existing art-fill) reveals what's
                // beneath. The border IS the visible white band.
                const borderPx = border * elevScale;
                faux.style.cssText = `position:absolute; top:${top}px; left:${left}px; width:${Math.max(0, width)}px; height:${Math.max(0, height)}px; border:${borderPx}px solid #ffffff; box-sizing:border-box; pointer-events:none;`;
                // Inset shadow from the mat (or frame) above onto the white paper.
                // Magnitude similar to mat 2's inset shadow but slightly stronger
                // when no mats above (frame casts directly).
                if (m1Active || m2Active) {
                    faux.style.boxShadow = `inset 0 ${2 * elevScale}px ${6 * elevScale}px rgba(0,0,0,0.3)`;
                } else {
                    faux.style.boxShadow = `inset 0 ${4 * elevScale}px ${10 * elevScale}px rgba(0,0,0,0.45)`;
                }
                el.appendChild(faux);
            }
        }
        
        // Use effective values — when Mat 1 is off, mat dimensions don't push the art inward
        const effM1T = m1Active ? f.m1T : 0; const effM1B = m1Active ? f.m1B : 0;
        const effM1L = m1Active ? f.m1L : 0; const effM1R = m1Active ? f.m1R : 0;

        // SHADOW BOX layers (backer fills frame interior; paper sits on top).
        // The on-screen elevation uses simple CSS rects + drop shadow. The export
        // overlay (canvas renderer) handles torn edges; on-screen torn is hinted
        // with a dashed border instead of trying to redraw the irregular outline in DOM.
        if (useFM) {
            const backerColor = f.sbBackerColorHex || '#ffffff';
            const paperColor = f.sbPaperColorHex || '#ffffff';
            const frameInsetPx = (f.fType === 'color') ? 0 : (effFw * elevScale);

            // Backer fills the frame interior
            const backer = document.createElement('div');
            backer.className = 'sb-backer-visual';
            backer.style.cssText = `position:absolute; top:${frameInsetPx}px; left:${frameInsetPx}px; width:${(f.w - effFw*2) * elevScale}px; height:${(f.h - effFw*2) * elevScale}px; background:${backerColor}; pointer-events:none; z-index:2;`;
            el.appendChild(backer);

            // Paper sits on the backer, offset by paperMargin. Drop shadow onto backer.
            const paper = document.createElement('div');
            paper.className = 'sb-paper-visual';
            const paperPx = sbPaperMarginVal * elevScale;
            const isTorn = (f.sbPaperEdge || 'clean') === 'torn';
            paper.style.cssText = `position:absolute; box-sizing:border-box; top:${frameInsetPx + paperPx}px; left:${frameInsetPx + paperPx}px; width:${(f.w - effFw*2 - sbPaperMarginVal*2) * elevScale}px; height:${(f.h - effFw*2 - sbPaperMarginVal*2) * elevScale}px; background:${paperColor}; box-shadow: ${2 * elevScale}px ${4 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.45); ${isTorn ? `border: 1px dashed rgba(0,0,0,0.4);` : ''} pointer-events:none; z-index:3;`;
            el.appendChild(paper);
        }

        let artW, artH, artTopOffset, artLeftOffset;
        if (isFloater) {
            // Floater: opening positioned at floaterInset from outer edge, regardless of fW.
            artW = f.w - floaterInsetVal * 2; artH = f.h - floaterInsetVal * 2;
            artTopOffset = floaterInsetVal * elevScale;
            artLeftOffset = floaterInsetVal * elevScale;
        } else if (isFrameless) {
            // Frameless canvas: artwork spans the entire face (no frame, no insets).
            artW = f.w; artH = f.h;
            artTopOffset = 0;
            artLeftOffset = 0;
        } else if (useFM) {
            // Float mount: opening sits inside the paper at paperBorder offset
            const frameInset = (f.fType === 'color') ? 0 : effFw;
            artW = f.w - effFw*2 - sbPaperMarginVal*2 - sbPaperBorderVal*2;
            artH = f.h - effFw*2 - sbPaperMarginVal*2 - sbPaperBorderVal*2;
            artTopOffset = (frameInset + sbPaperMarginVal + sbPaperBorderVal) * elevScale;
            artLeftOffset = (frameInset + sbPaperMarginVal + sbPaperBorderVal) * elevScale;
        } else {
            artW = f.w - effFw*2 - effM1L - effM1R - m2Val*2;
            artH = f.h - effFw*2 - effM1T - effM1B - m2Val*2;
            artTopOffset = (f.fType === 'color') ? ((effM1T + m2Val) * elevScale) : ((effFw + effM1T + m2Val) * elevScale);
            artLeftOffset = (f.fType === 'color') ? ((effM1L + m2Val) * elevScale) : ((effFw + effM1L + m2Val) * elevScale);
        }
        const art = document.createElement('div'); art.className = 'art-visual';
        
        art.style.cssText = `top:${artTopOffset}px; left:${artLeftOffset}px; width:${artW*elevScale}px; height:${artH*elevScale}px; z-index:4;`;
        // Uploaded artwork: when present, fill the opening with the image
        // (cover-fit) rather than the grey placeholder. _showArtwork is a global
        // view toggle so the "beauty" presentation shows art and the technical
        // drawing can hide it.
        const hasArtwork = f.artworkUrl && (typeof _showArtwork === 'undefined' || _showArtwork);
        if (isFloater) {
            // Floater: subtle dashed outline + inner shadow (image opening recessed into the canvas).
            art.style.boxShadow = `inset 0 0 ${10 * elevScale}px rgba(0,0,0,0.35)`;
            art.style.border = '1px dashed rgba(0,0,0,0.25)';
        } else if (isFrameless || useFM) {
            // Frameless canvas & float mount: dashed outline only — NO inner shadow.
            // Frameless has no surrounding material; float mount per spec must not cast shadow on paper.
            art.style.border = '1px dashed rgba(0,0,0,0.25)';
            // Opaque fill: a print/canvas isn't see-through, so the white paper
            // beneath must not bleed through (that translucent-over-white bleed
            // read as a spurious white border in the elevation). Only a real
            // paper margin / white border should show white.
            art.style.background = 'rgb(120,120,120)';
        } else {
            art.style.boxShadow = `inset 0 ${2 * elevScale}px ${8 * elevScale}px rgba(0,0,0,0.2)`;
        }
        if (hasArtwork) {
            art.style.backgroundImage = `url(${f.artworkUrl})`;
            art.style.backgroundSize = 'cover';
            art.style.backgroundPosition = 'center';
            art.style.backgroundRepeat = 'no-repeat';
            art.style.boxShadow = 'none';
        }
        
        const unitSuffix = unitInfo(elevUnit).suffix;
        art.innerText = (hasArtwork) ? "" : ((artW > 0) ? `${artW.toFixed(1)}${unitSuffix}\nx\n${artH.toFixed(1)}${unitSuffix}` : "");
        el.appendChild(art);
        
        const labelTag = document.createElement('div'); labelTag.className = 'frame-id-tag';
        labelTag.style.left = (f.x * elevScale) + 'px'; labelTag.style.bottom = ((f.y + f.h) * elevScale) + 'px';
        labelTag.innerText = f.letter; labelLayer.appendChild(labelTag);

        const odTag = document.createElement('div'); odTag.className = 'od-id-tag';
        odTag.style.left = ((f.x + f.w) * elevScale) + 'px'; odTag.style.bottom = ((f.y + f.h) * elevScale) + 'px';
        // OD label appends the unit directly without leading space ('24"x36"', '60x90cm')
        const odSuffix = elevUnit === 'in' ? '"' : elevUnit;
        odTag.innerText = `OD: ${f.w.toFixed(1)}x${f.h.toFixed(1)}${odSuffix}`; odLayer.appendChild(odTag);

        const crossH = document.createElement('div'); crossH.className = 'crosshair-h';
        // Crosshair padding: 6 inches worth in whatever unit we're in
        const chPad = 6 * unitFactor('in', elevUnit);
        const chHalf = chPad / 2;
        crossH.style.width = ((f.w + chPad) * elevScale) + 'px'; crossH.style.left = ((f.x - chHalf) * elevScale) + 'px'; crossH.style.bottom = ((f.y + f.h/2) * elevScale) + 'px';
        const crossV = document.createElement('div'); crossV.className = 'crosshair-v';
        crossV.style.height = ((f.h + chPad) * elevScale) + 'px'; crossV.style.left = ((f.x + f.w/2) * elevScale) + 'px'; crossV.style.bottom = ((f.y - chHalf) * elevScale) + 'px';
        centerLayer.appendChild(crossH); centerLayer.appendChild(crossV);
        
        makeElevDraggable(el, idx); frameLayer.appendChild(el);
    });

    makeElevDraggable(pWrap, 'person');
    drawElevTargetedSpacing(); drawFloorCeilingDims(); drawElevGuides(wallW, wallH);
    // Re-wire hover pairing AFTER frames are rendered. The wiring is also done
    // in initElevControls (to handle panel-side events), but frame elements get
    // re-created by drawElevAll, so we re-attach here. The wireElevHoverPairing
    // function is idempotent — re-running it doesn't double-bind because it
    // uses fresh DOM selection on each call.
    wireElevHoverPairing();

    // Render group-dimension callouts (dashed bounding boxes + measurements)
    // for the current elevation. Done after frames so the boxes overlay them.
    renderGroupDims();
    renderCustomLines();

    // Unit legend (top-left corner of the wall). Shown only when the interior
    // suffix is OFF — so the reader knows what unit the bare numbers are in.
    // When the suffix is ON, every number is self-labeling and the legend is
    // hidden to avoid redundancy.
    (function renderUnitLegend() {
        const wallEl = document.getElementById('wall');
        if (!wallEl) return;
        let legend = document.getElementById('elev-unit-legend');
        if (legend) legend.remove();
        // Legend and per-number suffixes are mutually exclusive: when suffixes
        // are ON each number carries its unit, so the legend is hidden.
        if (showUnitSuffix) return;
        legend = document.createElement('div');
        legend.id = 'elev-unit-legend';
        legend.className = 'elev-unit-legend';
        legend.textContent = unitLegendText();
        wallEl.appendChild(legend);
    })();

    // Sync the Group Box + Edge Gap Layout Guides buttons' blue state to
    // reflect whether those annotations currently exist + are visible.
    if (typeof syncLayoutGuideButtonStates === 'function') {
        syncLayoutGuideButtonStates();
    }

    // Wall-background click handler: clicking on the wall but NOT on a frame
    // clears all selections. event.target === wall ensures we only clear when
    // the click is on the wall itself, not on a child element (frames, hang
    // line, person, etc). Idempotent — replaces any previous binding.
    wall.onclick = function(e) {
        if (e.target === wall && elevFrames.some(f => f.selected)) {
            elevFrames.forEach(f => f.selected = false);
            drawElevAll();
        }
    };
}

// Render all group-dimension callouts for the current elevation into
// #group-dim-layer. Each callout = dashed bbox + width line (above) + height
// line (left) + measurement labels. Recomputed every drawElevAll so the box
// tracks frame moves automatically.
function renderGroupDims() {
    const layer = document.getElementById('group-dim-layer');
    if (!layer) return;
    layer.innerHTML = '';
    // Hide panel: skip group boxes entirely when hidden.
    if (typeof dimVisibility !== 'undefined' && !dimVisibility.groupBox) return;
    const dims = getElevGroupDims();
    if (!dims.length) return;

    const wallH = parseFloat(document.getElementById('wallH').value) || 1;
    // Convert elevation-inch coords → layer pixels. x grows right; the layer's
    // y grows DOWN, but frame y is measured from the BOTTOM, so we flip:
    //   pxTop = (wallH - (y + h)) * scale
    const sx = (inches) => inches * elevScale;
    const pxTopOf = (yBottomInches, hInches) => (wallH - (yBottomInches + hInches)) * elevScale;

    dims.forEach(entry => {
        const bbox = computeGroupDimBBox(entry);
        if (!bbox) return; // referenced frames gone

        const st = entry.style || annotationStyle;
        const color = st.color || '#e00000';
        const weight = st.weight || 2;
        const dashCss = st.dash ? `${Math.max(4, weight * 3)}px ${Math.max(3, weight * 2)}px` : 'none';
        const fontSize = st.fontSize || 13;

        // Bounding box in layer pixels. GAP=0 so the dashed line sits exactly
        // on the frames' bounding edge (box-sizing:border-box keeps the stroke
        // centered on that edge). Dimension + extension lines anchor to this box.
        const GAP = 0;
        const boxLeft = sx(bbox.minX) - GAP;
        const boxTop = pxTopOf(bbox.minY, bbox.h) - GAP;
        const boxW = sx(bbox.w) + GAP * 2;
        const boxH = sx(bbox.h) + GAP * 2;

        // ── Inner bounding rectangle: DASHED (per client convention) ──
        const rect = document.createElement('div');
        rect.style.cssText =
            `position:absolute; left:${boxLeft}px; top:${boxTop}px; width:${boxW}px; height:${boxH}px;` +
            `border:${weight}px dashed ${color}; box-sizing:border-box;` +
            `pointer-events:none; z-index:1;`;
        layer.appendChild(rect);
        // Small transparent hover zone around the × corner only (doesn't cover
        // the whole box, so it won't block frame interaction underneath).
        const hoverZone = document.createElement('div');
        hoverZone.setAttribute('data-export-skip', '1');
        hoverZone.setAttribute('data-html2canvas-ignore', 'true');
        hoverZone.style.cssText =
            `position:absolute; left:${boxLeft + boxW - 20}px; top:${boxTop - 20}px; width:40px; height:40px;` +
            `pointer-events:auto; background:transparent; z-index:5;`;

        // mkLine: a straight line. `lineStyle` ('solid' | 'dashed') lets us
        // make dimension lines solid and extension lines dashed.
        const mkLine = (x, y, w, h, lineStyle) => {
            const ls = lineStyle || 'solid';
            const d = document.createElement('div');
            d.style.cssText =
                `position:absolute; left:${x}px; top:${y}px; ` +
                (w > h
                    ? `width:${w}px; height:0; border-top:${weight}px ${ls} ${color};`
                    : `height:${h}px; width:0; border-left:${weight}px ${ls} ${color};`) +
                `pointer-events:none; z-index:1;`;
            return d;
        };
        // Small end-tick perpendicular to a dimension line (always solid).
        const mkTick = (cx, cy, vertical) => {
            const TICK = 6;
            const d = document.createElement('div');
            if (vertical) {
                d.style.cssText = `position:absolute; left:${cx}px; top:${cy - TICK}px; height:${TICK * 2}px; width:0; border-left:${weight}px solid ${color}; pointer-events:none; z-index:1;`;
            } else {
                d.style.cssText = `position:absolute; left:${cx - TICK}px; top:${cy}px; width:${TICK * 2}px; height:0; border-top:${weight}px solid ${color}; pointer-events:none; z-index:1;`;
            }
            return d;
        };
        // Measurement label — opaque white background so the number stays
        // readable even where dimension/extension lines cross. No border
        // (cleaner look per user preference).
        const mkLabel = (text, cx, cy) => {
            const l = document.createElement('div');
            l.textContent = text;
            const fam = (st.fontFamily || annotationStyle.fontFamily || 'Arial, Helvetica, sans-serif');
            const fwt = (st.fontWeight || annotationStyle.fontWeight || 600);
            l.style.cssText =
                `position:absolute; left:${cx}px; top:${cy}px; transform:translate(-50%,-50%);` +
                `display:inline-flex; align-items:center; justify-content:center; line-height:1;` +
                `color:${color}; font-size:${fontSize}px; font-weight:${fwt}; font-family:${fam}; white-space:nowrap;` +
                `background:#fff; padding:2px 5px; border-radius:3px; box-sizing:border-box;` +
                `pointer-events:none; z-index:4;`;
            return l;
        };

        const OFFSET = 26; // base px gap between bbox and dimension line

        // ── WIDTH dimension line (above the box) — SOLID line, DASHED extensions ──
        if (entry.showWidth !== false) {
            const wId = 'group-' + entry.id + '-w';
            // Drag offset stored in inches; convert to px (further UP = larger gap).
            const wOffPx = getDimOffset(wId) * elevScale;
            const lineY = boxTop - OFFSET - Math.max(0, wOffPx);
            const totalGap = boxTop - lineY;
            layer.appendChild(mkLine(boxLeft, lineY, boxW, 0, 'solid'));   // solid dim line
            layer.appendChild(mkTick(boxLeft, lineY, true));
            layer.appendChild(mkTick(boxLeft + boxW, lineY, true));
            // Dashed extension lines from box corners up to the dim line
            layer.appendChild(mkLine(boxLeft, lineY, 0, totalGap, 'dashed'));
            layer.appendChild(mkLine(boxLeft + boxW, lineY, 0, totalGap, 'dashed'));
            const wLblOffPx = getLabelOffset(wId) * elevScale;
            const wLbl = mkLabel(elevFmtU(bbox.w), boxLeft + boxW / 2 + wLblOffPx, lineY);
            wLbl.style.pointerEvents = 'auto'; wLbl.style.cursor = 'move'; wLbl.style.zIndex = '52';
            attachGroupLabelDrag(wLbl, 'h', wId, boxW * 0.5 * elevScale);
            layer.appendChild(wLbl);
            buildGroupArrows(wLbl, 'h', wId, boxW * 0.5 * elevScale);
        }

        // ── HEIGHT dimension line (left of the box) — SOLID line, DASHED extensions ──
        if (entry.showHeight !== false) {
            const hId = 'group-' + entry.id + '-h';
            const hOffPx = getDimOffset(hId) * elevScale;
            const lineX = boxLeft - OFFSET - Math.max(0, hOffPx);
            const totalGap = boxLeft - lineX;
            layer.appendChild(mkLine(lineX, boxTop, 0, boxH, 'solid'));    // solid dim line
            layer.appendChild(mkTick(lineX, boxTop, false));
            layer.appendChild(mkTick(lineX, boxTop + boxH, false));
            // Dashed extension lines from box corners out to the dim line
            layer.appendChild(mkLine(lineX, boxTop, totalGap, 0, 'dashed'));
            layer.appendChild(mkLine(lineX, boxTop + boxH, totalGap, 0, 'dashed'));
            const hLblOffPx = getLabelOffset(hId) * elevScale; // up = +
            const hl = mkLabel(elevFmtU(bbox.h), lineX, boxTop + boxH / 2 - hLblOffPx);
            hl.style.transform = 'translate(-50%,-50%) rotate(-90deg)';
            hl.style.pointerEvents = 'auto'; hl.style.cursor = 'move'; hl.style.zIndex = '52';
            attachGroupLabelDrag(hl, 'v', hId, boxH * 0.5 * elevScale);
            layer.appendChild(hl);
            buildGroupArrows(hl, 'v', hId, boxH * 0.5 * elevScale);
        }

        // ── Delete affordance: small × at the box's top-right corner. Tagged
        // so the SVG/PNG export skips it (it's an editor control, not artwork).
        const del = document.createElement('div');
        del.className = 'group-dim-delete';
        del.setAttribute('data-export-skip', '1');
        del.setAttribute('data-html2canvas-ignore', 'true');
        del.textContent = '×';
        del.title = 'Remove group dimension';
        del.style.cssText =
            `position:absolute; left:${boxLeft + boxW - 9}px; top:${boxTop - 9}px;` +
            `width:18px; height:18px; line-height:16px; text-align:center; border-radius:50%;` +
            `background:${color}; color:#fff; font-size:14px; font-weight:bold; cursor:pointer;` +
            `z-index:6; opacity:0; transition:opacity 0.15s; user-select:none; pointer-events:auto;`;
        const showDel = () => { del.style.opacity = '0.95'; };
        const hideDel = () => { del.style.opacity = '0'; };
        del.onmouseenter = showDel;
        del.onmouseleave = hideDel;
        hoverZone.onmouseenter = showDel;
        hoverZone.onmouseleave = hideDel;
        del.onclick = (e) => { e.stopPropagation(); removeGroupDim(entry.id); };
        layer.appendChild(hoverZone);
        layer.appendChild(del);
    });
}

// Unit suffix for measurement labels (", cm, mm).
function unitSuffix() {
    if (elevUnit === 'in') return '"';
    return ' ' + elevUnit;
}

// Whether INTERIOR dimension labels (spacing, group box, hang height, edge
// gaps) include the unit suffix. Default OFF for a cleaner look that fits
// tight spaces; a corner legend shows the active unit instead. The OUTER
// wall dimensions ALWAYS show their suffix regardless (plenty of room
// outside the elevation), so they bypass this toggle.
let showUnitSuffix = false;

function loadUnitSuffixPref() {
    try {
        const raw = localStorage.getItem('showUnitSuffix');
        if (raw !== null) showUnitSuffix = (raw === '1');
    } catch (e) { /* default */ }
}

function saveUnitSuffixPref() {
    try { localStorage.setItem('showUnitSuffix', showUnitSuffix ? '1' : '0'); }
    catch (e) { /* ignore */ }
}

// Format an INTERIOR dimension value: number + suffix only when the toggle
// is on. Use this everywhere except the outer wall dims.
function elevFmtU(val) {
    return elevFmt(val) + (showUnitSuffix ? unitSuffix() : '');
}

// Human-readable unit name for the corner legend.
function unitLegendText() {
    const names = { in: 'INCHES', cm: 'CENTIMETERS', mm: 'MILLIMETERS' };
    return 'ALL DIMENSIONS IN ' + (names[elevUnit] || elevUnit.toUpperCase());
}

// Toggle the interior-suffix preference + re-render. Updates the button
// state and the legend visibility.
function toggleUnitSuffix(btn) {
    showUnitSuffix = !showUnitSuffix;
    saveUnitSuffixPref();
    if (btn) btn.classList.toggle('active', showUnitSuffix);
    drawElevAll();
}

// ── Annotation style modal ──
function openAnnotationStyleModal() {
    // The standalone style modal was merged into Settings. Redirect.
    openPrecisionModal();
}

function closeAnnotationStyleModal() {
    document.getElementById('precisionModal').style.display = 'none';
    pushHistory(); // the style changes to existing callouts are undoable
}

function setAnnotDash(on) {
    annotationStyle.dash = !!on;
    const onBtn = document.getElementById('annotDashOn');
    const offBtn = document.getElementById('annotDashOff');
    if (onBtn) onBtn.classList.toggle('active', !!on);
    if (offBtn) offBtn.classList.toggle('active', !on);
    applyAnnotationStyleFromModal();
}

// Read the modal inputs into annotationStyle, propagate to all existing
// group dims, persist, and re-render. Called live on every input change so
// the user sees the effect immediately.
function applyAnnotationStyleFromModal() {
    const c = document.getElementById('annotColor');
    const w = document.getElementById('annotWeight');
    const fs = document.getElementById('annotFontSize');
    if (c) { annotationStyle.color = c.value; const hx = document.getElementById('annotColorHex'); if (hx) hx.textContent = c.value; }
    if (w) { annotationStyle.weight = parseInt(w.value, 10) || 2; const wv = document.getElementById('annotWeightVal'); if (wv) wv.textContent = annotationStyle.weight + 'px'; }
    if (fs) { annotationStyle.fontSize = parseInt(fs.value, 10) || 13; const fv = document.getElementById('annotFontSizeVal'); if (fv) fv.textContent = annotationStyle.fontSize + 'px'; }
    const ff = document.getElementById('annotFontFamily');
    if (ff) annotationStyle.fontFamily = ff.value;
    // Propagate to every existing group dim across ALL elevations so the
    // style is consistent project-wide.
    elevations.forEach(elev => {
        if (Array.isArray(elev.groupDims)) {
            elev.groupDims.forEach(gd => { gd.style = Object.assign({}, annotationStyle); });
        }
    });
    applyAnnotationStyleToCSSVars(); // update arch dims, frame dims, OD tags, etc.
    saveAnnotationStyle();
    drawElevAll();
}
// ─────────────────────────────────────────────────────────────────────
// When a frame is dragged, after the normal whole-inch snapping, we check
// if any of its key alignment points (left edge, right edge, center) come
// within a small threshold of another frame's or the wall's alignment
// points. If so, we snap to exact alignment and draw a guide line so the
// user sees what they're aligning to.
//
// Threshold is defined in PIXELS so it stays consistent at any zoom level;
// converted to data units (inches/cm) per call by dividing by elevScale.
const SNAP_THRESHOLD_PX = 6;
// Snap-to-align on/off (the red alignment guide lines while dragging). Default
// on; user can disable it in elevation settings when it feels intrusive.
let elevSnapEnabled = true;
function loadSnapPref() {
    try { const v = localStorage.getItem('elevSnapEnabled'); if (v !== null) elevSnapEnabled = (v === '1'); }
    catch (e) {}
}
function saveSnapPref() {
    try { localStorage.setItem('elevSnapEnabled', elevSnapEnabled ? '1' : '0'); } catch (e) {}
}
function toggleSnapEnabled(on) {
    elevSnapEnabled = (typeof on === 'boolean') ? on : !elevSnapEnabled;
    saveSnapPref();
    const cb = document.getElementById('snapEnabledToggle');
    if (cb) cb.checked = elevSnapEnabled;
    if (!elevSnapEnabled && typeof clearSnapGuides === 'function') clearSnapGuides();
}

// Dimension-drag snap: when dragging a measurement line, snap its offset to a
// round increment AND to alignment with other dimension lines' offsets (so
// e.g. left/right edge-gap lines line up at the same height). Toggleable in
// elevation settings. Increment is in inches (unit-independent feel).
let elevDimSnapEnabled = true;
const DIM_SNAP_INCREMENT_IN = 1;     // round to nearest inch
const DIM_SNAP_ALIGN_TOL_IN = 0.75;  // align to another dim within this
function loadDimSnapPref() {
    try { const v = localStorage.getItem('elevDimSnapEnabled'); if (v !== null) elevDimSnapEnabled = (v === '1'); }
    catch (e) {}
}
function saveDimSnapPref() {
    try { localStorage.setItem('elevDimSnapEnabled', elevDimSnapEnabled ? '1' : '0'); } catch (e) {}
}
function toggleDimSnapEnabled(on) {
    elevDimSnapEnabled = (typeof on === 'boolean') ? on : !elevDimSnapEnabled;
    saveDimSnapPref();
    const cb = document.getElementById('dimSnapEnabledToggle');
    if (cb) cb.checked = elevDimSnapEnabled;
}
// Snap an offset value (in CURRENT unit) for a dim being dragged. `selfId` is
// excluded from the alignment pool. Returns { value, aligned } where aligned
// is the id we snapped to (for an optional guide), or null.
function snapDimOffset(valueCurrentUnit, selfId) {
    if (!elevDimSnapEnabled) return { value: valueCurrentUnit, aligned: null };
    // Work in inches for unit-independence.
    const inToCur = unitFactor('in', elevUnit);
    let valIn = valueCurrentUnit * unitFactor(elevUnit, 'in');
    // 1) align to another dim's offset (inches) if within tolerance
    const offs = getElevDimOffsets();
    let aligned = null, best = DIM_SNAP_ALIGN_TOL_IN;
    Object.keys(offs).forEach(id => {
        if (id === selfId) return;
        const d = Math.abs(offs[id] - valIn);
        if (d < best) { best = d; valIn = offs[id]; aligned = id; }
    });
    // 2) if not aligned to a neighbor, snap to the round increment
    if (!aligned) {
        valIn = Math.round(valIn / DIM_SNAP_INCREMENT_IN) * DIM_SNAP_INCREMENT_IN;
    }
    return { value: valIn * inToCur, aligned };
}

// Compute snap targets for a frame given its candidate new position.
// Returns { snappedX, snappedY, guides } where guides is an array of
// { kind: 'v'|'h', value: number } — vertical or horizontal lines to draw.
// The frame being dragged itself is excluded from the snap pool.
//
// Geometry: for each (dragged-frame-anchor) × (target-anchor) pair, compute
// the candidate dragged x/y position that would align them. Dragged anchors:
// left/right/center. Target anchors: same set for each other frame, plus
// wall edges/center and the hang line. 9 candidates per neighbor + wall + hang.
function computeSnapForDrag(draggedIdx, candX, candY) {
    const f = elevFrames[draggedIdx];
    if (!f) return { snappedX: candX, snappedY: candY, guides: [] };
    const wallW = parseFloat(document.getElementById('wallW').value) || 1;
    const wallH = parseFloat(document.getElementById('wallH').value) || 1;
    const threshold = SNAP_THRESHOLD_PX / elevScale;
    const hangVal = (typeof getHangHeight === 'function') ? getHangHeight() : 57;

    // Collect target anchor X values: vertical lines that the dragged frame's
    // left edge, right edge, or center could snap to.
    const xTargets = [];  // { value, kind }
    xTargets.push({ value: 0, kind: 'wall-left' });
    xTargets.push({ value: wallW, kind: 'wall-right' });
    xTargets.push({ value: wallW / 2, kind: 'wall-center' });
    elevFrames.forEach((other, i) => {
        if (i === draggedIdx || !other.active) return;
        xTargets.push({ value: other.x, kind: 'frame-left' });
        xTargets.push({ value: other.x + other.w, kind: 'frame-right' });
        xTargets.push({ value: other.x + other.w / 2, kind: 'frame-center' });
    });

    // Same for Y (target horizontal lines)
    const yTargets = [];
    yTargets.push({ value: 0, kind: 'wall-bottom' });
    yTargets.push({ value: wallH, kind: 'wall-top' });
    yTargets.push({ value: hangVal, kind: 'hang' });
    elevFrames.forEach((other, i) => {
        if (i === draggedIdx || !other.active) return;
        yTargets.push({ value: other.y, kind: 'frame-bottom' });
        yTargets.push({ value: other.y + other.h, kind: 'frame-top' });
        yTargets.push({ value: other.y + other.h / 2, kind: 'frame-vcenter' });
    });

    // For each (dragged-anchor × target) pair, compute the candidate dragged x
    // position. Then pick the one closest to candX within threshold.
    // Dragged X anchors: f.x (left), f.x + f.w (right), f.x + f.w/2 (center).
    // For an anchor to LAND at target.value, the corresponding f.x is:
    //   left anchor:   f.x = target.value
    //   right anchor:  f.x = target.value - f.w
    //   center anchor: f.x = target.value - f.w/2
    let bestX = null, bestXDist = threshold;
    xTargets.forEach(t => {
        [
            { x: t.value,           anchor: 'left' },
            { x: t.value - f.w,     anchor: 'right' },
            { x: t.value - f.w / 2, anchor: 'center' },
        ].forEach(c => {
            const d = Math.abs(c.x - candX);
            if (d < bestXDist) { bestXDist = d; bestX = { x: c.x, guideValue: t.value, kind: t.kind, anchor: c.anchor }; }
        });
    });

    let bestY = null, bestYDist = threshold;
    yTargets.forEach(t => {
        [
            { y: t.value,           anchor: 'bottom' },
            { y: t.value - f.h,     anchor: 'top' },
            { y: t.value - f.h / 2, anchor: 'center' },
        ].forEach(c => {
            const d = Math.abs(c.y - candY);
            if (d < bestYDist) { bestYDist = d; bestY = { y: c.y, guideValue: t.value, kind: t.kind, anchor: c.anchor }; }
        });
    });

    const guides = [];
    let snappedX = candX, snappedY = candY;
    if (bestX) {
        snappedX = bestX.x;
        guides.push({ axis: 'v', value: bestX.guideValue });
    }
    if (bestY) {
        snappedY = bestY.y;
        guides.push({ axis: 'h', value: bestY.guideValue });
    }
    return { snappedX, snappedY, guides };
}

// Render snap guide lines in the snap-guide-layer. Cleared on each call.
// 'v' guides span full wall height at a given x; 'h' guides span full wall
// width at a given y. Distinct color (red) so they stand out against the
// dashed gray spacing dims and accent-colored hang line.
function renderSnapGuides(guides) {
    const layer = document.getElementById('snap-guide-layer');
    if (!layer) return;
    layer.innerHTML = '';
    guides.forEach(g => {
        const el = document.createElement('div');
        el.className = 'snap-guide';
        if (g.axis === 'v') {
            el.style.cssText = `position:absolute; left:${g.value * elevScale}px; bottom:0; top:0; width:0; border-left:1px solid #ff3b3b; pointer-events:none; z-index:60;`;
        } else {
            el.style.cssText = `position:absolute; left:0; right:0; bottom:${g.value * elevScale}px; height:0; border-bottom:1px solid #ff3b3b; pointer-events:none; z-index:60;`;
        }
        layer.appendChild(el);
    });
}

function clearSnapGuides() {
    const layer = document.getElementById('snap-guide-layer');
    if (layer) layer.innerHTML = '';
}
// ─────────────────────────────────────────────────────────────────────
// END SNAP-TO-OTHER-FRAMES
// ─────────────────────────────────────────────────────────────────────

function makeElevDraggable(el, idx) {
    el.onmousedown = function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        const startX = e.clientX, startY = e.clientY;
        let sx = e.clientX, sy = e.clientY;
        let totalMove = 0;  // Tracks cumulative absolute movement to distinguish click from drag
        // Capture modifier state at mousedown time. By mouseup the user may
        // have released the keys; we want the state at the moment of click.
        const isModifierClick = e.ctrlKey || e.metaKey || e.shiftKey;

        // Suspend highlight transitions during drag — drawElevAll fires many
        // times per second, recreating frame elements each time, and CSS
        // transitions on the rebuilt elements caused a visible flicker.
        // Body class is removed on mouseup so highlights animate normally again.
        document.body.classList.add('dragging-frame');

        document.onmousemove = function(e) {
            let dx = (sx - e.clientX)/elevScale, dy = (sy - e.clientY)/elevScale; sx = e.clientX; sy = e.clientY;
            totalMove += Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
            // Drag snap-to-grid increment. User-configurable via the Settings
            // modal (dragSnap input). Defaults to 1in / 1cm if input is
            // missing or invalid. Independent of the visual grid size.
            let snap = 1 * unitFactor('in', elevUnit);
            const dragSnapEl = document.getElementById('dragSnap');
            if (dragSnapEl) {
                const v = parseFloat(dragSnapEl.value);
                if (!isNaN(v) && v > 0) snap = v;
            }
            if(idx === 'person') { 
                elevPersonPos.x -= dx; 
                elevPersonPos.placed = true; // user moved it — lock position
            } else { 
                let frame = elevFrames[idx]; let prevX = frame.x; let prevY = frame.y;
                // Step 1: whole-unit snap (existing behavior)
                let newX = Math.round((frame.x - dx)/snap)*snap;
                let newY = Math.round((frame.y + dy)/snap)*snap;
                // Step 2: snap-to-alignment with other frames + wall + hang line.
                // Only engaged for SINGLE-FRAME drags. Grouped drags keep relative
                // spacing within the group, so frame-to-frame snapping would
                // produce surprising jumps as group members snap independently.
                let activeGuides = [];
                if (!frame.isGrouped && (typeof elevSnapEnabled === 'undefined' || elevSnapEnabled)) {
                    const snapResult = computeSnapForDrag(idx, newX, newY);
                    newX = snapResult.snappedX;
                    newY = snapResult.snappedY;
                    activeGuides = snapResult.guides;
                }
                frame.x = newX; frame.y = newY;
                let actualDx = frame.x - prevX; let actualDy = frame.y - prevY;
                if(frame.isGrouped) { elevFrames.forEach((f, i) => { if(i !== idx && f.active && f.isGrouped) { f.x += actualDx; f.y += actualDy; } }); }
                // Render snap guides (or clear them if no snap is active)
                renderSnapGuides(activeGuides);
            }
            drawElevAll();
        };
        document.onmouseup = (upEvent) => {
            document.onmousemove = null;
            document.body.classList.remove('dragging-frame');
            clearSnapGuides();

            // Discriminate CLICK vs DRAG: total movement < 3px = treat as click.
            // Selection behavior:
            //   - Plain click on a frame: select ONLY that frame (clear others)
            //   - Ctrl/Cmd/Shift+click: toggle that frame's selection (multi-select)
            //   - Plain click on an already-selected solo frame: deselect it
            //   - Person element (idx === 'person'): no selection concept
            const dxFromStart = Math.abs((upEvent?.clientX ?? sx) - startX);
            const dyFromStart = Math.abs((upEvent?.clientY ?? sy) - startY);
            const totalDelta = dxFromStart + dyFromStart;
            const isClick = totalDelta < 3;
            if (isClick && typeof idx === 'number' && elevFrames[idx]) {
                if (isModifierClick) {
                    // Multi-select: toggle THIS frame, leave others alone
                    elevFrames[idx].selected = !elevFrames[idx].selected;
                } else {
                    // Single-select: clear all other selections, select THIS one.
                    // If it was the only one selected, treat re-click as deselect.
                    const wasSolo = elevFrames[idx].selected && elevFrames.filter(f => f.selected).length === 1;
                    elevFrames.forEach(f => { f.selected = false; });
                    if (!wasSolo) elevFrames[idx].selected = true;
                }
                drawElevAll();
                // Selection state is NOT pushed to history — it's pure UI state,
                // not project data. Undo should restore the position of frames,
                // not what was selected.
            } else if (!isClick && typeof idx === 'number') {
                // Real drag moved a frame (or grouped frames). One snapshot for
                // the whole drag operation — pushed on mouseup so it represents
                // the final position, not every intermediate mousemove.
                pushHistory();
            }
        };
    };
}

function drawElevGuides(wallW, wallH) {
    const guideLayer = document.getElementById('guide-layer'); guideLayer.innerHTML = '';
    const archLayer = document.getElementById('arch-dim-layer'); archLayer.innerHTML = '';
    
    const cl = document.createElement('div'); cl.className = 'center-guide';
    cl.style.left = ((wallW / 2) * elevScale) + 'px'; cl.style.bottom = '0px';
    // WALL CENTER label sits OUTSIDE the wall, just above the top of the
    // center line (was inside near the top, where it clashed with frames/dims).
    cl.innerHTML = `<span class="center-label">WALL\u00A0CENTER</span>`;
    guideLayer.appendChild(cl);

    const hangVal = getHangHeight();
    if(hangVal < wallH) {
        // Horizontal hang line with "HANG HEIGHT" label OUTSIDE the wall on
        // the left, vertically centered on the dashed line. Because it's a
        // child of the hang line (positioned at the hang height), it always
        // tracks the line when the hang height changes.
        const ceHL = elevations[currentElevIndex];
        const hangLabelYOff = (ceHL && typeof ceHL.hangLabelYOffset === 'number') ? ceHL.hangLabelYOffset : 0;
        const hl = document.createElement('div'); hl.className = 'hang-guide';
        hl.style.bottom = (hangVal * elevScale) + 'px';
        // The "HANG HEIGHT" word can be nudged up/down to avoid colliding with
        // the wall-height dimension (notably in mm). Offset stored in inches
        // and applied to the label's `top` (its transform is used by CSS for
        // the vertical rotation, so we must not override it).
        const hlYpx = hangLabelYOff * unitFactor('in', elevUnit) * elevScale;
        hl.innerHTML = `<span class="hang-label" style="top:calc(50% - ${hlYpx}px); cursor:ns-resize; pointer-events:auto;">HANG HEIGHT</span>`;
        guideLayer.appendChild(hl);
        attachHangLabelDrag(hl, hl.querySelector('.hang-label'), hlYpx);

        // Floor-to-hangline vertical dimension. Shows the hang height as a
        // measured callout from the floor up to the hang line. Positioned a
        // small inset from the left wall edge, plus a user drag offset so it
        // can be slid left/right (the HEIGHT VALUE stays controlled by
        // settings — only the line's horizontal position moves).
        const ce = elevations[currentElevIndex];
        const hangDimOffIn = (ce && typeof ce.hangDimXOffset === 'number') ? ce.hangDimXOffset : 0;
        const hangLblOffIn = (ce && typeof ce.hangDimLblOffset === 'number') ? ce.hangDimLblOffset : 0;
        const dimXIn = 8 * unitFactor('in', elevUnit) + hangDimOffIn * unitFactor('in', elevUnit);
        const dimXpx = dimXIn * elevScale;
        const hangPx = hangVal * elevScale;
        const hangHalfSpan = Math.max(0, hangPx / 2 - 14); // keep number on the line
        let lblShiftPx = hangLblOffIn * unitFactor('in', elevUnit) * elevScale; // up = +
        lblShiftPx = Math.max(-hangHalfSpan, Math.min(hangHalfSpan, lblShiftPx));
        const TICK = 6;

        const fh = document.createElement('div');
        fh.className = 'floor-hang-dim';
        fh.setAttribute('data-dim-type', 'floor-art');
        fh.style.cssText =
            `position:absolute; left:${dimXpx}px; bottom:0; height:${hangPx}px; width:0; z-index:1;`;
        fh.innerHTML =
            // vertical dimension line
            `<div style="position:absolute; left:0; top:0; bottom:0; width:0; border-left:var(--dim-weight) solid var(--dim-color);"></div>` +
            // floor tick
            `<div style="position:absolute; left:${-TICK}px; bottom:0; width:${TICK * 2}px; height:0; border-top:var(--dim-weight) solid var(--dim-color);"></div>` +
            // hang-line tick
            `<div style="position:absolute; left:${-TICK}px; top:0; width:${TICK * 2}px; height:0; border-top:var(--dim-weight) solid var(--dim-color);"></div>` +
            // the number, centered between the line ends (rotated to read along
            // the vertical line), shifted by the user's up/down offset.
            `<div class="hang-dim-num" style="position:absolute; left:0; top:calc(50% - ${lblShiftPx}px); transform:translate(-50%,-50%) rotate(-90deg); color:var(--dim-color); font-family:var(--dim-font-family); font-size:var(--dim-font-size); font-weight:600; white-space:nowrap; background:rgba(255,255,255,0.85); padding:0 4px; pointer-events:auto; cursor:ns-resize;">${elevFmtU(hangVal)}</div>`;
        guideLayer.appendChild(fh);
        attachHangDimHandle(fh, { halfSpanPx: hangHalfSpan, numCenterTopPx: (hangPx / 2 - lblShiftPx) });
    }
    
    const offsetDist = 6 * unitFactor('in', elevUnit);
    const suffix = unitInfo(elevUnit).suffix;
    createElevArchDim(0, wallH + offsetDist, wallW, wallH + offsetDist, 'h', `${elevFmt(wallW)}${suffix}`, archLayer, true);
    createElevArchDim(-offsetDist, 0, -offsetDist, wallH, 'v', `${elevFmt(wallH)}${suffix}`, archLayer, true);

    // The character figure is a known 72" tall scale reference, so we don't render
    // an explicit height dimension next to it. Per studio convention all designers
    // assume this height; printing the label was visual noise.
}

// ──────────────────────────────────────────────────────────────────────────
// MANUAL DIMENSION OFFSETS
// ──────────────────────────────────────────────────────────────────────────
// Lets the user slide a dimension line along its perpendicular (drag handle)
// to arrange where it sits, without changing the measured value (endpoints
// stay locked to what they measure). Offsets are stored per-elevation, keyed
// by a stable dim id, in the CURRENT unit's terms but we normalize to inches
// for unit-independence. Survives redraws, save/load, and unit toggles.
//
// Dim id formats:
//   spacing-h-A-B   horizontal spacing dim between frames A,B (slides in Y)
//   spacing-v-A-B   vertical spacing dim between frames A,B (slides in X)
//   edge-<letter>-<side>   edge gap dim (side: ceiling/floor/left/right)
//   group-<id>-w | group-<id>-h   group box width/height dim
function getElevDimOffsets() {
    const ce = elevations[currentElevIndex];
    if (!ce) return {};
    if (!ce.dimOffsets || typeof ce.dimOffsets !== 'object') ce.dimOffsets = {};
    return ce.dimOffsets;
}
// Per-elevation set of dim ids the user has hidden via the × button.
function getElevHiddenDims() {
    const ce = elevations[currentElevIndex];
    if (!ce) return {};
    if (!ce.hiddenDims || typeof ce.hiddenDims !== 'object') ce.hiddenDims = {};
    return ce.hiddenDims;
}
function isDimHidden(id) { return !!getElevHiddenDims()[id]; }
function hideDim(id) {
    // Keep the panel view in sync: edge-gap and spacing dims are driven by
    // per-frame settings, so hiding one here also clears the matching control.
    const edgeMatch = /^edge-(.+)-(ceiling|floor|left|right)$/.exec(id);
    const spacingMatch = /^spacing-[hv]-(.+)-(.+)$/.exec(id);
    if (edgeMatch) {
        const f = elevFrames.find(fr => fr.letter === edgeMatch[1]);
        if (f && f.distToggles) { f.distToggles[edgeMatch[2]] = false; if (typeof initElevControls === 'function') { try { initElevControls(); } catch(e){} } drawElevAll(); if (typeof pushHistory === 'function') pushHistory(); return; }
    } else if (spacingMatch) {
        const [, l1, l2] = spacingMatch;
        const f1 = elevFrames.find(fr => fr.letter === l1);
        const f2 = elevFrames.find(fr => fr.letter === l2);
        if (f1 && Array.isArray(f1.dimTo)) f1.dimTo = f1.dimTo.filter(x => x !== l2);
        if (f2 && Array.isArray(f2.dimTo)) f2.dimTo = f2.dimTo.filter(x => x !== l1);
        if (typeof initElevControls === 'function') { try { initElevControls(); } catch(e){} }
        drawElevAll();
        if (typeof pushHistory === 'function') pushHistory();
        return;
    }
    // Fallback: generic hidden flag (custom or other dims).
    getElevHiddenDims()[id] = true;
    if (typeof pushHistory === 'function') pushHistory();
    drawElevAll();
}
function restoreHiddenDims() {
    const ce = elevations[currentElevIndex];
    if (ce) ce.hiddenDims = {};
    drawElevAll();
}
// Offset stored in INCHES (unit-independent). Returns offset in the CURRENT
// elevation unit for use in rendering math.
function getDimOffset(id) {
    const off = getElevDimOffsets()[id];
    if (typeof off !== 'number') return 0;
    return off * unitFactor('in', elevUnit); // inches → current unit
}
function setDimOffset(id, valueInCurrentUnit) {
    const offs = getElevDimOffsets();
    // store normalized to inches
    offs[id] = valueInCurrentUnit * unitFactor(elevUnit, 'in');
}
// Label-along-line offset (slides the number along the dim line to avoid
// overlaps). Stored separately under id+'-lbl', in inches.
function getLabelOffset(id) {
    const off = getElevDimOffsets()[id + '-lbl'];
    if (typeof off !== 'number') return 0;
    return off * unitFactor('in', elevUnit);
}
function setLabelOffset(id, valueInCurrentUnit) {
    getElevDimOffsets()[id + '-lbl'] = valueInCurrentUnit * unitFactor(elevUnit, 'in');
}
function resetDimOffsets() {
    const ce = elevations[currentElevIndex];
    if (ce) { ce.dimOffsets = {}; ce.hiddenDims = {}; }
    drawElevAll();
    if (typeof pushHistory === 'function') pushHistory();
}
function anyDimOffsetsSet() {
    const offs = getElevDimOffsets();
    return Object.keys(offs).some(k => Math.abs(offs[k]) > 0.001);
}

// ──────────────────────────────────────────────────────────────────────────
// CUSTOM MEASURED-LINE TOOL
// ──────────────────────────────────────────────────────────────────────────
// A "measure tool" (like Illustrator's dimension tool): toggle it on, click a
// start point and an end point (both snapping to frame/wall/floor/ceiling
// edges), and a measured horizontal or vertical dimension line is created.
// Lines are draggable afterward and deletable (× button or select+Delete).
// Stored per-elevation in inches; rendered to #custom-lines-layer; exported.
let lineToolActive = false;
let lineToolFirstPt = null;   // {x,y} in inches, the pending first click
let lineToolFirstAnchor = null; // the tagged anchor of the pending first click
let selectedCustomLine = null; // id of selected custom line
let selectedDimId = null;      // id of selected spacing/edge-gap dim

function getElevCustomLines() {
    const ce = elevations[currentElevIndex];
    if (!ce) return [];
    if (!Array.isArray(ce.customLines)) ce.customLines = [];
    return ce.customLines;
}
function toggleLineTool(on) {
    lineToolActive = (typeof on === 'boolean') ? on : !lineToolActive;
    lineToolFirstPt = null;
    lineToolFirstAnchor = null;
    // Turning the draw tool on must make custom lines visible — otherwise new
    // lines are created but hidden, which looks like the tool isn't working.
    if (lineToolActive && typeof dimVisibility !== 'undefined' && !dimVisibility.customLines) {
        dimVisibility.customLines = true;
        if (typeof saveDimVisibility === 'function') saveDimVisibility();
        const clBtn = document.getElementById('customLinesToggle');
        if (clBtn) clBtn.classList.add('active');
    }
    const btn = document.getElementById('lineToolBtn');
    if (btn) btn.classList.toggle('active', lineToolActive);
    const wall = document.getElementById('wall');
    if (wall) wall.style.cursor = lineToolActive ? 'crosshair' : '';
    drawElevAll();
}

// Gather candidate snap coordinates (in inches) from frames + wall bounds.
// Returns { xs:[...], ys:[...] } of x and y edge positions.
function customLineSnapTargets() {
    const xs = [0, elevResolvedWallW];   // left + right wall
    const ys = [0, elevResolvedWallH];   // floor + ceiling
    elevFrames.forEach(f => {
        if (!f.active) return;
        xs.push(f.x, f.x + f.w, f.x + f.w / 2);
        ys.push(f.y, f.y + f.h, f.y + f.h / 2);
    });
    return { xs, ys };
}

// Discrete anchor POINTS the measure tool snaps to: frame corners, frame
// mid-edge points, and wall corners + mid-edges. Each carries a reference tag
// (ref/letter/xc/yc) describing WHAT it's attached to, so a custom line stays
// dynamic when frames move. xc/yc are semantic: x0=left, xm=center, x1=right;
// y0=bottom, ym=middle, y1=top. Coordinates are in inches (current state).
function anchorPointsForSnap() {
    const pts = [];
    const W = elevResolvedWallW, H = elevResolvedWallH;
    const wallPt = (x, y, xc, yc) => ({ x, y, ref: 'wall', xc, yc });
    pts.push(wallPt(0,0,'x0','y0'), wallPt(W,0,'x1','y0'), wallPt(0,H,'x0','y1'), wallPt(W,H,'x1','y1'));
    pts.push(wallPt(W/2,0,'xm','y0'), wallPt(W/2,H,'xm','y1'), wallPt(0,H/2,'x0','ym'), wallPt(W,H/2,'x1','ym'));
    elevFrames.forEach(f => {
        if (!f.active) return;
        const x0=f.x, x1=f.x+f.w, y0=f.y, y1=f.y+f.h, xm=f.x+f.w/2, ym=f.y+f.h/2;
        const fp = (x,y,xc,yc) => ({ x, y, ref:'frame', letter:f.letter, xc, yc });
        // corners
        pts.push(fp(x0,y0,'x0','y0'), fp(x1,y0,'x1','y0'), fp(x0,y1,'x0','y1'), fp(x1,y1,'x1','y1'));
        // mid outside edges
        pts.push(fp(xm,y0,'xm','y0'), fp(xm,y1,'xm','y1'), fp(x0,ym,'x0','ym'), fp(x1,ym,'x1','ym'));
    });
    return pts;
}
// Resolve a stored anchor reference into live { x, y } inches from current
// frame/wall geometry. Falls back to the stored x/y for 'free' anchors or if
// the referenced frame no longer exists.
function resolveAnchor(a) {
    if (!a) return null;
    const xcVal = (x, w, xc) => xc === 'x0' ? x : xc === 'x1' ? x + w : x + w / 2;
    const ycVal = (y, h, yc) => yc === 'y0' ? y : yc === 'y1' ? y + h : y + h / 2;
    if (a.ref === 'wall') {
        // Wall-edge anchors may have one free axis (snapped along the edge).
        // The free coordinate is stored in inches; convert to current unit.
        const inFromStore = unitFactor('in', elevUnit);
        let x, y;
        if (a.xc === 'xfree') x = (typeof a.x === 'number' ? a.x * inFromStore : 0);
        else x = xcVal(0, elevResolvedWallW, a.xc);
        if (a.yc === 'yfree') y = (typeof a.y === 'number' ? a.y * inFromStore : 0);
        else y = ycVal(0, elevResolvedWallH, a.yc);
        return { x, y };
    }
    if (a.ref === 'frame') {
        const f = elevFrames.find(fr => fr.letter === a.letter && fr.active);
        if (f) return { x: xcVal(f.x, f.w, a.xc), y: ycVal(f.y, f.h, a.yc) };
        // frame gone → fall back to stored fixed position if present
    }
    return (typeof a.x === 'number' && typeof a.y === 'number') ? { x: a.x, y: a.y } : null;
}
// Nearest anchor point to a given inches position, within tolerance. Returns
// the tagged anchor (with ref/letter/xc/yc + x/y) or null. Also snaps to a
// point anywhere ALONG a wall outer edge (projected), so the blue dot appears
// on the wall edges just like on frames.
function nearestAnchorPoint(xIn, yIn) {
    const tolIn = 6; // ~6" capture radius
    let best = tolIn, found = null;
    anchorPointsForSnap().forEach(pt => {
        const d = Math.hypot(pt.x - xIn, pt.y - yIn);
        if (d < best) { best = d; found = pt; }
    });
    // Wall-edge projection: if near a wall edge but not a discrete anchor,
    // snap onto the edge at the cursor's position along it.
    const W = elevResolvedWallW, H = elevResolvedWallH;
    const edgeTol = 6;
    const consider = (cand, dist) => { if (dist < best) { best = dist; found = cand; } };
    // left/right edges (vertical): x fixed, y free
    if (xIn >= -edgeTol && xIn <= edgeTol) consider({ x:0, y: clamp(yIn,0,H), ref:'wall', xc:'x0', yc:'yfree', yfree:true }, Math.abs(xIn - 0));
    if (Math.abs(xIn - W) <= edgeTol)      consider({ x:W, y: clamp(yIn,0,H), ref:'wall', xc:'x1', yc:'yfree', yfree:true }, Math.abs(xIn - W));
    // floor/ceiling edges (horizontal): y fixed, x free
    if (yIn >= -edgeTol && yIn <= edgeTol) consider({ x: clamp(xIn,0,W), y:0, ref:'wall', xc:'xfree', yc:'y0', xfree:true }, Math.abs(yIn - 0));
    if (Math.abs(yIn - H) <= edgeTol)      consider({ x: clamp(xIn,0,W), y:H, ref:'wall', xc:'xfree', yc:'y1', xfree:true }, Math.abs(yIn - H));
    return found;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function snapCoord(val, candidates) {
    let best = 1.0, snapped = val;
    candidates.forEach(c => { const d = Math.abs(c - val); if (d < best) { best = d; snapped = c; } });
    return snapped;
}

// Convert a mouse event to elevation inches relative to the wall (y grows up).
function eventToElevInches(e) {
    const wall = document.getElementById('wall');
    const r = wall.getBoundingClientRect();
    const xPx = e.clientX - r.left;
    const yPxFromTop = e.clientY - r.top;
    const xIn = xPx / elevScale;
    const yIn = (r.height - yPxFromTop) / elevScale; // flip: bottom = 0
    return { x: xIn, y: yIn };
}

// Handle a click on the wall while the line tool is active.
function handleLineToolClick(e) {
    if (!lineToolActive) return;
    e.preventDefault(); e.stopPropagation();
    let pt = eventToElevInches(e);
    // Snap to nearest discrete anchor (tagged) if close; else a free point.
    let anchor = nearestAnchorPoint(pt.x, pt.y);
    if (!anchor) {
        const tg = customLineSnapTargets();
        anchor = { ref: 'free', x: snapCoord(pt.x, tg.xs), y: snapCoord(pt.y, tg.ys) };
    }
    if (!lineToolFirstAnchor) {
        lineToolFirstAnchor = anchor;
        lineToolFirstPt = { x: anchor.x, y: anchor.y };
        drawElevAll();
        return;
    }
    // Second click: build a line from the two anchors. Orientation = whichever
    // span is larger. Store both anchor refs; resolved live at render time.
    const a = lineToolFirstAnchor, b = anchor;
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    const id = 'cl-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const stored = { id, a: stripAnchor(a), b: stripAnchor(b), type: (dx >= dy ? 'h' : 'v'), off: 0 };
    getElevCustomLines().push(stored);
    lineToolFirstAnchor = null;
    lineToolFirstPt = null;
    if (typeof pushHistory === 'function') pushHistory();
    drawElevAll();
}
// Keep only the reference fields (+ a fixed x/y fallback in inches) for storage.
function stripAnchor(a) {
    if (a.ref === 'frame') return { ref: 'frame', letter: a.letter, xc: a.xc, yc: a.yc };
    if (a.ref === 'wall') {
        const toIn = unitFactor(elevUnit, 'in');
        const out = { ref: 'wall', xc: a.xc, yc: a.yc };
        // Store the free-axis coordinate (in inches) if this is an edge anchor.
        if (a.xc === 'xfree') out.x = a.x * toIn;
        if (a.yc === 'yfree') out.y = a.y * toIn;
        return out;
    }
    const toIn = unitFactor(elevUnit, 'in');
    return { ref: 'free', x: a.x * toIn, y: a.y * toIn };
}
// Resolve a stored endpoint anchor → live inches (current unit).
function resolveStoredAnchor(a) {
    if (a.ref === 'free') {
        const inFromStore = unitFactor('in', elevUnit);
        return { x: a.x * inFromStore, y: a.y * inFromStore };
    }
    return resolveAnchor(a); // frame/wall → live geometry (already current unit)
}

// Live anchor indicator while the measure tool is active. Shows a blue dot at
// the nearest anchor point; when over one, the cursor hides (the dot is the
// indicator) and clicking will snap there. Also draws a live dashed preview
// from the pending first point.
function updateAnchorHoverDot(e) {
    const layer = document.getElementById('custom-lines-layer');
    if (!layer) return;
    let dot = document.getElementById('anchor-hover-dot');
    if (!dot) {
        dot = document.createElement('div');
        dot.id = 'anchor-hover-dot';
        dot.setAttribute('data-export-skip', '1');
        dot.setAttribute('data-html2canvas-ignore', 'true');
        dot.style.cssText = 'position:absolute; width:11px; height:11px; border-radius:50%; background:var(--accent,#3b82f6); border:2px solid #fff; box-shadow:0 0 0 1px var(--accent,#3b82f6); transform:translate(-50%,50%); z-index:70; pointer-events:none; display:none;';
        layer.appendChild(dot);
    }
    const pt = eventToElevInches(e);
    const anc = nearestAnchorPoint(pt.x, pt.y);
    const wall = document.getElementById('wall');
    if (anc) {
        dot.style.left = (anc.x * elevScale) + 'px';
        dot.style.bottom = (anc.y * elevScale) + 'px';
        dot.style.display = 'block';
        if (wall) wall.style.cursor = 'none'; // dot replaces crosshair on anchor
    } else {
        dot.style.display = 'none';
        if (wall) wall.style.cursor = 'crosshair';
    }
}

function deleteCustomLine(id) {
    const ce = elevations[currentElevIndex];
    if (!ce || !Array.isArray(ce.customLines)) return;
    ce.customLines = ce.customLines.filter(l => l.id !== id);
    if (selectedCustomLine === id) selectedCustomLine = null;
    if (typeof pushHistory === 'function') pushHistory();
    drawElevAll();
}

// Render all custom measured lines for the current elevation.
function renderCustomLines() {
    const layer = document.getElementById('custom-lines-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const inFromStore = unitFactor('in', elevUnit); // inches → current unit
    const lines = getElevCustomLines();
    const hidden = (typeof dimVisibility !== 'undefined' && !dimVisibility.customLines);

    // Pending first-point marker while drawing (always shown when drawing).
    if (lineToolActive && lineToolFirstPt) {
        const m = document.createElement('div');
        m.setAttribute('data-export-skip', '1');
        m.setAttribute('data-html2canvas-ignore', 'true');
        m.style.cssText = `position:absolute; left:${lineToolFirstPt.x*elevScale}px; bottom:${lineToolFirstPt.y*elevScale}px; width:8px; height:8px; transform:translate(-50%,50%); background:var(--accent,#3b82f6); border-radius:50%; z-index:60;`;
        layer.appendChild(m);
    }
    if (hidden) return; // toggle off — draw nothing else

    const isFrameAnchor = (a) => a && a.ref === 'frame';
    // Perpendicular band of the frame an endpoint is anchored to. For an h-line
    // the leader is vertical → band is the frame's y-extent; for a v-line the
    // leader is horizontal → band is the frame's x-extent.
    const frameBand = (a, axis) => {
        if (!isFrameAnchor(a)) return null;
        const f = elevFrames.find(fr => fr.letter === a.letter && fr.active);
        if (!f) return null;
        return axis === 'y' ? { lo: f.y, hi: f.y + f.h } : { lo: f.x, hi: f.x + f.w };
    };
    // Draw a leader from the line to the nearest frame edge, ONLY when the line
    // is pulled outside the frame's band (so no dashes run alongside the frame).
    const frameLeader = (dir, alongCoord, linePerp, band) => {
        if (!band) return;
        let edge = null;
        if (linePerp > band.hi + 0.02) edge = band.hi;
        else if (linePerp < band.lo - 0.02) edge = band.lo;
        if (edge === null) return; // line still alongside the frame → no leader
        addCustomLeader(layer, dir, alongCoord, linePerp, edge);
    };
    lines.forEach(L => {
        const pa = resolveStoredAnchor(L.a);
        const pb = resolveStoredAnchor(L.b);
        if (!pa || !pb) return;
        const off = (L.off || 0) * inFromStore; // drag offset (stored inches → unit)
        if (L.type === 'h') {
            // Span across x; line sits at a chosen y (anchor a's y) + offset.
            const x1 = pa.x, x2 = pb.x;
            const lineY = pa.y + off;
            const value = Math.abs(x2 - x1);
            renderOneCustomLine(layer, L.id, 'h', Math.min(x1,x2), lineY, value, value);
            // Vertical leaders to each frame's nearest horizontal edge.
            frameLeader('v', x1, lineY, frameBand(L.a, 'y'));
            frameLeader('v', x2, lineY, frameBand(L.b, 'y'));
        } else {
            const y1 = pa.y, y2 = pb.y;
            const lineX = pa.x + off;
            const value = Math.abs(y2 - y1);
            renderOneCustomLine(layer, L.id, 'v', lineX, Math.min(y1,y2), value, value);
            // Horizontal leaders to each frame's nearest vertical edge.
            frameLeader('h', y1, lineX, frameBand(L.a, 'x'));
            frameLeader('h', y2, lineX, frameBand(L.b, 'x'));
        }
    });
}

// Dashed leader connecting a measurement-line endpoint back to the clicked
// anchor. dir 'v' = vertical leader (connects along y) at a fixed x = posPerp;
// dir 'h' = horizontal leader at a fixed y = posPerp. `lineCoord` is the line's
// position on the perpendicular axis; `anchorCoord` is the clicked anchor's.
function addCustomLeader(layer, dir, alongCoord, lineCoord, anchorCoord) {
    if (Math.abs(lineCoord - anchorCoord) < 0.05) return; // coincident → no leader
    const ext = document.createElement('div');
    ext.className = 'dim-leader';
    if (dir === 'v') {
        // vertical dashed at x=alongCoord, from anchorCoord(y) to lineCoord(y)
        const lo = Math.min(lineCoord, anchorCoord) * elevScale;
        const hi = Math.max(lineCoord, anchorCoord) * elevScale;
        ext.style.cssText = `position:absolute; left:${alongCoord*elevScale}px; bottom:${lo}px; height:${hi-lo}px; width:0; border-left:1px dashed var(--dim-color); opacity:0.7; pointer-events:none;`;
    } else {
        // horizontal dashed at y=alongCoord, from anchorCoord(x) to lineCoord(x)
        const lo = Math.min(lineCoord, anchorCoord) * elevScale;
        const hi = Math.max(lineCoord, anchorCoord) * elevScale;
        ext.style.cssText = `position:absolute; bottom:${alongCoord*elevScale}px; left:${lo}px; width:${hi-lo}px; height:0; border-top:1px dashed var(--dim-color); opacity:0.7; pointer-events:none;`;
    }
    layer.appendChild(ext);
}

// Render a single custom line (similar visual to spacing dims) with ticks,
// label, an × delete button, selection highlight, and drag-to-move.
function renderOneCustomLine(layer, id, type, originX, originY, spanLen, value) {
    const dim = document.createElement('div');
    dim.className = 'arch-dim custom-line ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');
    dim.setAttribute('data-custom-line', id);
    const sel = (selectedCustomLine === id);
    const label = elevFmtU(value);

    if (type === 'h') {
        const width = spanLen * elevScale, left = originX * elevScale, bottom = originY * elevScale;
        dim.style.cssText = `width:${width}px; height:1.2px; left:${left}px; bottom:${bottom}px;` + (sel ? 'outline:1px dashed var(--accent,#3b82f6); outline-offset:3px;' : '');
        dim.innerHTML = `<div class="dim-line-segment"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment"></div>`;
    } else {
        const height = spanLen * elevScale, left = originX * elevScale, bottom = originY * elevScale;
        dim.style.cssText = `height:${height}px; width:1.2px; left:${left}px; bottom:${bottom}px;` + (sel ? 'outline:1px dashed var(--accent,#3b82f6); outline-offset:3px;' : '');
        dim.innerHTML = `<div class="dim-line-segment-v"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment-v"></div>`;
    }
    const L = getElevCustomLines().find(l => l.id === id);

    // Whole-line drag by grabbing the line body (not the number/arrows).
    dim.addEventListener('mousedown', (e) => {
        if (lineToolActive) return;
        if (e.target.closest('.arch-label-new')) return; // number/arrows handle themselves
        e.stopPropagation();
        selectedCustomLine = id; selectedDimId = null;
        startCustomLineDrag(e, id);
        drawElevAll();
    });

    // Unified 4-way controls + select + ×, same as the other dim types.
    if (L) {
        const spanPx = spanLen * elevScale;
        const inFromStore = unitFactor('in', elevUnit);
        const toStore = unitFactor(elevUnit, 'in');
        buildDimControls({
            dim, type, container: layer,
            id,
            isSelected: () => selectedCustomLine === id,
            select: () => { selectedCustomLine = id; selectedDimId = null; },
            getLabelOff: () => (L.lblOff || 0) * inFromStore,        // inches→cur
            setLabelOff: (v) => { L.lblOff = v * toStore; },
            getLineOff: () => (L.off || 0) * inFromStore,
            setLineOff: (v) => { L.off = v * toStore; },
            onDelete: () => deleteCustomLine(id),
            spanPx,
        });
    }

    layer.appendChild(dim);
}

// Drag the "HANG HEIGHT" word up/down (stored as hangLabelYOffset, inches) so
// it can be moved clear of the wall-height dimension. Up/down arrows are placed
// on the (unrotated) hang-guide next to the label.
function attachHangLabelDrag(guide, lbl, lblYpx) {
    if (!lbl) return;
    const ce = elevations[currentElevIndex];
    const toIn = unitFactor(elevUnit, 'in');
    const startDrag = (e) => {
        e.preventDefault(); e.stopPropagation();
        const startY = e.clientY;
        const startOff = (ce && typeof ce.hangLabelYOffset === 'number') ? ce.hangLabelYOffset : 0;
        document.body.style.cursor = 'ns-resize';
        const onMove = (mv) => {
            const dIn = (-(mv.clientY - startY) / elevScale) * toIn; // up = +
            if (ce) ce.hangLabelYOffset = startOff + dIn;
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    lbl.addEventListener('mousedown', startDrag);

    // Up/down arrows on the unrotated guide, next to the label. The label sits
    // OUTSIDE the wall on the left (right:100%); place the arrows just left of
    // it, stacked vertically, centered on the label's current vertical offset.
    const chev = (dir) => {
        const pts = { up:'4,11 8,5 12,11', down:'4,5 8,11 12,5' }[dir];
        return `<svg viewBox="0 0 16 16" width="12" height="12" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };
    const mkArrow = (dir) => {
        const a = document.createElement('div');
        a.className = 'dim-arrow';
        a.setAttribute('data-export-skip', '1');
        a.setAttribute('data-html2canvas-ignore', 'true');
        // guide is full-width with the dashed line at top; the label is at
        // right:100% (just left of the wall). Put arrows a bit further left,
        // vertically offset by the label's current shift.
        const yShift = -(lblYpx || 0);
        const vy = (dir === 'up') ? (yShift - 12) : (yShift + 12);
        a.style.cssText = `position:absolute; right:calc(100% + 64px); top:calc(0px + ${vy}px); transform:translateY(-50%); z-index:58; pointer-events:auto; cursor:ns-resize; opacity:0.5; transition:opacity 0.12s; line-height:0;`;
        a.innerHTML = chev(dir);
        a.onmouseenter = () => { a.style.opacity = '1'; };
        a.onmouseleave = () => { a.style.opacity = '0.5'; };
        a.addEventListener('mousedown', startDrag);
        return a;
    };
    guide.appendChild(mkArrow('up'));
    guide.appendChild(mkArrow('down'));
}

// 4-way control for the floor-to-hang dimension. Arrows are attached to the
// (unrotated) fh container around the number's visual box so they don't
// overlap the rotated number. Up/Down move the NUMBER along the line (clamped
// to the line ends); Left/Right move the whole LINE horizontally. No ×.
function attachHangDimHandle(fh, opts) {
    opts = opts || {};
    const ce = elevations[currentElevIndex];
    const toIn = unitFactor(elevUnit, 'in');
    const num = fh.querySelector('.hang-dim-num');
    if (!num) return;
    num.style.cursor = 'ns-resize';
    num.style.zIndex = '56';

    const halfSpan = (typeof opts.halfSpanPx === 'number') ? opts.halfSpanPx : 1e9;
    const numCenterTopPx = (typeof opts.numCenterTopPx === 'number') ? opts.numCenterTopPx : null;

    const chev = (dir) => {
        const pts = { up:'4,11 8,5 12,11', down:'4,5 8,11 12,5', left:'11,4 5,8 11,12', right:'5,4 11,8 5,12' }[dir];
        return `<svg viewBox="0 0 16 16" width="13" height="13" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };

    // Position arrows deterministically from the number's KNOWN center and an
    // estimated box size. Measuring the rotated number's getBoundingClientRect
    // is unreliable on first paint (transform/font not settled), which made the
    // arrows bunch up until the next redraw. The number is rotated -90°, so its
    // visual height ≈ text width and visual width ≈ font size.
    {
        const fontSizePx = parseFloat(getComputedStyle(num).fontSize) || 13;
        const txt = (num.textContent || '').replace('×','').trim();
        // estimate the (pre-rotation) text width; rotated, this becomes the
        // number's VISUAL height (extent along the vertical line).
        const estTextW = Math.max(18, txt.length * fontSizePx * 0.6 + 10);
        const halfH = estTextW / 2;             // visual half-height (along line)
        const halfW = (fontSizePx + 8) / 2;     // visual half-width (across line)
        // number center within fh: fh is the vertical line (bottom:0, height
        // hangPx); the number sits at top:calc(50% - lblShiftPx).
        const cyInFh = (typeof numCenterTopPx === 'number') ? numCenterTopPx : 0;
        const cxInFh = 0; // the line is at x=0 in fh's frame
        const GAP = 6;
        const mk = (screenDir) => {
            const a = document.createElement('div');
            a.className = 'dim-arrow';
            a.setAttribute('data-export-skip', '1');
            a.setAttribute('data-html2canvas-ignore', 'true');
            const cur = (screenDir === 'left' || screenDir === 'right') ? 'ew-resize' : 'ns-resize';
            let left = cxInFh, top = cyInFh;
            if (screenDir === 'up')    top = cyInFh - halfH - GAP;
            if (screenDir === 'down')  top = cyInFh + halfH + GAP;
            if (screenDir === 'left')  left = cxInFh - halfW - GAP;
            if (screenDir === 'right') left = cxInFh + halfW + GAP;
            a.style.cssText = `position:absolute; left:${left}px; top:${top}px; transform:translate(-50%,-50%); z-index:58; pointer-events:auto; cursor:${cur}; opacity:0.5; transition:opacity 0.12s; line-height:0;`;
            a.innerHTML = chev(screenDir);
            a.onmouseenter = () => { a.style.opacity = '1'; };
            a.onmouseleave = () => { a.style.opacity = '0.5'; };
            a.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                const startX = e.clientX, startY = e.clientY;
                const startLine = (ce && typeof ce.hangDimXOffset === 'number') ? ce.hangDimXOffset : 0;
                const startLbl = (ce && typeof ce.hangDimLblOffset === 'number') ? ce.hangDimLblOffset : 0;
                document.body.style.cursor = cur;
                const onMove = (mv) => {
                    if (screenDir === 'left' || screenDir === 'right') {
                        const dIn = ((mv.clientX - startX) / elevScale) * toIn;
                        if (ce) ce.hangDimXOffset = startLine + dIn;
                    } else {
                        const dIn = (-(mv.clientY - startY) / elevScale) * toIn; // up=+
                        // clamp to the line span
                        let nextPx = (startLbl + dIn) * unitFactor('in', elevUnit) * elevScale;
                        nextPx = Math.max(-halfSpan, Math.min(halfSpan, nextPx));
                        if (ce) ce.hangDimLblOffset = (nextPx / elevScale) * toIn;
                    }
                    drawElevAll();
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    if (typeof pushHistory === 'function') pushHistory();
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
            return a;
        };
        ['left','right','up','down'].forEach(d => fh.appendChild(mk(d)));
    }

    // Drag the number itself up/down (clamped to the line ends).
    num.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const startY = e.clientY;
        const startLbl = (ce && typeof ce.hangDimLblOffset === 'number') ? ce.hangDimLblOffset : 0;
        document.body.style.cursor = 'ns-resize';
        const onMove = (mv) => {
            const dIn = (-(mv.clientY - startY) / elevScale) * toIn; // up = +
            let nextPx = (startLbl + dIn) * unitFactor('in', elevUnit) * elevScale;
            nextPx = Math.max(-halfSpan, Math.min(halfSpan, nextPx));
            if (ce) ce.hangDimLblOffset = (nextPx / elevScale) * toIn;
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// Drag a whole custom line (slides perpendicular via its 'off' offset; the
// endpoints stay anchored to their frames/wall).
function startCustomLineDrag(e, id) {
    const lines = getElevCustomLines();
    const L = lines.find(l => l.id === id);
    if (!L) return;
    const startX = e.clientX, startY = e.clientY;
    const toIn = unitFactor(elevUnit, 'in');
    const startOff = L.off || 0; // stored inches
    const onMove = (mv) => {
        let deltaIn;
        if (L.type === 'h') {
            // screen-down (+clientY) → elevation-down → decrease offset
            deltaIn = (-(mv.clientY - startY) / elevScale) * toIn;
        } else {
            deltaIn = ((mv.clientX - startX) / elevScale) * toIn;
        }
        L.off = startOff + deltaIn;
        drawElevAll();
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (typeof pushHistory === 'function') pushHistory();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function drawElevTargetedSpacing() {
    const layer = document.getElementById('dim-layer'); layer.innerHTML = '';
    let drawnPairs = new Set();
    elevFrames.forEach(f1 => {
        if (!f1.active || !f1.dimTo) return;
        f1.dimTo.forEach(targetLetter => {
            let f2 = elevFrames.find(tf => tf.letter === targetLetter && tf.active);
            if(f2) {
                let pairId = [f1.letter, f2.letter].sort().join('-');
                if(!drawnPairs.has(pairId)) {
                    let leftF = f1.x < f2.x ? f1 : f2; let rightF = f1.x < f2.x ? f2 : f1;
                    if (rightF.x >= leftF.x + leftF.w) {
                        let gapX = rightF.x - (leftF.x + leftF.w);
                        let oTop = Math.max(leftF.y, rightF.y); let oBot = Math.min(leftF.y + leftF.h, rightF.y + rightF.h);
                        let anchorY = oBot > oTop ? oTop + (oBot - oTop)/2 : (leftF.y + leftF.h/2 + rightF.y + rightF.h/2)/2;
                        const hId = 'spacing-h-' + pairId;
                        const hOff = getDimOffset(hId);
                        anchorY += hOff;
                        createElevArchSpacing(leftF.x + leftF.w, anchorY, rightF.x, anchorY, 'h', layer, elevFmtU(gapX), hId, hOff, {
                            band1: { lo: leftF.y, hi: leftF.y + leftF.h },
                            band2: { lo: rightF.y, hi: rightF.y + rightF.h },
                        });
                    }
                    let botF = f1.y < f2.y ? f1 : f2; let topF = f1.y < f2.y ? f2 : f1;
                    if (topF.y >= botF.y + botF.h) {
                        let gapY = topF.y - (botF.y + botF.h);
                        let oLeft = Math.max(botF.x, topF.x); let oRight = Math.min(botF.x + botF.w, topF.x + topF.w);
                        let anchorX = oRight > oLeft ? oLeft + (oRight - oLeft)/2 : (botF.x + botF.w/2 + topF.x + topF.w/2)/2;
                        const vId = 'spacing-v-' + pairId;
                        const vOff = getDimOffset(vId);
                        anchorX += vOff;
                        createElevArchSpacing(anchorX, botF.y + botF.h, anchorX, topF.y, 'v', layer, elevFmtU(gapY), vId, vOff, {
                            band1: { lo: botF.x, hi: botF.x + botF.w },
                            band2: { lo: topF.x, hi: topF.x + topF.w },
                        });
                    }
                    drawnPairs.add(pairId);
                }
            }
        });
    });
}

// Draw per-frame architectural distance dimensions. Each frame stores its own
// `distToggles` object (ceiling/floor/left/right booleans) — only the ones
// the user has toggled ON in that frame's ABC panel get drawn. This replaces
// the earlier global floor/ceiling toggle (removed) so designers can show
// distance dims independently for each frame.
//
// Anchoring strategy: vertical dims (ceiling, floor) anchor at an x-column
// just inside the frame's horizontal extent. Horizontal dims (left, right
// wall) anchor at a y-row just inside the frame's vertical extent. This
// keeps the dim line "associated with" the frame without overlapping
// adjacent frames or the frame face.
function drawPerFrameDistanceDims() {
    const layer = document.getElementById('floor-ceiling-layer');
    if (!layer) return;
    layer.innerHTML = '';
    // Edge Gap toggle (Layout Guides): when off, hide all distance dims.
    if (typeof dimVisibility !== 'undefined' && !dimVisibility.edgeGap) return;
    // Use the precise resolved wall dims (set by drawElevAll) so edge-gap
    // lines don't drift relative to frames on unit toggles.
    const wallW = elevResolvedWallW;
    const wallH = elevResolvedWallH;

    elevFrames.forEach(f => {
        if (!f.active) return;
        const dt = f.distToggles || { ceiling: false, floor: false, left: false, right: false };

        // Vertical anchor: a column slightly inside frame's left edge (so dim
        // lines associated with this frame don't crowd adjacent frames). The
        // inset cap (8") must be unit-converted, else it's a different physical
        // distance per unit and the line jumps on unit toggles.
        const insetCap = 8 * unitFactor('in', elevUnit);
        const verticalAnchorX = f.x + Math.min(insetCap, f.w * 0.15);
        // Horizontal anchor: a row slightly inside frame's bottom edge.
        const horizontalAnchorY = f.y + Math.min(insetCap, f.h * 0.15);

        // CEILING distance: from top of frame up to wallH
        if (dt.ceiling) {
            const ceilingDist = wallH - (f.y + f.h);
            if (ceilingDist > 0) {
                const id = 'edge-' + f.letter + '-ceiling';
                const o = getDimOffset(id); const ax = verticalAnchorX + o;
                createElevArchSpacing(ax, f.y + f.h, ax, wallH, 'v', layer, elevFmtU(ceilingDist), id, o, {
                    band1: { lo: f.x, hi: f.x + f.w }, // frame endpoint (y = f.y+f.h)
                    band2: null,                        // wall (ceiling) endpoint
                });
            }
        }
        // FLOOR distance: from bottom of frame down to 0
        if (dt.floor) {
            const floorDist = f.y;
            if (floorDist > 0) {
                const id = 'edge-' + f.letter + '-floor';
                const o = getDimOffset(id); const ax = verticalAnchorX + o;
                createElevArchSpacing(ax, 0, ax, f.y, 'v', layer, elevFmtU(floorDist), id, o, {
                    band1: null,                        // wall (floor) endpoint (y = 0)
                    band2: { lo: f.x, hi: f.x + f.w },  // frame endpoint (y = f.y)
                });
            }
        }
        // LEFT WALL distance: from left of frame back to 0
        if (dt.left) {
            const leftDist = f.x;
            if (leftDist > 0) {
                const id = 'edge-' + f.letter + '-left';
                const o = getDimOffset(id); const ay = horizontalAnchorY + o;
                createElevArchSpacing(0, ay, f.x, ay, 'h', layer, elevFmtU(leftDist), id, o, {
                    band1: null,                        // wall (left) endpoint (x = 0)
                    band2: { lo: f.y, hi: f.y + f.h },  // frame endpoint (x = f.x)
                });
            }
        }
        // RIGHT WALL distance: from right of frame to wallW
        if (dt.right) {
            const rightDist = wallW - (f.x + f.w);
            if (rightDist > 0) {
                const id = 'edge-' + f.letter + '-right';
                const o = getDimOffset(id); const ay = horizontalAnchorY + o;
                createElevArchSpacing(f.x + f.w, ay, wallW, ay, 'h', layer, elevFmtU(rightDist), id, o, {
                    band1: { lo: f.y, hi: f.y + f.h },  // frame endpoint (x = f.x+f.w)
                    band2: null,                         // wall (right) endpoint (x = wallW)
                });
            }
        }
    });
}

// Legacy alias — older callers may still reference the previous name.
function drawFloorCeilingDims() { drawPerFrameDistanceDims(); }

function createElevArchDim(x1, y1, x2, y2, type, label, container, isWallOuter) {
    const dim = document.createElement('div');
    dim.className = 'arch-dim ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');
    
    const left = Math.min(x1, x2) * elevScale;
    let bottom = Math.min(y1, y2) * elevScale;
    // The wall's floor is now a 1px bottom border (same as the other sides).
    // Extend a floor-anchored vertical line down by that 1px so it sits flush
    // on the floor edge rather than stopping at the content-box inner edge.
    const FLOOR_BORDER = 1;
    let floorExtend = 0;
    if (type !== 'h' && Math.min(y1, y2) < 0.001) { bottom = -FLOOR_BORDER; floorExtend = FLOOR_BORDER; }
    dim.style.left = left + 'px';
    dim.style.bottom = bottom + 'px';

    const offset = 6 * unitFactor('in', elevUnit) * elevScale;

    if(type === 'h') {
        const width = Math.abs(x2 - x1) * elevScale;
        dim.style.width = width + 'px';
        dim.innerHTML = `
            ${isWallOuter ? `<div style="position:absolute; left:0; top:0; width:1px; height:${offset}px; border-left:var(--dim-weight) dashed var(--dim-color);"></div><div style="position:absolute; right:0; top:0; width:1px; height:${offset}px; border-left:var(--dim-weight) dashed var(--dim-color);"></div>` : ''}
            <div class="dim-line-segment"></div>
            <span class="arch-label-new">${label}</span>
            <div class="dim-line-segment"></div>
        `;
    } else {
        const height = Math.abs(y2 - y1) * elevScale + floorExtend;
        dim.style.height = height + 'px';
        dim.innerHTML = `
            ${isWallOuter ? `<div style="position:absolute; left:0; bottom:0; height:1px; width:${offset}px; border-top:var(--dim-weight) dashed var(--dim-color);"></div><div style="position:absolute; left:0; top:0; height:1px; width:${offset}px; border-top:var(--dim-weight) dashed var(--dim-color);"></div>` : ''}
            <div class="dim-line-segment-v"></div>
            <span class="arch-label-new">${label}</span>
            <div class="dim-line-segment-v"></div>
        `;
    }
    container.appendChild(dim);
}

function createElevArchSpacing(x1, y1, x2, y2, type, container, label, dimId, offsetAmt, bandOpt) {
    offsetAmt = offsetAmt || 0;
    bandOpt = bandOpt || {};
    if (dimId && isDimHidden(dimId)) return; // user hid this dim via its ×
    const dim = document.createElement('div'); 
    dim.className = 'arch-dim ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');

    // Wall bounds in inches — endpoints sitting on these are wall edges
    // (floor/ceiling/left/right) and should NOT get a dashed leader.
    const WB = 0.02; // tolerance
    const atWallX = (xv) => Math.abs(xv) < WB || Math.abs(xv - elevResolvedWallW) < WB;
    const atWallY = (yv) => Math.abs(yv) < WB || Math.abs(yv - elevResolvedWallH) < WB;

    if(type === 'h') {
        const width = Math.abs(x2 - x1) * elevScale; const left = Math.min(x1, x2) * elevScale; const bottom = y1 * elevScale;
        dim.style.cssText = `width:${width}px; height:1.2px; left:${left}px; bottom:${bottom}px;`;
        dim.innerHTML = `<div class="dim-line-segment"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment"></div>`;
        // Leader extensions: per-endpoint. Each endpoint connects to ITS OWN
        // frame's nearest edge, and only when the line is pulled OUTSIDE that
        // frame's band (so no dashes run alongside an offset/taller frame).
        const lineY = y1; // inches
        if (Math.abs(offsetAmt) > 0.01) {
            const ends = [
                { xv: x1, band: bandOpt.band1 },
                { xv: x2, band: bandOpt.band2 },
            ];
            ends.forEach(({ xv, band }) => {
                if (atWallX(xv)) return;          // wall side → never
                if (!band) return;                // no frame band → skip
                let edgeY = null;
                if (lineY > band.hi + 0.02) edgeY = band.hi;       // pulled above this frame
                else if (lineY < band.lo - 0.02) edgeY = band.lo;  // pulled below this frame
                // else: line still alongside THIS frame → no leader for it
                if (edgeY === null) return;
                const lo = Math.min(bottom, edgeY * elevScale), hi = Math.max(bottom, edgeY * elevScale);
                const ext = document.createElement('div');
                ext.className = 'dim-leader';
                ext.style.cssText = `position:absolute; left:${xv*elevScale}px; bottom:${lo}px; height:${(hi-lo)}px; width:0; border-left:1px dashed var(--dim-color); opacity:0.7; pointer-events:none;`;
                container.appendChild(ext);
            });
        }
    } else {
        let height = Math.abs(y2 - y1) * elevScale; const left = x1 * elevScale;
        let bottom = Math.min(y1, y2) * elevScale;
        // Floor-anchored lines (y≈0) extend down past the content box to touch
        // the 1px floor border, so they sit flush on the floor.
        if (Math.min(y1, y2) < 0.001) { bottom = -1; height += 1; }
        dim.style.cssText = `height:${height}px; width:1.2px; left:${left}px; bottom:${bottom}px;`;
        dim.innerHTML = `<div class="dim-line-segment-v"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment-v"></div>`;
        // Leader extensions: per-endpoint, each to ITS OWN frame's nearest x
        // edge, only when pulled outside that frame's band.
        const lineX = x1; // inches
        if (Math.abs(offsetAmt) > 0.01) {
            const ends = [
                { yv: y1, band: bandOpt.band1 },
                { yv: y2, band: bandOpt.band2 },
            ];
            ends.forEach(({ yv, band }) => {
                if (atWallY(yv)) return;
                if (!band) return;
                let edgeX = null;
                if (lineX > band.hi + 0.02) edgeX = band.hi;
                else if (lineX < band.lo - 0.02) edgeX = band.lo;
                if (edgeX === null) return;
                const lo = Math.min(left, edgeX * elevScale), hi = Math.max(left, edgeX * elevScale);
                const ext = document.createElement('div');
                ext.className = 'dim-leader';
                ext.style.cssText = `position:absolute; bottom:${yv*elevScale}px; left:${lo}px; width:${(hi-lo)}px; height:0; border-top:1px dashed var(--dim-color); opacity:0.7; pointer-events:none;`;
                container.appendChild(ext);
            });
        }
    }
    // Unified 4-way controls (arrows around the number + select + ×). The
    // line's pixel span sets the clamp so the number can't slide past the ends.
    if (dimId) {
        const spanPx = (type === 'h') ? Math.abs(x2 - x1) * elevScale : Math.abs(y2 - y1) * elevScale;
        buildDimControls({
            dim, type, container,
            id: dimId,
            isSelected: () => selectedDimId === dimId,
            select: () => { selectedDimId = dimId; selectedCustomLine = null; },
            getLabelOff: () => getLabelOffset(dimId),          // current unit
            setLabelOff: (v) => setLabelOffset(dimId, v),
            getLineOff: () => getDimOffset(dimId),
            setLineOff: (v) => setDimOffset(dimId, snapDimOffset(v, dimId).value),
            onDelete: () => hideDim(dimId),
            spanPx,
        });
    }
    container.appendChild(dim);
}

// ── UNIFIED DIMENSION CONTROLS ──────────────────────────────────────────────
// Builds a consistent control scheme for any measurement line:
//  • 4 arrows locked around the number/box (L,R,U,D)
//  • horizontal line: L/R move the number along the line, U/D move the line
//  • vertical line:   U/D move the number along the line, L/R move the line
//  • number slide is clamped so it can't pass the line's ends
//  • click to select (highlight + ×), × deletes/hides
// opts: { dim, type, container, id, isSelected, select, getLabelOff, setLabelOff,
//         getLineOff, setLineOff, onDelete, spanPx }
function buildDimControls(opts) {
    const { dim, type, id, isSelected, select, getLabelOff, setLabelOff,
            getLineOff, setLineOff, onDelete, spanPx } = opts;
    const sel = isSelected();
    const lblEl = dim.querySelector('.arch-label-new');
    if (!lblEl) return;

    // Clamp helper: keep the number within the line ends (with a margin).
    const halfSpan = Math.max(0, spanPx / 2 - 14); // 14px margin from each end
    const clampLabel = (vCurUnit) => {
        const px = vCurUnit * elevScale;
        const cl = Math.max(-halfSpan, Math.min(halfSpan, px));
        return cl / elevScale;
    };

    // Apply the current label-along offset (clamped to the line) by biasing the
    // two line segments (no gap left behind).
    const lblOffPx0 = clampLabel(getLabelOff()) * elevScale;
    const segs = dim.querySelectorAll('.dim-line-segment, .dim-line-segment-v');
    if (segs.length === 2) {
        if (type === 'h') {
            segs[0].style.flex = `1 1 calc(50% + ${lblOffPx0}px)`;
            segs[1].style.flex = `1 1 calc(50% - ${lblOffPx0}px)`;
        } else {
            segs[0].style.flex = `1 1 calc(50% - ${lblOffPx0}px)`;
            segs[1].style.flex = `1 1 calc(50% + ${lblOffPx0}px)`;
        }
    }
    lblEl.style.position = 'relative';
    lblEl.style.zIndex = '56';
    lblEl.style.cursor = 'pointer';
    lblEl.style.pointerEvents = 'auto';
    if (sel) dim.style.outline = '1px dashed var(--accent,#3b82f6)';

    // Click number to select.
    lblEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        select();
        drawElevAll();
    });

    // The 4 arrows, locked just outside the box edges.
    const chevron = (dir, w) => {
        const pts = { up:'4,11 8,5 12,11', down:'4,5 8,11 12,5', left:'11,4 5,8 11,12', right:'5,4 11,8 5,12' }[dir];
        return `<svg viewBox="0 0 16 16" width="${w||13}" height="${w||13}" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };
    // mover: which axis each arrow drives depends on the line orientation.
    // horizontal line → L/R = number(along), U/D = line(perp)
    // vertical line   → U/D = number(along), L/R = line(perp)
    const makeArrow = (dir) => {
        const a = document.createElement('div');
        a.className = 'dim-arrow';
        a.setAttribute('data-export-skip', '1');
        a.setAttribute('data-html2canvas-ignore', 'true');
        const isNumberAxis = (type === 'h') ? (dir === 'left' || dir === 'right')
                                            : (dir === 'up' || dir === 'down');
        const cur = (dir === 'left' || dir === 'right') ? 'ew-resize' : 'ns-resize';
        // Position locked to the box edge.
        const pos = {
            left:  'right:100%; top:50%; transform:translateY(-50%); margin-right:3px;',
            right: 'left:100%; top:50%; transform:translateY(-50%); margin-left:3px;',
            up:    'bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:3px;',
            down:  'top:100%; left:50%; transform:translateX(-50%); margin-top:3px;',
        }[dir];
        a.style.cssText = `position:absolute; ${pos} z-index:58; pointer-events:auto; cursor:${cur};`
            + `opacity:${sel ? '0.9' : '0.35'}; transition:opacity 0.12s; line-height:0;`;
        a.innerHTML = chevron(dir);
        a.onmouseenter = () => { a.style.opacity = '1'; };
        a.onmouseleave = () => { a.style.opacity = sel ? '0.9' : '0.35'; };
        a.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            select(); 
            const startX = e.clientX, startY = e.clientY;
            const startLabel = getLabelOff();
            const startLine = getLineOff();
            document.body.style.cursor = cur;
            const onMove = (mv) => {
                const dxIn = (mv.clientX - startX) / elevScale;
                const dyIn = (mv.clientY - startY) / elevScale;
                if (isNumberAxis) {
                    // move the number along the line
                    let v;
                    if (type === 'h') v = startLabel + dxIn;       // L/R
                    else v = startLabel - dyIn;                    // U/D (up=+)
                    setLabelOff(clampLabel(v));
                } else {
                    // move the whole line (perpendicular)
                    let v;
                    if (type === 'h') v = startLine - dyIn;        // U/D
                    else v = startLine + dxIn;                     // L/R
                    setLineOff(v);
                }
                drawElevAll();
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                if (typeof pushHistory === 'function') pushHistory();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        return a;
    };
    ['left','right','up','down'].forEach(d => lblEl.appendChild(makeArrow(d)));

    // Fat transparent hit-strip so the whole (thin) line is clickable to
    // select — like the custom drawn lines. Sits behind the number/arrows.
    const hit = document.createElement('div');
    hit.setAttribute('data-export-skip', '1');
    hit.setAttribute('data-html2canvas-ignore', 'true');
    hit.style.cssText = (type === 'h')
        ? 'position:absolute; left:0; right:0; top:50%; height:12px; transform:translateY(-50%); cursor:pointer; z-index:40; pointer-events:auto;'
        : 'position:absolute; top:0; bottom:0; left:50%; width:12px; transform:translateX(-50%); cursor:pointer; z-index:40; pointer-events:auto;';
    hit.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        select();
        drawElevAll();
    });
    dim.insertBefore(hit, dim.firstChild);

    // × delete — only when selected, positioned at the END of the line (far
    // from the arrow cluster so it isn't hit by accident). Appended to the dim
    // so it anchors to the line end, not the number.
    if (sel) {
        const del = document.createElement('div');
        del.className = 'dim-hide-x';
        del.setAttribute('data-export-skip', '1');
        del.setAttribute('data-html2canvas-ignore', 'true');
        del.textContent = '×';
        del.title = 'Delete this dimension';
        del.style.cssText =
            'position:absolute; width:16px; height:16px; line-height:14px; text-align:center; border-radius:50%;' +
            'background:var(--dim-color); color:#fff; font-size:13px; font-weight:bold; cursor:pointer;' +
            'z-index:60; opacity:0.95; user-select:none; border:1.5px solid #fff; box-sizing:border-box; pointer-events:auto;' +
            (type === 'h'
                ? 'left:100%; top:50%; transform:translate(7px,-50%);'   // right end
                : 'left:50%; bottom:100%; transform:translate(-50%,-7px);'); // top end
        del.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); onDelete(); });
        dim.appendChild(del);
    }
}

// Drag the number/label ALONG the line (h-dim: left/right; v-dim: up/down) to
// separate overlapping numbers. Updates the label-along offset for dimId.

// Drag the number/label ALONG the line (h-dim: left/right; v-dim: up/down) to
// separate overlapping numbers. Updates the label-along offset for dimId.
function attachLabelDrag(lblEl, type, dimId) {
    lblEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startOff = getLabelOffset(dimId); // current unit
        document.body.style.cursor = 'move';
        const onMove = (mv) => {
            let deltaPx, newOff;
            if (type === 'h') {
                deltaPx = mv.clientX - startX;       // along x
                newOff = startOff + deltaPx / elevScale;
            } else {
                deltaPx = mv.clientY - startY;       // screen down → along -y(up=+)
                newOff = startOff - deltaPx / elevScale;
            }
            setLabelOffset(dimId, newOff);
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// Attach an arrow-style drag handle to a dimension line. Horizontal lines
// (drag up/down) get stacked up/down chevrons at the midpoint. Vertical lines
// (drag left/right) get left/right chevrons flanking the number. Faded at
// rest, prominent on hover. Excluded from exports. Value never changes.
function attachDimDragHandle(dim, type, dimId, lblOffPx) {
    lblOffPx = lblOffPx || 0;
    const grip = document.createElement('div');
    grip.className = 'dim-drag-grip';
    grip.setAttribute('data-export-skip', '1');
    grip.setAttribute('data-html2canvas-ignore', 'true');
    grip.title = 'Drag to reposition this dimension';

    const chevron = (dir) => {
        // dir: 'up','down','left','right'
        const pts = {
            up:    '4,11 8,5 12,11',
            down:  '4,5 8,11 12,5',
            left:  '11,4 5,8 11,12',
            right: '5,4 11,8 5,12',
        }[dir];
        return `<svg viewBox="0 0 16 16" width="13" height="13" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };

    if (type === 'h') {
        // Stacked up/down chevrons, centered on the line + label offset so they
        // follow the number when it's slid along the line.
        grip.style.cssText =
            `position:absolute; left:calc(50% + ${lblOffPx}px); top:50%; transform:translate(-50%,-50%);` +
            'display:flex; flex-direction:column; align-items:center; line-height:0;' +
            'cursor:ns-resize; z-index:50; pointer-events:auto; opacity:0.35; transition:opacity 0.12s;';
        grip.innerHTML = chevron('up') + chevron('down');
    } else {
        // Left/right chevrons flanking the number; gap sized to the label
        // width so the arrows stay just OUTSIDE the white box as it grows or
        // shrinks (e.g. unit changes). Measured once the dim is in the DOM.
        // top offset follows the number along the vertical line (up = +).
        grip.style.cssText =
            `position:absolute; left:50%; top:calc(50% - ${lblOffPx}px); transform:translate(-50%,-50%);` +
            'display:flex; flex-direction:row; align-items:center; gap:30px; line-height:0;' +
            'cursor:ew-resize; z-index:50; pointer-events:auto; opacity:0.35; transition:opacity 0.12s;';
        grip.innerHTML = chevron('left') + chevron('right');
        // After layout, set the gap to the label's width + margin.
        requestAnimationFrame(() => {
            const lbl = dim.querySelector('.arch-label-new');
            if (lbl) {
                const w = lbl.getBoundingClientRect().width;
                if (w > 0) grip.style.gap = (w + 14) + 'px';
            }
        });
    }
    grip.onmouseenter = () => { grip.style.opacity = '1'; };
    grip.onmouseleave = () => { grip.style.opacity = '0.35'; };

    grip.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startOffset = getDimOffset(dimId); // current unit
        document.body.style.cursor = (type === 'h') ? 'ns-resize' : 'ew-resize';
        const onMove = (mv) => {
            let deltaPx, newOffset;
            if (type === 'h') {
                deltaPx = mv.clientY - startY;
                newOffset = startOffset - (deltaPx / elevScale); // screen-down → elevation-down
            } else {
                deltaPx = mv.clientX - startX;
                newOffset = startOffset + (deltaPx / elevScale);
            }
            const snapped = snapDimOffset(newOffset, dimId);
            setDimOffset(dimId, snapped.value);
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    dim.appendChild(grip);
}

// Arrow drag handle for a GROUP-BOX dimension line. Unlike spacing dims, the
// group dim lines are loose elements in the group-dim-layer, so the handle is
// positioned absolutely at (cxPx, cyPx). type 'h' = width line (drag up/down),
// 'v' = height line (drag left/right). Offset stored in dimOffsets[id], where
// positive = the line sits further from the box.
// 4-way arrows around a group-dim number, matching the other dimension lines.
// type 'h' (width line): L/R move the NUMBER along the line (clamped), U/D move
// the LINE. type 'v' (height line): U/D move the NUMBER (clamped), L/R move the
// LINE. Arrows are positioned around the label's visual box (post-layout).
function buildGroupArrows(lblEl, type, id, halfSpanPx) {
    const layer = document.getElementById('group-dim-layer');
    if (!layer) return;
    const clampPx = Math.max(0, halfSpanPx - 12);
    const chev = (dir) => {
        const pts = { up:'4,11 8,5 12,11', down:'4,5 8,11 12,5', left:'11,4 5,8 11,12', right:'5,4 11,8 5,12' }[dir];
        return `<svg viewBox="0 0 16 16" width="13" height="13" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };
    {
        const lb = lblEl.getBoundingClientRect();
        const layb = layer.getBoundingClientRect();
        const cx = lb.left + lb.width / 2 - layb.left;
        const cy = lb.top + lb.height / 2 - layb.top;
        const halfW = lb.width / 2, halfH = lb.height / 2;
        const GAP = 6;
        const mk = (screenDir) => {
            const a = document.createElement('div');
            a.className = 'dim-arrow';
            a.setAttribute('data-export-skip', '1');
            a.setAttribute('data-html2canvas-ignore', 'true');
            const cur = (screenDir === 'left' || screenDir === 'right') ? 'ew-resize' : 'ns-resize';
            let left = cx, top = cy;
            if (screenDir === 'up')    top = cy - halfH - GAP;
            if (screenDir === 'down')  top = cy + halfH + GAP;
            if (screenDir === 'left')  left = cx - halfW - GAP;
            if (screenDir === 'right') left = cx + halfW + GAP;
            a.style.cssText = `position:absolute; left:${left}px; top:${top}px; transform:translate(-50%,-50%); z-index:53; pointer-events:auto; cursor:${cur}; opacity:0.5; transition:opacity 0.12s; line-height:0;`;
            a.innerHTML = chev(screenDir);
            a.onmouseenter = () => { a.style.opacity = '1'; };
            a.onmouseleave = () => { a.style.opacity = '0.5'; };
            // Which action: for h line, L/R = number, U/D = line. For v line,
            // U/D = number, L/R = line.
            const isNumberAxis = (type === 'h') ? (screenDir === 'left' || screenDir === 'right')
                                                : (screenDir === 'up' || screenDir === 'down');
            a.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                const startX = e.clientX, startY = e.clientY;
                const startLbl = getLabelOffset(id);   // current unit
                const startLine = getDimOffset(id);
                document.body.style.cursor = cur;
                const onMove = (mv) => {
                    if (isNumberAxis) {
                        let v;
                        if (type === 'h') v = startLbl + (mv.clientX - startX) / elevScale; // L/R
                        else v = startLbl - (mv.clientY - startY) / elevScale;              // U/D up=+
                        const px = Math.max(-clampPx, Math.min(clampPx, v * elevScale));
                        setLabelOffset(id, px / elevScale);
                    } else {
                        // move the line (perpendicular). Larger offset = further
                        // from the box (matches attachGroupDimHandle semantics).
                        let v;
                        if (type === 'h') v = startLine + (startY - mv.clientY) / elevScale; // U/D, up=larger
                        else v = startLine + (startX - mv.clientX) / elevScale;              // L/R, left=larger
                        if (v < 0) v = 0;
                        const snapped = snapDimOffset(v, id);
                        setDimOffset(id, Math.max(0, snapped.value));
                    }
                    drawElevAll();
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    if (typeof pushHistory === 'function') pushHistory();
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
            return a;
        };
        ['left','right','up','down'].forEach(d => layer.appendChild(mk(d)));
    }
}

// Slide a group-dim number along its line (h: left/right, v: up/down), clamped
// to the line span. Stores via the label-offset helper (group-<id>-w/h-lbl).
function attachGroupLabelDrag(lblEl, type, lblId, halfSpanPx) {
    const clampPx = Math.max(0, halfSpanPx - 12);
    lblEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startOff = getLabelOffset(lblId); // current unit
        document.body.style.cursor = 'move';
        const onMove = (mv) => {
            let deltaIn;
            if (type === 'h') deltaIn = (mv.clientX - startX) / elevScale;
            else deltaIn = -(mv.clientY - startY) / elevScale; // up = +
            let v = startOff + deltaIn;
            // clamp to the line
            const px = v * elevScale;
            v = Math.max(-clampPx, Math.min(clampPx, px)) / elevScale;
            setLabelOffset(lblId, v);
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function attachGroupDimHandle(layer, type, id, cxPx, cyPx) {
    const grip = document.createElement('div');
    grip.className = 'dim-drag-grip';
    grip.setAttribute('data-export-skip', '1');
    grip.setAttribute('data-html2canvas-ignore', 'true');
    grip.title = 'Drag to reposition this dimension';
    const chevron = (dir) => {
        const pts = { up:'4,11 8,5 12,11', down:'4,5 8,11 12,5', left:'11,4 5,8 11,12', right:'5,4 11,8 5,12' }[dir];
        return `<svg viewBox="0 0 16 16" width="13" height="13" style="display:block;"><polyline points="${pts}" fill="none" stroke="var(--dim-color)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };
    const common = `position:absolute; left:${cxPx}px; top:${cyPx}px; z-index:50; pointer-events:auto; opacity:0.35; transition:opacity 0.12s; line-height:0;`;
    if (type === 'h') {
        grip.style.cssText = common + 'transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; cursor:ns-resize;';
        grip.innerHTML = chevron('up') + chevron('down');
    } else {
        grip.style.cssText = common + 'transform:translate(-50%,-50%); display:flex; flex-direction:row; align-items:center; gap:6px; cursor:ew-resize;';
        grip.innerHTML = chevron('left') + chevron('right');
    }
    grip.onmouseenter = () => { grip.style.opacity = '1'; };
    grip.onmouseleave = () => { grip.style.opacity = '0.35'; };
    grip.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startOffset = getDimOffset(id);
        document.body.style.cursor = (type === 'h') ? 'ns-resize' : 'ew-resize';
        const onMove = (mv) => {
            let newOffset;
            if (type === 'h') {
                // drag UP (screen -clientY) → larger gap above box → larger offset
                newOffset = startOffset + ((startY - mv.clientY) / elevScale);
            } else {
                // drag LEFT (screen -clientX) → larger gap left of box → larger offset
                newOffset = startOffset + ((startX - mv.clientX) / elevScale);
            }
            if (newOffset < 0) newOffset = 0; // can't go inside the box
            const snapped = snapDimOffset(newOffset, id);
            setDimOffset(id, Math.max(0, snapped.value));
            drawElevAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (typeof pushHistory === 'function') pushHistory();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    layer.appendChild(grip);
}

function setElevUnit(u) {
    setUnit(u);
}

// Helper: load an image from a data URL and resolve when ready (or reject on error)
function _loadImg(dataUrl) {
    return new Promise((resolve) => {
        if (!dataUrl) { resolve(null); return; }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

// html2canvas sometimes fails to capture <img src="*.svg"> when the SVG is fetched
// at render time (it can drop silently due to CORS or timing). Preconvert the
// person SVG to a base64 data URL once and cache it; we swap the img's src to
// the data URL during export so html2canvas sees an inline image it can rasterize.
let _personSvgDataUrl = null;
async function _getPersonSvgDataUrl() {
    if (_personSvgDataUrl) return _personSvgDataUrl;
    const personImg = document.getElementById('person');
    if (!personImg) return null;
    const src = personImg.getAttribute('src');
    if (!src || src.startsWith('data:')) { _personSvgDataUrl = src; return _personSvgDataUrl; }
    try {
        const res = await fetch(src);
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || 'image/svg+xml';
        const text = await res.text();
        // base64-encode the SVG text safely (handles unicode)
        const b64 = btoa(unescape(encodeURIComponent(text)));
        _personSvgDataUrl = `data:${ct};base64,${b64}`;
        return _personSvgDataUrl;
    } catch (e) {
        console.warn('Could not inline person SVG:', e);
        return null;
    }
}

async function exportElevPNG(opts) {
    const ws = document.querySelector('#view-elevation .workspace');
    const wrap = document.getElementById('export-wrap');
    const wall = document.getElementById('wall');

    // Zoom-independent export: temporarily reset the zoom factor to 1
    // (natural fit-to-workspace scale) so the exported PNG is identical
    // regardless of how the user has zoomed in or out while working.
    // This affects rendered text size, line widths, and frame positions.
    // Restored in the finally block.
    const oldZoomFactor = elevZoomFactor;
    elevZoomFactor = 1;

    // Force light theme for export (consistency with print/PDF), restore after.
    const wasDark = !document.body.classList.contains('light-theme');
    document.body.classList.add('light-theme');
    drawElevAll();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const oldOverflow = ws.style.overflow; ws.style.overflow = 'visible';
    const oldWallBg = wall.style.background; wall.style.background = 'transparent';

    // Character clip-fix + flush-right + flush-bottom export padding.
    // The character is position:absolute inside #wall so it doesn't contribute
    // to #export-wrap's max-content sizing — we measure where it actually is
    // and adjust the padding inline.
    //
    // Per user request: bottom is flush with the wall-width arch dim line
    // (trim away the empty space below it), right is flush with the rightmost
    // content (wall right edge or character if further right), top and left
    // keep their default 80px padding so the left & top arch dim lines have
    // room to render. All restored in the finally block.
    const exportWrap = document.getElementById('export-wrap');
    const oldExportWrapPadding = exportWrap.style.padding;
    {
        const PAD_BASE = 80;            // Top + Left default padding
        const TIGHT_PAD = 8;            // Minimal trim on flush sides — keeps content from sitting
                                        // literally at the pixel edge of the PNG (some clipping safety).
        const SAFETY = 20;              // Extra room added when character overflows the base padding

        // Find what's furthest right & bottom in the export.
        // Right candidates: wall's right edge, character's right (if active & to the right).
        // Bottom candidates: the wall-width arch dim line BELOW the wall.
        const wrapRect = exportWrap.getBoundingClientRect();
        const wallRect = wall.getBoundingClientRect();

        // Bottom dim line: lives in #arch-dim-layer, positioned below the wall.
        // We find the bottom-most element in there to compute the trim point.
        let dimBottomY = wallRect.bottom;  // fallback to wall bottom if no dim found
        const archDimEls = document.querySelectorAll('#arch-dim-layer .arch-dim, #arch-dim-layer .arch-dim-h, #arch-dim-layer .arch-dim-v');
        archDimEls.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.bottom > dimBottomY) dimBottomY = r.bottom;
        });

        // Character bounds (if visible)
        const personWrapForBounds = document.getElementById('person-wrap');
        const personVisible = personWrapForBounds && getComputedStyle(personWrapForBounds).display !== 'none';
        let personRect = null;
        if (personVisible) personRect = personWrapForBounds.getBoundingClientRect();

        // ── TOP padding: base 80px, plus character overflow above if any ──
        let overflowTop = 0;
        if (personRect) overflowTop = Math.max(0, wrapRect.top - personRect.top);
        const padTop = PAD_BASE + Math.ceil(overflowTop) + (overflowTop > 0 ? SAFETY : 0);

        // ── LEFT padding: base 80px, plus character overflow left if any ──
        let overflowLeft = 0;
        if (personRect) overflowLeft = Math.max(0, wrapRect.left - personRect.left);
        const padLeft = PAD_BASE + Math.ceil(overflowLeft) + (overflowLeft > 0 ? SAFETY : 0);

        // ── RIGHT padding: flush to rightmost content with a small breathing room ──
        // Find the rightmost edge: wall right, or character right if it sticks out.
        let rightmost = wallRect.right;
        if (personRect && personRect.right > rightmost) rightmost = personRect.right;
        // Convert "distance from wrap-content-right to rightmost" to padding.
        // wrapRect.right - currentPadRight = wrap-padding-box right edge
        // We want: new wrap-padding-box right edge = rightmost + TIGHT_PAD
        // current right padding (in px) = the CSS padding-right value
        const currentRightPad = parseFloat(getComputedStyle(exportWrap).paddingRight) || PAD_BASE;
        const wrapContentRight = wrapRect.right - currentRightPad;
        // The wall is laid out via flex centering inside wrap content. So wallRect.right
        // tells us where the wall ends; we want the new padding-right edge at
        // rightmost + TIGHT_PAD. New padding = (rightmost + TIGHT_PAD) - wrapContentRight.
        const padRight = Math.max(TIGHT_PAD, Math.ceil(rightmost + TIGHT_PAD - wrapContentRight));

        // ── BOTTOM padding: flush at the wall-width dim line bottom ──
        const currentBottomPad = parseFloat(getComputedStyle(exportWrap).paddingBottom) || PAD_BASE;
        const wrapContentBottom = wrapRect.bottom - currentBottomPad;
        // Find required padding so the new wrap-padding-box bottom = dimBottomY + TIGHT_PAD
        const padBottom = Math.max(TIGHT_PAD, Math.ceil(dimBottomY + TIGHT_PAD - wrapContentBottom));

        exportWrap.style.padding = `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`;
        // Force reflow + extra frame so html2canvas sees the new layout
        void exportWrap.offsetWidth;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    // PERSON: html2canvas can fail to capture <img src="*.svg"> reliably. Same fix
    // we used for frames — pre-render to a canvas and overlay it. Inlining the SVG
    // src as a data URL is also done as a backup in case the canvas overlay fails.
    const personImg = document.getElementById('person');
    const personWrap = document.getElementById('person-wrap');
    let personOriginalSrc = null;
    let personOverlayCanvas = null;
    let personOriginalDisplay = null;
    const personIsVisible = personWrap && getComputedStyle(personWrap).display !== 'none';

    if (personImg && personIsVisible) {
        // Step 1: get the SVG as a data URL (cached after first call)
        const dataUrl = await _getPersonSvgDataUrl();
        if (dataUrl) {
            // Step 2: load it into an Image object we can drawImage from
            const img = await _loadImg(dataUrl);
            if (img && img.naturalWidth) {
                // Step 3: render to a canvas at the person's on-screen size (3x for crispness)
                const rect = personImg.getBoundingClientRect();
                const cssW = Math.max(1, Math.round(rect.width));
                const cssH = Math.max(1, Math.round(rect.height));
                const SCALE = 3;
                personOverlayCanvas = document.createElement('canvas');
                personOverlayCanvas.width = cssW * SCALE;
                personOverlayCanvas.height = cssH * SCALE;
                personOverlayCanvas.style.cssText = `width:${cssW}px; height:${cssH}px; display:block;`;
                const pctx = personOverlayCanvas.getContext('2d');
                pctx.drawImage(img, 0, 0, personOverlayCanvas.width, personOverlayCanvas.height);

                // Step 4: hide the original <img>, append our canvas in its place
                personOriginalDisplay = personImg.style.display;
                personImg.style.display = 'none';
                personImg.parentNode.appendChild(personOverlayCanvas);
            } else {
                // Fallback: just swap the src (less reliable but better than nothing)
                personOriginalSrc = personImg.getAttribute('src');
                personImg.src = dataUrl;
                await new Promise(res => {
                    if (personImg.complete && personImg.naturalWidth) return res();
                    personImg.onload = () => res();
                    personImg.onerror = () => res();
                });
            }
        }
    }

    // Track everything we mutate so we can put it back exactly as it was.
    const frameLayer = document.getElementById('frame-layer');
    const frameDivs = Array.from(frameLayer.children);
    const restoreList = []; // {div, hiddenChildren: [{el, prevDisplay}], overlayCanvas}

    try {
        // Pre-load all swatch images in parallel
        const visibleFrames = elevFrames.filter(f => f.active);
        const imagePromises = visibleFrames.map(f =>
            (f.fType === 'image' && f.swatchDataUrl) ? _loadImg(f.swatchDataUrl) : Promise.resolve(null)
        );
        const loadedImages = await Promise.all(imagePromises);

        // For each visible frame: render a high-res canvas using the same routine
        // as the Frame Dashboard PNG export, then drop it on top of the frame's
        // existing children (which we hide) so html2canvas sees the crisp version.
        let frameIdx = 0;
        frameDivs.forEach(div => {
            // Skip non-frame siblings (shouldn't be any, but defensive)
            if (!div.classList.contains('frame-vis')) return;

            const f = visibleFrames[frameIdx];
            if (!f) return;
            const swatchImg = loadedImages[frameIdx];
            frameIdx++;

            // Elevation frames store dimensions as f.w / f.h (set from d.extW / d.extH at import time).
            // The renderer expects extW / extH (dashboard schema), so adapt here. Bail out if
            // dimensions are zero/missing to avoid a 0-sized canvas (drawImage would throw).
            if (!f.w || !f.h || !f.fW) return;
            const adaptedFrame = Object.assign({}, f, { extW: f.w, extH: f.h });
            // Convert to inches so the renderer's hardcoded shadow/stroke effects
            // (calibrated for inches at 72 dpi) look identical regardless of elev unit.
            const renderFrame = _frameDataInInches(adaptedFrame, elevUnit);

            // Native render with PADDING around the frame so its drop shadow can
            // extend beyond the frame edge into the wall. The overlay is then
            // positioned with a negative offset (computed from pad) so the frame
            // itself still aligns with its container.
            // showArtLabel is false: clients want clean frames in elevation exports;
            // the dim numbers are visible on screen via the DOM art-visual layer but
            // don't get baked into the PNG.
            const elevPad = 60;  // px in render-coord space (72 dpi → ~0.83")
            const { canvas: nativeCanvas } = renderFrameToCanvas(renderFrame, swatchImg, {
                dpi: 72,
                pad: elevPad,
                showArtLabel: false,
                unit: 'in',  // we converted, so renderer is now in inches
            });

            // Sanity check the canvas before we try to drawImage from it
            if (!nativeCanvas.width || !nativeCanvas.height) return;

            // Hide the frame's existing children (rails, mats, art-visual)
            const hiddenChildren = [];
            Array.from(div.children).forEach(child => {
                hiddenChildren.push({ el: child, prevDisplay: child.style.display });
                child.style.display = 'none';
            });

            // Add the canvas as a single overlay child. Native canvas is wider/taller
            // than the frame by 2*elevPad on each axis. We position with negative
            // offset so the frame itself still aligns to (0,0) of the container,
            // and let the shadow region extend past the container boundary.
            // CSS scale: native frame px (= renderFrame.extW*72) → container px (= f.w*elevScale)
            const cssScale = (f.w * elevScale) / (renderFrame.extW * 72);
            const overlayCssW = nativeCanvas.width * cssScale;
            const overlayCssH = nativeCanvas.height * cssScale;
            const padCssOffset = elevPad * cssScale;
            const overlay = document.createElement('canvas');
            overlay.width = nativeCanvas.width;
            overlay.height = nativeCanvas.height;
            overlay.getContext('2d').drawImage(nativeCanvas, 0, 0);
            overlay.style.cssText = `position:absolute; top:${-padCssOffset}px; left:${-padCssOffset}px; width:${overlayCssW}px; height:${overlayCssH}px; pointer-events:none; display:block; overflow:visible;`;
            div.appendChild(overlay);

            // Make sure the container itself doesn't draw a competing border/shadow.
            div.dataset._origBoxShadow = div.style.boxShadow || '';
            div.dataset._origBorder = div.style.border || '';
            div.dataset._origOverflow = div.style.overflow || '';
            div.style.boxShadow = 'none';
            div.style.border = 'none';
            div.style.overflow = 'visible';

            restoreList.push({ div, hiddenChildren, overlayCanvas: overlay });
        });

        // Wait for the browser to commit the DOM changes
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Capture the elevation
        const canvas = await html2canvas(wrap, {
            backgroundColor: null,
            scale: 3,
            useCORS: true,
            allowTaint: true,
            onclone: (clonedDoc) => {
                // html2canvas renders `writing-mode: vertical-rl` + rotate(180)
                // upside-down. In the CLONE only, rebuild the hang label as
                // plain horizontal text rotated -90° (reads bottom→top, matching
                // the screen). Screen/SVG output is unaffected.
                //
                // Positioning must NOT depend on the text width: when horizontal
                // the box is wide, so anchoring by right:100% pushes it too far
                // left (onto the wall-height dim line). Instead we rotate about
                // the element's CENTER and use percentage translates (which
                // reference the element's own border-box) so the rotated block
                // lands centered just-left-of the wall edge, on the hang line,
                // regardless of how long the label text is.
                clonedDoc.querySelectorAll('.hang-label').forEach(el => {
                    el.style.writingMode = 'horizontal-tb';
                    el.style.whiteSpace = 'nowrap';
                    el.style.padding = '2px 6px';
                    el.style.marginRight = '0';
                    el.style.transformOrigin = 'center';
                    // translate(50%,-50%) rotate(-90deg): centers the rotated
                    // block at the wall's left edge on the line; the -20px in X
                    // tucks it just outside the wall (clear of the red dim line).
                    el.style.transform = 'translate(calc(50% - 20px), -50%) rotate(-90deg)';
                });
            },
        });
        const pngName = `${elevations[currentElevIndex].name.replace(/[\\/:*?"<>|]/g, '_')}.png`;
        // Bulk-export mode: hand the blob back instead of downloading.
        // The finally block still restores theme/zoom/person/etc.
        if (opts && opts.returnBlob) {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('canvas.toBlob returned null');
            return { blob: blob, filename: pngName };
        }
        const a = document.createElement('a');
        a.download = pngName;
        a.href = canvas.toDataURL("image/png");
        a.click();
    } catch (err) {
        console.error(err);
        // Bulk mode: let the ZIP loop record the failure (one alert per
        // elevation would be hostile). Single export keeps the alert.
        if (opts && opts.returnBlob) throw err;
        alert("Image Export Failed: " + (err && err.message ? err.message : "Unknown error") +
              "\n\nIf you opened this file directly (file://...), browser security blocks local file access. Please serve the folder via a local web server (e.g. VS Code Live Server) and try again.");
    } finally {
        // Restore every frame we touched
        restoreList.forEach(({ div, hiddenChildren, overlayCanvas }) => {
            if (overlayCanvas && overlayCanvas.parentNode === div) div.removeChild(overlayCanvas);
            hiddenChildren.forEach(({ el, prevDisplay }) => { el.style.display = prevDisplay; });
            div.style.boxShadow = div.dataset._origBoxShadow || '';
            div.style.border = div.dataset._origBorder || '';
            div.style.overflow = div.dataset._origOverflow || '';
            delete div.dataset._origBoxShadow;
            delete div.dataset._origBorder;
            delete div.dataset._origOverflow;
        });

        if (wasDark) document.body.classList.remove('light-theme');
        ws.style.overflow = oldOverflow;
        wall.style.background = oldWallBg;
        // Restore the export-wrap padding (was temporarily inflated to include
        // the character when they extended past the wall edges).
        exportWrap.style.padding = oldExportWrapPadding;
        // Restore zoom factor and re-render at user's zoom level
        elevZoomFactor = oldZoomFactor;
        drawElevAll();
        // Restore the person element (overlay canvas removed, img re-shown / src restored)
        if (personImg) {
            if (personOverlayCanvas && personOverlayCanvas.parentNode) {
                personOverlayCanvas.parentNode.removeChild(personOverlayCanvas);
            }
            if (personOriginalDisplay !== null) personImg.style.display = personOriginalDisplay;
            if (personOriginalSrc !== null) personImg.src = personOriginalSrc;
        }
        // Final clean re-render in restored theme
        drawElevAll();
    }
}

// ──────────────────────────────────────────────────────────────────────────
// SVG (VECTOR) ELEVATION EXPORT
// ──────────────────────────────────────────────────────────────────────────
// Exports the current elevation as an SVG: all annotations (dimension lines,
// ticks, text, group boxes, guides, legend) become crisp native vector;
// frame swatch textures embed as base64 raster <image> (they're photos, so
// raster is correct). Opens cleanly in Illustrator / InDesign.
//
// Approach: render the elevation at a fixed export scale, then walk the
// rendered DOM inside #wall and translate each element into SVG. Walking the
// live DOM (rather than re-deriving geometry) guarantees the SVG matches
// exactly what's on screen, including all dimension geometry.

// Escape text for safe inclusion in SVG.
function _svgEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Parse a CSS color + border shorthand into {width, style, color}.
function _parseBorder(borderStr) {
    if (!borderStr || borderStr === 'none') return null;
    // e.g. "2px dashed rgb(224, 0, 0)" — color may contain spaces (rgb()).
    const m = borderStr.match(/^([\d.]+)px\s+(solid|dashed|dotted)\s+(.+)$/);
    if (!m) return null;
    return { width: parseFloat(m[1]), style: m[2], color: m[3].trim() };
}

// Build a frame as nested VECTOR shapes for the SVG export (rail + mats +
// reveal + faux mat + float paper + art opening), mirroring the PNG
// renderer's geometry. `pos` is the on-canvas rect {x,y,w,h} in SVG px.
// `frameColor` is the rail color (frame fColor, or sampled swatch average for
// image swatches). Returns an array of SVG element strings.
function buildFrameSVG(f, pos, unit, frameColor) {
    const parts = [];
    const px = pos.x, py = pos.y, pw = pos.w, ph = pos.h;
    const sclX = pw / (f.w || 1);
    const sclY = ph / (f.h || 1);
    const S = (sclX + sclY) / 2;

    const isC = (f.product === 'Framed Canvas (Floater)');
    const isFrameless = (f.product === 'Frameless Canvas (Wrapped)');
    const useFM = !isC && (f.useFloatMount === true);

    const shade = (hex, pct) => {
        const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
        let r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
        const adj = v => pct >= 0 ? Math.round(v + (255-v)*pct) : Math.round(v*(1+pct));
        return '#' + [adj(r),adj(g),adj(b)].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
    };
    // A rectangle with a rectangular hole punched out (fill-rule evenodd).
    // outer = {x,y,w,h}, hole = {x,y,w,h}. Paints only the ring between them,
    // leaving the hole transparent down to whatever's behind the SVG.
    const ringPath = (outer, hole, fill) => {
        const o = `M ${outer.x.toFixed(1)} ${outer.y.toFixed(1)} h ${outer.w.toFixed(1)} v ${outer.h.toFixed(1)} h ${(-outer.w).toFixed(1)} Z`;
        const hpath = `M ${hole.x.toFixed(1)} ${hole.y.toFixed(1)} h ${hole.w.toFixed(1)} v ${hole.h.toFixed(1)} h ${(-hole.w).toFixed(1)} Z`;
        return `<path d="${o} ${hpath}" fill-rule="evenodd" fill="${fill}"/>`;
    };
    const strokeRect = (x,y,w,h,stroke,sw) =>
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw||1}"/>`;

    if (isFrameless) {
        // No frame, no mats — just an outline marking the canvas face. Fully
        // open (transparent) so artwork behind shows through.
        parts.push(strokeRect(px, py, pw, ph, shade(frameColor||'#888', -0.2), 1));
        return parts;
    }

    const fwPx = (f.fW || 1.25) * S;
    const ix = px + fwPx, iy = py + fwPx, iw = pw - fwPx*2, ih = ph - fwPx*2;

    // ── Compute the FINAL art-opening rectangle for this product ──
    let aX, aY, aW, aH;
    if (isC) {
        const insetPx = ((f.floaterInset !== undefined ? f.floaterInset : 0.75)) * S;
        aX = px + insetPx; aY = py + insetPx; aW = pw - insetPx*2; aH = ph - insetPx*2;
    } else if (useFM) {
        const marginPx = (parseFloat(f.sbPaperMargin)||0) * S;
        const borderPx = (parseFloat(f.sbPaperBorder)||0) * S;
        aX = ix + marginPx + borderPx; aY = iy + marginPx + borderPx;
        aW = iw - (marginPx+borderPx)*2; aH = ih - (marginPx+borderPx)*2;
    } else {
        let cX = ix, cY = iy, cW = iw, cH = ih;
        const m1On = (f.m1A !== false);
        const m2On = (m1On && f.m2A === true);
        if (m1On) {
            const mT=(f.m1T||0)*S, mB=(f.m1B||0)*S, mL=(f.m1L||0)*S, mR=(f.m1R||0)*S;
            cX = ix+mL; cY = iy+mT; cW = iw-mL-mR; cH = ih-mT-mB;
            if (m2On) {
                const revPx = (parseFloat(f.m2)||0) * S;
                cX += revPx; cY += revPx; cW -= revPx*2; cH -= revPx*2;
            }
        }
        if (f.useFauxMat === true) {
            const fbPx = (parseFloat(f.sbPaperBorder)||0) * S;
            cX += fbPx; cY += fbPx; cW -= fbPx*2; cH -= fbPx*2;
        }
        aX = cX; aY = cY; aW = cW; aH = cH;
    }
    if (aW < 0) aW = 0; if (aH < 0) aH = 0;
    const hole = { x: aX, y: aY, w: aW, h: aH };

    // ── FRAME RAIL: full outer rect minus the art opening, as a ring ──
    parts.push(ringPath({x:px,y:py,w:pw,h:ph}, hole, frameColor || '#333'));
    // Miter lines
    const mc = shade(frameColor || '#333', -0.35);
    parts.push(`<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${ix.toFixed(1)}" y2="${iy.toFixed(1)}" stroke="${mc}" stroke-width="0.75"/>`);
    parts.push(`<line x1="${(px+pw).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(ix+iw).toFixed(1)}" y2="${iy.toFixed(1)}" stroke="${mc}" stroke-width="0.75"/>`);
    parts.push(`<line x1="${px.toFixed(1)}" y1="${(py+ph).toFixed(1)}" x2="${ix.toFixed(1)}" y2="${(iy+ih).toFixed(1)}" stroke="${mc}" stroke-width="0.75"/>`);
    parts.push(`<line x1="${(px+pw).toFixed(1)}" y1="${(py+ph).toFixed(1)}" x2="${(ix+iw).toFixed(1)}" y2="${(iy+ih).toFixed(1)}" stroke="${mc}" stroke-width="0.75"/>`);
    // Rail inner edge outline
    parts.push(strokeRect(ix, iy, iw, ih, shade(frameColor||'#333', -0.2), 0.75));

    if (isC) {
        // Floater: dark shadow-gap ring between rail inner edge and the opening.
        parts.push(ringPath({x:ix,y:iy,w:iw,h:ih}, hole, shade(frameColor||'#333',-0.5)));
        parts.push(strokeRect(aX, aY, aW, aH, shade(frameColor||'#333',-0.2), 1));
        return parts;
    }

    if (useFM) {
        const backerColor = f.sbBackerColorHex || '#ffffff';
        const paperColor = f.sbPaperColorHex || '#ffffff';
        const marginPx = (parseFloat(f.sbPaperMargin)||0) * S;
        // Backer ring: frame interior minus opening
        parts.push(ringPath({x:ix,y:iy,w:iw,h:ih}, hole, backerColor));
        parts.push(strokeRect(ix, iy, iw, ih, '#cccccc', 0.75));
        // Paper ring: paper rect minus opening
        const ppx = ix+marginPx, ppy = iy+marginPx, ppw = iw-marginPx*2, pph = ih-marginPx*2;
        parts.push(ringPath({x:ppx,y:ppy,w:ppw,h:pph}, hole, paperColor));
        parts.push(strokeRect(ppx, ppy, ppw, pph, shade(paperColor,-0.15), 0.75));
        parts.push(strokeRect(aX, aY, aW, aH, '#999', 0.5));
        return parts;
    }

    // STANDARD MATS — each painted as a ring (its rect minus the art opening),
    // so no layer ever covers the opening.
    const m1On = (f.m1A !== false);
    const m2On = (m1On && f.m2A === true);
    const mat1Color = f.m1ColorHex || '#ffffff';
    const mat2Color = f.m2ColorHex || '#ffffff';

    if (m1On) {
        // Mat 1 fills the rail interior (minus opening)
        parts.push(ringPath({x:ix,y:iy,w:iw,h:ih}, hole, mat1Color));
        parts.push(strokeRect(ix, iy, iw, ih, '#cccccc', 0.75));
        const mT=(f.m1T||0)*S, mB=(f.m1B||0)*S, mL=(f.m1L||0)*S, mR=(f.m1R||0)*S;
        const m2rX = ix+mL, m2rY = iy+mT, m2rW = iw-mL-mR, m2rH = ih-mT-mB;
        if (m2On) {
            // Mat 2 ring: its rect minus opening, painted over mat1's inner area
            parts.push(ringPath({x:m2rX,y:m2rY,w:m2rW,h:m2rH}, hole, mat2Color));
            parts.push(strokeRect(m2rX, m2rY, m2rW, m2rH, '#cccccc', 0.75));
        }
    }

    if (f.useFauxMat === true) {
        // White paper ring sits just outside the art opening
        const fbPx = (parseFloat(f.sbPaperBorder)||0) * S;
        const fxr = { x: aX - fbPx, y: aY - fbPx, w: aW + fbPx*2, h: aH + fbPx*2 };
        parts.push(ringPath(fxr, hole, '#ffffff'));
        parts.push(strokeRect(fxr.x, fxr.y, fxr.w, fxr.h, '#cccccc', 0.75));
    }

    // Art-opening outline (the hole is already transparent through all rings)
    if (aW > 0 && aH > 0) {
        parts.push(strokeRect(aX, aY, aW, aH, '#999', 0.5));
    }

    return parts;
}

// Measure rendered text width (px) for snug SVG chip sizing.
let _svgMeasureCtx = null;
function _measureSvgText(text, fontSize, fontWeight, fontFamily) {
    if (!_svgMeasureCtx) {
        _svgMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    _svgMeasureCtx.font = `${fontWeight || 600} ${fontSize}px ${fontFamily || 'Arial, sans-serif'}`;
    return _svgMeasureCtx.measureText(text).width;
}

async function exportElevSVG(opts) {
    const wall = document.getElementById('wall');
    if (!wall) return;

    const oldZoom = elevZoomFactor;
    const wasDark = !document.body.classList.contains('light-theme');
    elevZoomFactor = 1;
    document.body.classList.add('light-theme');
    drawElevAll();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
        const wallW = parseFloat(document.getElementById('wallW').value) || 1;
        const wallH = parseFloat(document.getElementById('wallH').value) || 1;
        const wallWpx = wallW * elevScale;
        const wallHpx = wallH * elevScale;

        // Asymmetric padding (mirrors the PNG export rules):
        //  - BOTTOM + RIGHT: tight, so the elevation anchors to the bottom-right
        //    corner of the floor — easy to snap to a guide/corner in InDesign.
        //    Small TIGHT margin keeps outer dims from being clipped at the edge.
        //  - LEFT: extra room for the character if parked outside the wall, plus
        //    the wall-height dimension that sits outside the left edge.
        //  - TOP: normal room for the wall-width dimension above.
        // Measure the ACTUAL rendered content bounds (wall + frames + dims +
        // character + labels) so the artboard hugs the real content. We then
        // anchor flush to the right + bottom (tiny safety margin) for easy
        // corner-snapping in InDesign, and keep generous room on the left
        // (character) + top (wall-width dim).
        const wallRect0 = wall.getBoundingClientRect();
        let minL = wallRect0.left, minT = wallRect0.top;
        let maxR = wallRect0.right, maxB = wallRect0.bottom;
        // Walk every rendered element inside the elevation that contributes
        // visible content, expanding the bounds.
        const boundsEls = [];
        ['frame-layer','arch-dim-layer','dim-layer','floor-ceiling-layer',
         'frame-center-layer','guide-layer','label-layer','od-layer',
         'group-dim-layer'].forEach(id => {
            const lyr = document.getElementById(id);
            if (lyr && getComputedStyle(lyr).display !== 'none') boundsEls.push(lyr);
        });
        const personWrapB = document.getElementById('person-wrap');
        if (personWrapB && getComputedStyle(personWrapB).display !== 'none') {
            boundsEls.push(document.getElementById('person'));
        }
        boundsEls.forEach(container => {
            const kids = container.id ? container.querySelectorAll('*') : [container];
            const list = container.tagName === 'IMG' ? [container] : kids;
            list.forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return;
                if (r.left < minL) minL = r.left;
                if (r.top < minT) minT = r.top;
                if (r.right > maxR) maxR = r.right;
                if (r.bottom > maxB) maxB = r.bottom;
            });
        });

        const SAFE = 6;          // tiny margin so content isn't literally at the edge
        const LEFT_EXTRA = 40;   // a little extra breathing room on the left for the character
        const contentLeft = minL - LEFT_EXTRA;
        const contentTop = minT - SAFE;
        const contentRight = maxR + SAFE;
        const contentBottom = maxB + SAFE;

        const svgW = contentRight - contentLeft;
        const svgH = contentBottom - contentTop;

        // Map screen coords → SVG coords: content's top-left → (0,0).
        const ox = -contentLeft;
        const oy = -contentTop;

        const cssRoot = getComputedStyle(document.documentElement);
        const dimColor = (cssRoot.getPropertyValue('--dim-color') || '#e00000').trim();
        const dimFont = (cssRoot.getPropertyValue('--dim-font-family') || 'sans-serif').trim();
        const wallLine = (cssRoot.getPropertyValue('--wall-line') || '#333').trim();

        // Z-buckets — concatenated back→front at the end so numbers always win.
        const backLayer = [];   // frames + person (behind everything)
        const midLayer = [];    // lines, boxes, guides
        const frontLayer = [];  // ALL text / numbers / labels

        const rectToSvg = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + ox, y: r.top + oy, w: r.width, h: r.height };
        };

        // ── WALL outline: transparent fill, uniform thin stroke all around
        //    (the thick floor is gone). A baseboard line is drawn separately if
        //    the user set a baseboard height. ──
        {
            const wp = rectToSvg(wall);
            const wallCs = getComputedStyle(wall);
            const thinPx = Math.max(1, Math.round(parseFloat(wallCs.borderTopWidth) || 1));
            midLayer.push(`<rect x="${wp.x.toFixed(1)}" y="${wp.y.toFixed(1)}" width="${wp.w.toFixed(1)}" height="${wp.h.toFixed(1)}" fill="none" stroke="${wallLine}" stroke-width="${thinPx}"/>`);
            // Baseboard: horizontal line at the baseboard height (from the
            // floor), same lineweight as the wall. Uses the live rendered
            // element so it matches the screen exactly.
            const bbEl = wall.querySelector('#baseboard-line');
            if (bbEl) {
                const br = rectToSvg(bbEl);
                const by = br.y.toFixed(1);
                midLayer.push(`<line x1="${wp.x.toFixed(1)}" y1="${by}" x2="${(wp.x + wp.w).toFixed(1)}" y2="${by}" stroke="${wallLine}" stroke-width="${thinPx}"/>`);
            }
            // Unit legend ("ALL DIMENSIONS IN …") — emit as text so it appears
            // in the SVG like on screen.
            const legEl = wall.querySelector('#elev-unit-legend');
            if (legEl && legEl.textContent) {
                const lr = rectToSvg(legEl);
                const lcs = getComputedStyle(legEl);
                const lfs = parseFloat(lcs.fontSize) || 11;
                const lcolor = lcs.color || wallLine;
                const lfw = lcs.fontWeight || '600';
                // baseline ~ top + fontSize*0.8 (text sits near the top-left of its box)
                const lx = lr.x.toFixed(1);
                const ly = (lr.y + lfs * 0.85).toFixed(1);
                frontLayer.push(`<text x="${lx}" y="${ly}" font-family="Arial, Helvetica, sans-serif" font-size="${lfs.toFixed(1)}" font-weight="${lfw}" fill="${lcolor}">${legEl.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`);
            }
        }

        // ── FRAMES (back layer): embed as <image> ──
        for (const f of elevFrames) {
            if (!f.active) continue;
            const el = wall.querySelector(`.frame-vis[data-frame-letter="${f.letter}"]`);
            if (!el) continue;
            const pos = rectToSvg(el);
            try {
                const swatchImg = f.swatchDataUrl ? await _loadImg(f.swatchDataUrl) : null;

                if (svgFrameMode === 'autocolor') {
                    // Build the frame as a vector construction (rail + mats +
                    // reveal + paper + art opening) instead of a flat square.
                    // For image swatches, sample the average color for the rail.
                    let railColor = f.fColor || '#333333';
                    if (swatchImg) {
                        const avg = averageColorOfImage(swatchImg);
                        if (avg) railColor = avg;
                    }
                    const frameParts = buildFrameSVG(f, pos, elevUnit, railColor);
                    frameParts.forEach(s => backLayer.push(s));
                    continue;
                }

                // texture mode: embed the rendered frame raster
                const renderData = Object.assign({}, f, { extW: f.w, extH: f.h });
                const dInches = _frameDataInInches(renderData, elevUnit);
                const prevShadow = dashOuterShadowsOn;
                dashOuterShadowsOn = false;
                const { canvas } = renderFrameToCanvas(dInches, swatchImg, { dpi: 150, pad: 0 });
                dashOuterShadowsOn = prevShadow;
                if (!canvas.width || !canvas.height) throw new Error('zero-size canvas');
                const dataUrl = canvas.toDataURL('image/png');
                backLayer.push(`<image x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" xlink:href="${dataUrl}" preserveAspectRatio="none"/>`);
            } catch (err) {
                backLayer.push(`<rect x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" fill="${f.fColor || '#222'}"/>`);
            }
        }

        // ── PERSON (back layer): inline the character SVG as editable vector ──
        const personWrap = document.getElementById('person-wrap');
        const personImg = document.getElementById('person');
        if (personWrap && personImg && getComputedStyle(personWrap).display !== 'none') {
            try {
                const pos = rectToSvg(personImg);
                // Fetch the character SVG source so we can inline it (editable
                // vector). _personSvgDataUrl caches a data URL; decode it.
                let svgText = null;
                const dataUrl = await _getPersonSvgDataUrl();
                if (dataUrl && dataUrl.startsWith('data:image/svg')) {
                    const comma = dataUrl.indexOf(',');
                    const meta = dataUrl.substring(0, comma);
                    const payload = dataUrl.substring(comma + 1);
                    svgText = meta.includes('base64') ? atob(payload) : decodeURIComponent(payload);
                }
                if (svgText) {
                    // Extract the inner SVG content + its viewBox so we can scale
                    // it into the target box via a nested <svg>.
                    const vbMatch = svgText.match(/viewBox\s*=\s*"([^"]+)"/i);
                    const inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
                    const vb = vbMatch ? vbMatch[1] : `0 0 ${pos.w} ${pos.h}`;
                    backLayer.push(`<svg x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
                } else {
                    // Fallback: embed as <image> using the data URL
                    backLayer.push(`<image x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" xlink:href="${dataUrl}" preserveAspectRatio="xMidYMid meet"/>`);
                }
            } catch (err) { /* skip person on error */ }
        }

        // ── ANNOTATION ELEMENTS: walk layers, route text→front, lines→mid ──
        const annotationLayers = [
            'arch-dim-layer', 'dim-layer', 'floor-ceiling-layer',
            'frame-center-layer', 'guide-layer', 'label-layer',
            'od-layer', 'group-dim-layer', 'custom-lines-layer',
        ];

        const emitEl = (el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            if (el.getAttribute && el.getAttribute('data-export-skip')) return; // editor-only control

            // Text is the element's own direct text node(s), even if it also
            // contains export-skipped children (arrows, × button). Previously
            // this required exactly one child, so labels with arrow/X children
            // emitted no text → blank gaps in the SVG.
            let txt = '';
            let hasElementChild = false;
            for (const n of el.childNodes) {
                if (n.nodeType === 3) txt += n.textContent;
                else if (n.nodeType === 1) {
                    // Ignore export-skipped helper children when deciding if
                    // this is a "text element".
                    if (!(n.getAttribute && n.getAttribute('data-export-skip'))) hasElementChild = true;
                }
            }
            txt = hasElementChild ? '' : txt.trim();

            if (txt) {
                // TEXT → front layer (always on top of lines).
                const pos = rectToSvg(el);
                const fontSize = parseFloat(cs.fontSize) || 13;
                const color = cs.color || dimColor;
                const fw = cs.fontWeight || '600';
                const bg = cs.backgroundColor;
                const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
                const transform = cs.transform;
                let rotate = 0;
                if (transform && transform !== 'none' && transform.includes('matrix')) {
                    const m = transform.match(/matrix\(([^)]+)\)/);
                    if (m) {
                        const v = m[1].split(',').map(parseFloat);
                        rotate = Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI);
                    }
                }
                // Vertical writing-mode (e.g. the HANG HEIGHT label) isn't part
                // of the transform matrix. Map it to an explicit rotation so the
                // SVG text reads vertically too. vertical-rl + rotate(180deg)
                // → reads bottom-to-top → -90° of horizontal text.
                const wm = cs.writingMode || '';
                if (wm.indexOf('vertical') === 0) {
                    rotate = (Math.abs(rotate) >= 90) ? -90 : 90;
                }
                const cx = pos.x + pos.w / 2;
                const cy = pos.y + pos.h / 2;
                // Illustrator doesn't reliably honor dominant-baseline="central"
                // (it falls back to the alphabetic baseline, pushing text to the
                // top of the chip). Instead, place the baseline explicitly at the
                // chip center plus ~0.35em, which visually centers the text in
                // every renderer. We drop dominant-baseline entirely.
                const baselineY = cy + fontSize * 0.35;
                const g = rotate ? ` transform="rotate(${rotate} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : '';
                if (hasBg) {
                    // Snug chip sized to the MEASURED text, then pad slightly.
                    const tm = _measureSvgText(txt, fontSize, fw, dimFont);
                    const padX = 4, padY = 2;
                    const chipW = tm + padX * 2;
                    const chipH = fontSize + padY * 2;
                    frontLayer.push(`<g${g}>`);
                    frontLayer.push(`<rect x="${(cx - chipW/2).toFixed(1)}" y="${(cy - chipH/2).toFixed(1)}" width="${chipW.toFixed(1)}" height="${chipH.toFixed(1)}" fill="#ffffff" rx="2"/>`);
                    frontLayer.push(`<text x="${cx.toFixed(1)}" y="${baselineY.toFixed(1)}" font-family="${_svgEsc(dimFont)}" font-size="${fontSize}" font-weight="${fw}" fill="${color}" text-anchor="middle">${_svgEsc(txt)}</text>`);
                    frontLayer.push(`</g>`);
                } else {
                    frontLayer.push(`<text x="${cx.toFixed(1)}" y="${baselineY.toFixed(1)}"${g} font-family="${_svgEsc(dimFont)}" font-size="${fontSize}" font-weight="${fw}" fill="${color}" text-anchor="middle">${_svgEsc(txt)}</text>`);
                }
                return;
            }

            // LINES / BOXES → mid layer.
            const pos = rectToSvg(el);
            const bTop = _parseBorder(cs.borderTop);
            const bLeft = _parseBorder(cs.borderLeft);
            const bBottom = _parseBorder(cs.borderBottom);
            const bRight = _parseBorder(cs.borderRight);

            if (bTop && bLeft && bBottom && bRight && pos.w > 2 && pos.h > 2) {
                const dash = bTop.style === 'dashed' ? ` stroke-dasharray="${bTop.width*3},${bTop.width*2}"` : '';
                midLayer.push(`<rect x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" fill="none" stroke="${bTop.color}" stroke-width="${bTop.width}"${dash}/>`);
                return;
            }
            if (bTop && pos.h < 4 && pos.w >= 2) {
                const dash = bTop.style === 'dashed' ? ` stroke-dasharray="${bTop.width*3},${bTop.width*2}"` : '';
                const y = pos.y + bTop.width / 2;
                midLayer.push(`<line x1="${pos.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(pos.x+pos.w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${bTop.color}" stroke-width="${bTop.width}"${dash}/>`);
                return;
            }
            if (bLeft && pos.w < 4 && pos.h >= 2) {
                const dash = bLeft.style === 'dashed' ? ` stroke-dasharray="${bLeft.width*3},${bLeft.width*2}"` : '';
                const x = pos.x + bLeft.width / 2;
                midLayer.push(`<line x1="${x.toFixed(1)}" y1="${pos.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(pos.y+pos.h).toFixed(1)}" stroke="${bLeft.color}" stroke-width="${bLeft.width}"${dash}/>`);
                return;
            }
            const bg = cs.backgroundColor;
            const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
            if (hasBg && (pos.w < 4 || pos.h < 4) && (pos.w >= 2 || pos.h >= 2)) {
                if (pos.h <= pos.w) {
                    const y = pos.y + pos.h / 2;
                    midLayer.push(`<line x1="${pos.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(pos.x+pos.w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${bg}" stroke-width="${Math.max(1,pos.h).toFixed(1)}"/>`);
                } else {
                    const x = pos.x + pos.w / 2;
                    midLayer.push(`<line x1="${x.toFixed(1)}" y1="${pos.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(pos.y+pos.h).toFixed(1)}" stroke="${bg}" stroke-width="${Math.max(1,pos.w).toFixed(1)}"/>`);
                }
            }
        };

        const walk = (node) => {
            for (const child of node.children) {
                emitEl(child);
                if (child.children.length > 0) walk(child);
            }
        };

        annotationLayers.forEach(layerId => {
            const layer = document.getElementById(layerId);
            if (!layer) return;
            if (getComputedStyle(layer).display === 'none') return;
            walk(layer);
        });

        // Assemble: back (frames+person) → mid (lines/boxes) → front (text).
        const parts = [];
        parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgW.toFixed(1)}" height="${svgH.toFixed(1)}" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}">`);
        // NOTE: no background rect — keeps the SVG transparent so it composites
        // cleanly in InDesign. (The wall itself is transparent/stroke-only.)
        parts.push(`<g id="frames-and-character">`); parts.push(...backLayer); parts.push(`</g>`);
        parts.push(`<g id="lines-and-boxes">`); parts.push(...midLayer); parts.push(`</g>`);
        parts.push(`<g id="numbers-and-labels">`); parts.push(...frontLayer); parts.push(`</g>`);
        parts.push(`</svg>`);
        const svgStr = parts.join('\n');

        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const elevName = (elevations[currentElevIndex] && elevations[currentElevIndex].name) || `Elevation_${currentElevIndex + 1}`;
        const fname = elevName.replace(/[\\/:*?"<>|]/g, '_') + '.svg';
        // Bulk-export mode: hand the blob back to the caller (ZIP loop)
        // instead of downloading. The finally block still restores theme/zoom.
        if (opts && opts.returnBlob) return { blob: blob, filename: fname };
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = fname;
        a.href = url;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
        if (wasDark) document.body.classList.remove('light-theme');
        elevZoomFactor = oldZoom;
        drawElevAll();
    }
}

// BOOT UP THE ENGINE
initMasterApp();
