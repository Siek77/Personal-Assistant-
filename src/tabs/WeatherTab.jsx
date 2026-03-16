import { useState, useEffect, useRef, useCallback } from 'react'

// ── WMO helpers ───────────────────────────────────────────────────────────────
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
function windDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}
function uvLabel(uv) {
  if (uv <= 2) return { label: 'Low', color: '#10b981' }
  if (uv <= 5) return { label: 'Moderate', color: '#f59e0b' }
  if (uv <= 7) return { label: 'High', color: '#f97316' }
  if (uv <= 10) return { label: 'Very High', color: '#ef4444' }
  return { label: 'Extreme', color: '#8b5cf6' }
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const DEFAULT_LOC = { lat: 41.1836, lon: -89.0651, label: 'Lostant, IL' }

// ── Radar Map (Leaflet + RainViewer) ──────────────────────────────────────────
function RadarMap({ lat, lon }) {
  const mapRef    = useRef(null)
  const mapInst   = useRef(null)
  const radarLayer = useRef(null)
  const markerInst = useRef(null)
  const [frames, setFrames]       = useState([])
  const [frameIdx, setFrameIdx]   = useState(0)
  const [playing, setPlaying]     = useState(false)
  const [ready, setReady]         = useState(false)
  const [radarTs, setRadarTs]     = useState('')
  const playRef = useRef(false)
  const framesRef = useRef([])
  const idxRef    = useRef(0)

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInst.current) return
    const L = window.L

    const map = L.map(mapRef.current, {
      center: [lat, lon],
      zoom: 7,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: false,
    })

    // Dark basemap
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 12,
    }).addTo(map)

    // Labels on top of radar
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 12,
      zIndex: 20,
    }).addTo(map)

    // Location dot
    const dot = L.divIcon({
      html: '<div style="width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 8px #3b82f6;"></div>',
      iconAnchor: [5, 5],
      className: '',
    })
    markerInst.current = L.marker([lat, lon], { icon: dot }).addTo(map)
    mapInst.current = map

    // Load radar frames
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then(data => {
        const host  = data.host
        const past  = (data.radar?.past || []).slice(-8)
        const nowcast = (data.radar?.nowcast || []).slice(0, 3)
        const all = [...past, ...nowcast].map((f, i) => ({
          time: f.time,
          url: `${host}${f.path}/512/{z}/{x}/{y}/8/1_1.png`,
          isForecast: i >= past.length,
        }))
        framesRef.current = all
        setFrames(all)
        const last = all.length - 1
        idxRef.current = last
        setFrameIdx(last)
        if (all.length) showFrame(map, all[last])
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [lat, lon])

  const showFrame = (map, frame) => {
    const L = window.L
    if (radarLayer.current) map.removeLayer(radarLayer.current)
    // maxNativeZoom: 8 — RainViewer 512px tiles only go to zoom 8;
    // Leaflet will scale them up rather than 404ing at higher levels
    radarLayer.current = L.tileLayer(frame.url, { opacity: 0.65, zIndex: 10, maxNativeZoom: 8, maxZoom: 12 })
    radarLayer.current.addTo(map)
    setRadarTs(new Date(frame.time * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  }

  useEffect(() => {
    const loadLeaflet = () => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }
      if (window.L) { initMap(); return }
      const existing = document.querySelector('script[src*="leaflet@"]')
      if (existing) { existing.addEventListener('load', initMap); return }
      const s = document.createElement('script')
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.onload = initMap
      document.head.appendChild(s)
    }
    loadLeaflet()
    return () => {
      playRef.current = false
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    }
  }, [initMap])

  // Keep marker/view synced if lat/lon changes
  useEffect(() => {
    if (!mapInst.current) return
    mapInst.current.setView([lat, lon], mapInst.current.getZoom())
    markerInst.current?.setLatLng([lat, lon])
  }, [lat, lon])

  // Play animation
  useEffect(() => {
    if (!playing || !framesRef.current.length) return
    playRef.current = true
    const tick = () => {
      if (!playRef.current || !mapInst.current) return
      idxRef.current = (idxRef.current + 1) % framesRef.current.length
      setFrameIdx(idxRef.current)
      showFrame(mapInst.current, framesRef.current[idxRef.current])
      setTimeout(tick, 500)
    }
    tick()
    return () => { playRef.current = false }
  }, [playing])

  const seekTo = (i) => {
    setPlaying(false)
    playRef.current = false
    idxRef.current = i
    setFrameIdx(i)
    if (mapInst.current && framesRef.current[i]) showFrame(mapInst.current, framesRef.current[i])
  }

  return (
    <div>
      <div ref={mapRef} style={{ width: '100%', height: 340, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#111' }} />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setPlaying(p => !p)}
          style={{ fontSize: 12, minWidth: 72 }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <input
          type="range" min={0} max={Math.max(0, frames.length - 1)} value={frameIdx}
          onChange={e => seekTo(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--blue)' }}
        />
        <span style={{ fontSize: 11, color: frames[frameIdx]?.isForecast ? 'var(--cyan)' : 'var(--text2)', minWidth: 54, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {frames[frameIdx]?.isForecast ? '▶ ' : ''}{radarTs || '–'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 10, color: 'var(--text2)' }}>
        <span>Past ← {frames.filter(f => !f.isForecast).length} frames</span>
        <span>→ Nowcast {frames.filter(f => f.isForecast).length} frames</span>
        <span style={{ marginLeft: 'auto' }}>RainViewer · updated ~5 min</span>
      </div>
    </div>
  )
}

// ── Location Search ───────────────────────────────────────────────────────────
function LocationSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`)
      const data = await r.json()
      setResults(data.results || [])
    } catch { setResults([]) } finally { setSearching(false) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          style={{ fontSize: 13 }}
          placeholder="Search city…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button className="btn btn-ghost btn-sm" onClick={search} disabled={searching} style={{ flexShrink: 0 }}>
          {searching ? '⏳' : '🔍'}
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => {
                onSelect({ lat: r.latitude, lon: r.longitude, label: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}, ${r.country_code}` })
                setResults([])
                setQuery('')
              }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
              className="location-result"
            >
              <span style={{ color: 'var(--text)' }}>{r.name}</span>
              <span style={{ color: 'var(--text2)', marginLeft: 6 }}>{r.admin1 && `${r.admin1}, `}{r.country}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main WeatherTab ───────────────────────────────────────────────────────────
export default function WeatherTab() {
  const [loc, setLoc] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_weather_loc') || 'null') || DEFAULT_LOC } catch { return DEFAULT_LOC }
  })
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('radar')
  const [showSearch, setShowSearch] = useState(false)

  const fetchAll = useCallback(async (location = loc) => {
    setLoading(true); setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${location.lat}&longitude=${location.lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,cloud_cover,uv_index,surface_pressure,dew_point_2m,visibility` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max` +
        `&forecast_days=8&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=${encodeURIComponent(tz)}`
      )
      const data = await res.json()
      setWeather(data.current)
      setForecast(data)

      // NWS alerts (US only, best-effort)
      fetch(`https://api.weather.gov/alerts/active?point=${location.lat},${location.lon}`, {
        headers: { Accept: 'application/geo+json' },
        signal: AbortSignal.timeout(4000),
      }).then(r => r.ok ? r.json() : null)
        .then(d => setAlerts(d?.features || []))
        .catch(() => setAlerts([]))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [loc])

  useEffect(() => { fetchAll() }, [loc])

  const selectLocation = (newLoc) => {
    setLoc(newLoc)
    localStorage.setItem('jarvis_weather_loc', JSON.stringify(newLoc))
    setShowSearch(false)
    fetchAll(newLoc)
  }

  // Hourly slice — next 24h
  const hourlySlice = (() => {
    if (!forecast?.hourly) return []
    const now = new Date()
    const times = forecast.hourly.time
    let i = 0
    while (i < times.length && new Date(times[i]) <= now) i++
    return times.slice(i, i + 24).map((t, j) => ({
      time: new Date(t),
      temp: forecast.hourly.temperature_2m[i + j],
      code: forecast.hourly.weather_code[i + j],
      precip: forecast.hourly.precipitation_probability[i + j],
      wind: forecast.hourly.wind_speed_10m[i + j],
    }))
  })()

  // Hourly temp chart range
  const hourlyTemps = hourlySlice.map(h => h.temp)
  const tMin = Math.min(...hourlyTemps)
  const tMax = Math.max(...hourlyTemps)

  const uv = weather ? uvLabel(weather.uv_index || 0) : null

  const TABS = [
    { id: 'radar',    label: '📡 Radar' },
    { id: 'hourly',   label: '⏱ Hourly' },
    { id: 'forecast', label: '📅 7-Day' },
    { id: 'details',  label: '🔬 Details' },
    { id: 'alerts',   label: `⚠️ Alerts${alerts?.length ? ` (${alerts.length})` : ''}` },
  ]

  return (
    <div className="tab-shell weather-tab">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#06b6d4' }}>🌦 Weather</h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowSearch(s => !s)}
          style={{ fontSize: 12 }}
        >
          📍 {loc.label}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => fetchAll()} disabled={loading} style={{ marginLeft: 'auto', fontSize: 12 }}>
          {loading ? '⏳' : '⟳ Refresh'}
        </button>
      </div>

      {showSearch && (
        <div style={{ marginBottom: 14 }}>
          <LocationSearch onSelect={selectLocation} />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

      {/* Current conditions bar */}
      {weather && (
        <div className="card weather-current" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 52 }}>{wmoIcon(weather.weather_code)}</span>
              <div>
                <div style={{ fontSize: 42, fontWeight: 300, lineHeight: 1, color: 'var(--text)' }}>
                  {Math.round(weather.temperature_2m)}°
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                  {wmoDesc(weather.weather_code)} · Feels {Math.round(weather.apparent_temperature)}°
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {[
                ['💧', 'Humidity', `${weather.relative_humidity_2m}%`],
                ['💨', 'Wind', `${Math.round(weather.wind_speed_10m)} mph ${windDir(weather.wind_direction_10m)}`],
                ['🌡️', 'Dew Pt', `${Math.round(weather.dew_point_2m)}°`],
                ['☁️', 'Cloud', `${weather.cloud_cover}%`],
              ].map(([icon, label, val]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{icon}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's sunrise/sunset */}
          {forecast?.daily && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>🌅 {fmtTime(forecast.daily.sunrise[0])}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>🌇 {fmtTime(forecast.daily.sunset[0])}</span>
              <span style={{ fontSize: 12, color: uv?.color }}>☀️ UV {Math.round(weather.uv_index || 0)} — {uv?.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>🌊 {Math.round((weather.surface_pressure || 0) * 0.02953)} inHg</span>
              {weather.visibility != null && <span style={{ fontSize: 12, color: 'var(--text2)' }}>👁 {(weather.visibility / 1000).toFixed(1)} mi</span>}
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
              background: tab === t.id ? 'var(--blue)' : 'var(--bg3)',
              color: tab === t.id ? '#fff' : 'var(--text2)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Radar ── */}
      {tab === 'radar' && (
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            Animated precipitation radar — use slider or play to animate. Cyan markers = nowcast.
          </div>
          <RadarMap lat={loc.lat} lon={loc.lon} />
        </div>
      )}

      {/* ── Hourly ── */}
      {tab === 'hourly' && (
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Next 24 hours</div>

          {/* Mini chart */}
          {hourlySlice.length > 0 && (
            <div style={{ marginBottom: 12, position: 'relative', height: 60 }}>
              <svg width="100%" height="60" viewBox={`0 0 ${hourlySlice.length * 40} 60`} preserveAspectRatio="none" style={{ display: 'block' }}>
                {/* Precip bars */}
                {hourlySlice.map((h, i) => h.precip > 0 && (
                  <rect key={i} x={i * 40 + 2} y={60 - (h.precip / 100) * 30} width={36} height={(h.precip / 100) * 30} fill="rgba(6,182,212,0.2)" rx="2" />
                ))}
                {/* Temp line */}
                <polyline
                  points={hourlySlice.map((h, i) => {
                    const y = tMax === tMin ? 30 : 8 + ((tMax - h.temp) / (tMax - tMin)) * 44
                    return `${i * 40 + 20},${y}`
                  }).join(' ')}
                  fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round"
                />
              </svg>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {hourlySlice.map((h, i) => (
              <div key={i} style={{
                textAlign: 'center', minWidth: 58, padding: '10px 6px', flexShrink: 0,
                background: i === 0 ? 'rgba(59,130,246,0.12)' : 'var(--bg3)',
                borderRadius: 10, border: `1px solid ${i === 0 ? 'rgba(59,130,246,0.35)' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>
                  {i === 0 ? 'Now' : h.time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}
                </div>
                <div style={{ fontSize: 22 }}>{wmoIcon(h.code)}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{Math.round(h.temp)}°</div>
                {h.precip > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--cyan)', marginTop: 2 }}>💧{h.precip}%</div>
                )}
                {h.wind > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{Math.round(h.wind)}mph</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7-Day Forecast ── */}
      {tab === 'forecast' && forecast?.daily && (
        <div className="card">
          {forecast.daily.time.slice(0, 8).map((date, i) => {
            const hiMax = Math.max(...forecast.daily.temperature_2m_max)
            const loMin = Math.min(...forecast.daily.temperature_2m_min)
            const barRange = hiMax - loMin || 1
            const barLeft = ((forecast.daily.temperature_2m_min[i] - loMin) / barRange) * 100
            const barWidth = ((forecast.daily.temperature_2m_max[i] - forecast.daily.temperature_2m_min[i]) / barRange) * 100
            return (
              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 7 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 40, fontSize: 13, color: i === 0 ? 'var(--blue)' : 'var(--text2)', fontWeight: i === 0 ? 700 : 400, flexShrink: 0 }}>
                  {i === 0 ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 22, width: 28, flexShrink: 0 }}>{wmoIcon(forecast.daily.weather_code[i])}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, flexShrink: 0 }}>{wmoDesc(forecast.daily.weather_code[i])}</span>
                {(forecast.daily.precipitation_probability_max[i] || 0) > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--cyan)', width: 36, flexShrink: 0 }}>💧{forecast.daily.precipitation_probability_max[i]}%</span>
                )}
                {!(forecast.daily.precipitation_probability_max[i] > 0) && <span style={{ width: 36, flexShrink: 0 }} />}
                {/* Temp bar */}
                <div style={{ flex: 1, position: 'relative', height: 6, background: 'var(--border2)', borderRadius: 3, minWidth: 60 }}>
                  <div style={{ position: 'absolute', left: `${barLeft}%`, width: `${barWidth}%`, height: '100%', background: 'linear-gradient(90deg,var(--blue),var(--orange))', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text2)', width: 30, textAlign: 'right', flexShrink: 0 }}>{Math.round(forecast.daily.temperature_2m_min[i])}°</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', width: 34, textAlign: 'right', flexShrink: 0 }}>{Math.round(forecast.daily.temperature_2m_max[i])}°</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Details ── */}
      {tab === 'details' && weather && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {[
            { icon: '🌡️', label: 'Temperature',  val: `${Math.round(weather.temperature_2m)}°F` },
            { icon: '🤔', label: 'Feels Like',    val: `${Math.round(weather.apparent_temperature)}°F` },
            { icon: '💧', label: 'Humidity',      val: `${weather.relative_humidity_2m}%` },
            { icon: '🌡️', label: 'Dew Point',     val: `${Math.round(weather.dew_point_2m)}°F` },
            { icon: '💨', label: 'Wind Speed',    val: `${Math.round(weather.wind_speed_10m)} mph` },
            { icon: '🧭', label: 'Wind Dir',      val: `${windDir(weather.wind_direction_10m)} (${Math.round(weather.wind_direction_10m)}°)` },
            { icon: '🌊', label: 'Pressure',      val: `${Math.round((weather.surface_pressure || 0) * 0.02953 * 100) / 100} inHg` },
            { icon: '☁️', label: 'Cloud Cover',   val: `${weather.cloud_cover}%` },
            { icon: '☀️', label: 'UV Index',      val: `${Math.round(weather.uv_index || 0)} — ${uv?.label}`, valColor: uv?.color },
            { icon: '👁', label: 'Visibility',    val: weather.visibility != null ? `${(weather.visibility / 1000).toFixed(1)} mi` : '—' },
            { icon: '🌧️', label: 'Precipitation', val: `${weather.precipitation || 0} mm` },
            { icon: '🌅', label: 'Sunrise',       val: forecast?.daily ? fmtTime(forecast.daily.sunrise[0]) : '—' },
            { icon: '🌇', label: 'Sunset',        val: forecast?.daily ? fmtTime(forecast.daily.sunset[0]) : '—' },
            { icon: '☀️', label: 'Max UV Today',  val: forecast?.daily ? `${Math.round(forecast.daily.uv_index_max[0] || 0)}` : '—' },
          ].map(({ icon, label, val, valColor }) => (
            <div key={label} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{icon} {label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: valColor || 'var(--text)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Alerts ── */}
      {tab === 'alerts' && (
        <div>
          {alerts === null && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Loading alerts…</div>}
          {alerts?.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--green)' }}>No active weather alerts</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>for {loc.label}</div>
              </div>
            </div>
          )}
          {alerts?.map((a, i) => (
            <div key={i} style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠️ {a.properties?.event}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{a.properties?.headline}</div>
              {a.properties?.description && (
                <details>
                  <summary style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer', marginBottom: 4 }}>Full description</summary>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.properties.description.slice(0, 800)}</div>
                </details>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
                {a.properties?.onset && <span>Onset: {new Date(a.properties.onset).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                {a.properties?.expires && <span>Expires: {new Date(a.properties.expires).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              </div>
            </div>
          ))}
          {alerts === null || alerts?.length > 0 ? null : null}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
            Alerts from National Weather Service (US only). International locations will show no alerts.
          </div>
        </div>
      )}
    </div>
  )
}
