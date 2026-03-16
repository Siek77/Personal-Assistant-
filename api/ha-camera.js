// Proxies HA camera snapshots server-side to avoid CORS + expose auth token in URLs
// POST { haUrl, haToken, entityId } → JPEG image

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { haUrl, haToken, entityId } = req.body || {}
  if (!haUrl || !haToken || !entityId) return res.status(400).json({ error: 'haUrl, haToken, entityId required' })

  const clean = haUrl.replace(/\/$/, '')

  try {
    const r = await fetch(`${clean}/api/camera_proxy/${entityId}`, {
      headers: { Authorization: `Bearer ${haToken}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return res.status(r.status).json({ error: `HA returned ${r.status}` })

    const buf = await r.arrayBuffer()
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.end(Buffer.from(buf))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
