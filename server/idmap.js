// idmap.js — keep local records pointing at the right monday item after a board move.
// monday's move_item_to_board can return a different item ID; when it does, every local
// reference to the old ID (saved call forms, pending requests, reminders) is updated.

function run(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function (err) { if (err) reject(err); else resolve(this.changes); });
  });
}
function all(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => { if (err) reject(err); else resolve(rows || []); });
  });
}

async function remapMondayId(db, oldId, newId) {
  oldId = String(oldId || ''); newId = String(newId || '');
  if (!oldId || !newId || oldId === newId) return 0;
  let changed = 0;
  try {
    // Saved call forms keep monday_id inside the JSON "data" column
    const rows = await all(db, 'SELECT id, data FROM clients WHERE data LIKE ?', ['%' + oldId + '%']);
    for (const r of rows) {
      let d; try { d = JSON.parse(r.data || '{}'); } catch (e) { continue; }
      let touched = false;
      if (String(d.monday_id || '') === oldId) { d.monday_id = newId; touched = true; }
      if (d.fields && String(d.fields.monday_id || '') === oldId) { d.fields.monday_id = newId; touched = true; }
      if (touched) { await run(db, 'UPDATE clients SET data = ? WHERE id = ?', [JSON.stringify(d), r.id]); changed++; }
    }
    changed += await run(db, 'UPDATE pending_requests SET monday_id = ? WHERE monday_id = ?', [newId, oldId]).catch(() => 0);
    changed += await run(db, 'UPDATE reminders SET monday_id = ? WHERE monday_id = ?', [newId, oldId]).catch(() => 0);
    console.log('monday ID remapped', oldId, '->', newId, '| local rows updated:', changed);
  } catch (e) {
    console.error('remapMondayId error:', e.message);
  }
  return changed;
}

module.exports = { remapMondayId };
