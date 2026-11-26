const crypto = require('crypto');
const { listOrders, updateStatus } = require('../lib/orders');

function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized(req)) {
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, orders: await listOrders() });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const order = await updateStatus(body && body.key, body && body.status);
      return res.status(200).json({ ok: true, order });
    }
    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error('admin error', e && e.message);
    return res.status(400).json({ ok: false, error: String((e && e.message) || 'error') });
  }
};
