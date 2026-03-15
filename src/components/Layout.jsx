import { useState, useEffect } from 'react'
import { TABS } from '../App'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

export default function Layout({ activeTab, setActiveTab, children }) {
  const { settings } = useSettings()
  const { memory } = useMemory()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const greeting = () => {
    const h = time.getHours()
    if (h < 12) return 'Morning'
    if (h < 17) return 'Afternoon'
    return 'Evening'
  }

  return (
    <div className="app-shell">
      {settings.scanlineEffect && <div className="scanline-overlay" />}

      {/* Sidebar — desktop only */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-name">JARVIS</div>
          <div className="logo-sub">SYSTEM ONLINE</div>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <div
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="status-row">
            <span>Memory</span>
            <span style={{ color: 'var(--green)', fontSize: 11 }}>{memory.facts.length} facts</span>
          </div>
          <div className="status-row">
            <span>Status</span>
            <span className="badge badge-green" style={{ fontSize: 10, padding: '1px 6px' }}>
              <span className="dot dot-green" style={{ width: 5, height: 5 }} /> ACTIVE
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="topbar-greeting">
              {greeting()}, <span style={{ color: 'var(--text)', fontWeight: 600 }}>{settings.userName || 'User'}</span>
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="topbar-time">{timeStr}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{dateStr}</div>
          </div>
        </header>

        <div className="tab-content">
          {children}
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <nav className="bottom-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={activeTab === tab.id ? { '--tab-color': tab.color } : {}}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

