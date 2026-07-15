// monday.js — Xpress Draft Monday.com CRM Integration
const fetch = require('node-fetch');

const MONDAY_API = 'https://api.monday.com/v2';

// Board IDs
const BOARDS = {
  negotiations:      '18388602724',
  free_consultations: '224212751',
  proposal:          '18389820785',
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
    'API-Version': '2024-01'
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
  const data = await query(`
    query($boardId: ID!) {
      boards(ids: [$boardId]) {
        groups {
          id
          title
          items_page(limit: 100) {
            items {
              id
              name
              column_values(ids: ["phone_mky18hs6", "email_mky1wg4h", "text_mky7qn0k", "long_text_mkxzds8g", "color_mkxzy23p", "color_mky1aas7", "board_relation_mky4h701", "date_mm135v04", "long_text_mkxzbgfq", "file_mkxzg1me"]) {
                id
                text
                value
              }
            }
          }
        }
      }
    }`, { boardId: BOARDS.negotiations });

  console.log('Monday raw response:', JSON.stringify(data).slice(0, 500));
  const groups = data?.boards?.[0]?.groups || [];
  console.log('Groups found:', groups.length, groups.map(g => g.title + '(' + (g.items_page?.items?.length || 0) + ' items)'));
  const leads = [];

  for (const group of groups) {
    const items = group.items_page?.items || [];
    for (const item of items) {
      const cols = {};

      item.column_values.forEach(c => {
        cols[c.id] = c.text || '';
      });

      // Skip LOST leads - kept in Monday.com only
      if (group.title === 'LOST') continue;

      // Parse files from Monday.com file column
      let filesReceived = '';
      const rawFiles = item.column_values.find(c => c.id === COLS.files);
      console.log('Files raw for', item.name, ':', JSON.stringify(rawFiles).slice(0, 200));
      if (rawFiles && rawFiles.value) {
        try {
          const parsed = JSON.parse(rawFiles.value);
          if (parsed.files && parsed.files.length > 0) {
            filesReceived = parsed.files.map(f => f.name || f.asset_id || 'file').join('\n');
          }
        } catch(e) {
          filesReceived = rawFiles.text || '';
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
    mutation($boardId: ID!, $itemId: ID!, $groupId: String!) {
      move_item_to_group(board_id: $boardId, item_id: $itemId, group_id: $groupId) {
        id
      }
    }`, { boardId, itemId, groupId });
  return data?.move_item_to_group?.id;
}

// ── Move item to a different board ───────────────────────────────────────────
async function moveToBoard(sourceBoardId, itemId, targetBoardId, targetGroupId) {
  const data = await query(`
    mutation($boardId: ID!, $itemId: ID!, $targetBoardId: ID!, $groupId: String!) {
      move_item_to_board(board_id: $boardId, item_id: $itemId, target_board_id: $targetBoardId, group_id: $groupId) {
        id
      }
    }`, { boardId: sourceBoardId, itemId, targetBoardId, groupId: targetGroupId });
  return data?.move_item_to_board?.id;
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

// ── Click PROPOSAL REQUESTED button → move to Proposal board ─────────────────
async function clickProposalRequested(itemId) {
  const groups = await getGroups(BOARDS.proposal);
  const targetGroup = groups[0]?.id;
  if (!targetGroup) throw new Error('No groups found on Proposal board');
  return await moveToBoard(BOARDS.negotiations, itemId, BOARDS.proposal, targetGroup);
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

module.exports = {
  getLeadsForRep,
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
  BOARDS,
  COLS,
};
