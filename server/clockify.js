// clockify.js — Clockify → monday.com Time Sheet sync (replaces Make "Clockify: Add Timetracker")
//
// Webhook:   POST /api/clockify-webhook          (Clockify events: new / updated / stopped / deleted)
//            POST /api/clockify-webhook?event=deleted   (use this URL for the "Time entry deleted" webhook)
// Catch-up:  every 6 hours the last 48 h of Clockify entries are re-checked (heals missed webhooks)
// Admin:     GET  /api/admin/clockify/status
//            POST /api/admin/clockify/resync   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
//
// Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID, CLOCKIFY_WEBHOOK_SECRETS (comma-separated signing
//      tokens, one per Clockify webhook), optional CLOCKIFY_API_BASE (default https://api.clockify.me/api/v1)
//
// Rules (from the monday design, Oct 2026):
//  - one Time Sheet row per Clockify time entry, keyed on the Clockify entry ID (idempotent)
//  - COST ($) comes from Clockify's cost rate x duration; pay rates are never stored on monday
//  - existing rows (made by Make) are adopted by matching user + start time to the minute
//  - deleted entries are ARCHIVED on monday (never deleted) and unlinked from Job Costing

const fetch = require('node-fetch');

const TS_BOARD = '18388613071';          // Time Sheet
const TS = {
  user: 'text_mkxzy46w',                 // T.M
  date: 'date_mkxzkghy',                 // Date
  start: 'date_mkya3d39',                // Start
  end: 'date_mkya4e12',                  // End
  notes: 'long_text_mkxzxz9',            // Notes
  job: 'text_mm83m3',                    // JOB NUMBER
  hours: 'numeric_mm83vgme',             // HOURS (h)
  cost: 'numeric_mm83xsyn',              // COST ($)
  type: 'color_mm83wfr0',                // ENTRY TYPE: JOB / BREAK / OVERHEAD / CHECK JOB
  stage: 'text_mm835g41',                // STAGE TAG
};
const JC_BOARD = '18435257917';          // Job Costing
const JC = {
  timeEntries: 'board_relation_mm83yqmm',
  job: 'text_mm83edyg',
  client: 'text_mm83hnw8',
  status: 'color_mm83rtra',
  sourceProposal: 'text_mm83cvva',
  clockifyProject: 'text_mm85rb64',
};
const OP_BOARD = '18388615760';          // Overall Projects
const OP = { sourceProposal: 'text_mm83tq9f', clockifyProject: 'text_mm85hfk6' };

const JOB_RE = /\b([A-Z]{3}\d{3})\b/i;
const BNE_OFFSET_MS = 10 * 3600 * 1000;  // Brisbane, UTC+10, no daylight saving

let deps = null;                         // { db, monday }
let chain = Promise.resolve();           // all Clockify work runs one at a time (no duplicate rows)
const stats = { received: 0, processed: 0, created: 0, updated: 0, adopted: 0, archived: 0, skipped: 0, errors: 0, lastEventAt: null, lastError: null, lastCatchUp: null };

// ── small helpers ───────────────────────────────────────────────────────────
function dbRun(sql, p) { return new Promise((res, rej) => deps.db.run(sql, p || [], function (e) { e ? rej(e) : res(this); })); }
function dbGet(sql, p) { return new Promise((res, rej) => deps.db.get(sql, p || [], (e, r) => e ? rej(e) : res(r))); }
function mq(q, v) { return deps.monday.queryFresh(q, v); }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = n => String(n).padStart(2, '0');
function utcParts(d) { return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` }; }
function bneDate(d) { return utcParts(new Date(d.getTime() + BNE_OFFSET_MS)).date; }
function minuteKey(d) { const p = utcParts(d); return p.date + 'T' + p.time.slice(0, 5); }

function enqueue(label, fn) {
  chain = chain.then(fn).catch(e => { stats.errors++; stats.lastError = `${label}: ${e.message}`; console.error('Clockify', label, 'error:', e.message); });
  return chain;
}

// ── Clockify API ────────────────────────────────────────────────────────────
function cfgOk() { return !!(process.env.CLOCKIFY_API_KEY && process.env.CLOCKIFY_WORKSPACE_ID); }
function base() { return (process.env.CLOCKIFY_API_BASE || 'https://api.clockify.me/api/v1').replace(/\/$/, ''); }
async function cf(method, path, body) {
  if (!cfgOk()) throw new Error('CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID not set');
  const url = `${base()}/workspaces/${process.env.CLOCKIFY_WORKSPACE_ID}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-Api-Key': process.env.CLOCKIFY_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error(`Clockify ${method} ${path} → ${res.status} ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return data;
}

