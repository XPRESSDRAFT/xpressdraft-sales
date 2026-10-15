// engagement.js — when a proposal reaches STARTED PROJECTS, set the job up in Clockify
//
// Triggers (any of them; the work is idempotent):
//   - PandaDoc payment webhook moves a deal to STARTED PROJECTS (pandadoc.js calls enqueue)
//   - Proposals webhook 610674462 reports DEAL CLOSED date / PROJECT STARTED status (index.js calls enqueue)
//   - a watcher checks the STARTED PROJECTS group every 2 minutes and queues any item it hasn't seen
//     (on first run it only records what is already there, so old jobs are never touched)
//
// For each queued proposal (after ~60 s, so monday's W4 workflow has created the Overall Projects item):
//   1. find Overall Projects item where SOURCE PROPOSAL ID = proposal item ID (retry up to ~20 min, then email Luiz)
//   2. if CLOCKIFY PROJECT ID is already filled → done (never a second project)
//   3. job number = Proposals Job Number, else the Job Number tag; none → email Luiz, create nothing
//   4. Clockify client: reuse Clients › CLOCKIFY CLIENT ID, else find by exact name, else create; store the ID
//   5. Clockify project named exactly the job number, under that client (reuse if it already exists for that client)
//   6. write CLOCKIFY PROJECT ID to Overall Projects and to the job's Job Costing item
//
// Admin: GET /api/admin/engagements   POST /api/admin/engagements/:proposalId/retry

const clockify = require('./clockify');

const PROP_BOARD = '18389820785';
const STARTED_GROUP = 'group_mky4ey72';
const PROP = { jobNumber: 'text_mky9p0t3', jobTag: 'tag_mky11he9', email: 'email_mky1wg4h' };
const OP_BOARD = '18388615760';
const OP = { sourceProposal: 'text_mm83tq9f', clockifyProject: 'text_mm85hfk6' };
const JC_BOARD = '18435257917';
const JC = { sourceProposal: 'text_mm83cvva', clockifyProject: 'text_mm85rb64' };
const CLIENTS_BOARD = '18388617547';
const CLIENTS = { clockifyClient: 'text_mm854b1s' };

const FIRST_DELAY_MS = 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 10;

let deps = null;               // { db, monday, emailModule }
const pending = [];            // enqueue() calls made before init()
let running = false;

function dbRun(sql, p) { return new Promise((res, rej) => deps.db.run(sql, p || [], function (e) { e ? rej(e) : res(this); })); }
function dbGet(sql, p) { return new Promise((res, rej) => deps.db.get(sql, p || [], (e, r) => e ? rej(e) : res(r))); }
function dbAll(sql, p) { return new Promise((res, rej) => deps.db.all(sql, p || [], (e, r) => e ? rej(e) : res(r || []))); }
function mq(q, v) { return deps.monday.queryFresh(q, v); }
const colText = (item, id) => ((item.column_values || []).find(c => c.id === id) || {}).text || '';
const sameName = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function ensureTables() {
  await dbRun(`CREATE TABLE IF NOT EXISTS engagements (
    proposal_item_id TEXT PRIMARY KEY,
    source TEXT,
    status TEXT DEFAULT 'queued',
    attempts INTEGER DEFAULT 0,
    next_try_at INTEGER,
    last_error TEXT,
    clockify_client_id TEXT,
    clockify_project_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT)`);
}

function enqueue(proposalItemId, source) {
  if (!proposalItemId) return;
  if (!deps) { pending.push([String(proposalItemId), source]); return; }
  dbRun(`INSERT OR IGNORE INTO engagements (proposal_item_id, source, status, attempts, next_try_at) VALUES (?, ?, 'queued', 0, ?)`,
    [String(proposalItemId), source || '', Date.now() + FIRST_DELAY_MS])
    .then(r => { if (r.changes) console.log('Engagement queued:', proposalItemId, 'from', source); })
    .catch(e => console.error('Engagement enqueue error:', e.message));
}

async function alertLuiz(subject, html) {
  try {
    if (deps.emailModule && deps.emailModule.sendEmail) {
      await deps.emailModule.sendEmail(process.env.ALERT_EMAIL || 'info@xpressdraft.com.au', subject, html);
    }
  } catch (e) { console.error('Alert email failed:', e.message); }
}

async function findByColumn(boardId, colId, value, colIds) {
  const d = await mq(`query($b: ID!, $c: String!, $v: [String]!) {
    items_page_by_column_values(board_id: $b, limit: 50, columns: [{ column_id: $c, column_values: $v }]) {
      items { id name state column_values(ids: ${JSON.stringify(colIds || [])}) { id text } } } }`,
    { b: String(boardId), c: colId, v: [String(value)] });
  return ((d && d.items_page_by_column_values && d.items_page_by_column_values.items) || []).filter(i => !i.state || i.state === 'active');
}
async function setText(boardId, itemId, colId, text) {
  return mq(`mutation($b: ID!, $i: ID!, $c: String!, $v: String) { change_simple_column_value(board_id: $b, item_id: $i, column_id: $c, value: $v) { id } }`,
    { b: String(boardId), i: String(itemId), c: colId, v: String(text) });
}

