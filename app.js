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

const FLOATER_SHADOW_REVEAL = 0.25;

const FRAME_PRODUCTS = [
    "Framed Art",
    "Framed Art (Shadow Box)",
    "Framed Canvas (Floater)",
    "Frameless Canvas (Wrapped)",
    "Sourced Object"
];

// Minimalist SVGs
const svgMove = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20"/></svg>`;
const svgEdit = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const svgDup = `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const svgTrash = `<svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const dashDefaultData = { 
    id: "ART.001", imageCode: "TBD", level: "1", qty: 0, product: "Framed Art", location: "LOBBY", 
    artist: "", artworkTitle: "", artType: "",
    fColorName: "Standard Black", fHeight: 0, rabbetDepth: 0,
    paperType: "Fine Art Paper",
    bleed: 0.25, canvasDepth: "", canvasWrap: "", floaterInset: 0.75,
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
// GITHUB CLOUD LIBRARY SYNC
// =========================================================================
const GITHUB_USERNAME = "JDHilliard-lab"; 
const GITHUB_REPO = "FRAME";     
const GITHUB_BRANCH = "main";                   
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/`;

async function syncFromCloud(silent = false) {
    try {
        const manifestUrl = GITHUB_RAW_BASE + 'library-manifest.json';
        const res = await fetch(manifestUrl, { cache: 'no-cache' });
        
        if (!res.ok) {
            if (!silent) alert(`Cloud Sync Failed (HTTP ${res.status}).\n\nCould not find library-manifest.json in your GitHub repo.\nMake sure you pushed it to the main branch.`);
            return; 
        }
        
        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) {
            if (!silent) alert("Cloud Sync connected, but no frames were found in the manifest.");
            return;
        }
        
        dashLocalLibrary = {}; // Wipe local so we don't have duplicates
        let count = 0;
        
        items.forEach(it => {
            if (!it.vendor || !it.collection || !it.code || !it.path) return;
            if (!dashLocalLibrary[it.vendor]) dashLocalLibrary[it.vendor] = {};
            if (!dashLocalLibrary[it.vendor][it.collection]) dashLocalLibrary[it.vendor][it.collection] = [];
            
            // Skip if duplicate code exists
            if (dashLocalLibrary[it.vendor][it.collection].some(x => x.code === it.code)) return;
            
            const entry = {
                code: it.code,
                width: parseFloat(it.width) || 1.25,
                url: GITHUB_RAW_BASE + it.path, 
            };
            
            if (it.faceWidth !== undefined && it.faceWidth !== null) entry.faceWidth = parseFloat(it.faceWidth);
            if (it.depth !== undefined && it.depth !== null) entry.depth = parseFloat(it.depth);
            if (it.rabbet !== undefined && it.rabbet !== null) entry.rabbet = parseFloat(it.rabbet);
            
            dashLocalLibrary[it.vendor][it.collection].push(entry);
            count++;
        });
        
        populateDashVendorDropdown();
        if (!silent) showInfoModal("Cloud Sync Complete", `Successfully synced ${count} swatches from GitHub!`);
        console.log(`Cloud Library Loaded: ${count} swatches streamed from GitHub.`);
        
    } catch (e) {
        if (!silent) alert(`Cloud sync failed. Error: ${e.message}`);
        console.warn('Bundled library manifest could not be loaded:', e);
    }
}

// =========================================================================
// INITIALIZATION & NAVIGATION
// =========================================================================
function initMasterApp() {
    document.getElementById('g_date').valueAsDate = new Date();
    renderNavTabs();
    selectDashRow(0); 
    populateDashPushSelector();
    updateDimFontSize();
    
    // Auto-fetch from github silently on boot
    syncFromCloud(true); 
    
    document.addEventListener('click', function(event) {
        const container = document.getElementById('customSwatchContainer');
        const sList = document.getElementById('swatchDropdownList');
        if (container && !container.contains(event.target)) {
            if (sList && sList.style.display === 'block') { sList.style.display = 'none'; restoreDashThumbnail(); }
        }
        const bList = document.getElementById('bulkDropdownList');
        const bBtn = document.querySelector('[onclick="toggleBulkDropdown()"]');
        if (bList && bList.style.display === 'block') {
            if (bBtn && !bBtn.contains(event.target) && !bList.contains(event.target)) {
                bList.style.display = 'none';
            }
        }
    });

    document.addEventListener('focusin', function(event) {
        if (event.target && event.target.tagName === 'INPUT' && event.target.type === 'number') {
            setTimeout(() => { try { event.target.select(); } catch (e) {} }, 0);
        }
    });
}

// Prevent Accidental Closing
window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
});

function toggleTheme() { 
    document.body.classList.toggle('light-theme'); 
    
    // Toggle Logos if they exist
    const logoDark = document.querySelector('.logo-dark');
    const logoLight = document.querySelector('.logo-light');
    if (logoDark && logoLight) {
        if (document.body.classList.contains('light-theme')) {
            logoDark.style.display = 'none';
            logoLight.style.display = 'block';
        } else {
            logoDark.style.display = 'block';
            logoLight.style.display = 'none';
        }
    }
}

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
    let count = 0;
    elevations.forEach(e => { e.frames.forEach(f => { if(f.id === id) count++; }); });
    
    const banner = document.getElementById('linkedWarningBanner');
    if (count > 1) {
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

    elevations.forEach(elev => {
        elev.frames.forEach(f => {
            if (f.id === d.id) {
                f.w = (parseFloat(d.extW) || 24) * factor; f.h = (parseFloat(d.extH) || 30) * factor;
                f.fW = (parseFloat(d.fW) || 1.25) * factor; f.fType = d.fType; f.fColor = d.fColor; f.swatchDataUrl = d.swatchDataUrl;
                f.m1T = (parseFloat(d.m1T) || 0) * factor; f.m1B = (parseFloat(d.m1B) || 0) * factor; f.m1L = (parseFloat(d.m1L) || 0) * factor; f.m1R = (parseFloat(d.m1R) || 0) * factor;
                f.m1A = d.m1A !== false; f.m1ColorHex = d.m1ColorHex;
                f.m2 = (parseFloat(d.m2) || 0) * factor; f.m2A = d.m2A; f.m2ColorHex = d.m2ColorHex;
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
        sec.classList.remove('open'); span.innerHTML = `▶`;
    } else {
        sec.classList.add('open'); span.innerHTML = `▼`;
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
    duplicateDashRow();
    const newId = dashProjectData[dashSelectedRowIndex].id;
    checkGlobalEditingWarning(newId);
    showInfoModal("Detached", `Settings copied to a new independent item code (${newId}). The walls still reference the original.`);
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
    
    setVal('extW', dashFmt(data.extW)); setVal('extH', dashFmt(data.extH)); setVal('fType', data.fType); setVal('fW', dashFmt(data.fW)); 
    setVal('fColor', data.fColor); setVal('m_fCode', data.fCode); 
    
    document.getElementById('m1Toggle').classList.toggle('active', data.m1A); document.getElementById('m1Toggle').innerText = data.m1A ? 'ON' : 'OFF';
    document.querySelectorAll('.m1-input').forEach(el => el.disabled = !data.m1A);
    
    const m2EffectivelyOn = data.m1A && data.m2A;
    const m2Btn = document.getElementById('m2Toggle');
    m2Btn.classList.toggle('active', m2EffectivelyOn); m2Btn.innerText = m2EffectivelyOn ? 'ON' : 'OFF';
    m2Btn.disabled = !data.m1A;
    m2Btn.style.opacity = data.m1A ? '1' : '0.4';
    document.getElementById('m2').disabled = !m2EffectivelyOn;
    
    document.getElementById('m1Lock').classList.toggle('active', data.m1Locked); document.getElementById('m1Lock').innerText = data.m1Locked ? 'LOCKED' : 'UNLOCKED';
    
    setVal('m1T', dashFmt(data.m1T)); setVal('m1B', dashFmt(data.m1B)); setVal('m1L', dashFmt(data.m1L)); setVal('m1R', dashFmt(data.m1R)); setVal('m2', dashFmt(data.m2));

    handleDashProductChange(false);
    document.getElementById('swatchSelectedDisplay').textContent = (data.fType === 'image' && data.swatchName) ? data.swatchName : 'Frame';

    if(data.swatchDataUrl && data.fType === 'image') { dashActiveImageObj.src = data.swatchDataUrl; document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${data.swatchDataUrl})`; } 
    else { dashActiveImageObj.src = emptyImgUrl; document.getElementById('swatchThumbPreview').style.backgroundImage = `none`; }
    updateDashVisualsFromDOM();
}

