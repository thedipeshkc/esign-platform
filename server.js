// ============================================================
//  server.js  —  eSign Platform Backend (MongoDB version)
// ============================================================

const express      = require('express');
const multer       = require('multer');
const cors         = require('cors');
const basicAuth    = require('express-basic-auth');
const path         = require('path');
const fs           = require('fs');
const { v4: uuid } = require('uuid');
const mongoose     = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Admin credentials ────────────────────────────────────────
const ADMIN_USER   = process.env.ADMIN_USER   || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASS   || 'admin123';
const MONGODB_URI  = process.env.MONGODB_URI  || '';

// ── Connect to MongoDB ───────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB Atlas!'))
  .catch(err => console.error('✗ MongoDB connection error:', err));

// ── MongoDB Schemas ──────────────────────────────────────────

// Signature record
const signatureSchema = new mongoose.Schema({
  id            : { type: String, default: () => uuid() },
  name          : { type: String, required: true },
  signatureData : { type: String, required: true },   // base64 PNG image
  submittedAt   : { type: Date,   default: Date.now },
  ip            : { type: String, default: '' }
});
const Signature = mongoose.model('Signature', signatureSchema);

// Platform config (only one document, we reuse it)
const configSchema = new mongoose.Schema({
  platformTitle : { type: String, default: 'Document Signature Platform' },
  formTitle     : { type: String, default: 'Please review and sign' },
  formDesc      : { type: String, default: 'Read the document carefully, then enter your name and draw your signature.' },
  docUrl        : { type: String, default: '' },
  docLabel      : { type: String, default: 'Click to open and review the document' },
  docType       : { type: String, default: 'url' }
});
const Config = mongoose.model('Config', configSchema);

// ── Helper: get or create config ─────────────────────────────
async function getConfig() {
  let cfg = await Config.findOne();
  if (!cfg) cfg = await Config.create({});
  return cfg;
}

// ── File paths ───────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── File upload (PDF) ────────────────────────────────────────
const storage = multer.diskStorage({
  destination : (req, file, cb) => cb(null, UPLOAD_DIR),
  filename    : (req, file, cb) => cb(null, 'document.pdf')
});
const upload = multer({
  storage,
  limits     : { fileSize: 25 * 1024 * 1024 },
  fileFilter : (req, file, cb) => {
    cb(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype));
  }
});

// ── Admin auth ───────────────────────────────────────────────
const adminAuth = basicAuth({
  users     : { [ADMIN_USER]: ADMIN_PASS },
  challenge : true,
  realm     : 'Admin Portal'
});

// ════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ════════════════════════════════════════════════════════════

// Get config for signer page
app.get('/api/config', async (req, res) => {
  try {
    const cfg       = await getConfig();
    const pdfExists = fs.existsSync(path.join(UPLOAD_DIR, 'document.pdf'));
    res.json({ ...cfg.toObject(), hasUpload: pdfExists });
  } catch (err) {
    res.status(500).json({ error: 'Could not load config.' });
  }
});

// Submit a signature
app.post('/api/submit', async (req, res) => {
  try {
    const { name, signatureData } = req.body;
    if (!name || !name.trim())  return res.status(400).json({ error: 'Name is required.' });
    if (!signatureData)         return res.status(400).json({ error: 'Signature is required.' });

    const record = await Signature.create({
      name          : name.trim(),
      signatureData,
      ip            : req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    });

    res.json({ success: true, id: record.id });
  } catch (err) {
    res.status(500).json({ error: 'Could not save signature.' });
  }
});

// Serve uploaded PDF
app.get('/api/document', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, 'document.pdf');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).json({ error: 'No document uploaded yet.' });
});

// ════════════════════════════════════════════════════════════
//  ADMIN ROUTES (password protected)
// ════════════════════════════════════════════════════════════

// Get all signatures
app.get('/api/admin/signatures', adminAuth, async (req, res) => {
  try {
    const records = await Signature.find().sort({ submittedAt: 1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Could not load signatures.' });
  }
});

// Delete one signature
app.delete('/api/admin/signatures/:id', adminAuth, async (req, res) => {
  try {
    await Signature.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// Delete ALL signatures
app.delete('/api/admin/signatures', adminAuth, async (req, res) => {
  try {
    await Signature.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not clear.' });
  }
});

// Get config (admin)
app.get('/api/admin/config', adminAuth, async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json(cfg.toObject());
  } catch (err) {
    res.status(500).json({ error: 'Could not load config.' });
  }
});

// Save config
app.post('/api/admin/config', adminAuth, async (req, res) => {
  try {
    const cfg     = await getConfig();
    const allowed = ['platformTitle', 'formTitle', 'formDesc', 'docUrl', 'docLabel', 'docType'];
    allowed.forEach(key => { if (req.body[key] !== undefined) cfg[key] = req.body[key]; });
    await cfg.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save config.' });
  }
});

// Upload PDF
app.post('/api/admin/upload', adminAuth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const cfg    = await getConfig();
    cfg.docType  = 'upload';
    cfg.docLabel = req.file.originalname;
    await cfg.save();
    res.json({ success: true, filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// Export CSV
app.get('/api/admin/export/csv', adminAuth, async (req, res) => {
  try {
    const records = await Signature.find().sort({ submittedAt: 1 });
    const rows    = [['#', 'Full Name', 'Submitted At', 'Record ID']];
    records.forEach((r, i) => rows.push([i + 1, r.name, new Date(r.submittedAt).toLocaleString(), r.id]));
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="signatures.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── Page routes ──────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   eSign Platform is running!          ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Signer page : http://localhost:${PORT}  ║`);
  console.log(`║  Admin portal: http://localhost:${PORT}/admin ║`);
  console.log(`║  Login: ${ADMIN_USER} / ${ADMIN_PASS}             ║`);
  console.log('╚══════════════════════════════════════╝\n');
});