# 2. public/js/admin-page.js (582 lines)

NEW file: in GitHub open public/js → Add file → Create new file → name it admin-page.js, paste everything in the box, commit.

```js
function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'commission') loadCommissionTab();
  if (name === 'system') loadStorage();
  if (name === 'sales') { loadRepDropdown(); loadAllSales(); }
  if (name === 'pipeline') loadPipeline();
  if (name === 'invoices') loadInvoicesTab();
  if (name === 'pricing') loadPricing();
}

// ── Automation status (Integrations tab) ───────────────────────────────────
async function loadAutomationStatus() {
  const el = document.getElementById('automationStatus');
  el.innerHTML = 'Loading…';
  try {
    const r = await fetch('/api/admin/automation-status');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    const ok = b => b ? '<span style="color:#27AE60">✅</span>' : '<span style="color:#c00">❌</span>';
    const c = d.clockify || {};
    const eng = (d.engagements.counts || []).map(x => x.status + ': ' + x.n).join(' · ') || 'none yet';
    const rows = (d.engagements.recent || []).map(e => '<tr><td style="padding:4px 8px">' + e.proposal_item_id + '</td><td style="padding:4px 8px">' + e.status + '</td><td style="padding:4px 8px">' + (e.clockify_project_id || '') + '</td><td style="padding:4px 8px;color:#c00">' + (e.last_error || '') + '</td><td style="padding:4px 8px">' + (e.status === 'failed' ? '<button class="btn btn-sm" onclick="retryEngagement(\'' + e.proposal_item_id + '\')">Retry</button>' : '') + '</td></tr>').join('');
    el.innerHTML =
      '<div style="margin-bottom:8px"><b>Settings on Render:</b> ' + Object.keys(d.env).map(k => ok(d.env[k]) + ' ' + k).join(' &nbsp; ') + '</div>' +
      '<div style="margin-bottom:8px"><b>Clockify → Time Sheet:</b> ' + (c.received || 0) + ' events received · ' + (c.created || 0) + ' rows created · ' + (c.adopted || 0) + ' existing rows matched · ' + (c.updated || 0) + ' updated · ' + (c.archived || 0) + ' archived · ' + (c.errors || 0) + ' errors' + (c.lastEventAt ? ' · last event ' + new Date(c.lastEventAt).toLocaleString('en-AU') : '') + (c.lastError ? '<br><span style="color:#c00">Last error: ' + c.lastError + '</span>' : '') + '</div>' +
      '<div style="margin-bottom:8px"><b>Clockify set-up on engagement:</b> ' + eng + '</div>' +
      (rows ? '<table style="font-size:12px;border-collapse:collapse;margin-bottom:8px"><tr><th style="text-align:left;padding:4px 8px">Proposal item</th><th style="text-align:left;padding:4px 8px">Status</th><th style="text-align:left;padding:4px 8px">Clockify project</th><th style="text-align:left;padding:4px 8px">Problem</th><th></th></tr>' + rows + '</table>' : '') +
      '<div><b>Webhook URLs:</b><br>Clockify (new / updated / timer stopped): <code>' + d.urls.clockifyWebhook + '</code><br>Clockify (deleted): <code>' + d.urls.clockifyDeletedWebhook + '</code><br>Lead Inbox (monday, item created): <code>' + d.urls.leadInboxWebhook + '</code></div>';
  } catch (e) {
    el.innerHTML = '<span style="color:#c00">❌ ' + e.message + '</span>';
  }
}
async function retryEngagement(id) {
  await fetch('/api/admin/engagements/' + id + '/retry', { method: 'POST' });
  loadAutomationStatus();
}

// Bind tab clicks directly (does not rely on inline onclick)
(function bindTabs() {
  var names = ['team','commission','pipeline','sales','pricing','invoices','integrations','system'];
  document.querySelectorAll('.tab-nav .tab-btn').forEach(function (btn, i) {
    btn.removeAttribute('onclick');
    btn.addEventListener('click', function () {
      try { showTab(names[i], btn); } catch (e) { console.error('showTab error:', e); }
    });
  });
})();

const fmt = n => '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

var _adminDateMode = 'week';
var _adminDateFrom = null;
var _adminDateTo = null;

function setAdminDateMode(mode) {
  _adminDateMode = mode;
  document.getElementById('adminBtnWeek').style.background = mode === 'week' ? '#EA672F' : '#fff';
  document.getElementById('adminBtnWeek').style.color = mode === 'week' ? '#fff' : '#2A2B29';
  document.getElementById('adminBtnCustom').style.background = mode === 'custom' ? '#EA672F' : '#fff';
  document.getElementById('adminBtnCustom').style.color = mode === 'custom' ? '#fff' : '#2A2B29';
  document.getElementById('adminCustomRange').style.display = mode === 'custom' ? 'flex' : 'none';
  if (mode === 'week') { _adminDateFrom = null; _adminDateTo = null; loadCommissionTab(); }
}

function applyAdminRange() {
  _adminDateFrom = document.getElementById('adminDateFrom').value;
  _adminDateTo = document.getElementById('adminDateTo').value;
  if (!_adminDateFrom || !_adminDateTo) { alert('Please select both dates'); return; }
  loadCommissionTab();
}

async function loadCommissionTab() {
  document.getElementById('commissionOverview').innerHTML = '<p style="color:#888;font-size:13px">Loading...</p>';
  try {
  let url = '/api/admin/commission';
  if (_adminDateMode === 'custom' && _adminDateFrom && _adminDateTo) {
    url += '?from=' + _adminDateFrom + '&to=' + _adminDateTo;
  } else {
    // Pass current week dates in AEST (UTC+10)
    const aestOffset = 10 * 60 * 60000;
    const now = new Date(Date.now() + aestOffset);
    const day = now.getUTCDay();
    const diff = day >= 3 ? day - 3 : day + 4;
    const ws = new Date(now.getTime() - diff * 86400000);
    const we = new Date(ws.getTime() + 6 * 86400000);
    const fmtD = d => d.toISOString().split('T')[0];
    url += '?from=' + fmtD(ws) + '&to=' + fmtD(we);
  }
  const res = await fetch(url);
  if (!res.ok) { document.getElementById('commissionOverview').innerHTML = '<p style="color:#c00">Failed to load commission data.</p>'; return; }
  const data = await res.json();

  document.getElementById('commissionOverview').innerHTML = !data.summary.length
    ? '<p style="color:#888;font-size:13px">No reps found.</p>'
    : `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:2px solid #f0e8e4">
        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Rep</th>
        <th style="text-align:center;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Role</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Proposals Sent</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Closed</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Closed Value</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Conversion</th>
        <th style="padding:8px 12px"></th>
      </tr></thead><tbody>` +
    data.summary.map(s => `
      <tr style="border-bottom:1px solid #f0e8e4">
        <td style="padding:12px"><div style="font-size:14px;font-weight:700;color:#2A2B29">${s.user.name}</div></td>
        <td style="padding:12px;text-align:center"><span class="badge ${s.role === 'leader' ? 'badge-admin' : 'badge-user'}">${s.role}</span></td>
        <td style="padding:12px;text-align:right">
          <div style="font-size:14px;font-weight:700;color:#2A2B29">${s.sentProposals || 0}</div>
          <div style="font-size:11px;color:#888">${fmt(s.sentValue || 0)}</div>
        </td>
        <td style="padding:12px;text-align:right">
          <div style="font-size:14px;font-weight:700;color:#27AE60">${s.closedDeals || 0}</div>
        </td>
        <td style="padding:12px;text-align:right">
          <div style="font-size:14px;font-weight:700;color:#EA672F">${fmt(s.closedValue || 0)}</div>
          ${s.role === 'leader' && s.totalOverride > 0 ? '<div style="font-size:11px;color:#27AE60">+' + fmt(s.totalOverride) + ' override</div>' : ''}
        </td>
        <td style="padding:12px;text-align:right;font-size:14px;font-weight:700;color:#3498DB">${s.conversionRate || 0}%</td>
        <td style="padding:12px;text-align:right"><button onclick="viewAs(${s.user.id}, '${s.user.name.replace(/'/g,"\\'")}', _adminDateFrom && _adminDateTo ? _adminDateFrom + ',' + _adminDateTo : '')" style="background:#2A2B29;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap">View →</button></td>
      </tr>`).join('') + '</tbody></table>';

  // Load rep settings
  const usersRes = await fetch('/api/admin/users');
  const users = await usersRes.json();
  const leaders = users.filter(u => u.role === 'leader');
  document.getElementById('repSettings').innerHTML = users.map(u => `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;padding:10px 0;border-bottom:1px solid #f0e8e4;align-items:center">
      <div style="font-size:13px;font-weight:700;color:#2A2B29">${u.name}</div>
      <select onchange="setRole(${u.id}, this.value)" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:5px 8px;outline:none">
        <option value="standard" ${u.role === 'standard' || u.role === 'user' ? 'selected' : ''}>Standard</option>
        <option value="leader" ${u.role === 'leader' ? 'selected' : ''}>Leader</option>
      </select>
      <select onchange="setLeader(${u.id}, this.value)" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:5px 8px;outline:none">
        <option value="">No Leader</option>
        ${leaders.filter(l => l.id !== u.id).map(l => `<option value="${l.id}" ${u.leader_id == l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
      </select>
      <div style="display:flex;align-items:center;gap:4px">
        <label style="font-size:11px;color:#888;white-space:nowrap">Start:</label>
        <input type="date" value="${u.start_date || ''}" onchange="setStartDate(${u.id}, this.value)" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:5px 8px;outline:none">
      </div>
    </div>`).join('');
  } catch(e) {
    document.getElementById('commissionOverview').innerHTML = '<p style="color:#c00">Error: ' + e.message + '</p>';
    console.error('loadCommissionTab error:', e);
  }
}