const cache = { users: null, usersAt: 0, tags: null, tagsAt: 0, projects: {} };
async function getUsers(force) {
  if (!force && cache.users && Date.now() - cache.usersAt < 3600e3) return cache.users;
  const list = await cf('GET', '/users?page-size=200&memberships=WORKSPACE');
  cache.users = {}; (list || []).forEach(u => { cache.users[u.id] = u; });
  cache.usersAt = Date.now();
  return cache.users;
}
async function getTags(force) {
  if (!force && cache.tags && Date.now() - cache.tagsAt < 3600e3) return cache.tags;
  const list = await cf('GET', '/tags?page-size=500');
  cache.tags = {}; (list || []).forEach(t => { cache.tags[t.id] = t.name; });
  cache.tagsAt = Date.now();
  return cache.tags;
}
async function getProject(id) {
  if (!id) return null;
  if (cache.projects[id] && Date.now() - cache.projects[id].at < 600e3) return cache.projects[id].p;
  const p = await cf('GET', `/projects/${id}`).catch(() => null);
  cache.projects[id] = { p, at: Date.now() };
  return p;
}

// Cost rate in the entry (cents per hour). Falls back to the user's workspace cost rate.
function rateFrom(obj) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'object' && obj.amount != null) return Number(obj.amount);
  return null;
}
async function resolveCost(entry, hours) {
  let cents = rateFrom(entry.costRate);
  if (cents == null && entry.id) {
    const full = await cf('GET', `/time-entries/${entry.id}?hydrated=true`).catch(() => null);
    cents = rateFrom(full && full.costRate);
  }
  if (cents == null) {
    const users = await getUsers().catch(() => ({}));
    const u = users[entry.userId];
    const m = u && (u.memberships || []).find(x => x.targetId === process.env.CLOCKIFY_WORKSPACE_ID);
    cents = rateFrom(m && m.costRate);
  }
  if (cents == null) return null;
  return Math.round((cents / 100) * hours * 100) / 100;
}

function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

// Turn any Clockify time-entry payload into the fields we need
async function normaliseEntry(e) {
  const ti = e.timeInterval || {};
  const start = ti.start ? new Date(ti.start) : null;
  const end = ti.end ? new Date(ti.end) : null;
  let seconds = parseDuration(ti.duration);
  if (seconds == null && start && end) seconds = (end - start) / 1000;
  const hours = seconds != null ? Math.round((seconds / 3600) * 100) / 100 : null;

  let userName = (e.user && e.user.name) || e.userName || '';
  if (!userName && e.userId) { const users = await getUsers().catch(() => ({})); userName = (users[e.userId] || {}).name || ''; }
  if (!userName && e.userId) { const users = await getUsers(true).catch(() => ({})); userName = (users[e.userId] || {}).name || ''; }

  let project = e.project && e.project.name ? e.project : null;
  if (!project && e.projectId) project = await getProject(e.projectId);
  const projectName = (project && project.name) || '';
  const clientName = (project && project.clientName) || (e.project && e.project.clientName) || '';
  const clientId = (project && project.clientId) || '';

  let tagNames = (e.tags || []).map(t => t && t.name).filter(Boolean);
  if (!tagNames.length && (e.tagIds || []).length) {
    let tags = await getTags().catch(() => ({}));
    if (e.tagIds.some(id => !tags[id])) tags = await getTags(true).catch(() => ({}));
    tagNames = e.tagIds.map(id => tags[id]).filter(Boolean);
  }

  const description = e.description || '';
  let jobNumber = '';
  if (/^[A-Z]{3}\d{3}$/i.test(projectName.trim())) jobNumber = projectName.trim().toUpperCase();
  else { const m = JOB_RE.exec(description); if (m) jobNumber = m[1].toUpperCase(); }

  return {
    id: e.id, userId: e.userId, userName, projectId: e.projectId || (project && project.id) || '',
    projectName, clientName, clientId, description, tagNames, jobNumber, start, end, hours, raw: e,
  };
}

