
// ── Pending Portal Logins ──────────────────────────────────────────────────────
async function loadPendingPortals() {
  const rows = await api('GET', '/api/pending-portals');
  const list = document.getElementById('portalList');
  const badge = document.getElementById('portalBadge');
  if (!rows.length) {
    list.innerHTML = '<div style="color:#888;font-size:13px;font-style:italic">No pending portal logins.</div>';
    badge.style.display = 'none';
    return;
  }
  badge.textContent = rows.length;
  badge.style.display = 'inline';
  list.innerHTML = '';
  rows.forEach(r => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#faf7f5;border:1px solid #e0d9d5;border-radius:10px;padding:16px;margin-bottom:12px';
    div.innerHTML = `
      <div style="font-weight:700;font-size:14px;color:#2A2B29;margin-bottom:4px">${esc(r.client_name)}</div>
      <div style="font-size:12px;color:#888;margin-bottom:14px">${esc(r.client_email)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Portal Email</label>
          <input type="email" id="pe_${r.id}" style="width:100%;font-family:inherit;font-size:13px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none;box-sizing:border-box" placeholder="client@portal.com">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Portal Password</label>
          <input type="text" id="pp_${r.id}" style="width:100%;font-family:inherit;font-size:13px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:8px 10px;outline:none;box-sizing:border-box" placeholder="temporary password">
        </div>
        <button class="btn btn-orange" data-portal-send="${r.id}">Send welcome email</button>
      </div>
      <div id="ps_${r.id}" style="font-size:12px;color:#888;margin-top:8px;min-height:16px"></div>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-portal-send]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.portalSend;
      const portalEmail = document.getElementById('pe_' + id).value.trim();
      const portalPassword = document.getElementById('pp_' + id).value.trim();
      const status = document.getElementById('ps_' + id);
      if (!portalEmail || !portalPassword) { status.textContent = 'Enter both portal email and password first.'; return; }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      const r = await api('POST', '/api/pending-portals/' + id + '/send', { portalEmail, portalPassword });
      if (r.error) {
        status.textContent = r.error;
        btn.disabled = false;
        btn.textContent = 'Send welcome email';
      } else {
        status.style.color = '#2e7d32';
        status.textContent = '✓ Welcome email sent successfully.';
        setTimeout(() => loadPendingPortals(), 1500);
      }
    });
  });
}

// admin.js

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const users = await api('GET', '/api/users');
  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.phone || '—')}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td><span class="badge ${u.active ? 'badge-active' : 'badge-inactive'}">${u.active ? 'Active' : 'Inactive'}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-rename="${u.id}" data-name="${esc(u.name)}">Rename</button>
        <button class="btn btn-ghost btn-sm" data-phone="${u.id}" data-phoneval="${esc(u.phone||'')}">Phone</button>
        <button class="btn btn-ghost btn-sm" data-toggle="${u.id}" data-active="${u.active}">
          ${u.active ? 'Deactivate' : 'Activate'}
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${u.id}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-phone]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.phone;
      const current = btn.dataset.phoneval;
      const newPhone = prompt('Enter phone number:', current);
      if (newPhone === null) return;
      await api('PATCH', '/api/users/' + id, { phone: newPhone.trim() });
      toast('Phone updated');
      loadUsers();
    });
  });

  tbody.querySelectorAll('[data-rename]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.rename;
      const current = btn.dataset.name;
      const newName = prompt('Enter new name:', current);
      if (!newName || newName.trim() === current) return;
      await api('PATCH', '/api/users/' + id, { name: newName.trim() });
      toast('Name updated');
      loadUsers();
    });
  });

  tbody.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggle;
      const active = btn.dataset.active === '1' ? 0 : 1;
      await api('PATCH', '/api/users/' + id, { active });
      toast(active ? 'User activated' : 'User deactivated');
      loadUsers();
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this user? They will lose access immediately.')) return;
      const r = await api('DELETE', '/api/users/' + btn.dataset.delete);
      if (r.error) { toast(r.error); return; }
      toast('User removed');
      loadUsers();
    });
  });
}

document.getElementById('addUserBtn').addEventListener('click', async () => {
  const name = document.getElementById('newName').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const role = document.getElementById('newRole').value;
  if (!name || !email) { toast('Fill in all fields'); return; }
  const r = await api('POST', '/api/users', { name, email, role });
  if (r.error) { toast(r.error); return; }
  toast('User added — login details sent by email');
  document.getElementById('newName').value = '';
  document.getElementById('newEmail').value = '';
  setTimeout(() => loadUsers(), 500);
});

// ── Pricing ───────────────────────────────────────────────────────────────────
async function loadPricing() {
  const rows = await api('GET', '/api/pricing');
  const tbody = document.getElementById('pricingTbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'pricing-row';
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.label)}</td>
      <td style="text-align:right">$<input class="price-input" type="number" value="${r.value}" data-key="${esc(r.key)}" data-label="${esc(r.label)}" min="0" step="50"></td>
      <td><button class="btn btn-ghost btn-sm" data-save="${esc(r.key)}">Save</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.save;
      const input = tbody.querySelector(`input[data-key="${key}"]`);
      const label = input.dataset.label;
      const value = parseFloat(input.value);
      if (isNaN(value)) { toast('Invalid price'); return; }
      await api('POST', '/api/pricing', { key, label, value });
      toast('Price updated');
    });
  });
}

// ── Add new pricing item ─────────────────────────────────────────────────────
async function addPricingItem() {
  const keyEl = document.getElementById('newPriceKey');
  const labelEl = document.getElementById('newPriceLabel');
  const valueEl = document.getElementById('newPriceValue');
  const key = keyEl.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const label = labelEl.value.trim();
  const value = parseFloat(valueEl.value);
  if (!key || !label || isNaN(value)) { toast('Please fill in all fields'); return; }
  await api('POST', '/api/pricing', { key, label, value });
  keyEl.value = ''; labelEl.value = ''; valueEl.value = '';
  toast('Item added');
  loadPricing();
}

document.getElementById('addPriceBtn')?.addEventListener('click', addPricingItem);

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login';
});

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
loadUsers();
loadPricing();
loadPendingPortals();
