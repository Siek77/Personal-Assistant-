import { put, list, del } from '@vercel/blob'
import { fetchBlobJson } from './blob-utils.js'

const MAX_PAYLOAD_BYTES = 512 * 1024 // 512 KB safety limit

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { key } = req.query

  // Key must be a 64-char hex string (SHA-256 output)
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    return res.status(400).json({ error: 'Invalid key format' })
  }

  const blobPath = `jarvis-sync/${key}.json`

  if (req.method === 'GET') {
    const { blobs } = await list({ prefix: blobPath })
    if (!blobs.length) return res.status(200).json({ data: null })
    const data = await fetchBlobJson(blobs[0].url)
    return res.status(200).json({ data })
  }

  if (req.method === 'POST') {
    const body = req.body
    if (JSON.stringify(body).length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' })
    }
    // Remove old blob(s) for this key before writing new one
    const { blobs: existing } = await list({ prefix: blobPath })
    if (existing.length) await del(existing.map(b => b.url))

    const savedAt = new Date().toISOString()
    await put(blobPath, JSON.stringify({ ...body, savedAt }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    })
    return res.status(200).json({ ok: true, savedAt })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
