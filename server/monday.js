// monday.js — Xpress Draft Monday.com CRM Integration
const fetch = require('node-fetch');

const MONDAY_API = 'https://api.monday.com/v2';

// Board IDs
const BOARDS = {
  negotiations:       '18388602724',
  free_consultations: '224212751',
  proposal:           '18389820785',
};

// Group IDs on 26_3 Proposal board
const PROPOSAL_GROUPS = {
  new_requests:    'group_mkxz6tw3',
  sent_proposals:  'group_mkxzcgkr',
  follow_up:       'group_mky78qcz',
  started_projects: 'group_mky4ey72',
};

// Column IDs on 26_2 Negotiations board
const COLS = {
  source:      'color_mky1aas7',
  arrival:     'date_mm135v04',
  status:      'color_mkxzy23p',
  salesperson: 'board_relation_mky4h701',
  phone:       'phone_mky18hs6',
  email:       'email_mky1wg4h',
  enquiry:     'long_text_mkxzds8g',
  address:     'text_mky7qn0k',
  files:       'file_mkxzg1me',
  rep_dropdown: 'dropdown_mm5cb995',
  notes:       'long_text_mkxzbgfq',
  btn_free:    'button_mkxz4xs4',
  btn_proposal:'button_mkxz6sxp',
  btn_help:    'button_mkxz9mve',
};

// Button column on 26_3 Proposal board
const START_PROJECT_BTN = 'button_mky13qm';

function headers() {
  return {
    'Authorization': process.env.MONDAY_API_KEY,
    'Content-Type': 'application/json',
    'API-Version': '2024-10'
  };
}

