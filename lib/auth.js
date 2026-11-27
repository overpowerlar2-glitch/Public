const crypto = require('crypto');

function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (authorized(req)) return true;
  await new Promise((r) => setTimeout(r, 600));
  res.status(401).json({ ok: false, error: 'unauthorized' });
  return false;
}

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

module.exports = { requireAdmin, body };