// ── monday helpers ──────────────────────────────────────────────────────────
async function findItemsByColumn(boardId, colId, value, colIds) {
  const cols = JSON.stringify(colIds || []);
  const out = [];
  let data = await mq(`query($b: ID!, $c: String!, $v: [String]!) {
    items_page_by_column_values(board_id: $b, limit: 200, columns: [{ column_id: $c, column_values: $v }]) {
      cursor items { id name state column_values(ids: ${cols}) { id text value ... on BoardRelationValue { linked_item_ids } } }
    } }`, { b: String(boardId), c: colId, v: [String(value)] });
  let page = data && data.items_page_by_column_values;
  while (page) {
    (page.items || []).forEach(i => out.push(i));
    if (!page.cursor) break;
    data = await mq(`query($cur: String!) { next_items_page(limit: 200, cursor: $cur) {
      cursor items { id name state column_values(ids: ${cols}) { id text value ... on BoardRelationValue { linked_item_ids } } } } }`, { cur: page.cursor });
    page = data && data.next_items_page;
  }
  return out.filter(i => !i.state || i.state === 'active');
}
const colText = (item, id) => ((item.column_values || []).find(c => c.id === id) || {}).text || '';
const colVal = (item, id) => ((item.column_values || []).find(c => c.id === id) || {}).value || '';

async function setColumns(boardId, itemId, values) {
  return mq(`mutation($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`,
    { b: String(boardId), i: String(itemId), v: JSON.stringify(values) });
}
// Writes everything; if a status label is rejected, retries without the status columns so the row still lands
async function setColumnsSafe(boardId, itemId, values, statusCols) {
  try { return await setColumns(boardId, itemId, values); }
  catch (e) {
    const rest = { ...values }; (statusCols || []).forEach(c => delete rest[c]);
    if (Object.keys(rest).length === Object.keys(values).length) throw e;
    console.error('Clockify: status label rejected, writing other columns only:', e.message);
    return setColumns(boardId, itemId, rest);
  }
}

// ── Job Costing link ────────────────────────────────────────────────────────
const jcLocks = {};
function withLock(key, fn) { const prev = jcLocks[key] || Promise.resolve(); const next = prev.then(fn, fn); jcLocks[key] = next.catch(() => {}); return next; }

async function readLinked(jcId) {
  const d = await mq(`query($i: [ID!]) { items(ids: $i) { id column_values(ids: ["${JC.timeEntries}"]) { id ... on BoardRelationValue { linked_item_ids } } } }`, { i: [String(jcId)] });
  const cv = (((d && d.items) || [])[0] || {}).column_values || [];
  return ((cv[0] || {}).linked_item_ids || []).map(String);
}
async function linkTimeEntry(jcId, tsId, add) {
  if (!jcId) return;
  return withLock('jc' + jcId, async () => {
    const ids = await readLinked(jcId);
    const has = ids.includes(String(tsId));
    if (add && has) return; if (!add && !has) return;
    const next = add ? [...ids, String(tsId)] : ids.filter(x => x !== String(tsId));
    await setColumns(JC_BOARD, jcId, { [JC.timeEntries]: { item_ids: next.map(Number) } });
  });
}

