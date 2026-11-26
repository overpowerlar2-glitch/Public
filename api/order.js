const PAY = { cod: 'الدفع نقداً عند الاستلام', 'card-on-delivery': 'بطاقة عند الاستلام', bank: 'تحويل بنكي' };
const money = (n) => '$' + Number(n || 0).toFixed(2).replace(/\.00$/, '');
const s = (v, max = 300) => String(v ?? '').slice(0, max);

function buildText(o) {
  const c = o.customer || {};
  const items = Array.isArray(o.items) ? o.items.slice(0, 50) : [];
  const lines = [
    '🛍️ طلب جديد ' + s(o.id, 40),
    '',
    '👤 الاسم: ' + s(c.name),
    '📞 الرقم: ' + s(c.phone, 40),
    '✉️ الإيميل: ' + s(c.email),
    '📍 العنوان: ' + s(c.address) + '، ' + s(c.city),
  ];
  if (c.notes) lines.push('📝 ملاحظات: ' + s(c.notes, 500));
  lines.push('', '📦 المنتجات:');
  for (const it of items) lines.push('• ' + s(it.qty, 5) + ' × ' + s(it.name, 120) + ' = ' + money(Number(it.price) * Number(it.qty)));
  lines.push('', 'المجموع الفرعي: ' + money(o.subtotal));
  if (Number(o.discount) > 0) lines.push('الخصم' + (o.promoCode ? ' (' + s(o.promoCode, 30) + ')' : '') + ': -' + money(o.discount));
  lines.push('التوصيل: ' + (Number(o.shipping) ? money(o.shipping) : 'مجاني'));
  lines.push('💰 الإجمالي: ' + money(o.total));
  lines.push('💳 الدفع: ' + (PAY[o.payment] || s(o.payment, 40)));
  return lines.join('\n').slice(0, 4000);
}

const valid = (o) => o && o.id && o.customer && Array.isArray(o.items) && o.items.length > 0;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const order = body && body.order;
  if (!valid(order)) return res.status(400).json({ ok: false, error: 'invalid order' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return res.status(500).json({ ok: false, error: 'not configured' });

  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: buildText(order) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      console.error('telegram error', r.status, data.description);
      return res.status(502).json({ ok: false, error: data.description || 'telegram error' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('network', e && e.message);
    return res.status(502).json({ ok: false, error: 'network' });
  }
};
