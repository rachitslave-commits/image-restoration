'use strict';
/* =====================================================
   Revive — photo restoration front-end
   Key Vercel constraint: max 4.5 MB request body.
   We pre-scale the image on the client to ≤ 1200px
   and re-encode as JPEG ≤ 90% quality before sending.
   ===================================================== */

const $ = id => document.getElementById(id);

// elements
const dz        = $('dz');
const fileIn    = $('file-in');
const dzEmpty   = $('dz-empty');
const dzFilled  = $('dz-filled');
const dzThumb   = $('dz-thumb');
const dzName    = $('dz-name');
const dzChange  = $('dz-change');
const runBtn    = $('run');
const runLbl    = $('run-lbl');
const runSpin   = $('run-spin');
const empty     = $('empty');
const result    = $('result');
const dlBtn     = $('dl');
const stage     = $('stage');
const layBefore = $('lay-before');
const layAfter  = $('lay-after');
const handle    = $('handle');
const lblL      = $('lbl-l');
const lblR      = $('lbl-r');
const spBefore  = $('sp-before');
const spAfter   = $('sp-after');
const spCapL    = $('sp-cap-l');
const spCapR    = $('sp-cap-r');
const metrics   = $('metrics');
const vtCompare = $('vt-compare');
const vtSplit   = $('vt-split');
const viewCmp   = $('view-compare');
const viewSpl   = $('view-split');

let selectedBlob = null;
let cPos = 0.5;

/* ── slider readouts ── */
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

/* ── dropzone ── */
dz.addEventListener('click', e => {
  if (e.target === dzChange || dzChange.contains(e.target)) return;
  fileIn.click();
});
dz.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); }
});
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
});
fileIn.addEventListener('change', e => { if (e.target.files[0]) pickFile(e.target.files[0]); });
dzChange.addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });

function pickFile(file) {
  if (!file.type.startsWith('image/')) { alert('Please choose a JPG or PNG image.'); return; }
  // Pre-scale on canvas to keep under Vercel's 4.5 MB body limit
  preScale(file, 1200, 0.88).then(blob => {
    selectedBlob = blob;
    dzName.textContent = file.name;
    dzThumb.src = URL.createObjectURL(blob);
    dzEmpty.hidden  = true;
    dzFilled.hidden = false;
    runBtn.disabled = false;
  });
}

function preScale(file, maxPx, quality) {
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
      c.toBlob(b => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/* ── run ── */
runBtn.addEventListener('click', async () => {
  if (!selectedBlob) return;
  busy(true);

  const fd = new FormData();
  fd.append('image',    selectedBlob, 'photo.jpg');
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
    render(data);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    busy(false);
  }
});

function busy(on) {
  runBtn.disabled = on;
  runLbl.hidden   = on;
  runSpin.hidden  = !on;
}

/* ── render result ── */
function render(d) {
  // update colorize banner
  const banner = $('no-color-banner');
  if (banner) banner.hidden = d.colorize_available;

  const beforeLbl = $('opt-sim').checked ? 'Damaged' : 'Original';
  const afterLbl  = d.output_is_color ? 'Restored & colorized' : 'Restored';

  // compare layers
  layBefore.style.backgroundImage = `url("${d.input_image}")`;
  layAfter.style.backgroundImage  = `url("${d.output_image}")`;
  lblL.textContent = beforeLbl;
  lblR.textContent = afterLbl;
  setPos(0.5);

  // split
  spBefore.src = d.input_image;
  spAfter.src  = d.output_image;
  spCapL.textContent = beforeLbl;
  spCapR.textContent = afterLbl;

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
    delta($('mc-dp'), m.psnr_delta, ' dB');
    delta($('mc-ds'), m.ssim_delta, '');
    metrics.hidden = false;
  } else {
    metrics.hidden = true;
  }

  empty.hidden  = true;
  result.hidden = false;
  if (window.innerWidth < 860) result.scrollIntoView({ behavior: 'smooth' });
}

function delta(el, v, unit) {
  if (v == null) { el.textContent = ''; return; }
  el.textContent = (v > 0 ? '+' : '') + v + unit;
  el.classList.toggle('neg', v < 0);
}

/* ── compare handle ── */
function setPos(p) {
  cPos = Math.max(0, Math.min(1, p));
  layBefore.style.clipPath = `inset(0 ${100 - cPos*100}% 0 0)`;
  handle.style.left = `${cPos*100}%`;
}

let drag = false;
handle.addEventListener('mousedown',  e => { drag = true; e.preventDefault(); });
handle.addEventListener('touchstart', e => { drag = true; e.preventDefault(); }, { passive: false });
window.addEventListener('mouseup',  () => drag = false);
window.addEventListener('touchend', () => drag = false);
window.addEventListener('mousemove', e => { if (drag) move(e.clientX); });
window.addEventListener('touchmove', e => { if (drag) move(e.touches[0].clientX); }, { passive: false });

function move(cx) {
  const r = stage.getBoundingClientRect();
  setPos((cx - r.left) / r.width);
}
stage.addEventListener('mousedown', e => {
  if (handle.contains(e.target)) return;
  move(e.clientX); drag = true;
});

/* ── view tabs ── */
vtCompare.addEventListener('click', () => switchView('compare'));
vtSplit.addEventListener('click',   () => switchView('split'));

function switchView(v) {
  const isSplit = v === 'split';
  vtCompare.classList.toggle('on', !isSplit);
  vtSplit.classList.toggle('on',    isSplit);
  viewCmp.hidden = isSplit;
  viewSpl.hidden = !isSplit;
}
