// ============================================================
//  server.js  —  eSign Platform Backend
//  This file runs on your computer/server using Node.js
//  It handles: saving signatures, serving pages, file uploads
// ============================================================

const express      = require('express');
const multer       = require('multer');
const cors         = require('cors');
const basicAuth    = require('express-basic-auth');
const path         = require('path');
const fs           = require('fs');
const { v4: uuid } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Admin login credentials ──────────────────────────────────
// Change these before going live!
// You can also set them as environment variables on your host.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// ── File paths ───────────────────────────────────────────────
const DATA_FILE   = path.join(__dirname, 'data', 'signatures.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const UPLOAD_DIR  = path.join(__dirname, 'uploads');

// ── Create folders and files if they don't exist ─────────────
if (!fs.existsSync(path.join(__dirname, 'data')))   fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(UPLOAD_DIR))                     fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DATA_FILE))                      fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    platformTitle : 'Document Signature Platform',
    formTitle     : 'Please review and sign',
    formDesc      : 'Read the document carefully, then enter your name and draw your signature.',
    docUrl        : '',
    docLabel      : 'Click to open and review the document',
    docType       : 'url'
  }, null, 2));
}

// ── Helper functions ─────────────────────────────────────────
function readSignatures()    { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveSignatures(arr) { fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2)); }
function readConfig()        { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
function saveConfig(obj)     { fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2)); }

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' }));           // allow large signature images
app.use(express.static(path.join(__dirname, 'public'))); // serve HTML/CSS/JS files

// ── File upload setup (for PDF documents) ───────────────────
const storage = multer.diskStorage({
  destination : (req, file, cb) => cb(null, UPLOAD_DIR),
  filename    : (req, file, cb) => cb(null, 'document.pdf')
});
const upload = multer({
  storage,
  limits      : { fileSize: 25 * 1024 * 1024 },  // 25 MB max
  fileFilter  : (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// ── Admin authentication middleware ─────────────────────────
const adminAuth = basicAuth({
  users     : { [ADMIN_USER]: ADMIN_PASS },
  challenge : true,
  realm     : 'Admin Portal'
});

// ════════════════════════════════════════════════════════════
//  PUBLIC ROUTES  (anyone can access these)
// ════════════════════════════════════════════════════════════

// Return platform config to the signer page
app.get('/api/config', (req, res) => {
  const cfg       = readConfig();
  const pdfExists = fs.existsSync(path.join(UPLOAD_DIR, 'document.pdf'));
  res.json({ ...cfg, hasUpload: pdfExists });
});

// Submit a signature
app.post('/api/submit', (req, res) => {
  const { name, signatureData } = req.body;

  if (!name || !name.trim())  return res.status(400).json({ error: 'Name is required.' });
  if (!signatureData)         return res.status(400).json({ error: 'Signature is required.' });

  const record = {
    id            : uuid(),
    name          : name.trim(),
    signatureData,                                    // the drawn signature as a PNG image
    submittedAt   : new Date().toISOString(),
    ip            : req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };

  const all = readSignatures();
  all.push(record);
  saveSignatures(all);

  res.json({ success: true, id: record.id });
});

// Serve the uploaded PDF document
app.get('/api/document', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, 'document.pdf');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).json({ error: 'No document has been uploaded yet.' });
});

// ════════════════════════════════════════════════════════════
//  ADMIN ROUTES  (password protected)
// ════════════════════════════════════════════════════════════

// Get all signatures
app.get('/api/admin/signatures', adminAuth, (req, res) => {
  res.json(readSignatures());
});

// Delete one signature by ID
app.delete('/api/admin/signatures/:id', adminAuth, (req, res) => {
  const updated = readSignatures().filter(r => r.id !== req.params.id);
  saveSignatures(updated);
  res.json({ success: true });
});

// Delete ALL signatures
app.delete('/api/admin/signatures', adminAuth, (req, res) => {
  saveSignatures([]);
  res.json({ success: true });
});

// Get config (admin version — same fields)
app.get('/api/admin/config', adminAuth, (req, res) => {
  res.json(readConfig());
});

// Save config
app.post('/api/admin/config', adminAuth, (req, res) => {
  const cfg     = readConfig();
  const allowed = ['platformTitle', 'formTitle', 'formDesc', 'docUrl', 'docLabel', 'docType'];
  allowed.forEach(key => { if (req.body[key] !== undefined) cfg[key] = req.body[key]; });
  saveConfig(cfg);
  res.json({ success: true });
});

// Upload a PDF
app.post('/api/admin/upload', adminAuth, upload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received. Must be a PDF.' });
  // Update config so signer page shows the uploaded file
  const cfg = readConfig();
  cfg.docType  = 'upload';
  cfg.docLabel = req.file.originalname;
  saveConfig(cfg);
  res.json({ success: true, filename: req.file.originalname });
});

// Export signatures as CSV
app.get('/api/admin/export/csv', adminAuth, (req, res) => {
  const records = readSignatures();
  const rows    = [['#', 'Full Name', 'Submitted At', 'Record ID']];
  records.forEach((r, i) => rows.push([i + 1, r.name, new Date(r.submittedAt).toLocaleString(), r.id]));
  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="signatures.csv"');
  res.send(csv);
});

// ── Page routes ──────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start the server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   eSign Platform is running!          ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Signer page : http://localhost:${PORT}  ║`);
  console.log(`║  Admin portal: http://localhost:${PORT}/admin ║`);
  console.log(`║  Login: ${ADMIN_USER} / ${ADMIN_PASS}             ║`);
  console.log('╚══════════════════════════════════════╝\n');
});