async function viewAs(userId, name, dateRange) {
  window._viewingUserId = userId;
  window._viewingName = name;
  const section = document.getElementById('viewAsSection');
  section.style.display = 'block';
  document.getElementById('viewAsName').textContent = name;
  document.getElementById('viewAsContent').innerHTML = '<p style="color:#888;font-size:13px">Loading...</p>';

  let url = '/api/admin/commission/' + userId;
  if (dateRange && dateRange.includes(',')) {
    const [from, to] = dateRange.split(',');
    url += '?from=' + from + '&to=' + to;
  }
  const res = await fetch(url);
  const data = await res.json();
  const { records, totalSales, commission, role, repOverrides, totalOverride, totalEarnings,
          sentProposals, sentValue, closedDeals, closedValue, conversionRate, subReps } = data;

  function calcCommissionLocal(total, r) {
    if (r === 'leader') {
      if (total <= 8000) return total * 0.03;
      if (total <= 15000) return total * 0.04;
      if (total <= 25000) return total * 0.05;
      return total * 0.06;
    } else {
      if (total <= 15000) return total * 0.02;
      if (total <= 25000) return total * 0.03;
      return total * 0.04;
    }
  }

  const displaySales = closedValue || totalSales || 0;
  const displayCommission = commission || 0;

  function tierRate(total, r) {
    if (r === 'leader') {
      if (total <= 8000) return '3%'; if (total <= 15000) return '4%';
      if (total <= 25000) return '5%'; return '6%';
    } else {
      if (total <= 15000) return '2%'; if (total <= 25000) return '3%'; return '4%';
    }
  }

  let html = `
    <!-- Stats grid mirroring rep dashboard -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div style="background:#faf7f5;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:6px">Sales</div>
        <div style="font-size:22px;font-weight:800;color:#EA672F">${fmt(displaySales)}</div>
        <div style="font-size:11px;color:#888">${closedDeals || 0} deals · ${tierRate(displaySales, role)} rate</div>
      </div>
      <div style="background:#faf7f5;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:6px">Commission Earned</div>
        <div style="font-size:22px;font-weight:800;color:#27AE60">${fmt(displayCommission)}</div>
        <div style="font-size:11px;color:#888">${tierRate(displaySales, role)} rate</div>
      </div>
      <div style="background:#2A2B29;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:6px">Conversion Rate</div>
        <div style="font-size:22px;font-weight:800;color:#EA672F">${conversionRate || 0}%</div>
        <div style="font-size:11px;color:#888">${closedDeals || 0} closed of ${sentProposals || 0} sent</div>
      </div>
    </div>

    <!-- Proposals & Closed stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:#faf7f5;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:8px">Proposals Sent</div>
        <div style="font-size:22px;font-weight:800;color:#3498DB">${sentProposals || 0}</div>
        <div style="font-size:13px;color:#888">${fmt(sentValue || 0)} total value</div>
      </div>
      <div style="background:#faf7f5;border-radius:10px;padding:14px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:8px">Closed Deals</div>
        <div style="font-size:22px;font-weight:800;color:#27AE60">${closedDeals || 0}</div>
        <div style="font-size:13px;color:#888">${fmt(closedValue || 0)} total value</div>
      </div>
    </div>`;

  // Sub-reps for leaders
  if (role === 'leader' && subReps && subReps.length > 0) {
    html += `<div style="margin-bottom:16px;padding:14px;background:#faf7f5;border-radius:10px">
      <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Team Override (+2%)</div>` +
      subReps.map(r => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #e0d9d5">
        <div style="flex:1;font-size:13px;font-weight:700">${r.user.name}</div>
        <div style="font-size:13px;color:#888">${fmt(r.closedValue || 0)} closed</div>
        <div style="font-size:13px;font-weight:700;color:#27AE60">+${fmt((r.closedValue || 0) * 0.02)}</div>
      </div>`).join('') + '</div>';
  }

  // Add sale form
  html += `<div style="margin-top:16px;padding-top:16px;border-top:1.5px solid #f0e8e4">
    <div style="font-size:12px;font-weight:700;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Add Sale for ${name}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
      <div><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:4px">Client</label>
        <input type="text" id="adminSaleClient" placeholder="Client name" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none"></div>
      <div><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:4px">Amount ($)</label>
        <input type="number" id="adminSaleAmount" placeholder="0.00" step="0.01" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none"></div>
      <button onclick="adminAddSale(${userId})" style="background:#EA672F;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer">+ Add</button>
    </div>
  </div>`;

  document.getElementById('viewAsContent').innerHTML = html;
  section.scrollIntoView({ behavior: 'smooth' });
}

function closeViewAs() {
  document.getElementById('viewAsSection').style.display = 'none';
  window._viewingUserId = null;
}

async function adminDeleteSale(id) {
  if (!confirm('Remove this sale record?')) return;
  await fetch('/api/admin/commission/records/' + id, { method: 'DELETE' });
  const dateRange = _adminDateFrom && _adminDateTo ? _adminDateFrom + ',' + _adminDateTo : '';
  viewAs(window._viewingUserId, window._viewingName, dateRange);
}

async function adminAddSale(userId) {
  const client = document.getElementById('adminSaleClient').value.trim();
  const amount = document.getElementById('adminSaleAmount').value;
  if (!client || !amount) { alert('Enter client and amount'); return; }
  await fetch('/api/admin/commission/' + userId + '/records', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: client, sale_amount: amount })
  });
  const dateRange = _adminDateFrom && _adminDateTo ? _adminDateFrom + ',' + _adminDateTo : '';
  viewAs(userId, window._viewingName, dateRange);
}

async function setStartDate(userId, date) {
  await fetch('/api/admin/users/' + userId + '/start-date', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: date })
  });
  const t = document.getElementById('toast'); t.textContent = 'Start date saved'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200);
}

async function loadWeeklyHistory(userId, name) {
  const histSection = document.getElementById('weeklyHistorySection');
  const histContent = document.getElementById('weeklyHistoryContent');
  if (!histSection) return;
  histSection.style.display = 'block';
  histContent.innerHTML = '<p style="color:#888;font-size:13px">Loading history...</p>';
  const res = await fetch('/api/admin/commission/' + userId + '/history');
  const data = await res.json();
  if (!data.history || !data.history.length) {
    histContent.innerHTML = '<p style="color:#888;font-size:13px">No history yet — set a start date first.</p>';
    return;
  }
  histContent.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:2px solid #f0e8e4">
        <th style="padding:6px 10px;text-align:left;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Week</th>
        <th style="padding:6px 10px;text-align:left;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Period</th>
        <th style="padding:6px 10px;text-align:right;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Sent</th>
        <th style="padding:6px 10px;text-align:right;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Closed</th>
        <th style="padding:6px 10px;text-align:right;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Value</th>
        <th style="padding:6px 10px;text-align:right;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:10px">Conv%</th>
      </tr></thead><tbody>` +
    [...data.history].reverse().map(w => `
      <tr style="border-bottom:1px solid #f0e8e4${w.weekNum === data.currentWeekNum ? ';background:#FFF8F5' : ''}">
        <td style="padding:8px 10px;font-weight:700;color:#EA672F">W${w.weekNum}${w.weekNum === data.currentWeekNum ? ' ◀' : ''}</td>
        <td style="padding:8px 10px;color:#888;font-size:11px">${w.weekStart} to ${w.weekEnd}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">${w.sentProposals || 0}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:#27AE60">${w.closedDeals || 0}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:#EA672F">${fmt(w.closedValue || 0)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700">${w.conversionRate || 0}%</td>
      </tr>`).join('') + '</tbody></table>';
}

async function setRole(userId, role) {
  await fetch('/api/admin/users/' + userId + '/role', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  loadCommissionTab();
}

async function setLeader(userId, leaderId) {
  await fetch('/api/admin/users/' + userId + '/leader', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leader_id: leaderId || null }) });
  loadCommissionTab();
}

