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
function proposalNumber(clientName, existingCount) {
  const nameParts = (clientName || 'UNK').trim().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1] || 'UNK';
  const prefix = lastName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
  const count = String((existingCount || 0) + 1).padStart(3, '0');
  return `${prefix}${count}`;
}



// ── Map project type to formal proposal description ───────────────────────────
function mapProjectType(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
  const isDouble = storey.includes('2') || storey.includes('double');
  const briefing = (f.brief_summary || '').toLowerCase();

  if (type.includes('renovation') && (type.includes('extension') || type.includes('addition'))) {
    return 'ALTERATIONS & ADDITIONS';
  }
  if (type.includes('renovation')) {
    return 'PROPOSED ALTERATIONS';
  }
  if (type.includes('extension') || type.includes('addition')) {
    return 'PROPOSED EXTENSION';
  }
  if (type.includes('new home') || type.includes('new_home')) {
    return isDouble ? 'PROPOSED DOUBLE STOREY DWELLING' : 'PROPOSED SINGLE STOREY DWELLING';
  }
  if (type.includes('granny')) {
    return 'PROPOSED SECONDARY DWELLING';
  }
  if (type.includes('as-constructed') || type.includes('as_constructed') || type.includes('as constructed')) {
    // Extract building type from briefing
    let buildingType = 'Dwelling';
    if (briefing.includes('carport')) buildingType = 'Carport';
    else if (briefing.includes('deck')) buildingType = 'Deck';
    else if (briefing.includes('alfresco')) buildingType = 'Alfresco';
    else if (briefing.includes('pool')) buildingType = 'Pool';
    else if (briefing.includes('double storey') || isDouble) buildingType = 'Double Storey Dwelling';
    else if (briefing.includes('single storey') || briefing.includes('dwelling')) buildingType = 'Single Storey Dwelling';
    return 'AS CONSTRUCTED DRAWINGS — ' + buildingType;
  }
  return (f.p_type || '').toUpperCase();
}

// ── Auto-build scope of works text ───────────────────────────────────────────
function buildScopeNotes(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
  const addr = (f.addr || f.site_address || '').toLowerCase();
  const hasOriginalPlans = f.original_plans === 'Y';
  const beyondFootprint = f.beyond_footprint === 'Y';
  const isSloped = (f.terrain || '').toLowerCase().includes('slope');
  const isReno = type.includes('renov');
  const isExtension = type.includes('extension') || type.includes('addition');
  const isNewHome = type.includes('new home') || type.includes('new_home');
  const isGrannyFlat = type.includes('granny');
  const isAsBuilt = type.includes('as-constructed') || type.includes('as built');
  const isDouble = storey.includes('2') || storey.includes('double');
  const isNSW = addr.includes('nsw') || addr.includes('new south wales');
  const isMultiUnit = type.includes('multi') || type.includes('townhouse') || type.includes('duplex');

  const conceptItems = [];
  const workingItems = [];

  // ── CONCEPT DRAWINGS ──
  conceptItems.push('Proposed Design to be reviewed against Local Codes & Council Regulations');
  if (!hasOriginalPlans && !isNewHome && !isAsBuilt) {
    conceptItems.push('Site visit to obtain building measurements');
  }
  if (isReno || isExtension) {
    conceptItems.push('Redraw existing building (if applicable — partially or entirely, to Xpressdraft\u2019s discretion)');
  }
  conceptItems.push('Selection of materials (Structure, Cladding and Roofing) (if applicable)');
  const surveyNote = (beyondFootprint || isSloped) 
    ? '*Survey required — project extends beyond the existing footprint and/or on a sloping block.' 
    : '';
  conceptItems.push('Floor Plan(s) to demonstrate layout proposal');
  conceptItems.push('Elevations to demonstrate layout proposal');
  conceptItems.push('External 3D views to assist design decisions');

  // ── WORKING / CONSTRUCTION DRAWINGS — in prescribed order ──
  workingItems.push('Proposed Design to be reviewed against Local Authority and Australian Standards');
  workingItems.push('Site Plan in accordance with land survey (if applicable) drawings to be provided by the client');
  if (isReno || isExtension) {
    workingItems.push('Demolition plan(s)');
  }
  workingItems.push('Proposed floor plan(s)');
  workingItems.push('External elevations');
  if (isNewHome || isExtension) {
    workingItems.push('Roof plan');
  }
  if (f.wet_area === 'Y') workingItems.push('Wet area internal elevations (if applicable — optional)');
  if (f.kitchen_design === 'Y') workingItems.push('Kitchen design layout (if applicable — optional)');
  if (f.joinery_details === 'Y') workingItems.push('Joinery details (if applicable — optional)');
  if (isReno || isExtension || isNewHome || isGrannyFlat) {
    workingItems.push('Electrical Plans — position of lighting, power points and data (proposed area)');
  }
  workingItems.push('Slab layout plan (if applicable)');
  workingItems.push('Foundation plan (if applicable)');
  workingItems.push('Joist layout plan (if applicable)');
  workingItems.push('Section A-A, B-B (if applicable), C-C (if applicable), etc.');
  if (isNewHome || isReno || isExtension) {
    workingItems.push('Windows & Doors schedule');
  }
  workingItems.push('Connection detail drawings @ 1:20 or 1:10 or 1:5 scale (if applicable — to Xpressdraft’s discretion)');
  if (isNSW || isMultiUnit) {
    workingItems.push('Driveway section @ 1:20 or 1:10 or 1:5 scale');
  }
  if (isNewHome) {
    workingItems.push('Project specification with description of materials and finishes');
  }

  // Build output with bold titles
  const conceptSection = 'CONCEPT DRAWINGS\n' + conceptItems.map(i => '- ' + i).join('\n') + (surveyNote ? '\n' + surveyNote : '');
  const workingSection = 'CONSTRUCTION DRAWINGS\n' + workingItems.map(i => '- ' + i).join('\n');

  return conceptSection + '\n\n' + workingSection;
}


