// ── Session keep-alive & expiry detection ─────────────────────────────────────
(function() {
  // Ping server every 8 minutes to keep session alive
  setInterval(async function() {
    try {
      const r = await fetch('/api/me');
      if (r.status === 401 || r.redirected) {
        var b = document.getElementById('sessionBanner');
        if (b) b.style.display = 'flex';
      }
    } catch(e) {}
  }, 8 * 60 * 1000);
})();

const STAGES=[
  {k:'need',t:'Identify the need',d:'The client recognises what they want or need to build.'},
  {k:'explore',t:'Explore options',d:'Curiosity grows — researching possibilities, processes and suppliers.'},
  {k:'requirements',t:'Understand requirements',d:'They learn what the project involves and gain confidence to move forward.'},
  {k:'budget',t:'Set a budget',d:'They establish what they are willing to spend.'},
  {k:'supplier',t:'Select a supplier',d:'With a clear grasp of needs and options, they feel ready to choose.'},
  {k:'engage',t:'Engage with confidence',d:'They have everything they need to commit to the team.'},
];
const KEY='xpd_clients_v1';
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const state={checks:{},editingId:null,exp:'new'};
const uid=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// Client records via server API
function load(cb){
  fetch('/api/clients').then(r=>r.json()).then(cb).catch(()=>cb([]));
}
function saveRecord(rec, cb){
  fetch('/api/clients', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(rec)
  }).then(()=>{ if(cb) cb(); }).catch(()=>{ if(cb) cb(); });
}
function deleteRecord(id, cb){
  fetch('/api/clients/'+id, {method:'DELETE'}).then(()=>{ if(cb) cb(); });
}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setExp(v){state.exp=v;document.body.dataset.exp=v;$$('#expToggle button').forEach(b=>b.classList.toggle('on',b.dataset.exp===v));$('#whoLbl').textContent=v==='exp'?'Experienced client':'New client';}
$$('#expToggle button').forEach(b=>b.onclick=()=>setExp(b.dataset.exp));
function renderChecklist(){const el=$('#checkList');el.innerHTML='';STAGES.forEach((s,i)=>{const done=!!state.checks[s.k];const row=document.createElement('div');row.className='check-item'+(done?' done':'');row.innerHTML=`<div class="check-box"><svg viewBox="0 0 20 20" fill="none"><path d="M5 10l3.5 3.5L15 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><div class="ct-title"><span>${i+1}</span>${s.t}</div><div class="ct-desc">${s.d}</div></div>`;row.onclick=()=>{state.checks[s.k]=!state.checks[s.k];renderChecklist();updateProgress();};el.appendChild(row);});}
function updateProgress(){const n=STAGES.filter(s=>state.checks[s.k]).length,pct=Math.round(n/STAGES.length*100);$('#progFill').style.width=pct+'%';$('#progCount').textContent=n;$('#progPct').textContent=pct+'%';}
function gather(){const d={};$$('[data-f]').forEach(el=>{const k=el.getAttribute('data-f');if(el.classList.contains('yn')){const on=el.querySelector('button.on');d[k]=on?on.textContent:'';}else d[k]=el.value;});return d;}
function apply(data){$$('[data-f]').forEach(el=>{const k=el.getAttribute('data-f'),v=(data&&data[k])||'';if(el.classList.contains('yn')){el.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.textContent===v));}else el.value=v;});}
$$('.yn').forEach(yn=>yn.querySelectorAll('button').forEach(b=>b.onclick=()=>{yn.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');}));
function resetForm(){state.checks={};state.editingId=null;setExp('new');apply({});$('#cName').value='';$('#cAddr').value='';if($('#cEmail'))$('#cEmail').value='';if($('#cPhone'))$('#cPhone').value='';$('#cDate').value=new Date().toISOString().slice(0,10);renderChecklist();updateProgress();$('#editingName').textContent='New client (unsaved)';}
function saveCurrent(){const name=$('#cName').value.trim();if(!name){toast('Enter a client name first');$('#cName').focus();return;}const rec={id:state.editingId||uid(),name,addr:$('#cAddr').value,contact:($('#cEmail')?$('#cEmail').value:'')+' / '+($('#cPhone')?$('#cPhone').value:''),email:$('#cEmail')?$('#cEmail').value:'',phone:$('#cPhone')?$('#cPhone').value:'',date:$('#cDate').value,exp:state.exp,fields:gather(),checks:{...state.checks},updated:Date.now()};saveRecord(rec,()=>{state.editingId=rec.id;$('#editingName').textContent=name;toast('Saved "'+name+'"');renderSaved();});}
function openClient(id){load(list=>{const c=list.find(x=>x.id===id);if(!c)return;state.editingId=c.id;state.checks={...(c.checks||{})};setExp(c.exp||'new');$('#cName').value=c.name;$('#cAddr').value=c.addr||'';if($('#cEmail'))$('#cEmail').value=c.email||'';if($('#cPhone'))$('#cPhone').value=c.phone||'';$('#cDate').value=c.date||'';apply(c.fields||{});renderChecklist();updateProgress();$('#editingName').textContent=c.name;window.scrollTo({top:0,behavior:'smooth'});toast('Opened "'+c.name+'"');});}
function renderSaved(){load(list=>{const el=$('#savedList');if(!list.length){el.innerHTML='<div class="saved-empty">No clients saved yet. Fill in a call and hit Save.</div>';return;}list.sort((a,b)=>b.updated-a.updated);el.className='saved-list';el.innerHTML='';list.forEach(c=>{const n=STAGES.filter(s=>c.checks&&c.checks[s.k]).length,pct=Math.round(n/STAGES.length*100);const d=c.date?new Date(c.date).toLocaleDateString():'—';const badge=c.exp==='exp'?'<span class="sr-badge exp">Experienced</span>':'<span class="sr-badge new">New</span>';const row=document.createElement('div');row.className='saved-row';row.innerHTML=`<div class="sr-main"><div class="sr-name">${esc(c.name)}${badge}</div><div class="sr-meta">${esc(c.addr||'')} · ${d}</div></div><div class="sr-prog">${pct}%</div><div class="sr-actions"><button class="icon-btn" title="Open"><svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="icon-btn" title="Delete"><svg viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;const[o,del]=row.querySelectorAll('.icon-btn');o.onclick=()=>openClient(c.id);del.onclick=()=>{if(confirm('Delete '+c.name+'?')){deleteRecord(c.id,()=>{renderSaved();toast('Deleted');});}};el.appendChild(row);});});}
$('#saveBtn').onclick=saveCurrent;$('#saveTop').onclick=saveCurrent;$('#newTop').onclick=()=>{resetForm();toast('New client');};$('#clearBtn').onclick=()=>resetForm();$('#printBtn').onclick=()=>window.print();

/* ===== LIVE PRICE ESTIMATE (mirrors XPDT pricing spreadsheet) ===== */
const RATES={
  Single:{'Renovations':[3600,4200,4900],'Renovations + Extensions':[4200,4500,5500],'Renovation + Storey Addition':[5900,6900,7900],'Storey Addition':[4900,5900,6900],'Extensions':[2700,3200,3900],'Additions':[2200,2700,3200],'New Homes':[3900,4900,5900],'Granny Flats — Attached':[3900,3900,3900],'Granny Flats — Detached':[3600,3600,3600],'Shed — Standard':[2900,2900,2900],'Shed — With Mezzanine':[3200,3200,3200],'Shed Home':[3900,3900,3900],'Working Drawings Only':[3900,3900,3900],'As-Constructed':[2700,3200,3600]},
  Double:{'Renovations':[4500,5400,5900],'Renovations + Extensions':[4900,5400,6400],'Extensions':[2700,3200,3900],'Additions':[2700,3200,3600],'New Homes':[5500,5900,6900],'Granny Flats — Attached':[3900,3900,3900],'Granny Flats — Detached':[3600,3600,3600],'Shed — Standard':[2900,2900,2900],'Shed — With Mezzanine':[3200,3200,3200],'Shed Home':[3900,3900,3900],'Renovation + Storey Addition':[5900,6900,7900],'Storey Addition':[4900,5900,6900],'Working Drawings Only':[4900,4900,4900],'As-Constructed':[3200,3600,3900]}
};
const POOL={'None':0,'Concrete (on its own)':1800,'Fibreglass':450,'Concrete add-on to project':1500};
const ADD_OWN={an:1500,au:2200,dn:1200,du:1800};
const ADD_PROJ={an:600,au:900,dn:1200,du:1500};
const money=n=>'$'+Math.round(n).toLocaleString('en-AU');
function num(v){const n=parseFloat(v);return isNaN(n)?0:n;}
function recompute(){
  const d=gather();
  const note=$('#pfNote'),bdEl=$('#pfBreakdown');
  // toggle additions qty visibility
  const addWrap=$('#addQty');if(addWrap)addWrap.style.display=(d.p_add_mode&&d.p_add_mode!=='None')?'grid':'none';
  const storey=d.p_storey, type=d.p_type, bedsRaw=d.p_beds;
  const bedIdx={'2':0,'3':1,'4':2}[bedsRaw];
  let base=0, haveBase=false;
  if(storey&&type&&RATES[storey]&&RATES[storey][type]&&bedIdx!=null){base=RATES[storey][type][bedIdx];haveBase=true;}
  // additions
  let add=0;const mode=d.p_add_mode;
  if(mode==='On its own - Class 10'){add=num(d.p_add_an)*ADD_OWN.an+num(d.p_add_au)*ADD_OWN.au+num(d.p_add_dn)*ADD_OWN.dn+num(d.p_add_du)*ADD_OWN.du;}
  else if(mode==='To the project - Class 10'){add=num(d.p_add_an)*ADD_PROJ.an+num(d.p_add_au)*ADD_PROJ.au+num(d.p_add_dn)*ADD_PROJ.dn+num(d.p_add_du)*ADD_PROJ.du;}
  const pool=POOL[d.p_pool]||0;
  const terrain=(d.terrain==='Slope')?400:0;
  const plans=(d.plans==='No')?400:0;
  // deductions only when a base project (not additions-only)
  let ded=0;
  if(haveBase){
    if(d.joinery==='No')ded+=400;
    if(d.kitchen==='No')ded+=400;
    if(d.wetarea==='No')ded+=400;
  }
  const additionsOnly=!haveBase && mode && mode!=='None';
  if(!haveBase && !additionsOnly){
    // nothing selected yet
    $('#pfProposal').textContent='—';$('#pfBand').textContent='—';$('#pfAltWrap').style.display='none';bdEl.innerHTML='';
    note.style.display='block';note.textContent='Select storey, project type and bedrooms to begin.';
    return;
  }
  const subtotal=base+add+pool+terrain+plans-ded;
  const ratio=1-(num(d.p_discount)/100);
  // Add-ons from additions dropdown
  let addon = 0;
  if (d.p_add_mode === 'Granny Flat — Attached (add-on)') addon = 2900;
  if (d.p_add_mode === 'Granny Flat — Detached (add-on)') addon = 2200;
  if (d.p_add_mode === 'Shed (add-on)') addon = 2200;
  const proposal=subtotal*ratio + addon;
  $('#pfProposal').textContent=money(proposal)+' + GST';
  $('#pfBand').textContent=money(proposal-700)+' to '+money(proposal+700)+' + GST';
  if(storey==='Double'){$('#pfAltWrap').style.display='block';$('#pfAlt').textContent=money(proposal*0.6)+' + GST';}
  else $('#pfAltWrap').style.display='none';
  // breakdown
  const rows=[];
  if(haveBase)rows.push(['Base ('+storey+' · '+type+' · '+bedsRaw+' bed)',money(base)]);
  if(add)rows.push(['Additions ('+mode+')',money(add)]);
  if(pool)rows.push(['Pool ('+d.p_pool+')',money(pool)]);
  if(terrain)rows.push(['Slope',money(terrain)]);
  if(plans)rows.push(['No original plans',money(plans)]);
  if(ded)rows.push(['Deductions',('-'+money(ded))]);
  if(ratio!==1)rows.push(['Discount '+num(d.p_discount)+'%','×'+ratio.toFixed(2)]);
  bdEl.innerHTML=rows.map(r=>`<div class="bd-row"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('');
  note.style.display='none';
}
// wire recompute to all pricing controls
['p_storey','p_beds','p_type','p_pool','terrain','p_add_mode','p_add_an','p_add_au','p_add_dn','p_add_du','p_discount','joinery','kitchen','wetarea','plans'].forEach(k=>{
  const el=document.querySelector('[data-f="'+k+'"]');if(!el)return;
  if(el.classList.contains('yn'))el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setTimeout(recompute,0)));
  else el.addEventListener('input',recompute);
});

const _apply=apply;apply=function(data){_apply(data);recompute();};
const _reset=resetForm;resetForm=function(){_reset();recompute();};

resetForm();renderSaved();recompute();


/* ===== API KEY - handled by settings.js ===== */
// getApiKey() is exposed as window.getApiKey by settings.js

// Settings wiring handled by settings.js

/* ===== AI BRIEFING (bullets → polished briefing) ===== */
document.addEventListener('DOMContentLoaded', function() {
  var aiBtnEl = document.getElementById('aiBtn');
  if (!aiBtnEl) return;
  aiBtnEl.addEventListener('click', async function() {
    var btn = this;
    var bullets = (document.getElementById('briefBullets').value || '').trim();
    if (!bullets) { toast('Type some bullet points first'); document.getElementById('briefBullets').focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Polishing…';
    document.getElementById('aiHint').textContent = 'Working on it…';
    try {
      var resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: 'You are an assistant for an Australian residential architectural drafting company (Xpress Draft). Rewrite the following rough bullet points from a sales call into a clear, professional project briefing. Use 3–6 short sentences in plain English. Keep all the facts; do not invent details. Write it as an internal briefing the drafting team can act on. No preamble, no markdown, just the briefing text.\n\nRough notes:\n' + bullets
          }]
        })
      });
      var result = await resp.json();
      if (!result || !result.ok) throw new Error(result ? result.error : 'API error');
      if (!result.text) throw new Error('No text returned.');
      document.getElementById('briefSummary').value = result.text;
      document.getElementById('aiHint').textContent = '✓ Done. Review and edit as needed before saving.';
    } catch(err) {
      document.getElementById('aiHint').textContent = '⚠ ' + (err.message || 'Something went wrong.');
    } finally {
      btn.disabled = false;
      btn.textContent = '✶ Polish with AI →';
    }
  });
});

