import { list, put, del } from '@vercel/blob'

const MAX_PAYLOAD_BYTES = 512 * 1024

function isValidClientId(clientId) {
  return typeof clientId === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(clientId)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { clientId } = req.query
  if (!isValidClientId(clientId)) {
    return res.status(400).json({ error: 'Invalid clientId' })
  }

  const blobPath = `jarvis-state/${clientId}.json`

  if (req.method === 'GET') {
    const { blobs } = await list({ prefix: blobPath })
    if (!blobs.length) return res.status(200).json({ data: null })
    const resp = await fetch(blobs[0].url)
    const data = await resp.json()
    return res.status(200).json({ data })
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    if (JSON.stringify(body).length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Payload too large' })
    }

    const { blobs: existing } = await list({ prefix: blobPath })
    if (existing.length) await del(existing.map(blob => blob.url))

    const savedAt = new Date().toISOString()
    await put(blobPath, JSON.stringify({ ...body, savedAt }), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    })

    return res.status(200).json({ ok: true, savedAt })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