// ── Map tool project type to formal proposal project type ─────────────────────
function mapProjectType(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
  const isDouble = storey.includes('2') || storey.includes('double');
  const briefing = (f.brief_summary || '').toLowerCase();

  if (type.includes('as-constructed') || type.includes('as constructed')) {
    // Extract building type from briefing
    let buildingType = 'dwelling';
    if (briefing.includes('carport')) buildingType = 'carport';
    else if (briefing.includes('deck')) buildingType = 'deck';
    else if (briefing.includes('alfresco')) buildingType = 'alfresco';
    else if (briefing.includes('pool')) buildingType = 'pool';
    else if (briefing.includes('double storey') || isDouble) buildingType = 'double storey dwelling';
    else if (briefing.includes('single storey')) buildingType = 'single storey dwelling';
    return 'AS CONSTRUCTED DRAWINGS - ' + buildingType;
  }
  if (type.includes('renovation') && type.includes('extension')) return 'ALTERATIONS & ADDITIONS';
  if (type.includes('renovation')) return 'PROPOSED ALTERATIONS';
  if (type === 'additions') return 'PROPOSED ADDITIONS';
  if (type.includes('extension')) return 'PROPOSED EXTENSION';
  if (type.includes('new home') || type.includes('new_home')) {
    return isDouble ? 'PROPOSED DOUBLE STOREY DWELLING' : 'PROPOSED SINGLE STOREY DWELLING';
  }
  if (type.includes('granny')) return 'PROPOSED SECONDARY DWELLING';
  return (f.p_type || 'PROPOSED WORKS').toUpperCase();
}

// ── Build footer text ─────────────────────────────────────────────────────────
const FOOTER = '\n\nStructural engineering drawings and certification will likely be required for the proposed works; however, these are not included within our scope of works and are to be provided by others.\n\nThis proposal and associated fee structure are based on the project scope and assumptions outlined within this briefing. Any details, refinements, or adjustments to the scope will be confirmed and finalised at the time of engagement, following completion of the pre-consultation form to be issued to the client.';

