import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

// WMO weather code → emoji (Open-Meteo)
function wmoIcon(code) {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}
function wmoDesc(code) {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  return 'Thunderstorm'
}

const SAMPLE_NEWS = [
  { title: 'Tech Giants Report Record Q1 Earnings', source: 'TechCrunch', time: '2h ago', url: '#' },
  { title: 'New AI Models Show Breakthrough in Reasoning', source: 'Wired', time: '4h ago', url: '#' },
  { title: 'ESP32-S3 Gets Major Firmware Update', source: 'Hackaday', time: '6h ago', url: '#' },
  { title: 'Spotify Launches New Discovery Features', source: 'The Verge', time: '8h ago', url: '#' },
  { title: 'Apple Announces iOS 19 Developer Preview', source: 'MacRumors', time: '12h ago', url: '#' },
]

// Lostant, IL — lat/lon fixed (no API key, no geocoding needed)
const WEATHER_LAT = 41.1836
const WEATHER_LON = -89.0651
const WEATHER_LABEL = 'Lostant, IL'

function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchWeather = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`
      )
      const data = await res.json()
      setWeather(data.current)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWeather() }, [])

  return (
    <div className="widget widget-wide">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>🌤️</span> Weather — {WEATHER_LABEL}</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchWeather}>{loading ? '...' : '⟳'}</button>
      </div>
      {loading && !weather && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading...</div>}
      {error && !loading && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>}
      {weather && (
        <div className="weather-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div className="weather-icon">{wmoIcon(weather.weather_code)}</div>
            <div>
              <div className="weather-temp">{Math.round(weather.temperature_2m)}°F</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{wmoDesc(weather.weather_code)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                Feels {Math.round(weather.apparent_temperature)}° · 💧{weather.relative_humidity_2m}% · 💨{Math.round(weather.wind_speed_10m)}mph
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClockWidget() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <div className="widget">
      <div className="widget-header"><span>🕐</span> Time</div>
      <div className="stat-value" style={{ fontSize: 28, letterSpacing: 2 }}>
        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div className="stat-label">
        {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  )
}

function QuickActionsWidget({ onJarvisPrompt }) {
  const actions = [
    { icon: '☀️', label: "Briefing", prompt: "Give me a morning briefing — what should I know and focus on today?" },
    { icon: '📋', label: 'Routine', prompt: "Summarize my known routines and suggest optimizations." },
    { icon: '💡', label: 'Suggest', prompt: "Based on what you know about me, what do you suggest I do right now?" },
    { icon: '🎯', label: 'Focus', prompt: "Help me get into focus mode. What should I prioritize?" },
    { icon: '🌙', label: 'Evening', prompt: "Give me an evening wind-down routine based on my preferences." },
    { icon: '⚡', label: 'Facts', prompt: "What interesting things do you know about me so far?" },
  ]
  return (
    <div className="widget widget-wide">
      <div className="widget-header"><span>⚡</span> Quick JARVIS Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {actions.map(a => (
          <div key={a.label} className="qa-btn" onClick={() => onJarvisPrompt(a.prompt)}>
            <div className="qa-icon">{a.icon}</div>
            <div style={{ fontSize: 12 }}>{a.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemStatsWidget() {
  const [stats] = useState({
    uptime: Math.floor(Math.random() * 48 + 1) + 'h',
    memory: Math.floor(Math.random() * 30 + 30),
    cpu: Math.floor(Math.random() * 20 + 5),
  })
  return (
    <div className="widget">
      <div className="widget-header"><span>💻</span> System</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['CPU', `${stats.cpu}%`, stats.cpu], ['RAM', `${stats.memory}%`, stats.memory]].map(([l, v, pct]) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text2)' }}>{l}</span>
              <span style={{ color: 'var(--text)' }}>{v}</span>
            </div>
            <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--red)' : 'var(--blue)', borderRadius: 2 }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text2)' }}>Uptime</span>
          <span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>{stats.uptime}</span>
        </div>
      </div>
    </div>
  )
}

function NewsWidget({ apiKey }) {
  const [news, setNews] = useState(SAMPLE_NEWS)
  const [loading, setLoading] = useState(false)

  const fetchNews = async () => {
    if (!apiKey) return
    setLoading(true)
    try {
      const res = await fetch('/api/news')
      const data = await res.json()
      if (data.articles) {
        setNews(data.articles.map(a => ({
          title: a.title, source: a.source.name,
          time: new Date(a.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          url: a.url,
        })))
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchNews() }, [apiKey])

  return (
    <div className="widget widget-wide">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📰</span> Headlines</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchNews}>{loading ? '...' : '⟳'}</button>
      </div>
      {news.map((n, i) => (
        <div key={i} className="news-item" onClick={() => n.url !== '#' && window.open(n.url, '_blank')}>
          <div className="news-headline">{n.title}</div>
          <div className="news-meta">{n.source} · {n.time}</div>
        </div>
      ))}
      {!apiKey && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>Add NewsAPI key in Settings for live news.</p>}
    </div>
  )
}

function MemoryStatsWidget() {
  const { memory } = useMemory()
  return (
    <div className="widget">
      <div className="widget-header"><span>🧠</span> JARVIS Memory</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['Facts', memory.facts.length, 'var(--blue)'],
          ['Routines', memory.routines.length, 'var(--purple)'],
          ['Topics', memory.recentTopics.length, 'var(--cyan)'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{l}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: 'Orbitron, monospace' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ESP32 Sensor Widget ───────────────────────────────────────────────────────

function ESP32SensorWidget() {
  const [sensors, setSensors] = useState([]) // [{device, data, error, loading}]
  const [fetching, setFetching] = useState(false)

  const fetchAllSensors = async () => {
    try {
      const devices = JSON.parse(localStorage.getItem('jarvis_esp32') || '[]')
      const sensorDevices = devices.filter(d => d.type === 'sensor')
      if (sensorDevices.length === 0) { setSensors([]); return }
      setFetching(true)
      const results = await Promise.all(
        sensorDevices.map(async (device) => {
          try {
            const r = await fetch(`http://${device.ip}/sensors`, { signal: AbortSignal.timeout(4000) })
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const data = await r.json()
            return { device, data, error: null }
          } catch (e) {
            return { device, data: null, error: e.message }
          }
        })
      )
      setSensors(results)
    } catch {}
    setFetching(false)
  }

  useEffect(() => { fetchAllSensors() }, [])

  const devices = JSON.parse(localStorage.getItem('jarvis_esp32') || '[]')
  const sensorDevices = devices.filter(d => d.type === 'sensor')

  if (sensorDevices.length === 0) {
    return (
      <div className="widget widget-wide">
        <div className="widget-header"><span>📡</span> ESP32 Sensors</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add sensor-type ESP32 devices in the ESP32 tab to see live readings here.</div>
      </div>
    )
  }

  return (
    <div className="widget widget-wide">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📡</span> ESP32 Sensors</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAllSensors}>{fetching ? '...' : '⟳'}</button>
      </div>
      {sensors.length === 0 && fetching && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Reading sensors…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sensors.map(({ device, data, error }) => (
          <div key={device.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 4 }}>{device.name}</div>
            {error && <div style={{ fontSize: 11, color: '#ef4444' }}>⚠️ {error}</div>}
            {data && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {Object.entries(data).filter(([k]) => k !== 'time').map(([k, v]) => (
                  <div key={k} style={{ fontSize: 11, color: 'var(--text2)' }}>
                    <span style={{ color: 'var(--text3)' }}>{k}:</span>{' '}
                    <span style={{ color: 'var(--cyan)', fontFamily: 'monospace' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Uptime Widget ─────────────────────────────────────────────────────────────

function UptimeWidget({ uptimeUrlsJson }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)

  let urls = []
  try { urls = JSON.parse(uptimeUrlsJson || '[]') } catch {}

  const check = async () => {
    if (urls.length === 0) return
    setLoading(true)
    try {
      const r = await fetch('/api/uptime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await r.json()
      setResults(data.results || [])
      setCheckedAt(data.checkedAt)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { check() }, [uptimeUrlsJson])

  if (urls.length === 0) {
    return (
      <div className="widget widget-wide">
        <div className="widget-header"><span>🟢</span> Uptime Monitor</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add URLs to monitor in Settings → Uptime.</div>
      </div>
    )
  }

  const allUp = results.length > 0 && results.every(r => r.status === 'up')
  const anyDown = results.some(r => r.status === 'down')

  return (
    <div className="widget widget-wide">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{allUp ? '🟢' : anyDown ? '🔴' : '🟡'}</span> Uptime Monitor
        </div>
        <button className="btn btn-ghost btn-sm" onClick={check}>{loading ? '...' : '⟳'}</button>
      </div>
      {loading && results.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Checking…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map((r) => (
          <div key={r.url} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10 }}>{r.status === 'up' ? '🟢' : '🔴'}</span>
            <span style={{ fontSize: 12, flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.label || r.url}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: r.status === 'up' ? 'var(--green)' : '#ef4444', flexShrink: 0 }}>
              {r.status === 'up' ? `${r.latency}ms` : r.error || 'down'}
            </span>
          </div>
        ))}
        {/* Placeholder rows while loading */}
        {loading && results.length === 0 && urls.map(u => (
          <div key={u.url} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10 }}>⏳</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{u.label || u.url}</span>
          </div>
        ))}
      </div>
      {checkedAt && !loading && (
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6 }}>
          Checked {new Date(checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

// ── Notion Widget ─────────────────────────────────────────────────────────────

function NotionWidget({ apiKey, databaseId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dbName, setDbName] = useState('')

  const fetchItems = async () => {
    if (!apiKey || !databaseId) return
    setLoading(true)
    setError(null)
    try {
      // Get database metadata
      const metaRes = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey },
        body: JSON.stringify({ action: 'get_database', databaseId }),
      })
      const meta = await metaRes.json()
      if (meta.title) setDbName(meta.title?.[0]?.plain_text || '')

      // Query items
      const r = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey },
        body: JSON.stringify({ action: 'query', databaseId, page_size: 10 }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || 'Notion query failed')
      setItems(data.results || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [apiKey, databaseId])

  const getTitle = (page) => {
    const props = page.properties || {}
    for (const [, prop] of Object.entries(props)) {
      if (prop.type === 'title' && prop.title?.[0]?.plain_text) {
        return prop.title[0].plain_text
      }
    }
    return 'Untitled'
  }

  const getStatus = (page) => {
    const props = page.properties || {}
    for (const [, prop] of Object.entries(props)) {
      if (prop.type === 'status') return prop.status?.name || ''
      if (prop.type === 'select') return prop.select?.name || ''
      if (prop.type === 'checkbox') return prop.checkbox ? '✓' : ''
    }
    return ''
  }

  if (!apiKey || !databaseId) {
    return (
      <div className="widget widget-wide">
        <div className="widget-header"><span>📝</span> Notion</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add Notion API key and Database ID in Settings → Notion to see your database here.</div>
      </div>
    )
  }

  return (
    <div className="widget widget-wide">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📝</span> {dbName || 'Notion'}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchItems}>{loading ? '...' : '⟳'}</button>
      </div>
      {loading && items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(item => {
          const status = getStatus(item)
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getTitle(item)}
              </span>
              {status && (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)', flexShrink: 0 }}>
                  {status}
                </span>
              )}
            </div>
          )
        })}
        {items.length === 0 && !loading && !error && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>No items found in this database.</div>
        )}
      </div>
    </div>
  )
}

// ── Apple Music Widget ────────────────────────────────────────────────────────

function AppleMusicWidget({ developerToken }) {
  const [status, setStatus] = useState('idle') // 'idle'|'loading'|'authorized'|'error'
  const [nowPlaying, setNowPlaying] = useState(null)
  const mkRef = useRef(null)
  const pollRef = useRef(null)

  const loadMusicKit = () => new Promise((resolve, reject) => {
    if (window.MusicKit) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
    s.onload = () => {
      document.addEventListener('musickitloaded', resolve, { once: true })
    }
    s.onerror = reject
    document.head.appendChild(s)
  })

  const connect = async () => {
    if (!developerToken) return
    setStatus('loading')
    try {
      await loadMusicKit()
      await window.MusicKit.configure({ developerToken, app: { name: 'JARVIS Dashboard', build: '1.0.0' } })
      mkRef.current = window.MusicKit.getInstance()
      await mkRef.current.authorize()
      setStatus('authorized')
      startPolling()
    } catch (e) {
      setStatus('error')
    }
  }

  const startPolling = () => {
    const poll = () => {
      if (!mkRef.current) return
      const np = mkRef.current.nowPlayingItem
      setNowPlaying(np ? {
        title: np.title,
        artist: np.artistName,
        album: np.albumName,
        artwork: np.artwork?.url(100, 100),
        isPlaying: mkRef.current.playbackState === 2,
      } : null)
    }
    poll()
    pollRef.current = setInterval(poll, 5000)
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  const togglePlay = async () => {
    if (!mkRef.current) return
    if (mkRef.current.playbackState === 2) await mkRef.current.pause()
    else await mkRef.current.play()
    setNowPlaying(np => np ? { ...np, isPlaying: !np?.isPlaying } : null)
  }

  if (!developerToken) {
    return (
      <div className="widget widget-wide">
        <div className="widget-header"><span>🎵</span> Apple Music</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Add your Apple Music MusicKit Developer Token in Settings → Apple Music to connect.
        </div>
      </div>
    )
  }

  return (
    <div className="widget widget-wide">
      <div className="widget-header"><span>🎵</span> Apple Music</div>

      {status === 'idle' && (
        <button className="btn btn-primary btn-sm" onClick={connect}
          style={{ background: '#fc3c44', borderColor: '#fc3c44', fontSize: 12 }}>
          Connect Apple Music
        </button>
      )}
      {status === 'loading' && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Connecting…</div>}
      {status === 'error' && (
        <div style={{ fontSize: 12, color: '#ef4444' }}>
          ⚠️ Connection failed — check your developer token.
          <button className="btn btn-ghost btn-sm" onClick={connect} style={{ marginLeft: 8, fontSize: 11 }}>Retry</button>
        </div>
      )}

      {status === 'authorized' && (
        <div>
          {nowPlaying ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {nowPlaying.artwork && (
                <img src={nowPlaying.artwork} alt="art" style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nowPlaying.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {nowPlaying.artist} · {nowPlaying.album}
                </div>
              </div>
              <button
                onClick={togglePlay}
                style={{ width: 32, height: 32, borderRadius: '50%', background: '#fc3c44', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
              >
                {nowPlaying.isPlaying ? '⏸' : '▶'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Nothing playing right now.</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 6 }}>● Connected to Apple Music</div>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardTab() {
  const { settings } = useSettings()

  const handleJarvisAction = (prompt) => {
    sessionStorage.setItem('jarvis_autoPrompt', prompt)
    alert(`JARVIS prompt ready: "${prompt.slice(0, 50)}…" — switch to the JARVIS tab!`)
  }

  return (
    <div className="dashboard-shell">
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--purple)' }}>📊 Dashboard</h2>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Command center</div>
      </div>
      <div className="dashboard-grid">
        <ClockWidget />
        <SystemStatsWidget />
        <MemoryStatsWidget />
        <WeatherWidget />
        <QuickActionsWidget onJarvisPrompt={handleJarvisAction} />
        <ESP32SensorWidget />
        <UptimeWidget uptimeUrlsJson={settings.uptimeUrls} />
        <NotionWidget apiKey={settings.notionApiKey} databaseId={settings.notionDatabaseId} />
        <AppleMusicWidget developerToken={settings.appleMusicDeveloperToken} />
        <NewsWidget apiKey={settings.newsApiKey} />
      </div>
    </div>
  )
}
