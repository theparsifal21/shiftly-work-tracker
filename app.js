'use strict';
const $ = id => document.getElementById(id);
const KEY = 'shiftly-v1';
const defaults = { name: 'Gál Roland', rate: 2300, breakMinutes: 30, thresholdHours: 4.5, breakRuleVersion: 2, shifts: [{ id: 'sample-19', date: '2026-12-19', start: '13:30', end: '18:00', break: 0 }, { id: 'sample-29', date: '2026-12-29', start: '13:30', end: '18:00', break: 0 }, { id: 'sample-30', date: '2026-12-30', start: '13:30', end: '18:00', break: 0 }] };
let state;
try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (stored && Array.isArray(stored.shifts)) {
        state = { ...defaults, ...stored };
        // One-time upgrade from the previous 4-hour default. Keep any other custom threshold.
        if (Number(stored.breakRuleVersion || 1) < 2) {
            if (Number(stored.thresholdHours) === 4 && Number(stored.breakMinutes) === 30) {
                state.thresholdHours = 4.5;
                // Old automatic deductions for 4h01m–4h30m shifts are no longer applicable.
                // Existing breaks that differ from the previous automatic 30 minutes are preserved.
                state.shifts = state.shifts.map(s => {
                    const duration = s.end.split(':').reduce((a, v, i) => a + Number(v) * (i === 0 ? 60 : 1), 0) - s.start.split(':').reduce((a, v, i) => a + Number(v) * (i === 0 ? 60 : 1), 0);
                    return duration > 240 && duration <= 270 && Number(s.break) === 30 ? { ...s, break: 0 } : s;
                });
            }
            state.breakRuleVersion = 2;
            localStorage.setItem(KEY, JSON.stringify(state));
        }
    }
    else
        state = structuredClone(defaults);
}
catch {
    state = structuredClone(defaults);
}
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selected = new Date().toLocaleDateString('sv-SE'), editId = null, importCandidates = [], imageFiles = [], ocrWorker = null;
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const gross = s => { const d = minutes(s.end) - minutes(s.start); return d > 0 ? d : d < 0 ? d + 1440 : 0; };
const paid = s => Math.max(0, gross(s) - Number(s.break || 0));
const money = n => `${Math.round(n).toLocaleString('hu-HU')} Ft`;
const hrs = n => `${(n / 60).toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;
const monthShifts = () => state.shifts.filter(s => s.date.startsWith(`${month.getFullYear()}-${pad(month.getMonth() + 1)}`));
const ordered = ss => [...ss].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const autoBreak = (start, end) => gross({ start, end }) > state.thresholdHours * 60 ? state.breakMinutes : 0;
const persist = () => { try {
    localStorage.setItem(KEY, JSON.stringify(state));
}
catch {
    toast('Could not save. Browser storage is full or blocked; download a backup.');
} };
const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, undo) { const t = $('toast'); t.textContent = msg; if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => { undo(); t.classList.add('hidden'); };
    t.append(b);
} t.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), undo ? 6000 : 3300); }
function monthName() { return month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
function renderCalendar(el, large = false) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']; let html = '<div class="calendar-grid">' + labels.map(x => `<div class="weekday">${x}</div>`).join(''); for (let i = 0; i < Math.ceil((offset + count) / 7) * 7; i++) {
    const day = i - offset + 1, d = new Date(month.getFullYear(), month.getMonth(), day), key = dateKey(d), inMonth = d.getMonth() === month.getMonth(), ss = state.shifts.filter(s => s.date === key), sum = ss.reduce((n, s) => n + paid(s), 0);
    html += `<button class="day ${!inMonth ? 'outside' : ''} ${key === dateKey(new Date()) ? 'today' : ''} ${key === selected ? 'selected' : ''}" data-date="${key}" aria-label="${key}, ${ss.length} shifts"><span class="daynum">${d.getDate()}</span>${ss.length ? `<div class="daydots">${ss.map(() => '<i></i>').join('')}</div><div class="dayhours">${hrs(sum)}</div>` : ''}</button>`;
} el.innerHTML = html + '</div>'; el.querySelectorAll('[data-date]').forEach(b => b.addEventListener('click', () => { selected = b.dataset.date; const d = new Date(selected + 'T12:00:00'); month = new Date(d.getFullYear(), d.getMonth(), 1); if (!large) {
    showView('calendar');
} render(); })); }
function shiftItem(s) { const d = new Date(s.date + 'T12:00:00'); return `<div class="upcoming-item"><div class="date-tile"><strong>${d.getDate()}</strong><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></div><div class="shift-meta"><strong>${escapeHtml(s.start)} – ${escapeHtml(s.end)}</strong><small>${hrs(paid(s))} paid · ${s.break} min break</small></div><div class="pay">${money(paid(s) / 60 * state.rate)}</div></div>`; }
function render() { const ss = monthShifts(), total = ss.reduce((n, s) => n + paid(s), 0), all = ss.reduce((n, s) => n + gross(s), 0); $('monthHeading').textContent = monthName(); $('calendarHeading').textContent = monthName(); $('statPay').textContent = money(total / 60 * state.rate); const todayKey = dateKey(new Date()), done = ss.filter(s => s.date < todayKey).reduce((n, s) => n + paid(s), 0); $('statFoot').textContent = done ? `${money(done / 60 * state.rate)} earned so far` : 'Based on your hourly rate'; $('statHours').textContent = hrs(total); $('statCount').textContent = ss.length; $('statGross').textContent = hrs(all); $('sidebarName').textContent = state.name; renderCalendar($('miniCalendar')); renderCalendar($('bigCalendar'), true); const upcoming = ordered(state.shifts).filter(s => s.date >= dateKey(new Date())); $('upcomingList').innerHTML = upcoming.length ? upcoming.map(shiftItem).join('') : '<div class="empty">No upcoming shifts. Add one to see it here.</div>'; $('selectedHeading').textContent = `${new Date(selected + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`; const dayShifts = ordered(state.shifts.filter(s => s.date === selected)); $('selectedList').innerHTML = dayShifts.length ? dayShifts.map(s => `<div class="shift-row"><div class="shift-meta"><strong>${s.start} – ${s.end}</strong><small>${hrs(paid(s))} paid · ${s.break} min break</small></div><div class="pay">${money(paid(s) / 60 * state.rate)}</div><button class="action" data-edit="${escapeHtml(s.id)}">Edit</button><button class="action" data-delete="${escapeHtml(s.id)}">Delete</button></div>`).join('') : '<div class="empty">No shifts on this day.</div>'; $('shiftTable').innerHTML = ordered(state.shifts).map(s => `<tr><td>${s.date}</td><td>${s.start} – ${s.end}</td><td>${s.break} min</td><td>${hrs(paid(s))}</td><td>${money(paid(s) / 60 * state.rate)}</td><td><button class="action" data-edit="${escapeHtml(s.id)}">Edit</button><button class="action" data-delete="${escapeHtml(s.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No shifts yet.</td></tr>'; }
function showView(name) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== name + 'View')); document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === name)); const labels = { dashboard: ['Dashboard', 'Your shifts and earnings, all in one place.'], calendar: ['Calendar', 'Your workdays at a glance.'], shifts: ['All shifts', 'Manage your complete shift history.'], settings: ['Settings', 'Customize your pay and preferences.'] }; $('pageTitle').textContent = labels[name][0]; $('pageSubtitle').textContent = labels[name][1]; if (name === 'settings')
    fillSettings(); }
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }
function openShift(s = null, date = null) { editId = s?.id || null; $('shiftModalTitle').textContent = s ? 'Edit shift' : 'Add shift'; $('shiftDate').value = s?.date || date || dateKey(new Date()); $('shiftStart').value = s?.start || '06:00'; $('shiftEnd').value = s?.end || '13:00'; $('shiftBreak').value = s?.break ?? autoBreak('06:00', '13:00'); openModal('shiftModal'); }
$('shiftStart').addEventListener('change', setSuggestedBreak);
$('shiftEnd').addEventListener('change', setSuggestedBreak);
function setSuggestedBreak() { if (!editId)
    $('shiftBreak').value = autoBreak($('shiftStart').value, $('shiftEnd').value); }
