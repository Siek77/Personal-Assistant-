// Proxies HA camera requests server-side to avoid CORS + exposing auth token
// POST { haUrl, haToken, entityId, action? }
//   action omitted / 'snap'  → returns JPEG snapshot
//   action = 'stream'        → returns { streamUrl } HLS playlist URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { haUrl, haToken, entityId, action } = req.body || {}
  if (!haUrl || !haToken || !entityId) return res.status(400).json({ error: 'haUrl, haToken, entityId required' })

  const clean = haUrl.replace(/\/$/, '')

  // ── Stream URL mode ─────────────────────────────────────────────────────────
  if (action === 'stream') {
    try {
      const r = await fetch(`${clean}/api/camera/stream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId }),
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) return res.status(r.status).json({ error: `HA returned ${r.status}` })
      const data = await r.json()
      // data.url is a path like /api/hls/<token>/master_playlist.m3u8
      // Return the full URL so the client can load it directly (no auth header needed — token is in the path)
      return res.status(200).json({ streamUrl: `${clean}${data.url}` })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Snapshot mode (default) ─────────────────────────────────────────────────
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
