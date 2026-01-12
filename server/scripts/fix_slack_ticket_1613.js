const { pool } = require('../database/connection');

async function fix() {
  try {
    const ticketId = 1613;
    // Ensure tags contains Slack and assigned_to is 76
    // Use array operations that work for text[] or json columns depending on schema

    // First, fetch current tags and assigned_to
    const res = await pool.query('SELECT tags, assigned_to FROM tickets WHERE id = $1', [ticketId]);
    if (!res.rows || res.rows.length === 0) {
      console.error('Ticket not found:', ticketId);
      process.exit(1);
    }

    const row = res.rows[0];
    let tags = row.tags;

    // Normalize tags to array
    if (!tags) tags = [];
    if (typeof tags === 'string') {
      // Try JSON parse
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) tags = parsed;
      } catch (e) {
        // Postgres array string like {Slack}
        const m = tags.match(/^\{(.+)\}$/);
        if (m && m[1]) {
          tags = m[1].split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
        } else {
          tags = [String(tags)];
        }
      }
    }

    if (!Array.isArray(tags)) tags = [tags];

    if (!tags.includes('Slack')) tags.push('Slack');

    const assignedTo = row.assigned_to || 76;

    // Update tags and assigned_to
    // Try updating tags as JSON first, fallback to text array literal
    try {
      await pool.query('UPDATE tickets SET tags = $1, assigned_to = $2 WHERE id = $3', [tags, assignedTo, ticketId]);
      console.log('Updated ticket', ticketId, 'tags ->', tags, 'assigned_to ->', assignedTo);
    } catch (e) {
      console.warn('Failed to update tags using parameterized query, trying text[] literal', e.message || e);
      const tagsLiteral = '{' + tags.map(s => '"' + s.replace(/"/g, '""') + '"').join(',') + '}';
      await pool.query(`UPDATE tickets SET tags = $1::text[], assigned_to = $2 WHERE id = $3`, [tagsLiteral, assignedTo, ticketId]);
      console.log('Updated ticket (text[])', ticketId, 'tags ->', tags, 'assigned_to ->', assignedTo);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error fixing ticket:', err);
    process.exit(1);
  }
}

fix();