$('shiftForm').addEventListener('submit', e => { e.preventDefault(); const date = $('shiftDate').value, start = $('shiftStart').value, end = $('shiftEnd').value, br = Number($('shiftBreak').value); if (!date || start === end || br < 0 || br >= gross({ start, end })) {
    toast('Check shift times and break length.');
    return;
} const s = { id: editId || crypto.randomUUID(), date, start, end, break: br }; if (editId)
    state.shifts = state.shifts.map(x => x.id === editId ? s : x);
else
    state.shifts.push(s); persist(); closeModal('shiftModal'); month = new Date(date + 'T12:00:00'); month.setDate(1); selected = date; render(); toast(editId ? 'Shift updated.' : 'Shift added.'); });
document.addEventListener('click', e => { const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]'); if (edit) {
    const s = state.shifts.find(s => s.id === edit.dataset.edit);
    if (s)
        openShift(s);
} if (del) {
    const s = state.shifts.find(s => s.id === del.dataset.delete);
    if (s) {
        const idx = state.shifts.indexOf(s);
        state.shifts = state.shifts.filter(x => x.id !== s.id);
        persist();
        render();
        toast('Shift deleted.', () => { state.shifts.splice(idx, 0, s); persist(); render(); });
    }
} const nav = e.target.closest('[data-goto]'); if (nav)
    showView(nav.dataset.goto); const close = e.target.closest('[data-close]'); if (close)
    closeModal(close.dataset.close); });
