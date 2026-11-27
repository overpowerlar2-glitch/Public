const catalog = require('../lib/catalog');

module.exports = async (req, res) => {
  try {
    const data = catalog.publicView(await catalog.load());
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30');
    return res.status(200).json({ ok: true, ...data });
  } catch (e) {
    console.error('catalog', e && e.message);
    return res.status(500).json({ ok: false });
  }
};
