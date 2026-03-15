import { useState, useEffect, useRef } from 'react'

const DEFAULT_DEVICES = []

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="toggle-switch" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={checked} onChange={e => !disabled && onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}

// ── Device edit form ─────────────────────────────────────────────
function EditDeviceForm({ device, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: device.name,
    ip: device.ip,
    type: device.type,
    pins: device.pins ? device.pins.map(p => ({ ...p })) : [],
    endpoints: device.endpoints || [],
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const updatePin = (i, key, val) => setForm(f => ({
    ...f,
    pins: f.pins.map((p, idx) => idx === i ? { ...p, [key]: key === 'num' ? parseInt(val) || 0 : val } : p),
  }))
  const addPin = () => setForm(f => ({ ...f, pins: [...f.pins, { num: 2, label: 'New Output', state: false }] }))
  const removePin = (i) => setForm(f => ({ ...f, pins: f.pins.filter((_, idx) => idx !== i) }))

  const updateEndpoint = (i, key, val) => setForm(f => ({
    ...f,
    endpoints: f.endpoints.map((e, idx) => idx === i ? { ...e, [key]: val } : e),
  }))
  const addEndpoint = () => setForm(f => ({ ...f, endpoints: [...f.endpoints, { label: 'Custom Action', path: '/cmd', method: 'GET' }] }))
  const removeEndpoint = (i) => setForm(f => ({ ...f, endpoints: f.endpoints.filter((_, idx) => idx !== i) }))

  return (
    <div className="card fade-in" style={{ border: '1px solid var(--cyan)', marginBottom: 12 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', marginBottom: 14 }}>
        ✏️ Editing: {device.name}
      </h4>

      {/* Basic info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Device Name</div>
          <input className="input" style={{ fontSize: 13 }} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Bedroom Lights" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>IP Address</div>
          <input className="input" style={{ fontSize: 13, fontFamily: 'monospace' }} value={form.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.100" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Device Type</div>
        <select className="input" style={{ fontSize: 13 }} value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="gpio">GPIO Control (toggle outputs)</option>
          <option value="sensor">Sensor Node (read data)</option>
          <option value="generic">Generic (custom endpoints)</option>
        </select>
      </div>

      {/* GPIO Pins editor */}
      {form.type === 'gpio' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>GPIO Pins</div>
            <button className="btn btn-ghost btn-sm" onClick={addPin}>+ Add Pin</button>
          </div>
          {form.pins.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 0' }}>No pins — click "Add Pin" to configure outputs.</div>
          )}
          {form.pins.map((pin, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input
                className="input" style={{ fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}
                value={pin.num} onChange={e => updatePin(i, 'num', e.target.value)}
                placeholder="Pin#" type="number" min="0" max="39"
              />
              <input
                className="input" style={{ fontSize: 13 }}
                value={pin.label} onChange={e => updatePin(i, 'label', e.target.value)}
                placeholder="e.g. Bedroom Light"
              />
              <button className="btn btn-danger btn-sm" onClick={() => removePin(i)}>✕</button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
            ESP32 GPIO numbers (0–39). Common: 2=onboard LED, 4,5,12–15,16–33=general purpose
          </div>
        </div>
      )}

      {/* Custom endpoints */}
      {(form.type === 'generic' || form.type === 'sensor') && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Custom Endpoints</div>
            <button className="btn btn-ghost btn-sm" onClick={addEndpoint}>+ Add</button>
          </div>
          {form.endpoints.map((ep, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input className="input" style={{ fontSize: 12 }} value={ep.label} onChange={e => updateEndpoint(i, 'label', e.target.value)} placeholder="Button label" />
              <input className="input" style={{ fontSize: 12, fontFamily: 'monospace' }} value={ep.path} onChange={e => updateEndpoint(i, 'path', e.target.value)} placeholder="/path" />
              <select className="input" style={{ fontSize: 12, width: 'auto', padding: '6px 8px' }} value={ep.method} onChange={e => updateEndpoint(i, 'method', e.target.value)}>
                <option>GET</option><option>POST</option>
              </select>
              <button className="btn btn-danger btn-sm" onClick={() => removeEndpoint(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>Save Device</button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function ESP32Tab() {
  const [devices, setDevices] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_esp32') || 'null') || DEFAULT_DEVICES } catch { return DEFAULT_DEVICES }
  })
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [newDevice, setNewDevice] = useState({ name: '', ip: '', type: 'gpio' })
  const [editingId, setEditingId] = useState(null)
  const [consoleLogs, setConsoleLogs] = useState(['[JARVIS ESP32] Console ready...'])
  const [sending, setSending] = useState({})
  const consoleRef = useRef(null)

  useEffect(() => { localStorage.setItem('jarvis_esp32', JSON.stringify(devices)) }, [devices])
  useEffect(() => { if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight }, [consoleLogs])

  const log = (msg, type = 'info') => {
    const prefix = { error: '❌', success: '✅', data: '📡' }[type] || '→'
    setConsoleLogs(p => [...p.slice(-200), `[${new Date().toLocaleTimeString()}] ${prefix} ${msg}`])
  }

  const pingDevice = async (device) => {
    log(`Pinging ${device.name} at ${device.ip}…`)
    try {
      const res = await fetch(`http://${device.ip}/ping`, { signal: AbortSignal.timeout(3000) })
      setDevices(p => p.map(d => d.id === device.id ? { ...d, online: res.ok } : d))
      log(`${device.name}: ${res.ok ? 'ONLINE' : 'OFFLINE'}`, res.ok ? 'success' : 'error')
    } catch {
      setDevices(p => p.map(d => d.id === device.id ? { ...d, online: false } : d))
      log(`${device.name}: Connection failed`, 'error')
    }
  }

  const pingAll = () => devices.forEach(d => pingDevice(d))

  const togglePin = async (device, pin) => {
    const newState = !pin.state
    const key = `${device.id}-${pin.num}`
    setSending(p => ({ ...p, [key]: true }))
    log(`GPIO${pin.num} (${pin.label}) → ${newState ? 'HIGH' : 'LOW'}`)
    setDevices(p => p.map(d => d.id === device.id ? { ...d, pins: d.pins.map(p => p.num === pin.num ? { ...p, state: newState } : p) } : d))
    try {
      const res = await fetch(`http://${device.ip}/gpio?pin=${pin.num}&state=${newState ? 1 : 0}`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      log(`GPIO${pin.num} OK`, 'success')
    } catch (e) {
      log(`GPIO${pin.num} failed: ${e.message}`, 'error')
      setDevices(p => p.map(d => d.id === device.id ? { ...d, pins: d.pins.map(p => p.num === pin.num ? { ...p, state: !newState } : p) } : d))
    } finally {
      setSending(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

  const fetchSensors = async (device) => {
    log(`Fetching sensors from ${device.name}…`)
    try {
      const res = await fetch(`http://${device.ip}/sensors`, { signal: AbortSignal.timeout(3000) })
      const data = await res.json()
      setDevices(p => p.map(d => d.id === device.id ? { ...d, sensors: data, online: true } : d))
      log(`Sensors: ${JSON.stringify(data)}`, 'data')
    } catch (e) { log(`Sensor fetch failed: ${e.message}`, 'error') }
  }

  const callEndpoint = async (device, ep) => {
    log(`Calling ${ep.method} ${device.ip}${ep.path}`)
    try {
      const res = await fetch(`http://${device.ip}${ep.path}`, { method: ep.method, signal: AbortSignal.timeout(5000) })
      const text = await res.text()
      log(`Response (${res.status}): ${text.slice(0, 120)}`, res.ok ? 'data' : 'error')
    } catch (e) { log(`${ep.label} failed: ${e.message}`, 'error') }
  }

  const addDevice = () => {
    if (!newDevice.name || !newDevice.ip) return
    const d = {
      id: Date.now(), name: newDevice.name, ip: newDevice.ip,
      type: newDevice.type, online: false,
      pins: newDevice.type === 'gpio' ? [{ num: 2, label: 'Output 1', state: false }] : [],
      sensors: newDevice.type === 'sensor' ? { temp: null, humidity: null, light: null } : undefined,
      endpoints: [],
    }
    setDevices(p => [...p, d])
    setNewDevice({ name: '', ip: '', type: 'gpio' })
    setShowAddDevice(false)
    log(`Added: ${d.name} (${d.ip})`)
    // Immediately open edit for new device so user can configure
    setEditingId(d.id)
  }

  const saveDevice = (id, form) => {
    setDevices(p => p.map(d => d.id === id ? { ...d, ...form } : d))
    setEditingId(null)
    log(`Saved: ${form.name} (${form.ip})`, 'success')
  }

  const removeDevice = (id) => {
    setDevices(p => p.filter(d => d.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)' }}>📡 ESP32 Devices</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={pingAll}>Ping All</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>+ Add Device</button>
        </div>
      </div>

      {/* Add device form */}
      {showAddDevice && (
        <div className="card fade-in">
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Add New ESP32</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="input" placeholder="Device name" value={newDevice.name} onChange={e => setNewDevice(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="IP (e.g. 192.168.1.100)" value={newDevice.ip} onChange={e => setNewDevice(p => ({ ...p, ip: e.target.value }))} style={{ fontFamily: 'monospace' }} />
            </div>
            <select className="input" value={newDevice.type} onChange={e => setNewDevice(p => ({ ...p, type: e.target.value }))}>
              <option value="gpio">GPIO Control</option>
              <option value="sensor">Sensor Node</option>
              <option value="generic">Generic / Custom</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={addDevice}>Add & Configure</button>
              <button className="btn btn-ghost" onClick={() => setShowAddDevice(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Device list */}
      {devices.map(device => (
        <div key={device.id}>
          {editingId === device.id ? (
            <EditDeviceForm
              device={device}
              onSave={form => saveDevice(device.id, form)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className={`device-card ${device.online ? 'online' : ''}`}>
              {/* Card header */}
              <div className="device-header">
                <div style={{ minWidth: 0 }}>
                  <div className="device-name">{device.name}</div>
                  <div className="device-ip">{device.ip}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${device.online ? 'badge-green' : 'badge-red'}`}>
                    <span className={`dot ${device.online ? 'dot-green' : 'dot-red'}`} />
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                  <span className="badge badge-blue">{device.type}</span>
                </div>
              </div>

              {/* GPIO Pins */}
              {device.type === 'gpio' && device.pins?.map(pin => (
                <div key={pin.num} className="gpio-row" onClick={e => e.stopPropagation()}>
                  <span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)' }}>GPIO{pin.num}</span>
                    {' — '}
                    <span style={{ color: 'var(--text3)' }}>{pin.label}</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sending[`${device.id}-${pin.num}`] && <span style={{ fontSize: 10, color: 'var(--text2)' }}>…</span>}
                    <Toggle checked={pin.state} onChange={() => togglePin(device, pin)} disabled={!!sending[`${device.id}-${pin.num}`]} />
                  </div>
                </div>
              ))}
              {device.type === 'gpio' && device.pins?.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 0' }}>No pins configured — tap Edit to add outputs.</div>
              )}

              {/* Sensor values */}
              {device.type === 'sensor' && device.sensors && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                  {[
                    { label: 'Temp', value: device.sensors.temp != null ? `${device.sensors.temp}°C` : '—', icon: '🌡️' },
                    { label: 'Humidity', value: device.sensors.humidity != null ? `${device.sensors.humidity}%` : '—', icon: '💧' },
                    { label: 'Light', value: device.sensors.light != null ? `${device.sensors.light}lx` : '—', icon: '☀️' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14 }}>{s.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cyan)' }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom endpoints */}
              {device.endpoints?.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {device.endpoints.map((ep, i) => (
                    <button key={i} className="btn btn-ghost btn-sm" onClick={() => callEndpoint(device, ep)}>
                      {ep.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => pingDevice(device)}>Ping</button>
                {device.type === 'sensor' && (
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => fetchSensors(device)}>Refresh</button>
                )}
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setEditingId(device.id)}>✏️ Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeDevice(device.id)}>✕</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {devices.length === 0 && !showAddDevice && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
          <div style={{ marginBottom: 8 }}>No devices added yet.</div>
          <button className="btn btn-primary" onClick={() => setShowAddDevice(true)}>+ Add Your First ESP32</button>
        </div>
      )}

      {/* Firmware reference */}
      <div className="card">
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--cyan)' }}>ESP32 Starter Firmware</h4>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Flash this to your ESP32. Update SSID/password then upload via Arduino IDE:</p>
        <div className="code-block">{`#include <WiFi.h>
#include <WebServer.h>

const char* ssid     = "YOUR_WIFI";
const char* password = "YOUR_PASS";
WebServer server(80);

void handlePing()  { server.send(200, "text/plain", "pong"); }
void handleGPIO()  {
  int pin   = server.arg("pin").toInt();
  int state = server.arg("state").toInt();
  pinMode(pin, OUTPUT);
  digitalWrite(pin, state);
  server.send(200, "text/plain", "OK");
}
void handleSensors() {
  // Replace with real sensor reads (DHT22, BMP280, etc.)
  String json = "{\\"temp\\":25.3,\\"humidity\\":60,\\"light\\":800}";
  server.send(200, "application/json", json);
}

void setup() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  server.on("/ping",    handlePing);
  server.on("/gpio",    handleGPIO);
  server.on("/sensors", handleSensors);
  server.begin();
  // Serial.print("IP: "); Serial.println(WiFi.localIP());
}
void loop() { server.handleClient(); }`}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
          After flashing, find your ESP32's IP in your router's device list or uncomment the Serial.print line and check the Arduino serial monitor.
        </p>
      </div>

      {/* Console */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Console</h4>
          <button className="btn btn-ghost btn-sm" onClick={() => setConsoleLogs(['[JARVIS ESP32] Console cleared.'])}>Clear</button>
        </div>
        <div className="serial-console" ref={consoleRef}>
          {consoleLogs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  )
}
