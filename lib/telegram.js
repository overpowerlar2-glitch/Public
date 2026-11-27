const crypto = require('crypto');
const { shortOf } = require('./orders');

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = () => String(process.env.TELEGRAM_CHAT_ID || '');
const SITE = () => (process.env.SITE_URL || 'https://noomi-iq.vercel.app').replace(/\/$/, '');

const PAY = { cod: 'نقداً عند الاستلام', 'card-on-delivery': 'بطاقة عند الاستلام', bank: 'تحويل بنكي' };
const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const when = (iso) => new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const LINE = '━━━━━━━━━━━━━━';

// Header for each state, so a glance at the chat tells you where every order stands.
function header(o) {
  if (o.status === 'cancelled') return '❌ <b>طلب ملغي</b>';
  if (o.status === 'delivered') return '📦 <b>تم التوصيل</b>';
  if (o.status === 'shipped') return '🚚 <b>الطلب بالطريق</b>';
  if (o.status === 'confirmed') return '✅ <b>تم تثبيت الطلب</b>';
  return o.read ? '👁 <b>طلب مقروء، بانتظار التثبيت</b>' : '🆕 <b>طلب جديد</b>';
}

// The one template every order message uses.
function render(o) {
  const c = o.customer || {};
  const done = o.status !== 'pending'; // confirmed or later: the order body is struck through
  const st = (line) => (done ? `<s>${line}</s>` : line);

  const body = [
    '👤 <b>الزبون</b>',
    st(`الاسم: ${esc(c.name)}`),
    st(`الهاتف: <code>${esc(c.phone)}</code>`),
    c.email ? st(`الإيميل: ${esc(c.email)}`) : null,
    st(`📍 ${esc(c.city)}، ${esc(c.address)}`),
    c.notes ? st(`📝 ${esc(c.notes)}`) : null,
    LINE,
    '🛒 <b>المنتجات</b>',
    ...(o.items || []).map((i) => st(`▫️ ${esc(i.name)} × ${esc(i.qty)}  —  ${money(i.price * i.qty)}`)),
    LINE,
    `المجموع: ${money(o.subtotal)}`,
    o.discount > 0 ? `الخصم${o.promoCode ? ` (${esc(o.promoCode)})` : ''}: -${money(o.discount)}` : null,
    `التوصيل: ${o.shipping ? money(o.shipping) : 'مجاني'}`,
    `💰 <b>الإجمالي: ${money(o.total)}</b>`,
    `💳 ${esc(PAY[o.payment] || o.payment)}`,
    o.priceChanged ? `⚠️ المبلغ اللي ظهر للزبون كان ${money(o.clientTotal)}، والمعتمد سعر المتجر أعلاه` : null,
  ].filter((x) => x !== null);

  const foot = [`🕒 ${esc(when(o.receivedAt))}`];
  if (o.status === 'confirmed' && o.confirmedBy) foot.push(`✅ ثبّته ${esc(o.confirmedBy)} · ${esc(when(o.confirmedAt))}`);
  else if (o.read && o.status === 'pending' && o.readBy) foot.push(`👁 قرأه ${esc(o.readBy)}`);

  return [`${header(o)}  ·  <code>${esc(o.id)}</code>`, LINE, ...body, LINE, ...foot].join('\n').slice(0, 4000);
}

function keyboard(o) {
  const id = shortOf(o.key);
  const b = (text, action) => ({ text, callback_data: `${action}:${id}` });
  let rows;
  if (o.status === 'pending') {
    rows = [
      [o.read ? b('↩️ غير مقروء', 'r') : b('👁 تمت القراءة', 'r'), b('✅ تثبيت الطلب', 'c')],
      [b('❌ إلغاء الطلب', 'x')],
    ];
  } else if (o.status === 'confirmed') {
    rows = [[b('🚚 بالطريق', 's'), b('↩️ إلغاء التثبيت', 'p')]];
  } else if (o.status === 'shipped') {
    rows = [[b('📦 تم التوصيل', 'd')]];
  } else if (o.status === 'cancelled') {
    rows = [[b('↩️ استرجاع الطلب', 'p')]];
  } else {
    rows = [];
  }
  rows.push([{ text: '📊 لوحة التحكم', url: `${SITE()}/dashboard` }]);
  return { inline_keyboard: rows };
}

async function call(method, payload) {
  if (!TOKEN()) return { ok: false, description: 'not configured' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok && !/not modified/.test(data.description || '')) console.error('telegram', method, data.description);
    return data;
  } catch (e) {
    console.error('telegram network', method, e && e.message);
    return { ok: false };
  }
}

async function sendOrder(o) {
  const r = await call('sendMessage', {
    chat_id: CHAT(),
    text: render(o),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard(o),
  });
  return r.ok ? r.result.message_id : null;
}

async function syncOrder(o) {
  if (!o.tgMessageId) return;
  await call('editMessageText', {
    chat_id: CHAT(),
    message_id: o.tgMessageId,
    text: render(o),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard(o),
  });
}

const webhookSecret = () => crypto.createHash('sha256').update('noomi-webhook:' + TOKEN()).digest('hex').slice(0, 48);

// Points the bot's button presses at /api/telegram. Runs at most once per server instance.
let webhookChecked = false;
async function ensureWebhook() {
  if (webhookChecked || !TOKEN()) return;
  const url = `${SITE()}/api/telegram`;
  const info = await call('getWebhookInfo', {});
  if (info.ok && info.result && info.result.url === url) { webhookChecked = true; return; }
  const r = await call('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['callback_query'], drop_pending_updates: true });
  if (r.ok) webhookChecked = true;
}

module.exports = { render, keyboard, call, sendOrder, syncOrder, ensureWebhook, webhookSecret, CHAT };
