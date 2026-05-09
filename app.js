/* ─── Pixshift — app.js ─── */

const RESOLUTIONS = [
  { label: 'Original', sub: 'keep as-is',  w: null,  h: null  },
  { label: '320×240',  sub: 'QVGA',        w: 320,   h: 240   },
  { label: '480p',     sub: '854×480',      w: 854,   h: 480   },
  { label: '640×480',  sub: 'VGA',         w: 640,   h: 480   },
  { label: '720p',     sub: '1280×720',     w: 1280,  h: 720   },
  { label: '800×600',  sub: 'SVGA',        w: 800,   h: 600   },
  { label: '1080p',    sub: '1920×1080',   w: 1920,  h: 1080  },
  { label: '1440p',    sub: '2560×1440',   w: 2560,  h: 1440  },
  { label: '2048p',    sub: '2048×1536',   w: 2048,  h: 1536  },
  { label: '4K UHD',   sub: '3840×2160',   w: 3840,  h: 2160  },
];

const QUALITY_LABELS = {
  10: 'Minimum', 30: 'Low', 50: 'Medium',
  60: 'Web optimised', 75: 'Good', 80: 'High',
  90: 'Very high', 92: 'Near lossless', 95: 'Excellent', 100: 'Lossless'
};

let files = [];
let selectedRes = 0;

/* ─── Build Resolution Grid ─── */
function buildResGrid() {
  const grid = document.getElementById('res-grid');
  grid.innerHTML = '';
  RESOLUTIONS.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.className = 'res-btn' + (i === 0 ? ' active' : '');
    btn.innerHTML = `<span class="res-name">${r.label}</span><span class="res-dims">${r.sub}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRes = i;
    };
    grid.appendChild(btn);
  });
}
buildResGrid();

/* ─── Quality Label ─── */
function updateQuality(val) {
  const v = parseInt(val);
  let label = Object.entries(QUALITY_LABELS)
    .reverse()
    .find(([k]) => v >= parseInt(k));
  const tag = label ? label[1] : 'Low';
  document.getElementById('q-label').textContent = `${v} — ${tag}`;
}

/* ─── Drag & Drop ─── */
function handleDrag(e, on) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.toggle('drag-over', on);
}

function handleDrop(e) {
  e.preventDefault();
  handleDrag(e, false);
  handleFiles(e.dataTransfer.files);
}

/* ─── File Handling ─── */
function fmt(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getExt(name) {
  return name.split('.').pop().toUpperCase();
}

function handleFiles(flist) {
  Array.from(flist).forEach(f => {
    if (!files.find(x => x.name === f.name && x.size === f.size)) {
      files.push(f);
    }
  });
  renderFileList();
  const panel = document.getElementById('options-panel');
  if (files.length) panel.classList.remove('hidden');
}

function removeFile(i) {
  files.splice(i, 1);
  renderFileList();
  if (!files.length) {
    document.getElementById('options-panel').classList.add('hidden');
    document.getElementById('results').innerHTML = '';
  }
}

function clearAll() {
  files = [];
  document.getElementById('file-list').innerHTML = '';
  document.getElementById('options-panel').classList.add('hidden');
  document.getElementById('results').innerHTML = '';
}

function renderFileList() {
  const el = document.getElementById('file-list');
  el.innerHTML = '';
  files.forEach((f, i) => {
    const isImg = f.type.startsWith('image/');
    const isVid = f.type.startsWith('video/');
    const ext = getExt(f.name);

    const card = document.createElement('div');
    card.className = 'file-card';
    card.id = 'fcard-' + i;

    let thumbHtml = `<div class="file-thumb"><span class="ext-label">${ext}</span></div>`;
    if (isImg) {
      const url = URL.createObjectURL(f);
      thumbHtml = `<div class="file-thumb"><img src="${url}" alt="preview" onload="URL.revokeObjectURL(this.src)"></div>`;
    } else if (isVid) {
      const url = URL.createObjectURL(f);
      thumbHtml = `<div class="file-thumb"><video src="${url}" muted playsinline></video></div>`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="file-info">
        <p class="file-name" title="${f.name}">${f.name}</p>
        <p class="file-meta">${fmt(f.size)} &middot; ${f.type || ext}</p>
        <div class="file-progress" id="prog-${i}">
          <div class="file-progress-fill" id="progf-${i}" style="width:0%"></div>
        </div>
      </div>
      <span class="status-badge" id="status-${i}">Ready</span>
      <button class="remove-btn" onclick="removeFile(${i})" aria-label="Remove file" title="Remove">✕</button>
    `;
    el.appendChild(card);
  });
}

/* ─── Status Helpers ─── */
function setStatus(i, type, text) {
  const el = document.getElementById('status-' + i);
  if (el) { el.className = 'status-badge ' + type; el.textContent = text; }
}
function showProg(i, show) {
  const el = document.getElementById('prog-' + i);
  if (el) el.style.display = show ? 'block' : 'none';
}
function setProg(i, pct) {
  const el = document.getElementById('progf-' + i);
  if (el) el.style.width = Math.round(pct) + '%';
}