/* ===== PROPOSAL GENERATOR ===== */
let propHistory = []; // multi-turn revision history

// openProposalModal removed - using PandaDoc modal

function closeProposalModal() {
  $('#propOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// proposalBtn wired below by PandaDoc modal
$('#propClose').onclick = closeProposalModal;
$('#propOverlay').onclick = e => { if (e.target === $('#propOverlay')) closeProposalModal(); };

function buildProposalPrompt() {
  const name    = $('#pc_name').value.trim() || 'the client';
  const addr    = $('#pc_addr').value.trim() || '(address not provided)';
  const type    = $('#pc_type').value || '(project type not specified)';
  const price   = $('#pc_price').value.trim() || '(price not confirmed)';
  const brief   = $('#pc_brief').value.trim() || '(no project brief provided)';
  const rep     = $('#pc_rep').value.trim() || 'the team';
  const context = $('#pc_context').value.trim();
  const expLevel = state.exp === 'exp' ? 'experienced (has done projects like this before)' : 'a first-time client (new to the drafting process)';
  const d = gather();
  const storey = d.p_storey || '';
  const beds   = d.p_beds || '';
  const why    = d.why || '';
  const urgency = d.urgency || '';
  const source  = d.source || '';

  return `You are writing a warm, professional proposal letter for Xpress Draft — an Australian residential architectural drafting company based in NSW. Their brand voice is honest, confident, direct, and human. They never oversell.

Write a client-facing proposal letter for the following enquiry. The letter should:
- Open with a short personalised paragraph acknowledging their project
- Confirm what is included (design development, approval drawings, construction documentation, up to 3 client revision rounds, unlimited authority-required revisions, full support through approvals, single point of contact)
- State the investment clearly: ${price} + GST
- Note the proposal is valid for 45 days
- End with a warm, low-pressure close (no hard sell) and a next step (review the attached drawings example / reach out with any questions)
- Sign off from ${rep} at Xpress Draft

Tone: warm Australian professional. Plain English. Avoid jargon. Keep it under 350 words. Do NOT add subject lines, HTML, markdown, or asterisks. Just the letter text.

Client details:
- Name: ${name}
- Site: ${addr}
- Project type: ${type}${storey ? ' · ' + storey + ' storey' : ''}${beds ? ' · ' + beds + ' bed' : ''}
- Experience level: ${expLevel}
- Project brief: ${brief}
${why ? '- Their "why" / what held them back: ' + why : ''}
${urgency ? '- Urgency / builder status: ' + urgency : ''}
${source ? '- How they heard about us: ' + source : ''}
${context ? '- Extra context: ' + context : ''}`;
}

async function generateProposal(isRevision) {
  isRevision = !!isRevision;
  const btn = $('#propGenerate');
  const label = $('#propGenLabel');
  const spinner = $('#propGenSpinner');
  const status = $('#propStatus');

  // Guard: revision needs instruction text
  if (isRevision) {
    const revise = ($('#propReviseInput').value || '').trim();
    if (!revise) { toast('Type your revision instructions first'); return; }
  }

  btn.disabled = true;
  label.textContent = isRevision ? 'Revising…' : 'Generating…';
  spinner.style.display = 'inline-block';
  status.textContent = isRevision ? 'Applying your revision…' : 'Writing your proposal letter…';

  try {
    // Build message history
    if (!isRevision) {
      // Fresh generation — single user message
      propHistory = [{ role: 'user', content: buildProposalPrompt() }];
    } else {
      // Revision — append assistant response + new user instruction
      const revise = ($('#propReviseInput').value || '').trim();
      propHistory.push({ role: 'assistant', content: $('#propDoc').textContent });
      propHistory.push({ role: 'user', content: 'Revise the letter with these changes: ' + revise + '\n\nReturn only the revised letter text. No preamble, no markdown.' });
    }

    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ max_tokens: 1000, messages: propHistory })
    });
    const result = await resp.json();
    if (!result || !result.ok) throw new Error(result?.error || 'API call failed');
    const text = result.text;
    if (!text) throw new Error('No text returned from API.');

    // Store assistant reply in history for future revisions
    propHistory.push({ role: 'assistant', content: text });
    const displayText = text + '\n\nStructural engineering drawings and certification may be required for portions of the proposed works; however, these are not included within our scope of works and are to be provided by others.\n\nThis proposal and associated fee structure are based on the project scope and assumptions outlined within this briefing. Any details, refinements, or adjustments to the scope will be confirmed and finalised at the time of engagement, following completion of the pre-consultation form to be issued to the client.';
    $('#propDoc').textContent = displayText;
    $('#propOutput').classList.add('visible');
    $('#propEditBar').style.display = 'flex';
    $('#propReviseInput').value = '';
    status.textContent = isRevision ? '✓ Revised.' : '✓ Proposal ready. Review, then copy or download.';

  } catch (err) {
    status.textContent = '⚠ ' + (err.message || 'Something went wrong. Try again.');
  } finally {
    btn.disabled = false;
    label.textContent = 'Generate Proposal Letter';
    spinner.style.display = 'none';
  }
}

