// ============================================================
//  signer.js  —  JavaScript for the public signer page
//  This file runs in the user's browser (not on the server)
// ============================================================

// ── Canvas setup ─────────────────────────────────────────────
const canvas = document.getElementById('sigCanvas');
const ctx    = canvas.getContext('2d');
let inkColor = '#1a1a2e';   // default ink color
let drawing  = false;       // is the user currently drawing?
let lastX    = 0;
let lastY    = 0;
let hasSigned = false;      // has the user drawn anything?

// Make the canvas match the actual pixel density of the screen
// (this prevents blurry signatures on retina/hi-DPI displays)
function initCanvas() {
  const dpr  = window.devicePixelRatio || 1;
  const wrap  = canvas.parentElement;
  const w     = wrap.getBoundingClientRect().width || 640;
  const h     = 175;

  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width        = Math.round(w * dpr);
  canvas.height       = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
}
// Wait a moment so the page layout is complete before measuring width
setTimeout(initCanvas, 80);

// ── Get mouse/touch position relative to canvas ──────────────
function getPos(event) {
  const rect = canvas.getBoundingClientRect();
  const src  = event.touches ? event.touches[0] : event;
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top
  };
}

// ── Mouse events ─────────────────────────────────────────────
canvas.addEventListener('mousedown', function(e) {
  drawing = true;
  const p = getPos(e);
  lastX = p.x;
  lastY = p.y;
  onStartSigning();
});

canvas.addEventListener('mousemove', function(e) {
  if (!drawing) return;
  drawStroke(getPos(e));
});

canvas.addEventListener('mouseup',    function() { drawing = false; });
canvas.addEventListener('mouseleave', function() { drawing = false; });

// ── Touch events (for phones and tablets) ────────────────────
canvas.addEventListener('touchstart', function(e) {
  e.preventDefault(); // stop page scrolling while signing
  drawing = true;
  const p = getPos(e);
  lastX = p.x;
  lastY = p.y;
  onStartSigning();
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (!drawing) return;
  drawStroke(getPos(e));
}, { passive: false });

canvas.addEventListener('touchend', function() { drawing = false; });

// ── Draw a smooth line from the last position to the new one ─
function drawStroke(pos) {
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = inkColor;
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.stroke();
  lastX = pos.x;
  lastY = pos.y;
}

// ── Called when user starts drawing for the first time ───────
function onStartSigning() {
  hasSigned = true;
  document.getElementById('sigHint').style.opacity = '0';  // hide the "Sign here" hint
  document.getElementById('sigErr').style.display  = 'none'; // hide any error
}

// ── Clear the canvas ─────────────────────────────────────────
function clearCanvas() {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  hasSigned = false;
  document.getElementById('sigHint').style.opacity = '1';
}

// ── Change ink color when a dot is clicked ───────────────────
document.querySelectorAll('.ink-dot').forEach(function(dot) {
  dot.addEventListener('click', function() {
    inkColor = this.dataset.color;
    document.querySelectorAll('.ink-dot').forEach(d => d.classList.remove('active'));
    this.classList.add('active');
  });
});

// ── Load platform config from the server ─────────────────────
async function loadConfig() {
  try {
    const res  = await fetch('/api/config');
    const cfg  = await res.json();

    // Update the page text
    document.getElementById('hTitle').textContent = cfg.platformTitle || 'Document Signature Platform';
    document.getElementById('hForm').textContent  = cfg.formTitle     || 'Please review and sign';
    document.getElementById('hDesc').textContent  = cfg.formDesc      || '';
    document.title = cfg.platformTitle || 'Sign Document';

    // Set up the document link
    const docLink = document.getElementById('docLink');
    const docName = document.getElementById('docName');
    const docSub  = document.getElementById('docSub');

    if (cfg.docType === 'upload' && cfg.hasUpload) {
      // Admin uploaded a PDF
      docName.textContent = cfg.docLabel || 'Document.pdf';
      docSub.textContent  = 'PDF — click to open in a new tab';
      docLink.href        = '/api/document';

    } else if (cfg.docUrl) {
      // Admin set an external link (Google Drive etc.)
      docName.textContent = cfg.docLabel || cfg.docUrl;
      docSub.textContent  = 'External link — opens in a new tab';
      docLink.href        = cfg.docUrl;

    } else {
      // No document set yet
      docName.textContent     = 'No document configured yet';
      docSub.textContent      = 'The admin has not uploaded a document yet.';
      docLink.style.display   = 'none';
    }
  } catch (err) {
    console.error('Could not load config:', err);
  }
}

// ── Submit the form ───────────────────────────────────────────
async function submitForm() {
  // ── Validate all fields ─────────────────────────────────
  let allValid = true;

  const name = document.getElementById('nameInput').value.trim();
  if (!name) {
    document.getElementById('nameErr').style.display = 'block';
    allValid = false;
  } else {
    document.getElementById('nameErr').style.display = 'none';
  }

  if (!document.getElementById('agreeChk').checked) {
    document.getElementById('agreeErr').style.display = 'block';
    allValid = false;
  } else {
    document.getElementById('agreeErr').style.display = 'none';
  }

  if (!hasSigned) {
    document.getElementById('sigErr').style.display = 'block';
    allValid = false;
  } else {
    document.getElementById('sigErr').style.display = 'none';
  }

  if (!allValid) return; // stop here if anything is missing

  // ── Disable button while sending ────────────────────────
  const btn = document.getElementById('submitBtn');
  btn.disabled     = true;
  btn.textContent  = 'Submitting…';

  // ── Send to the server ───────────────────────────────────
  try {
    const response = await fetch('/api/submit', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        name,
        signatureData: canvas.toDataURL('image/png')   // convert canvas drawing to image
      })
    });

    const result = await response.json();

    if (result.success) {
      // Clear the form
      document.getElementById('nameInput').value    = '';
      document.getElementById('agreeChk').checked  = false;
      clearCanvas();
      btn.style.display = 'none';
      document.getElementById('successBox').style.display = 'block';

    } else {
      showToast('Error: ' + (result.error || 'Submission failed.'));
      btn.disabled    = false;
      btn.textContent = 'Submit Signature';
    }

  } catch (err) {
    showToast('Network error. Please check your connection and try again.');
    btn.disabled    = false;
    btn.textContent = 'Submit Signature';
  }
}

// ── Toast notification helper ─────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 3200);
}

// ── Run on page load ──────────────────────────────────────────
loadConfig();