function dashHtIn(idx, field, val) {
    let row = dashProjectData[idx];
    if(['qty','extW','extH','fW','m1T','m1R','m1B','m1L','m2','m_bleed','canvasDepth','canvasWrap'].includes(field)) val = parseFloat(val) || 0;
    if (field === 'id') { const oldId = row.id; elevations.forEach(elev => { elev.frames.forEach(f => { if (f.id === oldId) f.id = val; }); }); }
    row[field] = val;

    if (idx === dashSelectedRowIndex) {
        const map = { 'id':'m_itemCode', 'imageCode':'m_imageCode', 'level':'m_level', 'qty':'m_qty', 'location':'m_location', 'extW':'extW', 'extH':'extH', 'fCode':'m_fCode', 'fW':'fW', 'canvasDepth':'canvasDepth', 'canvasWrap':'canvasWrap', 'm1T':'m1T', 'm1R':'m1R', 'm1B':'m1B', 'm1L':'m1L', 'm2':'m2', 'glass':'m_glass', 'hardware':'m_hardware', 'backing':'m_backing', 'mount':'m_mount', 'notes':'m_notes', 'prodNotes':'m_prodNotes' };
        if(map[field] && document.getElementById(map[field])) document.getElementById(map[field]).value = dashFmt(row[field]);
        if(field === 'product') { document.getElementById('m_product').value = row.product; handleDashProductChange(false); }
        updateDashVisualsFromDOM();
        pushUpdatesToElevations(idx);
    }
    renderDashTable(); 
    if (field === 'id') recalculateDashboardQuantities();
}

