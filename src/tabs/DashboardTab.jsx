import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

// ── WMO helpers ────────────────────────────────────────────────────────────────
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

const WEATHER_LAT = 41.1836
const WEATHER_LON = -89.0651
const WEATHER_LABEL = 'Lostant, IL'

// ── Widget catalog ─────────────────────────────────────────────────────────────
const WIDGET_CATALOG = {
  clock:        { label: 'Clock',          icon: '🕐' },
  system:       { label: 'System Stats',   icon: '💻' },
  memory:       { label: 'JARVIS Memory',  icon: '🧠' },
  weather:      { label: 'Weather',        icon: '🌤️' },
  quickactions: { label: 'Quick Actions',  icon: '⚡' },
  esp32:        { label: 'ESP32 Sensors',  icon: '📡' },
  uptime:       { label: 'Uptime Monitor', icon: '🟢' },
  notion:       { label: 'Notion',         icon: '📝' },
  news:         { label: 'Headlines',      icon: '📰' },
}

// Generate default layout positions based on available canvas width
function getDefaultLayout(canvasW) {
  const half  = Math.max(280, Math.floor((canvasW - 12) / 2))
  const third = Math.max(160, Math.floor((canvasW - 24) / 3))
  const c2 = half  + 12
  const s2 = third + 12
  const s3 = third * 2 + 24
  return [
    { id: 'clock',        x: 0,   y: 0,   w: third },
    { id: 'system',       x: s2,  y: 0,   w: third },
    { id: 'memory',       x: s3,  y: 0,   w: third },
    { id: 'weather',      x: 0,   y: 152, w: half  },
    { id: 'quickactions', x: c2,  y: 152, w: half  },
    { id: 'esp32',        x: 0,   y: 372, w: half  },
    { id: 'uptime',       x: c2,  y: 372, w: half  },
    { id: 'notion',       x: 0,   y: 592, w: half  },
    { id: 'news',         x: c2,  y: 592, w: half  },
  ]
}

