const { listOrders, updateOrder } = require('../lib/orders');
const { requireAdmin, body } = require('../lib/auth');
const tg = require('../lib/telegram');

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    if (req.method === 'GET') {
      await tg.ensureWebhook().catch(() => {});
      return res.status(200).json({ ok: true, orders: await listOrders() });
    }
    if (req.method === 'POST') {
      const b = body(req);
      const change = {};
      if (b.status !== undefined) change.status = b.status;
      if (b.read !== undefined) change.read = !!b.read;
      if (typeof b.note === 'string') change.note = b.note;
      const order = await updateOrder(b.key, change, 'لوحة التحكم');
      if (change.status !== undefined || change.read !== undefined) await tg.syncOrder(order); // keep the Telegram message in step
      return res.status(200).json({ ok: true, order });
    }
    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error('admin error', e && e.message);
    return res.status(400).json({ ok: false, error: String((e && e.message) || 'error') });
  }
};
