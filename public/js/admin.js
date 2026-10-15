# views/admin.html (333 lines)

CHANGED in v3: replace the ENTIRE contents of `views/admin.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xpress Draft — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --orange: #EA672F; --orange-d: #d45a26; --dark: #2A2B29;
    --page: #F3EAE5; --card: #fff; --grey: #888; --border: #e0d9d5;
  }
  body { font-family: 'Manrope', sans-serif; background: var(--page); color: var(--dark); }
  .topbar { background: var(--dark); padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo-text { font-size: 16px; font-weight: 800; color: #fff; }
  .logo-text span { color: var(--orange); }
  .top-right { display: flex; align-items: center; gap: 12px; }
  .top-right a { color: rgba(255,255,255,.6); font-size: 12px; text-decoration: none; }
  .top-right a:hover { color: #fff; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 28px 24px; }
  h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .page-sub { color: var(--grey); font-size: 13px; margin-bottom: 24px; }

  /* Tab nav */
  .tab-nav { display: flex; gap: 4px; margin-bottom: 24px; background: #e8dfd9; border-radius: 12px; padding: 4px; }
  .tab-btn { flex: 1; padding: 10px 16px; border: none; border-radius: 9px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; background: transparent; color: #888; transition: .15s; text-align: center; }
  .tab-btn.active { background: #fff; color: var(--dark); box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  .tab-btn:hover:not(.active) { color: var(--dark); }

  /* Tab panels */
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  .section { background: var(--card); border-radius: 14px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
  .section-title { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--grey); margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--grey); padding: 0 12px 10px; }
  td { padding: 10px 12px; border-top: 1px solid var(--border); vertical-align: middle; }
  tr:hover td { background: #faf7f5; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
  .badge-admin { background: rgba(234,103,47,.15); color: var(--orange); }
  .badge-user { background: rgba(0,0,0,.06); color: #666; }
  .badge-active { background: #e8f5e9; color: #2e7d32; }
  .badge-inactive { background: #fde8e8; color: #c0392b; }
  .btn { font-family: inherit; font-size: 12px; font-weight: 700; border-radius: 7px; padding: 6px 12px; cursor: pointer; border: none; transition: .15s; }
  .btn-orange { background: var(--orange); color: #fff; }
  .btn-orange:hover { background: var(--orange-d); }
  .btn-ghost { background: transparent; border: 1.5px solid var(--border); color: var(--dark); }
  .btn-ghost:hover { border-color: #aaa; }
  .btn-danger { background: transparent; border: 1.5px solid #f5c6c6; color: #c0392b; }
  .btn-danger:hover { background: #fde8e8; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .add-form { display: grid; grid-template-columns: 1fr 1fr 1fr auto auto; gap: 10px; align-items: end; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border); }
  .add-form .field label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--grey); margin-bottom: 5px; }
  .add-form .field input, .add-form .field select { font-family: inherit; font-size: 13px; color: var(--dark); background: #faf7f5; border: 1.5px solid var(--border); border-radius: 8px; padding: 9px 11px; outline: none; width: 100%; }
  .add-form .field input:focus, .add-form .field select:focus { border-color: var(--orange); }
  .pricing-row td:first-child { font-size: 12px; color: var(--grey); font-family: monospace; }
  .price-input { font-family: inherit; font-size: 13px; color: var(--dark); background: transparent; border: none; outline: none; width: 80px; text-align: right; padding: 2px 4px; border-bottom: 1.5px solid transparent; }
  .price-input:focus { border-bottom-color: var(--orange); }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--dark); color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 999; }
  .toast.show { opacity: 1; }
  @media (max-width: 600px) { .tab-btn { font-size: 11px; padding: 8px 8px; } }
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">
    <svg width="22" height="22" viewBox="0 0 191 189" xmlns="http://www.w3.org/2000/svg">
      <path fill="#F3EAE5" d="M46.6 6.5v29.6c0 1.9 1.1 3.7 2.8 4.5l42.8 23.9c1.9.9 4.1.9 6 0l42.8-23.9c1.7-.8 2.8-2.6 2.8-4.5V6.5c0-4.8-5-7.9-9.3-5.9L98.3 18c-1.9.9-4.1.9-6 0L55.9.6c-4.3-2-9.3 1.1-9.3 5.9"/>
      <path fill="#F3EAE5" d="M46.6 181.2v-29.6c0-1.9 1.1-3.7 2.8-4.5l42.8-23.9c1.9-.9 4.1-.9 6 0l42.8 23.9c1.7.8 2.8 2.6 2.8 4.5v29.6c0 4.8-5 7.9-9.3 5.9L98.3 169.8c-1.9-.9-4.1-.9-6 0l-36.4 17.3c-4.3 2-9.3-1.1-9.3-5.9"/>
      <path fill="#F3EAE5" d="M182.6 45.2h-29.6c-1.9 0-3.7 1.1-4.5 2.8l-23.9 42.8c-.9 1.9-.9 4.1 0 6l23.9 42.8c.8 1.7 2.6 2.8 4.5 2.8h29.6c4.8 0 7.9-5 5.9-9.3l-17.4-36.3c-.9-1.9-.9-4.1 0-6l17.4-36.3c2-4.3-1.1-9.3-5.9-9.3"/>
      <path fill="#EA672F" d="M7.9 45.2h29.6c1.9 0 3.7 1.1 4.5 2.8l23.9 42.8c.9 1.9.9 4.1 0 6l-23.9 42.8c-.8 1.7-2.6 2.8-4.5 2.8H7.9c-4.8 0-7.9-5-5.9-9.3l17.4-36.3c.9-1.9.9-4.1 0-6L2 54.5c-2-4.3 1.1-9.3 5.9-9.3"/>
    </svg>
    <div class="logo-text"><span>Xpress</span> Draft — Admin</div>
  </div>
  <div class="top-right">
    <a href="/" style="font-weight:700">🏠 Home</a>
    <a href="/commission">💰 Commission</a>
    <a href="#" id="logoutBtn">Sign out</a>
  </div>
</div>

<div class="wrap">
  <h1>Admin Panel</h1>
  <div class="page-sub">Manage your team, pricing, integrations and system settings.</div>

  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button class="tab-btn active" onclick="showTab('team', this)">👥 Team</button>
    <button class="tab-btn" onclick="showTab('commission', this)">💰 Commission</button>
    <button class="tab-btn" onclick="showTab('pipeline', this)">📊 Pipeline</button>
    <button class="tab-btn" onclick="showTab('sales', this)">📋 Sales</button>
    <button class="tab-btn" onclick="showTab('pricing', this)">💲 Pricing</button>
    <button class="tab-btn" onclick="showTab('invoices', this)">🧾 Invoices</button>
    <button class="tab-btn" onclick="showTab('integrations', this)">🔗 Integrations</button>
    <button class="tab-btn" onclick="showTab('system', this)">⚙️ System</button>
  </div>

  <!-- TEAM TAB -->
  <div id="tab-team" class="tab-panel active">
    <div class="section">
      <div class="section-title">Team Members</div>
      <table id="usersTable">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="usersTbody"></tbody>
      </table>
      <div class="add-form">
        <div class="field"><label>Name</label><input type="text" id="newName" placeholder="Alex"></div>
        <div class="field"><label>Email</label><input type="email" id="newEmail" placeholder="alex@xpressdraft.com.au"></div>
        <p style="font-size:12px;color:#888;margin:4px 0 8px">A secure password will be auto-generated and emailed to the user.</p>
        <div class="field"><label>Role</label>
          <select id="newRole">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style="padding-bottom:1px"><button class="btn btn-orange" id="addUserBtn">Add user</button></div>
      </div>
    </div>
  </div>

  <!-- COMMISSION TAB -->
  <div id="tab-commission" class="tab-panel">
    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div class="section-title" style="margin-bottom:0">Team Commission Overview</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button onclick="setAdminDateMode('week')" id="adminBtnWeek" style="background:#EA672F;color:#fff;border:none;padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">This Week</button>
          <button onclick="setAdminDateMode('custom')" id="adminBtnCustom" style="background:#fff;color:#2A2B29;border:1.5px solid #e0d9d5;padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">Custom Range</button>
          <div id="adminCustomRange" style="display:none;align-items:center;gap:6px">
            <input type="date" id="adminDateFrom" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:5px 8px;outline:none">
            <span style="font-size:12px;color:#888">to</span>
            <input type="date" id="adminDateTo" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:5px 8px;outline:none">
            <button onclick="applyAdminRange()" style="background:#2A2B29;color:#fff;border:none;padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">Apply</button>
          </div>
          <button onclick="loadCommissionTab()" style="background:#fff;color:#2A2B29;border:1.5px solid #e0d9d5;padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;margin-left:4px">↻ Refresh</button>
        </div>
      </div>
      <div id="commissionOverview"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>

    <div class="section" id="repSettingsSection">
      <div class="section-title">Rep Settings</div>
      <p style="font-size:13px;color:#888;margin-bottom:16px">Set each rep's role and assign them to a leader for override commission.</p>
      <div id="repSettings"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>

    <div class="section" id="viewAsSection" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="section-title" style="margin-bottom:0">Viewing: <span id="viewAsName" style="color:#EA672F"></span></div>
        <div style="display:flex;gap:8px">
          <button onclick="loadWeeklyHistory(window._viewingUserId, window._viewingName)" class="btn btn-ghost btn-sm">📊 Weekly History</button>
          <button onclick="closeViewAs()" class="btn btn-ghost btn-sm">✕ Close</button>
        </div>
      </div>
      <div id="viewAsContent"></div>
      <div id="weeklyHistorySection" style="display:none;margin-top:20px;padding-top:16px;border-top:1.5px solid #f0e8e4">
        <div style="font-size:13px;font-weight:700;color:#2A2B29;margin-bottom:12px">📊 Week-by-Week History</div>
        <div id="weeklyHistoryContent"></div>
      </div>
    </div>
  </div>

  <!-- PIPELINE TAB -->
  <div id="tab-pipeline" class="tab-panel">
    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="section-title" style="margin-bottom:0">Pipeline Overview</div>
        <button onclick="loadPipeline()" class="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>
      <div id="pipelineContent"><p style="color:#888;font-size:13px">Loading pipeline data...</p></div>
    </div>
  </div>

  <!-- SALES MANAGEMENT TAB -->
  <div id="tab-sales" class="tab-panel">
    <div class="section">
      <div class="section-title">Record a Sale</div>
      <p style="font-size:13px;color:#888;margin-bottom:16px">Add a sale for any rep. This updates their commission automatically.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Rep</label>
          <select id="saleRepId" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:9px 11px;outline:none"></select>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Client Name</label>
          <input type="text" id="saleMgrClient" placeholder="e.g. John Smith" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:9px 11px;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Project Type</label>
          <select id="saleMgrType" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:9px 11px;outline:none">
            <option value="">Select...</option>
            <option>Standard</option>
            <option>As Built</option>
            <option>DA Only</option>
            <option>DA+BA</option>
            <option>Granny Flat</option>
            <option>Working Drawings Only</option>
            <option>Shed</option>
            <option>Storey Addition</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Amount ($)</label>
          <input type="number" id="saleMgrAmount" placeholder="0.00" step="0.01" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:9px 11px;outline:none">
        </div>
        <button onclick="addMgrSale()" class="btn btn-orange" style="padding:10px 20px;white-space:nowrap">+ Record Sale</button>
      </div>
    </div>

    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div class="section-title" style="margin-bottom:0">All Sales</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="date" id="salesDateFrom" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:4px 8px;outline:none">
          <span style="font-size:12px;color:#888">to</span>
          <input type="date" id="salesDateTo" style="font-size:12px;border:1.5px solid #e0d9d5;border-radius:6px;padding:4px 8px;outline:none">
          <button onclick="loadAllSales()" class="btn btn-orange btn-sm">Apply</button>
          <button onclick="document.getElementById('salesDateFrom').value='';document.getElementById('salesDateTo').value='';loadAllSales()" class="btn btn-ghost btn-sm">All Time</button>
        </div>
      </div>
      <div id="allSalesList"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>
  </div>

  <!-- PRICING TAB -->
  <div id="tab-pricing" class="tab-panel">
    <div class="section">
      <div class="section-title">Pricing Structure</div>
      <table>
        <thead><tr><th>Key</th><th>Description</th><th style="text-align:right">Price (ex GST)</th><th></th></tr></thead>
        <tbody id="pricingTbody"></tbody>
      </table>
      <div style="margin-top:20px;padding:16px;background:#faf7f5;border:1px solid #e0d9d5;border-radius:10px">
        <div style="font-size:13px;font-weight:700;color:#2A2B29;margin-bottom:12px">Add New Pricing Item</div>
        <div style="display:grid;grid-template-columns:1fr 2fr 1fr auto;gap:10px;align-items:end">
          <div>
            <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Key</label>
            <input id="newPriceKey" type="text" placeholder="e.g. base_deck" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Description</label>
            <input id="newPriceLabel" type="text" placeholder="e.g. Deck — base fee" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Price (ex GST)</label>
            <input id="newPriceValue" type="number" placeholder="0" min="0" step="50" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none;box-sizing:border-box">
          </div>
          <button id="addPriceBtn" class="btn btn-orange" style="white-space:nowrap">Add Item</button>
        </div>
      </div>
    </div>
  </div>

  <!-- INVOICES TAB -->
  <div id="tab-invoices" class="tab-panel">
    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="section-title" style="margin-bottom:0">Salary Settings</div>
      </div>
      <p style="font-size:13px;color:#888;margin-bottom:16px">Set each rep's weekly salary. This appears on their commission dashboard as the base amount to invoice.</p>
      <div id="salarySettings"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>

    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div class="section-title" style="margin-bottom:0">Invoice Archive</div>
        <button onclick="loadInvoicesTab()" class="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>
      <div id="invoiceArchive"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>
  </div>

  <!-- INTEGRATIONS TAB -->
  <div id="tab-integrations" class="tab-panel">
    <div class="section">
      <div class="section-title">Integrations</div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1.5px solid #f0e8e4">
        <div>
          <div style="font-size:15px;font-weight:700;color:#2A2B29">Calendly</div>
          <div style="font-size:13px;color:#888;margin-top:2px">Auto-create leads in Monday.com when a booking is made</div>
        </div>
        <button onclick="registerCalendly()" class="btn btn-orange">Connect Calendly</button>
      </div>
      <div id="calendlyStatus" style="font-size:13px;color:#888;padding:10px 0 16px">Add <code>CALENDLY_TOKEN</code> to Render environment variables first, then click Connect.</div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1.5px solid #f0e8e4">
        <div>
          <div style="font-size:15px;font-weight:700;color:#2A2B29">Monday.com Webhook</div>
          <div style="font-size:13px;color:#888;margin-top:2px">When proposal status set to SENT → lead reappears in rep's Follow Up</div>
        </div>
        <button onclick="registerMondayWebhook()" class="btn btn-orange">Register Webhook</button>
      </div>
      <div id="mondayWebhookStatus" style="font-size:13px;color:#888;padding:10px 0">Webhook 610674462 on the Proposals board is already live. Clicking checks it and never creates a duplicate.</div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-top:1.5px solid #f0e8e4;margin-top:8px">
        <div>
          <div style="font-size:15px;font-weight:700;color:#2A2B29">Automations (replacing Make.com)</div>
          <div style="font-size:13px;color:#888;margin-top:2px">Clockify → Time Sheet · Clockify set-up on engagement · Lead Inbox read by Claude</div>
        </div>
        <button onclick="loadAutomationStatus()" class="btn btn-orange">Check status</button>
      </div>
      <div id="automationStatus" style="font-size:13px;color:#888;padding:6px 0 10px">Click "Check status".</div>
    </div>
  </div>

  <!-- SYSTEM TAB -->
  <div id="tab-system" class="tab-panel">
    <div class="section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="section-title" style="margin-bottom:0">System Storage</div>
        <button onclick="loadStorage()" class="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>
      <div id="storagePanel"><p style="color:#888;font-size:13px">Loading...</p></div>
    </div>
  </div>

</div>

<div class="toast" id="toast"></div>

<script src="/js/admin.js"></script>
<script src="/js/admin-page.js"></script>
</body>
</html>
```