// Clients board: find the item by email (column found by type, so it survives renames)
let clientsEmailCol = null;
async function findClientItem(email) {
  if (!email) return null;
  if (!clientsEmailCol) {
    const d = await mq(`query { boards(ids: ["${CLIENTS_BOARD}"]) { columns { id type } } }`);
    const col = (((d && d.boards) || [])[0] || {}).columns || [];
    clientsEmailCol = (col.find(c => c.type === 'email') || {}).id || null;
  }
  if (!clientsEmailCol) return null;
  const items = await findByColumn(CLIENTS_BOARD, clientsEmailCol, email, [CLIENTS.clockifyClient]);
  return items[0] || null;
}

async function getOrCreateClockifyClient(name, storedId) {
  if (storedId) {
    const c = await clockify.cf('GET', `/clients/${storedId}`).catch(() => null);
    if (c && c.id) return c.id;
  }
  const list = await clockify.cf('GET', `/clients?name=${encodeURIComponent(name)}&page-size=200`);
  const hit = (list || []).find(c => sameName(c.name, name) && !c.archived);
  if (hit) return hit.id;
  const created = await clockify.cf('POST', '/clients', { name });
  console.log('Clockify client created:', name, created.id);
  return created.id;
}

async function getOrCreateClockifyProject(jobNumber, clientId) {
  const list = await clockify.cf('GET', `/projects?name=${encodeURIComponent(jobNumber)}&clients=${clientId}&page-size=200`);
  const hit = (list || []).find(p => p.name === jobNumber && p.clientId === clientId);   // only this client's project
  if (hit) return hit.id;
  const created = await clockify.cf('POST', '/projects', { name: jobNumber, clientId, billable: true, isPublic: true });
  console.log('Clockify project created:', jobNumber, 'for client', clientId, '→', created.id);
  return created.id;
}

async function processOne(row) {
  const pid = row.proposal_item_id;
  const fail = async (msg, final) => {
    const attempts = row.attempts + 1;
    const giveUp = final || attempts >= MAX_ATTEMPTS;
    await dbRun(`UPDATE engagements SET attempts = ?, last_error = ?, status = ?, next_try_at = ?, updated_at = datetime('now') WHERE proposal_item_id = ?`,
      [attempts, msg, giveUp ? 'failed' : 'queued', Date.now() + RETRY_MS, pid]);
    console.log('Engagement', pid, giveUp ? 'FAILED:' : 'retry later:', msg);
    if (giveUp) await alertLuiz(`Clockify set-up needs you: proposal ${pid}`,
      `<p>The Sales system could not set up Clockify for proposal item <b>${pid}</b>.</p><p>Reason: ${msg}</p><p>Fix it on monday, then use Admin → Integrations → Retry.</p>`);
  };

  if (!clockify.cfgOk()) return fail('CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID not set');

  // Proposal item
  const pd = await mq(`query($i: [ID!]) { items(ids: $i) { id name state group { id } column_values(ids: ["${PROP.jobNumber}","${PROP.jobTag}","${PROP.email}"]) { id text } } }`, { i: [pid] });
  const prop = ((pd && pd.items) || [])[0];
  if (!prop) return fail('proposal item not found on monday', true);

  // Overall Projects item created by W4
  const ops = await findByColumn(OP_BOARD, OP.sourceProposal, pid, [OP.clockifyProject]);
  if (!ops.length) return fail('Overall Projects item (SOURCE PROPOSAL ID = ' + pid + ') not found yet');
  const op = ops[0];
  const jcs = await findByColumn(JC_BOARD, JC.sourceProposal, pid, [JC.clockifyProject]);
  const jc = jcs[0] || null;

  const existing = colText(op, OP.clockifyProject);
  if (existing) {
    if (jc && !colText(jc, JC.clockifyProject)) await setText(JC_BOARD, jc.id, JC.clockifyProject, existing);
    await dbRun(`UPDATE engagements SET status = 'done', clockify_project_id = ?, last_error = NULL, updated_at = datetime('now') WHERE proposal_item_id = ?`, [existing, pid]);
    console.log('Engagement', pid, 'already has Clockify project', existing);
    return;
  }

  // Job number exactly as registered
  const jobNumber = (colText(prop, PROP.jobNumber) || colText(prop, PROP.jobTag).split(',')[0] || '').trim();
  if (!jobNumber) return fail(`proposal "${prop.name}" has no job number (Job Number column and tag are both empty)`, true);

  // Client
  const email = colText(prop, PROP.email).trim();
  const clientItem = await findClientItem(email).catch(() => null);
  const clientName = (clientItem && clientItem.name) || prop.name.split(/\s+[-–]\s+/)[0].trim();
  if (!clientName) return fail('could not work out the client name', true);
  const storedClientId = clientItem ? colText(clientItem, CLIENTS.clockifyClient) : '';
  const clientId = await getOrCreateClockifyClient(clientName, storedClientId);
  if (clientItem && storedClientId !== clientId) await setText(CLIENTS_BOARD, clientItem.id, CLIENTS.clockifyClient, clientId);

  // Project
  const projectId = await getOrCreateClockifyProject(jobNumber, clientId);
  await setText(OP_BOARD, op.id, OP.clockifyProject, projectId);
  if (jc) await setText(JC_BOARD, jc.id, JC.clockifyProject, projectId);
  else console.log('Engagement', pid, ': no Job Costing item with that SOURCE PROPOSAL ID yet (Overall Projects updated)');

  await dbRun(`UPDATE engagements SET status = 'done', clockify_client_id = ?, clockify_project_id = ?, last_error = NULL, updated_at = datetime('now') WHERE proposal_item_id = ?`,
    [clientId, projectId, pid]);
  console.log(`Engagement ${pid} done: client "${clientName}" ${clientId}, project ${jobNumber} ${projectId}`);
}