$('#propGenerate').onclick = () => generateProposal(false);
$('#propReviseBtn').onclick = () => generateProposal(true);

$('#propCopy').onclick = () => {
  const t = $('#propDoc').textContent;
  if (!t) return;
  navigator.clipboard.writeText(t).then(() => toast('Copied to clipboard')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Copied');
  });
};

$('#propDownload').onclick = () => {
  const t = $('#propDoc').textContent;
  if (!t) return;
  const name = ($('#pc_name').value.trim() || 'client').replace(/\s+/g,'-').toLowerCase();
  const blob = new Blob([t], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'xpress-draft-proposal-' + name + '.txt';
  a.click();
};

// ── Saved clients search ─────────────────────────────────────────────────────
var savedSearchEl = document.getElementById('savedSearch');
if (savedSearchEl) {
  savedSearchEl.addEventListener('input', function() {
    var q = this.value.trim().toLowerCase();
    var rows = document.querySelectorAll('#savedList .saved-row');
    rows.forEach(function(row) {
      var text = row.textContent.toLowerCase();
      row.style.display = !q || text.indexOf(q) > -1 ? '' : 'none';
    });
  });
}

// ── Web app init ──────────────────────────────────────────────────────────────
fetch('/api/me').then(r=>r.json()).then(u=>{
  if(u.name) document.getElementById('whoLbl').textContent = u.name;
  if(u.role === 'admin') {
    const adminLink = document.getElementById('adminLink');
    if(adminLink) adminLink.style.display = 'inline';
  }
});

document.getElementById('logoutBtn').addEventListener('click', function() {
  fetch('/logout', {method:'POST'}).then(()=> window.location.href = '/login');
});

// ── PROPOSAL GENERATION (PandaDoc) ────────────────────────────────────────────
(function() {

  // Inject proposal modal HTML
  var modalHtml = '<div id="pdOverlay" style="display:none;position:fixed;inset:0;z-index:500;background:rgba(42,43,41,.8);backdrop-filter:blur(4px);align-items:center;justify-content:center;">'
    + '<div style="background:#F3EAE5;border-radius:16px;padding:32px;width:100%;max-width:480px;box-shadow:0 24px 80px rgba(0,0,0,.4);margin:24px;">'
    + '<h2 style="font-size:18px;font-weight:800;color:#2A2B29;margin:0 0 6px">Send Proposal via PandaDoc</h2>'
    + '<p style="font-size:13px;color:#888;margin:0 0 24px">Review details before sending to the client for signing.</p>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Client</label>'
    + '<div id="pdClientName" style="font-size:15px;font-weight:700;color:#2A2B29;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;"></div></div>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Client phone</label>'
    + '<input id="pdClientPhone" type="text" style="width:100%;font-family:inherit;font-size:14px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;outline:none;box-sizing:border-box" placeholder="04XX XXX XXX"></div>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Template selected</label>'
    + '<div id="pdTemplate" style="font-size:14px;font-weight:700;color:#EA672F;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;"></div></div>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">CS Representative</label>'
    + '<div id="pdRepPhone" style="font-size:14px;color:#2A2B29;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;"></div></div>'
    + '<div style="margin-bottom:14px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Client email</label>'
    + '<input id="pdEmail" type="email" style="width:100%;font-family:inherit;font-size:14px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;outline:none;box-sizing:border-box" placeholder="client@email.com"></div>'
    + '<div style="margin-bottom:24px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Fee (ex GST) — edit to override</label>'
    + '<input id="pdPrice" type="text" style="width:100%;font-family:inherit;font-size:14px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;outline:none;box-sizing:border-box" placeholder="e.g. 4200"></div>'
    + '<div style="margin-bottom:24px"><label style="display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:5px">Deposit % (default 20% — edit to override)</label>'
    + '<input id="pdDeposit" type="number" min="1" max="100" value="20" style="width:100%;font-family:inherit;font-size:14px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;padding:10px 14px;outline:none;box-sizing:border-box"></div>'
    + '<div style="display:flex;gap:10px">'
    + '<button id="pdSend" style="flex:1;font-family:inherit;font-size:14px;font-weight:700;background:#EA672F;color:#fff;border:none;border-radius:10px;padding:13px;cursor:pointer">Send Proposal</button>'
    + '<button id="pdCancel" style="font-family:inherit;font-size:14px;font-weight:600;background:transparent;border:1.5px solid #e0d9d5;color:#2A2B29;border-radius:10px;padding:13px 20px;cursor:pointer">Cancel</button>'
    + '</div>'
    + '<div id="pdStatus" style="font-size:12px;color:#888;margin-top:12px;min-height:18px;text-align:center"></div>'
    + '</div></div>';

  var container = document.createElement('div');
  container.innerHTML = modalHtml;
  document.body.appendChild(container);

  var TEMPLATE_LABELS = {
    standard:  'Standard Agreement',
    as_built:  'As Built Agreement',
    da_only:   'DA Only Agreement',
    da_and_ba: 'DA + BA Agreement'
  };

  function selectTemplate(fields) {
    var type = ((fields && fields.p_type) || '').toLowerCase();
    if (type.indexOf('as-constructed') >= 0 || type.indexOf('as built') >= 0 || type.indexOf('as_built') >= 0) return 'as_built';
    if (type.indexOf('da only') >= 0 || type.indexOf('da_only') >= 0) return 'da_only';
    if (type.indexOf('da') >= 0 && (type.indexOf('ba') >= 0 || type.indexOf('construction') >= 0)) return 'da_and_ba';
    return 'standard';
  }

  var proposalBtn = document.getElementById('proposalBtn');
  if (proposalBtn) {
    proposalBtn.addEventListener('click', function() {
      if (!state.editingId) { toast('Save the call record first'); return; }
      var d = gather();
      var tmplKey = selectTemplate(d);
      document.getElementById('pdTemplate').textContent = TEMPLATE_LABELS[tmplKey] || tmplKey;
      // Show rep phone if available
      var repPhoneEl = document.getElementById('pdRepPhone');
      if (repPhoneEl) {
        fetch('/api/me').then(r => r.json()).then(me => {
          repPhoneEl.textContent = me.phone ? ': ' + me.name + ' — ' + me.phone : ': ' + me.name;
        }).catch(() => {});
      }
      document.getElementById('pdClientName').textContent = document.getElementById('cName') ? document.getElementById('cName').value.trim() : '';
      var phoneEl = document.getElementById('cPhone');
      document.getElementById('pdClientPhone').value = phoneEl ? phoneEl.value.trim() : '';
      // Pre-fill email from contact field if it contains an email address
      var emailVal = document.getElementById('cEmail') ? document.getElementById('cEmail').value.trim() : (d.client_email || '');
      document.getElementById('pdEmail').value = emailVal;
      // Pre-fill price from live calculator or saved record
      var priceEl = document.getElementById('pfProposal');
      var priceRaw = priceEl ? priceEl.textContent.replace(/[^0-9.,]/g,'').replace(/,/g,'') : '';
      console.log('pdPrice debug - pfProposal text:', priceEl ? priceEl.textContent : 'NOT FOUND', 'priceRaw:', priceRaw);
      if (!priceRaw || priceRaw === '') {
        priceRaw = d.quoted_price || (d.fields && d.fields.quoted_price) || '';
      }
      document.getElementById('pdPrice').value = priceRaw || '';
      document.getElementById('pdStatus').textContent = '';
      document.getElementById('pdOverlay').style.display = 'flex';
    });
  }

  document.getElementById('pdCancel').addEventListener('click', function() {
    document.getElementById('pdOverlay').style.display = 'none';
  });

  document.getElementById('pdOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });

  document.getElementById('pdSend').addEventListener('click', async function() {
    var email = document.getElementById('pdEmail').value.trim();
    var price = document.getElementById('pdPrice').value.trim();
    var status = document.getElementById('pdStatus');

    if (!email) { status.textContent = 'Please enter the client email address.'; return; }
    if (!state.editingId) { status.textContent = 'No client record selected.'; return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.textContent = 'Creating proposal in PandaDoc…';

    try {
      var resp = await fetch('/api/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: state.editingId,
          clientEmail: email,
          clientPhone: document.getElementById('pdClientPhone').value.trim(),
          priceOverride: price ? parseFloat(price.replace(/[^0-9.]/g,'')) : null,
          depositPct: parseFloat(document.getElementById('pdDeposit').value) || 20
        })
      });
      var result = await resp.json();
      if (!result.ok) throw new Error(result.error || 'Failed to send proposal');
      status.style.color = '#2e7d32';
      status.textContent = 'Proposal sent! The client will receive it by email shortly.';
      btn.textContent = 'Sent!';
      setTimeout(function() {
        document.getElementById('pdOverlay').style.display = 'none';
        btn.disabled = false;
        btn.textContent = 'Send Proposal';
        status.style.color = '#888';
      }, 2500);
    } catch(err) {
      status.textContent = err.message || 'Something went wrong. Try again.';
      btn.disabled = false;
      btn.textContent = 'Send Proposal';
    }
  });

})();