// ── WeatherWidget ──────────────────────────────────────────────────────────────
function WeatherWidget() {
  const [weather, setWeather] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('forecast')

  const fetchWeather = async () => {
    setLoading(true); setError(null)
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
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const fetchAlerts = async () => {
    try {
      const r = await fetch(`https://api.weather.gov/alerts/active?point=${WEATHER_LAT},${WEATHER_LON}`, { headers: { Accept: 'application/geo+json' } })
      setAlerts(r.ok ? (await r.json()).features || [] : [])
    } catch { setAlerts([]) }
  }

  useEffect(() => { fetchWeather() }, [])
  useEffect(() => { if (expanded && alerts === null) fetchAlerts() }, [expanded])

  const hourlySlice = (() => {
    if (!forecastData?.hourly) return []
    const now = new Date()
    const times = forecastData.hourly.time
    let i = 0
    while (i < times.length && new Date(times[i]) < now) i++
    return times.slice(i, i + 12).map((t, j) => ({
      time: new Date(t),
      temp: forecastData.hourly.temperature_2m[i + j],
      code: forecastData.hourly.weather_code[i + j],
    }))
  })()

  return (
    <div className="widget">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: weather ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🌤️</span> Weather — {WEATHER_LABEL}
          {alerts?.length > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>⚠️ {alerts.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchWeather}>{loading ? '...' : '⟳'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => !e)} style={{ fontSize: 10 }}>{expanded ? '▲' : '▼ Forecast'}</button>
        </div>
      </div>

      {loading && !weather && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading...</div>}
      {error && !loading && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>}
      {weather && (
        <div className="weather-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
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

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {[{ id: 'forecast', label: '7-Day' }, { id: 'hourly', label: 'Hourly' }, { id: 'alerts', label: alerts?.length > 0 ? `⚠️ Alerts (${alerts.length})` : 'Alerts' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 13px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: tab === t.id ? 'var(--blue)' : 'var(--bg3)', color: tab === t.id ? '#fff' : 'var(--text2)', transition: 'all 0.15s' }}>{t.label}</button>
            ))}
          </div>

          {tab === 'forecast' && forecastData?.daily && (
            <div>
              {forecastData.daily.time.map((date, i) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < forecastData.daily.time.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ width: 40, fontSize: 12, color: i === 0 ? 'var(--blue)' : 'var(--text2)', flexShrink: 0, fontWeight: i === 0 ? 600 : 400 }}>{i === 0 ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span style={{ fontSize: 20, width: 26, flexShrink: 0 }}>{wmoIcon(forecastData.daily.weather_code[i])}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>{wmoDesc(forecastData.daily.weather_code[i])}</span>
                  {(forecastData.daily.precipitation_probability_max[i] || 0) > 0 && <span style={{ fontSize: 11, color: 'var(--cyan)', flexShrink: 0 }}>💧{forecastData.daily.precipitation_probability_max[i]}%</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 34, textAlign: 'right', flexShrink: 0 }}>{Math.round(forecastData.daily.temperature_2m_max[i])}°</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 30, textAlign: 'right', flexShrink: 0 }}>{Math.round(forecastData.daily.temperature_2m_min[i])}°</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'hourly' && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
              {hourlySlice.map((h, i) => (
                <div key={i} style={{ textAlign: 'center', minWidth: 54, padding: '10px 6px', background: i === 0 ? 'rgba(59,130,246,0.1)' : 'var(--bg3)', borderRadius: 8, flexShrink: 0, border: i === 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>{i === 0 ? 'Now' : h.time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}</div>
                  <div style={{ fontSize: 22 }}>{wmoIcon(h.code)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>{Math.round(h.temp)}°</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'alerts' && (
            <div>
              {alerts === null && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading alerts…</div>}
              {alerts?.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}><span>✅</span><span style={{ fontSize: 13, color: 'var(--text2)' }}>No active weather alerts</span></div>}
              {alerts?.map(a => (
                <div key={a.id} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ {a.properties?.event}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{a.properties?.headline}</div>
                  {a.properties?.expires && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>Expires: {new Date(a.properties.expires).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ClockWidget ────────────────────────────────────────────────────────────────
function ClockWidget() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <div className="widget">
      <div className="widget-header"><span>🕐</span> Time</div>
      <div className="stat-value" style={{ fontSize: 28, letterSpacing: 2 }}>{time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      <div className="stat-label">{time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  )
}

// ── QuickActionsWidget ─────────────────────────────────────────────────────────
function QuickActionsWidget({ onJarvisPrompt }) {
  const actions = [
    { icon: '☀️', label: 'Briefing',  prompt: 'Give me a morning briefing — what should I know and focus on today?' },
    { icon: '📋', label: 'Routine',   prompt: 'Summarize my known routines and suggest optimizations.' },
    { icon: '💡', label: 'Suggest',   prompt: 'Based on what you know about me, what do you suggest I do right now?' },
    { icon: '🎯', label: 'Focus',     prompt: 'Help me get into focus mode. What should I prioritize?' },
    { icon: '🌙', label: 'Evening',   prompt: 'Give me an evening wind-down routine based on my preferences.' },
    { icon: '⚡', label: 'Facts',     prompt: 'What interesting things do you know about me so far?' },
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

// ── SystemStatsWidget ──────────────────────────────────────────────────────────
function SystemStatsWidget() {
  const [stats] = useState({ uptime: Math.floor(Math.random() * 48 + 1) + 'h', memory: Math.floor(Math.random() * 30 + 30), cpu: Math.floor(Math.random() * 20 + 5) })
  return (
    <div className="widget">
      <div className="widget-header"><span>💻</span> System</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['CPU', `${stats.cpu}%`, stats.cpu], ['RAM', `${stats.memory}%`, stats.memory]].map(([l, v, pct]) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--text2)' }}>{l}</span><span>{v}</span></div>
            <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2 }}><div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--red)' : 'var(--blue)', borderRadius: 2 }} /></div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}><span style={{ color: 'var(--text2)' }}>Uptime</span><span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>{stats.uptime}</span></div>
      </div>
    </div>
  )
}

// ── MemoryStatsWidget ──────────────────────────────────────────────────────────
function MemoryStatsWidget() {
  const { memory } = useMemory()
  return (
    <div className="widget">
      <div className="widget-header"><span>🧠</span> JARVIS Memory</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['Facts', memory.facts.length, 'var(--blue)'], ['Routines', memory.routines.length, 'var(--purple)'], ['Topics', memory.recentTopics.length, 'var(--cyan)']].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{l}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: 'Orbitron, monospace' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NewsWidget ─────────────────────────────────────────────────────────────────
function NewsWidget({ apiKey }) {
  const [news, setNews] = useState(SAMPLE_NEWS)
  const [loading, setLoading] = useState(false)
  const fetchNews = async () => {
    if (!apiKey) return
    setLoading(true)
    try {
      const res = await fetch('/api/news'); const data = await res.json()
      if (data.articles) setNews(data.articles.map(a => ({ title: a.title, source: a.source.name, time: new Date(a.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), url: a.url })))
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

// ── ESP32SensorWidget ──────────────────────────────────────────────────────────
function ESP32SensorWidget() {
  const [sensors, setSensors] = useState([])
  const [fetching, setFetching] = useState(false)
  const fetchAllSensors = async () => {
    try {
      const devices = JSON.parse(localStorage.getItem('jarvis_esp32') || '[]').filter(d => d.type === 'sensor')
      if (!devices.length) { setSensors([]); return }
      setFetching(true)
      const results = await Promise.all(devices.map(async device => {
        try { const r = await fetch(`http://${device.ip}/sensors`, { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return { device, data: await r.json(), error: null } }
        catch (e) { return { device, data: null, error: e.message } }
      }))
      setSensors(results)
    } catch {}
    setFetching(false)
  }
  useEffect(() => { fetchAllSensors() }, [])
  const sensorDevices = JSON.parse(localStorage.getItem('jarvis_esp32') || '[]').filter(d => d.type === 'sensor')
  if (!sensorDevices.length) return (
    <div className="widget"><div className="widget-header"><span>📡</span> ESP32 Sensors</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Add sensor-type ESP32 devices in the ESP32 tab.</div></div>
  )
  return (
    <div className="widget">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📡</span> ESP32 Sensors</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAllSensors}>{fetching ? '...' : '⟳'}</button>
      </div>
      {sensors.map(({ device, data, error }) => (
        <div key={device.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 4 }}>{device.name}</div>
          {error && <div style={{ fontSize: 11, color: '#ef4444' }}>⚠️ {error}</div>}
          {data && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{Object.entries(data).filter(([k]) => k !== 'time').map(([k, v]) => (<div key={k} style={{ fontSize: 11, color: 'var(--text2)' }}><span style={{ color: 'var(--text3)' }}>{k}:</span> <span style={{ color: 'var(--cyan)', fontFamily: 'monospace' }}>{String(v)}</span></div>))}</div>}
        </div>
      ))}
    </div>
  )
}

// ── UptimeWidget ───────────────────────────────────────────────────────────────
function UptimeWidget({ uptimeUrlsJson }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)
  let urls = []; try { urls = JSON.parse(uptimeUrlsJson || '[]') } catch {}
  const check = async () => {
    if (!urls.length) return; setLoading(true)
    try { const r = await fetch('/api/uptime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }), signal: AbortSignal.timeout(30000) }); const data = await r.json(); setResults(data.results || []); setCheckedAt(data.checkedAt) } catch {}
    setLoading(false)
  }
  useEffect(() => { check() }, [uptimeUrlsJson])
  if (!urls.length) return (
    <div className="widget"><div className="widget-header"><span>🟢</span> Uptime Monitor</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Add URLs to monitor in Settings → Uptime.</div></div>
  )
  const allUp = results.length > 0 && results.every(r => r.status === 'up')
  const anyDown = results.some(r => r.status === 'down')
  return (
    <div className="widget">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>{allUp ? '🟢' : anyDown ? '🔴' : '🟡'}</span> Uptime Monitor</div>
        <button className="btn btn-ghost btn-sm" onClick={check}>{loading ? '...' : '⟳'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map(r => (
          <div key={r.url} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10 }}>{r.status === 'up' ? '🟢' : '🔴'}</span>
            <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label || r.url}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: r.status === 'up' ? 'var(--green)' : '#ef4444', flexShrink: 0 }}>{r.status === 'up' ? `${r.latency}ms` : r.error || 'down'}</span>
          </div>
        ))}
      </div>
      {checkedAt && !loading && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6 }}>Checked {new Date(checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>}
    </div>
  )
}

// ── NotionWidget ───────────────────────────────────────────────────────────────
function NotionWidget({ apiKey, databaseId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dbName, setDbName] = useState('')
  const fetchItems = async () => {
    if (!apiKey || !databaseId) return; setLoading(true); setError(null)
    try {
      const meta = await (await fetch('/api/notion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey }, body: JSON.stringify({ action: 'get_database', databaseId }) })).json()
      if (meta.title) setDbName(meta.title?.[0]?.plain_text || '')
      const r = await fetch('/api/notion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey }, body: JSON.stringify({ action: 'query', databaseId, page_size: 10 }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.message || 'Failed'); setItems(data.results || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { fetchItems() }, [apiKey, databaseId])
  const getTitle = p => { for (const [, prop] of Object.entries(p.properties || {})) { if (prop.type === 'title' && prop.title?.[0]?.plain_text) return prop.title[0].plain_text } return 'Untitled' }
  const getStatus = p => { for (const [, prop] of Object.entries(p.properties || {})) { if (prop.type === 'status') return prop.status?.name || ''; if (prop.type === 'select') return prop.select?.name || ''; if (prop.type === 'checkbox') return prop.checkbox ? '✓' : '' } return '' }
  if (!apiKey || !databaseId) return (
    <div className="widget"><div className="widget-header"><span>📝</span> Notion</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Add Notion API key and Database ID in Settings → Notion.</div></div>
  )
  return (
    <div className="widget">
      <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📝</span> {dbName || 'Notion'}</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchItems}>{loading ? '...' : '⟳'}</button>
      </div>
      {loading && !items.length && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(item => { const status = getStatus(item); return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTitle(item)}</span>
            {status && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)', flexShrink: 0 }}>{status}</span>}
          </div>
        )})}
        {!items.length && !loading && !error && <div style={{ fontSize: 12, color: 'var(--text2)' }}>No items found.</div>}
      </div>
    </div>
  )
}

// ── CustomWidget ───────────────────────────────────────────────────────────────
function CustomWidget({ config }) {
  return (
    <div className="widget">
      <div className="widget-header"><span>{config.icon}</span> {config.title}</div>
      {config.type === 'note' && (
        <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {config.content || <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>Empty note</span>}
        </div>
      )}
      {config.type === 'link' && config.content && (
        <a href={config.content} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, textDecoration: 'none', border: '1px solid var(--border)', transition: 'border-color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <span style={{ fontSize: 28 }}>{config.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{config.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.content}</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: 16, flexShrink: 0 }}>→</span>
        </a>
      )}
    </div>
  )
}

// ── AddWidgetPanel ─────────────────────────────────────────────────────────────
function AddWidgetPanel({ layout, customWidgets, onClose, onAdd, onCreate, onDeleteCustom }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', icon: '📌', type: 'note', content: '' })

  const layoutIds = new Set(layout.map(w => w.id))
  const hiddenBuiltin = Object.entries(WIDGET_CATALOG).filter(([id]) => !layoutIds.has(id))
  const hiddenCustom  = customWidgets.filter(cw => !layoutIds.has(cw.id))

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8,
    marginBottom: 6, border: '1px solid var(--border)', cursor: 'pointer',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 310, background: 'var(--bg2)', borderLeft: '1px solid var(--border)', zIndex: 999, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.15s ease' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Add Widgets</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Hidden built-in widgets */}
        {hiddenBuiltin.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Built-in Widgets</div>
            {hiddenBuiltin.map(([id, cfg]) => (
              <div key={id} style={rowStyle}
                onClick={() => onAdd(id)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{cfg.label}</span>
                <span style={{ fontSize: 20, color: 'var(--blue)', fontWeight: 700 }}>+</span>
              </div>
            ))}
          </div>
        )}

        {/* Hidden custom widgets */}
        {hiddenCustom.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Your Custom Widgets</div>
            {hiddenCustom.map(cw => (
              <div key={cw.id} style={rowStyle}
                onClick={() => onAdd(cw.id)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 20 }}>{cw.icon}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{cw.title}</span>
                <span style={{ fontSize: 20, color: 'var(--blue)', fontWeight: 700 }}>+</span>
              </div>
            ))}
          </div>
        )}

        {hiddenBuiltin.length === 0 && hiddenCustom.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text2)', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 20 }}>
            All built-in widgets are on the canvas.
          </div>
        )}

        {/* Create custom widget */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Create New Widget</div>
          {!showForm ? (
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowForm(true)}>+ Create Widget</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" style={{ width: 56, textAlign: 'center', fontSize: 22, padding: '8px 4px' }} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} maxLength={2} placeholder="📌" />
                <input className="input" style={{ flex: 1 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Widget title" />
              </div>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, content: '' }))}>
                <option value="note">📝 Note — display text</option>
                <option value="link">🔗 Link — clickable URL card</option>
              </select>
              <textarea className="input" style={{ resize: 'vertical', minHeight: 72 }}
                value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={form.type === 'note' ? 'Enter your note text…' : 'https://example.com'}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => { if (form.title.trim()) { onCreate(form); setForm({ title: '', icon: '📌', type: 'note', content: '' }); setShowForm(false) } }} disabled={!form.title.trim()}>Create</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Manage existing custom widgets */}
          {customWidgets.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Manage Custom</div>
              {customWidgets.map(cw => (
                <div key={cw.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 4, border: '1px solid var(--border)' }}>
                  <span>{cw.icon}</span>
                  <span style={{ fontSize: 12, flex: 1, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cw.title}</span>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 8px', fontSize: 11, flexShrink: 0 }} onClick={() => onDeleteCustom(cw.id)}>✕ delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardTab() {
  const { settings, updateSetting } = useSettings()
  const [editMode, setEditMode] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [liveOffset, setLiveOffset] = useState({ x: 0, y: 0 })

  // Refs for stable window event handlers
  const dragRef       = useRef(null)  // {id, startX, startY, origX, origY, started}
  const liveOffRef    = useRef({ x: 0, y: 0 })
  const layoutRef     = useRef([])
  const updateSetRef  = useRef(updateSetting)
  updateSetRef.current = updateSetting

  // Custom widgets
  const customWidgets = (() => { try { return JSON.parse(settings.customWidgets || '[]') } catch { return [] } })()

  // Layout — visible widgets with absolute positions
  const layout = (() => {
    try {
      const saved = settings.dashboardLayout ? JSON.parse(settings.dashboardLayout) : null
      if (saved && Array.isArray(saved)) return saved
    } catch {}
    const canvasW = window.innerWidth - (window.innerWidth >= 640 ? 280 : 24)
    return getDefaultLayout(canvasW)
  })()
  layoutRef.current = layout

  // Attach global pointer/mouse/touch listeners once
  useEffect(() => {
    const getXY = e => ({ x: e.clientX ?? e.touches?.[0]?.clientX ?? 0, y: e.clientY ?? e.touches?.[0]?.clientY ?? 0 })

    const onMove = e => {
      if (!dragRef.current) return
      const { x, y } = getXY(e)
      const dx = x - dragRef.current.startX
      const dy = y - dragRef.current.startY
      if (!dragRef.current.started) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        dragRef.current.started = true
        setDraggingId(dragRef.current.id)
      }
      liveOffRef.current = { x: dx, y: dy }
      setLiveOffset({ x: dx, y: dy })
      e.preventDefault()
    }

    const onUp = e => {
      if (!dragRef.current) return
      if (dragRef.current.started) {
        const { id, origX, origY } = dragRef.current
        const { x: dx, y: dy } = liveOffRef.current
        const newLayout = layoutRef.current.map(w => w.id === id ? { ...w, x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) } : w)
        updateSetRef.current('dashboardLayout', JSON.stringify(newLayout))
      }
      dragRef.current = null
      liveOffRef.current = { x: 0, y: 0 }
      setDraggingId(null)
      setLiveOffset({ x: 0, y: 0 })
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [])

  const startDrag = (e, id) => {
    const widget = layoutRef.current.find(w => w.id === id)
    if (!widget) return
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: widget.x, origY: widget.y, started: false }
    e.stopPropagation()
  }

  const saveLayout      = nl => updateSetting('dashboardLayout', JSON.stringify(nl))
  const saveCustomWidgets = cws => updateSetting('customWidgets', JSON.stringify(cws))

  const removeFromCanvas = id  => saveLayout(layout.filter(w => w.id !== id))

  const addToCanvas = id => {
    const canvasW = window.innerWidth - (window.innerWidth >= 640 ? 280 : 24)
    const halfW   = Math.max(280, Math.floor((canvasW - 12) / 2))
    const maxY    = layout.length ? Math.max(...layout.map(w => w.y)) : 0
    saveLayout([...layout, { id, x: 0, y: maxY + 220, w: halfW }])
    setShowAddPanel(false)
  }

  const createCustom = form => {
    const id  = `custom_${Date.now()}`
    const canvasW = window.innerWidth - (window.innerWidth >= 640 ? 280 : 24)
    const halfW   = Math.max(280, Math.floor((canvasW - 12) / 2))
    const maxY    = layout.length ? Math.max(...layout.map(w => w.y)) : 0
    saveCustomWidgets([...customWidgets, { id, ...form }])
    saveLayout([...layout, { id, x: 0, y: maxY + 220, w: halfW }])
    setShowAddPanel(false)
  }

  const deleteCustom = id => {
    saveCustomWidgets(customWidgets.filter(cw => cw.id !== id))
    saveLayout(layout.filter(w => w.id !== id))
  }

  const resetLayout = () => updateSetting('dashboardLayout', null)

  const handleJarvisAction = prompt => {
    sessionStorage.setItem('jarvis_autoPrompt', prompt)
    alert(`JARVIS prompt ready: "${prompt.slice(0, 50)}…" — switch to the JARVIS tab!`)
  }

  const renderWidget = id => {
    const cw = customWidgets.find(c => c.id === id)
    if (cw) return <CustomWidget config={cw} />
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

  const canvasH = layout.length ? Math.max(700, Math.max(...layout.map(w => w.y)) + 450) : 700

  return (
    <div style={{ position: 'relative' }}>
      {/* Header bar */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--purple)' }}>📊 Dashboard</h2>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Command center</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {editMode && <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddPanel(true)}>+ Add Widget</button>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={resetLayout} title="Reset layout to defaults">↺ Reset</button>
          </>}
          <button className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setEditMode(e => !e); setShowAddPanel(false) }}>
            {editMode ? '✓ Done' : '⚙ Customize'}
          </button>
        </div>
      </div>

      {editMode && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
          Grab <strong>⣿</strong> on a widget to drag · <strong>✕</strong> to hide · <strong>+ Add Widget</strong> to restore hidden or create custom
        </div>
      )}

      {/* Freeform canvas */}
      <div style={{ position: 'relative', width: '100%', height: canvasH }}>
        {layout.map(widget => {
          const isDragging = draggingId === widget.id
          const left = isDragging ? Math.max(0, widget.x + liveOffset.x) : widget.x
          const top  = isDragging ? Math.max(0, widget.y + liveOffset.y) : widget.y

          return (
            <div
              key={widget.id}
              style={{
                position: 'absolute', left, top, width: widget.w,
                zIndex: isDragging ? 200 : 1,
                transition: isDragging ? 'none' : 'box-shadow 0.2s',
                boxShadow: isDragging ? '0 24px 60px rgba(0,0,0,0.55), 0 0 0 2px var(--blue)' : 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
              }}
            >
              {/* Edit-mode overlay controls */}
              {editMode && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', zIndex: 30, pointerEvents: 'none' }}>
                  {/* Drag handle */}
                  <div
                    style={{ padding: '5px 9px', background: 'rgba(8,11,18,0.75)', borderRadius: 7, cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--text2)', fontSize: 14, pointerEvents: 'all', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}
                    onPointerDown={e => { e.preventDefault(); startDrag(e, widget.id) }}
                    title="Drag to move"
                  >⣿</div>
                  {/* Hide button */}
                  <button
                    style={{ padding: '5px 10px', background: 'rgba(8,11,18,0.75)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, cursor: 'pointer', color: 'var(--text2)', fontSize: 12, pointerEvents: 'all', backdropFilter: 'blur(6px)' }}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => removeFromCanvas(widget.id)}
                    title="Hide widget"
                  >✕ hide</button>
                </div>
              )}

              {renderWidget(widget.id)}
            </div>
          )
        })}
      </div>

      {/* Add Widget panel + backdrop */}
      {showAddPanel && editMode && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.35)' }} onClick={() => setShowAddPanel(false)} />
          <AddWidgetPanel
            layout={layout}
            customWidgets={customWidgets}
            onClose={() => setShowAddPanel(false)}
            onAdd={addToCanvas}
            onCreate={createCustom}
            onDeleteCustom={deleteCustom}
          />
        </>
      )}
    </div>
  )
}
