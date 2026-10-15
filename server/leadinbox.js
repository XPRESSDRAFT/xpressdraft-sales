// leadinbox.js — Claude reads every enquiry that lands on the monday Lead Inbox board
//
// Webhook: POST /api/lead-inbox-webhook   (monday "item created" on board 18435248465; answers the challenge)
// Admin:   POST /api/admin/lead-inbox/:itemId/reprocess    GET /api/admin/lead-inbox/status
//
// For each new item: read Original Email (or, if empty, the item's first update = the email that
// monday's email-to-board address received), ask Claude to extract the details, and write back ONLY
// the fields Claude is sure of. Status columns only get labels that already exist on the board.
// AI READ = DONE / FAILED. Spam-looking enquiries get INBOX STATUS = NEEDS REVIEW (never deleted).
// REP is never touched (Luiz chooses). Moving QUALIFIED leads to Negotiations is monday workflow W1.

const fetch = require('node-fetch');

const BOARD = '18435248465';
const COL = {
  email: 'email_mm83kqxp',
  phone: 'phone_mm83ngja',
  address: 'text_mm83rj61',
  enquiry: 'long_text_mm837s0p',
  source: 'color_mm835x3x',
  jobType: 'color_mm8333qf',
  state: 'color_mm83b1dy',
  dateEnquired: 'date_mm833ykn',
  original: 'long_text_mm8356wc',
  aiRead: 'color_mm837b7n',
  inboxStatus: 'color_mm83hdx7',
};
const STATUS_COLS = [COL.source, COL.jobType, COL.state];
const MODEL = process.env.LEAD_INBOX_MODEL || 'claude-sonnet-4-6';

let deps = null;
let chain = Promise.resolve();
const stats = { received: 0, done: 0, failed: 0, skipped: 0, lastAt: null, lastError: null };

function mq(q, v) { return deps.monday.queryFresh(q, v); }
function enqueue(fn) { chain = chain.then(fn).catch(e => { stats.failed++; stats.lastError = e.message; console.error('Lead Inbox error:', e.message); }); return chain; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

// Status labels that exist on the board (cached 10 min), so we never invent a label
let labelCache = null, labelAt = 0;
async function getLabels() {
  if (labelCache && Date.now() - labelAt < 600e3) return labelCache;
  const d = await mq(`query { boards(ids: ["${BOARD}"]) { columns(ids: ${JSON.stringify([...STATUS_COLS, COL.aiRead, COL.inboxStatus])}) { id settings_str } } }`);
  const cols = (((d && d.boards) || [])[0] || {}).columns || [];
  labelCache = {};
  cols.forEach(c => {
    let s = {}; try { s = JSON.parse(c.settings_str || '{}'); } catch (e) {}
    labelCache[c.id] = Object.values(s.labels || {}).filter(Boolean);
  });
  labelAt = Date.now();
  return labelCache;
}
function pickLabel(labels, wanted) {
  if (!wanted) return null;
  const w = String(wanted).trim().toLowerCase();
  return (labels || []).find(l => l.trim().toLowerCase() === w) || null;
}

async function readItem(itemId) {
  const d = await mq(`query($i: [ID!]) { items(ids: $i) { id name created_at board { id }
    column_values(ids: ${JSON.stringify(Object.values(COL))}) { id text value }
    updates(limit: 20) { id body text_body created_at creator { name email } } } }`, { i: [String(itemId)] });
  return ((d && d.items) || [])[0] || null;
}
const colText = (item, id) => ((item.column_values || []).find(c => c.id === id) || {}).text || '';

async function askClaude(emailText, subject, labels, fallbackDate) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const prompt = `You read enquiry emails for Xpressdraft, an Australian residential drafting and building design company.
Extract details from the email below. Only fill a field when the email states it clearly; otherwise use null. Never guess.

Allowed values (use EXACTLY one of these or null):
- source: ${JSON.stringify(labels[COL.source] || [])}
- job_type: ${JSON.stringify(labels[COL.jobType] || [])}
- state: ${JSON.stringify(labels[COL.state] || [])}

Rules:
- If the email came from calls@xpressdraft.com.au (a phone message from the virtual receptionist), source is "CALLS"; if it says it was taken by an AI receptionist / AI assistant, source is "AI CALLS". Only use these if they are in the allowed list.
- email / phone / site_address are the CLIENT's details, never Xpressdraft's own (anything @xpressdraft.com.au is ours).
- enquiry_summary: 1–4 plain sentences describing what the client wants (project, location, timing, budget if given).
- date_enquired: the date the enquiry was sent, YYYY-MM-DD, or null.
- looks_like_spam: true for marketing, SEO/web-design pitches, job applications, scams, or anything that is not a real client enquiry.

Reply with ONLY a JSON object with keys: email, phone, site_address, enquiry_summary, source, job_type, state, date_enquired, looks_like_spam.

Subject: ${subject || '(none)'}
Email:
"""
${emailText.slice(0, 12000)}
"""`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Claude API: ' + ((data.error && data.error.message) || res.status));
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Claude reply had no JSON');
  return JSON.parse(m[0]);
}

