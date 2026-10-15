# Xpress Draft Sales Tool: Monday.com Integration Reference

**Audience:** Claude Code (or any developer) about to change the Monday.com workflow.
**Purpose:** Explains everything the Xpress Draft Sales Tool reads from or writes to Monday.com, so you don't break it while you improve the boards.
**Codebase:** `xpressdraft-app` (Node 20 / Express / SQLite). Hosted on Render (`xpressdraft-sales.onrender.com`), deployed from GitHub. Last reviewed 15 Oct 2026. The boards now live in the monday workspace **XPRESSDRAFT PTY_2027** (id 17997898); they were moved, not rebuilt, so every board, group, column and item ID is unchanged.

> **The one rule:** the app finds Monday.com things by **hard-coded board IDs, group IDs and column IDs**, and in some places by **group *title* text**. Renaming, deleting, recreating or duplicating a board, group, column or dropdown label can silently break the app. Every dependency is listed below. If you change one, change the code to match, or tell Luiz first.

---

## 1. System overview

```
             ┌──────────────┐  webhook (status → SENT)   ┌───────────────────────┐
 Calendly ──►│              │◄───────────────────────────┤                       │
 (booking)   │  Sales Tool  │  GraphQL API v2 (2024-10)  │      Monday.com       │
             │  (Render)    ├───────────────────────────►│  Negotiations board   │
 PandaDoc ──►│              │  create / move / update     │  Proposal board       │
 (paid)      │  SQLite on   │                             │  Salesperson board    │
             │  /data disk  │                             │  Free Consult board   │
 Reps' ─────►│              │                             │  Client Logins board  │
 browsers    └──────────────┘                             └───────────────────────┘
```

* **Monday.com is the source of truth** for leads, the pipeline stage, proposals and closed deals.
* The app's SQLite database holds the reps' call forms (`clients`), proposal history, reminders, commission records, users and pricing. **Each client record links to Monday by `monday_id`** (the Monday item ID).
* All Monday code lives in **`server/monday.js`**. Some extra raw GraphQL is in **`server/index.js`**, **`server/pandadoc.js`** and **`server/audit.js`**.
* Auth: `MONDAY_API_KEY` env var (personal API token), header `API-Version: 2024-10`.

**Team (`users.name` / `users.monday_name` must match Monday dropdown labels):** Luiz Braga (admin), Christian Yamada (standard rep), Evan Dowman (leader rep). There's also a "Luiz Costa" user with no Monday items, probably stale.

---

## 2. Boards the app depends on

| Board (name in Monday) | Board ID | Constant | Used for |
|---|---|---|---|
| **26_2 Negotiations** | `18388602724` | `BOARDS.negotiations` | All active leads before a proposal is sent |
| **26_3 Proposal** | `18389820785` | `BOARDS.proposal` | Proposal requested → sent → follow up → started projects (closed). **All commission and sales stats come from here.** |
| Sales Team (salesperson board) | `18390237344` | hard-coded | Lookup of rep → salesperson item ID (for the connect-boards column) |
| **Lead Inbox** | `18435248465` | `server/leadinbox.js` | Every enquiry email lands here; Claude reads it and fills the columns (§11) |
| **Time Sheet** | `18388613071` | `server/clockify.js` | One row per Clockify time entry (§11) |
| **Job Costing** | `18435257917` | `clockify.js`, `engagement.js` | Time entries linked here; CLOCKIFY PROJECT ID written here |
| **Overall Projects** | `18388615760` | `engagement.js` | Created by monday W4; CLOCKIFY PROJECT ID written here |
| **Clients** | `18388617547` | `engagement.js` | CLOCKIFY CLIENT ID written here (client found by email) |

Removed in Oct 2026: the old Free Consultations **board** (now a group on Negotiations) and the "PENDING CLIENT LOGINS" step (board 18417343069 is the REMINDERS board; the app no longer writes to it).

---

## 3. Groups

### 3a. Proposal board (`18389820785`): referenced by **group ID**

