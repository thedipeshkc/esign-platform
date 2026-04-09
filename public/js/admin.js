// ============================================================
//  admin.js  —  JavaScript for the Admin Portal
//  Handles: loading records, delete, export Excel, print, config
// ============================================================

// Store all records in memory so we can use them for export
let allRecords = [];

// ── Tab switching ─────────────────────────────────────────────
function showTab(tabName) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(function(p) {
    p.classList.remove('active');
  });

  // Remove active from all tab buttons
  document.querySelectorAll('.tab-bar button').forEach(function(b) {
    b.classList.remove('active');
  });

  // Show selected panel
  document.getElementById('panel-' + tabName).classList.add('active');

  // Highlight selected tab button
  const tabIndex = { responses: 0, settings: 1, doc: 2 };
  document.querySelectorAll('.tab-bar button')[tabIndex[tabName]].classList.add('active');

  // Load data when switching to a tab
  if (tabName === 'responses') loadRecords();
  if (tabName === 'settings' || tabName === 'doc') loadConfig();
}

// ── Load all signature records from server ────────────────────
async function loadRecords() {
  try {
    const res = await fetch('/api/admin/signatures');

    if (res.status === 401) {
      showToast('Authentication required. Please refresh the page.');
      return;
    }

    allRecords = await res.json();
    renderRecords(allRecords);

  } catch (err) {
    showToast('Failed to load records. Is the server running?');
    console.error(err);
  }
}

