const { get } = require('@vercel/blob');

module.exports = async (req, res) => {
  const p = String((req.query && req.query.p) || '');
  if (!/^images\/[A-Za-z0-9._-]+$/.test(p)) return res.status(400).end();
  try {
    const r = await get(p, { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) return res.status(404).end();
    res.setHeader('Content-Type', r.blob.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(await new Response(r.stream).arrayBuffer()));
  } catch (e) {
    return res.status(404).end();
  }
};