// ── Monday.com CRM Leads ──────────────────────────────────────────────────────

var leadsData = [];
var activeLead = null;

async function loadPendingRequests() {
  const container = document.getElementById('pendingContainer');
  const countEl = document.getElementById('pendingCount');
  if (!container) return;
  try {
    const requests = await apiFetch('/api/pending-requests');
    if (countEl) countEl.textContent = requests.length;
    if (!requests || requests.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#888;margin:0 0 8px">No pending requests.</p>';
      return;
    }
    container.innerHTML = requests.map(r =>
      '<div style="background:#fff;border:1.5px solid #2196F3;border-radius:10px;padding:12px 16px;margin-bottom:8px">' +
      '<div style="font-size:14px;font-weight:700;color:#2A2B29;margin-bottom:2px">' + esc(r.client_name) + '</div>' +
      '<div style="font-size:12px;color:#888">' + esc(r.address || '—') + '</div>' +
      '<div style="font-size:11px;color:#2196F3;margin-top:4px">Requested: ' + new Date(r.requested_at).toLocaleDateString('en-AU') + '</div>' +
      '</div>'
    ).join('');
  } catch(e) {
    if (container) container.innerHTML = '<p style="font-size:12px;color:#888;margin:0">Could not load requests.</p>';
  }
}