// Decide which Job Costing item (if any) an entry belongs to, and the ENTRY TYPE
async function resolveJob(n) {
  const isBreak = n.tagNames.some(t => /\bbreak\b/i.test(t));
  if (isBreak) return { type: 'BREAK', jcId: null };

  // 1) Clockify project ID stored on Job Costing / Overall Projects
  if (n.projectId) {
    const jc = await findItemsByColumn(JC_BOARD, JC.clockifyProject, n.projectId, []);
    if (jc.length) return { type: 'JOB', jcId: jc[0].id };
    const op = await findItemsByColumn(OP_BOARD, OP.clockifyProject, n.projectId, [OP.sourceProposal]);
    const srcId = op.length ? colText(op[0], OP.sourceProposal) : '';
    if (srcId) {
      const jc2 = await findItemsByColumn(JC_BOARD, JC.sourceProposal, srcId, []);
      if (jc2.length) return { type: 'JOB', jcId: jc2[0].id };
    }
  }
  if (!n.jobNumber) return { type: 'OVERHEAD', jcId: null };

  // 2) Job number + client name
  const cands = await findItemsByColumn(JC_BOARD, JC.job, n.jobNumber, [JC.client]);
  const cn = norm(n.clientName), desc = norm(n.description);
  const clientOf = i => norm(colText(i, JC.client)) || norm(i.name.replace(/^[A-Z]{3}\d{3}\s*-\s*/i, ''));
  let match = cn ? cands.find(i => { const c = clientOf(i); return c && (c === cn || c.includes(cn) || cn.includes(c)); }) : null;
  if (!match) match = cands.find(i => { const c = clientOf(i); return c && c.length > 3 && desc.includes(c); });
  if (match) return { type: 'JOB', jcId: match.id };
  const distinctClients = new Set(cands.map(clientOf).filter(Boolean));
  if (cands.length === 1 && !cn) return { type: 'JOB', jcId: cands[0].id };
  if (distinctClients.size > 1) return { type: 'CHECK JOB', jcId: null };

  // 3) No Job Costing item for this job/client yet → create one flagged CHECK
  const name = `${n.jobNumber} - ${n.clientName || 'Unknown client'}`;
  const created = await mq(`mutation($b: ID!, $n: String!, $v: JSON!) { create_item(board_id: $b, item_name: $n, column_values: $v) { id } }`,
    { b: JC_BOARD, n: name, v: JSON.stringify({ [JC.job]: n.jobNumber, [JC.client]: n.clientName || '' }) });
  const jcId = created && created.create_item && created.create_item.id;
  if (jcId) await setColumns(JC_BOARD, jcId, { [JC.status]: { label: 'CHECK' } }).catch(e => console.error('JC status CHECK error:', e.message));
  console.log('Clockify: created Job Costing item', name, jcId);
  return { type: 'JOB', jcId };
}