function syncDashAndCalculate() {
    const getRaw = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const getVal = (id) => parseFloat(getRaw(id)) || 0;
    const getStr = (id) => getRaw(id);
    const row = dashProjectData[dashSelectedRowIndex];
    
    const oldId = row.id; const newId = getStr('m_itemCode');
    if (oldId !== newId) { elevations.forEach(elev => { elev.frames.forEach(f => { if (f.id === oldId) f.id = newId; }); }); }

    const isColor = getStr('fType') === 'color';
    const m1Active = document.getElementById('m1Toggle').classList.contains('active');
    const m2Active = m1Active && document.getElementById('m2Toggle').classList.contains('active');

    dashProjectData[dashSelectedRowIndex] = {
        id: newId, imageCode: getStr('m_imageCode'), level: getStr('m_level'), qty: getVal('m_qty'), product: getStr('m_product'), location: getStr('m_location'),
        bleed: getVal('m_bleed'), canvasDepth: getRaw('canvasDepth'), canvasWrap: getRaw('canvasWrap'), floaterInset: getVal('floaterInset') || 0.75,
        extW: getVal('extW'), extH: getVal('extH'), fType: getStr('fType'), fW: getVal('fW'), fColor: getStr('fColor'), fCode: getStr('m_fCode'),
        swatchDataUrl: isColor ? "" : row.swatchDataUrl, swatchName: isColor ? "" : row.swatchName,
        m1A: m1Active, 
        m1T: getVal('m1T'), m1B: getVal('m1B'), m1L: getVal('m1L'), m1R: getVal('m1R'), m1Locked: document.getElementById('m1Lock').classList.contains('active'), 
        m2A: m2Active, m2: getVal('m2'),
        useFloatMount: row.useFloatMount === true,
        glass: getStr('m_glass'), hardware: getStr('m_hardware'), mount: getStr('m_mount'), backing: getStr('m_backing'), notes: getStr('m_notes'), prodNotes: getStr('m_prodNotes')
    };
    
    updateDashVisualsFromDOM(); renderDashTable(); pushUpdatesToElevations(dashSelectedRowIndex);
    if (oldId !== newId) recalculateDashboardQuantities();
}

