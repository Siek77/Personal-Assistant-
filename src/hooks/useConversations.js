// useConversations — Vercel Blob-backed conversation storage
// Uses the app's generated client ID so persistence works without manual sync setup.

import { useState, useCallback, useEffect } from 'react'
import { getOrCreateClientId } from '../utils/persistence'

async function parseApiJson(response) {
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(text || `Request failed with ${response.status}`)
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`)
  }

  return data
}

export function useConversations() {
  const [storageInfo, setStorageInfo] = useState(null) // { totalBytes, limitBytes }
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    setIsAvailable(!!getOrCreateClientId())
  }, [])

  async function getKey() {
    return getOrCreateClientId()
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
    const data = await parseApiJson(r)
    if (data.totalBytes !== undefined) {
      setStorageInfo({ totalBytes: data.totalBytes, limitBytes: data.limitBytes })
    }
    return data
  }, [])

  // List all conversations (metadata only — no message content)
  const listConversations = useCallback(async () => {
    const key = await getKey()
    if (!key) return []
    const r = await fetch(`/api/conversations?key=${key}`)
    const data = await parseApiJson(r)
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
      recent.map(c =>
        fetch(`/api/conversations?key=${encodeURIComponent(getOrCreateClientId())}&id=${encodeURIComponent(c.id)}`)
          .then(parseApiJson)
          .then(data => data.conversation || null)
          .catch(() => null)
      )
    )
    return results.filter(Boolean).reverse() // oldest first for context
  }, [listConversations])

  const getConversation = useCallback(async (id) => {
    const key = await getKey()
    if (!key || !id) return null
    const r = await fetch(`/api/conversations?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`)
    const data = await parseApiJson(r)
    return data.conversation || null
  }, [])

  // Delete conversations by ID
  const deleteConversations = useCallback(async (ids) => {
    const key = await getKey()
    if (!key || !ids.length) return
    const r = await fetch(`/api/conversations?key=${key}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    await parseApiJson(r)
    // Refresh storage info after delete
    await listConversations()
    return { ok: true }
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
    getConversation,
    listConversations,
    deleteConversations,
    refreshStorage,
  }
}
