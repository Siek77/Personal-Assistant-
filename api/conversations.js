// Conversation storage in Vercel Blob.
//
// Paths:  jarvis-conv/{storageKey}/{convId}.json
// Limit:  500 MB per client key (user-configurable soft cap)
//
// GET  ?key=...          → { conversations:[{id,uploadedAt,size,url}], totalBytes, limitBytes }
// POST ?key=...          body:{id,messages,savedAt}  → { ok, totalBytes, limitBytes }
// DELETE ?key=...        body:{ids:[...]}             → { ok, deleted }

import { put, list, del } from '@vercel/blob'
import { fetchBlobJson } from './blob-utils'

const LIMIT_BYTES = 500 * 1024 * 1024 // 500 MB soft cap
const KEY_PATTERN = /^[a-zA-Z0-9_-]{8,120}$/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { key } = req.query
  if (!key || !KEY_PATTERN.test(key)) {
    return res.status(400).json({ error: 'Invalid key' })
  }

  const prefix = `jarvis-conv/${key}/`

  // ── GET — list all conversations with storage totals ──
  if (req.method === 'GET') {
    try {
      const { id } = req.query
      if (id) {
        const { blobs } = await list({ prefix: `${prefix}${id}.json` })
        if (!blobs.length) return res.status(404).json({ error: 'Conversation not found' })
        const conversation = await fetchBlobJson(blobs[0].url)
        return res.status(200).json({ conversation })
      }

      const { blobs } = await list({ prefix, limit: 1000 })
      const conversations = blobs
        .map(b => ({
          id: b.pathname.replace(prefix, '').replace('.json', ''),
          uploadedAt: b.uploadedAt,
          size: b.size,
        }))
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      const totalBytes = blobs.reduce((sum, b) => sum + b.size, 0)
      return res.status(200).json({ conversations, totalBytes, limitBytes: LIMIT_BYTES })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST — save / overwrite a conversation ──
  if (req.method === 'POST') {
    const { id, messages, savedAt } = req.body || {}
    if (!id || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'id and messages[] required' })
    }

    try {
      const path = `${prefix}${id}.json`

      // Remove existing blob for this conversation (blob names are immutable)
      const { blobs: existing } = await list({ prefix: path })
      if (existing.length) await del(existing.map(b => b.url))

      const payload = JSON.stringify({
        id,
        savedAt: savedAt || new Date().toISOString(),
        messages: messages.filter(m => m.id !== 'welcome'),
      })

      await put(path, payload, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
      })

      // Return updated storage totals
      const { blobs: allBlobs } = await list({ prefix, limit: 1000 })
      const totalBytes = allBlobs.reduce((sum, b) => sum + b.size, 0)
      return res.status(200).json({ ok: true, totalBytes, limitBytes: LIMIT_BYTES })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── DELETE — remove one or more conversations ──
  if (req.method === 'DELETE') {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids[] required' })
    }

    try {
      const toDelete = []
      for (const id of ids) {
        const { blobs } = await list({ prefix: `${prefix}${id}.json` })
        toDelete.push(...blobs.map(b => b.url))
      }
      if (toDelete.length) await del(toDelete)
      return res.status(200).json({ ok: true, deleted: toDelete.length })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