function updateDashVisualsFromDOM() {
    const data = dashProjectData[dashSelectedRowIndex];
    const fVis = document.getElementById('dash-frame-visual');
    const viewObj = document.getElementById('view-dashboard');
    
    document.getElementById('imageControls').style.display = 'flex';
    
    if (data.fType === 'color') {
        viewObj.style.setProperty('--frame-bg', `none`);
        document.getElementById('swatchSelectedDisplay').textContent = "Frame";
        document.getElementById('swatchThumbPreview').style.backgroundImage = `none`;
    } else {
        viewObj.style.setProperty('--frame-bg', `url(${data.swatchDataUrl})`);
    }

    const isCanvas = (data.product === "Framed Canvas (Floater)");
    const isFrameless = (data.product === "Frameless Canvas (Wrapped)");
    const useFM = !isCanvas && !isFrameless && (data.useFloatMount === true);

    const effM1A = (data.m1A !== false && !isCanvas && !isFrameless && !useFM);
    const effM2A = (data.m2A === true && !isCanvas && !isFrameless && !useFM);
    
    const effM1T = effM1A ? data.m1T : 0; const effM1B = effM1A ? data.m1B : 0; const effM1L = effM1A ? data.m1L : 0; const effM1R = effM1A ? data.m1R : 0;
    const effM2 = effM2A ? data.m2 : 0;

    const floaterInsetVal = isCanvas ? (parseFloat(data.floaterInset) || 0.75) : 0;
    let finalW, finalH;
    if (isCanvas) {
        finalW = data.extW - floaterInsetVal * 2;
        finalH = data.extH - floaterInsetVal * 2;
    } else if (isFrameless) {
        finalW = data.extW;
        finalH = data.extH;
    } else {
        finalW = data.extW - (data.fW * 2) - effM1L - effM1R - (effM2 * 2);
        finalH = data.extH - (data.fW * 2) - effM1T - effM1B - (effM2 * 2);
    }
    
    document.getElementById('disp_openW').innerText = dashFmt(Math.max(0, finalW));
    document.getElementById('disp_openH').innerText = dashFmt(Math.max(0, finalH));

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
    document.getElementById('printFileDisplay').innerText = `${dashFmt(printW)} × ${dashFmt(printH)}`;

    const ratio = 300 / Math.max(data.extW, data.extH); 
    
    fVis.innerHTML = ''; 
    fVis.style.width = (data.extW * ratio) + "px"; fVis.style.height = (data.extH * ratio) + "px";

    const effFw_dash = data.fW;

    if (isFrameless) {
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
        m1Vis.style.borderColor = '#ffffff'; fVis.appendChild(m1Vis);
    }
    
    if(effM2A) { 
        const m2Vis = document.createElement('div'); m2Vis.className = 'mat2-visual'; m2Vis.id = 'dash-mat2-visual';
        let m2TopOffset = (data.fType === 'color') ? (data.m1T * ratio) : ((data.fW + data.m1T) * ratio);
        let m2LeftOffset = (data.fType === 'color') ? (data.m1L * ratio) : ((data.fW + data.m1L) * ratio);
        m2Vis.style.top = m2TopOffset + "px"; m2Vis.style.left = m2LeftOffset + "px"; 
        m2Vis.style.width = ((data.extW - (data.fW * 2) - effM1L - effM1R) * ratio) + "px"; m2Vis.style.height = ((data.extH - (data.fW * 2) - effM1T - effM1B) * ratio) + "px"; 
        m2Vis.style.borderWidth = (data.m2 * ratio) + 'px'; m2Vis.style.borderColor = '#fdfdfd'; fVis.appendChild(m2Vis);
    }
    
    const artVis = document.createElement('div'); artVis.className = 'art-visual'; artVis.id = 'dash-art-visual';
    artVis.style.border = (isCanvas || isFrameless || useFM) ? "1px dashed rgba(0,0,0,0.25)" : "1px solid #aaa";
    
    let artTopOffset, artLeftOffset;
    if (isCanvas) {
        artTopOffset = floaterInsetVal * ratio;
        artLeftOffset = floaterInsetVal * ratio;
    } else if (isFrameless) {
        artTopOffset = 0; artLeftOffset = 0;
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

// RESTORED SYNC & DB FUNCTIONS
function handleDashProductChange(shouldSync = true) {
    const val = document.getElementById('m_product').value;
    const matWrapper = document.getElementById('matWrapper');
    const bleedSettings = document.getElementById('bleedSettings');
    const canvasSettings = document.getElementById('canvasSettings');

    if(val === "Framed Canvas (Floater)") {
        matWrapper.classList.add('disabled-section'); bleedSettings.style.display = 'none'; canvasSettings.style.display = 'grid';
    } else {
        matWrapper.classList.remove('disabled-section'); bleedSettings.style.display = 'grid'; canvasSettings.style.display = 'none';
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
        const m2Btn = document.getElementById('m2Toggle');
        if (!m1On && m2Btn.classList.contains('active')) {
            m2Btn.classList.remove('active'); m2Btn.innerText = 'OFF'; document.getElementById('m2').disabled = true;
        }
        m2Btn.disabled = !m1On; m2Btn.style.opacity = m1On ? '1' : '0.4';
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

function syncDashLibraryFolder(e) {
    const f = e.target.files;
    if(!f || f.length === 0) return;
    dashLocalLibrary = {}; let c = 0;
    
    for(let file of f) {
        if(!file.type.startsWith('image/')) continue;
        
        const parts = file.webkitRelativePath.split('/');
        const filename = parts.pop(); 
        
        const vendor = parts.length > 1 ? parts[1] : (parts[0] || "Imported");
        const collection = parts.length > 2 ? parts[2] : "General";
        
        const baseName = filename.substring(0, filename.lastIndexOf('.')); 
        const nP = baseName.split('_');
        const code = nP.slice(0,-1).join(' ') || baseName; 
        const w = nP.length > 1 ? parseFloat(nP[nP.length-1]) : 1.25;
        
        if(!dashLocalLibrary[vendor]) dashLocalLibrary[vendor] = {};
        if(!dashLocalLibrary[vendor][collection]) dashLocalLibrary[vendor][collection] = [];
        dashLocalLibrary[vendor][collection].push({ code: code, width: w, file: file });
        c++;
    }
    populateDashVendorDropdown(); showInfoModal('Library Synced', `Successfully synced ${c} swatches from your local folder.`);
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

function updateDashCustomSwatchDropdown() {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection').value;
    const s = document.getElementById('swatchDropdownList'); s.innerHTML = '';
    if(!v || !c || !dashLocalLibrary[v][c]) return;
    dashLocalLibrary[v][c].forEach((item, idx) => {
        const li = document.createElement('li'); li.textContent = `${item.code} (${item.width}")`;
        li.onmouseenter = () => {
            if (item.url) {
                document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${item.url})`;
            } else if (item.file) {
                if(dashTempHoverUrl) URL.revokeObjectURL(dashTempHoverUrl);
                dashTempHoverUrl = URL.createObjectURL(item.file);
                document.getElementById('swatchThumbPreview').style.backgroundImage = `url(${dashTempHoverUrl})`;
            }
        };
        li.onclick = () => { document.getElementById('swatchSelectedDisplay').textContent = li.textContent; s.style.display = 'none'; loadDashFromCustomLibrary(idx); };
        s.appendChild(li);
    });
    s.onmouseleave = restoreDashThumbnail;
}

function loadDashFromCustomLibrary(idx) {
    const v = document.getElementById('libVendor').value; const c = document.getElementById('libCollection').value;
    if(!v || !c || idx === undefined) return;
    const item = dashLocalLibrary[v][c][idx];
    
    const applyImage = (dataUrl) => {
        const w = dashUnit === 'cm' ? dashFmt(item.width * 2.54) : item.width;
        document.getElementById('fW').value = w; document.getElementById('m_fCode').value = item.code;
        dashProjectData[dashSelectedRowIndex].fW = w; dashProjectData[dashSelectedRowIndex].fCode = item.code;
        dashProjectData[dashSelectedRowIndex].swatchDataUrl = dataUrl; dashProjectData[dashSelectedRowIndex].swatchName = item.code;
        document.getElementById('view-dashboard').style.setProperty('--frame-bg', `url(${dataUrl})`);
        
        const isFloaterCollection = /floater/i.test(c);
        const productSelect = document.getElementById('m_product');
        if (isFloaterCollection && productSelect && productSelect.value !== "Framed Canvas (Floater)") {
            productSelect.value = "Framed Canvas (Floater)";
            handleDashProductChange(false);
        }

        dashActiveImageObj.src = dataUrl; dashActiveImageObj.onload = () => syncDashAndCalculate();
        document.getElementById('swatchSelectedDisplay').textContent = item.code;
        document.getElementById('fType').value = 'image';
    };

    if (item.url) {
        applyImage(item.url);
    } else if (item.file) {
        const r = new FileReader();
        r.onload = e => applyImage(e.target.result);
        r.readAsDataURL(item.file);
    }
}

function loadDashCustomSwatch(e) {
    const f = e.target.files[0]; if(!f) return;
    const n = f.name.split('.')[0]; const r = new FileReader();
    r.onload = e => {
        document.getElementById('fType').value = 'image';
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

function _frameDataInInches(d, sourceUnit) {
    if (sourceUnit === 'in') return d;  
    const factor = 1 / 2.54;             
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

    if (isFrameless) {
        const c = document.createElement('canvas');
        c.width = w + (pad * 2); c.height = h + (pad * 2);
        const x = c.getContext('2d'); x.translate(pad, pad);
        x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
        x.shadowColor = 'transparent';
        x.clearRect(0, 0, w, h);
        return { canvas: c, pad: pad, frameW: w, frameH: h };
    }
    const drawFw = fw;

    const c = document.createElement('canvas'); c.width = w + (pad * 2); c.height = h + (pad * 2);
    const x = c.getContext('2d'); x.translate(pad, pad);

    x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 35; x.shadowOffsetY = 18;
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.shadowColor = 'transparent';

    function shadeColor(hex, pct) {
        const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        let h = m[1];
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        let r = parseInt(h.slice(0, 2), 16); let g = parseInt(h.slice(2, 4), 16); let b = parseInt(h.slice(4, 6), 16);
        const adj = (v) => { if (pct >= 0) return Math.round(v + (255 - v) * pct); return Math.round(v * (1 + pct)); };
        r = Math.max(0, Math.min(255, adj(r))); g = Math.max(0, Math.min(255, adj(g))); b = Math.max(0, Math.min(255, adj(b)));
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    }

    function fR(img, rw, rh, sx, sy) {
        const useColor = (!img || img.src === emptyImgUrl || d.fType === 'color' || !img.complete || !img.naturalWidth);
        if (useColor) {
            const base = d.fColor || '#1a1a1a';
            const grad = x.createLinearGradient(0, 0, rw, 0);
            grad.addColorStop(0, shadeColor(base, 0.07));  
            grad.addColorStop(0.55, base);                   
            grad.addColorStop(1, shadeColor(base, -0.12));  
            x.fillStyle = grad; x.fillRect(sx, sy, rw, rh); return;
        }
        const s = rw / img.width; const pt = x.createPattern(img, 'repeat');
        const m = new DOMMatrix().translate(sx, sy).scale(s, s);
        pt.setTransform(m); x.fillStyle = pt; x.fillRect(sx, sy, rw, rh);
    }

    x.save(); x.beginPath(); x.moveTo(0,0); x.lineTo(drawFw,drawFw); x.lineTo(drawFw,h-drawFw); x.lineTo(0,h); x.closePath(); x.clip(); fR(swatchImg,drawFw,h,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(w,0); x.lineTo(w-drawFw,drawFw); x.lineTo(w-drawFw,h-drawFw); x.lineTo(w,h); x.closePath(); x.clip(); x.translate(w,0); x.scale(-1,1); fR(swatchImg,drawFw,h,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(0,0); x.lineTo(w,0); x.lineTo(w-drawFw,drawFw); x.lineTo(drawFw,drawFw); x.closePath(); x.clip(); x.translate(w/2,drawFw/2); x.rotate(90*Math.PI/180); x.translate(-drawFw/2,-w/2); fR(swatchImg,drawFw,w,0,0); x.restore();
    x.save(); x.beginPath(); x.moveTo(0,h); x.lineTo(w,h); x.lineTo(w-drawFw,h-drawFw); x.lineTo(drawFw,h-drawFw); x.closePath(); x.clip(); x.translate(w/2,h-drawFw/2); x.rotate(-90*Math.PI/180); x.translate(-drawFw/2,-w/2); fR(swatchImg,drawFw,w,0,0); x.restore();

    if (d.fType === 'color') {
        const miterColor = shadeColor(d.fColor || '#1a1a1a', -0.35);
        const miterW = Math.max(0.5, Math.min(2, drawFw * 0.015));
        x.save(); x.strokeStyle = miterColor; x.lineWidth = miterW; x.lineCap = 'round'; x.beginPath();
        x.moveTo(0, 0); x.lineTo(drawFw, drawFw); x.moveTo(w, 0); x.lineTo(w - drawFw, drawFw);
        x.moveTo(0, h); x.lineTo(drawFw, h - drawFw); x.moveTo(w, h); x.lineTo(w - drawFw, h - drawFw);
        x.stroke(); x.restore();
    }

    function dIS(bx, by, bw, bh, bl, os, op) {
        x.save(); x.beginPath(); x.rect(bx,by,bw,bh); x.clip();
        x.shadowColor = `rgba(0,0,0,${op})`; x.shadowBlur = bl; x.shadowOffsetY = os;
        x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeRect(bx-15, by-15, bw+30, bh+30); x.restore();
    }

    const iX = drawFw, iY = drawFw, iW = w - (drawFw*2), iH = h - (drawFw*2);
    const useFM = !isC && (d.useFloatMount === true);
    const m1On = (d.m1A !== false && !isC && !useFM);
    const m2On = (m1On && d.m2A === true && !isC && !useFM);
    const mT = m1On ? d.m1T : 0, mB = m1On ? d.m1B : 0, mL = m1On ? d.m1L : 0, mR = m1On ? d.m1R : 0;
    const m2 = m2On ? d.m2 : 0;

    if (m1On) {
        x.fillStyle = '#ffffff'; x.fillRect(iX, iY, iW, iH);
        dIS(iX, iY, iW, iH, 35, 14, 0.6);
        x.strokeStyle = "#cccccc"; x.lineWidth = 1; x.strokeRect(iX, iY, iW, iH);
    }
    const m2X = iX + (mL*dpi), m2Y = iY + (mT*dpi); const m2W = iW - ((mL+mR)*dpi), m2H = iH - ((mT+mB)*dpi);
    if (m2On) {
        x.fillStyle = '#fdfdfd'; x.fillRect(m2X, m2Y, m2W, m2H);
        dIS(m2X, m2Y, m2W, m2H, 20, 8, 0.45);
        x.strokeStyle = "#cccccc"; x.lineWidth = 1; x.strokeRect(m2X, m2