async function query(q, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query: q, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

// ── Get all groups on a board ─────────────────────────────────────────────────
async function getGroups(boardId) {
  const data = await query(`
    query($boardId: ID!) {
      boards(ids: [$boardId]) {
        groups { id title }
      }
    }`, { boardId });
  return data?.boards?.[0]?.groups || [];
}

// ── Get group ID by name ──────────────────────────────────────────────────────
async function getGroupId(boardId, groupName) {
  const groups = await getGroups(boardId);
  const g = groups.find(g => g.title.toLowerCase().includes(groupName.toLowerCase()));
  return g?.id || null;
}

// ── Get leads assigned to a salesperson ──────────────────────────────────────
async function getLeadsForRep(repName) {
  // Get salesperson item ID
  let salespersonItemId = null;
  if (repName) {
    try {
      const spData = await query(`
        query {
          boards(ids: ["18390237344"]) {
            items_page(limit: 50) {
              items { id name }
            }
          }
        }`);
      const spItems = spData?.boards?.[0]?.items_page?.items || [];
      const match = spItems.find(i => i.name.toLowerCase().includes(repName.toLowerCase()));
      if (match) {
        salespersonItemId = match.id;
        console.log('Salesperson item ID for', repName, ':', salespersonItemId);
      }
    } catch(e) {
      console.error('Salesperson lookup error:', e.message);
    }
  }

  const data = await query(`
    query {
      boards(ids: [${BOARDS.negotiations}]) {
        groups {
          id
          title
          items_page(limit: 100) {
            items {
              id
              name
              column_values(ids: ["phone_mky18hs6", "email_mky1wg4h", "text_mky7qn0k", "long_text_mkxzds8g", "color_mkxzy23p", "color_mky1aas7", "date_mm135v04", "long_text_mkxzbgfq", "file_mkxzg1me", "dropdown_mm5cb995"]) {
                id
                text
                value
              }
            }
          }
        }
      }
    }`);
  const groups = data?.boards?.[0]?.groups || [];
  const leads = [];

  for (const group of groups) {
    if (group.title === 'LOST') continue;
    const items = group.items_page?.items || [];
    for (const item of items) {
      const cols = {};
      item.column_values.forEach(c => { cols[c.id] = c.text || ''; });

      // Filter by rep dropdown column
      const repCol = (cols['dropdown_mm5cb995'] || '').toLowerCase().replace(/[^a-z]/g, '');
      const repNameNorm = (repName || '').toLowerCase().replace(/[^a-z]/g, '');
      if (repName && repCol && !repCol.includes(repNameNorm) && !repNameNorm.includes(repCol)) continue;
      if (repName && !repCol) continue;

      // Parse files
      let filesReceived = '';
      const rawFiles = item.column_values.find(c => c.id === COLS.files);
      if (rawFiles && rawFiles.text) {
        const urls = rawFiles.text.split(', ').filter(u => u.trim());
        if (urls.length > 0) {
          filesReceived = urls.map(url => {
            const filename = decodeURIComponent(url.split('/').pop());
            return filename + '|' + url;
          }).join('\n');
        }
      }

      // Format arrival date as DD/MM/YYYY
      let arrival = cols[COLS.arrival] || '';
      if (arrival && arrival.match(/^\d{4}-\d{2}-\d{2}/)) {
        const parts = arrival.split('-');
        arrival = parts[2].substring(0,2) + '/' + parts[1] + '/' + parts[0];
      }

      leads.push({
        monday_id: item.id,
        name: item.name,
        phone: cols[COLS.phone] || '',
        email: cols[COLS.email] || '',
        address: cols[COLS.address] || '',
        enquiry: cols[COLS.enquiry] || '',
        rep_notes: cols[COLS.notes] || '',
        status: cols[COLS.status] || '',
        source: cols[COLS.source] || '',
        arrival,
        files_received: filesReceived,
        group_id: group.id,
        group_title: group.title,
      });
    }
  }

  console.log('Monday leads found:', leads.length, 'for rep:', repName);
  return leads;
}

// ── Move item to a different group ───────────────────────────────────────────
async function moveToGroup(boardId, itemId, groupId) {
  const data = await query(`
    mutation($itemId: ID!, $groupId: String!) {
      move_item_to_group(item_id: $itemId, group_id: $groupId) {
        id
      }
    }`, { itemId, groupId });
  return data?.move_item_to_group?.id;
}

// ── Move item to a different board ───────────────────────────────────────────
async function moveToBoard(sourceBoardId, itemId, targetBoardId, targetGroupId) {
  console.log('moveToBoard:', itemId, '->', targetBoardId, '/', targetGroupId);
  const data = await query(`
    mutation($itemId: ID!, $boardId: ID!, $targetBoardId: ID!, $groupId: String!) {
      move_item_to_board(item_id: $itemId, board_id: $boardId, target_board_id: $targetBoardId, group_id: $groupId) {
        id
      }
    }`, { itemId: String(itemId), boardId: String(sourceBoardId), targetBoardId: String(targetBoardId), groupId: targetGroupId });
  const newId = data?.move_item_to_board?.id;
  console.log('moveToBoard result:', newId || 'FAILED - no id returned', data?.errors || '');
  return newId;
}

// ── Get Follow Up leads from Proposal board ──────────────────────────────────
async function getProposalFollowUpLeads(repName) {
  const data = await query(`
    query($boardId: ID!) {
      boards(ids: [$boardId]) {
        groups(ids: ["group_mky78qcz"]) {
          id
          title
          items_page(limit: 100) {
            items {
              id
              name
              column_values(ids: ["phone_mky18hs6", "email_mky1wg4h", "text_mky7qn0k", "long_text_mkxzds8g", "color_mkxzy23p", "color_mky1aas7", "dropdown_mm5c51r2", "date_mm135v04", "long_text_mkxzbgfq", "file_mkxzg1me"]) {
                id
                text
                value
              }
            }
          }
        }
      }
    }`, { boardId: BOARDS.proposal });

  const groups = data?.boards?.[0]?.groups || [];
  const leads = [];

  for (const group of groups) {
    const items = group.items_page?.items || [];
    for (const item of items) {
      const cols = {};
      item.column_values.forEach(c => { cols[c.id] = c.text || ''; });

      // Filter by rep dropdown column
      const repCol = (cols['dropdown_mm5c51r2'] || '').toLowerCase().replace(/[^a-z]/g, '');
      const repNameNorm = (repName || '').toLowerCase().replace(/[^a-z]/g, '');
      if (repName && repCol && !repCol.includes(repNameNorm) && !repNameNorm.includes(repCol)) continue;
      if (repName && !repCol) continue;

      // Parse files
      let filesReceived = '';
      const rawFiles = item.column_values.find(c => c.id === 'file_mkxzg1me');
      if (rawFiles && rawFiles.text) {
        const urls = rawFiles.text.split(', ').filter(u => u.trim());
        if (urls.length > 0) {
          filesReceived = urls.map(url => {
            const filename = decodeURIComponent(url.split('/').pop());
            return filename + '|' + url;
          }).join('\n');
        }
      }

      // Format arrival date
      let arrival = cols['date_mm135v04'] || '';
      if (arrival && arrival.match(/^\d{4}-\d{2}-\d{2}/)) {
        const parts = arrival.split('-');
        arrival = parts[2].substring(0,2) + '/' + parts[1] + '/' + parts[0];
      }

      leads.push({
        monday_id: item.id,
        name: item.name,
        phone: cols['phone_mky18hs6'] || '',
        email: cols['email_mky1wg4h'] || '',
        address: cols['text_mky7qn0k'] || '',
        enquiry: cols['long_text_mkxzds8g'] || '',
        rep_notes: cols['long_text_mkxzbgfq'] || '',
        status: cols['color_mkxzy23p'] || '',
        source: cols['color_mky1aas7'] || '',
        arrival,
        files_received: filesReceived,
        group_id: 'group_mky78qcz',
        group_title: 'PROPOSAL FOLLOW UP',
        from_proposal_board: true,
      });
    }
  }

  console.log('Proposal Follow Up leads found:', leads.length, 'for rep:', repName);
  return leads;
}

// ── Get file download URLs from Monday.com assets ────────────────────────────
async function getFileDownloadUrl(assetId) {
  const data = await query(`
    query($assetId: ID!) {
      assets(ids: [$assetId]) {
        id
        name
        public_url
        url
      }
    }`, { assetId });
  const asset = data?.assets?.[0];
  return asset ? { name: asset.name, url: asset.public_url || asset.url } : null;
}

// ── Get all files for a lead item ─────────────────────────────────────────────
async function getLeadFiles(itemId) {
  const data = await query(`
    query($itemId: ID!) {
      items(ids: [$itemId]) {
        assets {
          id
          name
          public_url
          url
          file_size
          created_at
        }
      }
    }`, { itemId });
  const assets = data?.items?.[0]?.assets || [];
  console.log('Monday files for item', itemId, ':', JSON.stringify(assets).slice(0, 300));
  return assets;
}

// ── Update multiple lead fields ──────────────────────────────────────────────
async function updateLeadDetails(itemId, details) {
  const updates = [];
  if (details.address !== undefined) updates.push({ colId: COLS.address, value: JSON.stringify(details.address) });
  if (details.phone !== undefined) updates.push({ colId: COLS.phone, value: JSON.stringify({ phone: details.phone, countryShortName: 'AU' }) });
  if (details.email !== undefined) updates.push({ colId: COLS.email, value: JSON.stringify({ email: details.email, text: details.email }) });
  if (details.source !== undefined) updates.push({ colId: COLS.source, value: JSON.stringify({ label: details.source }) });
  if (details.status !== undefined) updates.push({ colId: COLS.status, value: JSON.stringify({ label: details.status }) });

  for (const u of updates) {
    try {
      await query(`
        mutation($boardId: ID!, $itemId: ID!, $colId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $colId, value: $value) { id }
        }`, { boardId: BOARDS.negotiations, itemId, colId: u.colId, value: u.value });
    } catch(e) {
      console.error('Update field error:', u.colId, e.message);
    }
  }
}

// ── Update rep notes field (syncs to NOTES column) ───────────────────────────
async function updateNotes(itemId, notes) {
  const value = JSON.stringify({ text: notes });
  const data = await query(`
    mutation($boardId: ID!, $itemId: ID!, $colId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $colId, value: $value) {
        id
      }
    }`, { boardId: BOARDS.negotiations, itemId, colId: COLS.notes, value });
  return data?.change_column_value?.id;
}

// ── Click FREE CONSULTATION button → move to Free Consultations board ────────
async function clickFreeConsultation(itemId) {
  const groups = await getGroups(BOARDS.free_consultations);
  const targetGroup = groups[0]?.id;
  if (!targetGroup) throw new Error('No groups found on Free Consultations board');
  return await moveToBoard(BOARDS.negotiations, itemId, BOARDS.free_consultations, targetGroup);
}

// ── Click PROPOSAL REQUESTED button → move to Proposal board NEW REQUESTS ────
async function clickProposalRequested(itemId) {
  return await moveToBoard(BOARDS.negotiations, itemId, BOARDS.proposal, PROPOSAL_GROUPS.new_requests);
}

// ── Move to SENT PROPOSALS (after proposal generated) ────────────────────────
async function moveToSentProposals(itemId) {
  return await moveToBoard(BOARDS.negotiations, itemId, BOARDS.proposal, PROPOSAL_GROUPS.sent_proposals);
}

// ── Click HELP REQUIRED button → move to HELP REQUIRED group ─────────────────
async function clickHelpRequired(itemId) {
  const groupId = await getGroupId(BOARDS.negotiations, 'HELP REQUIRED');
  if (!groupId) throw new Error('HELP REQUIRED group not found');
  return await moveToGroup(BOARDS.negotiations, itemId, groupId);
}

// ── Move to FOLLOW UP CALLS (after proposal sent) ────────────────────────────
async function moveToFollowUp(itemId) {
  const groupId = await getGroupId(BOARDS.negotiations, 'FOLLOW UP EMAILS / CALLS');
  if (!groupId) throw new Error('FOLLOW UP CALLS group not found');
  return await moveToGroup(BOARDS.negotiations, itemId, groupId);
}

// ── Move to LOST ─────────────────────────────────────────────────────────────
async function moveToLost(itemId) {
  const groupId = await getGroupId(BOARDS.negotiations, 'LOST');
  if (!groupId) throw new Error('LOST group not found');
  return await moveToGroup(BOARDS.negotiations, itemId, groupId);
}

// ── Move to CLOSED DEALS (after payment) ─────────────────────────────────────
async function moveToClosedDeals(itemId) {
  const groupId = await getGroupId(BOARDS.negotiations, 'CLOSED DEALS');
  if (!groupId) throw new Error('CLOSED DEALS group not found');
  return await moveToGroup(BOARDS.negotiations, itemId, groupId);
}

// ── Find item on Proposal board by name and click START PROJECT ───────────────
async function clickStartProject(clientName) {
  // Search for the item on the Proposal board
  const data = await query(`
    query($boardId: ID!) {
      boards(ids: [$boardId]) {
        groups {
          items_page(limit: 200) {
            items { id name }
          }
        }
      }
    }`, { boardId: BOARDS.proposal });

  const groups = data?.boards?.[0]?.groups || [];
  let itemId = null;

  for (const group of groups) {
    const item = group.items_page?.items?.find(i => 
      i.name.toLowerCase().includes(clientName.toLowerCase())
    );
    if (item) { itemId = item.id; break; }
  }

  if (!itemId) {
    console.log('START PROJECT: item not found for client:', clientName);
    return null;
  }

  // Trigger the button by changing its value
  const data2 = await query(`
    mutation($boardId: ID!, $itemId: ID!, $colId: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $colId, value: "true") {
        id
      }
    }`, { boardId: BOARDS.proposal, itemId, colId: START_PROJECT_BTN });

  console.log('START PROJECT clicked for:', clientName, 'item:', itemId);
  return data2?.change_simple_column_value?.id;
}

// ── Create PENDING CLIENT LOGINS item (existing function kept) ────────────────
async function createPendingLoginItem(clientName, clientEmail, siteAddress) {
  const groupId = await getGroupId(BOARDS.negotiations, 'PENDING CLIENT LOGINS').catch(() => null);
  
  // Fall back to a different board if needed
  const targetBoardId = '18417343069';
  const targetGroupId = await getGroupId(targetBoardId, 'PENDING CLIENT LOGINS');
  if (!targetGroupId) throw new Error('PENDING CLIENT LOGINS group not found');

  const columnValues = JSON.stringify({
    [COLS.email]: { email: clientEmail, text: clientEmail },
    [COLS.address]: siteAddress || ''
  });

  const mutation = `
    mutation {
      create_item(
        board_id: ${targetBoardId},
        group_id: "${targetGroupId}",
        item_name: "${clientName.replace(/"/g, '\\"')}",
        column_values: ${JSON.stringify(columnValues)}
      ) { id name }
    }`;

  const data = await query(mutation);
  return data?.create_item?.id || null;
}

// ── Get rep commission stats from Monday.com ─────────────────────────────────
async function getRepStatsFromMonday(repName, fromDate = null, toDate = null) {
  console.log('getRepStatsFromMonday called for:', repName, fromDate ? `(${fromDate} to ${toDate})` : '(all time)');
  const data = await query(`
    query {
      boards(ids: ["18389820785"]) {
        groups(ids: ["group_mkxzcgkr", "group_mky78qcz", "group_mky4ey72"]) {
          id
          title
          items_page(limit: 500) {
            items {
              id
              name
              column_values(ids: ["dropdown_mm5c51r2", "numeric_mky1cmcv", "date_mm3gx943"]) {
                id text value
              }
            }
          }
        }
      }
    }`);

  const groups = data?.boards?.[0]?.groups || [];
  const repNameNorm = (repName || '').toLowerCase().replace(/[^a-z]/g, '');
  const allItemsFlat = groups.flatMap(g => g.items_page?.items || []);
  console.log('getRepStatsFromMonday: repNameNorm=', repNameNorm, '| total items:', allItemsFlat.length);
  // Log all unique dropdown values to diagnose matching
  const dropdownVals = [...new Set(allItemsFlat.map(i => {
    const col = i.column_values?.find(c => c.id === 'dropdown_mm5c51r2');
    return (col?.text || 'EMPTY') + '|' + (col?.value || '');
  }))];
  console.log('All dropdown values:', dropdownVals.slice(0, 20).join(', '));

  function matchesRep(item) {
    const repCol = (item.column_values?.find(c => c.id === 'dropdown_mm5c51r2')?.text || '').toLowerCase().replace(/[^a-z]/g, '');
    return repCol && (repCol.includes(repNameNorm) || repNameNorm.includes(repCol));
  }

  function matchesDateRange(item) {
    if (!fromDate || !toDate) return true;
    const dateCol = item.column_values?.find(c => c.id === 'date_mm3gx943')?.text || '';
    if (!dateCol) return false;
    let itemDate = dateCol;
    if (dateCol.includes('/')) {
      const parts = dateCol.split('/');
      itemDate = parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return itemDate >= fromDate && itemDate <= toDate;
  }

  function getAmount(item) {
    const val = item.column_values?.find(c => c.id === 'numeric_mky1cmcv')?.text || '0';
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
  }

  let sentProposals = 0, sentValue = 0, closedDeals = 0, closedValue = 0;

  for (const group of groups) {
    const items = group.items_page?.items || [];
    const repItems = items.filter(matchesRep);
    if (group.id === 'group_mky4ey72') {
      const filtered = fromDate ? repItems.filter(matchesDateRange) : repItems;
      closedDeals = filtered.length;
      closedValue = filtered.reduce((sum, i) => sum + getAmount(i), 0);
    } else {
      sentProposals += repItems.length;
      sentValue += repItems.reduce((sum, i) => sum + getAmount(i), 0);
    }
  }

  const conversionRate = sentProposals > 0 ? Math.round((closedDeals / sentProposals) * 100) : 0;
  return { sentProposals, sentValue, closedDeals, closedValue, conversionRate };
}

module.exports = {
  getLeadsForRep,
  getRepStatsFromMonday,
  getProposalFollowUpLeads,
  moveToSentProposals,
  PROPOSAL_GROUPS,
  getLeadFiles,
  moveToLost,
  updateLeadDetails,
  getGroupId,
  moveToGroup,
  moveToFollowUp,
  moveToClosedDeals,
  clickFreeConsultation,
  clickProposalRequested,
  clickHelpRequired,
  clickStartProject,
  updateNotes,
  createPendingLoginItem,
  query,
  BOARDS,
  COLS,
};