document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function changeMonth(n) { month = new Date(month.getFullYear(), month.getMonth() + n, 1); selected = dateKey(month); render(); }
$('prevMonth').onclick = () => changeMonth(-1);
$('nextMonth').onclick = () => changeMonth(1);
document.querySelector('[data-prev]').onclick = () => changeMonth(-1);
document.querySelector('[data-next]').onclick = () => changeMonth(1);
$('todayBtn').onclick = () => { const now = new Date(); month = new Date(now.getFullYear(), now.getMonth(), 1); selected = dateKey(now); render(); };
$('addBtn').onclick = () => openShift();
$('addSelected').onclick = () => openShift(null, selected);
function fillSettings() { $('employeeInput').value = state.name; $('rateInput').value = state.rate; $('breakInput').value = state.breakMinutes; $('thresholdInput').value = state.thresholdHours; }
$('saveSettings').onclick = () => { const name = $('employeeInput').value.trim(), rate = Number($('rateInput').value), br = Number($('breakInput').value), th = Number($('thresholdInput').value); if (!name || ![rate, br, th].every(Number.isFinite) || rate < 0 || br < 0 || th < 0) {
    toast('Enter valid settings.');
    return;
} Object.assign(state, { name, rate, breakMinutes: br, thresholdHours: th }); persist(); render(); toast('Settings saved. Existing shift breaks remain unchanged.'); };
function download(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
$('backupBtn').onclick = () => download('shiftly-backup.json', JSON.stringify(state, null, 2), 'application/json');
$('restoreBtn').onclick = () => $('backupInput').click();
$('backupInput').onchange = async (e) => { const file = e.target.files[0]; if (!file)
    return; try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.shifts) || typeof data.name !== 'string' || !data.shifts.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end) && Number.isFinite(Number(s.break))))
        throw Error();
    if (!confirm('Replace all current shifts and settings with this backup?'))
        return;
    state = { ...defaults, ...data };
    persist();
    render();
    fillSettings();
    toast('Backup restored.');
}
catch {
    toast('Invalid backup file.');
} e.target.value = ''; };
$('clearBtn').onclick = () => { if (confirm('Delete ALL shifts from this browser? This cannot be undone unless you have a backup.')) {
    state.shifts = [];
    persist();
    render();
    toast('All shifts deleted.');
} };
$('exportCsv').onclick = () => { const csv = [['Date', 'Start', 'End', 'Break (min)', 'Paid hours', 'Estimated pay (HUF)'], ...ordered(state.shifts).map(s => [s.date, s.start, s.end, s.break, (paid(s) / 60).toFixed(2), Math.round(paid(s) / 60 * state.rate)])].map(r => r.join(';')).join('\r\n'); download('shiftly-shifts.csv', '\ufeff' + csv, 'text/csv;charset=utf-8'); };
// OCR screenshot processing: recognize each visual row and use the column positions.
function normalize(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function parseTime(s) { const m = String(s).replace(/[Oo]/g, '0').match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})/); if (!m)
    return null; const [a, b, c, d] = m.slice(1).map(Number); if (a > 23 || c > 23 || b > 59 || d > 59)
    return null; return [pad(a) + ':' + pad(b), pad(c) + ':' + pad(d)]; }
