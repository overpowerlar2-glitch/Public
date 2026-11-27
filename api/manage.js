const crypto = require('crypto');
const { put } = require('@vercel/blob');
const catalog = require('../lib/catalog');
const { requireAdmin, body } = require('../lib/auth');

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    if (req.method === 'GET') {
      const data = await catalog.load(true);
      return res.status(200).json({ ok: true, products: data.products, settings: data.settings, categories: catalog.CATEGORIES, kinds: catalog.KINDS });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const b = body(req);

    if (b.action === 'image') {
      const ext = TYPES[b.type];
      if (!ext || typeof b.data !== 'string') throw new Error('صيغة الصورة لازم تكون JPG أو PNG أو WEBP');
      const buf = Buffer.from(b.data, 'base64');
      if (buf.length > 3 * 1024 * 1024) throw new Error('الصورة كبيرة، لازم تكون أقل من 3 ميغا');
      const name = `images/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      await put(name, buf, { access: 'private', addRandomSuffix: false, contentType: b.type });
      return res.status(200).json({ ok: true, url: `/api/img?p=${name}` });
    }

    const data = await catalog.load(true);
    if (b.action === 'save') {
      const input = b.product || {};
      const idx = data.products.findIndex((p) => p.id === input.id);
      const product = catalog.cleanProduct(input, idx >= 0 ? data.products[idx] : null, data.products);
      if (idx >= 0) data.products[idx] = product; else data.products.unshift(product);
      await catalog.save(data);
      return res.status(200).json({ ok: true, product, products: data.products });
    }
    if (b.action === 'delete') {
      data.products = data.products.filter((p) => p.id !== b.id);
      await catalog.save(data);
      return res.status(200).json({ ok: true, products: data.products });
    }
    if (b.action === 'reorder' && Array.isArray(b.ids)) {
      const pos = new Map(b.ids.map((id, i) => [id, i]));
      data.products.sort((a, c) => (pos.get(a.id) ?? 1e9) - (pos.get(c.id) ?? 1e9));
      await catalog.save(data);
      return res.status(200).json({ ok: true, products: data.products });
    }
    if (b.action === 'settings') {
      data.settings = catalog.cleanSettings(b.settings || {}, data.settings);
      await catalog.save(data);
      return res.status(200).json({ ok: true, settings: data.settings });
    }
    throw new Error('unknown action');
  } catch (e) {
    console.error('manage', e && e.message);
    return res.status(400).json({ ok: false, error: String((e && e.message) || 'error') });
  }
};
