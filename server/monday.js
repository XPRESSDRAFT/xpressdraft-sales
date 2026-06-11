// monday.js — Monday.com Integration
const fetch = require('node-fetch');

const MONDAY_API = 'https://api.monday.com/v2';
const BOARD_ID = '18417343069';

function mondayHeaders() {
  return {
    'Authorization': process.env.MONDAY_API_KEY,
    'Content-Type': 'application/json',
    'API-Version': '2024-01'
  };
}

// Get group ID by name
async function getGroupId(groupName) {
  const query = `query {
    boards(ids: ${BOARD_ID}) {
      groups {
        id
        title
      }
    }
  }`;

  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: mondayHeaders(),
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  const groups = data?.data?.boards?.[0]?.groups || [];
  console.log('Monday groups:', groups.map(g => g.title));
  const group = groups.find(g => g.title.toLowerCase().includes(groupName.toLowerCase()));
  return group?.id || null;
}

// Create item in PENDING CLIENT LOGINS group
async function createPendingLoginItem(clientName, clientEmail, siteAddress) {
  // Get group ID
  const groupId = await getGroupId('PENDING CLIENT LOGINS');
  if (!groupId) {
    console.error('Monday: PENDING CLIENT LOGINS group not found');
    return null;
  }

  const columnValues = JSON.stringify({
    email: { email: clientEmail, text: clientEmail },
    text: siteAddress || ''
  });

  const mutation = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      group_id: "${groupId}",
      item_name: "${clientName.replace(/"/g, '\\"')}",
      column_values: ${JSON.stringify(columnValues)}
    ) {
      id
      name
    }
  }`;

  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: mondayHeaders(),
    body: JSON.stringify({ query: mutation })
  });

  const data = await res.json();
  console.log('Monday item created:', JSON.stringify(data).slice(0, 200));

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data?.data?.create_item?.id || null;
}

module.exports = { createPendingLoginItem };
