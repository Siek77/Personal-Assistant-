import { useState, useEffect } from 'react'
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

// ── Widget catalog ─────────────────────────────────────────────────────────────
const WIDGET_CATALOG = {
  clock:        { label: 'Clock',          icon: '🕐', wide: false },
  system:       { label: 'System Stats',   icon: '💻', wide: false },
  memory:       { label: 'JARVIS Memory',  icon: '🧠', wide: false },
  weather:      { label: 'Weather',        icon: '🌤️', wide: true  },
  quickactions: { label: 'Quick Actions',  icon: '⚡', wide: true  },
  esp32:        { label: 'ESP32 Sensors',  icon: '📡', wide: true  },
  uptime:       { label: 'Uptime Monitor', icon: '🟢', wide: true  },
  notion:       { label: 'Notion',         icon: '📝', wide: true  },
  news:         { label: 'Headlines',      icon: '📰', wide: true  },
}
const DEFAULT_LAYOUT = Object.keys(WIDGET_CATALOG).map(id => ({ id, visible: true }))

// ── Weather Widget ─────────────────────────────────────────────────────────────

function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [alerts, setAlerts] = useState(null) // null = not loaded yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('forecast')

  const fetchWeather = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
        `&hourly=temperature_2m,weather_code&forecast_days=2` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago`
      )
      const data = await res.json()
      setWeather(data.current)
      setForecastData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchAlerts = async () => {
    try {
      const r = await fetch(
        `https://api.weather.gov/alerts/active?point=${WEATHER_LAT},${WEATHER_LON}`,
        { headers: { 'Accept': 'application/geo+json' } }
      )
      if (r.ok) {
        const data = await r.json()
        setAlerts(data.features || [])
      } else {
        setAlerts([])
      }
    } catch {
      setAlerts([])
    }
  }

  useEffect(() => { fetchWeather() }, [])

  useEffect(() => {
    if (expanded && alerts === null) fetchAlerts()
  }, [expanded])

  // Next 12 hours from now
  const hourlySlice = (() => {
    if (!forecastData?.hourly) return []
    const now = new Date()
    const times = forecastData.hourly.time
    let startIdx = 0
    for (let i = 0; i < times.length; i++) {
      if (new Date(times[i]) >= now) { startIdx = i; break }
    }
    return times.slice(startIdx, startIdx + 12).map((t, i) => ({
      time: new Date(t),
      temp: forecastData.hourly.temperature_2m[startIdx + i],
      code: forecastData.hourly.weather_code[startIdx + i],
    }))
  })()

  const alertCount = alerts ? alerts.length : 0

  return (
    <div className="widget">
      {/* Header */}
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: weather ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🌤️</span> Weather — {WEATHER_LABEL}
          {alertCount > 0 && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>
              ⚠️ {alertCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchWeather} title="Refresh">{loading ? '...' : '⟳'}</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse' : 'Expand forecast'}
            style={{ fontSize: 10 }}
          >
            {expanded ? '▲' : '▼ Forecast'}
          </button>
        </div>
      </div>

      {loading && !weather && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading...</div>}
      {error && !loading && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>}

      {/* Current conditions */}
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

      {/* Expanded panel */}
      {expanded && (
        <div style={{ marginTop: 14 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {[
              { id: 'forecast', label: '7-Day' },
              { id: 'hourly',   label: 'Hourly' },
              { id: 'alerts',   label: alertCount > 0 ? `⚠️ Alerts (${alertCount})` : 'Alerts' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '5px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  background: tab === t.id ? 'var(--blue)' : 'var(--bg3)',
                  color: tab === t.id ? '#fff' : 'var(--text2)',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 7-Day Forecast */}
          {tab === 'forecast' && forecastData?.daily && (
            <div>
              {forecastData.daily.time.map((date, i) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < forecastData.daily.time.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ width: 40, fontSize: 12, color: i === 0 ? 'var(--blue)' : 'var(--text2)', flexShrink: 0, fontWeight: i === 0 ? 600 : 400 }}>
                    {i === 0 ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: 20, width: 26, flexShrink: 0 }}>{wmoIcon(forecastData.daily.weather_code[i])}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>{wmoDesc(forecastData.daily.weather_code[i])}</span>
                  {(forecastData.daily.precipitation_probability_max[i] || 0) > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--cyan)', marginRight: 4, flexShrink: 0 }}>
                      💧{forecastData.daily.precipitation_probability_max[i]}%
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
                    {Math.round(forecastData.daily.temperature_2m_max[i])}°
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 30, textAlign: 'right', flexShrink: 0 }}>
                    {Math.round(forecastData.daily.temperature_2m_min[i])}°
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Hourly */}
          {tab === 'hourly' && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
              {hourlySlice.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading hourly data…</div>
              )}
              {hourlySlice.map((h, i) => (
                <div key={i} style={{
                  textAlign: 'center', minWidth: 54, padding: '10px 6px',
                  background: i === 0 ? 'rgba(59,130,246,0.1)' : 'var(--bg3)',
                  borderRadius: 8, flexShrink: 0,
                  border: i === 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>
                    {i === 0 ? 'Now' : h.time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}
                  </div>
                  <div style={{ fontSize: 22 }}>{wmoIcon(h.code)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>
                    {Math.round(h.temp)}°
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alerts */}
          {tab === 'alerts' && (
            <div>
              {alerts === null && (
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading alerts…</div>
              )}
              {alerts !== null && alerts.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>No active weather alerts for this area</span>
                </div>
              )}
              {alerts !== null && alerts.map(a => (
                <div key={a.id} style={{
                  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, marginBottom: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                    ⚠️ {a.properties?.event}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                    {a.properties?.headline}
                  </div>
                  {a.properties?.expires && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
                      Expires: {new Date(a.properties.expires).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Clock Widget ───────────────────────────────────────────────────────────────

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

// ── Quick Actions Widget ───────────────────────────────────────────────────────

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
    <div className="widget">
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

// ── System Stats Widget ────────────────────────────────────────────────────────

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

// ── News Widget ────────────────────────────────────────────────────────────────

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
    <div className="widget">
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

// ── Memory Stats Widget ────────────────────────────────────────────────────────

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

// ── ESP32 Sensor Widget ────────────────────────────────────────────────────────

function ESP32SensorWidget() {
  const [sensors, setSensors] = useState([])
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
      <div className="widget">
        <div className="widget-header"><span>📡</span> ESP32 Sensors</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add sensor-type ESP32 devices in the ESP32 tab to see live readings here.</div>
      </div>
    )
  }

  return (
    <div className="widget">
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

// ── Uptime Widget ──────────────────────────────────────────────────────────────

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
      <div className="widget">
        <div className="widget-header"><span>🟢</span> Uptime Monitor</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add URLs to monitor in Settings → Uptime.</div>
      </div>
    )
  }

  const allUp = results.length > 0 && results.every(r => r.status === 'up')
  const anyDown = results.some(r => r.status === 'down')

  return (
    <div className="widget">
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

// ── Notion Widget ──────────────────────────────────────────────────────────────

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
      const metaRes = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey },
        body: JSON.stringify({ action: 'get_database', databaseId }),
      })
      const meta = await metaRes.json()
      if (meta.title) setDbName(meta.title?.[0]?.plain_text || '')

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
      <div className="widget">
        <div className="widget-header"><span>📝</span> Notion</div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add Notion API key and Database ID in Settings → Notion to see your database here.</div>
      </div>
    )
  }

  return (
    <div className="widget">
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function DashboardTab() {
  const { settings, updateSetting } = useSettings()
  const [editMode, setEditMode] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  // Compute layout from saved settings, merging in any new widgets
  const layout = (() => {
    try {
      const saved = settings.dashboardLayout ? JSON.parse(settings.dashboardLayout) : null
      if (saved && Array.isArray(saved)) {
        const savedIds = new Set(saved.map(w => w.id))
        const newWidgets = Object.keys(WIDGET_CATALOG)
          .filter(id => !savedIds.has(id))
          .map(id => ({ id, visible: true }))
        return [...saved, ...newWidgets]
      }
    } catch {}
    return DEFAULT_LAYOUT
  })()

  const saveLayout = (newLayout) => {
    updateSetting('dashboardLayout', JSON.stringify(newLayout))
  }

  const handleDrop = (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) {
      setHoverIdx(null)
      return
    }
    const next = [...layout]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)
    saveLayout(next)
    setDragIdx(null)
    setHoverIdx(null)
  }

  const toggleWidget = (id) => {
    saveLayout(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  const handleJarvisAction = (prompt) => {
    sessionStorage.setItem('jarvis_autoPrompt', prompt)
    alert(`JARVIS prompt ready: "${prompt.slice(0, 50)}…" — switch to the JARVIS tab!`)
  }

  const renderWidget = (id) => {
    switch (id) {
      case 'clock':        return <ClockWidget />
      case 'system':       return <SystemStatsWidget />
      case 'memory':       return <MemoryStatsWidget />
      case 'weather':      return <WeatherWidget />
      case 'quickactions': return <QuickActionsWidget onJarvisPrompt={handleJarvisAction} />
      case 'esp32':        return <ESP32SensorWidget />
      case 'uptime':       return <UptimeWidget uptimeUrlsJson={settings.uptimeUrls} />
      case 'notion':       return <NotionWidget apiKey={settings.notionApiKey} databaseId={settings.notionDatabaseId} />
      case 'news':         return <NewsWidget apiKey={settings.newsApiKey} />
      default:             return null
    }
  }

  return (
    <div className="dashboard-shell">
      {/* Header */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--purple)' }}>📊 Dashboard</h2>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Command center</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {editMode && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditMode(false)}>
              ✓ Done
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setEditMode(e => !e)}
            title="Customize dashboard layout"
          >
            {editMode ? '✕ Cancel' : '⚙ Customize'}
          </button>
        </div>
      </div>

      {editMode && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⣿</span> Drag widgets to reorder · click <strong>👁</strong> to show/hide
        </div>
      )}

      <div className="dashboard-grid">
        {layout.map(({ id, visible }, idx) => {
          const cfg = WIDGET_CATALOG[id]
          if (!cfg) return null
          if (!visible && !editMode) return null

          const isBeingDragged = hoverIdx === idx && dragIdx !== null && dragIdx !== idx

          return (
            <div
              key={id}
              className={cfg.wide ? 'widget-wide' : ''}
              draggable={editMode}
              onDragStart={() => { setDragIdx(idx) }}
              onDragOver={e => { e.preventDefault(); setHoverIdx(idx) }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setHoverIdx(null) }}
              style={{
                position: 'relative',
                opacity: dragIdx === idx ? 0.35 : (editMode && !visible ? 0.45 : 1),
                filter: editMode && !visible ? 'grayscale(0.8)' : 'none',
                outline: isBeingDragged ? '2px dashed var(--blue)' : editMode ? '1px dashed var(--border2)' : 'none',
                outlineOffset: 2,
                borderRadius: 12,
                transition: 'opacity 0.15s, outline 0.1s',
                cursor: editMode ? 'grab' : 'default',
              }}
            >
              {renderWidget(id)}

              {/* Edit mode overlay controls */}
              {editMode && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  display: 'flex', gap: 4, zIndex: 20,
                }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '3px 8px', fontSize: 14, lineHeight: 1, background: 'var(--bg2)' }}
                    onClick={e => { e.stopPropagation(); toggleWidget(id) }}
                    title={visible ? 'Hide widget' : 'Show widget'}
                  >
                    {visible ? '👁' : '🙈'}
                  </button>
                  <div
                    style={{
                      padding: '3px 8px', background: 'var(--bg2)', border: '1px solid var(--border)',
                      borderRadius: 6, cursor: 'grab', fontSize: 14, lineHeight: 1,
                      display: 'flex', alignItems: 'center', color: 'var(--text2)',
                    }}
                    title="Drag to reorder"
                  >
                    ⣿
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