async function loadPipeline() {
  const container = document.getElementById('pipelineContent');
  container.innerHTML = '<p style="color:#888;font-size:13px">Loading... this may take a moment.</p>';
  try {
    const res = await fetch('/api/admin/pipeline');
    const data = await res.json();
    if (data.error) { container.innerHTML = '<p style="color:#c00">' + data.error + '</p>'; return; }

    const stageColors = {
      'QUALIFIED LEADS': '#1ABC9C', 'DISCOVERY CALLS': '#3498DB',
      'SEQUENCE CALL': '#7F8C8D', 'FOLLOW UP EMAILS / CALLS': '#9B59B6',
      'PROPOSAL FOLLOW UP': '#E67E22', 'WAITING FOR CLIENTS': '#F39C12',
      'CLOSED DEALS': '#27AE60', 'HELP REQUIRED': '#E74C3C'
    };

    container.innerHTML = data.map(rep => {
      const stageHtml = Object.entries(rep.stageCounts)
        .filter(([g]) => g !== 'LOST')
        .map(([g, count]) => {
          const color = stageColors[g] || '#888';
          const label = g.replace(' EMAILS / CALLS', '').replace(' CALLS', '');
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0e8e4">' +
            '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
            '<div style="flex:1;font-size:12px;color:#555">' + label + '</div>' +
            '<div style="font-size:13px;font-weight:700;color:#2A2B29">' + count + '</div>' +
            '</div>';
        }).join('');

      return '<div style="background:#faf7f5;border-radius:12px;padding:20px;margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
          '<div style="font-size:16px;font-weight:800;color:#2A2B29">' + rep.user.name + '</div>' +
          '<div style="font-size:22px;font-weight:800;color:#EA672F">' + rep.totalLeads + ' leads</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
          '<div>' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:8px">Pipeline Stages</div>' +
            (stageHtml || '<p style="color:#888;font-size:12px">No leads</p>') +
          '</div>' +
          '<div>' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:8px">Proposals</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">' +
              '<div style="background:#fff;border-radius:8px;padding:10px;text-align:center">' +
                '<div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Sent</div>' +
                '<div style="font-size:22px;font-weight:800;color:#3498DB">' + rep.sentProposals + '</div>' +
              '</div>' +
              '<div style="background:#fff;border-radius:8px;padding:10px;text-align:center">' +
                '<div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Closed</div>' +
                '<div style="font-size:22px;font-weight:800;color:#27AE60">' + rep.closedDeals + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:8px">' +
              '<div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Closed Value</div>' +
              '<div style="font-size:18px;font-weight:800;color:#EA672F">' + fmt(rep.totalClosed) + '</div>' +
            '</div>' +
            '<div style="background:#2A2B29;border-radius:8px;padding:10px;text-align:center">' +
              '<div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Conversion Rate</div>' +
              '<div style="font-size:22px;font-weight:800;color:#EA672F">' + rep.conversionRate + '%</div>' +
              '<div style="font-size:11px;color:#888">' + rep.closedDeals + ' of ' + rep.sentProposals + ' proposals</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    container.innerHTML = '<p style="color:#c00">Error: ' + e.message + '</p>';
  }
}

async function loadInvoicesTab() {
  // Load salary settings
  const salRes = await fetch('/api/admin/salary');
  const salData = await salRes.json();
  document.getElementById('salarySettings').innerHTML = salData.map(s => `
    <div style="display:grid;grid-template-columns:1fr 160px 120px auto;gap:12px;padding:10px 0;border-bottom:1px solid #f0e8e4;align-items:center">
      <div style="font-size:13px;font-weight:700;color:#2A2B29">${s.user.name}</div>
      <div>
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:4px">Weekly Salary ($)</label>
        <input type="number" id="salary_${s.user.id}" value="${s.salary.weekly_amount || 0}" step="0.01"
          style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:7px 10px;outline:none">
      </div>
      <div style="padding-top:18px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#2A2B29">
          <input type="checkbox" id="gst_${s.user.id}" ${s.salary.gst !== 0 ? 'checked' : ''} style="width:16px;height:16px;accent-color:#EA672F">
          + GST
        </label>
      </div>
      <div style="padding-top:18px">
        <button onclick="saveSalary(${s.user.id})" class="btn btn-orange btn-sm">Save</button>
      </div>
    </div>`).join('');

  // Load invoice archive
  const invRes = await fetch('/api/admin/invoices');
  const invoices = await invRes.json();
  const archive = document.getElementById('invoiceArchive');
  if (!invoices.length) {
    archive.innerHTML = '<p style="color:#888;font-size:13px">No invoices submitted yet.</p>';
    return;
  }
  archive.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:8px;padding:6px 0;border-bottom:2px solid #f0e8e4;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">
      <span>Rep</span><span>Week</span><span>Amount</span><span>Submitted</span><span></span>
    </div>` +
    invoices.map(inv => `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:8px;padding:10px 0;border-bottom:1px solid #f0e8e4;align-items:center;font-size:13px">
      <span style="font-weight:700">${inv.rep_name}</span>
      <span style="color:#888">${inv.week_start}</span>
      <span style="font-weight:700;color:#EA672F">${fmt(inv.total_amount)}</span>
      <span style="color:#888;font-size:12px">${new Date(inv.submitted_at).toLocaleDateString('en-AU', {day:'2-digit',month:'2-digit',year:'numeric'})}</span>
      <a href="/api/admin/invoices/${inv.id}/download" style="background:#2A2B29;color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap">⬇ Download</a>
    </div>`).join('');
}

async function saveSalary(userId) {
  const amount = document.getElementById('salary_' + userId).value;
  const gst = document.getElementById('gst_' + userId).checked;
  await fetch('/api/admin/salary/' + userId, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekly_amount: amount, gst })
  });
  const t = document.getElementById('toast'); t.textContent = 'Salary saved'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200);
}

async function loadRepDropdown() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
  const sel = document.getElementById('saleRepId');
  if (!sel) return;
  sel.innerHTML = users.map(u => '<option value="' + u.id + '">' + u.name + '</option>').join('');
}

async function addMgrSale() {
  const repId = document.getElementById('saleRepId').value;
  const client = document.getElementById('saleMgrClient').value.trim();
  const type = document.getElementById('saleMgrType').value;
  const amount = document.getElementById('saleMgrAmount').value;
  if (!repId) { alert('Please select a rep'); return; }
  if (!client || !amount) { alert('Enter client name and amount'); return; }
  try {
    const res = await fetch('/api/admin/commission/' + repId + '/records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: client, project_type: type, sale_amount: amount })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('saleMgrClient').value = '';
      document.getElementById('saleMgrAmount').value = '';
      const t = document.getElementById('toast'); t.textContent = 'Sale recorded ✓'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200);
      loadAllSales();
    } else {
      alert('Error saving sale: ' + (data.error || 'unknown'));
    }
  } catch(e) {
    alert('Failed: ' + e.message);
  }
}

async function loadAllSales() {
  const from = document.getElementById('salesDateFrom')?.value || '';
  const to = document.getElementById('salesDateTo')?.value || '';
  let url = '/api/admin/all-sales';
  if (from && to) url += '?from=' + from + '&to=' + to;
  const res = await fetch(url);
  const data = await res.json();
  const container = document.getElementById('allSalesList');
  if (!data.sales || !data.sales.length) {
    container.innerHTML = '<p style="color:#888;font-size:13px">No sales recorded yet.</p>';
    return;
  }
  const total = data.sales.reduce((s, r) => s + r.sale_amount, 0);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:8px;padding:6px 0;border-bottom:2px solid #f0e8e4;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">
      <span>Rep</span><span>Client</span><span>Type</span><span>Amount</span><span></span>
    </div>` +
    data.sales.map(r => `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:8px;padding:10px 0;border-bottom:1px solid #f0e8e4;align-items:center;font-size:13px">
      <span style="font-weight:700">${r.rep_name}</span>
      <span>${r.client_name}</span>
      <span style="color:#888">${r.project_type || '—'}</span>
      <span style="font-weight:700;color:#27AE60">${fmt(r.sale_amount)}</span>
      <button onclick="deleteMgrSale(${r.id})" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:14px">✕</button>
    </div>`).join('') +
    `<div style="padding:10px 0;font-size:13px;font-weight:700;text-align:right;color:#EA672F;border-top:2px solid #f0e8e4">Total: ${fmt(total)}</div>`;
}
async function deleteMgrSale(id) {
  if (!confirm('Remove this sale?')) return;
  await fetch('/api/admin/commission/records/' + id, { method: 'DELETE' });
  loadAllSales();
}

async function loadStorage() {
  try {
    const r = await fetch('/api/admin/storage');
    const d = await r.json();
    if (d.error) { document.getElementById('storagePanel').innerHTML = '<p style="color:#c00">Error: ' + d.error + '</p>'; return; }
    const fmtb = b => b < 1024 ? b + ' B' : b < 1024*1024 ? (b/1024).toFixed(1) + ' KB' : b < 1024*1024*1024 ? (b/1024/1024).toFixed(1) + ' MB' : (b/1024/1024/1024).toFixed(2) + ' GB';
    const pct = d.disk.percent;
    const barColor = pct > 80 ? '#c0392b' : pct > 60 ? '#F39C12' : '#27AE60';
    document.getElementById('storagePanel').innerHTML = `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">Disk Usage</span>
          <span style="font-size:13px;color:#888">${fmtb(d.disk.used)} of ${fmtb(d.disk.total)} used (${pct}%)</span>
        </div>
        <div style="background:#e0d9d5;border-radius:8px;height:12px;overflow:hidden">
          <div style="background:${barColor};width:${pct}%;height:100%;border-radius:8px"></div>
        </div>
        <div style="font-size:11px;color:#888;margin-top:4px">${fmtb(d.disk.available)} available</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#faf7f5;border-radius:8px;padding:12px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:4px">Database</div>
          <div style="font-size:18px;font-weight:700">${fmtb(d.database.size)}</div>
        </div>
        <div style="background:#faf7f5;border-radius:8px;padding:12px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:4px">Uploaded Files</div>
          <div style="font-size:18px;font-weight:700">${fmtb(d.lead_files.size)}</div>
          <div style="font-size:11px;color:#888">${d.lead_files.count} files</div>
        </div>
      </div>
      ${pct > 70 ? '<div style="margin-top:12px;background:#fff3cd;border:1.5px solid #F39C12;border-radius:8px;padding:10px 14px;font-size:13px;color:#856404">⚠️ Disk usage above 70% — consider upgrading the Render disk.</div>' : ''}
      <div style="margin-top:20px;border-top:1.5px solid #f0e8e4;padding-top:16px">
        <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">⚠️ Known Limitations & Future Recommendations</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="background:#FFF8F5;border-left:3px solid #EA672F;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px">
            <div style="font-weight:700;color:#2A2B29;margin-bottom:3px">📊 Dashboard Performance at Scale</div>
            <div style="color:#555">Currently queries Monday.com live on every page load. With 5+ reps or 12+ months of data, loading may take 10–30 seconds. <strong>Recommended fix:</strong> Implement a data caching layer in SQLite that refreshes every few minutes.</div>
          </div>
          <div style="background:#FFF8F5;border-left:3px solid #F39C12;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px">
            <div style="font-weight:700;color:#2A2B29;margin-bottom:3px">💾 Database Persistence</div>
            <div style="color:#555">Rep start dates and other settings may reset on redeploy if the Render persistent disk is not correctly mounted. <strong>Recommended fix:</strong> Verify disk is mounted at /data in Render dashboard, or migrate settings to Monday.com columns.</div>
          </div>
          <div style="background:#FFF8F5;border-left:3px solid #3498DB;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px">
            <div style="font-weight:700;color:#2A2B29;margin-bottom:3px">🔗 Monday.com Webhooks</div>
            <div style="color:#555">Webhooks need re-registering if the service URL changes. Currently registered for proposal status changes. <strong>Recommended:</strong> Re-register via Admin → Integrations after any URL change.</div>
          </div>
          <div style="background:#FFF8F5;border-left:3px solid #27AE60;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px">
            <div style="font-weight:700;color:#2A2B29;margin-bottom:3px">📋 Proposal Tracking</div>
            <div style="color:#555">Proposals only appear in commission stats if the rep dropdown (dropdown_mm5c51r2) is filled in on the Proposals board. Proposals generated via our system set this automatically — manually created proposals in Monday.com need the dropdown filled manually.</div>
          </div>
          <div style="background:#FFF8F5;border-left:3px solid #9B59B6;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px">
            <div style="font-weight:700;color:#2A2B29;margin-bottom:3px">📅 Commission Date Accuracy</div>
            <div style="color:#555">Closed deals must have the date_mm3gx943 (closed date) column filled in Monday.com to appear in date-filtered reports. Deals without a closed date are included in all-time totals only.</div>
          </div>
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('storagePanel').innerHTML = '<p style="color:#c00">Could not load storage info.</p>';
  }
}
```
