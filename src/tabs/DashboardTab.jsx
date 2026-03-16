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

// ── Snap alignment ─────────────────────────────────────────────────────────────
const SNAP_THRESHOLD = 10

function findSnap(snapPoints, anchors, threshold) {
  for (const sp of snapPoints) {
    for (const { val, offset } of anchors) {
      if (Math.abs(val - sp) <= threshold) return { pos: sp, result: sp + offset }
    }
  }
  return null
}

function computeSnap(dragging, otherWidgets, heights, canvasW) {
  const dw = dragging.w
  const dh = heights[dragging.id] || 180
  const dLeft    = dragging.x
  const dCenterX = dragging.x + dw / 2
  const dRight   = dragging.x + dw
  const dTop     = dragging.y
  const dCenterY = dragging.y + dh / 2
  const dBottom  = dragging.y + dh

  // Snap points: canvas edges/center + each other widget's edges/center
  const xPoints = [0, canvasW / 2]
  const yPoints = [0]
  for (const w of otherWidgets) {
    const wh = heights[w.id] || 180
    xPoints.push(w.x, w.x + w.w / 2, w.x + w.w)
    yPoints.push(w.y, w.y + wh / 2, w.y + wh)
  }

  const snapX = findSnap(xPoints, [
    { val: dLeft,    offset: 0       },
    { val: dCenterX, offset: -dw / 2 },
    { val: dRight,   offset: -dw     },
  ], SNAP_THRESHOLD)

  const snapY = findSnap(yPoints, [
    { val: dTop,     offset: 0       },
    { val: dCenterY, offset: -dh / 2 },
    { val: dBottom,  offset: -dh     },
  ], SNAP_THRESHOLD)

  const guides = []
  if (snapX) guides.push({ axis: 'x', pos: snapX.pos })
  if (snapY) guides.push({ axis: 'y', pos: snapY.pos })

  return {
    x: Math.max(0, snapX ? snapX.result : dragging.x),
    y: Math.max(0, snapY ? snapY.result : dragging.y),
    guides,
  }
}

// ── Notion avatar helpers ──────────────────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
const avatarColor = name => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
const nameInitials = name => (name || '?').split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?'

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
  cameras:      { label: 'Ring Cameras',   icon: '📷' },
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