| Group | Group ID | Constant | Meaning to the app |
|---|---|---|---|
| NEW REQUESTS | `group_mkxz6tw3` | `PROPOSAL_GROUPS.new_requests` | Rep clicked "Proposal requested" |
| SENT PROPOSALS | `group_mkxzcgkr` | `PROPOSAL_GROUPS.sent_proposals` | Proposal generated in the app (PandaDoc) |
| FOLLOW UP | `group_mky78qcz` | `PROPOSAL_GROUPS.follow_up` | Proposal sent, chasing. Shown to reps as "PROPOSAL FOLLOW UP" |
| STARTED PROJECTS | `group_mky4ey72` | `PROPOSAL_GROUPS.started_projects` | **= closed deal.** Commission is calculated from this group |

⚠️ **Counting for stats and commission:** "Proposals sent" = items in SENT PROPOSALS + FOLLOW UP + STARTED PROJECTS. "Closed deals" = STARTED PROJECTS. If you add a group (e.g. LOST or ON HOLD) or move items out of these three, they **disappear from the rep stats**. Deleting a group and recreating it gives it a new ID, which breaks everything.

### 3b. Negotiations board (`18388602724`): referenced by **group TITLE** (case-insensitive *contains* match)

The app calls `getGroupId(board, 'TITLE')`, which finds the first group whose title **contains** that text.

| Title the code searches for | Used by |
|---|---|
| **FREE CONSULTATIONS** (by ID `group_mm83s336`, `NEG_GROUPS.free_consultations`) | "Free consultation" button and stage move |
| `QUALIFIED LEADS` (fallback `QUALIFIED`) | New lead created from the app (`createLeadItem`) |
| `DISCOVERY CALLS` | Calendly bookings create items here |
| `FOLLOW UP EMAILS / CALLS` | "Follow up" action |
| `SEQUENCE CALL` | Stage move |
| `WAITING FOR CLIENTS` | Stage move |
| `HELP REQUIRED` | "Help required" button |
| `LOST` | Stage move / `moveToLost` |
| `CLOSED DEALS` | `moveToClosedDeals` (currently not called by any route) |
| `PENDING CLIENT LOGINS` | On board `18417343069` |

⚠️ **Renaming any of these groups breaks the matching action.** Because it's a "contains" match, a new group like "LOST – ARCHIVE" placed *above* "LOST" would capture moves meant for LOST. The front end also has colour/label mapping keyed on these exact titles (`STAGE_LABELS` in `public/js/app.js`), and it hides the `LOST` group from reps.

---

## 4. Columns

The **same column IDs exist on both Negotiations and Proposal boards** (items keep them when moved between boards). Don't delete or recreate them; the IDs would change.

| Purpose | Column ID | Type | Board(s) | Read / Write |
|---|---|---|---|---|
| Phone | `phone_mky18hs6` | phone (country AU) | both | R/W |
| Email | `email_mky1wg4h` | email | both | R/W |
| Site address | `text_mky7qn0k` | text | both | R/W |
| Client enquiry | `long_text_mkxzds8g` | long text | both | R |
| **Rep notes** | `long_text_mkxzbgfq` | long text | both | **W**: overwritten by the app (see §6.6) |
| Status | `color_mkxzy23p` | status | both | R/W. Labels used: `DC - CALENDLY`, `SENT`, **`ERROR - SALES`** |
| Source | `color_mky1aas7` | status | both | R/W. Label used: `WEBSITE ENQUIRIES` |
| Arrival date | `date_mm135v04` | date | both | R/W |
| Files received | `file_mkxzg1me` | file | both | R/W (reps upload files here) |
| Salesperson (connect) | `board_relation_mky4h701` | connect boards → Salesperson board | Negotiations | W (Calendly) |
| **Rep (Negotiations)** | `dropdown_mm5cb995` | dropdown | Negotiations | R/W. **Filters which leads each rep sees** |
| **Rep (Proposal)** | `dropdown_mm5c51r2` | dropdown | Proposal | R/W. **Drives all commission and stats** |
| Proposal amount | `numeric_mky1cmcv` | number | Proposal | R (sale value for commission) |
| Proposal request date | `date_mky1dh5s` | date | Proposal | W on "Proposal requested" |
| Sent on date | `date_mky1pazj` | date | Proposal | W when proposal generated |
| **Closed date** | `date_mm3gx943` | date | Proposal | W when PandaDoc payment arrives. **Decides which commission week a deal falls in** |
| Job number | `text_mky9p0t3` | text | Proposal | R (PandaDoc matching) |
| Site address (alt) | `text_mky7ram8` | text | Proposal | R (PandaDoc matching) |
| START PROJECT button | `button_mky13qm` | button | Proposal | W (`clickStartProject`, currently unused) |
| Buttons on Negotiations | `button_mkxz4xs4` (free consult), `button_mkxz6sxp` (proposal), `button_mkxz9mve` (help) | button | Negotiations | Defined in `COLS`. The app moves items itself instead of clicking these |
| Pipeline numbers (legacy) | `numbers_mm5cr6w3` | number | Proposal | R in admin Pipeline tab only |