// ── local map (SQLite) ──────────────────────────────────────────────────────
async function ensureTables() {
  await dbRun(`CREATE TABLE IF NOT EXISTS clockify_entries (
    entry_id TEXT PRIMARY KEY,
    monday_item_id TEXT,
    job_costing_id TEXT,
    hash TEXT,
    deleted INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

// Find an existing Time Sheet row for this entry (by stored Clockify ID, or by user + start minute)
async function findExistingRow(n) {
  if (!n.userName || !n.start) return null;
  const rows = await findItemsByColumn(TS_BOARD, TS.user, n.userName, [TS.start, TS.notes]);
  const tag = `Clockify ID: ${n.id}`;
  const byId = rows.find(r => colText(r, TS.notes).includes(tag));
  if (byId) return byId.id;
  const keys = new Set([minuteKey(n.start), minuteKey(new Date(n.start.getTime() + BNE_OFFSET_MS))]);
  const byTime = rows.find(r => {
    if (/Clockify ID: /.test(colText(r, TS.notes))) return false;      // already belongs to another entry
    let v; try { v = JSON.parse(colVal(r, TS.start) || '{}'); } catch (e) { v = {}; }
    if (!v.date || !v.time) return false;
    return keys.has(v.date + 'T' + String(v.time).slice(0, 5));
  });
  return byTime ? byTime.id : null;
}

// ── main upsert / delete ────────────────────────────────────────────────────
async function upsertEntry(rawEntry, source) {
  const n = await normaliseEntry(rawEntry);
  if (!n.id) { stats.skipped++; return { skipped: 'no id' }; }
  if (!n.start || !n.end) { stats.skipped++; return { skipped: 'timer still running' }; }

  const cost = n.hours != null ? await resolveCost(rawEntry, n.hours) : null;
  const notes = [
    `Project: ${n.projectName || '—'}${n.clientName ? ' (' + n.clientName + ')' : ''}`,
    `Description: ${n.description || '—'}`,
    `Tag: ${n.tagNames.join(', ') || '—'}`,
    `Clockify ID: ${n.id}`,
  ].join('\n');
  const hash = JSON.stringify([n.userName, n.start.toISOString(), n.end.toISOString(), n.projectId, n.description, n.tagNames, n.hours, cost]);

  const row = await dbGet('SELECT * FROM clockify_entries WHERE entry_id = ?', [n.id]);
  if (row && !row.deleted && row.hash === hash && row.monday_item_id) { stats.skipped++; return { skipped: 'unchanged', itemId: row.monday_item_id }; }

  const job = await resolveJob(n);
  const s = utcParts(n.start), e = utcParts(n.end);
  const values = {
    [TS.user]: n.userName,
    [TS.date]: { date: bneDate(n.start) },
    [TS.start]: { date: s.date, time: s.time },
    [TS.end]: { date: e.date, time: e.time },
    [TS.notes]: { text: notes },
    [TS.job]: n.jobNumber || '',
    [TS.hours]: n.hours != null ? String(n.hours) : '',
    [TS.cost]: cost != null ? String(cost) : '',
    [TS.type]: { label: job.type },
    [TS.stage]: n.tagNames.join(', '),
  };

  let itemId = row && !row.deleted ? row.monday_item_id : null;
  let action = 'updated';
  if (!itemId) {
    itemId = await findExistingRow(n);
    if (itemId) action = 'adopted';
  }
  if (!itemId) {
    const name = [n.userName, n.jobNumber || n.projectName || 'No project', n.description].filter(Boolean).join(' | ').slice(0, 120);
    const created = await mq(`mutation($b: ID!, $n: String!) { create_item(board_id: $b, item_name: $n) { id } }`, { b: TS_BOARD, n: name });
    itemId = created && created.create_item && created.create_item.id;
    if (!itemId) throw new Error('Time Sheet create_item returned no id');
    action = 'created';
  }
  await setColumnsSafe(TS_BOARD, itemId, values, [TS.type]);

  // Job Costing link (move it if the job changed)
  const prevJc = row && row.job_costing_id;
  if (prevJc && prevJc !== String(job.jcId || '')) await linkTimeEntry(prevJc, itemId, false).catch(err => console.error('JC unlink error:', err.message));
  if (job.jcId) await linkTimeEntry(job.jcId, itemId, true);

  await dbRun(`INSERT INTO clockify_entries (entry_id, monday_item_id, job_costing_id, hash, deleted, updated_at)
               VALUES (?, ?, ?, ?, 0, datetime('now'))
               ON CONFLICT(entry_id) DO UPDATE SET monday_item_id = excluded.monday_item_id, job_costing_id = excluded.job_costing_id,
               hash = excluded.hash, deleted = 0, updated_at = datetime('now')`,
    [n.id, String(itemId), job.jcId ? String(job.jcId) : null, hash]);

  stats[action]++; stats.processed++;
  console.log(`Clockify ${source}: ${action} Time Sheet ${itemId} for entry ${n.id} (${n.userName}, ${n.jobNumber || 'no job'}, ${job.type})`);
  return { itemId, action, type: job.type, jcId: job.jcId };
}

async function deleteEntry(rawEntry) {
  const id = rawEntry && (rawEntry.id || rawEntry.timeEntryId);
  if (!id) return { skipped: 'no id' };
  const row = await dbGet('SELECT * FROM clockify_entries WHERE entry_id = ?', [id]);
  let itemId = row && row.monday_item_id;
  if (!itemId) { const n = await normaliseEntry(rawEntry).catch(() => null); if (n) itemId = await findExistingRow(n); }
  if (!itemId) { stats.skipped++; return { skipped: 'no matching row' }; }
  if (row && row.job_costing_id) await linkTimeEntry(row.job_costing_id, itemId, false).catch(e => console.error('JC unlink error:', e.message));
  await mq(`mutation($i: ID!) { archive_item(item_id: $i) { id } }`, { i: String(itemId) });   // archive, never delete
  await dbRun(`INSERT INTO clockify_entries (entry_id, monday_item_id, deleted, updated_at) VALUES (?, ?, 1, datetime('now'))
               ON CONFLICT(entry_id) DO UPDATE SET deleted = 1, updated_at = datetime('now')`, [id, String(itemId)]);
  stats.archived++; stats.processed++;
  console.log('Clockify: archived Time Sheet', itemId, 'for deleted entry', id);
  return { itemId, action: 'archived' };
}

// ── catch-up sync ───────────────────────────────────────────────────────────
async function syncRange(fromIso, toIso) {
  const users = await getUsers(true);
  let count = 0;
  for (const uid of Object.keys(users)) {
    for (let page = 1; page < 50; page++) {
      const list = await cf('GET', `/user/${uid}/time-entries?start=${encodeURIComponent(fromIso)}&end=${encodeURIComponent(toIso)}&hydrated=true&page=${page}&page-size=200`);
      if (!Array.isArray(list) || !list.length) break;
      for (const e of list) {
        if (!e.userId) e.userId = uid;
        if (!e.user) e.user = { name: users[uid].name };
        await upsertEntry(e, 'catch-up').catch(err => { stats.errors++; stats.lastError = 'catch-up: ' + err.message; console.error('Clockify catch-up entry error:', err.message); });
        count++;
      }
      if (list.length < 200) break;
    }
  }
  stats.lastCatchUp = new Date().toISOString();
  return count;
}

// ── webhook signature ───────────────────────────────────────────────────────
function signatureOk(req) {
  const secrets = String(process.env.CLOCKIFY_WEBHOOK_SECRETS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!secrets.length) return false;
  const got = String(req.get('clockify-signature') || '').trim();
  return !!got && secrets.includes(got);
}

// ── routes ──────────────────────────────────────────────────────────────────
function init({ app, db, monday, requireAuth, requireAdmin }) {
  deps = { db, monday };
  ensureTables().catch(e => console.error('Clockify tables error:', e.message));

  app.post('/api/clockify-webhook', (req, res) => {
    if (!signatureOk(req)) {
      console.error('Clockify webhook rejected: bad or missing clockify-signature (check CLOCKIFY_WEBHOOK_SECRETS)');
      return res.status(401).json({ error: 'invalid signature' });
    }
    stats.received++; stats.lastEventAt = new Date().toISOString();
    const evt = String(req.get('clockify-webhook-event-type') || req.query.event || '').toUpperCase();
    const body = req.body || {};
    res.json({ ok: true });                       // answer fast; work happens in the queue
    if (evt.includes('DELETED')) enqueue('delete', () => deleteEntry(body));
    else enqueue('upsert', () => upsertEntry(body, evt || 'webhook'));
  });

  app.get('/api/admin/clockify/status', requireAuth, requireAdmin, async (req, res) => {
    const mapped = await dbGet('SELECT COUNT(*) AS n, SUM(deleted) AS d FROM clockify_entries').catch(() => ({ n: 0, d: 0 }));
    res.json({
      configured: cfgOk(),
      webhookSecretsSet: !!process.env.CLOCKIFY_WEBHOOK_SECRETS,
      entriesMapped: mapped ? mapped.n : 0, entriesArchived: mapped ? (mapped.d || 0) : 0,
      ...stats,
    });
  });

  app.post('/api/admin/clockify/resync', requireAuth, requireAdmin, async (req, res) => {
    try {
      const from = req.body.from ? new Date(req.body.from + 'T00:00:00+10:00') : new Date(Date.now() - 2 * 86400e3);
      const to = req.body.to ? new Date(req.body.to + 'T23:59:59+10:00') : new Date();
      res.json({ ok: true, started: true, from: from.toISOString(), to: to.toISOString() });
      enqueue('resync', async () => { const n = await syncRange(from.toISOString(), to.toISOString()); console.log('Clockify resync done:', n, 'entries checked'); });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Every 6 hours: re-check the last 48 h (heals any missed webhook). Unchanged entries are skipped.
  if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
      if (!cfgOk()) return;
      enqueue('catch-up', () => syncRange(new Date(Date.now() - 48 * 3600e3).toISOString(), new Date().toISOString()));
    }, 6 * 3600e3);
  }
}

module.exports = { init, cf, cfgOk, upsertEntry, deleteEntry, syncRange, normaliseEntry, parseDuration, stats, _test: { setDeps: d => { deps = d; }, ensureTables, resolveJob, findExistingRow } };
