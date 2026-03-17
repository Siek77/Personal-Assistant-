import { useState, useRef, useCallback } from 'react'

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function useGmail(clientId) {
  const [signInStatus, setSignInStatus] = useState('idle') // 'idle'|'signing-in'|'signed-in'|'error'
  const [token, setToken] = useState(() => {
    try {
      const t = sessionStorage.getItem('gmail_token')
      const exp = Number(sessionStorage.getItem('gmail_token_exp') || 0)
      return t && Date.now() < exp ? t : null
    } catch { return null }
  })
  const clientRef = useRef(null)

  const loadGIS = useCallback(() => new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  }), [])

  const signIn = useCallback(async () => {
    if (!clientId) { setSignInStatus('error'); return }
    setSignInStatus('signing-in')
    try {
      await loadGIS()
      await new Promise((resolve, reject) => {
        clientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) { reject(new Error(resp.error)); return }
            const exp = Date.now() + (resp.expires_in || 3600) * 1000
            sessionStorage.setItem('gmail_token', resp.access_token)
            sessionStorage.setItem('gmail_token_exp', String(exp))
            setToken(resp.access_token)
            setSignInStatus('signed-in')
            resolve(resp.access_token)
          },
        })
        clientRef.current.requestAccessToken({ prompt: 'consent' })
      })
    } catch {
      setSignInStatus('error')
    }
  }, [clientId, loadGIS])

  const signOut = useCallback(() => {
    sessionStorage.removeItem('gmail_token')
    sessionStorage.removeItem('gmail_token_exp')
    setToken(null)
    setSignInStatus('idle')
  }, [])

  const apiFetch = useCallback(async (url) => {
    const t = token || sessionStorage.getItem('gmail_token')
    if (!t) throw new Error('Not signed in')
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
    if (r.status === 401) {
      setToken(null)
      setSignInStatus('idle')
      throw new Error('Token expired — please sign in again')
    }
    if (!r.ok) throw new Error(`Gmail API error ${r.status}`)
    return r.json()
  }, [token])

  // Returns recent emails with configurable depth so JARVIS can reason over more history.
  const fetchEmails = useCallback(async ({ maxResults = 100, daysBack = 30, unreadOnly = false } = {}) => {
    const queryParts = []
    if (unreadOnly) queryParts.push('is:unread')
    if (daysBack) queryParts.push(`newer_than:${daysBack}d`)
    const query = queryParts.join(' ') || 'in:inbox'

    const listData = await apiFetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(maxResults, 100)}`
    )
    const msgList = listData.messages || []
    if (!msgList.length) return []

    const emails = await Promise.all(
      msgList.slice(0, Math.min(maxResults, 100)).map(async ({ id }) => {
        try {
          const msg = await apiFetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
          )
          const headers = msg.payload?.headers || []
          const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
          return {
            id,
            subject: get('Subject') || '(no subject)',
            from: get('From'),
            date: get('Date'),
            snippet: msg.snippet || '',
            unread: (msg.labelIds || []).includes('UNREAD'),
          }
        } catch { return null }
      })
    )
    return emails.filter(Boolean)
  }, [apiFetch])

  const isSignedIn = signInStatus === 'signed-in' || !!token
  return { token, signInStatus, isSignedIn, signIn, signOut, fetchEmails }
}
