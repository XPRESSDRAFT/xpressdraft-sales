// pandadoc.js — Xpress Draft PandaDoc Integration
const fetch = require('node-fetch');
const TEMPLATES = {
  standard:   'Yf4Q5mZvVahX7wYmxDXszN',
  as_built:   'SFgVm38NQwNHKrmy4Lrd5P',
  da_only:    'vXNcnrpiucDH8wUbk82UpX',
  da_and_ba:  'ifdsd3t5tSw8UyFGrwnBRg',
  engagement: 'xw3aCtXHEnHeyVJzNC5bVm'
};
const PANDADOC_API = 'https://api.pandadoc.com/public/v1';
function pandaHeaders() {
  return {
    'Authorization': `API-Key ${process.env.PANDADOC_API_KEY}`,
    'Content-Type': 'application/json'
  };
}
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
function fmt(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
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
function proposalNumber(clientName, existingCount) {
  const nameParts = (clientName || 'UNK').trim().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1] || 'UNK';
  const prefix = lastName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
  const count = String((existingCount || 0) + 1).padStart(3, '0');
  return `${prefix}${count}`;
}
function mapProjectType(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
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

function buildScopeNotes(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
  const addr = (f.addr || f.site_address || '').toLowerCase();
  const hasOriginalPlans = isYes(f.plans);
  const isReplacement = (f.addition === 'replacement') || type.includes('replacement');
  const beyondFootprint = isYes(f.beyond) || 
    (type.includes('extension') && !isReplacement) ||
    (type.includes('renov') && type.includes('extension') && !isReplacement);
  const isSloped = (f.terrain || '').toLowerCase().includes('slope');
  const isReno = type.includes('renov');
  const isExtension = type.includes('extension') || type.includes('addition');
  const isDouble = storey.includes('2') || storey.includes('double');
  const isNewHome = type.includes('new home') || type.includes('new_home') || type.includes('new build');
  const isAsBuilt = type.includes('as-constructed') || type.includes('as built') || type.includes('as_built');
  const isNSW = addr.includes('nsw') || addr.includes('new south wales');
  const isMultiUnit = type.includes('multi') || type.includes('townhouse') || type.includes('duplex');
  const isGrannyFlat = type.includes('granny');
  const conceptItems = [];
  const workingItems = [];

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
  if (isYes(f.wetarea)) workingItems.push('Wet area internal elevations (if applicable — optional)');
  if (isYes(f.kitchen)) workingItems.push('Kitchen design layout (if applicable — optional)');
  if (isYes(f.joinery)) workingItems.push('Joinery details (if applicable — optional)');
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

  const conceptSection = 'CONCEPT DRAWINGS\n' + conceptItems.map(i => '- ' + i).join('\n') + (surveyNote ? '\n' + surveyNote : '');
  const workingSection = 'WORKING DRAWINGS\n' + workingItems.map(i => '- ' + i).join('\n');

  return conceptSection + '\n\n' + workingSection;
}

function mapProjectType(f) {
  const type = (f.p_type || '').toLowerCase();
  const storey = (f.p_storey || '').toLowerCase();
  const isDouble = storey.includes('2') || storey.includes('double');
  const briefing = (f.brief_summary || '').toLowerCase();

  if (type.includes('as-constructed') || type.includes('as constructed')) {
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
  if (type.includes('granny') && type.includes('attached')) return 'PROPOSED SECONDARY DWELLING (ATTACHED)';
  if (type.includes('granny') && type.includes('detached')) return 'PROPOSED SECONDARY DWELLING (DETACHED)';
  if (type.includes('granny')) return 'PROPOSED SECONDARY DWELLING';
  if (type.includes('renovation') && type.includes('storey addition')) return 'PROPOSED RENOVATION & STOREY ADDITION';
  if (type.includes('storey addition')) return 'PROPOSED STOREY ADDITION';
  if (type.includes('shed home')) return 'PROPOSED SHED HOME';
  if (type.includes('shed') && type.includes('mezzanine')) return 'PROPOSED SHED WITH MEZZANINE';
  if (type.includes('shed')) return 'PROPOSED SHED';
  if (type.includes('working drawings only')) return 'WORKING DRAWINGS ONLY';
  if (type.includes('da only') || type.includes('da_only')) return 'PROPOSED DEVELOPMENT';
  if (type.includes('da') && (type.includes('ba') || type.includes('+ ba'))) return 'PROPOSED DEVELOPMENT';
  return (f.p_type || 'PROPOSED WORKS').toUpperCase();
}

const FOOTER_STANDARD = '\n\nStructural engineering drawings and certification will likely be required for the proposed works; however, these are not included within our scope of works and are to be provided by others.\n\nThis proposal and associated fee structure are based on the project scope and assumptions outlined within this briefing. Any details, refinements, or adjustments to the scope will be confirmed and finalised at the time of engagement, following completion of the pre-consultation form to be issued to the client.';

const FOOTER_AS_BUILT = '\n\nStructural engineering drawings and certification may be required for portions of the proposed works; however, these are not included within our scope of works and are to be provided by others.';

function getFooter(templateKey) {
  return templateKey === 'as_built' ? FOOTER_AS_BUILT : FOOTER_STANDARD;
}

// Helper: check if a field value is "yes" regardless of format (Y, Yes, yes)
function isYes(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return v === 'y' || v === 'yes';
}

function buildTokens(rec, repName, priceOverride, existingCount, depositPct, stripeLink) {
  const f = rec.fields || {};
  const rawPrice = priceOverride || f.quoted_price || f.p_price || 0;
  const priceExGst = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
  const gst = priceExGst * 0.1;
  const total = priceExGst + gst;
  const type = (f.p_type || '').toLowerCase();
  const isSloped = (f.terrain || '').toLowerCase().includes('slope');
  const isReplacement = (f.addition === 'replacement') || type.includes('replacement');
  const beyondFootprint = isYes(f.beyond) ||
    (type.includes('extension') && !isReplacement) ||
    (type.includes('renov') && type.includes('extension') && !isReplacement);

  const hasOriginalPlans = isYes(f.plans);
  const isDoubleStorey = (f.p_storey||'').includes('2')||(f.p_storey||'').toLowerCase().includes('double');
  const isAddition = type.includes('addition');
  const isRenovation = type.includes('renov')||type.includes('extension');

  let siteVisitPrice = 0;
  let siteVisitType = '';
  const isNewHome = type.includes('new home') || type.includes('new_home') || type.includes('new build');
  const isAsBuilt = type.includes('as-constructed') || type.includes('as built') || type.includes('as_built');
  const isGrannyFlat = type.includes('granny');
  if (!hasOriginalPlans && !isNewHome) {
    if (isAddition) {
      siteVisitPrice = 300;
      siteVisitType = 'Site Visit — Additions (no original plans supplied)';
    } else if (isRenovation && isDoubleStorey) {
      siteVisitPrice = 500;
      siteVisitType = 'Site Visit — Reno/Extension, Double Storey (no original plans supplied)';
    } else if (isRenovation) {
      siteVisitPrice = 400;
      siteVisitType = 'Site Visit — Reno/Extension, Single Storey (no original plans supplied)';
    } else {
      // All other project types including as-built
      siteVisitPrice = 400;
      siteVisitType = 'Site Visit — No original plans supplied';
    }
  } else if (isAsBuilt) {
    // As-built always requires site visit regardless of plans
    siteVisitPrice = 400;
    siteVisitType = 'Site Visit — As Constructed';
  }
  const siteVisitGst = siteVisitPrice * 0.1;

  const briefing = (f.brief_summary || '').trim();
  const templateKey2 = selectTemplate(f);

  const yesNo = (val) => isYes(val) ? 'Yes' : 'No';
  const details = [];
  if (f.beyond || beyondFootprint) details.push('Going beyond existing footprint: ' + (beyondFootprint ? 'Yes' : 'No'));
  if (f.addition) details.push('Would the project have an addition: ' + yesNo(f.addition));
  if (isYes(f.addition) && f.attached) details.push('If addition — attached to the house: ' + yesNo(f.attached));
  if (isYes(f.addition) && f.undercover) details.push('If addition — undercover: ' + yesNo(f.undercover));
  if (f.surveyplans) details.push('Survey plans available: ' + yesNo(f.surveyplans));
  if (f.surveyreq) details.push('Survey required: ' + yesNo(f.surveyreq));
  if (f.existstoreys) details.push('Existing number of storeys: ' + f.existstoreys);
  if (f.propstoreys) details.push('Proposed number of storeys: ' + f.propstoreys);
  if (f.kitchen) details.push('Kitchen design: ' + yesNo(f.kitchen));
  if (f.joinery) details.push('Joinery details: ' + yesNo(f.joinery));
  if (f.wetarea) details.push('Wet area elevations: ' + yesNo(f.wetarea));
  if (f.plans) details.push('Original house plans: ' + yesNo(f.plans));
  if (f.p_add_mode === 'Granny Flat — Attached (add-on)') details.push('Addition: Granny Flat — Attached (add-on) (+$2,900)');
  if (f.p_add_mode === 'Granny Flat — Detached (add-on)') details.push('Addition: Granny Flat — Detached (add-on) (+$2,200)');
  const ptype = (f.p_type || '').toLowerCase();
  if (ptype.includes('da only') || ptype.includes('da_only')) details.push('Application type: DA Only');
  if (ptype.includes('da') && (ptype.includes('ba') || ptype.includes('+ ba'))) details.push('Application type: DA + BA');

  const detailsText = (details.length > 0 && templateKey2 !== 'as_built') ? '\n\nPROJECT DETAILS\n' + details.map(d => '- ' + d).join('\n') : '';
  const projectDescription = briefing + detailsText + getFooter(templateKey2);

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
    { name: 'deposit_amount_fmt',  value: fmt(total * (depositPct / 100)) },
    { name: 'stripe_payment_link', value: stripeLink || '' },
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
    { name: 'opt_wet_area',       value: isYes(f.wetarea) ? '☑' : '☐' },
    { name: 'opt_kitchen',        value: isYes(f.kitchen) ? '☑' : '☐' },
    { name: 'opt_joinery',        value: isYes(f.joinery) ? '☑' : '☐' },
    { name: 'opt_pool',           value: (f.pool && f.pool !== 'N' && f.pool !== '') ? '☑' : '☐' },
    { name: 'opt_front_fence',    value: '☐' },
    { name: 'opt_bbq_area',       value: '☐' },
    { name: 'beyond_footprint',   value: beyondFootprint ? 'Yes' : 'No' },
    { name: 'beyond footprint',   value: beyondFootprint ? 'Yes' : 'No' },
    { name: 'survey_required',    value: (beyondFootprint || isSloped) ? 'Yes' : 'No' },
    { name: 'survey required',    value: (beyondFootprint || isSloped) ? 'Yes' : 'No' },
    { name: 'as_built_price',     value: fmt(priceExGst) },
    { name: 'as_built_gst',       value: fmt(gst) },
    { name: 'site_visit_ab_price',value: fmt(300) },
    { name: 'site_visit_ab_gst',  value: fmt(30) },
  ];
}

async function createProposal(rec, repName, repEmail, clientEmail, priceOverride, existingCount, depositPct, stripeLink) {
  const templateKey = selectTemplate(rec.fields || {});
  const templateId = TEMPLATES[templateKey];
  const tokens = buildTokens(rec, repName, priceOverride, existingCount, depositPct || 20, stripeLink || '');

  const siteAddr = rec.addr || rec.fields?.addr || '';
  const projType = mapProjectType(rec.fields || {}) || (rec.fields?.p_type || 'Proposal');
  const recFields = rec.fields || {};
  const priceExGst = parseFloat(String(priceOverride || recFields.quoted_price || 0).replace(/[^0-9.]/g, '')) || 0;
  const gst = priceExGst * 0.1;
  const total = priceExGst + gst;
  const briefingText = (recFields.brief_summary || '').trim();
  // Define beyondFootprint and isSloped for use in fields
  const _type = (recFields.p_type || '').toLowerCase();
  const _isReplacement = (recFields.addition === 'replacement') || _type.includes('replacement');
  const beyondFootprint = isYes(recFields.beyond) ||
    (_type.includes('extension') && !_isReplacement) ||
    (_type.includes('renov') && _type.includes('extension') && !_isReplacement);
  const isSloped = (recFields.terrain || '').toLowerCase().includes('slope');
  const payload = {
    name: `Xpressdraft_Proposal: ${siteAddr}`,
    template_uuid: templateId,
    sender: {
      email: repEmail || 'info@xpressdraft.com.au'
    },
    recipients: [
      {
        email: clientEmail || '',
        first_name: (rec.name || '').split(' ')[0],
        last_name: (rec.name || '').split(' ').slice(1).join(' '),
        role: 'Client'
      }
    ],
      tokens: tokens,
    pricing_tables: [{
      name: 'Deposit Table',
      data_merge: false,
      sections: [{
        title: 'Section name',
        default: true,
        rows: [
          {
            options: { optional: false, optional_selected: true, qty_editable: false },
            data: {
              name: templateKey === 'as_built' ? 'AS CONSTRUCTED DRAWINGS & SITE VISIT' : mapProjectType(recFields),
              price: parseFloat(priceExGst.toFixed(2)),
              qty: 1,
              tax_first: { value: 0, type: 'percent' }
            }
          },
          {
            options: { optional: false, optional_selected: true, qty_editable: false },
            data: {
              name: 'GST (10%)',
              price: parseFloat(gst.toFixed(2)),
              qty: 1,
              tax_first: { value: 0, type: 'percent' }
            }
          }
        ]
      }]
    }],
    fields: {
      'price_ex_gst': { value: priceExGst.toFixed(2) },
      'price_gst': { value: gst.toFixed(2) },
      'price_total': { value: total.toFixed(2) },
      'project_type': { value: mapProjectType(recFields) },
      'deposit_20': { value: (total * ((depositPct || 20) / 100)).toFixed(2) },
      'deposit_amount': { value: (total * ((depositPct || 20) / 100)).toFixed(2) },
      'stripe_payment_link': { value: stripeLink || '' },
      'beyond_footprint': { value: beyondFootprint ? 'Yes' : 'No' },
      'survey_required': { value: (beyondFootprint || isSloped) ? 'Yes' : 'No' }
    },
    metadata: {
      client_id: rec.id,
      template_type: templateKey
    },
    tags: ['xpressdraft', templateKey],
    currency: 'AUD'
  };

  const res = await fetch(`${PANDADOC_API}/documents`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || JSON.stringify(data) || 'PandaDoc error ' + res.status);

  // Wait for document to finish processing then send for signature
  // Poll document status until it's ready (not 'document.uploaded')
  let sent = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${PANDADOC_API}/documents/${data.id}`, {
      headers: pandaHeaders()
    });
    const statusData = await statusRes.json();
    if (statusData.status === 'document.draft') {
      try {
        await sendDocument(data.id, projType, tokens.find(t => t.name === 'proposal_number')?.value || '', siteAddr);
        sent = true;
        break;
      } catch(e) {
        if (attempt === 8) throw e;
      }
    }
    if (attempt === 8 && !sent) throw new Error('Document did not reach draft status after 8 attempts');
  }

  return { documentId: data.id, templateType: templateKey };
}

async function sendDocument(documentId, projType, proposalNum, siteAddr) {
  const msgType = projType || 'Xpress Draft';
  const numSuffix = proposalNum ? `_${proposalNum}` : '';
  const res = await fetch(`${PANDADOC_API}/documents/${documentId}/send`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify({
      message: proposalNum ? `Please review and sign your ${msgType} proposal${numSuffix} — ${siteAddr}.` : `We are very pleased that we will start on your project! Congratulations on choosing Xpressdraft!\n\nTo ensure we have all the necessary information about your project, please complete this Pre-Consultation Form to the best of your ability so we can start drafting based on your own words and design considerations.\n\nPlease don't feel any pressure to get us the "right answer". This form is only to help us get your instructions and stay aware of relevant matters.\n\nLooking forward to hearing from you so we can start the first sketches!\n\nKind regards,\nManagement Team\n1300 156 669\nXpressdraft — More than just plans\nwww.xpressdraft.com.au`,
      silent: false
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err.detail || err) || 'Failed to send document');
  }
}

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

  const res = await fetch(`${PANDADOC_API}/documents`, {
    method: 'POST',
    headers: pandaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || JSON.stringify(data) || 'PandaDoc error ' + res.status);

  for (let attempt = 1; attempt <= 5; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${PANDADOC_API}/documents/${data.id}`, { headers: pandaHeaders() });
    const statusData = await statusRes.json();
    if (statusData.status === 'document.draft') {
      await sendDocument(data.id, 'Pre-Consultation', '', '');
      break;
    }
  }

  return { documentId: data.id };
}

async function handleWebhook(event, db, emailModule, mondayModule) {

  const meta = event.data?.metadata || {};
  if (meta.type === 'engagement') return; // don't chain engagement doc again

  const isPaid = event.event === 'document_state_changed' && event.data?.status === 'document.paid';
  const isPaymentCompleted = event.event === 'document_payment_completed';

  if (!isPaid && !isPaymentCompleted) return;

  const clientId = meta.client_id;
  if (!clientId) {
      return;
  }

  const row = await new Promise((res, rej) => db.get('SELECT * FROM clients WHERE id = ?', [clientId], (e, r) => e ? rej(e) : res(r)));
  if (!row) return;

  const rec = { ...JSON.parse(row.data), id: row.id };
  const user = await new Promise((res, rej) => db.get('SELECT * FROM users WHERE id = ?', [row.user_id], (e, r) => e ? rej(e) : res(r)));
  if (!user) return;

  const clientData = rec.fields || {};
  const clientEmail = rec.email || clientData.client_email || rec.contact || '';
  const proposalRow = await new Promise((res, rej) => db.get(
    'SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC LIMIT 1', 
    [clientId], (e, r) => e ? rej(e) : res(r)
  ));
  const priceRaw = clientData.price_override || meta.price || meta.priceOverride || 
                   clientData.quoted_price || clientData.price_ex_gst || rec.priceOverride || 0;
  const price = parseFloat(String(priceRaw).replace(/[^0-9.]/g,'')) || 0;

  if (emailModule && user) {
    try {
      await emailModule.sendRepNotification(user.name, user.email, row.name, clientEmail, rec.addr || '');
    } catch(e) {
        }
  }

  if (user && user.phone) {
    try {
      const twilio = require('./twilio');
      await twilio.sendRepNotificationSMS(user.phone, row.name, rec.addr || '');
    } catch(e) {
        }
  }

  try {
    await sendEngagementDocument(rec, user.name, user.email, clientEmail);
    } catch(e) {
    }

  const mondayId = rec.monday_id || (rec.fields && rec.fields.monday_id);
  if (mondayModule && mondayId) {
    try {
      const itemCheck = await mondayModule.query(`query { items(ids: ["${mondayId}"]) { board { id } } }`);
      const boardId = itemCheck?.items?.[0]?.board?.id;
      const isOnProposalBoard = String(boardId) === String(mondayModule.BOARDS.proposal);

      if (isOnProposalBoard) {
        await mondayModule.moveToGroup(mondayModule.BOARDS.proposal, mondayId, mondayModule.PROPOSAL_GROUPS.started_projects);
      } else {
        await mondayModule.moveToBoard(mondayModule.BOARDS.negotiations, mondayId, mondayModule.BOARDS.proposal, mondayModule.PROPOSAL_GROUPS.started_projects);
      }
      console.log('Lead moved to STARTED PROJECTS:', mondayId);
      const today = new Date().toISOString().split('T')[0];
      const closedDateVal = JSON.stringify(JSON.stringify({ date: today }));
      await mondayModule.query(`mutation { change_column_value(board_id: ${mondayModule.BOARDS.proposal}, item_id: ${mondayId}, column_id: "date_mm3gx943", value: ${closedDateVal}) { id } }`).catch(e => console.error('Set closed date error:', e.message));
    } catch(e) {
      console.error('Monday move to STARTED PROJECTS error:', e.message);
    }
  }

  if (mondayModule && price >= 5000) {
    try {
      const itemId = await mondayModule.createPendingLoginItem(
        row.name, 
        clientEmail, 
        rec.addr || ''
      );
      console.log('Monday.com item created:', itemId, 'for:', row.name);
    } catch(e) {
      }
  }
}

module.exports = { createProposal, sendEngagementDocument, handleWebhook, selectTemplate, TEMPLATES };
