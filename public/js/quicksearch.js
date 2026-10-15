// quicksearch.js — always-visible client search in the top bar
// Searches Monday.com leads + saved calls by name, address, phone or email.
(function () {
  var input = document.getElementById('qsInput');
  var box = document.getElementById('qsResults');
  if (!input || !box) return;

  var saved = [], savedAt = 0, leadsLoading = false;

  function h(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function refreshData() {
    if (Date.now() - savedAt > 30000) {
      savedAt = Date.now();
      load(function (list) { saved = Array.isArray(list) ? list : []; render(); });
    }
    if ((!leadsData || !leadsData.length) && !leadsLoading && typeof apiFetch === 'function') {
      leadsLoading = true;
      apiFetch('/api/leads').then(function (l) { if (Array.isArray(l)) leadsData = l; render(); })
        .catch(function () {}).then(function () { leadsLoading = false; });
    }
  }

  function matches(q, qd, fields, phone) {
    if (fields.some(function (f) { return String(f || '').toLowerCase().indexOf(q) > -1; })) return true;
    return qd.length >= 4 && digits(phone).indexOf(qd) > -1;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.style.display = 'none'; return; }
    var qd = digits(q);

    var leads = (leadsData || []).filter(function (l) {
      return matches(q, qd, [l.name, l.address, l.email, l.phone], l.phone);
    }).slice(0, 8);
    var calls = saved.filter(function (c) {
      return matches(q, qd, [c.name, c.addr, c.email, c.phone], c.phone);
    }).slice(0, 8);

    var html = '';
    if (leads.length) {
      html += '<div class="qs-head">Monday.com leads</div>';
      leads.forEach(function (l) {
        var stage = (STAGE_LABELS[l.group_title] || {}).label || l.group_title || '';
        html += '<div class="qs-item" data-type="lead" data-id="' + h(l.monday_id) + '"><div class="qs-name">' + h(l.name) +
          ' <span class="qs-tag">' + h(stage) + '</span></div><div class="qs-meta">' + h([l.address, l.phone, l.email].filter(Boolean).join(' · ')) + '</div></div>';
      });
    }
    if (calls.length) {
      html += '<div class="qs-head">Saved calls</div>';
      calls.forEach(function (c) {
        html += '<div class="qs-item" data-type="call" data-id="' + h(c.id) + '"><div class="qs-name">' + h(c.name) +
          '</div><div class="qs-meta">' + h([c.addr, c.phone, c.date].filter(Boolean).join(' · ')) + '</div></div>';
      });
    }
    if (!html) html = '<div class="qs-empty">' + (leadsLoading ? 'Loading leads…' : 'No clients found for “' + h(input.value.trim()) + '”') + '</div>';
    box.innerHTML = html;
    box.style.display = 'block';
  }

  function openItem(el) {
    if (!el) return;
    var id = el.getAttribute('data-id');
    box.style.display = 'none';
    input.value = '';
    input.blur();
    if (el.getAttribute('data-type') === 'lead') {
      document.getElementById('leadsPanel').style.display = 'block';
      openLead(id);
    } else {
      openClient(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  input.addEventListener('focus', function () { refreshData(); render(); });
  input.addEventListener('input', render);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); openItem(box.querySelector('.qs-item')); }
    if (e.key === 'Escape') { box.style.display = 'none'; input.blur(); }
  });
  box.addEventListener('mousedown', function (e) {
    e.preventDefault(); // keep focus so the click registers
    openItem(e.target.closest('.qs-item'));
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.qs-wrap')) box.style.display = 'none';
  });
  // Press "/" anywhere (outside a text field) to jump to search
  document.addEventListener('keydown', function (e) {
    var t = e.target.tagName;
    if (e.key === '/' && t !== 'INPUT' && t !== 'TEXTAREA' && t !== 'SELECT') { e.preventDefault(); input.focus(); }
  });
})();
