// =========================================================================
// GLOBAL APP STATE & ICONS
// =========================================================================
let currentView = 'dashboard';
let dashUnit = 'in';
const emptyImgUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let dashActiveImageObj = new Image(); 
dashActiveImageObj.src = emptyImgUrl;
let dashSelectedRowIndex = 0;
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

const dashDefaultData = { 
    id: "ART.001", imageCode: "TBD", level: "1", qty: 0, product: "Framed Art", location: "LOBBY", 
    // Phase A additions: artwork attribution + frame profile depth + paper type.
    // These are visible to the team in the dashboard form and the CSV. Several
    // are optional: empty values render as blank cells in CSV and are skipped
    // in InDesign spec blocks (no "TBD" placeholders).
    artist: "", artworkTitle: "", artType: "",
    fColorName: "Standard Black", fHeight: 0, rabbetDepth: 0,
    paperType: "Fine Art Paper",
    bleed: 0.25, canvasDepth: "", canvasWrap: "", floaterInset: 0.75,
    // Float Mount fields. useFloatMount controls whether the row uses Mat Controls
    // or Float Mount as its inner-area treatment. Defaults to false (mats).
    // The Shadow Box product auto-flips this to true on selection. The fields
    // themselves coexist with mat fields on every row — only one path renders at a time.
    useFloatMount: false,
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
let elevations = [{ name: "Elevation 1", frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }];
let currentElevIndex = 0;
let elevFrames = elevations[0].frames;
let elevPersonPos = elevations[0].personPos;
let elevScale = 1;
let elevZoomFactor = 1;

let pendingDuplicateIndex = null;

// =========================================================================
// INITIALIZATION & NAVIGATION
// =========================================================================
function initMasterApp() {
    document.getElementById('g_date').valueAsDate = new Date();
    renderNavTabs();
    selectDashRow(0); 
    populateDashPushSelector();
    updateDimFontSize();
    loadBundledLibrary(); // fetch library-manifest.json if present, populate dropdowns
    
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

function toggleTheme() { document.body.classList.toggle('light-theme'); }

function renderNavTabs() {
    const container = document.getElementById('nav-tabs-container');
    let html = `<div class="nav-tab ${currentView==='dashboard'?'active':''}" onclick="switchView('dashboard')">Frame Dashboard</div><div class="tab-divider"></div>`;
    
    elevations.forEach((elev, idx) => {
        let isActive = (currentView === 'elevation' && currentElevIndex === idx) ? 'active' : '';
        html += `<div class="nav-tab ${isActive}" onclick="switchView('elevation', ${idx})">
                    <span>${elev.name}</span>
                    <span class="tab-close" onclick="deleteElevation(${idx}, event)" title="Delete Wall">×</span>
                 </div>`;
    });
    container.innerHTML = html;
}

function updateElevationNameFromInput(newName) {
    if (newName.trim() !== "") { elevations[currentElevIndex].name = newName; renderNavTabs(); populateDashPushSelector(); }
}

function deleteElevation(idx, e) {
    e.stopPropagation();
    if(confirm("Delete this entire elevation wall? This cannot be undone.")) {
        elevations.splice(idx, 1);
        if (elevations.length === 0) {
            let w = elevUnit === 'cm' ? parseFloat((185 * 2.54).toFixed(2)) : 185;
            let h = elevUnit === 'cm' ? parseFloat((108 * 2.54).toFixed(2)) : 108;
            let px = elevUnit === 'cm' ? parseFloat((-60 * 2.54).toFixed(2)) : -60;
            elevations.push({ name: "Elevation 1", frames: [], wallW: w, wallH: h, personPos: {x: px} });
            currentElevIndex = 0;
        } else if (currentElevIndex > idx) { currentElevIndex--; }
        if (currentElevIndex === idx || elevations.length === 1) switchView('dashboard');
        
        renderNavTabs(); populateDashPushSelector(); recalculateDashboardQuantities();
    }
}

function addNewElevationTab() {
    let newIndex = elevations.length;
    let w = elevUnit === 'cm' ? parseFloat((185 * 2.54).toFixed(2)) : 185;
    let h = elevUnit === 'cm' ? parseFloat((108 * 2.54).toFixed(2)) : 108;
    let px = elevUnit === 'cm' ? parseFloat((-60 * 2.54).toFixed(2)) : -60;
    
    elevations.push({ name: "Elevation " + (newIndex + 1), frames: [], wallW: w, wallH: h, personPos: {x: px} });
    renderNavTabs(); populateDashPushSelector(); switchView('elevation', newIndex);
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

function saveMasterProject() {
    if(currentView === 'elevation' && elevations[currentElevIndex]) {
        elevations[currentElevIndex].wallW = parseFloat(document.getElementById('wallW').value) || 185;
        elevations[currentElevIndex].wallH = parseFloat(document.getElementById('wallH').value) || 108;
    }
    const getStr = (id) => document.getElementById(id).value;
    const globalMeta = { projName: getStr('g_projName'), desc: getStr('g_desc'), date: getStr('g_date'), issued: getStr('g_issued'), client: getStr('g_client'), attn: getStr('g_attn'), delivery: getStr('g_delivery') };
    const masterData = { type: 'master-studio-v6', dashUnit: dashUnit, elevUnit: elevUnit, globalMeta: globalMeta, dashProjectData: dashProjectData, elevations: elevations };
    const blob = new Blob([JSON.stringify(masterData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Master_Studio_Project.json`; link.click();
}

function loadMasterProject(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.type && data.type.startsWith('master-studio')) {
                dashUnit = data.dashUnit || 'in'; elevUnit = data.elevUnit || 'in';
                if (data.globalMeta) {
                    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
                    setVal('g_projName', data.globalMeta.projName); setVal('g_desc', data.globalMeta.desc); setVal('g_date', data.globalMeta.date);
                    setVal('g_issued', data.globalMeta.issued); setVal('g_client', data.globalMeta.client); setVal('g_attn', data.globalMeta.attn); setVal('g_delivery', data.globalMeta.delivery);
                }
                if (data.dashProjectData) dashProjectData = data.dashProjectData;
                if (data.elevations) elevations = data.elevations;
            } else { return alert("Invalid format. Please build a new project in Master Studio."); }

            document.getElementById('dashBtnInch').classList.toggle('active', dashUnit === 'in'); document.getElementById('dashBtnCm').classList.toggle('active', dashUnit === 'cm');
            document.getElementById('elevBtnInch').classList.toggle('active', elevUnit === 'in'); document.getElementById('elevBtnCm').classList.toggle('active', elevUnit === 'cm');
            
            recalculateDashboardQuantities(); selectDashRow(0); renderNavTabs(); switchView('dashboard'); 
        } catch (err) { alert("Invalid project file."); }
    };
    reader.readAsText(file); event.target.value = '';
}

// =========================================================================
// THE BRIDGE: DROPDOWN BULK CHECKBOXES & DASHBOARD PUSH
// =========================================================================
function recalculateDashboardQuantities() {
    let counts = {};
    elevations.forEach(elev => { elev.frames.forEach(f => { if (f.active && f.id) counts[f.id] = (counts[f.id] || 0) + 1; }); });
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
    
    let factor = (dashUnit === 'cm' && elevUnit === 'in') ? (1/2.54) : (dashUnit === 'in' && elevUnit === 'cm') ? 2.54 : 1;
    let startX = 10;
    if (elevFrames.length > 0) {
        let maxRight = 0;
        elevFrames.forEach(fr => { if (fr.x + fr.w > maxRight) maxRight = fr.x + fr.w; });
        startX = maxRight + 10;
    }

    cbs.forEach(cb => {
        const f = dashProjectData[parseInt(cb.value)];
        const newFrame = {
            id: f.id, letter: getElevLetter(elevFrames.length),
            w: (parseFloat(f.extW) || 24) * factor, h: (parseFloat(f.extH) || 30) * factor,
            fW: (parseFloat(f.fW) || 1.25) * factor, fType: f.fType || 'color', fColor: f.fColor || '#1a1a1a', fCode: f.fCode || '', swatchDataUrl: f.swatchDataUrl || '',
            product: f.product || '', floaterInset: (parseFloat(f.floaterInset) || 0.75) * factor,
            // Phase A fields carried through. Dimensional ones get factor-converted; text fields pass through.
            artist: f.artist || '', artworkTitle: f.artworkTitle || '', artType: f.artType || '',
            fColorName: f.fColorName || '', paperType: f.paperType || '',
            fHeight: (parseFloat(f.fHeight) || 0) * factor,
            rabbetDepth: (parseFloat(f.rabbetDepth) || 0) * factor,
            // Float mount fields propagated to the elevation copy.
            // useFloatMount carries the per-row toggle state so elevation rendering matches dashboard.
            useFloatMount: f.useFloatMount === true,
            sbBackerColorHex: f.sbBackerColorHex || '#ffffff', sbBackerColorName: f.sbBackerColorName || 'B 97 White',
            sbPaperColorHex: f.sbPaperColorHex || '#ffffff', sbPaperColorName: f.sbPaperColorName || 'White',
            sbPaperMargin: (parseFloat(f.sbPaperMargin) || 1.5) * factor,
            sbPaperBorder: (parseFloat(f.sbPaperBorder) || 0.5) * factor,
            sbPaperEdge: f.sbPaperEdge || 'clean',
            sbPaperEdgeSeed: f.sbPaperEdgeSeed || 0,
            m1T: (parseFloat(f.m1T) || 0) * factor, m1B: (parseFloat(f.m1B) || 0) * factor, m1L: (parseFloat(f.m1L) || 0) * factor, m1R: (parseFloat(f.m1R) || 0) * factor,
            m1A: f.m1A !== false, m1Locked: f.m1Locked || false, m1ColorHex: f.m1ColorHex || '#ffffff',
            m2: (parseFloat(f.m2) || 0) * factor, m2A: f.m2A || false, m2ColorHex: f.m2ColorHex || '#ffffff',
            x: startX, y: 10, isOpen: false, isGrouped: false, dimTo: [], active: true
        };
        elevFrames.push(newFrame); startX += (newFrame.w + 5); cb.checked = false; 
    });
    
    document.getElementById('bulkDropdownList').style.display = 'none';
    initElevControls(); drawElevAll(); recalculateDashboardQuantities();
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
    
    let factor = (dashUnit === 'cm' && elevUnit === 'in') ? (1/2.54) : (dashUnit === 'in' && elevUnit === 'cm') ? 2.54 : 1;
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
        artist: f.artist || '', artworkTitle: f.artworkTitle || '', artType: f.artType || '',
        fColorName: f.fColorName || '', paperType: f.paperType || '',
        fHeight: (parseFloat(f.fHeight) || 0) * factor,
        rabbetDepth: (parseFloat(f.rabbetDepth) || 0) * factor,
        useFloatMount: f.useFloatMount === true,
        sbBackerColorHex: f.sbBackerColorHex || '#ffffff', sbBackerColorName: f.sbBackerColorName || 'B 97 White',
        sbPaperColorHex: f.sbPaperColorHex || '#ffffff', sbPaperColorName: f.sbPaperColorName || 'White',
        sbPaperMargin: (parseFloat(f.sbPaperMargin) || 1.5) * factor,
        sbPaperBorder: (parseFloat(f.sbPaperBorder) || 0.5) * factor,
        sbPaperEdge: f.sbPaperEdge || 'clean',
        sbPaperEdgeSeed: f.sbPaperEdgeSeed || 0,
        m1T: (parseFloat(f.m1T) || 0) * factor, m1B: (parseFloat(f.m1B) || 0) * factor, m1L: (parseFloat(f.m1L) || 0) * factor, m1R: (parseFloat(f.m1R) || 0) * factor,
        m1A: f.m1A !== false, m1Locked: f.m1Locked || false, m1ColorHex: f.m1ColorHex || '#ffffff',
        m2: (parseFloat(f.m2) || 0) * factor, m2A: f.m2A || false, m2ColorHex: f.m2ColorHex || '#ffffff',
        x: startX, y: 10, isOpen: false, isGrouped: false, dimTo: [], active: true
    });
    
    recalculateDashboardQuantities(); alert(`Pushed ${f.id} to ${targetElev.name}!`);
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
    let factor = (dashUnit === 'cm' && elevUnit === 'in') ? (1/2.54) : (dashUnit === 'in' && elevUnit === 'cm') ? 2.54 : 1;

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
                f.sbPaperMargin = (parseFloat(d.sbPaperMargin) || 1.5) * factor;
                f.sbPaperBorder = (parseFloat(d.sbPaperBorder) || 0.5) * factor;
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
    if(dashUnit === newUnit) return;
    const factor = newUnit === 'cm' ? 2.54 : (1/2.54);
    dashProjectData.forEach(row => {
        ['extW', 'extH', 'fW', 'fHeight', 'rabbetDepth', 'bleed', 'canvasDepth', 'canvasWrap', 'floaterInset', 'sbPaperMargin', 'sbPaperBorder', 'm1T', 'm1B', 'm1L', 'm1R', 'm2'].forEach(prop => {
            if (row[prop] !== "" && row[prop] !== undefined && !isNaN(row[prop])) row[prop] = dashFmt(row[prop] * factor);
        });
    });
    dashUnit = newUnit;
    document.getElementById('dashBtnInch').classList.toggle('active', dashUnit === 'in');
    document.getElementById('dashBtnCm').classList.toggle('active', dashUnit === 'cm');
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]); 
}

function selectDashRow(index) {
    if (index >= dashProjectData.length) return; 
    dashSelectedRowIndex = index;
    loadDashDataIntoControls(dashProjectData[index]);
    document.querySelectorAll('#rfiBody tr').forEach((tr, i) => { tr.classList.toggle('selected', i === index); });
    checkGlobalEditingWarning(dashProjectData[index].id);
}

function addDashRow() {
    const newRow = JSON.parse(JSON.stringify(dashDefaultData)); 
    newRow.id = generateNextItemCode();
    newRow.extW = dashUnit === 'cm' ? dashFmt(24*2.54) : 24; 
    newRow.extH = dashUnit === 'cm' ? dashFmt(24*2.54) : 24; 
    newRow.fW = dashUnit === 'cm' ? dashFmt(0.75*2.54) : 0.75;
    newRow.fType = "color"; newRow.fColor = "#000000"; newRow.fCode = "Standard Black";
    
    dashProjectData.push(newRow);
    dashSelectedRowIndex = dashProjectData.length - 1;
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    renderDashTable(); checkGlobalEditingWarning(newRow.id);
}

function duplicateDashRow() {
    const newRow = JSON.parse(JSON.stringify(dashProjectData[dashSelectedRowIndex])); 
    newRow.id = generateNextItemCode(); 
    newRow.qty = 0; 
    dashProjectData.push(newRow);
    dashSelectedRowIndex = dashProjectData.length - 1;
    loadDashDataIntoControls(dashProjectData[dashSelectedRowIndex]);
    renderDashTable(); checkGlobalEditingWarning(newRow.id);
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
    if (field === 'id') recalculateDashboardQuantities();
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
    const row = dashProjectData[dashSelectedRowIndex];
    
    const oldId = row.id; const newId = getStr('m_itemCode');
    if (oldId !== newId) { elevations.forEach(elev => { elev.frames.forEach(f => { if (f.id === oldId) f.id = newId; }); }); }

    const isColor = getStr('fType') === 'color';
    const isLinked = document.getElementById('matLinkBtn').classList.contains('active');
    
    let m1Name = getStr('m1_color'); let m1Hex = getStr('m1_colorHex');
    let m2Name = isLinked ? m1Name : getStr('m2_color'); let m2Hex = isLinked ? m1Hex : getStr('m2_colorHex');
    
    if (isLinked) { document.getElementById('m2_color').value = m2Name; document.getElementById('m2_colorHex').value = m2Hex; }

    const m1Active = document.getElementById('m1Toggle').classList.contains('active');
    // M2 can never be active if M1 is off (M2 sits inside M1).
    const m2Active = m1Active && document.getElementById('m2Toggle').classList.contains('active');

    dashProjectData[dashSelectedRowIndex] = {
        id: newId, imageCode: getStr('m_imageCode'), level: getStr('m_level'), qty: getVal('m_qty'), product: getStr('m_product'), location: getStr('m_location'),
        // Phase A artwork attribution fields. Empty values are preserved as-is — they
        // render as blank cells in CSV and skipped lines in the InDesign spec block.
        artist: getStr('m_artist'), artworkTitle: getStr('m_artworkTitle'), artType: getStr('m_artType'),
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
        sbBackerColorName: getStr('sbBackerColorName') || 'B 97 White',
        sbBackerColorHex: getStr('sbBackerColorHex') || '#ffffff',
        sbPaperColorName: getStr('sbPaperColorName') || 'White',
        sbPaperColorHex: getStr('sbPaperColorHex') || '#ffffff',
        sbPaperMargin: getVal('sbPaperMargin') || 0,
        sbPaperBorder: getVal('sbPaperBorder') || 0,
        sbPaperEdge: getStr('sbPaperEdge') || 'clean',
        sbPaperEdgeSeed: row.sbPaperEdgeSeed || 0,
        glass: getStr('m_glass'), hardware: getStr('m_hardware'), mount: getStr('m_mount'), backing: getStr('m_backing'), notes: getStr('m_notes'), prodNotes: getStr('m_prodNotes')
    };
    
    updateDashVisualsFromDOM(); renderDashTable(); pushUpdatesToElevations(dashSelectedRowIndex);
    // Validate the just-saved row and update warning indicators on the dashboard form.
    // The project table renders its own warnings via renderDashTable() above.
    updateDashboardWarnings();
    if (oldId !== newId) recalculateDashboardQuantities();
}

function updateDashVisualsFromDOM() {
    const data = dashProjectData[dashSelectedRowIndex];
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

    const ratio = 300 / Math.max(data.extW, data.extH); 
    
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
        fVis.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)';
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
        paperVis.style.cssText = `position:absolute; top:${paperY}px; left:${paperX}px; width:${paperW}px; height:${paperH}px; background:${paperColor}; box-shadow: 2px 4px 12px rgba(0,0,0,0.45); ${isTorn ? 'border:1px dashed rgba(0,0,0,0.4); border-radius:2px;' : ''} pointer-events:none;`;
        fVis.appendChild(paperVis);
    }
    
    const artVis = document.createElement('div'); artVis.className = 'art-visual'; artVis.id = 'dash-art-visual';
    // For floater, frameless, & float mount: subtle dashed border (suggests transparent opening) instead of a heavy 4px black stroke.
    artVis.style.border = (isCanvas || isFrameless || useFM) ? "1px dashed rgba(0,0,0,0.25)" : "1px solid #aaa";
    
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
    artVis.innerText = `${dashFmt(Math.max(0, finalW))}${dashUnit === 'in' ? '"' : ' cm'} × ${dashFmt(Math.max(0, finalH))}${dashUnit === 'in' ? '"' : ' cm'}`;
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
            }

            // Hidden columns — Artist/Title/Art Type for caption use
            d.artist = cellOr(cols, 'Artist', '');
            d.artworkTitle = cellOr(cols, 'Artwork Title', '');
            d.artType = cellOr(cols, 'Art Type', '');

            // Production fields
            d.hardware = cellOr(cols, 'Security Hardware', '');
            d.backing = cellOr(cols, 'Substrate', '');
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

    // FLOATER & FRAMELESS CANVAS: both hide the mat/float wrapper since neither
    // uses traditional mats or float-mounted paper. Both show canvas settings
    // (depth, wrap, optional inset). Both hide bleed since canvas is wrapped,
    // not printed-with-bleed-margin. The Inset field is only meaningful for
    // Floater (canvas face + shadow gap); Frameless ignores it (no frame to inset from).
    if (isFloater || isFrameless) {
        matWrapper.style.display = 'none';
        canvasSettings.style.display = 'grid';
        bleedSettings.style.display = 'none';
        // For frameless canvas, dim out the Inset field (it's irrelevant — there's no frame).
        const insetCell = document.getElementById('floaterInset');
        if (insetCell && insetCell.parentElement) {
            insetCell.parentElement.style.opacity = isFrameless ? '0.4' : '1';
            insetCell.disabled = isFrameless;
        }
        // Default Frameless Canvas to a 2"D stretcher bar when the field is empty.
        // Studio standard for wrapped canvas. Also auto-fills wrap = depth (no
        // safety margin per studio convention). User can override after.
        // Doesn't trigger when switching to Floater since that has its own
        // rabbet→stretcher relationship.
        if (isFrameless) {
            const depthEl = document.getElementById('canvasDepth');
            const wrapEl = document.getElementById('canvasWrap');
            const currentDepth = parseFloat(depthEl ? depthEl.value : '') || 0;
            if (depthEl && currentDepth === 0) {
                depthEl.value = '2';
                if (wrapEl && (parseFloat(wrapEl.value) || 0) === 0) {
                    wrapEl.value = '2';
                }
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
    const row = dashProjectData[dashSelectedRowIndex];
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
    let c = 0;
    
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
        // Avoid pushing a duplicate of an existing bundled entry with the same code
        const existing = dashLocalLibrary[vendor][collection].find(x => x.code === code);
        const entry = { code, width: w, file };
        if (parsed.faceWidth !== undefined) entry.faceWidth = parsed.faceWidth;
        if (parsed.depth !== undefined) entry.depth = parsed.depth;
        if (parsed.rabbet !== undefined) entry.rabbet = parsed.rabbet;
        if (existing) {
            // user's manual sync overrides bundled entry
            existing.file = file; existing.width = w;
            if (parsed.faceWidth !== undefined) existing.faceWidth = parsed.faceWidth;
            if (parsed.depth !== undefined) existing.depth = parsed.depth;
            if (parsed.rabbet !== undefined) existing.rabbet = parsed.rabbet;
        } else {
            dashLocalLibrary[vendor][collection].push(entry);
        }
        c++;
    }
    populateDashVendorDropdown();
    closeLibrarySyncModal();
    showInfoModal('Library Synced', `Synced ${c} swatches from your local folder.`);
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

function loadDashFromCustomLibrary(idx) {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection').value;
    if(!v || !c || idx === undefined) return;
    const item = dashLocalLibrary[v][c][idx];
    _libEntryToDataUrl(item.file).then(u => {
        const w = dashUnit === 'cm' ? dashFmt(item.width*2.54) : item.width;
        document.getElementById('fW').value = w; document.getElementById('m_fCode').value = item.code;
        dashProjectData[dashSelectedRowIndex].fType = 'image'; dashProjectData[dashSelectedRowIndex].fW = w; dashProjectData[dashSelectedRowIndex].fCode = item.code;
        dashProjectData[dashSelectedRowIndex].swatchDataUrl = u; dashProjectData[dashSelectedRowIndex].swatchName = item.code;
        document.getElementById('view-dashboard').style.setProperty('--frame-bg', `url(${u})`);
        // Sync the Library/Solid toggle and trigger the redraw via syncDashAndCalculate
        document.getElementById('fType').value = 'image';
        document.getElementById('fTypeBtnLibrary').classList.add('active');
        document.getElementById('fTypeBtnSolid').classList.remove('active');

        // Auto-detect floater profiles: if the collection name contains "Floater" (case-insensitive),
        // switch the product to "Framed Canvas (Floater)" so mats get disabled and the floater inset
        // takes effect. The user can override the product manually after if it's a misclassification.
        const isFloaterCollection = /floater/i.test(c);
        const productSelect = document.getElementById('m_product');
        if (isFloaterCollection && productSelect && productSelect.value !== "Framed Canvas (Floater)") {
            productSelect.value = "Framed Canvas (Floater)";
            // handleDashProductChange toggles the canvasSettings panel; pass shouldSync=false because
            // we're about to sync below via dashActiveImageObj.onload.
            handleDashProductChange(false);
        }

        // Auto-derive the floater inset from the swatch's encoded face width:
        //   inset = faceWidth + FLOATER_SHADOW_REVEAL (studio standard 0.25")
        // This means a swatch named MICH-306-30_1.75_0.625 gets inset 0.875" automatically.
        // Only applies to floaters; the input remains user-editable for tweaks.
        if (isFloaterCollection && item.faceWidth !== undefined) {
            const computedInset = parseFloat(item.faceWidth) + FLOATER_SHADOW_REVEAL;
            const insetInUnits = dashUnit === 'cm' ? dashFmt(computedInset * 2.54) : computedInset;
            const insetInput = document.getElementById('floaterInset');
            if (insetInput) insetInput.value = insetInUnits;
            dashProjectData[dashSelectedRowIndex].floaterInset = insetInUnits;
            // Persist the swatch's faceWidth on the row too (in display units) so
            // buildSpecStrings can compute Float Reveal = floaterInset - faceWidth.
            // Without this we'd have to assume the studio-default 0.25" reveal.
            const faceInUnits = dashUnit === 'cm'
                ? dashFmt(parseFloat(item.faceWidth) * 2.54)
                : parseFloat(item.faceWidth);
            dashProjectData[dashSelectedRowIndex]._faceWidth = faceInUnits;
        }

        // Auto-fill Frame Height (profile depth) and Rabbet Depth from the swatch's
        // metadata if encoded in the filename (_d<depth> and _r<rabbet> tags).
        // Both are starting values — the user can edit them after for vendor-specific
        // adjustments. Convert to current display units (cm vs in) before writing.
        if (item.depth !== undefined) {
            const depthInUnits = dashUnit === 'cm' ? dashFmt(parseFloat(item.depth) * 2.54) : parseFloat(item.depth);
            const fHeightInput = document.getElementById('fHeight');
            if (fHeightInput) fHeightInput.value = depthInUnits;
        }
        if (item.rabbet !== undefined) {
            const rabbetInUnits = dashUnit === 'cm' ? dashFmt(parseFloat(item.rabbet) * 2.54) : parseFloat(item.rabbet);
            const rabbetInput = document.getElementById('rabbetDepth');
            if (rabbetInput) rabbetInput.value = rabbetInUnits;
        }

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
                    const factor = (dashUnit === 'in') ? (1/2.54) : 2.54;
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
    const factor = 1 / 2.54;             // cm → in
    // Only scale the dimensional fields the renderer reads
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
        // Outer drop shadow (matches the floater's ambient shadow strength)
        x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
        x.shadowColor = 'transparent';
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
    // exports where the frame sits on a wall background.
    x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.shadowColor = 'transparent';

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
    function dIS(bx, by, bw, bh, bl, os, op) {
        x.save(); x.beginPath(); x.rect(bx,by,bw,bh); x.clip();
        x.shadowColor = `rgba(0,0,0,${op})`; x.shadowBlur = bl; x.shadowOffsetY = os;
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
        // Use a separate save/restore so the shadow doesn't bleed onto subsequent draws.
        x.save();
        x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 18; x.shadowOffsetX = 2; x.shadowOffsetY = 4;
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
    } else if (useFM) {
        // FLOAT MOUNT: per user spec — image opening must NOT cast a shadow onto the
        // paper layer. The opening is clean transparent. The only shadow on the paper
        // is the drop shadow under the paper's outer edge falling onto the backer,
        // which is handled by the paper-fill block above.
        // (Intentionally no shadow drawn here.)
    } else {
        dIS(aX, aY, aW, aH, 8, 3, 0.25);
        x.strokeStyle = "#aaaaaa"; x.lineWidth = 1; x.strokeRect(aX, aY, aW, aH);
    }

    // Optional art-opening size label (for elevation export — dashboard already shows this elsewhere)
    if (opts.showArtLabel && aW > 0 && aH > 0) {
        const unitSuffix = (opts.unit || 'in') === 'in' ? '"' : ' cm';
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

function exportDashNativePNG() {
    const d = dashProjectData[dashSelectedRowIndex];
    // Always render in inches so cm-mode and in-mode exports look identical.
    const dInches = _frameDataInInches(d, dashUnit);
    const { canvas } = renderFrameToCanvas(dInches, dashActiveImageObj, { dpi: 72, pad: 40 });
    const a = document.createElement('a');
    a.download = `${d.id || 'Frame'}.png`;
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
//       { label: "Frame Size",   value: "1.25\"W × 1.625\"D, Rabbet 0.625\"D" },
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
    const fmt = (v) => {
        const n = parseFloat(v);
        if (isNaN(n) || n === 0) return null;  // zero/empty is "not set"
        return (n % 1 === 0) ? n.toFixed(0) : n.toString();
    };

    // ── Application ────────────────────────────────────────────────────────
    let application;
    if (isC)        application = "Framed Canvas (Floater)";
    else if (isFL)  application = "Wrapped Canvas";
    else if (isFM)  application = (r.product === "Framed Art (Shadow Box)") ? "Framed Art (Shadow Box)" : "Framed Art";
    else            application = "Framed Art";

    // ── Frame Size: "<W>\"W × <D>\"D, Rabbet <R>\"D" ───────────────────────
    // Skipped entirely for Wrapped Canvas (no frame at all).
    let frameSize = '';
    if (!isFL) {
        const fwStr = fmt(r.fW);
        const fhStr = fmt(r.fHeight);
        const rabStr = fmt(r.rabbetDepth);
        const parts = [];
        if (fwStr) parts.push(`${fwStr}"W`);
        if (fhStr) parts.push(`${fhStr}"D`);
        let primary = parts.join(' × ');
        if (rabStr) primary = primary ? `${primary}, Rabbet ${rabStr}"D` : `Rabbet ${rabStr}"D`;
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
    // Mat 1 dimensions: "3" AA" if all sides equal, else "3"T × 3"B × 3"L × 3"R".
    // Combined with color: "3" AA, B 97 White".
    let mat1Line = '';
    let mat2Line = '';
    if (m1On) {
        const T = parseFloat(r.m1T) || 0;
        const B = parseFloat(r.m1B) || 0;
        const L = parseFloat(r.m1L) || 0;
        const R = parseFloat(r.m1R) || 0;
        let dims;
        if (T === B && T === L && T === R && T > 0) {
            dims = `${fmt(T)}" AA`;
        } else if (T + B + L + R > 0) {
            dims = `${fmt(T) || 0}"T × ${fmt(B) || 0}"B × ${fmt(L) || 0}"L × ${fmt(R) || 0}"R`;
        } else {
            dims = '';
        }
        const matName = (r.m1ColorName || '').trim();
        if (dims && matName) mat1Line = `${dims}, ${matName}`;
        else if (dims) mat1Line = dims;
        else if (matName) mat1Line = matName;
    }
    if (m2On) {
        const m2v = parseFloat(r.m2) || 0;
        const m2Name = (r.m2ColorName || '').trim();
        const m2Str = fmt(m2v);
        if (m2Str && m2Name) mat2Line = `${m2Str}" Reveal, ${m2Name}`;
        else if (m2Str) mat2Line = `${m2Str}" Reveal`;
        else if (m2Name) mat2Line = m2Name;
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
            const wStr = (paperW % 1 === 0) ? paperW.toFixed(0) : paperW.toString();
            const hStr = (paperH % 1 === 0) ? paperH.toFixed(0) : paperH.toString();
            paperSizeLine = `${wStr}"W × ${hStr}"H`;
        }

        // White Border: only when border value is greater than 0. Full-bleed
        // (0 border) doesn't get a line since there's nothing to show.
        if (sbPB > 0) {
            whiteBorderLine = `${fmt(sbPB)}" AA`;
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
            floatRevealLine = `${fmt(reveal) || 0}" AA`;
        } else {
            floatRevealLine = '0.25" AA';
        }
    }

    // ── Canvas Stretcher Depth (canvas products only) ──────────────────────
    let stretcherLine = '';
    if (isC || isFL) {
        const cd = parseFloat(r.canvasDepth) || 0;
        if (cd > 0) stretcherLine = `${fmt(cd)}"`;
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
        // Standard framed art: Mat 1, optional Mat 2
        if (mat1Line) lines.push({ label: 'Mat 1', value: mat1Line });
        if (mat2Line) lines.push({ label: 'Mat 2', value: mat2Line });
    }

    // Production attributes
    if (mountLine) lines.push({ label: 'Mount', value: mountLine });
    if ((r.hardware || '').trim()) lines.push({ label: 'Hardware', value: r.hardware.trim() });
    // Glass is not meaningful for canvas products
    if (!isC && !isFL && (r.glass || '').trim()) {
        lines.push({ label: 'Glass', value: r.glass.trim() });
    }

    // Physical: substrate label varies by product context.
    //   - Canvas products (Wrapped + Floater): "Backing Board" — rigid panel
    //     behind the canvas to prevent sagging. Materials like Hardback, Foamcore.
    //   - Framed art (Standard + Float Mount): "Substrate" — the mounting layer
    //     the print sits on. Materials like Foamcore, Dibond.
    // Same underlying data field; different terminology matches how framers
    // talk about each role in production.
    if (substrateLine) {
        const substrateLabel = (isC || isFL) ? 'Backing Board' : 'Substrate';
        lines.push({ label: substrateLabel, value: substrateLine });
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

function exportDashCSV() {
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
    const buildPaperTypeCell = (r, iFM) => {
        if (!iFM) return '';
        const base = (r.paperType || 'Fine Art Paper').trim();
        const edge = r.sbPaperEdge === 'torn' ? 'Deckled Edge' : 'Straight Cut';
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
        `Security Hardware,Substrate,Mount,Notes,Production Notes,` +
        // — End visible columns. Below this point: InDesign helpers + backend data. —
        `Artist,Artwork Title,Art Type,Rabbet Depth${u},` +
        `Application,Matboard Description,Spec Lines,` +
        `FM Backer Name,FM Backer Hex,FM Paper Name,FM Paper Hex,FM Paper Edge,FM Paper Margin${u},Frame Code,Frame Color Name,Frame Color Hex,` +
        `Image_Filename\n`;

    dashProjectData.forEach(r => {
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

        // Paper Size (only meaningful for float mount). Per the studio's spec PDF:
        //   paperSize = imageSize + (whiteBorder × 2)
        // where imageSize is the visible artwork (artW, artH) and whiteBorder is the
        // white margin around the image inside the paper. When border = 0 (full bleed),
        // paperSize = artW = imgW (since the image fills the paper edge-to-edge).
        const whiteBorder = iFM ? sbPB : 0;
        const paperSizeW = iFM ? (artW + whiteBorder * 2) : 0;
        const paperSizeH = iFM ? (artH + whiteBorder * 2) : 0;

        // Composite cells
        const matCell = buildMatCell(r, matsHidden);
        const frameCell = buildFrameCell(r);
        const paperTypeCell = buildPaperTypeCell(r, iFM);

        // Pre-formatted spec strings for InDesign auto-spec script consumption
        const specs = buildSpecStrings(r);

        const d = [
            // Visible columns —
            r.qty, r.id, r.product, r.location, r.imageCode,
            dashFmt(r.extW), dashFmt(r.extH),
            dashFmt(Math.max(0, artW)), dashFmt(Math.max(0, artH)),
            dashFmt(Math.max(0, imgW)), dashFmt(Math.max(0, imgH)),
            r.canvasDepth ? dashFmt(r.canvasDepth) : '',
            r.canvasWrap ? dashFmt(r.canvasWrap) : '',
            matCell,
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1T) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1R) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1B) : '',
            (r.m1A !== false && !matsHidden) ? dashFmt(r.m1L) : '',
            r.glass || '',
            paperTypeCell,
            iFM ? dashFmt(Math.max(0, paperSizeW)) : '',
            iFM ? dashFmt(Math.max(0, paperSizeH)) : '',
            iFM ? dashFmt(whiteBorder) : '',
            frameCell,
            numOrBlank(r.fW),
            numOrBlank(r.fHeight),
            r.hardware || '',
            r.backing || '',
            r.mount || '',
            r.notes || '',
            r.prodNotes || '',
            // — Hidden / backend columns —
            r.artist || '',
            r.artworkTitle || '',
            r.artType || '',
            numOrBlank(r.rabbetDepth),
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
            `${r.id}.png`
        ];
        csv += d.map(s => `"${String(s).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `RFI_Project_Tracker.csv`; a.click();
}

function renderDashTable() {
    const tbody = document.getElementById('rfiBody'); tbody.innerHTML = '';
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
        tr.addEventListener('click', () => { if (dashSelectedRowIndex !== index) selectDashRow(index); });
        
        tr.innerHTML = `
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
    const size = document.getElementById('elevDimFontSize').value || 12;
    document.documentElement.style.setProperty('--dim-font-size', size + 'px');
}

function autoElevRelabel() {
    let sortedFrames = [...elevFrames].sort((a, b) => a.x - b.x);
    let letterMap = {};
    sortedFrames.forEach((f, i) => { letterMap[f.letter] = getElevLetter(i); f.letter = getElevLetter(i); });
    sortedFrames.forEach(f => { if (f.dimTo && f.dimTo.length > 0) f.dimTo = f.dimTo.map(t => letterMap[t] || t); });
    elevFrames = sortedFrames; initElevControls(); drawElevAll();
}

function initElevControls() {
    const container = document.getElementById('frame-controls');
    let html = ``;
    elevFrames.forEach((f, idx) => {
        const activeNeighbors = elevFrames.filter(n => n.letter !== f.letter && n.active);
        const targetButtons = activeNeighbors.map(n => `<button class="toggle-status ${f.dimTo.includes(n.letter)?'active':''}" style="padding:1px 3px; font-size:8px; border-radius:2px;" onclick="toggleElevDimTarget(${idx}, '${n.letter}', event)">${n.letter}</button>`).join('');

        html += `
            <div class="compact-frame-item">
                <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
                    <span style="font-weight:bold; font-size:0.75rem; color:var(--text-strong);">${f.letter} <span style="font-weight:normal; font-size:0.65rem; color:var(--text-muted);">(${f.id})</span></span>
                    <div style="display:flex; gap:2px; margin-top:2px; flex-wrap:wrap;">${targetButtons}</div>
                </div>
                <div class="frame-item-icons">
                    <div style="width:38px; display:flex; justify-content:center;">
                        <button class="toggle-status ${f.active?'active':''}" style="font-size:0.5rem; padding:2px 5px;" onclick="toggleElevActive(${idx}, event)">${f.active?'ON':'OFF'}</button>
                    </div>
                    <div style="width:28px; display:flex; justify-content:center;">
                        <button class="icon-btn ${f.isGrouped ? 'grouped' : ''}" title="Move/Group" onclick="toggleElevGroup(${idx}, event)">${svgMove}</button>
                    </div>
                    <div style="width:26px; display:flex; justify-content:center;">
                        <button class="icon-btn" title="Edit Master" onclick="jumpToDashboard('${f.id}')">${svgEdit}</button>
                    </div>
                    <div style="width:26px; display:flex; justify-content:center;">
                        <button class="icon-btn" title="Duplicate" onclick="duplicateElevFrame(${idx}, event)">${svgDup}</button>
                    </div>
                    <div style="width:26px; display:flex; justify-content:center;">
                        <button class="icon-btn" title="Remove" onclick="removeElevFrame(${idx}, event)">${svgTrash}</button>
                    </div>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function toggleElevDimTarget(idx, targetLetter, e) {
    e.stopPropagation(); const arr = elevFrames[idx].dimTo || [];
    if (arr.includes(targetLetter)) elevFrames[idx].dimTo = arr.filter(l => l !== targetLetter);
    else elevFrames[idx].dimTo.push(targetLetter);
    initElevControls(); drawElevAll();
}

function toggleElevGroup(idx, e) { e.stopPropagation(); elevFrames[idx].isGrouped = !elevFrames[idx].isGrouped; initElevControls(); }
function removeElevFrame(idx, e) { e.stopPropagation(); elevFrames.splice(idx, 1); elevFrames.forEach((f, i) => f.letter = getElevLetter(i)); initElevControls(); drawElevAll(); recalculateDashboardQuantities(); }
function toggleElevActive(idx, e) { e.stopPropagation(); elevFrames[idx].active = !elevFrames[idx].active; initElevControls(); drawElevAll(); recalculateDashboardQuantities(); }

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

function confirmDuplicate(type) {
    if (pendingDuplicateIndex === null) return;
    const idx = pendingDuplicateIndex;
    
    const temp = elevFrames[idx]; 
    const nF = JSON.parse(JSON.stringify(temp));
    nF.letter = getElevLetter(elevFrames.length); 
    const moveFactor = elevUnit === 'in' ? 10 : 25.4;
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
}

function toggleElevLayer(id, btn) {
    const layer = document.getElementById(id);
    const isHidden = (layer.style.display === 'none' || layer.style.display === '');
    layer.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('active', isHidden); 
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

async function batchDownloadAllFrames() {
    if (dashProjectData.length === 0) return alert("No frames to download.");
    const origIndex = dashSelectedRowIndex;
    for (let i = 0; i < dashProjectData.length; i++) {
        selectDashRow(i);
        await new Promise(resolve => setTimeout(resolve, 80));
        exportDashNativePNG();
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    selectDashRow(origIndex);
    alert(`Batch download complete! ${dashProjectData.length} frame(s) saved.`);
}

function elevFmt(val) { return elevUnit === 'in' ? Math.round(val).toString() : parseFloat(val).toFixed(1); }

function drawElevAll() {
    const wallW = parseFloat(document.getElementById('wallW').value) || 1; const wallH = parseFloat(document.getElementById('wallH').value) || 1;
    const workspace = document.querySelector('#view-elevation .workspace');
    
    let baseScale = Math.min((workspace.clientWidth - 160)/wallW, (workspace.clientHeight - 160)/wallH);
    elevScale = baseScale * elevZoomFactor;
    
    const wall = document.getElementById('wall');
    wall.style.width = (wallW * elevScale) + 'px'; wall.style.height = (wallH * elevScale) + 'px';

    const gridLayer = document.getElementById('grid-layer');
    const gridCellSize = (elevUnit === 'in' ? 1 : 2.54) * elevScale;
    gridLayer.style.backgroundSize = gridCellSize + 'px ' + gridCellSize + 'px';
    gridLayer.style.backgroundImage = 'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to top, rgba(0,0,0,0.06) 1px, transparent 1px)';

    const personHeightIn = 72; 
    const personHeight = elevUnit === 'in' ? personHeightIn : parseFloat((personHeightIn * 2.54).toFixed(2)); 
    const pWrap = document.getElementById('person-wrap');
    document.getElementById('person').style.height = (personHeight * elevScale) + 'px';
    pWrap.style.left = (elevPersonPos.x * elevScale) + 'px';

    const frameLayer = document.getElementById('frame-layer'); frameLayer.innerHTML = '';
    const labelLayer = document.getElementById('label-layer'); labelLayer.innerHTML = '';
    const odLayer = document.getElementById('od-layer'); odLayer.innerHTML = '';
    const centerLayer = document.getElementById('frame-center-layer'); centerLayer.innerHTML = '';
    
    elevFrames.forEach((f, idx) => {
        if(!f.active) return;
        
        const el = document.createElement('div'); el.className = 'draggable frame-vis';
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

        if (isFrameless) {
            // Frameless canvas: no rails, no border. Just a drop shadow halo
            // around the canvas-face area to suggest depth on the wall.
            el.classList.add('frame-vis-solid');
            el.style.border = 'none';
            el.style.background = 'transparent';
            el.style.boxShadow = `0 ${16 * elevScale}px ${40 * elevScale}px rgba(0,0,0,0.45), 0 ${6 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.3)`;
        } else if (f.fType === 'color') {
            el.classList.add('frame-vis-solid');
            el.style.border = `${effFw * elevScale}px solid ${f.fColor || '#1a1a1a'}`;
            el.style.setProperty('--frame-color', f.fColor || '#1a1a1a');
            // Outer drop shadow: deeper ambient + tighter contact shadow for clear lift
            el.style.boxShadow = `0 0 0 1.5px ${f.fColor || '#1a1a1a'}, 0 ${16 * elevScale}px ${40 * elevScale}px rgba(0,0,0,0.45), 0 ${6 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.3)`;
        } else {
            el.classList.add('frame-vis-image');
            el.style.setProperty('--fW', (effFw * elevScale) + 'px');
            el.style.setProperty('--frame-W', (f.w * elevScale) + 'px');
            el.style.setProperty('--frame-bg', `url(${f.swatchDataUrl})`);
            el.style.boxShadow = `0 ${16 * elevScale}px ${40 * elevScale}px rgba(0,0,0,0.45), 0 ${6 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.3)`;
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
            paper.style.cssText = `position:absolute; top:${frameInsetPx + paperPx}px; left:${frameInsetPx + paperPx}px; width:${(f.w - effFw*2 - sbPaperMarginVal*2) * elevScale}px; height:${(f.h - effFw*2 - sbPaperMarginVal*2) * elevScale}px; background:${paperColor}; box-shadow: ${2 * elevScale}px ${4 * elevScale}px ${12 * elevScale}px rgba(0,0,0,0.45); ${isTorn ? `border: 1px dashed rgba(0,0,0,0.4);` : ''} pointer-events:none; z-index:3;`;
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
        if (isFloater) {
            // Floater: subtle dashed outline + inner shadow (image opening recessed into the canvas).
            art.style.boxShadow = `inset 0 0 ${10 * elevScale}px rgba(0,0,0,0.35)`;
            art.style.border = '1px dashed rgba(0,0,0,0.25)';
        } else if (isFrameless || useFM) {
            // Frameless canvas & float mount: dashed outline only — NO inner shadow.
            // Frameless has no surrounding material; float mount per spec must not cast shadow on paper.
            art.style.border = '1px dashed rgba(0,0,0,0.25)';
        } else {
            art.style.boxShadow = `inset 0 ${2 * elevScale}px ${8 * elevScale}px rgba(0,0,0,0.2)`;
        }
        
        const unitSuffix = elevUnit === 'in' ? '"' : ' cm';
        art.innerText = (artW > 0) ? `${artW.toFixed(1)}${unitSuffix}\nx\n${artH.toFixed(1)}${unitSuffix}` : "";
        el.appendChild(art);
        
        const labelTag = document.createElement('div'); labelTag.className = 'frame-id-tag';
        labelTag.style.left = (f.x * elevScale) + 'px'; labelTag.style.bottom = ((f.y + f.h) * elevScale) + 'px';
        labelTag.innerText = f.letter; labelLayer.appendChild(labelTag);

        const odTag = document.createElement('div'); odTag.className = 'od-id-tag';
        odTag.style.left = ((f.x + f.w) * elevScale) + 'px'; odTag.style.bottom = ((f.y + f.h) * elevScale) + 'px';
        const odSuffix = elevUnit === 'in' ? '"' : 'cm';
        odTag.innerText = `OD: ${f.w.toFixed(1)}x${f.h.toFixed(1)}${odSuffix}`; odLayer.appendChild(odTag);

        const crossH = document.createElement('div'); crossH.className = 'crosshair-h';
        const chPad = elevUnit === 'in' ? 6 : 15.24;
        const chHalf = elevUnit === 'in' ? 3 : 7.62;
        crossH.style.width = ((f.w + chPad) * elevScale) + 'px'; crossH.style.left = ((f.x - chHalf) * elevScale) + 'px'; crossH.style.bottom = ((f.y + f.h/2) * elevScale) + 'px';
        const crossV = document.createElement('div'); crossV.className = 'crosshair-v';
        crossV.style.height = ((f.h + chPad) * elevScale) + 'px'; crossV.style.left = ((f.x + f.w/2) * elevScale) + 'px'; crossV.style.bottom = ((f.y - chHalf) * elevScale) + 'px';
        centerLayer.appendChild(crossH); centerLayer.appendChild(crossV);
        
        makeElevDraggable(el, idx); frameLayer.appendChild(el);
    });

    makeElevDraggable(pWrap, 'person');
    drawElevTargetedSpacing(); drawElevGuides(wallW, wallH);
}

function makeElevDraggable(el, idx) {
    el.onmousedown = function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        e.preventDefault(); let sx = e.clientX, sy = e.clientY;
        document.onmousemove = function(e) {
            let dx = (sx - e.clientX)/elevScale, dy = (sy - e.clientY)/elevScale; sx = e.clientX; sy = e.clientY;
            const snap = elevUnit === 'in' ? 1 : 2.54;
            if(idx === 'person') { 
                elevPersonPos.x -= dx; 
            } else { 
                let frame = elevFrames[idx]; let prevX = frame.x; let prevY = frame.y;
                frame.x = Math.round((frame.x - dx)/snap)*snap; frame.y = Math.round((frame.y + dy)/snap)*snap; 
                let actualDx = frame.x - prevX; let actualDy = frame.y - prevY;
                if(frame.isGrouped) { elevFrames.forEach((f, i) => { if(i !== idx && f.active && f.isGrouped) { f.x += actualDx; f.y += actualDy; } }); }
            }
            drawElevAll();
        };
        document.onmouseup = () => document.onmousemove = null;
    };
}

function drawElevGuides(wallW, wallH) {
    const guideLayer = document.getElementById('guide-layer'); guideLayer.innerHTML = '';
    const archLayer = document.getElementById('arch-dim-layer'); archLayer.innerHTML = '';
    
    const cl = document.createElement('div'); cl.className = 'center-guide';
    cl.style.left = ((wallW / 2) * elevScale) + 'px'; cl.style.bottom = '0px';
    cl.innerHTML = `<span class="center-label">WALL CENTER</span>`;
    guideLayer.appendChild(cl);

    const hangVal = elevUnit === 'in' ? 57 : 144.78;
    if(hangVal < wallH) {
        const hl = document.createElement('div'); hl.className = 'hang-guide';
        hl.style.bottom = (hangVal * elevScale) + 'px';
        hl.innerHTML = `<span class="hang-label">HANG HEIGHT: ${elevFmt(hangVal)}${elevUnit==='in'?'"':''}</span>`;
        guideLayer.appendChild(hl);
    }
    
    const offsetDist = elevUnit === 'in' ? 6 : 15.24;
    createElevArchDim(0, wallH + offsetDist, wallW, wallH + offsetDist, 'h', `${elevFmt(wallW)}${elevUnit === 'in' ? '"' : ' cm'}`, archLayer, true);
    createElevArchDim(-offsetDist, 0, -offsetDist, wallH, 'v', `${elevFmt(wallH)}${elevUnit === 'in' ? '"' : ' cm'}`, archLayer, true);

    // The character figure is a known 72" tall scale reference, so we don't render
    // an explicit height dimension next to it. Per studio convention all designers
    // assume this height; printing the label was visual noise.
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
                        createElevArchSpacing(leftF.x + leftF.w, anchorY, rightF.x, anchorY, 'h', layer, elevFmt(gapX));
                    }
                    let botF = f1.y < f2.y ? f1 : f2; let topF = f1.y < f2.y ? f2 : f1;
                    if (topF.y >= botF.y + botF.h) {
                        let gapY = topF.y - (botF.y + botF.h);
                        let oLeft = Math.max(botF.x, topF.x); let oRight = Math.min(botF.x + botF.w, topF.x + topF.w);
                        let anchorX = oRight > oLeft ? oLeft + (oRight - oLeft)/2 : (botF.x + botF.w/2 + topF.x + topF.w/2)/2;
                        createElevArchSpacing(anchorX, botF.y + botF.h, anchorX, topF.y, 'v', layer, elevFmt(gapY));
                    }
                    drawnPairs.add(pairId);
                }
            }
        });
    });
}

function createElevArchDim(x1, y1, x2, y2, type, label, container, isWallOuter) {
    const dim = document.createElement('div');
    dim.className = 'arch-dim ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');
    
    const left = Math.min(x1, x2) * elevScale;
    const bottom = Math.min(y1, y2) * elevScale;
    dim.style.left = left + 'px';
    dim.style.bottom = bottom + 'px';

    const offset = (elevUnit === 'in' ? 6 : 15.24) * elevScale; 

    if(type === 'h') {
        const width = Math.abs(x2 - x1) * elevScale;
        dim.style.width = width + 'px';
        dim.innerHTML = `
            ${isWallOuter ? `<div style="position:absolute; left:0; top:0; width:1px; height:${offset}px; border-left:1.5px dashed var(--guide-color);"></div><div style="position:absolute; right:0; top:0; width:1px; height:${offset}px; border-left:1.5px dashed var(--guide-color);"></div>` : ''}
            <div class="dim-line-segment"></div>
            <span class="arch-label-new">${label}</span>
            <div class="dim-line-segment"></div>
        `;
    } else {
        const height = Math.abs(y2 - y1) * elevScale;
        dim.style.height = height + 'px';
        dim.innerHTML = `
            ${isWallOuter ? `<div style="position:absolute; left:0; bottom:0; height:1px; width:${offset}px; border-top:1.5px dashed var(--guide-color);"></div><div style="position:absolute; left:0; top:0; height:1px; width:${offset}px; border-top:1.5px dashed var(--guide-color);"></div>` : ''}
            <div class="dim-line-segment-v"></div>
            <span class="arch-label-new">${label}</span>
            <div class="dim-line-segment-v"></div>
        `;
    }
    container.appendChild(dim);
}

function createElevArchSpacing(x1, y1, x2, y2, type, container, label) {
    const dim = document.createElement('div'); 
    dim.className = 'arch-dim ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');
    
    if(type === 'h') {
        const width = Math.abs(x2 - x1) * elevScale; const left = Math.min(x1, x2) * elevScale; const bottom = y1 * elevScale;
        dim.style.cssText = `width:${width}px; height:1.2px; left:${left}px; bottom:${bottom}px;`;
        dim.innerHTML = `<div class="dim-line-segment"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment"></div>`;
    } else {
        const height = Math.abs(y2 - y1) * elevScale; const left = x1 * elevScale; const bottom = Math.min(y1, y2) * elevScale;
        dim.style.cssText = `height:${height}px; width:1.2px; left:${left}px; bottom:${bottom}px;`;
        dim.innerHTML = `<div class="dim-line-segment-v"></div><span class="arch-label-new">${label}</span><div class="dim-line-segment-v"></div>`;
    }
    container.appendChild(dim);
}

function setElevUnit(u) {
    if(elevUnit === u) return;
    if (elevations[currentElevIndex]) {
        elevations[currentElevIndex].wallW = parseFloat(document.getElementById('wallW').value) || elevations[currentElevIndex].wallW;
        elevations[currentElevIndex].wallH = parseFloat(document.getElementById('wallH').value) || elevations[currentElevIndex].wallH;
    }
    const f = u === 'cm' ? 2.54 : (1/2.54);
    elevations.forEach(elev => {
        elev.wallW = parseFloat((parseFloat(elev.wallW) * f).toFixed(2));
        elev.wallH = parseFloat((parseFloat(elev.wallH) * f).toFixed(2));
        elev.frames.forEach(fr => {
            ['w','h','fW','fHeight','rabbetDepth','floaterInset','sbPaperMargin','sbPaperBorder','m1T','m1B','m1L','m1R','m2','x','y'].forEach(p => {
                fr[p] = parseFloat((parseFloat(fr[p] || 0) * f).toFixed(4));
            });
        });
        elev.personPos.x = parseFloat((parseFloat(elev.personPos.x || 0) * f).toFixed(2));
    });
    
    elevUnit = u;
    document.getElementById('wallW').value = elevations[currentElevIndex].wallW;
    document.getElementById('wallH').value = elevations[currentElevIndex].wallH;
    document.getElementById('elevBtnInch').classList.toggle('active', elevUnit==='in'); 
    document.getElementById('elevBtnCm').classList.toggle('active', elevUnit==='cm');
    initElevControls(); drawElevAll();
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

async function exportElevPNG() {
    const ws = document.querySelector('#view-elevation .workspace');
    const wrap = document.getElementById('export-wrap');
    const wall = document.getElementById('wall');

    // Force light theme for export (consistency with print/PDF), restore after.
    const wasDark = !document.body.classList.contains('light-theme');
    document.body.classList.add('light-theme');
    drawElevAll();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const oldOverflow = ws.style.overflow; ws.style.overflow = 'visible';
    const oldWallBg = wall.style.background; wall.style.background = 'transparent';

    // Character clip-fix: the character (#person-wrap) is position:absolute inside
    // #wall, which means its bounds don't contribute to #export-wrap's auto-sized
    // max-content width/height. The existing 80px padding on #export-wrap
    // accommodates SMALL character overflow but not when designers place the
    // character right next to the outer dimension line. So before export we
    // measure the character's actual bounding rect relative to #export-wrap
    // and inflate the padding inline so html2canvas captures the full region.
    // Restored in the finally block.
    const exportWrap = document.getElementById('export-wrap');
    const oldExportWrapPadding = exportWrap.style.padding;
    {
        const personWrapForBounds = document.getElementById('person-wrap');
        const personIsVisibleForPad = personWrapForBounds && getComputedStyle(personWrapForBounds).display !== 'none';
        if (personIsVisibleForPad) {
            const wrapRect = exportWrap.getBoundingClientRect();
            const personRect = personWrapForBounds.getBoundingClientRect();
            // Compute how far the character extends OUTSIDE the current export-wrap padding-box
            // on each side. A positive value means overflow we need to absorb.
            const overflowLeft = Math.max(0, wrapRect.left - personRect.left);
            const overflowRight = Math.max(0, personRect.right - wrapRect.right);
            const overflowTop = Math.max(0, wrapRect.top - personRect.top);
            const overflowBottom = Math.max(0, personRect.bottom - wrapRect.bottom);
            // Add a small safety margin (20px) beyond the strict overflow so the
            // figure doesn't sit flush against the export edge.
            const SAFETY = 20;
            // Base padding from CSS is 80px on all sides. Build new shorthand:
            const PAD_BASE = 80;
            const padTop    = PAD_BASE + Math.ceil(overflowTop)    + (overflowTop    > 0 ? SAFETY : 0);
            const padRight  = PAD_BASE + Math.ceil(overflowRight)  + (overflowRight  > 0 ? SAFETY : 0);
            const padBottom = PAD_BASE + Math.ceil(overflowBottom) + (overflowBottom > 0 ? SAFETY : 0);
            const padLeft   = PAD_BASE + Math.ceil(overflowLeft)   + (overflowLeft   > 0 ? SAFETY : 0);
            exportWrap.style.padding = `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`;
            // Force a reflow + an extra frame so html2canvas sees the new layout
            void exportWrap.offsetWidth;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
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
        });
        const a = document.createElement('a');
        a.download = `${elevations[currentElevIndex].name.replace(/[^a-z0-9]/gi, '_')}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
    } catch (err) {
        console.error(err);
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

// BOOT UP THE ENGINE
initMasterApp();
