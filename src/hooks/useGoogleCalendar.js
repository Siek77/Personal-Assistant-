import { useState, useRef, useCallback } from 'react'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'

export function useGoogleCalendar(clientId) {
  const [signInStatus, setSignInStatus] = useState('idle') // 'idle'|'signing-in'|'signed-in'|'error'
  const [token, setToken] = useState(() => {
    try {
      const t = sessionStorage.getItem('gcal_token')
      const exp = Number(sessionStorage.getItem('gcal_token_exp') || 0)
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
          scope: SCOPES,
          callback: (resp) => {
            if (resp.error) { reject(new Error(resp.error)); return }
            const exp = Date.now() + (resp.expires_in || 3600) * 1000
            sessionStorage.setItem('gcal_token', resp.access_token)
            sessionStorage.setItem('gcal_token_exp', String(exp))
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
    sessionStorage.removeItem('gcal_token')
    sessionStorage.removeItem('gcal_token_exp')
    setToken(null)
    setSignInStatus('idle')
  }, [])

  const apiFetch = useCallback(async (url, retry = true) => {
    const t = token || sessionStorage.getItem('gcal_token')
    if (!t) throw new Error('Not signed in')
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
    if (r.status === 401 && retry) {
      // Try refresh
      if (clientRef.current) {
        await new Promise((resolve, reject) => {
          clientRef.current.requestAccessToken({ prompt: '' })
          // Callback already set from signIn — will update token state
          setTimeout(resolve, 2000)
        })
        return apiFetch(url, false)
      }
      setToken(null)
      setSignInStatus('idle')
      throw new Error('Token expired — please sign in again')
    }
    if (!r.ok) throw new Error(`Calendar API error ${r.status}`)
    return r.json()
  }, [token])

  const listCalendars = useCallback(async () => {
    const data = await apiFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader')
    return (data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor || '#3b82f6',
      primary: c.primary || false,
    }))
  }, [apiFetch])

  const listEvents = useCallback(async (calendarId = 'primary', timeMin, timeMax) => {
    const params = new URLSearchParams({
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 14 * 86400000).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    })
    const data = await apiFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    )
    return (data.items || []).map(e => ({
      id: e.id,
      title: e.summary || '(no title)',
      description: e.description || '',
      location: e.location || '',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      calendarId,
      htmlLink: e.htmlLink,
    }))
  }, [apiFetch])

  return { token, signInStatus, signIn, signOut, listCalendars, listEvents }
}
