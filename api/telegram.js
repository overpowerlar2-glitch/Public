const crypto = require('crypto');
const { getOrder, updateOrder, keyOf } = require('../lib/orders');
const tg = require('../lib/telegram');

const ACTIONS = {
  r: (o) => ({ read: !o.read }),
  c: () => ({ status: 'confirmed' }),
  p: () => ({ status: 'pending' }),
  s: () => ({ status: 'shipped' }),
  d: () => ({ status: 'delivered' }),
  x: () => ({ status: 'cancelled' }),
};
const TOAST = { confirmed: 'تم تثبيت الطلب ✅', pending: 'رجع الطلب بانتظار التثبيت', shipped: 'الطلب بالطريق 🚚', delivered: 'تم التوصيل 📦', cancelled: 'انلغى الطلب ❌' };

function sameSecret(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(tg.webhookSecret()).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !sameSecret(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).json({ ok: false });
  }
  const q = req.body && req.body.callback_query;
  if (!q) return res.status(200).json({ ok: true });

  const answer = (text) => tg.call('answerCallbackQuery', { callback_query_id: q.id, text });
  // Only the store's own chat may change orders.
  if (String(q.message && q.message.chat && q.message.chat.id) !== tg.CHAT()) {
    await answer('غير مسموح');
    return res.status(200).json({ ok: true });
  }

  try {
    const [action, short] = String(q.data || '').split(':');
    if (!ACTIONS[action]) throw new Error('bad action');
    const key = keyOf(short);
    const current = await getOrder(key);
    if (!current) throw new Error('not found');
    const change = ACTIONS[action](current);
    const by = [q.from && q.from.first_name, q.from && q.from.last_name].filter(Boolean).join(' ') || 'تلكرام';
    const updated = await updateOrder(key, change, by);
    if (!updated.tgMessageId && q.message) updated.tgMessageId = q.message.message_id;
    await tg.syncOrder(updated);
    await answer(change.status ? TOAST[change.status] : updated.read ? 'انقرأ الطلب 👁' : 'رجع غير مقروء');
  } catch (e) {
    console.error('callback', e && e.message);
    await answer('ما كدرت أحدث الطلب، جرب مرة ثانية');
  }
  return res.status(200).json({ ok: true });
};