### Rep dropdown labels (critical)

Current labels: `LUIZ BRAGA`, `CHRISTIAN YAMADA`, `EVAN DOWMAN` (all caps). The app writes `repName.toUpperCase()` and matches by **normalising** (lower case, letters only, "contains" either way). So:

* An item with **two reps** (`CHRISTIAN YAMADA, LUIZ BRAGA`) counts **fully for both**.
* Renaming a label (e.g. "EVAN D.") breaks that rep's leads list and commission until `users.monday_name` is updated in the app (Admin → Team).
* An item with **no rep** is invisible to every rep and counts for nobody.

---

## 5. Webhooks & external triggers into Monday

| Source | Endpoint in app | What it does in Monday |
|---|---|---|
| **Monday webhook 610674462** (board `18389820785`, event `change_column_value`, → `https://xpressdraft-sales.onrender.com/api/monday-webhook`) | `POST /api/monday-webhook` | When Proposal-board **Status** (`color_mkxzy23p`) becomes `SENT`: marks the local pending request as sent and tells reps' browsers to refresh. **Moving the item to FOLLOW UP is done by a Monday automation, not by the app.** Also queues Clockify set-up when DEAL CLOSED is set or status becomes PROJECT STARTED. The Admin "Register Webhook" button now only checks it and **never creates a duplicate**. |
| **Lead Inbox webhook** (monday, item created on `18435248465`) | `POST /api/lead-inbox-webhook` | Claude reads the enquiry and fills the columns (§11) |
| **Clockify webhooks** (new / updated / timer stopped / deleted) | `POST /api/clockify-webhook` (`?event=deleted` for deletes) | Upserts the Time Sheet row (§11) |
| **Calendly** (`invitee.created`) | `POST /api/calendly-webhook` | Creates an item in Negotiations → `DISCOVERY CALLS` with status `DC - CALENDLY`, source `WEBSITE ENQUIRIES`, arrival date, notes, phone/email, salesperson connect and rep dropdown. Rep mapping is hard-coded: `here2help@…` → Christian Yamada, `evan.dowman@…` → Evan Dowman (Luiz isn't mapped). |
| **PandaDoc** paid / payment completed | `POST /webhooks/pandadoc`, `/webhooks/pandadoc/payment` | Moves the item to Proposal → **STARTED PROJECTS** and sets **Closed date = today**. If the proposal wasn't made in the app, it **finds the item by client name** (plus job number or address) among the first 100 Proposal-board items. It then queues the Clockify client/project set-up (§11). (The old "PENDING CLIENT LOGINS" step was removed.) |

⚠️ The Monday webhook URL defaults to `https://xpressdraft-commission.onrender.com` if `RENDER_EXTERNAL_URL` is unset. Check that it points at the live service.

---

## 6. Every flow that writes to Monday

### 6.1 Rep creates a lead in the app
`POST /api/leads/create` → `create_item` on Negotiations → group `QUALIFIED LEADS`, with phone, email, address and rep dropdown.

### 6.2 Rep pipeline buttons (`POST /api/leads/:mondayId/action`)
| Action | Monday effect |
|---|---|
| `free_consultation` | `move_item_to_group` → Negotiations **FREE CONSULTATIONS** (`group_mm83s336`) |
| `proposal_requested` | `move_item_to_board` → Proposal / NEW REQUESTS, sets `date_mky1dh5s`; adds a local `pending_requests` row |
| `help_required` | Move to Negotiations group "HELP REQUIRED" |
| `follow_up` | Move to Negotiations group "FOLLOW UP EMAILS / CALLS" |
| `move_stage` | Checks which board the item is on, then moves it to a Negotiations group by title or to a Proposal group by ID (map in `index.js` around line 1740) |
| `notes` (optional) | Overwrites the Rep notes column |

### 6.3 Proposal generated (`POST /api/proposal`)
1. PandaDoc document created.
2. If the client has no `monday_id`, the app **searches Negotiations by exact item name**.
3. Sets Negotiations rep dropdown → `move_item_to_board` to Proposal / **SENT PROPOSALS** → sets **Sent on** = today → sets Proposal rep dropdown.
4. On failure it sets Status = **`ERROR - SALES`** on the item.

### 6.4 Payment received (PandaDoc webhook)
See §5: STARTED PROJECTS + Closed date. **This is what makes commission count.**

### 6.5 Lead details / files
* `PATCH /api/leads/:id/details` → address, phone, email, source, status, written to **whichever board the item is on**. On Proposals the address column is `text_mky7ram8` (Negotiations: `text_mky7qn0k`); Proposals has no ARRIVAL column.
* `POST /api/leads/:id/files` → `add_file_to_column` on `file_mkxzg1me` (via `https://api.monday.com/v2/file`).
* Files are downloaded from Monday's asset `public_url` and cached on the server at `/data/monday_files/<itemId>/`.

### 6.6 Rep notes mirror (data-loss safeguard)
Every time a rep saves a call form, `POST /api/clients` **overwrites** the Rep notes column (`long_text_mkxzbgfq`) with a summary (brief, notes, address, type, price). The `updateNotes()` helper looks up which board the item is on first. ⚠️ Anything typed manually into that column in Monday will be **overwritten** the next time the rep saves.

### 6.7 Contamination guard: `ERROR - SALES`
`POST /api/clients` refuses to overwrite a saved client if the incoming `monday_id` differs from the stored one. It then sets Status = **`ERROR - SALES`** on the incoming item. This came from real incidents where one client's data overwrote another's. **Keep the `ERROR - SALES` status label.** Luiz's rule: **never delete Monday items on errors; flag them.**

---

## 7. Every flow that reads from Monday

| Feature | Query |
|---|---|
| Rep's lead list (`GET /api/leads`), **polled every 15 s while the leads panel is open** | Negotiations: all groups, first **100** items per group, filtered by rep dropdown `dropdown_mm5cb995`. Proposal: SENT + FOLLOW UP groups, first 100, filtered by `dropdown_mm5c51r2`. Plus the Salesperson board lookup. |
| Rep stats and commission (`getRepStatsFromMonday`, `getWeeklyCommission`) | Proposal board, SENT + FOLLOW UP + STARTED, first **500** per group. Uses amount, closed date, sent date, request date. Weeks run **Wednesday–Tuesday, Brisbane time**. |
| Admin Pipeline tab | Negotiations leads per rep + Proposal SENT/FOLLOW UP (first 200) |
| Proposal Audit page (`/admin/proposal-audit`, `server/audit.js`) | **All** groups on the Proposal board, paginated with a cursor. Read-only. |
| PandaDoc manual-proposal matching | First **100** Proposal-board items only |
| `clickStartProject` (unused) | First 200 per group |

⚠️ **Item limits:** once a group passes 100 items (leads) or 500 (stats), older items silently drop out. Archiving old items in Monday helps. So does adding cursor pagination like `audit.js` does.

**Read cache:** `monday.js → query()` caches identical **read** queries for **60 seconds** (any mutation clears the cache). Changes made directly in Monday can take up to 60 s to appear in the app. This was added because the admin tabs were making dozens of identical full-board calls.

**API load:** each rep with the leads panel open makes about 3 Monday reads every 15 s. Watch Monday's complexity and rate limits if you add more polling or automations.

---

## 8. Commission rules that depend on Monday data

* Sale value = `numeric_mky1cmcv` on items in STARTED PROJECTS.
* Commission week = from `date_mm3gx943` (Closed date), Wed→Tue. **A deal with no Closed date is not counted for any week.**
* Tiers (flat rate on the whole weekly total, not progressive):
  * Leader: ≤ $8K 3% · ≤ $15K 4% · ≤ $25K 5% · > $25K 6%
  * Standard: ≤ $15K 2% · ≤ $25K 3% · > $25K 4%
  * Leader override: +2% of sub-reps' closed value.
* Rep start date (Admin → Team) is the earliest date that counts.

---

## 9. Known issues / open decisions (as of 13 Oct 2026)

1. **Proposal counts:** undated items (no Sent or Requested date) are counted in **every** date range. Shared-rep items count fully for both reps. Lost proposals drop out, which inflates conversion. The Commission and Pipeline tabs count differently. **Luiz still needs to decide** whether shared deals split credit and whether lost proposals count as sent. Use `/admin/proposal-audit` to inspect.
2. ~~`updateLeadDetails` always targets the Negotiations board~~ **Fixed 15 Oct 2026.**
3. ~~Local records not updated after `move_item_to_board` returns a new ID~~ **Fixed 15 Oct 2026** (`server/idmap.js` updates saved calls, pending requests and reminders).
4. PandaDoc fallback name-matching only scans the first 100 Proposal items.
5. ~~Calendly rep map missing Luiz~~ **Fixed** (`luiz.braga@` and `info@` → Luiz Braga; confirm which email his Calendly uses).
6. FOLLOW UP move after status `SENT` depends on a **Monday automation**. If you rebuild the automations, keep this one, or have the webhook do the move.
7. A separate app, the **Xpress Draft Plan Review Portal** (Render + Supabase + Monday.com + Stripe + R2), also integrates with Monday and is **not covered here**. The `PENDING CLIENT LOGINS` board is likely shared with it. Review that codebase before changing those boards.

---

## 10. Safe-change checklist for Monday workflow changes

Before you rename, delete, merge or re-order anything in Monday:

- [ ] Search the code for the board/group/column ID **and** the group title (`grep -rn "<id or title>" server public`).
- [ ] **Don't delete and recreate** groups or columns; IDs change. Rename only if the code doesn't match on that title.
- [ ] Keep the status labels `SENT`, `ERROR - SALES` and `DC - CALENDLY`, the source label `WEBSITE ENQUIRIES`, and the rep dropdown labels.
- [ ] Keep closed deals in **STARTED PROJECTS** with a **Closed date** and an **amount**, or commission breaks.
- [ ] Keep both rep dropdown columns filled. If an item has no rep, nobody sees it and nobody gets credit.
- [ ] Never add automations that **delete** items. Flag instead.
- [ ] If you change a webhook target or event, re-register it (Admin → Integrations) and check the logs on Render.
- [ ] After changes, check: a rep's **My Leads** list, Admin → **Commission** with a custom range, `/admin/proposal-audit`, generating a test proposal (item moves to SENT PROPOSALS with Sent date), and a test Calendly booking (item lands in DISCOVERY CALLS).

### Where to change things in code
| Change | File / place |
|---|---|
| Board IDs, Proposal group IDs, column IDs | `server/monday.js` → `BOARDS`, `PROPOSAL_GROUPS`, `COLS` (some IDs are also **hard-coded inline**; grep for them) |
| Negotiations stage titles | `server/index.js` → `negotiationsMap` (~line 1740), `server/monday.js` → `getGroupId(...)` calls, `public/js/app.js` → `STAGE_LABELS` |
| Calendly rep mapping | `server/index.js` → `CALENDLY_REP_MAP` |
| Commission tiers | `server/index.js` → `calcCommission`; `views/admin.html` and `views/commission.html` (client-side copies) |
| Stats counting | `server/monday.js` → `getRepStatsFromMonday`, `getWeeklyCommission` |

---

## 11. Automations added 15 Oct 2026 (replacing Make.com)

All three run inside the Sales system, keep their own state in SQLite (`/data/app.db`), and show their health in **Admin → Integrations → Automations → Check status**.

### Clockify → Time Sheet (`server/clockify.js`)
* Clockify webhooks → `POST /api/clockify-webhook`. Each request must carry the webhook's `clockify-signature` token; the tokens live in `CLOCKIFY_WEBHOOK_SECRETS` (comma-separated). Wrong or missing token → 401.
* One Time Sheet row per Clockify entry, keyed on the entry ID (table `clockify_entries`, plus `Clockify ID: …` in Notes). Repeated events change nothing; edits update the same row.
* Columns: T.M `text_mkxzy46w`, Date `date_mkxzkghy` (Brisbane date), Start `date_mkya3d39` / End `date_mkya4e12` (UTC, as monday stores them), Notes `long_text_mkxzxz9`, JOB NUMBER `text_mm83m3` (project name if it looks like ABC123, else first ABC123 in the description), HOURS `numeric_mm83vgme`, COST `numeric_mm83xsyn` (Clockify cost rate × hours; rate taken from the entry, else the user's workspace cost rate; **rates are never written to monday**), ENTRY TYPE `color_mm83wfr0` (JOB / BREAK / OVERHEAD / CHECK JOB), STAGE TAG `text_mm835g41`.
* Job Costing link (`board_relation_mm83yqmm`): by Clockify project ID (Job Costing `text_mm85rb64`, then Overall Projects `text_mm85hfk6`), else JOB NUMBER + CLIENT (Clockify client name, or a client named in the description). Several clients and none named → CHECK JOB, not linked. No Job Costing item → creates `<JOB> - <Client>` with JOB STATUS = CHECK.
* Rows Make created earlier are **adopted** (matched on user + start time to the minute), not duplicated.
* Deleted entries: the row is **archived** (never deleted) and unlinked.
* Running timers are ignored until stopped. Every 6 h the last 48 h are re-checked (heals missed webhooks). Manual resync: `POST /api/admin/clockify/resync {from, to}`.

### Clockify set-up on engagement (`server/engagement.js`)
* Triggers: PandaDoc payment, webhook 610674462 (DEAL CLOSED / PROJECT STARTED), and a watcher that checks STARTED PROJECTS every 2 min. On its first run the watcher only records the items already there, so **old jobs are never touched**.
* About 60 s later: finds the Overall Projects item W4 made (SOURCE PROPOSAL ID `text_mm83tq9f`), retrying for about 20 min, then emails Luiz (`ALERT_EMAIL`, default info@).
* Skips if CLOCKIFY PROJECT ID is already filled (never a second project).
* Client: Clients item found by email → reuses its CLOCKIFY CLIENT ID `text_mm854b1s`, else exact-name match in Clockify, else creates; stores the ID back.
* Project: named **exactly** the job number (`text_mky9p0t3`, else tag `tag_mky11he9`), under that client, billable, public; no tasks. No job number → nothing created, Luiz emailed.
* Writes CLOCKIFY PROJECT ID to Overall Projects `text_mm85hfk6` and Job Costing `text_mm85rb64` (matched on `text_mm83cvva`).

### Lead Inbox read by Claude (`server/leadinbox.js`)
* monday webhook (item created on `18435248465`) → `POST /api/lead-inbox-webhook`.
* Reads Original Email `long_text_mm8356wc`, or the item's first update (email-to-board), waiting up to ~1 min for it to arrive.
* Claude (`claude-sonnet-4-6`) returns only what the email states. The app writes Email, Phone (AU format), Site Address, Enquiry summary, Source, Job Type, State, Date Enquired; status labels are written only if they already exist on the board. Emails from calls@ → Source CALLS / AI CALLS.
* AI READ `color_mm837b7n` = DONE / FAILED. Looks like spam → INBOX STATUS = NEEDS REVIEW (never deleted). REP is never touched. Moving QUALIFIED leads to Negotiations is monday workflow W1.
* Re-run one item: `POST /api/admin/lead-inbox/:itemId/reprocess`.

### Environment variables used
`CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, `CLOCKIFY_WEBHOOK_SECRETS`, `CLOCKIFY_API_BASE` (optional), `ALERT_EMAIL` (optional), `LEAD_INBOX_MODEL` (optional), `MONDAY_API_KEY`, `CALENDLY_TOKEN`, `PANDADOC_API_KEY`, `STRIPE_SECRET_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `EMAIL_PASSWORD`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RENDER_EXTERNAL_URL`, `NODE_ENV`, `PORT`.
