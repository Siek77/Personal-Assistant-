import { useState } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

const SECTIONS = [
  { id: 'profile', label: '👤 Profile', icon: '👤' },
  { id: 'ai', label: '🤖 AI / Claude', icon: '🤖' },
  { id: 'spotify', label: '🎵 Spotify', icon: '🎵' },
  { id: 'esp32', label: '📡 ESP32', icon: '📡' },
  { id: 'services', label: '🔌 Services', icon: '🔌' },
  { id: 'appearance', label: '🎨 Appearance', icon: '🎨' },
  { id: 'memory', label: '🧠 Memory', icon: '🧠' },
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

export default function SettingsTab() {
  const { settings, updateSetting, updateSettings } = useSettings()
  const { memory, clearMemory, addFact } = useMemory()
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)

  const save = (key, val) => {
    updateSetting(key, val)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ height: 'calc(100vh - var(--header) - 40px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text2)' }}>⚙️ Settings</h2>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>

      <div className="settings-grid" style={{ height: 'calc(100% - 44px)' }}>
        {/* Sidebar nav */}
        <div className="settings-nav" style={{ overflowY: 'auto' }}>
          {SECTIONS.map(s => (
            <div
              key={s.id}
              className={`settings-nav-item ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span>{s.icon}</span> {s.label.replace(/^.+ /, '')}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto' }}>
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

            {/* AI / Claude */}
            {activeSection === 'ai' && (
              <div className="settings-section">
                <h3>Claude AI Settings</h3>
                <InputSetting
                  label="Claude API Key"
                  desc="Get yours at console.anthropic.com"
                  value={settings.claudeApiKey}
                  onChange={v => save('claudeApiKey', v)}
                  type="password"
                  placeholder="sk-ant-..."
                />
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div className="settings-label">Model</div>
                  <select className="input" style={{ width: '100%', fontSize: 13 }}
                    value={settings.claudeModel || 'claude-opus-4-6'}
                    onChange={e => save('claudeModel', e.target.value)}>
                    <option value="claude-opus-4-6">Claude Opus 4.6 (Most capable)</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Balanced)</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fastest)</option>
                  </select>
                </div>
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                  <strong style={{ color: 'var(--blue)' }}>Note:</strong> Your API key is stored locally in your browser and never sent anywhere except directly to Anthropic's API.
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
                <div className="settings-row">
                  <div>
                    <div className="settings-label">Color Accent</div>
                    <div className="settings-desc">Primary interface color (requires refresh)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6', '#f97316'].map(c => (
                      <div
                        key={c}
                        style={{
                          width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                          border: settings.accentColor === c ? '2px solid white' : '2px solid transparent',
                          boxShadow: settings.accentColor === c ? `0 0 8px ${c}` : 'none',
                        }}
                        onClick={() => save('accentColor', c)}
                      />
                    ))}
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

          </div>
        </div>
      </div>
    </div>
  )
}