// ── NotionWidget — sm/md/lg size-adaptive ──────────────────────────────────────
function NotionWidget({ apiKey, databaseId, w = 380, label }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dbName, setDbName] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const size = w < 300 ? 'sm' : w < 500 ? 'md' : 'lg'

  const fetchItems = async () => {
    if (!apiKey || !databaseId) return
    setLoading(true); setError(null)
    try {
      const meta = await (await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey },
        body: JSON.stringify({ action: 'get_database', databaseId }),
      })).json()
      if (meta.title) setDbName(meta.title?.[0]?.plain_text || '')
      const r = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Notion-Key': apiKey },
        body: JSON.stringify({ action: 'query', databaseId, page_size: size === 'lg' ? 20 : 10 }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || 'Failed')
      setItems(data.results || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [apiKey, databaseId])

  const displayLabel = label || dbName || 'Notion'

  const getTitle = p => {
    for (const [, prop] of Object.entries(p.properties || {})) {
      if (prop.type === 'title' && prop.title?.[0]?.plain_text) return prop.title[0].plain_text
    }
    return 'Untitled'
  }
  const getStatus = p => {
    for (const [, prop] of Object.entries(p.properties || {})) {
      if (prop.type === 'status') return prop.status?.name || ''
      if (prop.type === 'select') return prop.select?.name || ''
      if (prop.type === 'checkbox') return prop.checkbox ? '✓' : ''
    }
    return ''
  }
  const getDate = p => {
    for (const [, prop] of Object.entries(p.properties || {})) {
      if (prop.type === 'date' && prop.date?.start)
        return new Date(prop.date.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return ''
  }
  // Progress: number type (0–100 or 0–1) or formula number
  const getProgress = p => {
    for (const [, prop] of Object.entries(p.properties || {})) {
      if (prop.type === 'number' && prop.number !== null && prop.number !== undefined) {
        const v = prop.number
        return Math.round(v <= 1 ? v * 100 : Math.min(v, 100))
      }
      if (prop.type === 'formula' && prop.formula?.type === 'number' && prop.formula.number !== null) {
        const v = prop.formula.number
        return Math.round(v <= 1 ? v * 100 : Math.min(v, 100))
      }
    }
    return null
  }
  // Assignee: people type
  const getAssignees = p => {
    for (const [, prop] of Object.entries(p.properties || {})) {
      if (prop.type === 'people' && prop.people?.length > 0)
        return prop.people.map(person => person.name || '?').slice(0, 3)
      if (prop.type === 'created_by' && prop.created_by?.name)
        return [prop.created_by.name]
    }
    return []
  }

  if (!apiKey || !databaseId) return (
    <div className="widget">
      <div className="widget-header"><span>📝</span> {displayLabel}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>Add Notion API key and Database ID in Settings → Notion.</div>
    </div>
  )

  const headerRow = (
    <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>📝</span> {displayLabel}</div>
      <button className="btn btn-ghost btn-sm" onClick={fetchItems}>{loading ? '...' : '⟳'}</button>
    </div>
  )

  // ── sm: count + 3 preview items ──
  if (size === 'sm') {
    return (
      <div className="widget">
        {headerRow}
        {loading && !items.length && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</div>}
        {!loading && !error && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0 10px' }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)', fontFamily: 'Orbitron, monospace', lineHeight: 1 }}>{items.length}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>items</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.slice(0, 3).map(item => (
                <div key={item.id} style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  · {getTitle(item)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── lg: filter tabs + full table with all columns ──
  if (size === 'lg') {
    const allStatuses = ['All', ...new Set(items.map(getStatus).filter(Boolean))]
    const filtered = statusFilter === 'All' ? items : items.filter(item => getStatus(item) === statusFilter)
    const hasProgress  = items.some(item => getProgress(item) !== null)
    const hasAssignees = items.some(item => getAssignees(item).length > 0)
    return (
      <div className="widget">
        {headerRow}
        {loading && !items.length && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</div>}
        {items.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {allStatuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: statusFilter === s ? 'var(--blue)' : 'var(--bg3)', color: statusFilter === s ? '#fff' : 'var(--text2)', transition: 'all 0.15s' }}>{s}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Title</th>
                    <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Status</th>
                    {hasAssignees && <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Assignee</th>}
                    {hasProgress  && <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', minWidth: 90 }}>Progress</th>}
                    <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 15).map(item => {
                    const status    = getStatus(item)
                    const date      = getDate(item)
                    const progress  = getProgress(item)
                    const assignees = getAssignees(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTitle(item)}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          {status && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}>{status}</span>}
                        </td>
                        {hasAssignees && (
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {assignees.map((name, i) => (
                                <div key={i} title={name} style={{ width: 20, height: 20, borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                  {nameInitials(name)}
                                </div>
                              ))}
                            </div>
                          </td>
                        )}
                        {hasProgress && (
                          <td style={{ padding: '6px 8px' }}>
                            {progress !== null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 5, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? 'var(--green)' : progress >= 60 ? 'var(--blue)' : 'var(--purple)', borderRadius: 3, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: 10, color: 'var(--text2)', flexShrink: 0, minWidth: 26, textAlign: 'right' }}>{progress}%</span>
                              </div>
                            ) : <span style={{ color: 'var(--text2)', fontSize: 11 }}>—</span>}
                          </td>
                        )}
                        <td style={{ padding: '6px 8px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: 11 }}>{date}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 15 && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, textAlign: 'right' }}>+{filtered.length - 15} more</div>}
          </>
        )}
        {!items.length && !loading && !error && <div style={{ fontSize: 12, color: 'var(--text2)' }}>No items found.</div>}
      </div>
    )
  }

  // ── md: list with assignee avatars + progress bars ──
  return (
    <div className="widget">
      {headerRow}
      {loading && !items.length && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠️ {error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.slice(0, 8).map(item => {
          const status    = getStatus(item)
          const progress  = getProgress(item)
          const assignees = getAssignees(item)
          return (
            <div key={item.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getTitle(item)}</span>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                  {assignees.map((name, i) => (
                    <div key={i} title={name} style={{ width: 18, height: 18, borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                      {nameInitials(name)}
                    </div>
                  ))}
                  {status && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)' }}>{status}</span>}
                </div>
              </div>
              {progress !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 3, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? 'var(--green)' : progress >= 60 ? 'var(--blue)' : 'var(--purple)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>{progress}%</span>
                </div>
              )}
            </div>
          )
        })}
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

  const placeholderFor = type => {
    if (type === 'note') return 'Enter your note text…'
    if (type === 'link') return 'https://example.com'
    if (type === 'notion') return 'Paste Notion Database ID'
    return ''
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
                <option value="notion">📓 Notion Database — live database view</option>
              </select>
              <textarea className="input" style={{ resize: 'vertical', minHeight: 72 }}
                value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={placeholderFor(form.type)}
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

// ── CamerasWidget ──────────────────────────────────────────────────────────────
function CamerasWidget({ haUrl, haToken }) {
  const [cameras, setCameras]   = useState([])
  const [snaps, setSnaps]       = useState({})   // entityId -> dataURL
  const [loading, setLoading]   = useState(false)
  const [modal, setModal]       = useState(null)  // entityId of expanded camera
  const [modalSnap, setModalSnap] = useState(null)
  const liveTimerRef = useRef(null)

  // Fetch one snapshot via the HA proxy, returns a data URL
  const fetchSnap = async (entityId) => {
    try {
      const r = await fetch('/api/ha-camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken, entityId }),
      })
      if (!r.ok) return null
      const blob = await r.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  // Discover camera entities from HA and load first snapshots
  const discover = async () => {
    if (!haUrl || !haToken) return
    setLoading(true)
    try {
      const r = await fetch(`${haUrl.replace(/\/$/, '')}/api/states`, {
        headers: { Authorization: `Bearer ${haToken}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) return
      const states = await r.json()
      const cams = states
        .filter(s => s.entity_id.startsWith('camera.'))
        .map(s => ({
          id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id.replace('camera.', '').replace(/_/g, ' '),
          state: s.state,
        }))
      setCameras(cams)
      // Load thumbnails for all cameras
      const entries = await Promise.all(cams.map(async c => [c.id, await fetchSnap(c.id)]))
      setSnaps(Object.fromEntries(entries.filter(([, v]) => v)))
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  // Auto-refresh thumbnails every 60 seconds
  useEffect(() => {
    if (!haUrl || !haToken) return
    discover()
    const t = setInterval(async () => {
      const entries = await Promise.all(cameras.map(async c => [c.id, await fetchSnap(c.id)]))
      setSnaps(Object.fromEntries(entries.filter(([, v]) => v)))
    }, 60000)
    return () => clearInterval(t)
  }, [haUrl, haToken])

  // Live preview in modal — refresh every 5 seconds
  useEffect(() => {
    if (!modal) { clearInterval(liveTimerRef.current); setModalSnap(null); return }
    const load = async () => { const url = await fetchSnap(modal); if (url) setModalSnap(url) }
    load()
    liveTimerRef.current = setInterval(load, 5000)
    return () => clearInterval(liveTimerRef.current)
  }, [modal])

  if (!haUrl || !haToken) {
    return (
      <div className="widget">
        <div className="widget-header"><span>📷</span> Ring Cameras</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          Connect Home Assistant in <strong>Settings → Home</strong> to see your Ring cameras here.
          Make sure the <strong>Ring integration</strong> is added in HA.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="widget">
        <div className="widget-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📷</span> Ring Cameras
            <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>{cameras.length} found</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={discover} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? '⏳' : '⟳'}
          </button>
        </div>

        {cameras.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 0' }}>
            No camera entities found. Add Ring integration in Home Assistant.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 4 }}>
          {cameras.map(cam => (
            <div
              key={cam.id}
              onClick={() => setModal(cam.id)}
              style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg3)', transition: 'border-color 0.15s' }}
              className="cam-thumb"
            >
              {snaps[cam.id]
                ? <img src={snaps[cam.id]} alt={cam.name} style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                : <div style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--text2)' }}>
                    {cam.state === 'unavailable' ? '⚠️' : '📷'}
                  </div>
              }
              <div style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cam.name}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 8 }}>Thumbnails refresh every 60s · tap to go live</div>
      </div>

      {/* Live modal */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', maxWidth: 800, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{cameras.find(c => c.id === modal)?.name}</span>
                <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 8 }}>● Live · refreshes every 5s</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            {modalSnap
              ? <img src={modalSnap} alt="live" style={{ width: '100%', display: 'block' }} />
              : <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>⏳</div>
            }
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text2)' }}>
              {modal} · {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardTab() {
  const { settings, updateSetting } = useSettings()
  const [editMode, setEditMode] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)

  // Drag state
  const [draggingId, setDraggingId] = useState(null)
  const [liveOffset, setLiveOffset] = useState({ x: 0, y: 0 })
  const draggingDataRef = useRef(null)  // { id, startX, startY, origX, origY }
  const liveOffsetRef   = useRef({ x: 0, y: 0 })

  // Resize state
  const [resizingId, setResizingId] = useState(null)
  const [resizeW, setResizeW] = useState(null)
  const resizingDataRef = useRef(null) // { id, startX, origW }
  const resizeWRef      = useRef(null)

  // Snap guides
  const [snapGuides, setSnapGuides] = useState([])

  // Stable layout ref + widget height measurement
  const layoutRef       = useRef([])
  const widgetHeightRef = useRef({})
  const canvasW = window.innerWidth - (window.innerWidth >= 640 ? 280 : 24)

  // Custom widgets
  const customWidgets = (() => { try { return JSON.parse(settings.customWidgets || '[]') } catch { return [] } })()

  // Layout — validate saved data has numeric coords (old format was {id, visible})
  const layout = (() => {
    try {
      const saved = settings.dashboardLayout ? JSON.parse(settings.dashboardLayout) : null
      if (
        saved && Array.isArray(saved) && saved.length > 0 &&
        typeof saved[0].x === 'number' && typeof saved[0].y === 'number'
      ) return saved
    } catch {}
    return getDefaultLayout(canvasW)
  })()

  // Keep layoutRef in sync each render
  layoutRef.current = layout

  const saveLayout       = nl  => updateSetting('dashboardLayout', JSON.stringify(nl))
  const saveCustomWidgets = cws => updateSetting('customWidgets', JSON.stringify(cws))

  const removeFromCanvas = id => saveLayout(layout.filter(w => w.id !== id))

  const addToCanvas = id => {
    const halfW = Math.max(280, Math.floor((canvasW - 12) / 2))
    const maxY    = layout.length ? Math.max(...layout.map(w => w.y)) : 0
    saveLayout([...layout, { id, x: 0, y: maxY + 220, w: halfW }])
    setShowAddPanel(false)
  }

  const createCustom = form => {
    const id   = `custom_${Date.now()}`
    const halfW = Math.max(280, Math.floor((canvasW - 12) / 2))
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

  const renderWidget = (id, widgetW) => {
    const cw = customWidgets.find(c => c.id === id)
    if (cw) {
      if (cw.type === 'notion') return <NotionWidget apiKey={settings.notionApiKey} databaseId={cw.content} w={widgetW} label={cw.title} />
      return <CustomWidget config={cw} />
    }
    switch (id) {
      case 'clock':        return <ClockWidget />
      case 'system':       return <SystemStatsWidget />
      case 'memory':       return <MemoryStatsWidget />
      case 'weather':      return <WeatherWidget />
      case 'quickactions': return <QuickActionsWidget onJarvisPrompt={handleJarvisAction} />
      case 'esp32':        return <ESP32SensorWidget />
      case 'uptime':       return <UptimeWidget uptimeUrlsJson={settings.uptimeUrls} />
      case 'notion':       return <NotionWidget apiKey={settings.notionApiKey} databaseId={settings.notionDatabaseId} w={widgetW} />
      case 'news':         return <NewsWidget apiKey={settings.newsApiKey} />
      case 'cameras':      return <CamerasWidget haUrl={settings.haUrl} haToken={settings.haToken} />
      default:             return null
    }
  }

  const canvasH = layout.length ? Math.max(700, Math.max(...layout.map(w => w.y)) + 450) : 700

  // Shared edit-overlay button style
  const overlayBtn = (extra = {}) => ({
    padding: '4px 9px', background: 'rgba(8,11,18,0.8)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text2)',
    backdropFilter: 'blur(6px)', pointerEvents: 'all', ...extra,
  })

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
          Grab <strong>⣿</strong> to drag · drag <strong>◢</strong> corner to resize · <strong>S/M/L</strong> size presets · <strong>✕</strong> to hide
        </div>
      )}

      {/* Freeform canvas */}
      <div style={{ position: 'relative', width: '100%', height: canvasH }}>
        {layout.map(widget => {
          const isDragging  = draggingId === widget.id
          const isResizing  = resizingId === widget.id
          const effectiveW  = isResizing && resizeW !== null ? resizeW : widget.w
          const left = isDragging ? Math.max(0, widget.x + liveOffset.x) : widget.x
          const top  = isDragging ? Math.max(0, widget.y + liveOffset.y) : widget.y

          return (
            <div
              key={widget.id}
              ref={el => { if (el) widgetHeightRef.current[widget.id] = el.offsetHeight }}
              style={{
                position: 'absolute', left, top, width: effectiveW,
                zIndex: isDragging ? 200 : isResizing ? 150 : 1,
                transition: isDragging || isResizing ? 'none' : 'box-shadow 0.2s',
                boxShadow: isDragging ? '0 24px 60px rgba(0,0,0,0.55), 0 0 0 2px var(--blue)' : isResizing ? '0 0 0 2px var(--purple)' : 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
              }}
            >
              {/* Edit-mode overlay */}
              {editMode && (
                <>
                  {/* Top bar: drag handle (left) + size presets + hide (right) */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', zIndex: 30, pointerEvents: 'none' }}>
                    {/* Drag handle with pointer capture */}
                    <div
                      style={{ ...overlayBtn({ cursor: isDragging ? 'grabbing' : 'grab', fontSize: 14, touchAction: 'none' }) }}
                      title="Drag to move"
                      onPointerDown={e => {
                        e.preventDefault()
                        e.currentTarget.setPointerCapture(e.pointerId)
                        draggingDataRef.current = { id: widget.id, startX: e.clientX, startY: e.clientY, origX: widget.x, origY: widget.y }
                        setDraggingId(widget.id)
                      }}
                      onPointerMove={e => {
                        if (!draggingDataRef.current || draggingDataRef.current.id !== widget.id) return
                        const { startX, startY, origX, origY } = draggingDataRef.current
                        const rawX = Math.max(0, origX + (e.clientX - startX))
                        const rawY = Math.max(0, origY + (e.clientY - startY))
                        const others = layoutRef.current.filter(w => w.id !== widget.id)
                        const { x: sx, y: sy, guides } = computeSnap(
                          { id: widget.id, x: rawX, y: rawY, w: widget.w },
                          others, widgetHeightRef.current, canvasW
                        )
                        liveOffsetRef.current = { x: sx - origX, y: sy - origY }
                        setLiveOffset({ x: sx - origX, y: sy - origY })
                        setSnapGuides(guides)
                      }}
                      onPointerUp={e => {
                        if (!draggingDataRef.current || draggingDataRef.current.id !== widget.id) return
                        const { origX, origY } = draggingDataRef.current
                        const { x: dx, y: dy } = liveOffsetRef.current
                        saveLayout(layoutRef.current.map(w => w.id === widget.id ? { ...w, x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) } : w))
                        draggingDataRef.current = null
                        liveOffsetRef.current = { x: 0, y: 0 }
                        setDraggingId(null)
                        setLiveOffset({ x: 0, y: 0 })
                        setSnapGuides([])
                      }}
                    >⣿</div>

                    {/* Right side: S/M/L presets + hide */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, pointerEvents: 'all' }}>
                      {[['S', 240], ['M', 380], ['L', 560]].map(([lbl, preset]) => (
                        <button key={lbl} style={{ ...overlayBtn({ fontWeight: effectiveW === preset ? 700 : 400, color: effectiveW === preset ? 'var(--blue)' : 'var(--text2)' }) }}
                          onClick={() => saveLayout(layout.map(w => w.id === widget.id ? { ...w, w: preset } : w))}
                        >{lbl}</button>
                      ))}
                      <button style={{ ...overlayBtn({ color: 'var(--red)', marginLeft: 2 }) }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => removeFromCanvas(widget.id)}
                        title="Hide widget"
                      >✕</button>
                    </div>
                  </div>

                  {/* Resize handle — bottom-right corner */}
                  <div
                    style={{ position: 'absolute', bottom: 5, right: 5, width: 16, height: 16, cursor: 'se-resize', zIndex: 31, touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text2)', background: 'rgba(8,11,18,0.75)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.09)' }}
                    title="Drag to resize"
                    onPointerDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      e.currentTarget.setPointerCapture(e.pointerId)
                      resizingDataRef.current = { id: widget.id, startX: e.clientX, origW: widget.w }
                      resizeWRef.current = widget.w
                      setResizingId(widget.id)
                      setResizeW(widget.w)
                    }}
                    onPointerMove={e => {
                      if (!resizingDataRef.current || resizingDataRef.current.id !== widget.id) return
                      const nw = Math.max(200, resizingDataRef.current.origW + (e.clientX - resizingDataRef.current.startX))
                      resizeWRef.current = nw
                      setResizeW(nw)
                    }}
                    onPointerUp={e => {
                      if (!resizingDataRef.current || resizingDataRef.current.id !== widget.id) return
                      const finalW = resizeWRef.current ?? widget.w
                      saveLayout(layout.map(w => w.id === widget.id ? { ...w, w: finalW } : w))
                      resizingDataRef.current = null
                      resizeWRef.current = null
                      setResizingId(null)
                      setResizeW(null)
                    }}
                  >◢</div>
                </>
              )}

              {renderWidget(widget.id, effectiveW)}
            </div>
          )
        })}

        {/* Snap alignment guides */}
        {snapGuides.map((g, i) => (
          <div key={i} style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 400,
            background: 'rgba(59,130,246,0.65)',
            ...(g.axis === 'x'
              ? { left: g.pos, top: 0, width: 1, height: '100%' }
              : { top: g.pos, left: 0, height: 1, width: '100%' }),
          }} />
        ))}
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
