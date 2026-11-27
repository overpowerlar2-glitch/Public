const { put, list, get } = require('@vercel/blob');

const PREFIX = 'orders/';
const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const s = (v, max = 300) => String(v ?? '').slice(0, max);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Keep only the fields we expect, so a crafted request cannot store anything else.
function clean(o) {
  const c = o.customer || {};
  return {
    id: s(o.id, 40),
    customer: {
      name: s(c.name, 120),
      email: s(c.email, 160),
      phone: s(c.phone, 40),
      address: s(c.address, 300),
      city: s(c.city, 80),
      notes: s(c.notes, 500),
    },
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 50).map((i) => ({
      name: s(i.name, 120),
      qty: Math.max(0, Math.min(999, Math.round(n(i.qty)))),
      price: n(i.price),
    })),
    subtotal: n(o.subtotal),
    discount: n(o.discount),
    promoCode: s(o.promoCode, 30),
    shipping: n(o.shipping),
    total: n(o.total),
    payment: s(o.payment, 40),
  };
}

// The short id is what fits in a Telegram button (64 bytes max): "<timestamp>-<order id>".
const shortOf = (key) => key.slice(PREFIX.length, -'.json'.length);
const keyOf = (short) => {
  if (typeof short !== 'string' || !/^\d{10,16}-[A-Za-z0-9-]{1,40}$/.test(short)) throw new Error('bad key');
  return `${PREFIX}${short}.json`;
};
const checkKey = (key) => {
  if (typeof key !== 'string' || !key.startsWith(PREFIX) || !key.endsWith('.json')) throw new Error('bad key');
  return keyOf(shortOf(key));
};

async function readJson(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function write(record) {
  await put(record.key, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return record;
}

async function saveOrder(raw) {
  const order = clean(raw);
  const safeId = order.id.replace(/[^A-Za-z0-9-]/g, '') || 'order';
  const key = `${PREFIX}${Date.now()}-${safeId}.json`;
  return write({ ...order, status: 'pending', read: false, receivedAt: new Date().toISOString(), key, history: [] });
}

async function getOrder(key) {
  return readJson(checkKey(key));
}

async function listOrders(max = 1000) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < max);

  const out = [];
  for (let i = 0; i < blobs.length; i += 20) {
    const part = await Promise.all(blobs.slice(i, i + 20).map((b) => readJson(b.pathname).catch(() => null)));
    out.push(...part.filter(Boolean));
  }
  return out.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}

// change: { status?, read? }; by: who did it ("لوحة التحكم" or a Telegram name)
async function updateOrder(key, change, by) {
  const record = await getOrder(key);
  if (!record) throw new Error('not found');
  const now = new Date().toISOString();
  if (change.status !== undefined) {
    if (!STATUSES.includes(change.status)) throw new Error('bad status');
    if (change.status !== record.status) {
      record.status = change.status;
      record.history = [...(record.history || []), { status: change.status, by: s(by, 60), at: now }].slice(-30);
      if (change.status === 'confirmed') { record.confirmedBy = s(by, 60); record.confirmedAt = now; }
    }
    if (change.status !== 'pending') record.read = true;
  }
  if (change.note !== undefined) {
    record.note = s(change.note, 500);
    record.noteBy = s(by, 60);
    record.noteAt = now;
  }
  if (change.read !== undefined) {
    record.read = !!change.read;
    record.readAt = record.read ? now : null;
    record.readBy = record.read ? s(by, 60) : null;
  }
  record.updatedAt = now;
  return write(record);
}

async function setTelegramMessage(key, messageId) {
  const record = await getOrder(key);
  if (!record) return null;
  record.tgMessageId = messageId;
  return write(record);
}

module.exports = { saveOrder, getOrder, listOrders, updateOrder, setTelegramMessage, shortOf, keyOf, STATUSES };
