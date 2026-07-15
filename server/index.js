require('dotenv').config();
const express = require('express');

// ── Password generator ────────────────────────────────────────────────────────
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 6; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
  return pwd.sort(() => Math.random() - 0.5).join('');
}
const session = require('express-session');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();


const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ────────────────────────────────────────────────────────────
const dataDir_early = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '../data');
const fs_early = require('fs');
if (!fs_early.existsSync(dataDir_early)) fs_early.mkdirSync(dataDir_early, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir_early, 'app.db'));

// Helper: run a query that modifies data
function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
// Helper: get one row
function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params || [], (err, row) => { if (err) reject(err); else resolve(row); });
  });
}
// Helper: get all rows
function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => { if (err) reject(err); else resolve(rows || []); });
  });
}
// Helper: run multiple statements (schema creation)
function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => { if (err) reject(err); else resolve(); });
  });
}

// ── Boot: schema → seed → start ─────────────────────────────────────────────
(async () => {
  await dbExec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    monday_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pending_portals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    pandadoc_link TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    sent INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    template_type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS pricing (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value REAL NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`);

// ── Migration: add phone column if not exists ────────────────────────────────
await dbRun("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''").catch(() => {});
await dbRun("ALTER TABLE users ADD COLUMN monday_name TEXT NOT NULL DEFAULT ''").catch(() => {});

// ── Migration: upsert all pricing items ──────────────────────────────────────
const pricingUpdates = [
  ['base_renovation',                 'Renovations — base fee',               2200],
  ['base_extension',                  'Extensions — base fee',                2800],
  ['base_new_home',                   'New Home — base fee',                  3200],
  ['base_granny_attached_standalone', 'Granny Flat — Attached (standalone)',  3900],
  ['base_granny_detached_standalone', 'Granny Flat — Detached (standalone)',  3600],
  ['base_granny_attached_addon',      'Granny Flat — Attached (add-on)',      2900],
  ['base_granny_detached_addon',      'Granny Flat — Detached (add-on)',      2200],
  ['base_working_single',             'Working Drawings Only — Single Storey', 3900],
  ['base_working_double',             'Working Drawings Only — Double Storey', 4900],
  ['base_shed_standard',              'Shed — Standard',                       2900],
  ['base_shed_mezzanine',             'Shed — With Mezzanine',                 3200],
  ['base_shed_home',                  'Shed Home',                             3900],
  ['base_shed_addon',                 'Shed (add-on)',                         2200],
  ['base_reno_storey_2bed',           'Renovation + Storey Addition — 2 bed',  5900],
  ['base_reno_storey_3bed',           'Renovation + Storey Addition — 3 bed',  6900],
  ['base_reno_storey_4bed',           'Renovation + Storey Addition — 4 bed',  7900],
  ['base_storey_addition_2bed',       'Storey Addition — 2 bed',               4900],
  ['base_storey_addition_3bed',       'Storey Addition — 3 bed',               5900],
  ['base_storey_addition_4bed',       'Storey Addition — 4 bed',               6900],
  ['base_as_constructed',             'As-Constructed — base fee',            2700],
];
for (const [key, label, value] of pricingUpdates) {
  await dbRun('INSERT OR REPLACE INTO pricing (key, label, value) VALUES (?, ?, ?)', [key, label, value]).catch(e => console.error('Pricing upsert error:', e.message));
}
console.log('Pricing migration complete');

// ── Seed admin account on first run ──────────────────────────────────────────
const adminExists = await dbGet('SELECT id FROM users WHERE role = ?', ['admin']);
if (!adminExists && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  await dbRun('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', [process.env.ADMIN_EMAIL, hash, 'Admin', 'admin']);
  console.log('Admin account created:', process.env.ADMIN_EMAIL);
}

// ── Seed default pricing if empty ────────────────────────────────────────────
const pricingCount = await dbGet('SELECT COUNT(*) as n FROM pricing', []);
if (pricingCount.n === 0) {
  const defaults = [
    ['base_renovation',      'Renovations — base fee',           2200],
    ['base_extension',       'Extensions — base fee',             2800],
    ['base_new_home',        'New Home — base fee',               3200],
    ['base_granny_attached_standalone', 'Granny Flat — Attached (standalone)', 3900],
    ['base_granny_detached_standalone', 'Granny Flat — Detached (standalone)', 3600],
    ['base_granny_attached_addon',      'Granny Flat — Attached (add-on)',     2900],
    ['base_granny_detached_addon',      'Granny Flat — Detached (add-on)',     2200],
    ['base_working_single',  'Working Drawings Only — Single Storey', 3900],
    ['base_working_double',  'Working Drawings Only — Double Storey', 4900],
    ['per_storey',           'Per additional storey',              400],
    ['kitchen_design',       'Kitchen design & cabinetry',         600],
    ['wet_area_elevations',  'Wet area elevations',                300],
    ['joinery_details',      'Joinery details',                    300],
    ['survey_required',      'Survey (if required)',               800],
    ['as_constructed',       'As-constructed drawings',           1800],
  ];
  for (const r of defaults) { await dbRun('INSERT INTO pricing (key, label, value) VALUES (?, ?, ?)', r); }
  console.log('Default pricing seeded');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Ensure data dir exists for SQLite session store
const fs = require('fs');
const dataDir = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cookieSession({
  name: 'xpd_session',
  keys: [process.env.SESSION_SECRET || 'xpressdraft-secret-key'],
  maxAge: 28800000, // 8 hours
  secret: process.env.SESSION_SECRET || 'xpd-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
}

// ── HTML helper ───────────────────────────────────────────────────────────────
function sendPage(res, file) {
  res.sendFile(path.join(__dirname, '../views', file));
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Login page
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  sendPage(res, 'login.html');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await dbGet('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.redirect('/login?error=1');
  }
  req.session.userId = user.id;
  req.session.name = user.name;
  req.session.role = user.role;
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Main app
app.get('/', requireAuth, (req, res) => sendPage(res, 'app.html'));

// Admin panel
app.get('/admin', requireAuth, requireAdmin, (req, res) => sendPage(res, 'admin.html'));

// ── API: current user info ────────────────────────────────────────────────────
app.get('/api/me', requireAuth, async (req, res) => {
  const me = await dbGet('SELECT id, email, name, phone, monday_name, role FROM users WHERE id = ?', [req.session.userId]);
  res.json(me || { name: req.session.name, role: req.session.role });
});

// ── API: client records ───────────────────────────────────────────────────────
app.get('/api/clients', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM clients WHERE user_id = ? ORDER BY updated_at DESC', [req.session.userId]);
  res.json(rows.map(r => ({ ...JSON.parse(r.data), id: r.id, updated: r.updated_at })));
});

app.post('/api/clients', requireAuth, async (req, res) => {
  const { id, name, monday_id, ...rest } = req.body;
  const data = JSON.stringify({ id, name, ...rest });
  await dbRun(`INSERT INTO clients (id, user_id, name, data, updated_at) VALUES (?, ?, ?, ?, strftime('%s','now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data, updated_at=excluded.updated_at`, [id, req.session.userId, name || 'Unknown', data]);
  res.json({ ok: true });
});

app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM clients WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── API: pricing ──────────────────────────────────────────────────────────────
app.get('/api/pricing', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM pricing ORDER BY key', []);
  res.json(rows);
});

app.post('/api/pricing', requireAuth, requireAdmin, async (req, res) => {
  const { key, label, value } = req.body;
  await dbRun(`INSERT INTO pricing (key, label, value, updated_at) VALUES (?, ?, ?, strftime('%s','now')) ON CONFLICT(key) DO UPDATE SET label=excluded.label, value=excluded.value, updated_at=excluded.updated_at`, [key, label, parseFloat(value)]);
  res.json({ ok: true });
});

// ── API: user management (admin only) ────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await dbAll('SELECT id, email, name, phone, monday_name, role, active, created_at FROM users ORDER BY created_at DESC', []);
  res.json(users);
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { email: userEmail, name, role } = req.body;
  if (!userEmail || !name) return res.status(400).json({ error: 'Missing fields' });
  const password = generatePassword();
  try {
    const hash = bcrypt.hashSync(password, 12);
    await dbRun('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', [userEmail, hash, name, role || 'user']);
    // Send welcome email with login details
    try {
      await emailModule.sendUserWelcome(name, userEmail, password);
      console.log('Welcome email sent to new user:', userEmail);
    } catch(e) {
      console.error('User welcome email error:', e.message);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { active, password, name, phone, monday_name } = req.body;
  const id = req.params.id;
  if (active !== undefined) {
    await dbRun('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  }
  if (name) {
    await dbRun('UPDATE users SET name = ? WHERE id = ?', [name, id]);
  }
  if (phone !== undefined) {
    await dbRun('UPDATE users SET phone = ? WHERE id = ?', [phone || '', id]);
  }
  if (monday_name !== undefined) {
    await dbRun('UPDATE users SET monday_name = ? WHERE id = ?', [monday_name || '', id]);
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 12);
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
  }
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
  await dbRun('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
});

// ── API: Anthropic proxy ──────────────────────────────────────────────────────
app.post('/api/ai', requireAuth, async (req, res) => {
  const { messages, max_tokens } = req.body;
  if (!messages) return res.status(400).json({ error: 'Missing messages' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 1000,
        messages
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
    const text = (data.content || []).map(c => c.text || '').join('').trim();
    res.json({ ok: true, text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── API: PandaDoc integration ─────────────────────────────────────────────────
const pandadoc = require('./pandadoc');
const emailModule = require('./email');
const stripeModule = require('./stripe');
const monday = require('./monday');
const multer = require('multer');

// File storage for lead files
const leadFilesDir = path.join(dataDir, 'lead_files');
if (!fs.existsSync(leadFilesDir)) fs.mkdirSync(leadFilesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(leadFilesDir, req.params.mondayId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const twilio = require('./twilio');

// Generate and send proposal
app.post('/api/proposal', requireAuth, async (req, res) => {
  try {
    const { clientId, priceOverride, clientEmail, clientPhone, depositPct } = req.body;
    console.log('Proposal request:', { clientId, priceOverride, clientEmail, depositPct });
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

    const row = await dbGet('SELECT * FROM clients WHERE id = ? AND user_id = ?', [clientId, req.session.userId]);
    if (!row) return res.status(404).json({ error: 'Client not found' });

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    
    let parsedData;
    try {
      parsedData = JSON.parse(row.data);
    } catch(parseErr) {
      console.error('Failed to parse row.data:', parseErr.message);
      return res.status(500).json({ error: 'Invalid client data' });
    }

    console.log('Record keys:', Object.keys(parsedData));
    console.log('fields present:', !!parsedData.fields);
    console.log('brief_summary:', parsedData.fields ? (parsedData.fields.brief_summary || '').slice(0,50) : 'NO FIELDS');
    console.log('priceOverride:', priceOverride, typeof priceOverride);

    const rec = { ...parsedData, id: row.id, name: row.name, addr: parsedData.addr || '' };
    const existingProposals = await dbAll('SELECT id FROM proposals WHERE client_id = ?', [clientId]);
    // Calculate deposit and create Stripe payment link
    const priceNum = parseFloat(String(priceOverride || 0).replace(/[^0-9.]/g, '')) || 0;
    const depositNum = parseFloat(depositPct || 20);
    const totalIncGst = priceNum * 1.1;
    const depositAmount = totalIncGst * (depositNum / 100);
    
    let stripeLink = '';
    try {
      const proposalNum = `${(rec.name || '').trim().split(' ').pop().slice(0,3).toUpperCase()}001`;
      stripeLink = await stripeModule.createDepositPaymentLink(rec.name, rec.addr, depositAmount, proposalNum);
      console.log('Stripe payment link created:', stripeLink);
    } catch(stripeErr) {
      console.error('Stripe error:', stripeErr.message);
      // Continue without Stripe link rather than failing the whole proposal
    }

    // Store price in client record for later webhook use
    const updatedFields = { ...(parsedData.fields || {}), price_override: priceNum };
    const updatedData = { ...parsedData, fields: updatedFields };
    await dbRun('UPDATE clients SET data = ? WHERE id = ?', [JSON.stringify(updatedData), clientId]);

    // Send SMS notification to client
    console.log('SMS: attempting to send, phone:', rec.phone || parsedData.phone || 'NONE', 'TWILIO_SID:', process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING');
    try {
      const smsPhone = clientPhone || rec.phone || parsedData.phone || '';
      const smsResult = await twilio.sendProposalSMS(rec.name, smsPhone, rec.addr, user.name, user.phone || '');
      console.log('SMS result:', smsResult);
    } catch(smsErr) {
      console.error('SMS error:', smsErr.message);
    }

    const result = await pandadoc.createProposal(rec, user.name, user.email, clientEmail, priceOverride, existingProposals.length, depositPct || 20, stripeLink);

    // Move lead to FOLLOW UP CALLS in Monday.com
    if (rec.monday_id || parsedData.monday_id) {
      try {
        await monday.moveToFollowUp(rec.monday_id || parsedData.monday_id);
        console.log('Lead moved to FOLLOW UP CALLS:', rec.monday_id || parsedData.monday_id);
      } catch(e) {
        console.error('Monday follow up error:', e.message);
      }
    }
    await dbRun("INSERT OR IGNORE INTO proposals (client_id, document_id, template_type, created_at) VALUES (?, ?, ?, strftime('%s','now'))", [clientId, result.documentId, result.templateType]);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Proposal route error:', e.message);
    console.error('Stack:', e.stack);
    res.status(500).json({ error: e.message || 'Proposal generation failed' });
  }
});

// ── Keep-alive ping ──────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.send('ok'));

// Self-ping every 10 minutes to prevent Render spin-down
if (process.env.NODE_ENV === 'production') {
  const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://xpressdraft-sales.onrender.com';
  setInterval(async () => {
    try {
      const https = require('https');
      https.get(APP_URL + '/ping', () => {}).on('error', () => {});
    } catch(e) {}
  }, 10 * 60 * 1000); // every 10 minutes
}

// ── Monday.com CRM routes ────────────────────────────────────────────────────

// Get leads for current rep
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const repName = user.monday_name || user.name;
    console.log('Loading leads for rep:', repName);
    const leads = await monday.getLeadsForRep(repName);
    res.json(leads);
  } catch(e) {
    console.error('Get leads error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Lead action buttons
app.post('/api/leads/:mondayId/action', requireAuth, async (req, res) => {
  try {
    const { mondayId } = req.params;
    const { action, notes } = req.body;
    console.log('Lead action:', action, 'for Monday ID:', mondayId);
    if (action === 'free_consultation') await monday.clickFreeConsultation(mondayId);
    else if (action === 'proposal_requested') await monday.clickProposalRequested(mondayId);
    else if (action === 'help_required') await monday.clickHelpRequired(mondayId);
    else if (action === 'follow_up') await monday.moveToFollowUp(mondayId);
    else if (action === 'move_stage') {
      const { stage } = req.body;
      const stageMap = {
        discovery: 'DISCOVERY CALLS',
        followup: 'FOLLOW UP EMAILS / CALLS',
        waiting: 'WAITING FOR CLIENTS',
        qualified: 'QUALIFIED LEADS',
        closed: 'CLOSED DEALS',
        lost: 'LOST',
        help: 'HELP REQUIRED'
      };
      const groupName = stageMap[stage];
      if (groupName) {
        const groupId = await monday.getGroupId(monday.BOARDS.negotiations, groupName);
        if (groupId) await monday.moveToGroup(monday.BOARDS.negotiations, mondayId, groupId);
      }
    }
    if (notes) await monday.updateNotes(mondayId, notes);
    res.json({ ok: true });
  } catch(e) {
    console.error('Lead action error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get Monday.com files for a lead
app.get('/api/leads/:mondayId/monday-files', requireAuth, async (req, res) => {
  try {
    const files = await monday.getLeadFiles(req.params.mondayId);
    res.json(files);
  } catch(e) {
    console.error('Get Monday files error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get files for a lead
app.get('/api/leads/:mondayId/files', requireAuth, (req, res) => {
  const dir = path.join(leadFilesDir, req.params.mondayId);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).map(name => ({ name, path: dir + '/' + name }));
  res.json(files);
});

// Upload files for a lead
app.post('/api/leads/:mondayId/files', requireAuth, upload.array('files', 10), (req, res) => {
  res.json({ ok: true, count: req.files.length });
});

// Download a file
app.get('/api/leads/:mondayId/files/:filename', requireAuth, (req, res) => {
  const filePath = path.join(leadFilesDir, req.params.mondayId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

// Update lead details
app.patch('/api/leads/:mondayId/details', requireAuth, async (req, res) => {
  try {
    const { mondayId } = req.params;
    const { address, phone, email, source, status } = req.body;
    await monday.updateLeadDetails(mondayId, { address, phone, email, source, status });
    res.json({ ok: true });
  } catch(e) {
    console.error('Update details error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Delete a file
app.delete('/api/leads/:mondayId/files/:filename', requireAuth, (req, res) => {
  const filePath = path.join(leadFilesDir, req.params.mondayId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// Update notes
app.patch('/api/leads/:mondayId/notes', requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    await monday.updateNotes(req.params.mondayId, notes);
    res.json({ ok: true });
  } catch(e) {
    console.error('Update notes error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PandaDoc webhook — fires on signing and payment
async function processPandaDocWebhook(body, label) {
  // PandaDoc sends an array of events
  const events = Array.isArray(body) ? body : [body];
  console.log(`${label} received ${events.length} event(s)`);
  for (const event of events) {
    console.log(`${label} event:`, event.event, event.data?.status);
    await pandadoc.handleWebhook(event, db, emailModule, monday);
  }
}

app.post('/webhooks/pandadoc', async (req, res) => {
  try {
    await processPandaDocWebhook(req.body, 'Webhook');
    res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/webhooks/pandadoc/payment', async (req, res) => {
  try {
    await processPandaDocWebhook(req.body, 'Payment webhook');
    res.json({ ok: true });
  } catch (e) {
    console.error('Payment webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get proposal status
app.get('/api/proposal/:clientId', requireAuth, async (req, res) => {
  const row = await dbGet('SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC LIMIT 1', [req.params.clientId]);
  if (!row) return res.json({ proposal: null });
  res.json({ proposal: row });
});


// ── API: pending portal logins (admin) ───────────────────────────────────────
app.get('/api/pending-portals', requireAuth, requireAdmin, async (req, res) => {
  const rows = await dbAll('SELECT * FROM pending_portals WHERE sent = 0 ORDER BY created_at DESC', []);
  res.json(rows);
});

app.post('/api/pending-portals/:id/send', requireAuth, requireAdmin, async (req, res) => {
  const { portalEmail, portalPassword } = req.body;
  if (!portalEmail || !portalPassword) return res.status(400).json({ error: 'Portal email and password required' });
  const row = await dbGet('SELECT * FROM pending_portals WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try {
    await emailModule.sendPortalWelcome(row.client_name, row.client_email, portalEmail, portalPassword, row.pandadoc_link);
    await dbRun('UPDATE pending_portals SET sent = 1 WHERE id = ?', [row.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});



  // ── Start ───────────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`Xpress Draft running on http://localhost:${PORT}`);
  });
})().catch(err => { console.error('Startup error:', err); process.exit(1); });