function parseDate(s, yearHint = 2026) { const norm = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const mi = { jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sze: 9, okt: 10, nov: 11, dec: 12 }; let m = norm.match(/(20\d{2})\s*[.\s-]*\s*([a-z]{3,})\s*(\d{1,2})/); if (m && mi[m[2].slice(0, 3)] && +m[3] >= 1 && +m[3] <= 31)
    return `${m[1]}-${pad(mi[m[2].slice(0, 3)])}-${pad(+m[3])}`; const t = s.replace(/\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]\s*\d{1,2}\s*[:.]\s*\d{2}/g, ' '); m = t.match(/(20\d{2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
    return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`; m = t.match(/\b(\d{1,2})\s*[.\/-]\s*(\d{1,2})\b/); if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31)
    return `${yearHint}-${pad(+m[1])}-${pad(+m[2])}`; return null; }
function lev(a, b) { const d = [...Array(b.length + 1).keys()]; for (let i = 1; i <= a.length; i++) {
    let p = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1));
        p = t;
    }
} return d[b.length]; }
// Tolerates one OCR typo per name part (e.g. "Rolanc", "Gal Rolane").
function isEmployee(s) { const parts = state.name.trim().split(/\s+/).map(normalize).filter(Boolean); if (parts.length < 2)
    return false; const n = normalize(s), toks = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return parts.every(p => n.includes(p) || (p.length >= 4 && toks.some(t => Math.abs(t.length - p.length) <= 1 && lev(t, p) <= 1))); }
// Weekday printed in the schedule (hétfő, kedd...) lets us catch misread dates.
function weekdayOf(s) { const n = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const map = [['vas', 0], ['het', 1], ['ked', 2], ['szer', 3], ['csu', 4], ['pen', 5], ['szom', 6]]; for (const w of n.split(/[^a-z]+/))
    for (const [p, d] of map)
        if (w.startsWith(p))
            return d; return null; }
function collectRows(data) { const words = data?.words || []; let lines = []; if (words.length) {
    const valid = words.filter(w => w.text?.trim() && w.bbox);
    valid.sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2));
    const medianH = valid.length ? valid.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)[Math.floor(valid.length / 2)] : 14;
    for (const w of valid) {
        const y = (w.bbox.y0 + w.bbox.y1) / 2;
        let row = lines.find(r => Math.abs(r.y - y) < Math.max(5, medianH * .58));
        if (!row) {
            row = { y, words: [] };
            lines.push(row);
        }
        row.words.push(w);
    }
    lines = lines.map(r => ({ y: r.y, words: r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0) })).sort((a, b) => a.y - b.y);
} return lines; }
function extractCandidates(data) {
    const lines = collectRows(data);
    let out = [];
    for (const line of lines) {
        const words = line.words, all = words.map(w => w.text).join(' ');
        if (!isEmployee(all))
            continue;
        const firstX = Math.min(...words.map(w => w.bbox.x0)), lastX = Math.max(...words.map(w => w.bbox.x1)), width = lastX - firstX;
        let time = parseTime(all), date = parseDate(all);
        if (time && date)
            out.push({ date, start: time[0], end: time[1], break: autoBreak(...time), checked: true });
    }
    // Fallback for OCR engines that provide lines but no word bounding boxes.
    if (!out.length) {
        const text = data?.text || '';
        const raw = text.split(/\r?\n/);
        for (let i = 0; i < raw.length; i++) {
            if (!isEmployee(raw[i]))
                continue;
            const nearby = raw.slice(Math.max(0, i - 1), Math.min(raw.length, i + 2)).join(' ');
            const date = parseDate(nearby), time = parseTime(nearby);
            if (date && time)
                out.push({ date, start: time[0], end: time[1], break: autoBreak(...time), checked: true });
        }
    }
    const unique = new Map();
    for (const s of out)
        unique.set(`${s.date}|${s.start}|${s.end}`, s);
    return [...unique.values()];
}
async function loadTesseract() { if (window.Tesseract)
    return; await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = resolve; s.onerror = () => reject(Error('Could not load OCR library. Check your internet connection.')); document.head.append(s); }); }
const IMPORT_ONLY_MINUTES = null; // screenshot import keeps only shifts of exactly this length (4h30m); set to null to accept all
async function prepImage(file) { try {
    const bmp = await createImageBitmap(file);
    const f = Math.min(4, Math.max(2, Math.ceil(1800 / bmp.width)));
    const c = document.createElement('canvas');
    c.width = bmp.width * f;
    c.height = bmp.height * f;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.filter = 'grayscale(1) contrast(1.4)';
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
}
catch {
    return file;
} }
function getWords(d) { if (d?.words?.length)
    return d.words; const w = []; for (const b of d?.blocks || [])
    for (const p of b.paragraphs || [])
        for (const l of p.lines || [])
            for (const x of l.words || [])
                w.push(x); return w; }
async function toCanvas(file) { const bmp = await createImageBitmap(file); const f = Math.min(4, Math.max(2, Math.ceil(1800 / bmp.width))); const c = document.createElement('canvas'); c.width = bmp.width * f; c.height = bmp.height * f; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height); return c; }
// 'red' keeps purple time text readable; 'lum' keeps dark names on green readable. One grayscale cannot do both.
function toChannel(src, mode, x0 = 0) { const w = src.width - x0, h = src.height, c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); cx.drawImage(src, x0, 0, w, h, 0, 0, w, h); const im = cx.getImageData(0, 0, w, h), d = im.data; for (let i = 0; i < d.length; i += 4) {
    const v = mode === 'red' ? d[i] : .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = v;
} cx.putImageData(im, 0, 0); return c; }
function strip(src, y, h) { const sy = Math.max(0, Math.round(y - h * 1.1)), sh = Math.min(src.height - sy, Math.round(h * 2.2)), c = document.createElement('canvas'); c.width = src.width + 80; c.height = sh + 80; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(src, 0, sy, src.width, sh, 40, 40, src.width, sh); return c; }
async function ocr(img, psm) { await ocrWorker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: '1' }); return (await ocrWorker.recognize(img, {}, { text: true, blocks: true })).data; }
async function scanImage(file) { const base = await toCanvas(file), red = toChannel(base, 'red'); const d1 = await ocr(red, 6); const rows1 = collectRows({ words: getWords(d1) }); const xs = getWords(d1).filter(w => w.bbox && /\d[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}/.test(w.text || '')).map(w => w.bbox.x1).sort((a, b) => a - b); const edge = xs.length ? xs[xs.length >> 1] : Math.round(base.width * .66); const d2 = await ocr(toChannel(base, 'lum', edge), 6); const rows = collectRows({ words: getWords(d2) }).filter(r => isEmployee(r.words.map(w => w.text).join(' '))); const out = []; for (const r of rows) {
    const h = Math.max(...r.words.map(w => w.bbox.y1 - w.bbox.y0));
    const t = (await ocr(strip(red, r.y, h), 7)).text || '';
    const near = rows1.reduce((a, b) => !a || Math.abs(b.y - r.y) < Math.abs(a.y - r.y) ? b : a, null);
    const time = parseTime(t), date = parseDate(t) || (near && Math.abs(near.y - r.y) < h ? parseDate(near.words.map(w => w.text).join(' ')) : null);
    if (time && date) {
        const wd = weekdayOf(t.split(/\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]/)[0]), bad = wd != null && new Date(date + 'T12:00').getDay() !== wd;
        out.push({ date, start: time[0], end: time[1], break: autoBreak(...time), checked: !bad, warn: bad });
    }
} return out.concat(extractCandidates({ ...d1, words: getWords(d1) })); }
async function scan() { if (!imageFiles.length)
    return; const total = imageFiles.length; $('ocrStatus').textContent = 'Loading OCR engine…'; $('ocrProgress').style.width = '5%'; $('confirmImport').disabled = true; $('importRows').innerHTML = ''; importCandidates = []; let n = 0, skipped = 0; try {
    await loadTesseract();
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
    }
    ocrWorker = await Tesseract.createWorker('hun+eng', 1, { logger: m => { if (m.status === 'recognizing text') {
            $('ocrStatus').textContent = `Reading image ${n + 1} of ${total}… ${Math.round(m.progress * 100)}%`;
            $('ocrProgress').style.width = `${Math.round((n + m.progress) / total * 100)}%`;
        } } });
    await ocrWorker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const seen = new Set();
    for (; n < total; n++) {
        const found = await scanImage(imageFiles[n]);
        for (const c of found) {
            if (IMPORT_ONLY_MINUTES && gross(c) !== IMPORT_ONLY_MINUTES) {
                skipped++;
                continue;
            }
            const k = `${c.date}|${c.start}|${c.end}`;
            if (!seen.has(k)) {
                seen.add(k);
                importCandidates.push(c);
            }
        }
    }
    importCandidates.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    $('ocrProgress').style.width = '100%';
    $('ocrStatus').textContent = importCandidates.length ? `Found ${importCandidates.length} matching shift(s) in ${total} image(s)${skipped ? `; ${skipped} not 4h30m skipped` : ''}. Review before importing${importCandidates.some(c => c.warn) ? '. ⚠ marks dates that do not match the weekday in the picture' : ''}.` : `No 4h30m shifts found in ${total} image(s)${skipped ? ` (${skipped} other length skipped)` : ''}. Try clearer screenshots or add shifts manually.`;
    renderImport();
}
catch (e) {
    console.error(e);
    $('ocrStatus').textContent = `OCR error on image ${n + 1} of ${total}: ` + e.message;
    toast('Could not scan screenshots.');
}
finally {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
    }
} }
function renderImport() { $('importRows').innerHTML = importCandidates.map((s, i) => `<div class="import-row"><input type="checkbox" data-import-check="${i}" ${s.checked ? 'checked' : ''} aria-label="Import shift ${i + 1}"><input type="date" data-import-date="${i}" value="${s.date}"><input type="time" data-import-start="${i}" value="${s.start}"><input type="time" data-import-end="${i}" value="${s.end}">${s.warn ? '<span title="Weekday does not match this date. Please check.">⚠</span>' : ''}<button class="action" data-import-remove="${i}">×</button></div>`).join('') || '<p class="hint">Nothing to import. OCR may have missed the employee name or dates.</p>'; $('confirmImport').disabled = !importCandidates.some(s => s.checked); }
$('importRows').addEventListener('change', e => { const el = e.target; let i; if (el.hasAttribute('data-import-check')) {
    i = +el.dataset.importCheck;
    importCandidates[i].checked = el.checked;
}
else if (el.hasAttribute('data-import-date')) {
    i = +el.dataset.importDate;
    importCandidates[i].date = el.value;
}
else if (el.hasAttribute('data-import-start')) {
    i = +el.dataset.importStart;
    importCandidates[i].start = el.value;
    importCandidates[i].break = autoBreak(importCandidates[i].start, importCandidates[i].end);
}
else if (el.hasAttribute('data-import-end')) {
    i = +el.dataset.importEnd;
    importCandidates[i].end = el.value;
    importCandidates[i].break = autoBreak(importCandidates[i].start, importCandidates[i].end);
} $('confirmImport').disabled = !importCandidates.some(s => s.checked); });
$('importRows').addEventListener('click', e => { if (e.target.hasAttribute('data-import-remove')) {
    importCandidates.splice(+e.target.dataset.importRemove, 1);
    renderImport();
} });
$('confirmImport').onclick = () => { const picked = importCandidates.filter(s => s.checked); if (picked.some(s => !s.date || s.end === s.start)) {
    toast('Fix invalid dates or times before importing.');
    return;
} let added = 0; for (const s of picked) {
    if (state.shifts.some(x => x.date === s.date && x.start === s.start && x.end === s.end))
        continue;
    state.shifts.push({ id: crypto.randomUUID(), date: s.date, start: s.start, end: s.end, break: s.break });
    added++;
} persist(); if (picked.length) {
    const d = new Date(picked[0].date + 'T12:00:00');
    month = new Date(d.getFullYear(), d.getMonth(), 1);
} render(); closeModal('importModal'); toast(`${added} shift(s) imported. ${picked.length - added} duplicate(s) skipped.`); };
$('uploadBtn').onclick = () => $('imageInput').click();
$('imageInput').onchange = async (e) => { const files = [...e.target.files].filter(f => f.type.startsWith('image/')); e.target.value = ''; if (!files.length) {
    toast('Please upload image files.');
    return;
} imageFiles = files; importCandidates = []; if ($('imagePreview').src.startsWith('blob:'))
    URL.revokeObjectURL($('imagePreview').src); $('imagePreview').src = URL.createObjectURL(files[0]); $('importRows').innerHTML = ''; openModal('importModal'); await scan(); };
$('retryOcr').onclick = scan;
document.addEventListener('keydown', e => { if (e.key === 'Escape')
    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => closeModal(m.id)); });
render();
