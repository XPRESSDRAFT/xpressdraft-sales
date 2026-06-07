// Auto-generated layout HTML — do not edit manually
document.getElementById('appLayout').innerHTML = `<div class="wrap layout">

<div class="main-col">

<section id="script">
  <div class="sec-label">The Call</div>
  <h2 class="sec-title">Sales <strong>Script</strong></h2>
  <div class="sec-rule"></div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">1</div><div class="stage-name">Greet</div></div>
    <div class="stage-body">
      <div class="say"><span class="lead">Say</span>Hi, this is [Your name], from Xpressdraft, how can I help you?</div>
      <div class="say"><span class="lead">Announce warning</span>Thank you for sharing that. Just so you know how we work — we don't push people into decisions.<br><br>So during this call, I'd really appreciate your honest feedback — whether it's about the service or the price — so we can address anything straight away.<br><br>My goal is to find the best way to help you move forward with your project.</div>
      <p class="ask">May I please confirm your full name, email and site address?</p>
      <p class="ask">And do you have the original house plans available? <span class="tag">Renovations only</span></p>
      <p class="ask">To confirm, does the work stay within the existing footprint, or are you considering any additions? <span class="tag">Renovations only</span></p>
      <p class="ask">Do you require any kitchen design and cabinetry details, or would you purchase a pre-fabricated one?</p>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">2</div><div class="stage-name">Obtain Briefing</div></div>
    <div class="stage-body">
      <div class="say"><span class="lead">Say</span>Let me quickly recap what you're looking to do, just to make sure I've got it right:<br>• [Bullet-point summary]</div>
      <div class="do">Discovery prompts: <strong>What's been the biggest challenge so far? · What's holding you back from moving forward? · Have you looked at other companies yet?</strong></div>
      <p class="ask">How far along are you with this — just starting to explore, or fairly down the track? <span class="jtag">Journey 2 · Explore</span></p>
      <div class="ai-brief">
        <div class="ai-col">
          <label>Your bullet points (rough notes)</label>
          <textarea data-f="brief_bullets" id="briefBullets" placeholder="- single storey rear extension&#10;- new kitchen + laundry&#10;- wants more natural light&#10;- timber look, budget-conscious"></textarea>
          <button type="button" class="btn btn-ai" id="aiBtn">✶ Polish with AI →</button>
          <div class="ai-hint" id="aiHint">Jot rough notes on the left, click Polish. Review and edit the result before saving.</div>
        </div>
        <div class="ai-col">
          <label>Briefing (AI polished — editable)</label>
          <textarea data-f="brief_summary" id="briefSummary" placeholder="The polished briefing will appear here. You can edit it before saving."></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- DATA CAPTURE moved here, right under Obtain Briefing -->
  <div class="stage">
    <div class="stage-head"><div class="stage-num">⚲</div><div class="stage-name">Briefing</div></div>
    <div class="stage-body">
      <div class="price-inputs">
        <div class="pi-row">
          <div class="field"><label>Storey (for pricing)</label><div class="yn" data-f="p_storey"><button>Single</button><button>Double</button></div></div>
          <div class="field"><label>Bedrooms</label><div class="yn three" data-f="p_beds"><button>2</button><button>3</button><button>4</button></div></div>
        </div>
        <div class="field full"><label>Project type</label>
          <select data-f="p_type">
            <option value="">— select —</option>
            <option>Renovations</option>
            <option>Renovations + Extensions</option>
            <option>Extensions</option>
            <option>Additions</option>
            <option>New Homes</option>
            <option>Granny Flats</option>
            <option>As-Constructed</option>
          </select>
        </div>
        <div class="pi-row">
          <div class="field"><label>Pool</label>
            <select data-f="p_pool">
              <option>None</option>
              <option>Concrete (on its own)</option>
              <option>Fibreglass</option>
              <option>Concrete add-on to project</option>
            </select>
          </div>
          <div class="field"><label>Terrain</label><div class="yn" data-f="terrain"><button>Flat</button><button>Slope</button></div></div>
        </div>
        <div class="field full"><label>Additions</label>
          <select data-f="p_add_mode">
            <option>None</option>
            <option>On its own</option>
            <option>To the project</option>
          </select>
        </div>
        <div class="add-qty" id="addQty" style="display:none;">
          <div class="field"><label>Attached · no roof</label><input type="number" min="0" step="1" data-f="p_add_an" placeholder="0"></div>
          <div class="field"><label>Attached · under roof</label><input type="number" min="0" step="1" data-f="p_add_au" placeholder="0"></div>
          <div class="field"><label>Detached · no roof</label><input type="number" min="0" step="1" data-f="p_add_dn" placeholder="0"></div>
          <div class="field"><label>Detached · under roof</label><input type="number" min="0" step="1" data-f="p_add_du" placeholder="0"></div>
        </div>
        <div class="field"><label>Discount %</label><input type="number" min="0" max="100" step="1" data-f="p_discount" placeholder="0"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Going beyond existing footprint?</label><div class="yn" data-f="beyond"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Would the project have an addition?</label><div class="yn" data-f="addition"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>If addition — attached to the house?</label><div class="yn" data-f="attached"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>If addition — undercover?</label><div class="yn" data-f="undercover"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Survey plans available?</label><div class="yn" data-f="surveyplans"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Survey required? <span style="color:var(--orange)">*beyond footprint</span></label><div class="yn" data-f="surveyreq"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Existing number of storeys</label><input type="text" data-f="existstoreys"></div>
        <div class="field"><label>Proposed number of storeys</label><input type="text" data-f="propstoreys"></div>
        <div class="field"><label>Kitchen design?</label><div class="yn" data-f="kitchen"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Joinery details?</label><div class="yn" data-f="joinery"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Wet area elevations?</label><div class="yn" data-f="wetarea"><button>Yes</button><button>No</button></div></div>
        <div class="field"><label>Original house plans?</label><div class="yn" data-f="plans"><button>Yes</button><button>No</button></div></div>
      </div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">3</div><div class="stage-name">Find the "Why"</div></div>
    <div class="stage-body">
      <p class="ask">Is this project for yourself, or is it an investment?</p>
      <div class="say"><span class="lead">Follow by</span>What's been the main thing holding you back from starting until now? <span class="tag">Register info</span></div>
      <div class="capture"><label>The "why" / what's holding them back</label><textarea data-f="why"></textarea></div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">4</div><div class="stage-name">Identify Skill Level</div><div class="adapts">Adapts to experience</div></div>
    <div class="stage-body">
      <p class="ask">Have you been through a project like this before, or would this be your first time? <span class="jtag">Journey 3 · Requirements</span></p>
      <div class="only-new">
        <div class="branch">
          <div class="opt"><b>First time (default)</b>That's completely fine — we guide clients through this process every day. You won't need to know the technical side; that's our job.</div>
          <div class="opt"><b>If done before</b>What were you hoping to get from the previous provider that you didn't, so we can make sure we're the right fit?</div>
        </div>
      </div>
      <div class="only-exp">
        <div class="say">It sounds like you know this process well. I'll keep things efficient and skip the basics — tell me where you'd like me to focus.</div>
        <div class="branch">
          <div class="opt"><b>Acknowledge expertise</b>Since you've done this before, what worked well, and what would you want done differently this time?</div>
          <div class="opt"><b>Pin the gap</b>What was missing from your previous provider that you'd want from us — speed, clarity, construction-ready detail?</div>
        </div>
      </div>
      <div class="capture"><label>Experience &amp; what they want from us</label><textarea data-f="skill"></textarea></div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">★</div><div class="stage-name">Positioning — Core Value</div><div class="adapts">Adapts to experience</div></div>
    <div class="stage-body">
      <div class="only-new">
        <div class="say">Most clients feel uncertain about the process, not the design — so that's what we remove first.</div>
        <div class="say">From day one you'll see exactly where your project sits and its progress, and we guide you step by step right up to engaging the Certifier, who leads you to the next steps.</div>
      </div>
      <div class="only-exp">
        <div class="say">You already know the process, so I'll be direct about where we add value: we bring construction knowledge into the drawings, which cuts back-and-forth with engineers and builders and keeps approvals moving.</div>
        <div class="say">We work in defined stages — start, review, refine — and we absorb the technical coordination with council, certifier, engineer and energy assessor at no extra cost.</div>
      </div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">5</div><div class="stage-name">Engagement &amp; Level of Urgency</div></div>
    <div class="stage-body">
      <p class="ask">Have you spoken with a builder yet?</p>
      <div class="branch">
        <div class="opt"><b>If yes</b>Great. I'll send you an example set of drawings to show them, so you can get their opinion about the quality of our work and feel more confident too.</div>
        <div class="opt"><b>Level of urgency</b>Is this a sooner-rather-than-later thing for you? <i>(Reassure: "That's absolutely fine — we can work around that.")</i> <span class="tag">Register info</span></div>
      </div>
      <p class="ask">Do you have a rough budget in mind, or is that something you're still working out? <span class="jtag">Journey 4 · Budget</span></p>
      <p class="ask">Are we one of a few you're weighing up, or are you fairly settled on direction? <span class="jtag">Journey 5 · Select</span></p>
      <div class="capture"><label>Builder status &amp; urgency</label><input type="text" data-f="urgency"></div>
      <div class="capture"><label>Budget &amp; where they are in choosing</label><input type="text" data-f="budget"></div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">6</div><div class="stage-name">Process &amp; Review</div><div class="adapts">Adapts to experience</div></div>
    <div class="stage-body">
      <div class="say">Before we talk about pricing, I just want to explain <i>how it feels</i> to work with us — because that's usually what matters most.</div>
      <div class="do">Clients really value that we <strong>absorb the technical back-and-forth</strong> — if council, the certifier, engineer or energy assessor request changes, we handle it at no extra cost.</div>
      <div class="do">You'll have a <strong>single point of contact</strong> throughout, and because we bring construction knowledge into the drawings, there's less back-and-forth with engineers and builders — saving time and cost on site.</div>
      <div class="only-new"><div class="do">If anything's unclear, we can jump on a quick call to resolve it — though most clients rarely need to.</div></div>
      <div class="only-exp"><div class="do"><strong>For experienced clients:</strong> our drawings are construction-ready, so your builder and engineer get what they need first time — fewer RFIs and less rework on site.</div></div>
      <p class="ask">Any questions so far?</p>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">7</div><div class="stage-name">Prepare to Close</div></div>
    <div class="stage-body">
      <div class="do">Just so I can tailor things properly — <strong>where did you hear about us? Have you had a chance to look at our reviews?</strong></div>
      <div class="say">In simple terms, what you're really buying is a stress-free approval experience. Clear stages. Full visibility. No surprise costs. One team beside you from start to approval.<br><br>At the end of this call, I'll also send you an example set of our drawings — you're welcome to review them or share them with your builder for a second opinion.</div>
      <div class="form-grid" style="margin-top:12px;">
        <div class="field"><label>Where did you hear about us?</label><input type="text" data-f="source"></div>
        <div class="field full"><label>Feedback / notes</label><textarea data-f="feedback"></textarea></div>
      </div>
    </div>
  </div>

  <div class="stage">
    <div class="stage-head"><div class="stage-num">✓</div><div class="stage-name">Certainty Close</div></div>
    <div class="stage-body">
      <div class="say">For your project, the investment to include the design development, approval drawings and construction documentation, you would be looking at <b>$X + GST</b>. Please note that this price also includes up to <b>three client revision rounds</b>, unlimited authority-required revisions, and full support through approvals.</div>
      <p class="ask">Does this approach feel like what you're looking for? <span class="jtag">Journey 6 · Engage</span></p>
      <div class="branch">
        <div class="opt"><b>If yes</b>Great. If you feel comfortable with us and the price works for you, we can move ahead. I'll request the proposal now.</div>
        <div class="opt"><b>Soft closers (if they hesitate)</b>Is there anything you'd like to clarify before moving forward? · Our proposals are valid for <b>45 days</b> — would you like me to send it through with no obligation, ready whenever you decide?</div>
      </div>
      <div class="capture"><label>Quoted price &amp; outcome</label><input type="text" data-f="quote"></div>
    </div>
  </div>
</section>

<section id="notes">
  <div class="sec-label">Wrap-up</div>
  <h2 class="sec-title">Call <strong>Notes</strong></h2>
  <div class="sec-rule"></div>
  <div class="capture"><label>Call notes / next step</label><textarea data-f="notes" style="min-height:100px;"></textarea></div>
</section>

<section id="clients">
  <div class="sec-label">Records</div>
  <h2 class="sec-title">Saved <strong>Clients</strong></h2>
  <div class="sec-rule"></div>
  <div class="saved"><div id="savedList"></div></div>
</section>

</div><!-- /main-col -->

<aside class="side-col">
  <div class="side-sticky">
    <div class="price-panel">
      <div class="sec-label">Live Pricing</div>
      <h3 class="journey-title">Price <strong>Estimate</strong></h3>
      <p class="journey-intro">Reads your Briefing selections and updates live. All figures + GST.</p>
      <div class="price-figure">
        <div class="pf-label">Proposal</div>
        <div class="pf-value" id="pfProposal">—</div>
      </div>
      <div class="price-band">
        <div class="pf-label">Estimate range</div>
        <div class="pf-band" id="pfBand">—</div>
      </div>
      <div class="price-alt" id="pfAltWrap" style="display:none;">
        <div class="pf-label">Alterations · 1 level only</div>
        <div class="pf-alt" id="pfAlt">—</div>
      </div>
      <div class="price-breakdown" id="pfBreakdown"></div>
      <div class="price-note" id="pfNote">Select storey, project type and bedrooms to begin.</div>
    </div>
    <div class="journey-panel">
      <div class="sec-label">Qualify &amp; Track</div>
      <h3 class="journey-title">Buyer's <strong>Journey</strong></h3>
      <p class="journey-intro">At the wrap-up, tick each stage the client genuinely reached — only on evidence (something they said), not a hunch. The orange Journey tags in the script show which question informs each stage. Unticked stages = your follow-up list. All six = ready to engage.</p>
      <div class="check-list" id="checkList"></div>
      <div class="progress">
        <div class="progress-bar"><div class="progress-fill" id="progFill"></div></div>
        <div class="progress-txt"><b id="progCount">0</b> of 6 · <span id="progPct">0%</span> ready</div>
      </div>
    </div>
  </div>
</aside>

</div><!-- /layout -->

<div`;
document.getElementById('modalsContainer').innerHTML = `<div class="prop-overlay" id="propOverlay">
  <div class="prop-modal">
    <div class="prop-head">
      <div class="prop-head-left">
        <svg width="22" height="22" viewBox="0 0 191 189" xmlns="http://www.w3.org/2000/svg"><path fill="#F3EAE5" d="M46.6 6.5v29.6c0 1.9 1.1 3.7 2.8 4.5l42.8 23.9c1.9.9 4.1.9 6 0l42.8-23.9c1.7-.8 2.8-2.6 2.8-4.5V6.5c0-4.8-5-7.9-9.3-5.9L98.3 18c-1.9.9-4.1.9-6 0L55.9.6c-4.3-2-9.3 1.1-9.3 5.9"/><path fill="#F3EAE5" d="M46.6 181.2v-29.6c0-1.9 1.1-3.7 2.8-4.5l42.8-23.9c1.9-.9 4.1-.9 6 0l42.8 23.9c1.7.8 2.8 2.6 2.8 4.5v29.6c0 4.8-5 7.9-9.3 5.9L98.3 169.8c-1.9-.9-4.1-.9-6 0l-36.4 17.3c-4.3 2-9.3-1.1-9.3-5.9"/><path fill="#F3EAE5" d="M182.6 45.2h-29.6c-1.9 0-3.7 1.1-4.5 2.8l-23.9 42.8c-.9 1.9-.9 4.1 0 6l23.9 42.8c.8 1.7 2.6 2.8 4.5 2.8h29.6c4.8 0 7.9-5 5.9-9.3l-17.4-36.3c-.9-1.9-.9-4.1 0-6l17.4-36.3c2-4.3-1.1-9.3-5.9-9.3"/><path fill="#EA672F" d="M7.9 45.2h29.6c1.9 0 3.7 1.1 4.5 2.8l23.9 42.8c.9 1.9.9 4.1 0 6l-23.9 42.8c-.8 1.7-2.6 2.8-4.5 2.8H7.9c-4.8 0-7.9-5-5.9-9.3l17.4-36.3c.9-1.9.9-4.1 0-6L2 54.5c-2-4.3 1.1-9.3 5.9-9.3"/></svg>
        <div><span class="brand-x">Xpress</span><span class="brand-d"> Draft</span></div>
        <span class="prop-htitle">Proposal Generator</span>
      </div>
      <button class="prop-close" id="propClose">✕</button>
    </div>

    <div class="prop-body">

      <!-- Config row -->
      <div class="prop-config">
        <div class="prop-config-title">Confirm details before generating</div>
        <div class="prop-cfg-grid">
          <div class="field"><label>Client name</label><input type="text" id="pc_name" placeholder="e.g. Jane Smith"></div>
          <div class="field"><label>Site address</label><input type="text" id="pc_addr" placeholder="12 King St, Suburb NSW 2000"></div>
          <div class="field"><label>Project type</label>
            <select id="pc_type">
              <option value="">— select —</option>
              <option>Renovations</option>
              <option>Renovations + Extensions</option>
              <option>Extensions</option>
              <option>Additions</option>
              <option>New Homes</option>
              <option>Granny Flats</option>
              <option>As-Constructed</option>
            </select>
          </div>
          <div class="field"><label>Quoted price (ex GST)</label><input type="text" id="pc_price" placeholder="e.g. $4,200"></div>
          <div class="field full"><label>Project brief (what they want to build)</label><textarea id="pc_brief" rows="3" placeholder="Paste or summarise the project description here…"></textarea></div>
          <div class="field full"><label>Rep name (signing off)</label><input type="text" id="pc_rep" placeholder="e.g. Alex"></div>
          <div class="field full"><label>Extra context for AI (optional)</label><textarea id="pc_context" rows="2" placeholder="e.g. client is experienced, in a hurry, has a builder lined up, wants kitchen design…"></textarea></div>
        </div>
      </div>

      <div class="prop-status" id="propStatus"></div>

      <button class="prop-generate" id="propGenerate">
        <span id="propGenLabel">Generate Proposal Letter</span>
        <span id="propGenSpinner" style="display:none;"><span class="prop-spinner"></span></span>
      </button>

      <!-- Revision bar -->
      <div class="prop-edit-bar" id="propEditBar" style="display:none;">
        <textarea id="propReviseInput" rows="2" placeholder="e.g. Make it shorter · adjust the tone · emphasise the 45-day validity · add mention of our reviews…"></textarea>
        <button class="btn btn-primary btn-sm" id="propReviseBtn">Revise</button>
      </div>

      <!-- Output -->
      <div class="prop-output" id="propOutput">
        <div class="prop-doc" id="propDoc"></div>
        <div class="prop-actions">
          <button class="btn btn-primary btn-sm" id="propCopy">Copy text</button>
          <button class="btn btn-ghost btn-sm" id="propDownload">Download .txt</button>
          <span class="sign-note">Ready? Hand off to your signing &amp; deposit tool →</span>
        </div>
      </div>

    </div>
  </div>
</div>`;
