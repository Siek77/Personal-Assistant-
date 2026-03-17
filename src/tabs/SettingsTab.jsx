import { useState, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'
import {
  applyPersistedPayload,
  buildPersistencePayload,
  generateSyncCode,
  getOrCreateClientId,
  getPersistenceKey,
  getSyncCode,
  normalizeSyncCode,
  setSyncCode,
} from '../utils/persistence'

const SECTIONS = [
  { id: 'profile',    label: '👤 Profile',    icon: '👤' },
  { id: 'ai',         label: '🤖 AI',         icon: '🤖' },
  { id: 'spotify',    label: '🎵 Spotify',    icon: '🎵' },
  { id: 'esp32',      label: '📡 ESP32',      icon: '📡' },
  { id: 'home',       label: '🏠 Home',       icon: '🏠' },
  { id: 'calendar',   label: '📅 Calendar',   icon: '📅' },
  { id: 'email',      label: '✉️ Email',      icon: '✉️' },
  { id: 'notion',     label: '📝 Notion',     icon: '📝' },
  { id: 'uptime',     label: '🟢 Uptime',     icon: '🟢' },
  { id: 'services',   label: '🔌 Services',   icon: '🔌' },
  { id: 'stocks',     label: '📈 Stocks',     icon: '📈' },
  { id: 'appearance', label: '🎨 Look',       icon: '🎨' },
  { id: 'memory',     label: '🧠 Memory',     icon: '🧠' },
  { id: 'sync',       label: '☁️ Sync',       icon: '☁️' },
]

function ToggleSetting({ label, desc, value, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-label">{label}</div>
        {desc && <div className="settings-desc">{desc}</div>}
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    </div>
  )
}

function InputSetting({ label, desc, value, onChange, type = 'text', placeholder }) {
  const [show, setShow] = useState(false)
  const isSecret = type === 'password'
  return (
    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <div>
        <div className="settings-label">{label}</div>
        {desc && <div className="settings-desc">{desc}</div>}
      </div>
      <div style={{ width: '100%', display: 'flex', gap: 8 }}>
        <input
          className="input"
          type={isSecret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ fontSize: 13 }}
        />
        {isSecret && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  )
}

function UptimeUrlsEditor({ value, onChange }) {
  let urls = []
  try { urls = JSON.parse(value || '[]') } catch {}
  const [list, setList] = useState(urls)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const commit = (next) => {
    setList(next)
    onChange(JSON.stringify(next))
  }

  const add = () => {
    if (!newUrl.trim()) return
    const url = newUrl.trim().startsWith('http') ? newUrl.trim() : 'https://' + newUrl.trim()
    commit([...list, { label: newLabel.trim() || url, url }])
    setNewLabel('')
    setNewUrl('')
  }

  const remove = (i) => commit(list.filter((_, j) => j !== i))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {list.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{item.label}</strong> <span style={{ color: 'var(--text2)', fontSize: 11 }}>{item.url}</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(i)} style={{ color: '#ef4444', fontSize: 11 }}>✕</button>
          </div>
        ))}
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>No URLs added yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Label (e.g. My App)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          style={{ fontSize: 13, flex: '1 1 120px' }}
        />
        <input
          className="input"
          placeholder="https://example.com"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          style={{ fontSize: 13, flex: '2 1 200px' }}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary btn-sm" onClick={add} style={{ flexShrink: 0 }}>Add</button>
      </div>
    </div>
  )
}

