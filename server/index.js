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
await dbRun("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'standard'").catch(() => {});
await dbRun("ALTER TABLE users ADD COLUMN leader_id INTEGER DEFAULT NULL").catch(() => {});
await dbRun("ALTER TABLE users ADD COLUMN start_date TEXT DEFAULT NULL").catch(() => {});
// Salary settings table
await dbRun(`CREATE TABLE IF NOT EXISTS salary_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  weekly_amount REAL NOT NULL DEFAULT 0,
  gst INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// Invoices table
await dbRun(`CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  week_start TEXT NOT NULL,
  salary_amount REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  submitted_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'submitted'
)`).catch(() => {});

// Commission records table
await dbRun(`CREATE TABLE IF NOT EXISTS commission_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  project_type TEXT DEFAULT '',
  sale_amount REAL NOT NULL,
  week_start TEXT NOT NULL,
  paid INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// Reminders table
await dbRun(`CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  monday_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  note TEXT DEFAULT '',
  remind_at TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// Pending proposal requests table
await dbRun(`CREATE TABLE IF NOT EXISTS pending_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  monday_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  address TEXT DEFAULT '',
  requested_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'pending'
)`).catch(() => {});

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
  await dbRun('INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', [process.env.ADMIN_EMAIL, hash, 'Admin', 'admin']);
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

// Ensure data dir exists
const fs = require('fs');
const dataDir = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cookieSession({
  name: 'xpd_session',
  keys: [process.env.SESSION_SECRET || 'xpressdraft-secret-key'],
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  httpOnly: true,
  sameSite: 'lax'
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
app.get('/commission', requireAuth, (req, res) => sendPage(res, 'commission.html'));

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

    // Move lead from Negotiations to SENT PROPOSALS on Proposal board
    let mondayLeadId = rec.monday_id || parsedData.monday_id;
    console.log('mondayLeadId:', mondayLeadId, '| rec.monday_id:', rec.monday_id, '| parsedData.monday_id:', parsedData.monday_id);

    // If no monday_id, try to find by client name on Negotiations board
    if (!mondayLeadId && rec.name) {
      try {
        const searchResult = await monday.query(`
          query {
            boards(ids: ["${monday.BOARDS.negotiations}"]) {
              items_page(limit: 50, query_params: { rules: [{ column_id: "name", compare_value: ["${rec.name.replace(/"/g, '\\"')}"] }] }) {
                items { id name }
              }
            }
          }`);
        const found = searchResult?.boards?.[0]?.items_page?.items?.[0];
        if (found) {
          mondayLeadId = found.id;
          console.log('Found Monday item by name:', rec.name, '-> ID:', mondayLeadId);
        }
      } catch(e) { console.error('Monday name search error:', e.message); }
    }

    if (mondayLeadId) {
      try {
        const repName = user.monday_name || user.name;

        // First update rep columns on Negotiations board so history is preserved
        const negColVals = JSON.stringify({ labels: [repName] });
        await monday.query(`
          mutation {
            change_column_value(
              board_id: ${monday.BOARDS.negotiations},
              item_id: ${mondayLeadId},
              column_id: "dropdown_mm5cb995",
              value: ${JSON.stringify(negColVals)}
            ) { id }
          }`).catch(e => console.error('Set negotiations dropdown error:', e.message));

        // Then move to SENT PROPOSALS on Proposal board
        const newItemId = await monday.moveToBoard(monday.BOARDS.negotiations, mondayLeadId, monday.BOARDS.proposal, monday.PROPOSAL_GROUPS.sent_proposals);
        console.log('Lead moved to SENT PROPOSALS, new item ID:', newItemId);

        // Use new item ID on Proposals board
        const targetId = newItemId || mondayLeadId;
        const today = new Date().toISOString().split('T')[0];

        // Set SENT ON date
        await monday.query(`
          mutation {
            change_column_value(
              board_id: ${monday.BOARDS.proposal},
              item_id: ${targetId},
              column_id: "date_mky1pazj",
              value: ${JSON.stringify(JSON.stringify({ date: today }))}
            ) { id }
          }`).catch(e => console.error('Set sent on date error:', e.message));
        const propColVals = JSON.stringify({ labels: [repName] });
        await monday.query(`
          mutation {
            change_column_value(
              board_id: ${monday.BOARDS.proposal},
              item_id: ${targetId},
              column_id: "dropdown_mm5c51r2",
              value: ${JSON.stringify(propColVals)}
            ) { id }
          }`).catch(e => console.error('Set proposal dropdown error:', e.message));

        await dbRun('UPDATE pending_requests SET status = ? WHERE monday_id = ?', ['sent', mondayLeadId]);
      } catch(e) {
        console.error('Monday proposal move error:', e.message);
      }
    } else {
      console.error('No mondayLeadId found for client:', rec.name);
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

// ── Commission routes ────────────────────────────────────────────────────────

// Get current week start (Wednesday 12am AEST)
function getWeekStart(date = new Date()) {
  // Use Australia/Brisbane time (UTC+10, no DST)
  const aestOffset = 10 * 60; // minutes
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const aestMs = utcMs + aestOffset * 60000;
  const d = new Date(aestMs);
  const day = d.getDay(); // 0=Sun, 3=Wed
  const diff = (day >= 3) ? day - 3 : day + 4;
  d.setDate(d.getDate() - diff);
  // Return as YYYY-MM-DD in AEST
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Calculate commission for a given sales total and role
function calcCommission(total, role) {
  if (role === 'leader') {
    if (total <= 8000) return total * 0.03;
    if (total <= 15000) return 8000 * 0.03 + (total - 8000) * 0.04;
    if (total <= 25000) return 8000 * 0.03 + 7000 * 0.04 + (total - 15000) * 0.05;
    return 8000 * 0.03 + 7000 * 0.04 + 10000 * 0.05 + (total - 25000) * 0.06;
  } else {
    if (total <= 15000) return total * 0.02;
    if (total <= 25000) return 15000 * 0.02 + (total - 15000) * 0.03;
    return 15000 * 0.02 + 10000 * 0.03 + (total - 25000) * 0.04;
  }
}

app.get('/api/commission/summary', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const weekStart = getWeekStart();
    console.log('Commission summary - weekStart:', weekStart, '| userId:', req.session.userId);

    // Support custom date range
    const fromDate = req.query.from;
    const toDate = req.query.to;
    let records;
    if (fromDate && toDate) {
      records = await dbAll(
        'SELECT * FROM commission_records WHERE user_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ? ORDER BY created_at DESC',
        [req.session.userId, fromDate, toDate]
      );
    } else {
      records = await dbAll(
        'SELECT * FROM commission_records WHERE user_id = ? AND week_start = ? ORDER BY created_at DESC',
        [req.session.userId, weekStart]
      );
    }
    console.log('Records found:', records.length, '| All records:', (await dbAll('SELECT week_start, COUNT(*) as cnt FROM commission_records WHERE user_id = ? GROUP BY week_start', [req.session.userId])).map(r => r.week_start + ':' + r.cnt).join(', '));
    const totalSales = records.reduce((sum, r) => sum + r.sale_amount, 0);
    const commission = calcCommission(totalSales, user.role || 'standard');

    // Get all stats from Monday.com automatically
    const repName = user.monday_name || user.name;
    let mondayStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
    let overallStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
    let totalLeads = 0;
    try {
      mondayStats = await monday.getRepStatsFromMonday(repName, fromDate || null, toDate || null);
      console.log('Monday stats for', repName, ':', JSON.stringify(mondayStats));
      // Overall stats since start date
      overallStats = await monday.getRepStatsFromMonday(repName, user.start_date || null, null);
      // Total leads on Negotiations board
      const leadsData = await monday.getLeadsForRep(repName);
      totalLeads = leadsData.length;
    } catch(e) { console.error('Monday stats error:', e.message); }
    const weekNum = user.start_date ? Math.floor((Date.now() - new Date(user.start_date)) / (7 * 24 * 60 * 60 * 1000)) + 1 : null;
    const leadConversionRate = totalLeads > 0 ? Math.round((mondayStats.closedDeals / totalLeads) * 100) : 0;
    const overallLeadConversionRate = totalLeads > 0 ? Math.round((overallStats.closedDeals / totalLeads) * 100) : 0;

    // If leader, get sub-rep dashboards using leader's start date for override
    let subReps = [];
    if (user.role === 'leader') {
      const overrideFrom = user.start_date || fromDate || null;
      const assignedReps = await dbAll('SELECT * FROM users WHERE leader_id = ?', [user.id]);
      for (const rep of assignedReps) {
        const subRepName = rep.monday_name || rep.name;
        let subStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
        let subOverrideStats = { closedValue: 0 };
        let subTotalLeads = 0;
        try {
          subStats = await monday.getRepStatsFromMonday(subRepName, fromDate || null, toDate || null);
          subOverrideStats = await monday.getRepStatsFromMonday(subRepName, overrideFrom, toDate || null);
          const subLeads = await monday.getLeadsForRep(subRepName);
          subTotalLeads = subLeads.length;
        } catch(e) {}
        const subRecords = await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [rep.id, weekStart]);
        const subTotalSales = subRecords.reduce((sum, r) => sum + r.sale_amount, 0);
        const subCommission = calcCommission(subTotalSales, rep.role || 'standard');
        const overrideCommission = (subOverrideStats.closedValue || 0) * 0.02;
        subReps.push({ user: rep, records: subRecords, totalSales: subTotalSales, commission: subCommission, overrideCommission, totalLeads: subTotalLeads, ...subStats });
      }
    }

    res.json({
      records,
      totalSales,
      commission,
      weekStart,
      role: user.role || 'standard',
      sentProposals: mondayStats.sentProposals,
      sentValue: mondayStats.sentValue,
      closedDeals: mondayStats.closedDeals,
      closedValue: mondayStats.closedValue,
      conversionRate: mondayStats.conversionRate,
      totalClosed: mondayStats.closedValue,
      overallStats,
      weekNum,
      startDate: user.start_date,
      subReps,
      totalLeads,
      leadConversionRate,
      overallLeadConversionRate,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/commission/records', requireAuth, async (req, res) => {
  try {
    const { client_name, project_type, sale_amount } = req.body;
    const weekStart = getWeekStart();
    await dbRun(
      'INSERT INTO commission_records (user_id, client_name, project_type, sale_amount, week_start) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, client_name, project_type, parseFloat(sale_amount), weekStart]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/commission/records/:id', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM commission_records WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get all sales records with optional date range
app.get('/api/admin/all-sales', requireAuth, requireAdmin, async (req, res) => {
  try {
    const fromDate = req.query.from;
    const toDate = req.query.to;
    let sales;
    if (fromDate && toDate) {
      sales = await dbAll(`
        SELECT c.*, u.name as rep_name 
        FROM commission_records c JOIN users u ON c.user_id = u.id 
        WHERE DATE(c.created_at) >= ? AND DATE(c.created_at) <= ?
        ORDER BY c.created_at DESC`, [fromDate, toDate]);
    } else {
      sales = await dbAll(`
        SELECT c.*, u.name as rep_name 
        FROM commission_records c JOIN users u ON c.user_id = u.id 
        ORDER BY c.created_at DESC`);
    }
    res.json({ summary: [{ records: sales, user: { name: 'All' }, totalSales: sales.reduce((s,r) => s + r.sale_amount, 0) }], sales });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get all reps commission summary — supports week or custom date range
app.get('/api/admin/commission', requireAuth, requireAdmin, async (req, res) => {
  try {
    const weekStart = req.query.week || getWeekStart();
    const fromDate = req.query.from;
    const toDate = req.query.to;
    const isCustom = fromDate && toDate;
    const users = await dbAll('SELECT * FROM users');
    const summary = [];
    for (const user of users) {
      const records = isCustom
        ? await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?', [user.id, fromDate, toDate])
        : await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [user.id, weekStart]);
      const totalSales = records.reduce((sum, r) => sum + r.sale_amount, 0);
      const commission = calcCommission(totalSales, user.role || 'standard');
      let totalOverride = 0;
      if (user.role === 'leader') {
        const reps = await dbAll('SELECT * FROM users WHERE leader_id = ?', [user.id]);
        for (const rep of reps) {
          const repRecs = isCustom
            ? await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?', [rep.id, fromDate, toDate])
            : await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [rep.id, weekStart]);
          const repSales = repRecs.reduce((sum, r) => sum + r.sale_amount, 0);
          totalOverride += repSales * 0.02;
        }
      }
      // Get Monday.com stats
      let mondayStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
      let repTotalLeads = 0;
      try {
        const repName = user.monday_name || user.name;
        mondayStats = await monday.getRepStatsFromMonday(repName, fromDate || null, toDate || null);
        const leadsData = await monday.getLeadsForRep(repName);
        repTotalLeads = leadsData.length;
      } catch(e) {}
      const leadConversionRate = repTotalLeads > 0 ? Math.round((mondayStats.closedDeals / repTotalLeads) * 100) : 0;

      // Recalculate override using leader's start date as from date
      let adjustedOverride = 0;
      if (user.role === 'leader') {
        const leaderFrom = fromDate || user.start_date || null;
        const reps = await dbAll('SELECT * FROM users WHERE leader_id = ?', [user.id]);
        for (const rep of reps) {
          let repStats = { closedValue: 0 };
          try {
            const rn = rep.monday_name || rep.name;
            repStats = await monday.getRepStatsFromMonday(rn, leaderFrom, toDate || null);
          } catch(e) {}
          adjustedOverride += (repStats.closedValue || 0) * 0.02;
        }
      }
      const finalOverride = user.role === 'leader' ? adjustedOverride : totalOverride;
      summary.push({ user, records, totalSales, commission, totalOverride: finalOverride, totalEarnings: commission + finalOverride, role: user.role || 'standard', totalLeads: repTotalLeads, leadConversionRate, ...mondayStats });
    }
    res.json({ summary, weekStart: isCustom ? `${fromDate} → ${toDate}` : weekStart });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Pipeline stats ───────────────────────────────────────────────────────────
app.get('/api/admin/pipeline', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT * FROM users WHERE role != ?', ['admin']);
    const pipeline = [];

    for (const user of users) {
      const repName = user.monday_name || user.name;

      // Get leads from Negotiations board
      const leadsData = await monday.getLeadsForRep(repName).catch(() => []);

      // Count by stage
      const stageCounts = {};
      leadsData.forEach(l => {
        const g = l.group_title || 'Other';
        stageCounts[g] = (stageCounts[g] || 0) + 1;
      });

      // Get proposals sent from 26_3 Proposal board - both Follow Up and Sent Proposals groups
      const proposalData = await monday.query(`
        query {
          boards(ids: ["18389820785"]) {
            groups(ids: ["group_mkxzcgkr", "group_mky78qcz"]) {
              items_page(limit: 200) {
                items {
                  id
                  name
                  column_values(ids: ["dropdown_mm5c51r2", "numbers_mm5cr6w3"]) {
                    id text value
                  }
                }
              }
            }
          }
        }`).catch(() => null);

      const allProposalGroups = proposalData?.boards?.[0]?.groups || [];
      const sentItems = allProposalGroups.flatMap(g => g.items_page?.items || []);
      const repSentProposals = sentItems.filter(item => {
        const repCol = (item.column_values?.find(c => c.id === 'dropdown_mm5c51r2')?.text || '').toLowerCase().replace(/[^a-z]/g, '');
        const repNameNorm = repName.toLowerCase().replace(/[^a-z]/g, '');
        return repCol && (repCol.includes(repNameNorm) || repNameNorm.includes(repCol));
      });

      // Get closed deals value from commission records
      const weekStart = getWeekStart();
      const allRecords = await dbAll('SELECT * FROM commission_records WHERE user_id = ?', [user.id]);
      const totalClosed = allRecords.reduce((sum, r) => sum + r.sale_amount, 0);
      const closedCount = allRecords.length;

      // Conversion rate: closed / sent proposals
      const conversionRate = repSentProposals.length > 0
        ? Math.round((closedCount / repSentProposals.length) * 100)
        : 0;

      pipeline.push({
        user,
        totalLeads: leadsData.length,
        stageCounts,
        sentProposals: repSentProposals.length,
        closedDeals: closedCount,
        totalClosed,
        conversionRate
      });
    }

    res.json(pipeline);
  } catch(e) {
    console.error('Pipeline stats error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Salary settings ──────────────────────────────────────────────────────────
app.get('/api/admin/salary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT * FROM users WHERE role != ?', ['admin']);
    const result = [];
    for (const u of users) {
      const salary = await dbGet('SELECT * FROM salary_settings WHERE user_id = ?', [u.id]);
      result.push({ user: u, salary: salary || { weekly_amount: 0, gst: 1 } });
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/salary/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { weekly_amount, gst } = req.body;
    await dbRun(`INSERT INTO salary_settings (user_id, weekly_amount, gst) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET weekly_amount=excluded.weekly_amount, gst=excluded.gst, updated_at=datetime('now')`,
      [req.params.userId, parseFloat(weekly_amount) || 0, gst ? 1 : 0]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get invoice summary for current rep
app.get('/api/invoice/summary', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const salary = await dbGet('SELECT * FROM salary_settings WHERE user_id = ?', [req.session.userId]);
    const weekStart = getWeekStart();

    // Calculate pay date (next Wednesday after week ends on Tuesday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7); // Tuesday end
    const payDate = new Date(weekEnd);
    payDate.setDate(payDate.getDate() + 1); // Wednesday
    const payDateStr = payDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Commission this week
    const records = await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [req.session.userId, weekStart]);
    const totalSales = records.reduce((sum, r) => sum + r.sale_amount, 0);
    const commission = calcCommission(totalSales, user.role || 'standard');

    const weeklyBase = salary?.weekly_amount || 0;
    const gst = salary?.gst !== 0;
    const subtotal = weeklyBase + commission;
    const gstAmount = gst ? subtotal * 0.1 : 0;
    const total = subtotal + gstAmount;

    // Check if invoice already submitted this week
    const existing = await dbGet('SELECT * FROM invoices WHERE user_id = ? AND week_start = ?', [req.session.userId, weekStart]);

    res.json({ weekStart, payDate: payDateStr, weeklyBase, commission, subtotal, gstAmount, gst, total, existing: existing || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Upload invoice
const invoiceDir = path.join(dataDir, 'invoices');
if (!fs.existsSync(invoiceDir)) fs.mkdirSync(invoiceDir, { recursive: true });

const invoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(invoiceDir, String(req.session.userId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')),
});
const invoiceUpload = multer({ storage: invoiceStorage, limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/invoice/upload', requireAuth, invoiceUpload.single('invoice'), async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const salary = await dbGet('SELECT * FROM salary_settings WHERE user_id = ?', [req.session.userId]);
    const weekStart = getWeekStart();
    const records = await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [req.session.userId, weekStart]);
    const totalSales = records.reduce((sum, r) => sum + r.sale_amount, 0);
    const commission = calcCommission(totalSales, user.role || 'standard');
    const weeklyBase = salary?.weekly_amount || 0;
    const subtotal = weeklyBase + commission;
    const gstAmount = (salary?.gst !== 0) ? subtotal * 0.1 : 0;
    const total = subtotal + gstAmount;

    await dbRun(`INSERT INTO invoices (user_id, week_start, salary_amount, commission_amount, total_amount, filename, filepath)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, weekStart, weeklyBase, commission, total, req.file.originalname, req.file.path]);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: get all invoices