async function loadLeads() {
  const container = document.getElementById('leadsContainer');
  if (!container) return;
  loadPendingRequests();
  checkReminders();
  container.innerHTML = '<p style="color:#888;padding:20px">Loading leads from Monday.com...</p>';
  try {
    const leads = await apiFetch('/api/leads');
    leadsData = leads;
    renderLeads(leads);
  } catch(e) {
    container.innerHTML = '<p style="color:#c00;padding:20px">Error loading leads: ' + e.message + '</p>';
  }
}

const STAGE_LABELS = {
  'DISCOVERY CALLS':          { label: 'Discovery', color: '#3498DB' },
  'QUALIFIED LEADS':          { label: 'Qualified', color: '#1ABC9C' },
  'FOLLOW UP EMAILS / CALLS': { label: 'Follow Up', color: '#9B59B6' },
  'SEQUENCE CALL':            { label: 'Sequence', color: '#7F8C8D' },
  'WAITING FOR CLIENTS':      { label: 'Waiting', color: '#F39C12' },
  'CLOSED DEALS':             { label: 'Closed', color: '#27AE60' },
  'HELP REQUIRED':            { label: 'Help Required', color: '#E74C3C' },
  'LOST':                     { label: 'Lost', color: '#95A5A6' },
};

function renderLeads(leads) {
  window._cachedLeads = leads;
  const container = document.getElementById('leadsContainer');
  if (!container) return;

  // Group by pipeline stage
  const groups = {};
  leads.forEach(l => {
    const g = l.group_title || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(l);
  });

  // Render group filter tabs
  renderGroupTabs(groups);

  const groupOrder = ['QUALIFIED LEADS', 'DISCOVERY CALLS', 'SEQUENCE CALL', 'FOLLOW UP EMAILS / CALLS', 'WAITING FOR CLIENTS', 'CLOSED DEALS', 'HELP REQUIRED'];
  // Add any other groups not in the predefined order (excluding LOST)
  Object.keys(groups).forEach(g => { if (!groupOrder.includes(g) && g !== 'LOST') groupOrder.push(g); });

  let html = '';
  groupOrder.forEach(gTitle => {
    if (activeGroupFilter !== 'ALL' && gTitle !== activeGroupFilter) return;
    const items = groups[gTitle];
    if (!items || items.length === 0) return;
    const stageInfo = STAGE_LABELS[gTitle] || { label: gTitle, color: '#888' };
    html += '<div class="lead-group">' +
      '<div class="lead-group-title" style="color:' + stageInfo.color + '">' + stageInfo.label + ' <span class="lead-count" style="background:' + stageInfo.color + '">' + items.length + '</span></div>' +
      items.map(l => 
        '<div class="lead-card" data-id="' + l.monday_id + '" onclick="openLead(&quot;' + l.monday_id + '&quot;)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
        '<div class="lead-name">' + esc(l.name) + '</div>' +
        '<span style="font-size:10px;font-weight:700;color:' + stageInfo.color + ';background:' + stageInfo.color + '18;padding:2px 8px;border-radius:10px">' + stageInfo.label + '</span>' +
        '</div>' +
        '<div class="lead-meta">' + esc(l.address || '') + (l.phone ? ' · ' + esc(l.phone) : '') + '</div>' +
        (l.source ? '<div class="lead-source">' + esc(l.source) + '</div>' : '') +
        '</div>'
      ).join('') +
      '</div>';
  });

  if (!html) html = '<p style="color:#888;padding:20px">No leads assigned to you yet.</p>';
  container.innerHTML = html;
}

