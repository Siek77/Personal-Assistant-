import { useState, useEffect, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Persist events to localStorage so voice.js can read them via blob sync
function persistCalEvents(events, source) {
  try {
    const existing = JSON.parse(localStorage.getItem('jarvis_calendar_events') || '[]')
    const merged = [
      ...existing.filter(e => e.source !== source),
      ...events
        .filter(e => e.start && new Date(e.start) >= new Date())
        .slice(0, 40)
        .map(({ title, start, end, allDay, location }) => ({ title, start, end, allDay, location, source })),
    ]
    localStorage.setItem('jarvis_calendar_events', JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent('jarvis:calendar-updated'))
  } catch { /* ignore storage errors */ }
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function getDays(n = 14) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    return d
  })
}

function EventRow({ event, color = '#3b82f6', source }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: color + '12',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ minWidth: 60, fontSize: 11, color: 'var(--text2)', paddingTop: 1 }}>
        {event.allDay ? 'All day' : formatTime(event.start)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </div>
        {event.location && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>📍 {event.location}</div>
        )}
        {event.description && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.description.replace(/<[^>]+>/g, '').slice(0, 80)}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>
        {source === 'google' ? '🇬' : '🍎'}
      </div>
    </div>
  )
}

// ── Google Calendar section ───────────────────────────────────────────────────