/* ─── Conversion ─── */
async function convertAll() {
  const btn = document.getElementById('convert-btn');
  btn.disabled = true;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="animation:spin .8s linear infinite">
      <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="22" stroke-dashoffset="8"/>
    </svg>
    Converting…`;

  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);

  document.getElementById('results').innerHTML = '';
  const quality = parseInt(document.getElementById('quality-slider').value) / 100;
  const res = RESOLUTIONS[selectedRes];
  const cvs = document.getElementById('cvs');
  const ctx = cvs.getContext('2d');
  const converted = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setStatus(i, 'processing', 'Converting…');
    showProg(i, true);
    setProg(i, 10);

    try {
      let blob;
      if (f.type.startsWith('image/')) {
        blob = await convertImage(f, res, quality, ctx, cvs, p => setProg(i, p));
      } else if (f.type.startsWith('video/')) {
        blob = await convertVideoFrame(f, res, quality, ctx, cvs, p => setProg(i, p));
      } else {
        setStatus(i, 'error', 'Not visual');
        showProg(i, false);
        continue;
      }

      const outName = f.name.replace(/\.[^.]+$/, '') + '.webp';
      converted.push({ blob, name: outName, origName: f.name });
      setProg(i, 100);
      setStatus(i, 'done', '✓ Done');
    } catch (err) {
      console.error('Conversion error:', err);
      setStatus(i, 'error', 'Failed');
      showProg(i, false);
    }
  }

  renderResults(converted);
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 9a6 6 0 0 1 6-6 6 6 0 0 1 4.24 1.76M15 9a6 6 0 0 1-6 6 6 6 0 0 1-4.24-1.76" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M13 5.5l2.24 1.26M13 5.5V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    Convert to WebP`;
}

function convertImage(file, res, quality, ctx, cvs, onProg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      onProg(40);
      let [w, h] = resize(img.naturalWidth, img.naturalHeight, res);
      cvs.width = w; cvs.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      onProg(80);
      cvs.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function convertVideoFrame(file, res, quality, ctx, cvs, onProg) {
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    const url = URL.createObjectURL(file);
    vid.src = url; vid.muted = true; vid.preload = 'metadata';
    vid.onloadeddata = () => {
      vid.currentTime = Math.min(1.0, vid.duration * 0.08);
    };
    vid.onseeked = () => {
      URL.revokeObjectURL(url);
      onProg(50);
      let [w, h] = resize(vid.videoWidth || 1280, vid.videoHeight || 720, res);
      cvs.width = w; cvs.height = h;
      ctx.drawImage(vid, 0, 0, w, h);
      onProg(80);
      cvs.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', quality);
    };
    vid.onerror = reject;
  });
}

function resize(origW, origH, res) {
  if (!res.w) return [origW, origH];
  const ar = origW / origH;
  if (ar >= 1) return [res.w, Math.round(res.w / ar)];
  return [Math.round(res.h * ar), res.h];
}

/* ─── Results ─── */
function renderResults(items) {
  const r = document.getElementById('results');
  if (!items.length) return;

  const header = document.createElement('div');
  header.className = 'results-header';
  header.innerHTML = `
    <svg class="check-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
      <path d="M6 10l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ${items.length} file${items.length > 1 ? 's' : ''} converted to WebP
  `;
  r.appendChild(header);

  items.forEach(({ blob, name }) => {
    const url = URL.createObjectURL(blob);
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img class="result-thumb" src="${url}" alt="${name}">
      <div class="file-info">
        <p class="file-name">${name}</p>
        <p class="file-meta">WebP &middot; ${fmt(blob.size)}</p>
      </div>
      <a href="${url}" download="${name}">
        <button class="download-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v8M4 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          Download
        </button>
      </a>
    `;
    r.appendChild(card);
  });

  if (items.length > 1) {
    const allBtn = document.createElement('button');
    allBtn.className = 'download-all-btn';
    allBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v11M5 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Download all ${items.length} files as ZIP
    `;
    allBtn.onclick = () => downloadZip(items);
    r.appendChild(allBtn);
  }
}

/* ─── ZIP Download ─── */
async function downloadZip(items) {
  const btn = event.currentTarget;
  const orig = btn.innerHTML;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="animation:spin .8s linear infinite"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="22" stroke-dashoffset="8"/></svg> Preparing ZIP…`;
  btn.disabled = true;

  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  script.onload = async () => {
    const zip = new JSZip();
    for (const { blob, name } of items) {
      zip.file(name, await blob.arrayBuffer());
    }
    const out = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out);
    a.download = 'pixshift_webp.zip';
    a.click();
    btn.innerHTML = orig;
    btn.disabled = false;
  };
  document.head.appendChild(script);
}

/* ─── FAQ Accordion ─── */
function toggleFaq(btn) {
  const a = btn.nextElementSibling;
  const isOpen = a.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(x => x.classList.remove('open'));
  document.querySelectorAll('.faq-q').forEach(x => x.classList.remove('open'));
  if (!isOpen) { a.classList.add('open'); btn.classList.add('open'); }
}

/* ─── Smooth scroll for nav links ─── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