app.get('/api/admin/invoices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const invoices = await dbAll(`
      SELECT i.*, u.name as rep_name 
      FROM invoices i JOIN users u ON i.user_id = u.id 
      ORDER BY i.submitted_at DESC`);
    res.json(invoices);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: download invoice
app.get('/api/admin/invoices/:id/download', requireAuth, requireAdmin, async (req, res) => {
  try {
    const inv = await dbGet('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv || !fs.existsSync(inv.filepath)) return res.status(404).json({ error: 'File not found' });
    res.download(inv.filepath, inv.filename);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: set rep start date
app.patch('/api/admin/users/:id/start-date', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { start_date } = req.body;
    await dbRun('UPDATE users SET start_date = ? WHERE id = ?', [start_date, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get week number since start date
function getWeekNumber(startDate) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now - start;
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

// Get all weeks since start date
function getWeeksSinceStart(startDate) {
  if (!startDate) return [];
  const weeks = [];
  const start = new Date(startDate);
  // Find first Wednesday on or after start date
  const day = start.getDay();
  const daysToWed = day <= 3 ? 3 - day : 10 - day;
  const firstWed = new Date(start);
  firstWed.setDate(start.getDate() + (daysToWed === 7 ? 0 : daysToWed));
  // Go back to find week start
  const firstWeekStart = new Date(firstWed);
  if (day > 3) firstWeekStart.setDate(firstWed.getDate() - (day - 3));
  else firstWeekStart.setDate(firstWed.getDate() - (day + 4));

  const now = new Date();
  let current = new Date(firstWeekStart);
  let weekNum = 1;
  while (current <= now) {
    const weekEnd = new Date(current);
    weekEnd.setDate(current.getDate() + 6);
    const fmt = d => d.toISOString().split('T')[0];
    weeks.push({ weekNum, weekStart: fmt(current), weekEnd: fmt(weekEnd) });
    current.setDate(current.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

// Admin: get weekly history for a rep
app.get('/api/admin/commission/:userId/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const repName = user.monday_name || user.name;
    const weeks = getWeeksSinceStart(user.start_date);
    const history = [];
    for (const week of weeks) {
      let mondayStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
      try {
        mondayStats = await monday.getRepStatsFromMonday(repName, week.weekStart, week.weekEnd);
      } catch(e) {}
      history.push({ ...week, ...mondayStats });
    }
    const currentWeekNum = getWeekNumber(user.start_date);
    res.json({ history, currentWeekNum, startDate: user.start_date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: set rep role ──────────────────────────────────────────────────────
app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: assign rep to leader
app.patch('/api/admin/users/:id/leader', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { leader_id } = req.body;
    await dbRun('UPDATE users SET leader_id = ? WHERE id = ?', [leader_id || null, req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get commission summary for a specific user (view-as-rep)
app.get('/api/admin/commission/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const fromDate = req.query.from;
    const toDate = req.query.to;
    const weekStart = getWeekStart();

    const records = await dbAll(
      'SELECT * FROM commission_records WHERE user_id = ? AND week_start = ? ORDER BY created_at DESC',
      [user.id, weekStart]
    );
    const totalSales = records.reduce((sum, r) => sum + r.sale_amount, 0);
    const commission = calcCommission(totalSales, user.role || 'standard');

    // Get Monday.com stats
    const repName = user.monday_name || user.name;
    let mondayStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
    try {
      mondayStats = await monday.getRepStatsFromMonday(repName, fromDate || null, toDate || null);
    } catch(e) { console.error('Monday stats error for', repName, ':', e.message); }

    // If leader, get sub-reps data using leader's start date as from date for override
    let subReps = [];
    if (user.role === 'leader') {
      // Override only counts from when the leader started
      const overrideFrom = user.start_date || fromDate || null;
      const assignedReps = await dbAll('SELECT * FROM users WHERE leader_id = ?', [user.id]);
      for (const rep of assignedReps) {
        const subRepName = rep.monday_name || rep.name;
        let subStats = { sentProposals: 0, sentValue: 0, closedDeals: 0, closedValue: 0, conversionRate: 0 };
        let subOverrideStats = { closedValue: 0 };
        let subTotalLeads = 0;
        try {
          // Stats for display use the selected period
          subStats = await monday.getRepStatsFromMonday(subRepName, fromDate || null, toDate || null);
          // Override calculated from leader's start date only
          subOverrideStats = await monday.getRepStatsFromMonday(subRepName, overrideFrom, toDate || null);
          const subLeads = await monday.getLeadsForRep(subRepName);
          subTotalLeads = subLeads.length;
        } catch(e) {}
        const subRecords = await dbAll('SELECT * FROM commission_records WHERE user_id = ? AND week_start = ?', [rep.id, weekStart]);
        const subTotalSales = subRecords.reduce((sum, r) => sum + r.sale_amount, 0);
        const subCommission = calcCommission(subTotalSales, rep.role || 'standard');
        const overrideCommission = (subOverrideStats.closedValue || 0) * 0.02;
        subReps.push({ user: rep, records: subRecords, totalSales: subTotalSales, commission: subCommission, overrideCommission, totalLeads: subTotalLeads, ...subStats });
      }
    }

    const totalOverride = subReps.reduce((sum, r) => sum + (r.overrideCommission || 0), 0);
    res.json({
      user, records, totalSales, commission, weekStart,
      role: user.role || 'standard',
      subReps, totalOverride, totalEarnings: commission + totalOverride,
      ...mondayStats
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: add/edit commission record for any user
app.post('/api/admin/commission/:userId/records', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { client_name, project_type, sale_amount, week_start } = req.body;
    const weekStart = week_start || getWeekStart();
    await dbRun(
      'INSERT INTO commission_records (user_id, client_name, project_type, sale_amount, week_start) VALUES (?, ?, ?, ?, ?)',
      [req.params.userId, client_name, project_type, parseFloat(sale_amount), weekStart]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/commission/records/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM commission_records WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get all users with roles and leaders
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT id, name, email, role, leader_id, active FROM users ORDER BY name');
    res.json(users);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reminders routes ─────────────────────────────────────────────────────────
app.get('/api/reminders', requireAuth, async (req, res) => {
  const reminders = await dbAll(
    'SELECT * FROM reminders WHERE user_id = ? AND done = 0 ORDER BY remind_at ASC',
    [req.session.userId]
  );
  res.json(reminders);
});

app.get('/api/leads/:mondayId/reminders', requireAuth, async (req, res) => {
  const reminders = await dbAll(
    'SELECT * FROM reminders WHERE user_id = ? AND monday_id = ? AND done = 0 ORDER BY remind_at ASC',
    [req.session.userId, req.params.mondayId]
  );
  res.json(reminders);
});

app.post('/api/leads/:mondayId/reminders', requireAuth, async (req, res) => {
  const { note, remind_at, client_name } = req.body;
  await dbRun(
    'INSERT INTO reminders (user_id, monday_id, client_name, note, remind_at) VALUES (?, ?, ?, ?, ?)',
    [req.session.userId, req.params.mondayId, client_name || '', note || '', remind_at]
  );
  res.json({ ok: true });
});

app.delete('/api/reminders/:id', requireAuth, async (req, res) => {
  await dbRun('UPDATE reminders SET done = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── Leads update timestamp (for frontend polling) ────────────────────────────
let lastLeadsUpdate = Date.now();
app.get('/api/leads/last-update', requireAuth, (req, res) => {
  res.json({ timestamp: lastLeadsUpdate });
});

// ── Monday.com webhook registration ─────────────────────────────────────────
app.post('/api/admin/monday/register-webhook', requireAuth, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.MONDAY_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'MONDAY_API_KEY not set' });

    const appUrl = process.env.RENDER_EXTERNAL_URL || 'https://xpressdraft-commission.onrender.com';
    const webhookUrl = appUrl + '/api/monday-webhook';

    const result = await monday.query(`
      mutation($url: String!) {
        create_webhook(
          board_id: 18389820785,
          url: $url,
          event: change_column_value
        ) {
          id
          board_id
        }
      }`, { url: webhookUrl });

    if (result?.create_webhook?.id) {
      console.log('Monday webhook registered:', result.create_webhook.id);
      res.json({ ok: true, id: result.create_webhook.id });
    } else {
      res.status(400).json({ error: 'Failed to register webhook', result });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Monday.com webhook ───────────────────────────────────────────────────────
app.post('/api/monday-webhook', async (req, res) => {
  try {
    console.log('Monday webhook received:', JSON.stringify(req.body).slice(0, 300));
    
    // Monday.com sends a challenge on first registration
    if (req.body?.challenge) {
      console.log('Monday webhook challenge received');
      return res.json({ challenge: req.body.challenge });
    }

    const event = req.body?.event;
    if (!event) return res.json({ ok: true });

    console.log('Monday webhook event type:', event.type, '| boardId:', event.boardId, '| columnId:', event.columnId, '| value:', JSON.stringify(event.value).slice(0, 100));

    // Check if this is a status change to SENT on the Proposal board
    const boardId = String(event.boardId || '');
    const columnId = event.columnId || '';
    const newValue = event.value?.label?.text || event.value?.label || '';
    const itemId = String(event.pulseId || event.itemId || '');

    if (boardId === '18389820785' && columnId === 'color_mkxzy23p' && 
        newValue.toUpperCase() === 'SENT' && itemId) {
      console.log('Monday: SENT status on Proposal board, item:', itemId);

      // Mark pending request as sent if exists
      const pending = await dbGet('SELECT * FROM pending_requests WHERE monday_id = ? AND status = ?', 
        [itemId, 'pending']);
      if (pending) {
        await dbRun('UPDATE pending_requests SET status = ? WHERE monday_id = ?', ['sent', itemId]);
        console.log('Pending request marked as sent for item:', itemId);
      }

      // Monday.com automation handles moving item to Follow Up group
      // We just mark pending request as sent if exists
      lastLeadsUpdate = Date.now();
      console.log('SENT webhook processed for item:', itemId);
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('Monday webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Calendly webhook registration ────────────────────────────────────────────
app.post('/api/admin/calendly/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const token = process.env.CALENDLY_TOKEN;
    if (!token) return res.status(400).json({ error: 'CALENDLY_TOKEN not set in environment variables' });

    const appUrl = process.env.RENDER_EXTERNAL_URL || 'https://xpressdraft-commission.onrender.com';
    const webhookUrl = appUrl + '/api/calendly-webhook';

    // Get user URI first
    const userRes = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    const userData = await userRes.json();
    const userUri = userData?.resource?.uri;
    if (!userUri) return res.status(400).json({ error: 'Could not get Calendly user URI — check your token' });

    // Get organization URI too
    const orgUri = userData?.resource?.current_organization;
    console.log('Calendly user URI:', userUri, '| org URI:', orgUri);

    // Try organization scope first, fall back to user scope
    let webhookData;
    if (orgUri) {
      const webhookRes = await fetch('https://api.calendly.com/webhook_subscriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: orgUri,
          scope: 'organization'
        })
      });
      webhookData = await webhookRes.json();
    }

    // Fall back to user scope if org failed
    if (!webhookData || webhookData.message) {
      const webhookRes2 = await fetch('https://api.calendly.com/webhook_subscriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: orgUri,
          user: userUri,
          scope: 'user'
        })
      });
      webhookData = await webhookRes2.json();
    }

    if (webhookData.message) return res.status(400).json({ error: webhookData.message, details: webhookData });
    console.log('Calendly webhook registered:', webhookUrl);
    res.json({ ok: true, webhook: webhookData });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Calendly rep mapping ─────────────────────────────────────────────────────
const CALENDLY_REP_MAP = {
  'here2help@xpressdraft.com.au': 'Christian Yamada',
  'evan.dowman@xpressdraft.com.au': 'Evan Dowman',
};

// ── Calendly webhook ──────────────────────────────────────────────────────────
app.post('/api/calendly-webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('Calendly webhook:', event.event);
    if (event.event === 'invitee.created') {
      const invitee = event.payload?.invitee;
      const name = invitee?.name || 'Unknown';
      const email = invitee?.email || '';
      const phone = invitee?.questions_and_answers?.find(q => q.question?.toLowerCase().includes('phone'))?.answer || '';
      const startTime = event.payload?.event?.start_time || '';

      // Identify assigned rep from event membership
      const members = event.payload?.event?.event_memberships || [];
      const assignedEmail = members[0]?.user_email || '';
      const repName = CALENDLY_REP_MAP[assignedEmail] || '';
      console.log('Calendly booking:', name, '| assigned to:', assignedEmail, '→', repName || 'unassigned');

      // Get salesperson item ID from Monday.com salesperson board
      let salespersonItemId = null;
      if (repName) {
        try {
          const spData = await monday.query(`
            query {
              boards(ids: ["18390237344"]) {
                items_page(limit: 50) {
                  items { id name }
                }
              }
            }`);
          const spItems = spData?.boards?.[0]?.items_page?.items || [];
          const match = spItems.find(i => i.name.toLowerCase().includes(repName.toLowerCase()));
          if (match) salespersonItemId = match.id;
        } catch(e) {
          console.error('Calendly salesperson lookup error:', e.message);
        }
      }

      // Create item in Monday.com DISCOVERY CALLS group
      try {
        // Parse start time properly
        const bookingDate = startTime ? new Date(startTime) : new Date();
        const dateStr = bookingDate.toISOString().split('T')[0];
        const timeStr = bookingDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane' });
        const dateTimeReadable = bookingDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }) + ' at ' + timeStr;

        const colVals = {
          [monday.COLS.email]: { email, text: email },
          [monday.COLS.status]: { label: 'DC - CALENDLY' },
          [monday.COLS.source]: { label: 'WEBSITE ENQUIRIES' },
          [monday.COLS.arrival]: { date: dateStr },
          [monday.COLS.notes]: `Calendly booking: ${dateTimeReadable}\nClient email: ${email}${phone ? '\nPhone: ' + phone : ''}`,
        };
        if (phone) colVals[monday.COLS.phone] = { phone, countryShortName: 'AU' };
        if (salespersonItemId) colVals[monday.COLS.salesperson] = { item_ids: [salespersonItemId] };
        if (repName) colVals['dropdown_mm5cb995'] = { labels: [repName] };

        const columnValues = JSON.stringify(colVals);
        const discGroupId = await monday.getGroupId(monday.BOARDS.negotiations, 'DISCOVERY CALLS');
        if (discGroupId) {
          await monday.query(`
            mutation {
              create_item(
                board_id: ${monday.BOARDS.negotiations},
                group_id: "${discGroupId}",
                item_name: "${name.replace(/"/g, '\\"')}",
                column_values: ${JSON.stringify(columnValues)}
              ) { id }
            }`);
          console.log('Calendly lead created:', name, '→', repName || 'unassigned', '@ ', dateTimeReadable);
        }
      } catch(e) {
        console.error('Calendly Monday error:', e.message);
      }
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Calendly webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Storage stats ────────────────────────────────────────────────────────────
app.get('/api/admin/storage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { execSync } = require('child_process');

    // Get disk usage of /data
    const diskTotal = execSync("df /data --output=size -B1 | tail -1").toString().trim();
    const diskUsed = execSync("df /data --output=used -B1 | tail -1").toString().trim();
    const diskAvail = execSync("df /data --output=avail -B1 | tail -1").toString().trim();

    // Get database size
    const dbPath = path.join(dataDir, 'app.db');
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Get lead files size
    const leadFilesPath = path.join(dataDir, 'lead_files');
    let leadFilesSize = 0;
    let leadFilesCount = 0;
    if (fs.existsSync(leadFilesPath)) {
      const getDirSize = (dir) => {
        let size = 0;
        const files = fs.readdirSync(dir);
        files.forEach(f => {
          const fp = path.join(dir, f);
          const stat = fs.statSync(fp);
          if (stat.isDirectory()) size += getDirSize(fp);
          else { size += stat.size; leadFilesCount++; }
        });
        return size;
      };
      leadFilesSize = getDirSize(leadFilesPath);
    }

    res.json({
      disk: {
        total: parseInt(diskTotal),
        used: parseInt(diskUsed),
        available: parseInt(diskAvail),
        percent: Math.round((parseInt(diskUsed) / parseInt(diskTotal)) * 100)
      },
      database: { size: dbSize },
      lead_files: { size: leadFilesSize, count: leadFilesCount }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Monday.com CRM routes ────────────────────────────────────────────────────

// Get leads for current rep
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    const repName = user.monday_name || user.name;
    console.log('Loading leads for rep:', repName);

    // Get leads from both boards in parallel
    const [negotiationLeads, proposalFollowUpLeads] = await Promise.all([
      monday.getLeadsForRep(repName).catch(e => { console.error('Negotiations leads error:', e.message); return []; }),
      monday.getProposalFollowUpLeads(repName).catch(e => { console.error('Proposal leads error:', e.message); return []; })
    ]);

    // Exclude pending proposal requests from negotiations leads
    const pending = await dbAll('SELECT monday_id FROM pending_requests WHERE user_id = ? AND status = ?', [req.session.userId, 'pending']);
    const pendingIds = new Set(pending.map(p => p.monday_id));
    const filteredNegotiations = negotiationLeads.filter(l => !pendingIds.has(l.monday_id));

    // Merge both sources
    const allLeads = [...filteredNegotiations, ...proposalFollowUpLeads];
    res.json(allLeads);
  } catch(e) {
    console.error('Get leads error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get pending proposal requests for current rep
app.get('/api/pending-requests', requireAuth, async (req, res) => {
  try {
    const requests = await dbAll(
      'SELECT * FROM pending_requests WHERE user_id = ? AND status = ? ORDER BY requested_at DESC',
      [req.session.userId, 'pending']
    );
    res.json(requests);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark pending request as sent (admin only)
app.patch('/api/pending-requests/:id/sent', requireAuth, requireAdmin, async (req, res) => {
  try {
    await dbRun('UPDATE pending_requests SET status = ? WHERE id = ?', ['sent', req.params.id]);
    res.json({ ok: true });
  } catch(e) {
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
    else if (action === 'proposal_requested') {
      const newItemId = await monday.clickProposalRequested(mondayId);
      // Set PROPOSAL REQUEST DATE on the new item on Proposals board
      const targetId = newItemId || mondayId;
      const today = new Date().toISOString().split('T')[0];
      await monday.query(`
        mutation {
          change_column_value(
            board_id: ${monday.BOARDS.proposal},
            item_id: ${targetId},
            column_id: "date_mky1dh5s",
            value: ${JSON.stringify(JSON.stringify({ date: today }))}
          ) { id }
        }`).catch(e => console.error('Set proposal request date error:', e.message));
      // Store pending request locally
      const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
      const { client_name, address } = req.body;
      await dbRun('INSERT INTO pending_requests (user_id, monday_id, client_name, address) VALUES (?, ?, ?, ?)',
        [req.session.userId, mondayId, client_name || '', address || '']);
    }
    else if (action === 'help_required') await monday.clickHelpRequired(mondayId);
    else if (action === 'follow_up') await monday.moveToFollowUp(mondayId);
    else if (action === 'move_stage') {
      const { stage } = req.body;

      // First check which board the item is currently on
      let currentBoard = monday.BOARDS.negotiations; // default
      try {
        const itemCheck = await monday.query(`
          query { items(ids: ["${mondayId}"]) { board { id } } }`);
        const boardId = itemCheck?.items?.[0]?.board?.id;
        if (boardId) currentBoard = boardId;
        console.log('Item', mondayId, 'is on board:', currentBoard);
      } catch(e) { console.error('Board check error:', e.message); }

      const isOnProposalBoard = String(currentBoard) === String(monday.BOARDS.proposal);

      // Negotiations board stages
      const negotiationsMap = {
        discovery: 'DISCOVERY CALLS',
        followup: 'FOLLOW UP EMAILS / CALLS',
        sequence: 'SEQUENCE CALL',
        waiting: 'WAITING FOR CLIENTS',
        qualified: 'QUALIFIED LEADS',
        closed: 'CLOSED DEALS',
        lost: 'LOST',
        help: 'HELP REQUIRED',
      };

      // Proposals board stages
      const proposalsMap = {
        proposal_followup: monday.PROPOSAL_GROUPS.follow_up,
        sent_proposals: monday.PROPOSAL_GROUPS.sent_proposals,
        started: monday.PROPOSAL_GROUPS.started_projects,
        new_requests: monday.PROPOSAL_GROUPS.new_requests,
        // If on proposal board and rep clicks followup — go to proposal follow up
        followup: monday.PROPOSAL_GROUPS.follow_up,
      };

      if (isOnProposalBoard && proposalsMap[stage]) {
        await monday.moveToGroup(monday.BOARDS.proposal, mondayId, proposalsMap[stage]);
      } else if (!isOnProposalBoard && negotiationsMap[stage]) {
        const groupId = await monday.getGroupId(monday.BOARDS.negotiations, negotiationsMap[stage]);
        if (groupId) await monday.moveToGroup(monday.BOARDS.negotiations, mondayId, groupId);
      } else if (proposalsMap[stage] && stage !== 'followup') {
        // Explicit proposal board stages always go to proposal board
        await monday.moveToGroup(monday.BOARDS.proposal, mondayId, proposalsMap[stage]);
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
