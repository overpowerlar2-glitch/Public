const { saveOrder, setTelegramMessage } = require('../lib/orders');
const tg = require('../lib/telegram');

const valid = (o) => o && o.id && o.customer && Array.isArray(o.items) && o.items.length > 0;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const order = body && body.order;
  if (!valid(order)) return res.status(400).json({ ok: false, error: 'invalid order' });

  let record = null;
  try {
    record = await saveOrder(order);
  } catch (e) {
    console.error('save failed', e && e.message);
  }

  // The message is always built on the server from the saved order, in one format.
  let messageId = null;
  if (record) {
    messageId = await tg.sendOrder(record);
    if (messageId) await setTelegramMessage(record.key, messageId).catch((e) => console.error('save msg id', e && e.message));
    await tg.ensureWebhook().catch(() => {});
  }
  const ok = !!record || !!messageId;
  return res.status(ok ? 200 : 502).json({ ok, saved: !!record, telegram: !!messageId });
};
