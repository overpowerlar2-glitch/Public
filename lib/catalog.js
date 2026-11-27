const { put, get } = require('@vercel/blob');
const seed = require('./seed.json');

const KEY = 'catalog/catalog.json';
const CATEGORIES = seed.categories;
const CAT_IDS = CATEGORIES.map((c) => c.id);
const KINDS = ['tumbler', 'crock', 'threewick', 'diffuser', 'spray', 'roller', 'trio', 'box'];
const KIND_FOR = { candles: 'tumbler', diffusers: 'diffuser', sprays: 'spray', perfume: 'roller', gifts: 'box' };

const DEFAULT_SETTINGS = {
  shippingFee: 6,
  freeShippingOver: 75,
  announcement: '',
  whatsapp: '',
  promos: {
    NOOMI10: { pct: 10, label: '10% off your first order', active: true },
    COURTYARD15: { pct: 15, min: 120, label: '15% off orders over $120', active: true },
  },
};

const s = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : d);
const slugify = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product';

function titleLines(name) {
  const w = String(name).replace(/\b(candle|reed diffuser|room spray|perfume oil|linen mist)\b/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (w.length <= 1) return [w[0] || 'Noomi'];
  const h = Math.ceil(w.length / 2);
  return [w.slice(0, h).join(' '), w.slice(h).join(' ')];
}

let cache = null;
let cacheAt = 0;

async function load(fresh) {
  if (!fresh && cache && Date.now() - cacheAt < 5000) return cache;
  let data = null;
  try {
    const r = await get(KEY, { access: 'private', useCache: false });
    if (r && r.statusCode === 200 && r.stream) data = JSON.parse(await new Response(r.stream).text());
  } catch (e) {
    if (!(e && (e.name === 'BlobNotFoundError' || /not.?found/i.test(String(e.message))))) throw e;
  }
  if (!data) data = { products: seed.products, settings: DEFAULT_SETTINGS, updatedAt: null };
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  cache = data;
  cacheAt = Date.now();
  return data;
}

async function save(data) {
  data.updatedAt = new Date().toISOString();
  await put(KEY, JSON.stringify(data), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  cache = data;
  cacheAt = Date.now();
  return data;
}

// What shoppers get: hidden products left out, internal fields dropped.
function publicView(data) {
  const promos = {};
  for (const [code, p] of Object.entries(data.settings.promos || {})) {
    if (p.active !== false) promos[code] = { pct: p.pct, min: p.min || undefined, label: p.label };
  }
  return {
    products: data.products.filter((p) => !p.hidden).map(({ hidden, ...p }) => p),
    settings: {
      shippingFee: data.settings.shippingFee,
      freeShippingOver: data.settings.freeShippingOver,
      announcement: data.settings.announcement,
      whatsapp: data.settings.whatsapp,
      promos,
    },
    updatedAt: data.updatedAt,
  };
}

function cleanProduct(input, existing, all) {
  const name = s(input.name, 80);
  if (name.length < 2) throw new Error('اكتب اسم المنتج');
  const price = num(input.price, NaN);
  if (!(price > 0)) throw new Error('السعر لازم يكون أكثر من صفر');
  const compareAt = input.compareAt === '' || input.compareAt == null ? undefined : num(input.compareAt, NaN);
  if (compareAt !== undefined && !(compareAt > price)) throw new Error('السعر قبل الخصم لازم يكون أعلى من السعر');
  const stock = Math.round(num(input.stock, NaN));
  if (!(stock >= 0)) throw new Error('الكمية لازم تكون صفر أو أكثر');
  const category = CAT_IDS.includes(input.category) ? input.category : 'candles';

  let slug = existing ? existing.slug : slugify(name);
  if (!existing) { let k = 2; const base = slug; while (all.some((p) => p.slug === slug)) slug = `${base}-${k++}`; }

  const art = existing && existing.art ? { ...existing.art } : { kind: KIND_FOR[category], tint: '#DCD9CC', body: '#3B332A', label: '#F3EFE4', ink: '#221B16', title: titleLines(name) };
  if (input.art) {
    if (KINDS.includes(input.art.kind)) art.kind = input.art.kind;
    art.body = color(input.art.body, art.body);
    art.tint = color(input.art.tint, art.tint);
  }
  if (!existing || existing.name !== name) art.title = titleLines(name);

  const image = typeof input.image === 'string' && (input.image === '' || /^\/api\/img\?p=images\/[A-Za-z0-9._-]+$/.test(input.image)) ? input.image || undefined : existing && existing.image;
  const short = s(input.short, 140);
  const description = s(input.description, 1500) || short;
  const size = s(input.size, 40);
  const notes = { top: s(input.notes && input.notes.top, 120), heart: s(input.notes && input.notes.heart, 120), base: s(input.notes && input.notes.base, 120) };
  const details = Array.isArray(input.details) ? input.details.map((d) => s(d, 200)).filter(Boolean).slice(0, 12) : existing ? existing.details : [size].filter(Boolean);

  return {
    ...(existing || {}),
    id: existing ? existing.id : `p${Date.now().toString(36)}`,
    slug, name, category, price, compareAt, stock, size, short, description, notes, details, art, image,
    featured: !!input.featured,
    bestSeller: !!input.bestSeller,
    hidden: !!input.hidden,
    isNew: existing ? !!input.isNew : true,
    rating: existing ? existing.rating : 5,
    reviews: existing ? existing.reviews : 0,
    sold: existing ? existing.sold : 0,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  };
}

function cleanSettings(input, current) {
  const promos = {};
  for (const p of Array.isArray(input.promos) ? input.promos.slice(0, 30) : []) {
    const code = s(p.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pct = Math.round(num(p.pct, 0));
    if (!code || pct <= 0 || pct > 90) continue;
    const min = num(p.min, 0) > 0 ? num(p.min, 0) : undefined;
    promos[code] = { pct, min, label: s(p.label, 80) || `${pct}% off${min ? ` orders over $${min}` : ''}`, active: p.active !== false };
  }
  return {
    ...current,
    shippingFee: Math.max(0, num(input.shippingFee, current.shippingFee)),
    freeShippingOver: Math.max(0, num(input.freeShippingOver, current.freeShippingOver)),
    announcement: s(input.announcement, 160),
    whatsapp: s(input.whatsapp, 20).replace(/[^\d]/g, ''),
    promos,
  };
}

// Recompute an order from the catalog so prices cannot be changed in the browser.
function price(order, data) {
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const items = [];
  for (const i of order.items || []) {
    const p = byId.get(i.productId);
    const qty = Math.max(1, Math.min(99, Math.round(num(i.qty, 1))));
    if (!p) { items.push({ name: s(i.name, 120), qty, price: num(i.price), productId: s(i.productId, 40), unknown: true }); continue; }
    items.push({ productId: p.id, name: p.name, qty, price: p.price, short: p.stock < qty });
  }
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const code = s(order.promoCode, 20).toUpperCase();
  const promo = code && data.settings.promos[code] && data.settings.promos[code].active !== false ? data.settings.promos[code] : null;
  const discount = promo && subtotal >= (promo.min || 0) ? Math.round(subtotal * promo.pct) / 100 : 0;
  const after = subtotal - discount;
  const shipping = items.length === 0 || after >= data.settings.freeShippingOver ? 0 : data.settings.shippingFee;
  const total = Math.round((after + shipping) * 100) / 100;
  const changed = Math.abs(total - num(order.total)) > 0.01;
  return { items, subtotal, discount, promoCode: discount ? code : '', shipping, total, priceChanged: changed, clientTotal: num(order.total) };
}

async function takeStock(items) {
  const data = await load(true);
  let touched = false;
  for (const i of items) {
    const p = data.products.find((x) => x.id === i.productId);
    if (!p) continue;
    p.stock = Math.max(0, p.stock - i.qty);
    p.sold = (p.sold || 0) + i.qty;
    touched = true;
  }
  if (touched) await save(data);
}

module.exports = { load, save, publicView, cleanProduct, cleanSettings, price, takeStock, CATEGORIES, KINDS, DEFAULT_SETTINGS };