function openLead(mondayId) {
  const lead = leadsData.find(l => l.monday_id === mondayId);
  if (!lead) return;
  activeLead = lead;

  // Populate the lead detail panel
  document.getElementById('leadDetailName').textContent = lead.name;
  document.getElementById('leadDetailAddress').value = lead.address || '';
  document.getElementById('leadDetailPhone').value = lead.phone || '';
  document.getElementById('leadDetailEmail').value = lead.email || '';
  document.getElementById('leadDetailSource').textContent = lead.source || '—';
  document.getElementById('leadDetailArrival') && (document.getElementById('leadDetailArrival').value = lead.arrival || '');
  document.getElementById('leadDetailStatus') && (document.getElementById('leadDetailStatus').value = lead.status || '');
  // Files received from Monday.com - load dynamically
  var mondayFilesEl = document.getElementById('leadMondayFiles');
  if (mondayFilesEl) {
    mondayFilesEl.innerHTML = '<p style="font-size:12px;color:#888;margin:0">Loading files...</p>';
    apiFetch('/api/leads/' + lead.monday_id + '/monday-files').then(function(files) {
      if (!files || files.length === 0) {
        mondayFilesEl.innerHTML = '<p style="font-size:12px;color:#888;margin:0">No files in Monday.com.</p>';
        return;
      }
      mondayFilesEl.innerHTML = files.map(function(f) {
        var url = f.public_url || f.url || '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#faf7f5;border:1.5px solid #e0d9d5;border-radius:8px;margin-bottom:6px">' +
          '<span style="font-size:12px;color:#2A2B29;flex:1">📎 ' + esc(f.name) + '</span>' +
          (url ? '<a href="' + url + '" target="_blank" style="font-size:11px;color:#EA672F;font-weight:700;text-decoration:none;padding:4px 10px;border:1.5px solid #EA672F;border-radius:6px">Download</a>' : '<span style="font-size:11px;color:#888">No URL</span>') +
          '</div>';
      }).join('');
    }).catch(function() {
      mondayFilesEl.innerHTML = '<p style="font-size:12px;color:#888;margin:0">Could not load files.</p>';
    });
  }
  document.getElementById('leadDetailGroup').textContent = lead.group_title || '—';

  // Highlight current pipeline stage button
  var stageMap = { 
    'QUALIFIED LEADS':'qualified',
    'DISCOVERY CALLS':'discovery', 
    'SEQUENCE CALL':'sequence',
    'FOLLOW UP EMAILS / CALLS':'followup', 
    'WAITING FOR CLIENTS':'waiting', 
    'CLOSED DEALS':'closed',
    'LOST':'lost',
    'HELP REQUIRED':'help'
  };
  var currentStage = stageMap[lead.group_title] || '';
  document.querySelectorAll('.stage-btn').forEach(function(btn) {
    var stage = btn.dataset.stage;
    btn.style.background = stage === currentStage ? '#EA672F' : (stage === 'lost' ? '#fff' : '#fff');
    btn.style.color = stage === currentStage ? '#fff' : (stage === 'lost' ? '#c0392b' : '#2A2B29');
    btn.style.borderColor = stage === currentStage ? '#EA672F' : (stage === 'lost' ? '#c0392b' : '#e0d9d5');
  });
  // Show client enquiry (read-only)
  var enquiryEl = document.getElementById('leadEnquiry');
  if (enquiryEl) enquiryEl.textContent = lead.enquiry || 'No enquiry recorded.';
  // Rep notes - separate from enquiry
  document.getElementById('leadNotes').value = lead.rep_notes || '';
  // Load files and reminders
  loadLeadFiles(lead.monday_id);
  loadLeadReminders(lead.monday_id);

  // Pre-fill the client fields for proposal
  if (document.getElementById('cName')) document.getElementById('cName').value = lead.name;
  if (document.getElementById('cPhone')) document.getElementById('cPhone').value = lead.phone || '';
  if (document.getElementById('cEmail')) document.getElementById('cEmail').value = lead.email || '';
  if (document.getElementById('cAddr')) document.getElementById('cAddr').value = lead.address || '';

  // Show detail panel, hide list
  document.getElementById('leadsListPanel').style.display = 'none';
  document.getElementById('leadDetailPanel').style.display = 'block';
}

