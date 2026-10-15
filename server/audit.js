// audit.js — read-only proposal audit page for admins
// Open /admin/proposal-audit (optionally ?from=YYYY-MM-DD&to=YYYY-MM-DD)

const COUNTED_GROUPS = ['group_mkxzcgkr', 'group_mky78qcz', 'group_mky4ey72']; // Sent, Follow Up, Started
const COL_REP = 'dropdown_mm5c51r2';
const COL_AMOUNT = 'numeric_mky1cmcv';
const COL_SENT = 'date_mky1pazj';
const COL_REQ = 'date_mky1dh5s';
const COL_CLOSED = 'date_mm3gx943';

const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toIso = d => (d && d.includes('/')) ? d.split('/').reverse().join('-') : (d || '');

async function fetchAllItems(monday) {
  const first = await monday.query(`query {
    boards(ids: ["${monday.BOARDS.proposal}"]) {
      groups { id title items_page(limit: 500) { cursor items { id name
        column_values(ids: ["${COL_REP}","${COL_AMOUNT}","${COL_SENT}","${COL_REQ}","${COL_CLOSED}"]) { id text } } } }
    } }`);
  const out = [];
  for (const g of first?.boards?.[0]?.groups || []) {
    let page = g.items_page;
    while (page) {
      for (const it of page.items || []) out.push({ ...it, groupId: g.id, groupTitle: g.title });
      if (!page.cursor) break;
      const next = await monday.query(`query { next_items_page(limit: 500, cursor: "${page.cursor}") { cursor items { id name
        column_values(ids: ["${COL_REP}","${COL_AMOUNT}","${COL_SENT}","${COL_REQ}","${COL_CLOSED}"]) { id text } } } }`);
      page = next?.next_items_page;
    }
  }
  return out;
}

function register(app, { requireAuth, requireAdmin, dbAll, monday }) {
  app.get('/admin/proposal-audit', requireAuth, requireAdmin, async (req, res) => {
    try {
      const from = req.query.from || '';
      const to = req.query.to || '';
      const users = await dbAll('SELECT id, name, monday_name, role, active FROM users');
      const items = await fetchAllItems(monday);
      const col = (it, id) => it.column_values?.find(c => c.id === id)?.text || '';

      const rows = items.map(it => {
        const repText = col(it, COL_REP);
        const sent = toIso(col(it, COL_SENT));
        const reqd = toIso(col(it, COL_REQ));
        const dateUsed = sent || reqd;
        const inRange = !from || !to ? true : (!dateUsed ? null : dateUsed >= from && dateUsed <= to);
        return {
          name: it.name, id: it.id, group: it.groupTitle, counted: COUNTED_GROUPS.includes(it.groupId),
          repText, reps: repText.split(',').map(s => s.trim()).filter(Boolean),
          sent, reqd, closed: toIso(col(it, COL_CLOSED)),
          amount: parseFloat(String(col(it, COL_AMOUNT)).replace(/[^0-9.]/g, '')) || 0,
          inRange,
        };
      });

      let html = `<!doctype html><meta charset="utf-8"><title>Proposal Audit</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#2A2B29}table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:28px}
th,td{border:1px solid #e0d9d5;padding:5px 8px;text-align:left}th{background:#f3eae5}.warn{background:#fff4e5}.no{color:#999}h2{margin-top:32px}
.sum td{font-weight:700}</style>
<h1>Proposal audit — 26_3 Proposal board</h1>
<form>From <input type="date" name="from" value="${esc(from)}"> To <input type="date" name="to" value="${esc(to)}"> <button>Apply</button> <a href="?">All time</a></form>
<p>Total items on board: ${rows.length}. "Counted by app" = item sits in Sent Proposals, Follow Up or Started Projects (the groups the Commission tab counts).
Orange rows = no sent/requested date (the app currently counts these in <b>every</b> date range) or shared between reps (counted in full for each).</p>
<h2>Summary</h2><table class="sum"><tr><th>Rep</th><th>Counted by app (matching logic)</th><th>Exact-name, dated, in range</th><th>Undated</th><th>Shared</th><th>In other groups (not counted)</th></tr>`;

      const detail = [];
      for (const u of users) {
        const rn = norm(u.monday_name || u.name);
        const fuzzy = rows.filter(r => { const rc = norm(r.repText); return rc && (rc.includes(rn) || rn.includes(rc)); });
        const exact = rows.filter(r => r.reps.some(x => norm(x) === rn));
        const appCount = fuzzy.filter(r => r.counted && r.inRange !== false).length;
        const strict = exact.filter(r => r.counted && (r.sent || r.reqd) && r.inRange !== false).length;
        const undated = exact.filter(r => r.counted && !r.sent && !r.reqd).length;
        const shared = exact.filter(r => r.counted && r.reps.length > 1).length;
        const other = exact.filter(r => !r.counted).length;
        html += `<tr><td>${esc(u.name)}${u.monday_name ? ' <span class="no">(' + esc(u.monday_name) + ')</span>' : ''}</td><td>${appCount}</td><td>${strict}</td><td>${undated}</td><td>${shared}</td><td>${other}</td></tr>`;
        detail.push({ u, list: exact });
      }
      html += '</table>';

      for (const { u, list } of detail) {
        html += `<h2>${esc(u.name)} — ${list.length} items</h2><table><tr><th>Client</th><th>Group</th><th>Counted</th><th>Rep(s)</th><th>Requested</th><th>Sent</th><th>Closed</th><th>Amount</th><th>In range</th></tr>`;
        for (const r of list.sort((a, b) => (b.sent || b.reqd || '').localeCompare(a.sent || a.reqd || ''))) {
          const warn = (r.counted && !r.sent && !r.reqd) || r.reps.length > 1;
          html += `<tr class="${warn ? 'warn' : ''}"><td>${esc(r.name)}</td><td>${esc(r.group)}</td><td>${r.counted ? 'Yes' : '<span class="no">No</span>'}</td><td>${esc(r.repText)}</td><td>${esc(r.reqd)}</td><td>${esc(r.sent)}</td><td>${esc(r.closed)}</td><td>$${r.amount.toLocaleString('en-AU')}</td><td>${r.inRange === null ? 'no date' : r.inRange ? 'Yes' : 'No'}</td></tr>`;
        }
        html += '</table>';
      }
      const unassigned = rows.filter(r => r.counted && !r.repText);
      html += `<h2>No rep set — ${unassigned.length} items (not counted for anyone)</h2><table><tr><th>Client</th><th>Group</th><th>Sent</th><th>Amount</th></tr>` +
        unassigned.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.group)}</td><td>${esc(r.sent || r.reqd)}</td><td>$${r.amount.toLocaleString('en-AU')}</td></tr>`).join('') + '</table>';

      res.send(html);
    } catch (e) {
      res.status(500).send('Audit error: ' + esc(e.message));
    }
  });
}

module.exports = { register };
