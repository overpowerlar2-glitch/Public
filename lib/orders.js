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

async function readJson(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function saveOrder(raw) {
  const order = clean(raw);
  const receivedAt = new Date().toISOString();
  const safeId = order.id.replace(/[^A-Za-z0-9-]/g, '') || 'order';
  const pathname = `${PREFIX}${Date.now()}-${safeId}.json`;
  const record = { ...order, status: 'pending', receivedAt, key: pathname };
  await put(pathname, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
  return record;
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
  const batch = 20;
  for (let i = 0; i < blobs.length; i += batch) {
    const part = await Promise.all(
      blobs.slice(i, i + batch).map((b) => readJson(b.pathname).catch(() => null))
    );
    out.push(...part.filter(Boolean));
  }
  return out.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}

async function updateStatus(key, status) {
  if (!STATUSES.includes(status)) throw new Error('bad status');
  if (typeof key !== 'string' || !key.startsWith(PREFIX) || key.includes('..')) throw new Error('bad key');
  const record = await readJson(key);
  if (!record) throw new Error('not found');
  record.status = status;
  record.updatedAt = new Date().toISOString();
  await put(key, JSON.stringify(record), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return record;
}

module.exports = { saveOrder, listOrders, updateStatus, STATUSES };