function normalisePhone(p) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d;
  if (d.startsWith('61')) return '+' + d;
  if (d.startsWith('0')) return '+61' + d.slice(1);
  return d.length >= 8 ? d : null;
}
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')) && !/@xpressdraft\.com\.au$/i.test(e);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

async function setColumns(itemId, values) {
  return mq(`mutation($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`,
    { b: BOARD, i: String(itemId), v: JSON.stringify(values) });
}

async function processItem(itemId, { force = false } = {}) {
  let item = null;
  // The email-to-board update can land a moment after the item; wait for some text (up to ~1 min)
  for (let i = 0; i < 4; i++) {
    item = await readItem(itemId);
    if (!item) throw new Error('item ' + itemId + ' not found');
    if (colText(item, COL.original) || (item.updates || []).length) break;
    await sleep(15000);
  }
  if (String(item.board && item.board.id) !== BOARD) { stats.skipped++; return { skipped: 'not a Lead Inbox item' }; }
  if (!force && /^DONE$/i.test(colText(item, COL.aiRead))) { stats.skipped++; return { skipped: 'already read' }; }

  const updates = (item.updates || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const first = updates[0];
  const raw = colText(item, COL.original) || (first ? (first.text_body || stripHtml(first.body)) : '');
  const fromLine = first && first.creator && first.creator.email ? `\nFrom (monday update author): ${first.creator.email}` : '';
  if (!raw.trim()) {
    await setColumns(itemId, { [COL.aiRead]: { label: 'FAILED' } }).catch(() => {});
    stats.failed++; return { failed: 'no email text' };
  }

  try {
    const labels = await getLabels();
    const fallbackDate = item.created_at ? new Date(new Date(item.created_at).getTime() + 10 * 3600e3).toISOString().slice(0, 10) : null;
    const ai = await askClaude(raw + fromLine, item.name, labels, fallbackDate);

    const v = {};
    if (!colText(item, COL.original)) v[COL.original] = { text: raw.slice(0, 60000) };
    if (validEmail(ai.email)) v[COL.email] = { email: ai.email, text: ai.email };
    const ph = normalisePhone(ai.phone); if (ph) v[COL.phone] = { phone: ph, countryShortName: 'AU' };
    if (ai.site_address) v[COL.address] = String(ai.site_address).slice(0, 250);
    if (ai.enquiry_summary) v[COL.enquiry] = { text: String(ai.enquiry_summary).slice(0, 4000) };
    const src = pickLabel(labels[COL.source], ai.source); if (src) v[COL.source] = { label: src };
    const jt = pickLabel(labels[COL.jobType], ai.job_type); if (jt) v[COL.jobType] = { label: jt };
    const st = pickLabel(labels[COL.state], ai.state); if (st) v[COL.state] = { label: st };
    const de = validDate(ai.date_enquired) ? ai.date_enquired : fallbackDate; if (de) v[COL.dateEnquired] = { date: de };
    if (ai.looks_like_spam === true) { const nr = pickLabel(labels[COL.inboxStatus], 'NEEDS REVIEW'); if (nr) v[COL.inboxStatus] = { label: nr }; }

    if (Object.keys(v).length) await setColumns(itemId, v);
    await setColumns(itemId, { [COL.aiRead]: { label: 'DONE' } });
    stats.done++; stats.lastAt = new Date().toISOString();
    console.log('Lead Inbox: read item', itemId, '| filled:', Object.keys(v).length, 'columns', ai.looks_like_spam ? '| flagged NEEDS REVIEW' : '');
    return { ok: true, filled: Object.keys(v) };
  } catch (e) {
    await setColumns(itemId, { [COL.aiRead]: { label: 'FAILED' } }).catch(() => {});
    stats.failed++; stats.lastError = e.message;
    console.error('Lead Inbox: item', itemId, 'FAILED:', e.message);
    return { failed: e.message };
  }
}

function init({ app, monday, requireAuth, requireAdmin }) {
  deps = { monday };

  app.post('/api/lead-inbox-webhook', (req, res) => {
    if (req.body && req.body.challenge) return res.json({ challenge: req.body.challenge });
    const ev = (req.body && req.body.event) || {};
    res.json({ ok: true });
    const itemId = ev.pulseId || ev.itemId;
    if (!itemId || String(ev.boardId) !== BOARD) return;
    if (ev.type && !/create/i.test(ev.type)) return;
    stats.received++;
    enqueue(() => processItem(itemId));
  });

  app.post('/api/admin/lead-inbox/:itemId/reprocess', requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await processItem(req.params.itemId, { force: true })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/admin/lead-inbox/status', requireAuth, requireAdmin, (req, res) => res.json({ anthropicKeySet: !!process.env.ANTHROPIC_API_KEY, model: MODEL, ...stats }));
}

module.exports = { init, processItem, _test: { setDeps: d => { deps = d; }, normalisePhone, pickLabel } };