function CalendarFeedsEditor({ value, onChange }) {
  let feeds = []
  try { feeds = JSON.parse(value || '[]') } catch {}
  const [list, setList] = useState(feeds)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const commit = (next) => {
    setList(next)
    onChange(JSON.stringify(next))
  }

  const add = () => {
    const url = newUrl.trim()
    if (!url) return
    commit([...list, { label: newLabel.trim() || 'Work Calendar', url }])
    setNewLabel('')
    setNewUrl('')
  }

  const remove = (i) => commit(list.filter((_, j) => j !== i))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {list.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{item.label}</strong> <span style={{ color: 'var(--text2)', fontSize: 11 }}>{item.url}</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(i)} style={{ color: '#ef4444', fontSize: 11 }}>✕</button>
          </div>
        ))}
        {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>No work calendar feeds added yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Label (e.g. Work, Team, PTO)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          style={{ fontSize: 13, flex: '1 1 120px' }}
        />
        <input
          className="input"
          placeholder="https://outlook.office365.com/owa/calendar/....ics"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          style={{ fontSize: 13, flex: '2 1 260px' }}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary btn-sm" onClick={add} style={{ flexShrink: 0 }}>Add</button>
      </div>
    </div>
  )
}

export default function SettingsTab() {
  const { settings, updateSetting, updateSettings } = useSettings()
  const { memory, clearMemory, mergeRemoteMemory } = useMemory()
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [deviceId] = useState(() => getOrCreateClientId())
  const [syncCodeInput, setSyncCodeInput] = useState(() => getSyncCode())
  const [storageKey, setStorageKey] = useState(() => getPersistenceKey())
  const [lastSynced, setLastSynced] = useState(() => localStorage.getItem('jarvis_last_synced') || '')
  const [syncing, setSyncing] = useState(false)

  const save = (key, val) => {
    updateSetting(key, val)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const loadCloudState = async (clientId) => {
    const res = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}`)
    const data = await res.json()
    return data?.data || null
  }

  const saveCloudState = async (clientId) => {
    const res = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPersistencePayload(settings, memory)),
    })
    return res.json()
  }

  const copyConversations = async (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return 0

    const listRes = await fetch(`/api/conversations?key=${encodeURIComponent(fromKey)}`)
    const listData = await listRes.json()
    const conversations = listData?.conversations || []
    let copied = 0

    for (const meta of conversations) {
      const convRes = await fetch(`/api/conversations?key=${encodeURIComponent(fromKey)}&id=${encodeURIComponent(meta.id)}`)
      const convData = await convRes.json()
      const conversation = convData?.conversation
      if (!conversation?.messages) continue

      await fetch(`/api/conversations?key=${encodeURIComponent(toKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversation.id || meta.id,
          messages: conversation.messages,
          savedAt: conversation.savedAt || meta.uploadedAt || new Date().toISOString(),
        }),
      })
      copied += 1
    }

    return copied
  }

  const pushSync = async () => {
    setSyncing(true)
    try {
      const clientId = getPersistenceKey()
      const { savedAt } = await saveCloudState(clientId)
      localStorage.setItem('jarvis_last_synced', savedAt)
      setLastSynced(savedAt)
      setSyncStatus('✓ Synced to cloud!')
    } catch {
      setSyncStatus('✗ Sync failed — check your connection.')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus(''), 4000)
    }
  }

  const pullSync = async () => {
    setSyncing(true)
    try {
      const clientId = getPersistenceKey()
      const data = await loadCloudState(clientId)
      if (!data?.settings && !data?.memory) { setSyncStatus('✗ No cloud data found yet for this assistant.'); return }
      applyPersistedPayload(data, { updateSettings, mergeRemoteMemory })
      const ts = data.savedAt || new Date().toISOString()
      localStorage.setItem('jarvis_last_synced', ts)
      setLastSynced(ts)
      setSyncStatus('✓ Cloud state pulled successfully.')
    } catch {
      setSyncStatus('✗ Pull failed — check your connection.')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus(''), 5000)
    }
  }

  const applySyncCode = async () => {
    const previousKey = getPersistenceKey()
    const normalized = setSyncCode(syncCodeInput)
    setSyncCodeInput(normalized)
    const nextKey = getPersistenceKey()
    setStorageKey(nextKey)

    if (!normalized) {
      setSyncStatus('✓ Shared sync code cleared. This device is back on its own local assistant identity.')
      return
    }

    setSyncing(true)
    try {
      const cloudData = await loadCloudState(nextKey)
      if (cloudData?.settings || cloudData?.memory) {
        applyPersistedPayload(cloudData, { updateSettings, mergeRemoteMemory })
        const ts = cloudData.savedAt || new Date().toISOString()
        localStorage.setItem('jarvis_last_synced', ts)
        setLastSynced(ts)
        setSyncStatus('✓ Shared sync code applied. Pulled settings and memory from the cloud assistant.')
      } else {
        const { savedAt } = await saveCloudState(nextKey)
        const copied = await copyConversations(previousKey, nextKey)
        localStorage.setItem('jarvis_last_synced', savedAt)
        setLastSynced(savedAt)
        setSyncStatus(`✓ Shared sync code applied. Uploaded this device's settings and memory${copied ? ` and copied ${copied} conversations` : ''}.`)
      }
    } catch {
      setSyncStatus('✗ Sync code applied, but cloud sync failed.')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus(''), 5000)
    }
  }

  const generateAndApplySyncCode = async () => {
    const previousKey = getPersistenceKey()
    const nextCode = generateSyncCode()
    setSyncCodeInput(nextCode)
    const normalized = setSyncCode(nextCode)
    const nextKey = getPersistenceKey()
    setStorageKey(nextKey)

    setSyncing(true)
    try {
      const { savedAt } = await saveCloudState(nextKey)
      const copied = await copyConversations(previousKey, nextKey)
      localStorage.setItem('jarvis_last_synced', savedAt)
      setLastSynced(savedAt)
      setSyncStatus(`✓ New sync code created and uploaded. ${copied ? `Copied ${copied} conversations too.` : 'Current settings and memory are now shared.'}`)
    } catch {
      setSyncStatus('✗ Sync code created, but initial cloud upload failed.')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus(''), 5000)
    }
  }

  const copySyncCode = async () => {
    const value = normalizeSyncCode(syncCodeInput)
    if (!value) {
      setSyncStatus('✗ Add or generate a sync code first.')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setSyncStatus('✓ Sync code copied. Paste it into your other device.')
    } catch {
      setSyncStatus(`Copy this sync code manually: ${value}`)
    }
    setTimeout(() => setSyncStatus(''), 5000)
  }

  useEffect(() => {
    const handleSyncTargetChange = () => {
      setSyncCodeInput(getSyncCode())
      setStorageKey(getPersistenceKey())
      setLastSynced(localStorage.getItem('jarvis_last_synced') || '')
    }
    window.addEventListener('jarvis:sync-code-changed', handleSyncTargetChange)
    return () => window.removeEventListener('jarvis:sync-code-changed', handleSyncTargetChange)
  }, [])

  return (
    <div className="settings-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text2)' }}>⚙️ Settings</h2>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>

      <div className="settings-grid">
        {/* Sidebar nav — desktop vertical / mobile horizontal strip */}
        <div className="settings-nav">
          {SECTIONS.map(s => (
            <div
              key={s.id}
              className={`settings-nav-item ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span>{s.icon}</span> <span className="settings-nav-label">{s.label.replace(/^.+ /, '')}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          <div className="card">

            {/* Profile */}
            {activeSection === 'profile' && (
              <div className="settings-section">
                <h3>Profile</h3>
                <InputSetting label="Your Name" desc="JARVIS will address you by this name" value={settings.userName} onChange={v => save('userName', v)} placeholder="e.g. Tony" />
                <InputSetting label="Timezone" value={settings.userTimezone} onChange={v => save('userTimezone', v)} placeholder="e.g. America/New_York" />
                <InputSetting label="Wake Word" desc="Phrase to trigger JARVIS (display only, voice not implemented)" value={settings.wakeWord} onChange={v => save('wakeWord', v)} placeholder="Hey JARVIS" />
              </div>
            )}

            {/* AI */}
            {activeSection === 'ai' && (
              <div className="settings-section">
                <h3>OpenAI</h3>

                <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.08)', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>OpenAI via Vercel API</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>SERVER</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Chat requests now go through <code>/api/chat</code>. Set <code>OPENAI_API_KEY</code> in your Vercel project and JARVIS will use it server-side.
                  </div>
                </div>

                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div className="settings-label">Model</div>
                  <select className="input" style={{ width: '100%', fontSize: 13 }} value={settings.openaiModel || 'gpt-4o-mini'} onChange={e => save('openaiModel', e.target.value)}>
                    <option value="gpt-4o-mini">gpt-4o-mini (Recommended)</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                    <option value="gpt-4.1">gpt-4.1</option>
                    <option value="gpt-4o">gpt-4o</option>
                  </select>
                </div>

                <div style={{ marginTop: 12, padding: 10, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                  The browser no longer sends model requests directly to OpenRouter or Groq. Your OpenAI key stays on the Vercel server.
                </div>
              </div>
            )}

            {/* Spotify */}
            {activeSection === 'spotify' && (
              <div className="settings-section">
                <h3>Spotify Integration</h3>
                <InputSetting
                  label="Spotify Client ID"
                  desc="From your Spotify Developer Dashboard app"
                  value={settings.spotifyClientId}
                  onChange={v => save('spotifyClientId', v)}
                  type="password"
                  placeholder="Your Spotify Client ID"
                />
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--spotify)', marginBottom: 6 }}>Setup Instructions</div>
                  <ol style={{ fontSize: 12, color: 'var(--text2)', paddingLeft: 16, lineHeight: 1.8 }}>
                    <li>Go to <strong>developer.spotify.com/dashboard</strong></li>
                    <li>Create a new app</li>
                    <li>Add <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{window.location.origin + window.location.pathname}</code> as Redirect URI</li>
                    <li>Copy the Client ID above</li>
                    <li>Go to the Spotify tab and click Connect</li>
                  </ol>
                </div>
              </div>
            )}

            {/* ESP32 */}
            {activeSection === 'esp32' && (
              <div className="settings-section">
                <h3>ESP32 Settings</h3>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div className="settings-label">Default Timeout</div>
                  <div className="settings-desc">Request timeout for ESP32 HTTP calls (ms)</div>
                  <select className="input" style={{ width: 'auto', fontSize: 13, marginTop: 6 }}
                    value={settings.esp32Timeout || 3000}
                    onChange={e => save('esp32Timeout', Number(e.target.value))}>
                    <option value={1000}>1s</option>
                    <option value={3000}>3s (default)</option>
                    <option value={5000}>5s</option>
                    <option value={10000}>10s</option>
                  </select>
                </div>
                <ToggleSetting
                  label="Auto-ping on startup"
                  desc="Automatically ping all devices when app loads"
                  value={settings.esp32AutoPing || false}
                  onChange={v => save('esp32AutoPing', v)}
                />
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                  <strong style={{ color: 'var(--cyan)' }}>Tip:</strong> Devices must be on the same local network. HTTP requests are made directly from your browser to the ESP32.
                </div>
              </div>
            )}

            {/* Home Assistant */}
            {activeSection === 'home' && (
              <div className="settings-section">
                <h3>Home Assistant / HomeKit / Matter</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Connect to a <strong>Home Assistant</strong> instance to control HomeKit devices, Matter accessories, Zigbee/Z-Wave sensors, and any other smart home gear.
                </p>
                <InputSetting
                  label="Home Assistant URL"
                  desc="Your HA instance URL — must be reachable from your browser (local or via Nabu Casa / Cloudflare Tunnel)"
                  value={settings.haUrl || ''}
                  onChange={v => save('haUrl', v)}
                  placeholder="http://homeassistant.local:8123"
                />
                <InputSetting
                  label="Long-Lived Access Token"
                  desc="Profile → Long-Lived Access Tokens → Create Token in Home Assistant"
                  value={settings.haToken || ''}
                  onChange={v => save('haToken', v)}
                  type="password"
                  placeholder="eyJ..."
                />
                <InputSetting
                  label="Cloudflare Access Client ID"
                  desc="Optional — if HA is behind Cloudflare Access. Zero Trust → Service Auth → Service Tokens."
                  value={settings.cfClientId || ''}
                  onChange={v => save('cfClientId', v)}
                  placeholder="abc123.access"
                />
                <InputSetting
                  label="Cloudflare Access Client Secret"
                  desc="The secret from the same Cloudflare service token."
                  value={settings.cfClientSecret || ''}
                  onChange={v => save('cfClientSecret', v)}
                  type="password"
                  placeholder="••••••••"
                />
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 8 }}>CORS Configuration Required</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                    Add to your HA <code style={{ fontSize: 11, background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>configuration.yaml</code>:
                    <pre style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 11, overflowX: 'auto' }}>{`http:
  cors_allowed_origins:
    - https://jarvis-dashboard-fawn.vercel.app`}</pre>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <strong style={{ color: '#ef4444' }}>iPad / iOS Safari:</strong> This app runs on <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>https://</code> — iOS blocks all <code>http://</code> requests as mixed content. You must use an <strong>https:// URL</strong> for HA (Nabu Casa, Cloudflare Tunnel, or self-signed cert). A plain <code>http://</code> local address will only work on desktop.
                </div>
              </div>
            )}

            {/* Calendar */}
            {activeSection === 'calendar' && (
              <div className="settings-section">
                <h3>Calendar</h3>
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#4285f4' }}>Google Calendar</h4>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
                    Uses the same Google OAuth Client ID as Google Drive (Settings → Sync). Make sure the <strong>Google Calendar API</strong> is enabled in your Google Cloud project.
                    The Calendar tab will prompt you to sign in with a <code style={{ fontSize: 11 }}>calendar.readonly</code> scope.
                  </p>
                  <div style={{ padding: 10, background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                    Enable the Calendar API: <strong>console.cloud.google.com → APIs & Services → Library → Google Calendar API → Enable</strong>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Apple Calendar (iCloud CalDAV)</h4>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
                    Reads your iCloud calendars via CalDAV. Requires an <strong>App-Specific Password</strong> — your main Apple ID password won't work here.
                  </p>
                  <InputSetting
                    label="Apple ID Email"
                    value={settings.calDavEmail || ''}
                    onChange={v => save('calDavEmail', v)}
                    placeholder="you@icloud.com"
                  />
                  <InputSetting
                    label="App-Specific Password"
                    desc="Create at appleid.apple.com → Sign-In and Security → App-Specific Passwords"
                    value={settings.calDavPassword || ''}
                    onChange={v => save('calDavPassword', v)}
                    type="password"
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                  />
                  <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Credentials are sent to the /api/apple-calendar proxy only when you load calendars — never stored server-side.
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2563eb' }}>Work Calendar (Outlook ICS)</h4>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
                    Add one or more private Outlook ICS subscription links for work calendars. In the Calendar tab, you can toggle which feeds are active, and JARVIS will only see the active ones.
                  </p>
                  <CalendarFeedsEditor
                    value={settings.workCalendarFeeds || '[]'}
                    onChange={v => save('workCalendarFeeds', v)}
                  />
                  <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Treat ICS links like secrets. Anyone with the URL can read that published calendar.
                  </div>
                </div>
              </div>
            )}

            {/* Email */}
            {activeSection === 'email' && (
              <div className="settings-section">
                <h3>Email Accounts</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Connect multiple inboxes so JARVIS can summarize personal and work email in one place.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#4285f4' }}>Gmail</h4>
                  <InputSetting
                    label="Google OAuth Client ID"
                    desc="Used for Gmail, Google Calendar, and Google Drive sign-in."
                    value={settings.googleClientId || ''}
                    onChange={v => save('googleClientId', v)}
                    placeholder="1234567890-abc.apps.googleusercontent.com"
                  />
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2563eb' }}>Corporate Outlook</h4>
                  <InputSetting
                    label="Work Email"
                    desc="Used for direct Outlook IMAP sync when your company account allows it."
                    value={settings.outlookEmail || ''}
                    onChange={v => save('outlookEmail', v)}
                    placeholder="you@company.com"
                  />
                  <InputSetting
                    label="Work Mail Password / App Password"
                    desc="Use an app password if your company supports it. Some organizations block IMAP entirely."
                    value={settings.outlookPassword || ''}
                    onChange={v => save('outlookPassword', v)}
                    type="password"
                    placeholder="Password"
                  />
                  <InputSetting
                    label="Microsoft App Client ID"
                    desc="Optional. Only needed if you later want Microsoft OAuth instead of direct IMAP."
                    value={settings.microsoftClientId || ''}
                    onChange={v => save('microsoftClientId', v)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Direct sync uses <code>outlook.office365.com</code> over IMAP. OAuth is optional and only works if you can register an app with redirect URI <code>{window.location.origin}/microsoft-auth-callback.html</code>.
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#7c3aed' }}>Yahoo Mail</h4>
                  <InputSetting
                    label="Yahoo Email Address"
                    value={settings.yahooEmail || ''}
                    onChange={v => save('yahooEmail', v)}
                    placeholder="you@yahoo.com"
                  />
                  <InputSetting
                    label="Yahoo App Password"
                    desc="Generate this from Yahoo Account Security. Your normal password should not be used."
                    value={settings.yahooAppPassword || ''}
                    onChange={v => save('yahooAppPassword', v)}
                    type="password"
                    placeholder="App password"
                  />
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Yahoo messages are fetched server-side over IMAP from <code>imap.mail.yahoo.com</code>.
                  </div>
                </div>
              </div>
            )}

            {/* Notion */}
            {activeSection === 'notion' && (
              <div className="settings-section">
                <h3>Notion</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Show a Notion database as a widget on the Dashboard. Uses an <strong>Internal Integration</strong> token for read access.
                </p>
                <InputSetting
                  label="Notion API Key"
                  desc="Create an Internal Integration at notion.so/my-integrations and copy the secret"
                  value={settings.notionApiKey || ''}
                  onChange={v => save('notionApiKey', v)}
                  type="password"
                  placeholder="secret_..."
                />
                <InputSetting
                  label="Database ID"
                  desc="From the database page URL: notion.so/username/DATABASE_ID?v=..."
                  value={settings.notionDatabaseId || ''}
                  onChange={v => save('notionDatabaseId', v)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Setup</div>
                  <ol style={{ fontSize: 12, color: 'var(--text2)', paddingLeft: 16, lineHeight: 1.8 }}>
                    <li>Go to <strong>notion.so/my-integrations</strong> → New integration</li>
                    <li>Give it a name, select read content, copy the Internal Integration Token</li>
                    <li>Open the Notion database you want to show</li>
                    <li>Click ⋯ → Connections → Connect your integration</li>
                    <li>Copy the database ID from the URL</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Uptime */}
            {activeSection === 'uptime' && (
              <div className="settings-section">
                <h3>Uptime Monitor</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Add URLs to monitor. The Dashboard will show live status (up/down) and response times.
                </p>
                <UptimeUrlsEditor
                  value={settings.uptimeUrls || '[]'}
                  onChange={v => save('uptimeUrls', v)}
                />
              </div>
            )}

            {/* Services */}
            {activeSection === 'services' && (
              <div className="settings-section">
                <h3>External Services</h3>
                <InputSetting
                  label="OpenWeatherMap API Key"
                  desc="For weather data on the Dashboard. Free tier available."
                  value={settings.weatherApiKey}
                  onChange={v => save('weatherApiKey', v)}
                  type="password"
                  placeholder="Your OWM API key"
                />
                <InputSetting
                  label="NewsAPI Key"
                  desc="For live headlines on the Dashboard. Free at newsapi.org."
                  value={settings.newsApiKey}
                  onChange={v => save('newsApiKey', v)}
                  type="password"
                  placeholder="Your NewsAPI key"
                />
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  All keys are stored in your browser's localStorage and used only for direct API calls from your device.
                </div>
              </div>
            )}

            {/* Stocks */}
            {activeSection === 'stocks' && (
              <div className="settings-section">
                <h3>Stock Tracker</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Enter the tickers you want to track. These will appear in the Stocks dashboard widget, Daily Brief, and JARVIS context. Data is fetched via Yahoo Finance — no API key required.
                </p>
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <div className="settings-label">Watched Tickers</div>
                  <div className="settings-desc">Comma-separated. Use Yahoo Finance symbols — stocks (AAPL), crypto (BTC-USD), ETFs (SPY), indices (^GSPC)</div>
                  <input
                    className="input"
                    value={settings.watchedStocks || ''}
                    onChange={e => save('watchedStocks', e.target.value)}
                    placeholder="AAPL,MSFT,TSLA,BTC-USD,SPY"
                    style={{ fontSize: 13, width: '100%' }}
                  />
                </div>
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text3)' }}>Examples:</strong><br />
                  Stocks: <code style={{ fontSize: 11 }}>AAPL, MSFT, TSLA, NVDA, AMZN</code><br />
                  Crypto: <code style={{ fontSize: 11 }}>BTC-USD, ETH-USD, SOL-USD</code><br />
                  ETFs: <code style={{ fontSize: 11 }}>SPY, QQQ, VTI</code><br />
                  Indices: <code style={{ fontSize: 11 }}>^GSPC (S&P 500), ^DJI (Dow), ^IXIC (Nasdaq)</code>
                </div>
              </div>
            )}

            {/* Appearance */}
            {activeSection === 'appearance' && (
              <div className="settings-section">
                <h3>Appearance</h3>
                <ToggleSetting
                  label="Scanline Effect"
                  desc="Subtle CRT scanline overlay for the Jarvis aesthetic"
                  value={settings.scanlineEffect !== false}
                  onChange={v => save('scanlineEffect', v)}
                />
                {/* Primary Color */}
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Primary Color</div>
                    <div className="settings-desc">Main accent — buttons, active states, links</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: settings.primaryColor || '#3b82f6',
                      border: '2px solid var(--border2)',
                      boxShadow: `0 0 10px ${settings.primaryColor || '#3b82f6'}66`,
                      flexShrink: 0,
                    }} />
                    <input
                      type="color"
                      value={settings.primaryColor || '#3b82f6'}
                      onChange={e => save('primaryColor', e.target.value)}
                      style={{
                        width: 44, height: 34, border: '1px solid var(--border)',
                        borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)',
                        padding: 2,
                      }}
                      title="Pick primary color"
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => save('primaryColor', '#3b82f6')}
                      title="Reset to default"
                      style={{ fontSize: 11 }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Secondary Color */}
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Secondary Color</div>
                    <div className="settings-desc">Secondary accent — memory, dashboard highlights</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: settings.secondaryColor || '#8b5cf6',
                      border: '2px solid var(--border2)',
                      boxShadow: `0 0 10px ${settings.secondaryColor || '#8b5cf6'}66`,
                      flexShrink: 0,
                    }} />
                    <input
                      type="color"
                      value={settings.secondaryColor || '#8b5cf6'}
                      onChange={e => save('secondaryColor', e.target.value)}
                      style={{
                        width: 44, height: 34, border: '1px solid var(--border)',
                        borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)',
                        padding: 2,
                      }}
                      title="Pick secondary color"
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => save('secondaryColor', '#8b5cf6')}
                      title="Reset to default"
                      style={{ fontSize: 11 }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Memory */}
            {activeSection === 'memory' && (
              <div className="settings-section">
                <h3>JARVIS Memory</h3>
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                    {[
                      ['Facts', memory.facts.length, '📌'],
                      ['Routines', memory.routines.length, '🔄'],
                      ['Topics', memory.recentTopics.length, '💬'],
                    ].map(([l, v, i]) => (
                      <div key={l}>
                        <div style={{ fontSize: 20 }}>{i}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', fontFamily: 'Orbitron, monospace' }}>{v}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {memory.facts.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Stored Facts</div>
                    {memory.facts.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <span>{f.category === 'preference' ? '❤️' : '📌'}</span>
                        <span style={{ flex: 1, color: 'var(--text3)' }}>{f.text}</span>
                        <span style={{ fontSize: 10, color: 'var(--text2)' }}>{new Date(f.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="settings-row">
                  <div>
                    <div className="settings-label" style={{ color: 'var(--red)' }}>Clear All Memory</div>
                    <div className="settings-desc">Remove all facts, routines, and topics JARVIS has learned</div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm('Clear all JARVIS memory? This cannot be undone.')) clearMemory()
                    }}
                  >
                    Clear Memory
                  </button>
                </div>
              </div>
            )}

            {/* Sync */}
            {activeSection === 'sync' && (
              <div className="settings-section">
                <h3>Cloud Sync</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  Settings, memory, calendar/email context, and conversation history are saved to Vercel Blob. Use a shared sync code if you want multiple devices to open the exact same assistant.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <div className="settings-label" style={{ marginBottom: 6 }}>Shared Sync Code</div>
                  <div className="settings-desc" style={{ marginBottom: 10 }}>
                    Generate one here or paste the same code on another device. Devices using the same code will share the same memory, settings, and conversations.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      type="text"
                      value={syncCodeInput}
                      onChange={e => setSyncCodeInput(normalizeSyncCode(e.target.value))}
                      placeholder="jarvis-your-shared-code"
                      style={{ fontSize: 13, flex: '1 1 260px' }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => applySyncCode()} disabled={syncing}>
                      Use Code
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => generateAndApplySyncCode()} disabled={syncing}>
                      Generate
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => copySyncCode()}>
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 18, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <div><strong style={{ color: 'var(--text3)' }}>Active storage key:</strong> <code>{storageKey}</code></div>
                  <div style={{ marginTop: 6 }}><strong style={{ color: 'var(--text3)' }}>This device ID:</strong> <code>{deviceId}</code></div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => pushSync()}
                    disabled={syncing}
                    style={{ flex: 1 }}
                  >
                    {syncing ? '⏳ Saving…' : '☁️ Save Now'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => pullSync()}
                    disabled={syncing}
                    style={{ flex: 1 }}
                  >
                    ⬇️ Reload Cloud State
                  </button>
                </div>

                {lastSynced && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                    Last synced: {new Date(lastSynced).toLocaleString()}
                  </div>
                )}

                {syncStatus && (
                  <div style={{
                    padding: '10px 14px',
                    background: syncStatus.startsWith('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${syncStatus.startsWith('✓') ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                  }}>
                    {syncStatus}
                  </div>
                )}

                <div style={{ marginTop: 20, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text3)' }}>How it works:</strong> JARVIS keeps your local settings responsive while you edit. Use <strong>Save Now</strong> when you want to push the latest settings immediately, and the rest of the assistant state still persists in the background. If no sync code is set, each device keeps its own assistant identity. If you set the same sync code on multiple devices, they all read and write the same cloud state and Blob conversation history. Blob overflow still archives older conversations to Google Drive once usage passes 80%, as long as Drive is connected.
                </div>

                {/* Google Drive — conversation history */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🗂️ Google Drive — Conversation History</h4>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
                    Saves every JARVIS conversation to your Google Drive (private app folder). On each new session, the last 3 conversations are loaded so JARVIS has full continuity across time and devices.
                  </p>

                  <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
                    <div className="settings-label">Google OAuth Client ID</div>
                    <div className="settings-desc">
                      Create a project at <strong>console.cloud.google.com</strong> → Enable Drive API → Credentials → OAuth 2.0 Web Client → add <code style={{ fontSize: 11, background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>https://jarvis-dashboard-fawn.vercel.app</code> as authorized origin → paste Client ID here.
                    </div>
                    <input
                      className="input"
                      type="text"
                      placeholder="1234567890-abc...apps.googleusercontent.com"
                      value={settings.googleClientId || ''}
                      onChange={e => save('googleClientId', e.target.value)}
                      style={{ fontSize: 12, fontFamily: 'monospace' }}
                    />
                  </div>

                  {settings.googleClientId && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, lineHeight: 1.7 }}>
                      Client ID saved. Open the <strong style={{ color: 'var(--text3)' }}>JARVIS tab</strong> — you'll see a ☁️ button in the header. Tap it to sign in with Google and start saving conversations automatically.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