function GoogleCalSection({ clientId, selectedDay }) {
  const { token, signInStatus, signIn, signOut, listCalendars, listEvents } = useGoogleCalendar(clientId)
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeCalIds, setActiveCalIds] = useState([])

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const cals = await listCalendars()
      setCalendars(cals)
      const ids = activeCalIds.length > 0 ? activeCalIds : cals.map(c => c.id)
      setActiveCalIds(ids)
      const now = new Date()
      const end = new Date(now.getTime() + 14 * 86400000)
      const allEvents = await Promise.all(
        ids.slice(0, 5).map(id => listEvents(id, now.toISOString(), end.toISOString()).catch(() => []))
      )
      const sorted = allEvents.flat().sort((a, b) => new Date(a.start) - new Date(b.start))
      setEvents(sorted)
      if (sorted.length) persistCalEvents(sorted, 'google')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, listCalendars, listEvents])

  useEffect(() => { loadData() }, [token])

  const toggleCal = (id) => {
    setActiveCalIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      return next
    })
  }

  if (!clientId) {
    return (
      <div style={{ padding: '16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
        Set a <strong>Google OAuth Client ID</strong> in Settings → Sync to enable Google Calendar.
        Use the same Client ID as Google Drive (make sure Calendar API is enabled in Google Cloud Console and add <code style={{ fontSize: 10 }}>https://www.googleapis.com/auth/calendar.readonly</code> scope).
      </div>
    )
  }

  if (signInStatus !== 'signed-in' && !token) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <button
          className="btn btn-primary"
          onClick={signIn}
          disabled={signInStatus === 'signing-in'}
          style={{ background: '#4285f4', borderColor: '#4285f4' }}
        >
          {signInStatus === 'signing-in' ? '⏳ Signing in…' : '🔑 Sign in with Google'}
        </button>
        {signInStatus === 'error' && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>Sign-in failed — check Client ID and try again.</div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--green)' }}>● Connected</span>
        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading} style={{ fontSize: 11 }}>
          {loading ? '⏳' : '⟳'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={signOut} style={{ fontSize: 11, marginLeft: 'auto' }}>
          Sign out
        </button>
      </div>

      {/* Calendar picker */}
      {calendars.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {calendars.map(c => (
            <button
              key={c.id}
              onClick={() => toggleCal(c.id)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 12, border: `1px solid ${c.color}`,
                background: activeCalIds.includes(c.id) ? c.color + '22' : 'transparent',
                color: activeCalIds.includes(c.id) ? c.color : 'var(--text2)',
                cursor: 'pointer',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>⚠️ {error}</div>}

      {events.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>No events in the next 14 days.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.filter(e => activeCalIds.includes(e.calendarId) && sameDay(e.start, selectedDay)).map(e => {
          const cal = calendars.find(c => c.id === e.calendarId)
          return <EventRow key={e.id} event={e} color={cal?.color} source="google" />
        })}
      </div>
    </div>
  )
}

// ── Apple Calendar (CalDAV) section ──────────────────────────────────────────

function AppleCalSection({ email, password, selectedDay }) {
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  const [activeCalUrls, setActiveCalUrls] = useState([])
  const [discovering, setDiscovering] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [error, setError] = useState(null)
  const [discovered, setDiscovered] = useState(false)

  if (!email || !password) {
    return (
      <div style={{ padding: '16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
        Enter your <strong>Apple ID email</strong> and an <strong>App-Specific Password</strong> in Settings → Calendar to connect iCloud Calendar.
        Create an app-specific password at <strong>appleid.apple.com → Sign-In and Security → App-Specific Passwords</strong>.
      </div>
    )
  }

  const discover = async () => {
    setDiscovering(true)
    setError(null)
    try {
      const r = await fetch('/api/apple-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discover', email, password }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Discovery failed')
      setCalendars(data.calendars || [])
      setActiveCalUrls((data.calendars || []).map(c => c.url))
      setDiscovered(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setDiscovering(false)
    }
  }

  const fetchEvents = async () => {
    if (activeCalUrls.length === 0) return
    setLoadingEvents(true)
    setError(null)
    try {
      const now = new Date()
      const end = new Date(now.getTime() + 14 * 86400000)
      const allEvents = await Promise.all(
        activeCalUrls.slice(0, 10).map(url =>
          fetch('/api/apple-calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'events', email, password, calendarUrl: url, startDate: now.toISOString(), endDate: end.toISOString() }),
            signal: AbortSignal.timeout(15000),
          }).then(r => r.json()).then(d => d.events || []).catch(() => [])
        )
      )
      const sorted = allEvents.flat().sort((a, b) => new Date(a.start) - new Date(b.start))
      setEvents(sorted)
      if (sorted.length) persistCalEvents(sorted, 'apple')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingEvents(false)
    }
  }

  useEffect(() => { if (activeCalUrls.length > 0) fetchEvents() }, [activeCalUrls])

  const toggleCal = (url) => {
    setActiveCalUrls(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    )
  }

  if (!discovered) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <button className="btn btn-primary" onClick={discover} disabled={discovering}
          style={{ background: '#555', borderColor: '#555' }}>
          {discovering ? '⏳ Discovering calendars…' : '🍎 Connect iCloud Calendar'}
        </button>
        {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>⚠️ {error}</div>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--green)' }}>● {calendars.length} calendars</span>
        <button className="btn btn-ghost btn-sm" onClick={fetchEvents} disabled={loadingEvents} style={{ fontSize: 11 }}>
          {loadingEvents ? '⏳' : '⟳'}
        </button>
      </div>

      {calendars.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {calendars.map(c => (
            <button key={c.url} onClick={() => toggleCal(c.url)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 12,
                border: '1px solid #555',
                background: activeCalUrls.includes(c.url) ? '#55555522' : 'transparent',
                color: activeCalUrls.includes(c.url) ? 'var(--text)' : 'var(--text2)',
                cursor: 'pointer',
              }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>⚠️ {error}</div>}

      {events.length === 0 && !loadingEvents && (
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '12px 0' }}>No events in the next 14 days.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.filter(e => sameDay(e.start, selectedDay)).map((e, i) => <EventRow key={e.uid || i} event={e} color="#555" source="apple" />)}
      </div>
    </div>
  )
}

// ── Main Calendar Tab ─────────────────────────────────────────────────────────

export default function CalendarTab() {
  const { settings } = useSettings()
  const [view, setView] = useState('google') // 'google' | 'apple' | 'merged'
  const [selectedDayIdx, setSelectedDayIdx] = useState(0)
  const days = getDays(14)

  return (
    <div className="tab-shell">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ec4899' }}>📅 Calendar</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[
            { id: 'google', label: '🇬 Google' },
            { id: 'apple', label: '🍎 Apple' },
          ].map(v => (
            <button
              key={v.id}
              className={`btn btn-sm ${view === v.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView(v.id)}
              style={{ fontSize: 11, ...(view === v.id ? { background: '#ec4899', borderColor: '#ec4899' } : {}) }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Day strip — next 7 days quick view */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {days.slice(0, 7).map((d, i) => (
          <div key={i} onClick={() => setSelectedDayIdx(i)} style={{
            flexShrink: 0, width: 54, textAlign: 'center',
            padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
            background: i === selectedDayIdx ? '#ec4899' : 'var(--bg3)',
            color: i === selectedDayIdx ? '#fff' : 'var(--text2)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600 }}>
              {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Orbitron, monospace' }}>
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Calendar source content */}
      <div className="card" style={{ padding: '16px 20px' }}>
        {view === 'google' && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#4285f4' }}>Google Calendar</h3>
            <GoogleCalSection clientId={settings.googleClientId} selectedDay={days[selectedDayIdx]} />
          </>
        )}
        {view === 'apple' && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Apple Calendar (iCloud)</h3>
            <AppleCalSection email={settings.calDavEmail} password={settings.calDavPassword} selectedDay={days[selectedDayIdx]} />
          </>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
        Events shown for the next 14 days. Apple Calendar uses iCloud CalDAV (read-only). Credentials are sent only to our proxy server and never stored.
      </div>
    </div>
  )
}