async function closeLeadDetail() {
  // Auto-save notes before closing
  if (activeLead) {
    const notes = document.getElementById('leadNotes').value;
    if (notes !== (activeLead.rep_notes || '')) {
      try {
        await apiFetch('/api/leads/' + activeLead.monday_id + '/notes', 'PATCH', { notes });
        activeLead.rep_notes = notes;
        console.log('Notes auto-saved on close');
      } catch(e) {
        console.error('Auto-save failed:', e.message);
      }
    }
  }
  activeLead = null;
  document.getElementById('leadsListPanel').style.display = 'block';
  document.getElementById('leadDetailPanel').style.display = 'none';
}

async function saveLeadNotes() {
  if (!activeLead) return;
  const notes = document.getElementById('leadNotes').value;
  try {
    await apiFetch('/api/leads/' + activeLead.monday_id + '/notes', 'PATCH', { notes });
    activeLead.enquiry = notes;
    toast('Notes saved to Monday.com');
  } catch(e) {
    toast('Error saving notes: ' + e.message);
  }
}

async function leadAction(action) {
  if (!activeLead) return;
  const notes = document.getElementById('leadNotes').value;
  const labels = {
    free_consultation: 'Move to Free Consultations',
    proposal_requested: 'Request Proposal — this lead will disappear from your list until the proposal is sent',
    help_required: 'Move to Help Required',
  };
  if (!confirm('Are you sure? ' + (labels[action] || action))) return;
  try {
    await apiFetch('/api/leads/' + activeLead.monday_id + '/action', 'POST', {
      action,
      notes,
      client_name: activeLead.name,
      address: activeLead.address || ''
    });
    toast('Done — lead updated');
    closeLeadDetail();
    loadLeads();
  } catch(e) {
    toast('Error: ' + e.message);
  }
}

function apiFetch(url, method, body) {
  method = method || 'GET';
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(r => r.json());
}

async function saveLeadDetails() {
  if (!activeLead) return;
  const details = {
    address: document.getElementById('leadDetailAddress').value.trim(),
    phone: document.getElementById('leadDetailPhone').value.trim(),
    email: document.getElementById('leadDetailEmail').value.trim(),
    status: document.getElementById('leadDetailStatus') ? document.getElementById('leadDetailStatus').value.trim() : '',
    arrival: document.getElementById('leadDetailArrival') ? document.getElementById('leadDetailArrival').value.trim() : '',
  };
  try {
    await apiFetch('/api/leads/' + activeLead.monday_id + '/details', 'PATCH', details);
    // Update local data
    Object.assign(activeLead, details);
    toast('Details saved to Monday.com');
  } catch(e) {
    toast('Error saving: ' + e.message);
  }
}

async function moveStage(stage) {
  if (!activeLead) return;
  const stageLabels = {
    discovery: 'DISCOVERY CALLS',
    qualified: 'QUALIFIED LEADS',
    followup: 'FOLLOW UP EMAILS / CALLS',
    waiting: 'WAITING FOR CLIENTS',
    closed: 'CLOSED DEALS',
    lost: 'LOST'
  };
  if (!confirm(stage === 'lost' ? 'Mark this lead as Lost? It will be removed from your leads list.' : 'Move lead to ' + stageLabels[stage] + '?')) return;
  try {
    await apiFetch('/api/leads/' + activeLead.monday_id + '/action', 'POST', { action: 'move_stage', stage });
    if (stage === 'lost') {
      toast('Lead marked as Lost — removed from your list');
      closeLeadDetail();
      loadLeads();
    } else {
      activeLead.group_title = stageLabels[stage];
      document.getElementById('leadDetailGroup').textContent = stageLabels[stage];
      toast('Lead moved to ' + stageLabels[stage]);
    }
  } catch(e) {
    toast('Error: ' + e.message);
  }
}