// ── Build PandaDoc tokens from call record ────────────────────────────────────
function buildTokens(rec, repName, priceOverride, existingCount, depositPct) {
  const f = rec.fields || {};
  const rawPrice = priceOverride || f.quoted_price || f.p_price || 0;
  console.log('Price debug - priceOverride:', priceOverride, 'f.quoted_price:', f.quoted_price, 'rawPrice:', rawPrice);
  const priceExGst = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
  console.log('Price debug - priceExGst:', priceExGst);
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
  // Add selected optional services to briefing
  const optionals = [];
  if (f.wet_area === 'Y') optionals.push('Wet area elevations');
  if (f.kitchen_design === 'Y') optionals.push('Kitchen design');
  if (f.joinery_details === 'Y') optionals.push('Joinery details');
  if (f.pool && f.pool !== 'N') optionals.push('Pool');
  const optionalsText = optionals.length > 0 ? '\n\nOptional services included: ' + optionals.join(', ') + '.' : '';
  const projectDescription = briefing + optionalsText + FOOTER;

  // Use dedicated email and phone fields if available, fall back to splitting contact
  let clientEmail = (rec.email || f.client_email || '').trim();
  let clientPhone = (rec.phone || f.client_phone || '').trim();
  if (!clientEmail) {
    const contactVal = rec.contact || '';
    const contactParts = contactVal.split(/[\/,;|]+/).map(s => s.trim()).filter(Boolean);
    clientEmail = (contactParts.find(p => p.includes('@')) || '').trim();
    clientPhone = clientPhone || (contactParts.find(p => !p.includes('@')) || '').trim();
  }

  return [
    { name: 'proposal_number',    value: proposalNumber(rec.name, existingCount) },
    { name: 'client_full_name',   value: rec.name || '' },
    { name: 'client_phone',       value: clientPhone },
    { name: 'client_email',       value: clientEmail },
    { name: 'site_address_label', value: 'Site Address' },
    { name: 'site_address',       value: rec.addr || '' },
    { name: 'cs_representative',  value: repName || '' },
    { name: 'proposal_date',      value: fmtDate() },
    { name: 'expiry_date',        value: addDays(45) },
    { name: 'project_description',value: projectDescription },
    { name: 'scope_notes',         value: buildScopeNotes(f) },
    { name: 'project_type',       value: mapProjectType(f) },
    { name: 'price_ex_gst',       value: priceExGst.toFixed(2) },
    { name: 'price_gst',          value: gst.toFixed(2) },
    { name: 'price_total',        value: total.toFixed(2) },
    { name: 'price_ex_gst_fmt',   value: fmt(priceExGst) },
    { name: 'price_gst_fmt',      value: fmt(gst) },
    { name: 'price_total_fmt',    value: fmt(total) },
    { name: 'deposit_20',         value: fmt(total * (depositPct / 100)) },
    { name: 'deposit_40',         value: fmt(total * 0.40) },
    { name: 'payment_1_label',    value: 'Proposal approval (' + depositPct + '%)' },
    { name: 'payment_1_amount',   value: fmt(total * (depositPct / 100)) },
    { name: 'payment_2_label',    value: 'Delivery of preliminary set (40%)' },
    { name: 'payment_2_amount',   value: fmt(total * 0.40) },
    { name: 'payment_3_label',    value: 'Delivery of final drawings (40%)' },
    { name: 'payment_3_amount',   value: fmt(total * 0.40) },
    { name: 'site_visit_include', value: (!hasOriginalPlans && siteVisitPrice > 0) ? 'YES' : 'NO' },
    { name: 'site_visit_type',    value: siteVisitType },
    { name: 'site_visit_price',   value: fmt(siteVisitPrice) },
    { name: 'site_visit_gst',     value: fmt(siteVisitGst) },
    { name: 'opt_wet_area',       value: f.wet_area === 'Y' ? '☑' : '☐' },
    { name: 'opt_kitchen',        value: f.kitchen_design === 'Y' ? '☑' : '☐' },
    { name: 'opt_joinery',        value: f.joinery_details === 'Y' ? '☑' : '☐' },
    { name: 'opt_pool',           value: (f.pool && f.pool !== 'N' && f.pool !== '') ? '☑' : '☐' },
    { name: 'opt_front_fence',    value: '☐' },
    { name: 'opt_bbq_area',       value: '☐' },
    { name: 'as_built_price',     value: fmt(priceExGst) },
    { name: 'as_built_gst',       value: fmt(gst) },
    { name: 'site_visit_ab_price',value: fmt(300) },
    { name: 'site_visit_ab_gst',  value: fmt(30) },
  ];
}

// ── Create and send a proposal ────────────────────────────────────────────────
async function createProposal(rec, repName, repEmail, clientEmail, priceOverride, existingCount, depositPct) {
  const templateKey = selectTemplate(rec.fields || {});
  const templateId = TEMPLATES[templateKey];
  const tokens = buildTokens(rec, repName, priceOverride, existingCount, depositPct || 20);

  const siteAddr = rec.addr || rec.fields?.addr || '';
  const projType = mapProjectType(rec.fields || {}) || (rec.fields?.p_type || 'Proposal');
  const recFields = rec.fields || {};
  const priceExGst = parseFloat(String(priceOverride || recFields.quoted_price || 0).replace(/[^0-9.]/g, '')) || 0;
  const briefingText = (recFields.brief_summary || '').trim();
  const payload = {
    name: `Xpressdraft_Proposal: ${siteAddr}`,
    template_uuid: templateId,
    recipients: [
      {
        email: clientEmail || '',
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
    tags: ['xpressdraft', templateKey],
    currency: 'AUD'
  };

  console.log('PandaDoc: creating document for template:', templateKey, templateId);
  console.log('Tokens being sent:', JSON.stringify(tokens.filter(t => ['price_ex_gst','price_gst','price_total','project_type','project_description'].includes(t.name))));
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
  await sendDocument(data.id, projType, tokens.find(t => t.name === 'proposal_number')?.value || '', siteAddr);

  return { documentId: data.id, templateType: templateKey };
}

// ── Send document for signing ─────────────────────────────────────────────────
async function sendDocument(documentId, projType, proposalNum, siteAddr) {
  const msgType = projType || 'Xpress Draft';
  const numSuffix = proposalNum ? `_${proposalNum}` : '';
  const res = await fetch(`${PANDADOC_API}/documents/${documentId}/send`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify({
      message: `Please review and sign your ${msgType} proposal${numSuffix} — ${siteAddr}.`,
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
        email: clientEmail || '',
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
  console.log('Tokens being sent:', JSON.stringify(tokens.filter(t => ['price_ex_gst','price_gst','price_total','project_type','project_description'].includes(t.name))));
  const res = await fetch(`${PANDADOC_API}/documents`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('PandaDoc response status:', res.status, JSON.stringify(data).slice(0, 300));
  if (!res.ok) throw new Error(data.detail || data.message || JSON.stringify(data) || 'PandaDoc error ' + res.status);

  await new Promise(r => setTimeout(r, 2000));
  await sendDocument(data.id, projType, tokens.find(t => t.name === 'proposal_number')?.value || '', siteAddr);

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
