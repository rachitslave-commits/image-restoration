'use strict';
/* ======================================================
   Revive — front-end controller
   ====================================================== */

const $  = (id) => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);

/* ---- elements ---- */
const dropzone    = $('dropzone');
const fileInput   = $('file-input');
const dzIdle      = $('dz-idle');
const dzPreview   = $('dz-preview');
const dzThumb     = $('dz-thumb');
const dzFname     = $('dz-fname');
const dzChange    = $('dz-change');
const runBtn      = $('run-btn');
const runIdle     = qs('.run-idle',    runBtn);
const runLoading  = qs('.run-loading', runBtn);

const optRestore  = $('opt-restore');
const optColor    = $('opt-color');
const optSimulate = $('opt-simulate');

const emptyPh     = $('empty-placeholder');
const resultPanel = $('result-panel');
const dlBtn       = $('dl-btn');

// compare
const cstage      = $('cstage');
const cBefore     = $('c-before');
const cAfter      = $('c-after');
const chandle     = $('chandle');
const cTagL       = $('c-tag-l');
const cTagR       = $('c-tag-r');

// split
const spBefore    = $('sp-before');
const spAfter     = $('sp-after');
const spCapL      = $('sp-cap-l');
const spCapR      = $('sp-cap-r');

// view tabs
const tabCompare  = $('tab-compare');
const tabSplit    = $('tab-split');
const viewCompare = $('view-compare');
const viewSplit   = $('view-split');

// metrics
const metricsPanel = $('metrics-panel');

let selectedFile = null;
let cPos = 0.5;   // compare divider 0..1


/* ======================================================
   SLIDER VALUE READOUTS
   ====================================================== */
[
  ['s-denoise', 'o-denoise', v => v],
  ['s-clip',    'o-clip',    v => (+v).toFixed(1)],
  ['s-scratch', 'o-scratch', v => v],
  ['s-sharp',   'o-sharp',   v => (+v).toFixed(1)],
].forEach(([sid, oid, fmt]) => {
  const s = $(sid), o = $(oid);
  s.addEventListener('input', () => { o.value = fmt(s.value); });
  o.value = fmt(s.value);
});


/* ======================================================
   DROPZONE
   ====================================================== */
dropzone.addEventListener('click', (e) => {
  if (e.target === dzChange || dzChange.contains(e.target)) return;
  fileInput.click();
});
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault(); dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) setFile(e.target.files[0]); });
dzChange.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

function setFile(file) {
  if (!file.type.startsWith('image/')) { alert('Please choose a JPG, PNG, or WEBP image.'); return; }
  selectedFile = file;
  dzFname.textContent = file.name;
  dzThumb.src = URL.createObjectURL(file);
  dzIdle.hidden    = true;
  dzPreview.hidden = false;
  runBtn.disabled  = false;
}


/* ======================================================
   RUN
   ====================================================== */
runBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  setLoading(true);

  const fd = new FormData();
  fd.append('image',    selectedFile);
  fd.append('restore',  optRestore.checked  ? '1' : '0');
  fd.append('colorize', optColor.checked    ? '1' : '0');
  fd.append('simulate', optSimulate.checked ? '1' : '0');
  fd.append('denoise',  $('s-denoise').value);
  fd.append('clip',     $('s-clip').value);
  fd.append('scratch',  $('s-scratch').value);
  fd.append('sharp',    $('s-sharp').value);

  try {
    const res  = await fetch('/process', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server error');
    showResult(data);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    setLoading(false);
  }
});

function setLoading(on) {
  runBtn.disabled  = on;
  runIdle.hidden   = on;
  runLoading.hidden = !on;
}


/* ======================================================
   SHOW RESULT
   ====================================================== */
function showResult(d) {
  const beforeLabel = optSimulate.checked ? 'Damaged' : 'Original';
  const afterLabel  = d.output_is_color   ? 'Restored & colorized' : 'Restored';

  // compare layers
  cBefore.style.backgroundImage = `url("${d.input_image}")`;
  cAfter.style.backgroundImage  = `url("${d.output_image}")`;
  cTagL.textContent = beforeLabel;
  cTagR.textContent = afterLabel;
  setComparePos(0.5);

  // split
  spBefore.src          = d.input_image;
  spAfter.src           = d.output_image;
  spCapL.textContent    = beforeLabel;
  spCapR.textContent    = afterLabel;

  // download (lossless PNG)
  dlBtn.href     = d.download_url;
  dlBtn.download = d.output_is_color ? 'revived_color.png' : 'revived.png';

  // metrics
  if (d.metrics) {
    const m = d.metrics;
    $('mc-pb').textContent = m.psnr_before;
    $('mc-pa').textContent = m.psnr_after;
    $('mc-sb').textContent = m.ssim_before;
    $('mc-sa').textContent = m.ssim_after;
    setDelta($('mc-dpsnr'), m.psnr_delta, ' dB');
    setDelta($('mc-dssim'), m.ssim_delta, '');
    metricsPanel.hidden = false;
  } else {
    metricsPanel.hidden = true;
  }

  // reveal panel
  emptyPh.hidden     = true;
  resultPanel.hidden = false;

  // scroll into view on mobile
  if (window.innerWidth < 900) resultPanel.scrollIntoView({ behavior: 'smooth' });
}

function setDelta(el, v, unit) {
  if (v == null) { el.textContent = ''; return; }
  const sign = v > 0 ? '+' : '';
  el.textContent = `${sign}${v}${unit}`;
  el.classList.toggle('neg', v < 0);
}


/* ======================================================
   COMPARE SLIDER
   ====================================================== */
function setComparePos(p) {
  cPos = Math.max(0, Math.min(1, p));
  const pct = cPos * 100;
  cBefore.style.clipPath   = `inset(0 ${100 - pct}% 0 0)`;
  chandle.style.left = `${pct}%`;
}

let dragging = false;
chandle.addEventListener('mousedown',  (e) => { dragging = true; e.preventDefault(); });
chandle.addEventListener('touchstart', (e) => { dragging = true; e.preventDefault(); }, { passive: false });
window.addEventListener('mouseup',  () => dragging = false);
window.addEventListener('touchend', () => dragging = false);

function handleMove(clientX) {
  if (!dragging) return;
  const r = cstage.getBoundingClientRect();
  setComparePos((clientX - r.left) / r.width);
}
window.addEventListener('mousemove',  (e) => handleMove(e.clientX));
window.addEventListener('touchmove',  (e) => handleMove(e.touches[0].clientX), { passive: false });

// click anywhere on stage to jump handle
cstage.addEventListener('mousedown', (e) => {
  if (e.target === chandle || chandle.contains(e.target)) return;
  const r = cstage.getBoundingClientRect();
  setComparePos((e.clientX - r.left) / r.width);
  dragging = true;
});


/* ======================================================
   VIEW TABS
   ====================================================== */
tabCompare.addEventListener('click', () => setView('compare'));
tabSplit.addEventListener('click',   () => setView('split'));

function setView(v) {
  const isSplit = v === 'split';
  tabCompare.classList.toggle('active', !isSplit);
  tabSplit.classList.toggle('active',    isSplit);
  tabCompare.setAttribute('aria-selected', String(!isSplit));
  tabSplit.setAttribute('aria-selected',   String(isSplit));
  viewCompare.hidden = isSplit;
  viewSplit.hidden   = !isSplit;
}
