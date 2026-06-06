// pandadoc.js — Xpress Draft PandaDoc Integration
const fetch = require('node-fetch');

// ── Template IDs ──────────────────────────────────────────────────────────────
const TEMPLATES = {
  standard:   'Yf4Q5mZvVahX7wYmxDXszN',
  as_built:   'JsfBd8EHTSEmqWrmm5UuEX',
  da_only:    'T2BqSNxYUvX7TiS2ufwiMM',
  da_and_ba:  'n54Jbf9LVnRZgMMaKjX4Q8',
  engagement: 'xw3aCtXHEnHeyVJzNC5bVm'
};

const PANDADOC_API = 'https://api.pandadoc.com/public/v1';

function pandaHeaders() {
  return {
    'Authorization': `API-Key ${process.env.PANDADOC_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

// ── Select correct template based on call data ────────────────────────────────
function selectTemplate(fields) {
  const type = (fields.p_type || '').toLowerCase();
  if (type.includes('as-constructed') || type.includes('as built') || type.includes('as_built')) {
    return 'as_built';
  }
  if (type.includes('da only') || type.includes('da_only')) {
    return 'da_only';
  }
  if (type.includes('da') && (type.includes('ba') || type.includes('construction'))) {
    return 'da_and_ba';
  }
  return 'standard';
}

// ── Format currency ───────────────────────────────────────────────────────────
function fmt(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Format date ───────────────────────────────────────────────────────────────
function fmtDate(d) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const date = d ? new Date(d) : new Date();
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

// ── Generate proposal number ──────────────────────────────────────────────────
function proposalNumber() {
  const now = new Date();
  const yr = now.getFullYear();
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `XD-${yr}-${rand}`;
}

// ── Build footer text ─────────────────────────────────────────────────────────
const FOOTER = '\n\nStructural engineering drawings and certification will likely be required for the proposed works; however, these are not included within our scope of works and are to be provided by others.\n\nThis proposal and associated fee structure are based on the project scope and assumptions outlined within this briefing. Any details, refinements, or adjustments to the scope will be confirmed and finalised at the time of engagement, following completion of the pre-consultation form to be issued to the client.';

// ── Build PandaDoc tokens from call record ────────────────────────────────────
function buildTokens(rec, repName, priceOverride) {
  const f = rec.fields || {};
  const priceExGst = parseFloat(priceOverride || f.quoted_price || 0);
  const gst = priceExGst * 0.1;
  const total = priceExGst + gst;

  // Site visit logic (Standard template)
  const hasOriginalPlans = f.original_plans === 'Y';
  const isDoubleStorey = (f.p_storey || '').includes('2') || (f.p_storey || '').toLowerCase().includes('double');
  const type = (f.p_type || '').toLowerCase();
  const isAddition = type.includes('addition');
  const isRenovation = type.includes('renov') || type.includes('extension');

  let siteVisitPrice = 0;
  let siteVisitType = '';
  if (!hasOriginalPlans) {
    if (isAddition) {
      siteVisitPrice = 300;
      siteVisitType = 'Site Visit — Additions (no original plans supplied)';
    } else if (isRenovation && isDoubleStorey) {
      siteVisitPrice = 500;
      siteVisitType = 'Site Visit — Reno/Extension, Double Storey (no original plans supplied)';
    } else if (isRenovation) {
      siteVisitPrice = 400;
      siteVisitType = 'Site Visit — Reno/Extension, Single Storey (no original plans supplied)';
    }
  }
  const siteVisitGst = siteVisitPrice * 0.1;

  const briefing = (f.brief_summary || '').trim();
  const projectDescription = briefing + FOOTER;

  return [
    { name: 'proposal_number',    value: proposalNumber() },
    { name: 'client_full_name',   value: rec.name || '' },
    { name: 'client_phone',       value: rec.contact || '' },
    { name: 'client_email',       value: rec.contact || '' },
    { name: 'site_address',       value: rec.addr || '' },
    { name: 'cs_representative',  value: repName || '' },
    { name: 'proposal_date',      value: fmtDate() },
    { name: 'expiry_date',        value: addDays(45) },
    { name: 'project_description',value: projectDescription },
    { name: 'project_type',       value: f.p_type || '' },
    { name: 'price_ex_gst',       value: fmt(priceExGst) },
    { name: 'price_gst',          value: fmt(gst) },
    { name: 'price_total',        value: fmt(total) },
    { name: 'site_visit_include', value: (!hasOriginalPlans && siteVisitPrice > 0) ? 'YES' : 'NO' },
    { name: 'site_visit_type',    value: siteVisitType },
    { name: 'site_visit_price',   value: fmt(siteVisitPrice) },
    { name: 'site_visit_gst',     value: fmt(siteVisitGst) },
    { name: 'opt_wet_area',       value: f.wet_area === 'Y' ? 'true' : 'false' },
    { name: 'opt_kitchen',        value: f.kitchen_design === 'Y' ? 'true' : 'false' },
    { name: 'opt_joinery',        value: f.joinery_details === 'Y' ? 'true' : 'false' },
    { name: 'opt_pool',           value: (f.pool || '').length > 0 ? 'true' : 'false' },
    { name: 'opt_front_fence',    value: 'false' },
    { name: 'opt_bbq_area',       value: 'false' },
    { name: 'as_built_price',     value: fmt(priceExGst) },
    { name: 'as_built_gst',       value: fmt(gst) },
    { name: 'site_visit_ab_price',value: fmt(300) },
    { name: 'site_visit_ab_gst',  value: fmt(30) },
  ];
}

// ── Create and send a proposal ────────────────────────────────────────────────
async function createProposal(rec, repName, repEmail, clientEmail, priceOverride) {
  const templateKey = selectTemplate(rec.fields || {});
  const templateId = TEMPLATES[templateKey];
  const tokens = buildTokens(rec, repName, priceOverride);

  const payload = {
    name: `Xpress Draft Proposal — ${rec.name} — ${rec.addr || ''}`,
    template_uuid: templateId,
    recipients: [
      {
        email: clientEmail || rec.contact || '',
        first_name: (rec.name || '').split(' ')[0],
        last_name: (rec.name || '').split(' ').slice(1).join(' '),
        role: 'Client'
      }
    ],
    tokens: tokens,
    fields: {},
    metadata: {
      client_id: rec.id,
      template_type: templateKey
    },
    tags: ['xpressdraft', templateKey]
  };

  console.log('PandaDoc: creating document for template:', templateKey, templateId);
  const res = await fetch(`${PANDADOC_API}/documents`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('PandaDoc response status:', res.status, JSON.stringify(data).slice(0, 300));
  if (!res.ok) throw new Error(data.detail || data.message || JSON.stringify(data) || 'PandaDoc error ' + res.status);

  // Wait briefly then send for signature
  await new Promise(r => setTimeout(r, 2000));
  await sendDocument(data.id);

  return { documentId: data.id, templateType: templateKey };
}

// ── Send document for signing ─────────────────────────────────────────────────
async function sendDocument(documentId) {
  const res = await fetch(`${PANDADOC_API}/documents/${documentId}/send`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify({
      message: 'Please review and sign your Xpress Draft proposal.',
      silent: false
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to send document');
  }
}

// ── Send engagement document after signing ────────────────────────────────────
async function sendEngagementDocument(rec, repName, repEmail, clientEmail) {
  const payload = {
    name: `Xpress Draft — Engagement & Pre-Consultation — ${rec.name}`,
    template_uuid: TEMPLATES.engagement,
    recipients: [
      {
        email: clientEmail || rec.contact || '',
        first_name: (rec.name || '').split(' ')[0],
        last_name: (rec.name || '').split(' ').slice(1).join(' '),
        role: 'Client'
      }
    ],
    tokens: [
      { name: 'client_full_name', value: rec.name || '' },
      { name: 'site_address',     value: rec.addr || '' },
      { name: 'cs_representative',value: repName || '' },
      { name: 'proposal_date',    value: fmtDate() },
    ],
    metadata: { client_id: rec.id, type: 'engagement' },
    tags: ['xpressdraft', 'engagement']
  };

  console.log('PandaDoc: creating document for template:', templateKey, templateId);
  const res = await fetch(`${PANDADOC_API}/documents`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('PandaDoc response status:', res.status, JSON.stringify(data).slice(0, 300));
  if (!res.ok) throw new Error(data.detail || data.message || JSON.stringify(data) || 'PandaDoc error ' + res.status);

  await new Promise(r => setTimeout(r, 2000));
  await sendDocument(data.id);

  return { documentId: data.id };
}

// ── Webhook handler — called when client signs ────────────────────────────────
async function handleWebhook(event, db) {
  if (event.event !== 'document_state_changed') return;
  if (event.data?.status !== 'document.completed') return;

  const meta = event.data?.metadata || {};
  if (meta.type === 'engagement') return; // don't chain engagement doc again

  const clientId = meta.client_id;
  if (!clientId) return;

  // Look up client record
  const row = await new Promise((res, rej) => db.get('SELECT * FROM clients WHERE id = ?', [clientId], (e, r) => e ? rej(e) : res(r)));
  if (!row) return;

  const rec = { ...JSON.parse(row.data), id: row.id };

  // Look up the rep who saved this client
  const user = await new Promise((res, rej) => db.get('SELECT * FROM users WHERE id = ?', [row.user_id], (e, r) => e ? rej(e) : res(r)));
  if (!user) return;

  const clientData = rec.fields || {};
  const clientEmail = clientData.client_email || rec.contact || '';

  await sendEngagementDocument(rec, user.name, user.email, clientEmail);
}

module.exports = { createProposal, sendEngagementDocument, handleWebhook, selectTemplate, TEMPLATES };