async function loadLeadFiles(mondayId) {
  const container = document.getElementById('leadFiles');
  if (!container) return;
  try {
    const files = await apiFetch('/api/leads/' + mondayId + '/files');
    if (!files || files.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#888;margin:0">No files uploaded yet.</p>';
      return;
    }
    container.innerHTML = files.map(f => 
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1.5px solid #e0d9d5;border-radius:8px;margin-bottom:6px">' +
      '<span style="font-size:12px;color:#2A2B29;flex:1">📄 ' + esc(f.name) + '</span>' +
      '<a href="/api/leads/' + mondayId + '/files/' + encodeURIComponent(f.name) + '" target="_blank" style="font-size:11px;color:#EA672F;font-weight:700;text-decoration:none;padding:4px 10px;border:1.5px solid #EA672F;border-radius:6px">Download</a>' +
      '<button onclick="deleteLeadFile(\'' + mondayId + '\',\'' + f.name.replace(/'/g, "\\'") + '\')" style="font-size:11px;color:#fff;background:#c0392b;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:700">✕ Delete</button>' +
      '</div>'
    ).join('');
  } catch(e) {
    container.innerHTML = '<p style="font-size:12px;color:#888;margin:0">Could not load files.</p>';
  }
}

function previewFiles() {
  const input = document.getElementById('leadFileInput');
  const preview = document.getElementById('filePreview');
  if (!preview) return;
  if (!input.files.length) { preview.textContent = ''; return; }
  const names = Array.from(input.files).map(f => f.name).join(', ');
  preview.textContent = input.files.length + ' file(s) selected: ' + names;
}

async function deleteLeadFile(mondayId, filename) {
  if (!confirm('Delete ' + filename + '?')) return;
  try {
    const res = await fetch('/api/leads/' + mondayId + '/files/' + encodeURIComponent(filename), { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      toast('File deleted');
      loadLeadFiles(mondayId);
    } else {
      toast('Delete failed: ' + (data.error || 'unknown error'));
    }
  } catch(e) {
    toast('Delete failed: ' + e.message);
  }
}

async function uploadLeadFiles() {
  if (!activeLead) return;
  const input = document.getElementById('leadFileInput');
  if (!input.files.length) { toast('Please select files first'); return; }
  const formData = new FormData();
  for (const file of input.files) formData.append('files', file);
  try {
    const res = await fetch('/api/leads/' + activeLead.monday_id + '/files', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.ok) {
      toast(input.files.length + ' file(s) uploaded');
      input.value = '';
      var preview = document.getElementById('filePreview');
      if (preview) preview.textContent = '';
      loadLeadFiles(activeLead.monday_id);
    }
  } catch(e) {
    toast('Upload failed: ' + e.message);
  }
}

function openProposalFromLead() {
  if (!activeLead) return;
  // Store monday_id in state so it gets saved with the client record
  state.mondayId = activeLead.monday_id;
  // Close leads panel and open main app
  document.getElementById('leadsPanel').style.display = 'none';
  // Pre-fill client fields if not already done
  if (document.getElementById('cName')) document.getElementById('cName').value = activeLead.name;
  if (document.getElementById('cPhone')) document.getElementById('cPhone').value = activeLead.phone || '';
  if (document.getElementById('cEmail')) document.getElementById('cEmail').value = activeLead.email || '';
  if (document.getElementById('cAddr')) document.getElementById('cAddr').value = activeLead.address || '';
  toast('Lead loaded — complete the call details and send proposal');
}

// Load leads when leads tab is active
document.addEventListener('DOMContentLoaded', function() {
  const leadsTab = document.getElementById('leadsTabBtn');
  if (leadsTab) {
    leadsTab.addEventListener('click', function() {
      loadLeads();
    });
  }
});

// ── Group filter tabs ─────────────────────────────────────────────────────────
var activeGroupFilter = 'ALL';

function renderGroupTabs(groups) {
  const tabsEl = document.getElementById('groupFilterTabs');
  if (!tabsEl) return;
  const allGroups = ['ALL', ...Object.keys(groups).filter(g => g !== 'LOST')];
  tabsEl.innerHTML = allGroups.map(g => {
    const info = STAGE_LABELS[g] || { label: g === 'ALL' ? 'All Leads' : g, color: '#888' };
    const count = g === 'ALL' ? Object.values(groups).reduce((a, b) => a + b.length, 0) : (groups[g] || []).length;
    const isActive = g === activeGroupFilter;
    return '<button onclick="filterLeads(&quot;' + g.replace(/"/g, '') + '&quot;)" style="' +
      'background:' + (isActive ? info.color : '#fff') + ';' +
      'color:' + (isActive ? '#fff' : info.color) + ';' +
      'border:1.5px solid ' + info.color + ';' +
      'padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer">' +
      (g === 'ALL' ? 'All Leads' : info.label) + ' (' + count + ')</button>';
  }).join('');
}

function filterLeads(group) {
  activeGroupFilter = group;
  renderLeads(window._cachedLeads || []);
}

// ── Reminders ─────────────────────────────────────────────────────────────────
async function checkReminders() {
  try {
    const reminders = await apiFetch('/api/reminders');
    if (!reminders || reminders.length === 0) {
      document.getElementById('reminderBanner') && (document.getElementById('reminderBanner').style.display = 'none');
      return;
    }
    // Check for due reminders (within next 24 hours)
    const now = new Date();
    const due = reminders.filter(r => new Date(r.remind_at) <= new Date(now.getTime() + 24*60*60*1000));
    const banner = document.getElementById('reminderBanner');
    if (banner && due.length > 0) {
      banner.style.display = 'block';
      document.getElementById('reminderBannerText').textContent = 
        due.length + ' reminder' + (due.length > 1 ? 's' : '') + ' due' + (due.some(r => new Date(r.remind_at) <= now) ? ' NOW' : ' soon');
    }
    // Populate reminders list
    const container = document.getElementById('remindersContainer');
    if (container) {
      container.innerHTML = reminders.map(r =>
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#faf7f5;border-radius:8px;margin-bottom:8px">' +
        '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:700;color:#2A2B29">' + esc(r.client_name) + '</div>' +
        '<div style="font-size:12px;color:#888">' + esc(r.note || '') + '</div>' +
        '<div style="font-size:11px;color:#EA672F;font-weight:700">' + new Date(r.remind_at).toLocaleString('en-AU') + '</div>' +
        '</div>' +
        '<button onclick="dismissReminder(' + r.id + ')" style="background:#c0392b;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">Dismiss</button>' +
        '</div>'
      ).join('');
    }
  } catch(e) {}
}

async function dismissReminder(id) {
  await apiFetch('/api/reminders/' + id, 'DELETE');
  checkReminders();
}

async function loadLeadReminders(mondayId) {
  const container = document.getElementById('leadRemindersList');
  if (!container) return;
  try {
    const reminders = await apiFetch('/api/leads/' + mondayId + '/reminders');
    if (!reminders || reminders.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#888;margin:0 0 8px">No reminders set.</p>';
      return;
    }
    container.innerHTML = reminders.map(r =>
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#faf7f5;border:1.5px solid #e0d9d5;border-radius:8px;margin-bottom:6px">' +
      '<div style="flex:1">' +
      '<div style="font-size:12px;font-weight:700;color:#2A2B29">' + esc(r.note || 'Reminder') + '</div>' +
      '<div style="font-size:11px;color:#EA672F">' + new Date(r.remind_at).toLocaleString('en-AU') + '</div>' +
      '</div>' +
      '<button onclick="dismissReminder(' + r.id + ');loadLeadReminders(&quot;' + mondayId + '&quot;)" style="background:#c0392b;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px">✕</button>' +
      '</div>'
    ).join('');
  } catch(e) {}
}

async function addReminder() {
  if (!activeLead) return;
  const date = document.getElementById('reminderDate').value;
  const note = document.getElementById('reminderNote').value.trim();
  if (!date) { toast('Please select a date and time'); return; }
  await apiFetch('/api/leads/' + activeLead.monday_id + '/reminders', 'POST', {
    remind_at: date,
    note,
    client_name: activeLead.name
  });
  document.getElementById('reminderDate').value = '';
  document.getElementById('reminderNote').value = '';
  toast('Reminder set');
  loadLeadReminders(activeLead.monday_id);
  checkReminders();
}

// Check reminders every 5 minutes
setInterval(checkReminders, 5 * 60 * 1000);