async function processDue() {
  if (running || !deps) return;
  running = true;
  try {
    const due = await dbAll(`SELECT * FROM engagements WHERE status = 'queued' AND (next_try_at IS NULL OR next_try_at <= ?) ORDER BY next_try_at LIMIT 10`, [Date.now()]);
    for (const row of due) {
      try { await processOne(row); }
      catch (e) {
        console.error('Engagement', row.proposal_item_id, 'error:', e.message);
        await dbRun(`UPDATE engagements SET attempts = attempts + 1, last_error = ?, next_try_at = ?, status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'queued' END, updated_at = datetime('now') WHERE proposal_item_id = ?`,
          [e.message, Date.now() + RETRY_MS, MAX_ATTEMPTS, row.proposal_item_id]).catch(() => {});
      }
    }
  } finally { running = false; }
}

// Watch STARTED PROJECTS for items that arrived there by any route (button, W3 status, manual drag)
async function startedItemIds() {
  const ids = [];
  let d = await mq(`query { boards(ids: ["${PROP_BOARD}"]) { groups(ids: ["${STARTED_GROUP}"]) { items_page(limit: 500) { cursor items { id } } } } }`);
  let page = ((((d && d.boards) || [])[0] || {}).groups || [])[0];
  page = page && page.items_page;
  while (page) {
    (page.items || []).forEach(i => ids.push(String(i.id)));
    if (!page.cursor) break;
    d = await mq(`query($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { id } } }`, { c: page.cursor });
    page = d && d.next_items_page;
  }
  return ids;
}
async function watch() {
  if (!deps) return;
  try {
    const ids = await startedItemIds();
    const snap = await dbGet(`SELECT value FROM app_state WHERE key = 'started_snapshot_done'`);
    if (!snap) {
      for (const id of ids) await dbRun(`INSERT OR IGNORE INTO engagements (proposal_item_id, source, status) VALUES (?, 'pre-existing', 'pre-existing')`, [id]);
      await dbRun(`INSERT OR REPLACE INTO app_state (key, value) VALUES ('started_snapshot_done', ?)`, [new Date().toISOString()]);
      console.log('Engagement watcher: recorded', ids.length, 'existing STARTED PROJECTS items (they will not be touched)');
      return;
    }
    for (const id of ids) enqueue(id, 'watcher');
  } catch (e) { console.error('Engagement watcher error:', e.message); }
}

function init({ app, db, monday, emailModule, requireAuth, requireAdmin }) {
  deps = { db, monday, emailModule };
  ensureTables().then(() => { pending.splice(0).forEach(([id, src]) => enqueue(id, src)); })
    .catch(e => console.error('Engagement tables error:', e.message));

  app.get('/api/admin/engagements', requireAuth, requireAdmin, async (req, res) => {
    const rows = await dbAll(`SELECT * FROM engagements WHERE status != 'pre-existing' ORDER BY updated_at DESC LIMIT 50`).catch(() => []);
    const counts = await dbAll(`SELECT status, COUNT(*) AS n FROM engagements GROUP BY status`).catch(() => []);
    res.json({ counts, recent: rows });
  });
  app.post('/api/admin/engagements/:id/retry', requireAuth, requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    await dbRun(`INSERT INTO engagements (proposal_item_id, source, status, attempts, next_try_at) VALUES (?, 'manual', 'queued', 0, ?)
                 ON CONFLICT(proposal_item_id) DO UPDATE SET status = 'queued', attempts = 0, next_try_at = excluded.next_try_at, last_error = NULL`, [id, Date.now()]);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV === 'production') {
    setInterval(processDue, 60 * 1000);
    setInterval(watch, 2 * 60 * 1000);
    setTimeout(watch, 30 * 1000);
  }
}

module.exports = { init, enqueue, processDue, watch, _test: { processOne, setDeps: d => { deps = d; }, ensureTables } };
