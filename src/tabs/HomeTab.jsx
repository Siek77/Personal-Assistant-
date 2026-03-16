import { useState, useEffect, useCallback, useRef } from 'react'
import { useSettings } from '../context/SettingsContext'

// ── Color helpers ─────────────────────────────────────────────────────────────
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('')
}
function hexToRgbArr(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function isColorCapable(entity) {
  const modes = entity.attributes?.supported_color_modes || []
  return modes.some(m => ['rgb', 'hs', 'xy', 'rgbw', 'rgbww'].includes(m))
}

// ── Domain helpers ────────────────────────────────────────────────────────────

const DOMAIN_META = {
  light:         { icon: '💡', label: 'Lights',       color: '#f59e0b' },
  switch:        { icon: '🔌', label: 'Switches',     color: '#3b82f6' },
  climate:       { icon: '🌡️', label: 'Climate',      color: '#10b981' },
  sensor:        { icon: '📊', label: 'Sensors',      color: '#8b5cf6' },
  binary_sensor: { icon: '🔔', label: 'Alerts',       color: '#ef4444' },
  cover:         { icon: '🪟', label: 'Covers',       color: '#06b6d4' },
  media_player:  { icon: '📺', label: 'Media',        color: '#ec4899' },
  automation:    { icon: '⚡', label: 'Automations',  color: '#f97316' },
  scene:         { icon: '🎭', label: 'Scenes',       color: '#a78bfa' },
  script:        { icon: '📜', label: 'Scripts',      color: '#94a3b8' },
  input_boolean: { icon: '🎛️', label: 'Helpers',      color: '#64748b' },
}

function domain(entityId) { return entityId.split('.')[0] }
function friendlyName(entity) {
  return entity.attributes?.friendly_name || entity.entity_id.split('.')[1].replace(/_/g, ' ')
}
function isToggleable(entity) {
  const d = domain(entity.entity_id)
  return ['light', 'switch', 'input_boolean', 'automation'].includes(d)
}
function isOn(entity) { return entity.state === 'on' }

// ── Entity card ───────────────────────────────────────────────────────────────

function EntityCard({ entity, onToggle, onTrigger, pending }) {
  const d = domain(entity.entity_id)
  const meta = DOMAIN_META[d] || { icon: '🔷', label: d, color: '#64748b' }
  const name = friendlyName(entity)
  const on = isOn(entity)
  const toggleable = isToggleable(entity)
  const colorable = d === 'light' && on && isColorCapable(entity)
  const [localColor, setLocalColor] = useState(null)
  const colorTimerRef = useRef(null)

  // Climate display
  const isClimate = d === 'climate'
  const isSensor = d === 'sensor'
  const isCover = d === 'cover'
  const isMedia = d === 'media_player'
  const isScene = d === 'scene'
  const isScript = d === 'script'

  const stateColor = on ? meta.color : 'var(--text2)'
  const cardBg = on ? `${meta.color}12` : 'var(--bg3)'

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${on ? meta.color + '40' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      transition: 'all 0.2s',
      opacity: pending ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{meta.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
        </div>
        {toggleable && (
          <button
            onClick={() => onToggle(entity)}
            disabled={pending}
            style={{
              flexShrink: 0,
              width: 36, height: 20,
              borderRadius: 10,
              background: on ? meta.color : 'var(--border)',
              border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3,
              left: on ? 18 : 3,
              width: 14, height: 14,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
            }} />
          </button>
        )}
        {(isScene || isScript) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onTrigger(entity)}
            disabled={pending}
            style={{ fontSize: 11, padding: '2px 8px' }}
          >
            ▶
          </button>
        )}
      </div>

      {/* State display */}
      <div style={{ fontSize: 11, color: stateColor }}>
        {isClimate && (
          <>
            {entity.attributes?.current_temperature}° → {entity.attributes?.temperature}°
            {' '}· {entity.state}
          </>
        )}
        {isSensor && (
          <span style={{ fontFamily: 'monospace', color: meta.color }}>
            {entity.state}{entity.attributes?.unit_of_measurement || ''}
          </span>
        )}
        {isCover && entity.state}
        {isMedia && (
          entity.attributes?.media_title
            ? `${entity.attributes.media_title} · ${entity.state}`
            : entity.state
        )}
        {!isClimate && !isSensor && !isCover && !isMedia && (
          toggleable ? (
            <span style={{ color: on ? meta.color : 'var(--text2)' }}>
              {on ? 'On' : 'Off'}
            </span>
          ) : entity.state
        )}
      </div>

      {/* Brightness slider for lights */}
      {d === 'light' && on && entity.attributes?.brightness != null && (
        <input
          type="range" min={1} max={255}
          value={entity.attributes.brightness}
          style={{ width: '100%', accentColor: meta.color, height: 4 }}
          onChange={() => {}}
          onMouseUp={e => onToggle(entity, { brightness: Number(e.target.value) })}
        />
      )}
      {/* Color picker for color-capable lights */}
      {colorable && (() => {
        const rgb = entity.attributes?.rgb_color
        const hex = localColor || (rgb ? rgbToHex(rgb) : '#fbbf24')
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: hex, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
            <input
              type="color" value={hex}
              onChange={e => {
                const v = e.target.value
                setLocalColor(v)
                clearTimeout(colorTimerRef.current)
                colorTimerRef.current = setTimeout(() => onToggle(entity, { rgb_color: hexToRgbArr(v) }), 500)
              }}
              style={{ flex: 1, height: 20, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'none' }}
              title="Pick color"
            />
            <span style={{ fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>Color</span>
          </div>
        )
      })()}
    </div>
  )
}

// ── Domain section ────────────────────────────────────────────────────────────

function DomainSection({ title, icon, entities, onToggle, onTrigger, pending }) {
  const [collapsed, setCollapsed] = useState(false)
  if (entities.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
          {entities.filter(e => isOn(e)).length}/{entities.length} on {collapsed ? '▸' : '▾'}
        </span>
      </div>
      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {entities.map(e => (
            <EntityCard
              key={e.entity_id}
              entity={e}
              onToggle={onToggle}
              onTrigger={onTrigger}
              pending={!!pending[e.entity_id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

const SHOWN_DOMAINS = ['light', 'switch', 'climate', 'cover', 'media_player', 'sensor', 'binary_sensor', 'automation', 'scene', 'script', 'input_boolean']

export default function HomeTab() {
  const { settings } = useSettings()
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState({})
  const [filter, setFilter] = useState('all')
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  const haUrl = (settings.haUrl || '').replace(/\/$/, '')
  const haToken = settings.haToken || ''
  const cfClientId = settings.cfClientId || ''
  const cfClientSecret = settings.cfClientSecret || ''
  const cfHeaders = cfClientId && cfClientSecret
    ? { 'CF-Access-Client-Id': cfClientId, 'CF-Access-Client-Secret': cfClientSecret }
    : {}

  // Detect mixed-content: app is HTTPS but HA URL is HTTP — blocked on iOS Safari
  const isMixedContent = window.location.protocol === 'https:' && haUrl.startsWith('http://')

  const fetchStates = useCallback(async () => {
    if (!haUrl || !haToken) return
    if (isMixedContent) {
      setError('mixed-content')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/ha-proxy?haUrl=${encodeURIComponent(haUrl)}&path=api/states`, {
        headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json', ...cfHeaders },
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) throw new Error(`HA returned ${r.status} — check URL and token`)
      const data = await r.json()
      setEntities(data.filter(e => SHOWN_DOMAINS.includes(domain(e.entity_id))))
      setLastUpdated(new Date())
      // Cache snapshot for Proactive widget + JARVIS context
      try {
        const lightsOn = data.filter(e => e.entity_id.startsWith('light.') && e.state === 'on').length
        const thermo = data.find(e => e.entity_id.startsWith('climate.'))
        localStorage.setItem('jarvis_ha_snapshot', JSON.stringify({
          lightsOn,
          temperature: thermo?.attributes?.current_temperature ?? null,
          lastUpdated: new Date().toISOString(),
        }))
      } catch {}
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [haUrl, haToken])

  useEffect(() => {
    fetchStates()
    intervalRef.current = setInterval(fetchStates, 30000)
    return () => clearInterval(intervalRef.current)
  }, [fetchStates])

  const callService = async (entity, service, data = {}) => {
    const d = domain(entity.entity_id)
    setPending(p => ({ ...p, [entity.entity_id]: true }))
    try {
      await fetch(`/api/ha-proxy?haUrl=${encodeURIComponent(haUrl)}&path=api/services/${d}/${service}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json', ...cfHeaders },
        body: JSON.stringify({ entity_id: entity.entity_id, ...data }),
        signal: AbortSignal.timeout(5000),
      })
      // Optimistic update
      setEntities(prev => prev.map(e =>
        e.entity_id === entity.entity_id
          ? { ...e, state: service === 'turn_on' ? 'on' : service === 'turn_off' ? 'off' : e.state }
          : e
      ))
      setTimeout(fetchStates, 1500)
    } catch (e) {
      setError(`Service call failed: ${e.message}`)
    } finally {
      setPending(p => { const n = { ...p }; delete n[entity.entity_id]; return n })
    }
  }

  const handleToggle = (entity, extra = {}) => {
    const on = isOn(entity)
    const d = domain(entity.entity_id)
    if (d === 'automation') {
      callService(entity, on ? 'turn_off' : 'turn_on')
    } else if (Object.keys(extra).length > 0) {
      callService(entity, 'turn_on', extra)
    } else {
      callService(entity, on ? 'turn_off' : 'turn_on')
    }
  }

  const handleTrigger = (entity) => {
    const d = domain(entity.entity_id)
    if (d === 'scene') callService(entity, 'turn_on')
    else if (d === 'script') callService(entity, 'turn_on')
  }

  const grouped = SHOWN_DOMAINS.reduce((acc, d) => {
    acc[d] = entities.filter(e => domain(e.entity_id) === d)
    return acc
  }, {})

  const filterDomains = filter === 'all'
    ? SHOWN_DOMAINS
    : [filter]

  if (!haUrl || !haToken) {
    return (
      <div className="tab-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <div style={{ fontSize: 48 }}>🏠</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--orange)' }}>Home Assistant</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', maxWidth: 400, lineHeight: 1.7 }}>
          Control your smart home via <strong>Home Assistant</strong> — which bridges HomeKit, Matter, Zigbee, Z-Wave, and more.
          Enter your HA URL and a Long-Lived Access Token in <strong>Settings → Home</strong> to connect.
        </p>
        <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)', padding: '12px 16px', borderRadius: 8, lineHeight: 1.8, maxWidth: 400 }}>
          <strong style={{ color: 'var(--text3)' }}>Setup:</strong><br/>
          1. Open Home Assistant → Profile → Long-Lived Access Tokens<br/>
          2. Create a token and copy it<br/>
          3. Enable CORS in HA <code style={{ fontSize: 10, background: 'var(--bg2)', padding: '1px 4px', borderRadius: 3 }}>configuration.yaml</code>:<br/>
          <code style={{ fontSize: 10 }}>http:<br/>  cors_allowed_origins:<br/>    - https://jarvis-dashboard-fawn.vercel.app</code>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-shell">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}>🏠 Home</h2>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={fetchStates}
          disabled={loading}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? '⏳' : '⟳ Refresh'}
        </button>
      </div>

      {error === 'mixed-content' ? (
        <div style={{ padding: '14px 16px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: '#f97316', marginBottom: 8, fontSize: 13 }}>⚠️ Blocked on iPad / iOS Safari</div>
          <p style={{ margin: '0 0 8px' }}>
            Your HA URL is <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4 }}>http://</code> but this app runs on <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4 }}>https://</code>. iOS Safari blocks mixed-content requests, so iPad can't reach the local HA server.
          </p>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Fix options:</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Nabu Casa</strong> — subscribe at <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>nabucasa.com</code>, gives you a secure <code>https://</code> remote URL</li>
            <li><strong>Cloudflare Tunnel</strong> — free, wraps your local HA in <code>https://</code> accessible from anywhere</li>
            <li><strong>Self-signed cert on HA</strong> — enable HTTPS in HA with a local cert (iOS requires trusting it first)</li>
            <li><strong>Use IP on same Wi-Fi</strong> — only works if your app is also on <code>http://</code> (self-hosted)</li>
          </ol>
          <div style={{ marginTop: 8, color: '#f97316' }}>Once you have an <code>https://</code> URL, update it in <strong>Settings → Home</strong>.</div>
        </div>
      ) : error ? (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      ) : null}

      {/* Quick stats */}
      {entities.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Entities', value: entities.length, color: 'var(--text)' },
            { label: 'Lights on', value: grouped.light?.filter(isOn).length || 0, color: '#f59e0b' },
            { label: 'Switches on', value: grouped.switch?.filter(isOn).length || 0, color: '#3b82f6' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: '1 1 80px', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'Orbitron, monospace' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Domain filter */}
      {entities.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, ...SHOWN_DOMAINS.filter(d => grouped[d]?.length > 0).map(d => ({
            id: d, label: DOMAIN_META[d]?.icon + ' ' + DOMAIN_META[d]?.label
          }))].map(f => (
            <button
              key={f.id}
              className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.id)}
              style={{ fontSize: 11 }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading && entities.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 13 }}>
          Connecting to Home Assistant…
        </div>
      )}

      {/* Entities by domain */}
      {filterDomains.map(d => (
        <DomainSection
          key={d}
          title={DOMAIN_META[d]?.label || d}
          icon={DOMAIN_META[d]?.icon || '🔷'}
          entities={grouped[d] || []}
          onToggle={handleToggle}
          onTrigger={handleTrigger}
          pending={pending}
        />
      ))}

      {entities.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)', fontSize: 13 }}>
          No entities found. Check your HA connection and that entities are configured.
        </div>
      )}

      {/* Footer note */}
      <div style={{ marginTop: 24, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text3)' }}>HomeKit & Matter:</strong> Devices paired to HomeKit or Matter are accessible here via Home Assistant's bridge. Automations created in Home app or through Matter also appear as HA automations.
      </div>
    </div>
  )
}
