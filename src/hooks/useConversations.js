// useConversations — Vercel Blob-backed conversation storage
// Requires jarvis_sync_passphrase in localStorage (same passphrase as the sync key)
// Voice.js can read the same blobs server-side → Groq gets full history via Alexa

import { useState, useCallback, useEffect } from 'react'

async function hashPassphrase(passphrase) {
  const encoder = new TextEncoder()
  const data = encoder.encode('jarvis:' + passphrase)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useConversations() {
  const [storageInfo, setStorageInfo] = useState(null) // { totalBytes, limitBytes }
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    setIsAvailable(!!localStorage.getItem('jarvis_sync_passphrase'))
  }, [])

  async function getKey() {
    const passphrase = localStorage.getItem('jarvis_sync_passphrase')
    if (!passphrase) return null
    return hashPassphrase(passphrase)
  }

  // Save / overwrite a conversation in blob
  const saveConversation = useCallback(async (id, messages) => {
    const key = await getKey()
    if (!key) return null
    const r = await fetch(`/api/conversations?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, messages, savedAt: new Date().toISOString() }),
    })
    const data = await r.json()
    if (data.totalBytes !== undefined) {
      setStorageInfo({ totalBytes: data.totalBytes, limitBytes: data.limitBytes })
    }
    if (!r.ok) throw new Error(data.error || 'Save failed')
    return data
  }, [])

  // List all conversations (metadata only — no message content)
  const listConversations = useCallback(async () => {
    const key = await getKey()
    if (!key) return []
    const r = await fetch(`/api/conversations?key=${key}`)
    const data = await r.json()
    if (data.totalBytes !== undefined) {
      setStorageInfo({ totalBytes: data.totalBytes, limitBytes: data.limitBytes })
    }
    return data.conversations || []
  }, [])

  // Load the N most recent conversations (full content for AI context)
  const loadRecentConversations = useCallback(async (limit = 3) => {
    const convs = await listConversations()
    const recent = convs.slice(0, limit)
    const results = await Promise.all(
      recent.map(c => fetch(c.url).then(r => r.json()).catch(() => null))
    )
    return results.filter(Boolean).reverse() // oldest first for context
  }, [listConversations])

  // Delete conversations by ID
  const deleteConversations = useCallback(async (ids) => {
    const key = await getKey()
    if (!key || !ids.length) return
    const r = await fetch(`/api/conversations?key=${key}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    // Refresh storage info after delete
    await listConversations()
    return r.json()
  }, [listConversations])

  // Refresh storage info without loading content
  const refreshStorage = useCallback(async () => {
    await listConversations()
  }, [listConversations])

  return {
    isAvailable,
    storageInfo,
    saveConversation,
    loadRecentConversations,
    listConversations,
    deleteConversations,
    refreshStorage,
  }
}