// ── Render records to the page ────────────────────────────────
function renderRecords(records) {
  // Update stats
  document.getElementById('statTotal').textContent = records.length;

  if (records.length > 0) {
    const latest = new Date(records[records.length - 1].submittedAt);
    document.getElementById('statLatest').textContent = latest.toLocaleDateString();
  } else {
    document.getElementById('statLatest').textContent = '–';
  }

  const list = document.getElementById('recList');

  // Show empty state if no records
  if (records.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        No signatures yet.
      </div>`;
    return;
  }

  // Build the HTML for each record
  list.innerHTML = records.map(function(record) {
    const date = new Date(record.submittedAt).toLocaleString();
    return `
      <div class="rec-item" id="rec-${record.id}">
        <div class="rec-info">
          <div class="rec-name">${escapeHTML(record.name)}</div>
          <div class="rec-meta">${date}</div>
        </div>
        <div class="rec-sig">
          <img src="${record.signatureData}" alt="Signature of ${escapeHTML(record.name)}" />
        </div>
        <button class="btn btn-ghost btn-sm no-print" onclick="deleteRecord('${record.id}')">
          Delete
        </button>
      </div>`;
  }).join('');
}

// ── Delete one record ─────────────────────────────────────────
async function deleteRecord(id) {
  if (!confirm('Delete this signature record? This cannot be undone.')) return;

  try {
    await fetch('/api/admin/signatures/' + id, { method: 'DELETE' });
    allRecords = allRecords.filter(function(r) { return r.id !== id; });
    renderRecords(allRecords);
    showToast('Record deleted.');
  } catch (err) {
    showToast('Failed to delete record.');
  }
}

// ── Delete ALL records ────────────────────────────────────────
async function clearAll() {
  if (!confirm('Delete ALL signature records?\n\nThis cannot be undone.')) return;

  try {
    await fetch('/api/admin/signatures', { method: 'DELETE' });
    allRecords = [];
    renderRecords([]);
    showToast('All records cleared.');
  } catch (err) {
    showToast('Failed to clear records.');
  }
}

// ── Print all records ─────────────────────────────────────────
function printAll() {
  // Set the print header text
  document.getElementById('printTitle').textContent =
    document.getElementById('cfgTitle')?.value || 'Signature Records';
  document.getElementById('printDate').textContent = new Date().toLocaleString();

  // Make sure we're on the responses tab, then print
  showTab('responses');
  setTimeout(function() { window.print(); }, 200);
}

// ── Export to Excel (.xlsx) ───────────────────────────────────
function exportExcel() {
  if (allRecords.length === 0) {
    showToast('No records to export.');
    return;
  }

  // Build the spreadsheet data
  // Row 1 is the header row
  const sheetData = [['#', 'Full Name', 'Submitted At', 'Record ID']];

  allRecords.forEach(function(record, index) {
    sheetData.push([
      index + 1,
      record.name,
      new Date(record.submittedAt).toLocaleString(),
      record.id
    ]);
  });

  // Use SheetJS to create the Excel file
  const workbook  = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 5  },   // # column
    { wch: 30 },   // Name
    { wch: 25 },   // Date
    { wch: 38 }    // ID
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Signatures');
  XLSX.writeFile(workbook, 'signatures.xlsx');

  showToast('Excel file downloaded!');
}

// ── Load admin config ─────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/admin/config');
    const cfg = await res.json();

    // Fill in settings fields if they exist on the page
    if (document.getElementById('cfgTitle')) document.getElementById('cfgTitle').value = cfg.platformTitle || '';
    if (document.getElementById('cfgForm'))  document.getElementById('cfgForm').value  = cfg.formTitle    || '';
    if (document.getElementById('cfgDesc'))  document.getElementById('cfgDesc').value  = cfg.formDesc     || '';
    if (document.getElementById('cfgUrl'))   document.getElementById('cfgUrl').value   = cfg.docUrl       || '';
    if (document.getElementById('cfgLabel')) document.getElementById('cfgLabel').value = cfg.docLabel     || '';
  } catch (err) {
    console.error('Could not load config:', err);
  }
}

// ── Save platform text settings ───────────────────────────────
async function saveSettings() {
  const body = {
    platformTitle : document.getElementById('cfgTitle').value.trim(),
    formTitle     : document.getElementById('cfgForm').value.trim(),
    formDesc      : document.getElementById('cfgDesc').value.trim()
  };

  try {
    await fetch('/api/admin/config', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(body)
    });
    showToast('Settings saved!');
  } catch (err) {
    showToast('Failed to save settings.');
  }
}

// ── Save external document link ───────────────────────────────
async function saveDocLink() {
  const body = {
    docUrl  : document.getElementById('cfgUrl').value.trim(),
    docLabel: document.getElementById('cfgLabel').value.trim(),
    docType : 'url'
  };

  try {
    await fetch('/api/admin/config', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(body)
    });
    showToast('Document link saved!');
  } catch (err) {
    showToast('Failed to save link.');
  }
}

// ── Upload a PDF document ─────────────────────────────────────
async function uploadPDF(file) {
  if (!file) return;

  const statusEl = document.getElementById('uploadStatus');
  statusEl.className   = 'upload-status';
  statusEl.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('document', file);

  try {
    const res  = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      statusEl.className   = 'upload-status ok';
      statusEl.textContent = '✓ Uploaded: ' + data.filename;
      showToast('PDF uploaded! Users can now view it.');
    } else {
      statusEl.className   = 'upload-status err';
      statusEl.textContent = 'Error: ' + data.error;
    }
  } catch (err) {
    statusEl.className   = 'upload-status err';
    statusEl.textContent = 'Upload failed. Please try again.';
  }
}

// ── Set up the PDF drop zone ──────────────────────────────────
const dropZone = document.getElementById('dropZone');
const pdfInput = document.getElementById('pdfInput');

// When a file is chosen via the file picker
pdfInput.addEventListener('change', function() {
  if (this.files && this.files[0]) uploadPDF(this.files[0]);
});

// Drag-and-drop events
dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', function() {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) uploadPDF(e.dataTransfer.files[0]);
});

// ── Toast notification ────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 3200);
}

// ── Escape HTML to prevent XSS ────────────────────────────────
function escapeHTML(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

// ── Run on page load ──────────────────────────────────────────
loadRecords();
loadConfig();