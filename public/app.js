'use strict';
/* =====================================================
   Revive — front-end controller
   Client pre-scales images to ≤1200px before sending
   (keeps under Vercel's 4.5 MB body limit)
   ===================================================== */

const $ = id => document.getElementById(id);

// ── elements ──────────────────────────────────────────
const dz        = $('dz');
const fileIn    = $('file-in');
const dzIdle    = $('dz-idle');
const dzFilled  = $('dz-filled');
const dzThumb   = $('dz-thumb');
const dzName    = $('dz-name');
const dzChange  = $('dz-change');
const runBtn    = $('run-btn');
const runIdle   = $('run-idle');
const runBusy   = $('run-busy');
const emptyState = $('empty-state');
const resultPanel = $('result-panel');
const dlBtn     = $('dl-btn');

// compare
const cmpStage  = $('cmp-stage');
const cmpBefore = $('cmp-before');
const cmpAfter  = $('cmp-after');
const cmpHandle = $('cmp-handle');
const tagL      = $('tag-l');
const tagR      = $('tag-r');

// split
const spA       = $('sp-a');
const spB       = $('sp-b');
const spCapA    = $('sp-cap-a');
const spCapB    = $('sp-cap-b');

// tabs
const vsCmp     = $('vs-compare');
const vsSpl     = $('vs-split');
const viewCmp   = $('view-cmp');
const viewSpl   = $('view-split');

// metrics
const metricsEl = $('metrics');

let blob = null;
let cPos = 0.5;

// ── slider readouts ────────────────────────────────────
[
  ['s-dn','o-dn', v => v],
  ['s-cl','o-cl', v => (+v).toFixed(1)],
  ['s-sc','o-sc', v => v],
  ['s-sh','o-sh', v => (+v).toFixed(1)],
].forEach(([sid, oid, fmt]) => {
  const s = $(sid), o = $(oid);
  s.addEventListener('input', () => { o.value = fmt(s.value); });
  o.value = fmt(s.value);
});

// ── dropzone ───────────────────────────────────────────
dz.addEventListener('click', e => {
  if (dzChange && (e.target === dzChange || dzChange.contains(e.target))) return;
  fileIn.click();
});
dz.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); }
});
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]);
});
fileIn.addEventListener('change', e => { if (e.target.files[0]) pick(e.target.files[0]); });
dzChange.addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });

function pick(file) {
  if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
  preScale(file, 1200, 0.9).then(b => {
    blob = b;
    dzName.textContent = file.name;
    dzThumb.src = URL.createObjectURL(b);
    dzIdle.hidden   = true;
    dzFilled.hidden = false;
    runBtn.disabled = false;
  });
}

function preScale(file, maxPx, q) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxPx) {
        const s = maxPx / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), 'image/jpeg', q);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ── run ────────────────────────────────────────────────
runBtn.addEventListener('click', async () => {
  if (!blob) return;
  setLoading(true);

  const fd = new FormData();
  fd.append('image',    blob, 'photo.jpg');
  fd.append('restore',  $('opt-restore').checked ? '1' : '0');
  fd.append('colorize', $('opt-color').checked   ? '1' : '0');
  fd.append('simulate', $('opt-sim').checked     ? '1' : '0');
  fd.append('denoise',  $('s-dn').value);
  fd.append('clip',     $('s-cl').value);
  fd.append('scratch',  $('s-sc').value);
  fd.append('sharp',    $('s-sh').value);

  try {
    const res  = await fetch('/process', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server error');
    show(data);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    setLoading(false);
  }
});

function setLoading(on) {
  runBtn.disabled = on;
  runIdle.hidden  = on;
  runBusy.hidden  = !on;
}

// ── show result ────────────────────────────────────────
function show(d) {
  const isSimulate = $('opt-sim').checked;
  const beforeLbl  = isSimulate ? 'Damaged' : 'Original';
  const afterLbl   = d.output_is_color ? 'Restored & colorized' : 'Restored';

  // colorize banner
  const banner = $('no-color-banner');
  if (banner) banner.hidden = d.colorize_available;

  // compare
  cmpBefore.style.backgroundImage = `url("${d.input_image}")`;
  cmpAfter.style.backgroundImage  = `url("${d.output_image}")`;
  tagL.textContent = beforeLbl;
  tagR.textContent = afterLbl;
  setPos(0.5);

  // split
  spA.src = d.input_image;
  spB.src = d.output_image;
  spCapA.textContent = beforeLbl;
  spCapB.textContent = afterLbl;

  // download
  dlBtn.href     = d.download_url;
  dlBtn.download = d.output_is_color ? 'revived_color.png' : 'revived.png';

  // metrics
  if (d.metrics) {
    const m = d.metrics;
    $('mc-pb').textContent = m.psnr_before;
    $('mc-pa').textContent = m.psnr_after;
    $('mc-sb').textContent = m.ssim_before;
    $('mc-sa').textContent = m.ssim_after;
    setDelta($('mc-dp'), m.psnr_delta, ' dB');
    setDelta($('mc-ds'), m.ssim_delta, '');
    metricsEl.hidden = false;
  } else {
    metricsEl.hidden = true;
  }

  emptyState.hidden   = true;
  resultPanel.hidden  = false;
  if (window.innerWidth < 900) resultPanel.scrollIntoView({ behavior: 'smooth' });
}

function setDelta(el, v, unit) {
  if (v == null) { el.textContent = ''; return; }
  el.textContent = (v > 0 ? '+' : '') + v + unit;
  el.classList.toggle('neg', v < 0);
}

// ── compare drag ───────────────────────────────────────
function setPos(p) {
  cPos = Math.max(0, Math.min(1, p));
  cmpBefore.style.clipPath = `inset(0 ${100 - cPos*100}% 0 0)`;
  cmpHandle.style.left = `${cPos*100}%`;
}

let dragging = false;
cmpHandle.addEventListener('mousedown',  e => { dragging = true; e.preventDefault(); });
cmpHandle.addEventListener('touchstart', e => { dragging = true; e.preventDefault(); }, { passive: false });
window.addEventListener('mouseup',  () => dragging = false);
window.addEventListener('touchend', () => dragging = false);
window.addEventListener('mousemove', e => { if (dragging) movePos(e.clientX); });
window.addEventListener('touchmove', e => { if (dragging) movePos(e.touches[0].clientX); }, { passive: false });

function movePos(cx) {
  const r = cmpStage.getBoundingClientRect();
  setPos((cx - r.left) / r.width);
}
cmpStage.addEventListener('mousedown', e => {
  if (cmpHandle.contains(e.target)) return;
  movePos(e.clientX); dragging = true;
});

// ── view tabs ──────────────────────────────────────────
vsCmp.addEventListener('click', () => setView('compare'));
vsSpl.addEventListener('click', () => setView('split'));

function setView(v) {
  const split = v === 'split';
  vsCmp.classList.toggle('active', !split);
  vsSpl.classList.toggle('active',  split);
  viewCmp.hidden = split;
  viewSpl.hidden = !split;
}
