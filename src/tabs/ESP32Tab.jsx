import { useState, useEffect, useRef } from 'react'

const DEFAULT_DEVICES = [
  { id: 1, name: 'Living Room Controller', ip: '192.168.1.100', type: 'gpio', online: false, pins: [{ num: 2, label: 'LED', state: false }, { num: 4, label: 'Relay 1', state: false }, { num: 5, label: 'Fan', state: false }] },
  { id: 2, name: 'Sensor Node', ip: '192.168.1.101', type: 'sensor', online: false, pins: [], sensors: { temp: null, humidity: null, light: null } },
]

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}

export default function ESP32Tab() {
  const [devices, setDevices] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_esp32') || 'null') || DEFAULT_DEVICES } catch { return DEFAULT_DEVICES }
  })
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [newDevice, setNewDevice] = useState({ name: '', ip: '', type: 'gpio' })
  const [consoleLogs, setConsoleLogs] = useState(['[JARVIS ESP32] Console ready...'])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [sending, setSending] = useState({})
  const consoleRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('jarvis_esp32', JSON.stringify(devices))
  }, [devices])

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
  }, [consoleLogs])

  const log = (msg, type = 'info') => {
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'data' ? '📡' : '→'
    setConsoleLogs(p => [...p.slice(-200), `[${new Date().toLocaleTimeString()}] ${prefix} ${msg}`])
  }

  const pingDevice = async (device) => {
    log(`Pinging ${device.name} at ${device.ip}...`)
    try {
      const res = await fetch(`http://${device.ip}/ping`, { signal: AbortSignal.timeout(3000) })
      const ok = res.ok
      setDevices(p => p.map(d => d.id === device.id ? { ...d, online: ok } : d))
      log(`${device.name}: ${ok ? 'ONLINE' : 'OFFLINE'}`, ok ? 'success' : 'error')
    } catch {
      setDevices(p => p.map(d => d.id === device.id ? { ...d, online: false } : d))
      log(`${device.name}: Connection failed (${device.ip})`, 'error')
    }
  }

  const pingAll = () => devices.forEach(d => pingDevice(d))

  const togglePin = async (device, pin) => {
    const newState = !pin.state
    const key = `${device.id}-${pin.num}`
    setSending(p => ({ ...p, [key]: true }))
    log(`Setting GPIO${pin.num} (${pin.label}) on ${device.name} to ${newState ? 'HIGH' : 'LOW'}`)

    // Optimistic update
    setDevices(p => p.map(d => d.id === device.id
      ? { ...d, pins: d.pins.map(p => p.num === pin.num ? { ...p, state: newState } : p) }
      : d
    ))

    try {
      const res = await fetch(`http://${device.ip}/gpio?pin=${pin.num}&state=${newState ? 1 : 0}`, {
        signal: AbortSignal.timeout(3000)
      })
      if (res.ok) {
        log(`GPIO${pin.num} set to ${newState ? 'HIGH' : 'LOW'}`, 'success')
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (e) {
      log(`Failed to control GPIO${pin.num}: ${e.message}`, 'error')
      // Revert
      setDevices(p => p.map(d => d.id === device.id
        ? { ...d, pins: d.pins.map(p => p.num === pin.num ? { ...p, state: !newState } : p) }
        : d
      ))
    } finally {
      setSending(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

  const fetchSensors = async (device) => {
    log(`Fetching sensor data from ${device.name}...`)
    try {
      const res = await fetch(`http://${device.ip}/sensors`, { signal: AbortSignal.timeout(3000) })
      const data = await res.json()
      setDevices(p => p.map(d => d.id === device.id ? { ...d, sensors: data, online: true } : d))
      log(`Sensors: Temp=${data.temp}°C, Humidity=${data.humidity}%, Light=${data.light}`, 'data')
    } catch (e) {
      log(`Sensor fetch failed: ${e.message}`, 'error')
    }
  }

  const sendCommand = async (device, cmd) => {
    log(`Sending command "${cmd}" to ${device.name}`)
    try {
      const res = await fetch(`http://${device.ip}/cmd?q=${encodeURIComponent(cmd)}`, { signal: AbortSignal.timeout(3000) })
      const text = await res.text()
      log(`Response: ${text}`, 'data')
    } catch (e) {
      log(`Command failed: ${e.message}`, 'error')
    }
  }

  const addDevice = () => {
    if (!newDevice.name || !newDevice.ip) return
    const d = {
      id: Date.now(),
      name: newDevice.name,
      ip: newDevice.ip,
      type: newDevice.type,
      online: false,
      pins: newDevice.type === 'gpio' ? [{ num: 2, label: 'GPIO 2', state: false }] : [],
      sensors: newDevice.type === 'sensor' ? { temp: null, humidity: null, light: null } : undefined,
    }
    setDevices(p => [...p, d])
    setNewDevice({ name: '', ip: '', type: 'gpio' })
    setShowAddDevice(false)
    log(`Added device: ${d.name} (${d.ip})`)
  }

  const removeDevice = (id) => {
    setDevices(p => p.filter(d => d.id !== id))
    if (selectedDevice?.id === id) setSelectedDevice(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - var(--header) - 40px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)' }}>📡 ESP32 Device Manager</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={pingAll}>Ping All</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(true)}>+ Add Device</button>
        </div>
      </div>

      {/* Add device form */}
      {showAddDevice && (
        <div className="card fade-in">
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Add New ESP32 Device</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
            <input className="input" placeholder="Device name" value={newDevice.name} onChange={e => setNewDevice(p => ({ ...p, name: e.target.value }))} />
            <input className="input" placeholder="IP address (e.g. 192.168.1.100)" value={newDevice.ip} onChange={e => setNewDevice(p => ({ ...p, ip: e.target.value }))} />
            <select className="input" style={{ width: 'auto' }} value={newDevice.type} onChange={e => setNewDevice(p => ({ ...p, type: e.target.value }))}>
              <option value="gpio">GPIO Control</option>
              <option value="sensor">Sensor Node</option>
              <option value="generic">Generic</option>
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={addDevice}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDevice(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Device Grid */}
        <div className="device-grid">
          {devices.map(device => (
            <div
              key={device.id}
              className={`device-card ${device.online ? 'online' : ''} ${selectedDevice?.id === device.id ? 'selected' : ''}`}
              style={{ cursor: 'pointer', border: selectedDevice?.id === device.id ? '1px solid var(--cyan)' : undefined }}
              onClick={() => setSelectedDevice(device)}
            >
              <div className="device-header">
                <div>
                  <div className="device-name">{device.name}</div>
                  <div className="device-ip">{device.ip}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${device.online ? 'badge-green' : 'badge-red'}`}>
                    <span className={`dot ${device.online ? 'dot-green' : 'dot-red'}`} />
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                  <span className="badge badge-blue">{device.type}</span>
                </div>
              </div>

              {/* GPIO Pins */}
              {device.type === 'gpio' && device.pins.map(pin => (
                <div key={pin.num} className="gpio-row" onClick={e => e.stopPropagation()}>
                  <span>GPIO {pin.num} — <span style={{ color: 'var(--text3)' }}>{pin.label}</span></span>
                  <Toggle checked={pin.state} onChange={() => togglePin(device, pin)} />
                </div>
              ))}

              {/* Sensors */}
              {device.type === 'sensor' && device.sensors && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
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

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); pingDevice(device) }}>Ping</button>
                {device.type === 'sensor' && <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); fetchSensors(device) }}>Refresh</button>}
                <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); removeDevice(device.id) }}>✕</button>
              </div>
            </div>
          ))}

          {devices.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
              No devices added yet. Click "+ Add Device" to get started.
            </div>
          )}
        </div>

        {/* ESP32 Arduino code helper */}
        <div className="card">
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--cyan)' }}>ESP32 Arduino Firmware (Starter)</h4>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Flash this to your ESP32 to enable JARVIS control:</p>
          <div className="code-block">{`#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_PASS";
WebServer server(80);

void handlePing() { server.send(200, "text/plain", "pong"); }
void handleGPIO() {
  int pin = server.arg("pin").toInt();
  int state = server.arg("state").toInt();
  pinMode(pin, OUTPUT);
  digitalWrite(pin, state);
  server.send(200, "text/plain", "OK");
}
void handleSensors() {
  // Add DHT or other sensors here
  String json = "{\\"temp\\":25.3,\\"humidity\\":60,\\"light\\":800}";
  server.send(200, "application/json", json);
}

void setup() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  server.on("/ping", handlePing);
  server.on("/gpio", handleGPIO);
  server.on("/sensors", handleSensors);
  server.begin();
}
void loop() { server.handleClient(); }`}
          </div>
        </div>

        {/* Serial Console */}
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
    </div>
  )
}
