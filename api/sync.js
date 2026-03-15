import { kv } from '@vercel/kv'

const MAX_PAYLOAD_BYTES = 512 * 1024 // 512 KB safety limit

export default async function handler(req, res) {
  // CORS for same-origin (Vercel serves API + SPA on same domain)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { key } = req.query

  // Key must be a 64-char hex string (SHA-256 output)
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    return res.status(400).json({ error: 'Invalid key format' })
  }

  if (req.method === 'GET') {
    const data = await kv.get(key)
    return res.status(200).json({ data: data ?? null })
  }

  if (req.method === 'POST') {
    let body = req.body
    // Vercel parses JSON body automatically; check size
    const raw = JSON.stringify(body)
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' })
    }
    const savedAt = new Date().toISOString()
    await kv.set(key, { ...body, savedAt }, { ex: 60 * 60 * 24 * 365 }) // 1 year TTL
    return res.status(200).json({ ok: true, savedAt })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
