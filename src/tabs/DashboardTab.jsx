import { useState, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

const WEATHER_ICONS = {
  'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️', 'Drizzle': '🌦️',
  'Thunderstorm': '⛈️', 'Snow': '❄️', 'Mist': '🌫️', 'Fog': '🌫️',
}

const SAMPLE_NEWS = [
  { title: 'Tech Giants Report Record Q1 Earnings', source: 'TechCrunch', time: '2h ago', url: '#' },
  { title: 'New AI Models Show Breakthrough in Reasoning', source: 'Wired', time: '4h ago', url: '#' },
  { title: 'ESP32-S3 Gets Major Firmware Update', source: 'Hackaday', time: '6h ago', url: '#' },
  { title: 'Spotify Launches New Discovery Features', source: 'The Verge', time: '8h ago', url: '#' },
  { title: 'Apple Announces iOS 19 Developer Preview', source: 'MacRumors', time: '12h ago', url: '#' },
]

function WeatherWidget({ apiKey }) {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [city, setCity] = useState(localStorage.getItem('weather_city') || 'London')
  const [inputCity, setInputCity] = useState('')

  const fetchWeather = async (c) => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${c}&appid=${apiKey}&units=metric`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`)
      setWeather(data)
      localStorage.setItem('weather_city', c)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWeather(city) }, [apiKey])

  const search = () => {
    if (!inputCity.trim()) return
    setCity(inputCity.trim())
    fetchWeather(inputCity.trim())
    setInputCity('')
  }

  if (!apiKey) return (
    <div className="widget widget-wide">
      <div className="widget-header"><span>🌤️</span> Weather</div>
      <p style={{ fontSize: 12, color: 'var(--text2)' }}>Add OpenWeatherMap API key in Settings.</p>
    </div>
  )

  return (
    <div className="widget widget-wide">
      <div className="widget-header"><span>🌤️</span> Weather — {weather?.name || city}</div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading...</div>}
      {error && !loading && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>⚠️ {error}</div>}
      {weather && !loading && (
        <div className="weather-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div className="weather-icon">{WEATHER_ICONS[weather.weather[0].main] || '🌡️'}</div>
            <div>
              <div className="weather-temp">{Math.round(weather.main.temp)}°C</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                {weather.weather[0].description}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                Feels {Math.round(weather.main.feels_like)}° · 💧{weather.main.humidity}% · 💨{Math.round(weather.wind.speed)}m/s
              </div>
            </div>
          </div>
          <div className="weather-search">
            <input className="input" style={{ fontSize: 13, padding: '6px 10px' }}
              placeholder="Search city..." value={inputCity} onChange={e => setInputCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} />
            <button className="btn btn-ghost btn-sm" onClick={search}>Go</button>
            <button className="btn btn-ghost btn-sm" onClick={() => fetchWeather(city)}>⟳</button>
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
        <WeatherWidget apiKey={settings.weatherApiKey} />
        <QuickActionsWidget onJarvisPrompt={handleJarvisAction} />
        <NewsWidget apiKey={settings.newsApiKey} />
      </div>
    </div>
  )
}
