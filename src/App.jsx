import { useState, useEffect, useRef, useCallback } from 'react'
import Layout from './components/Layout'
import JarvisTab from './tabs/JarvisTab'
import ESP32Tab from './tabs/ESP32Tab'
import SpotifyTab from './tabs/SpotifyTab'
import DashboardTab from './tabs/DashboardTab'
import HomeTab from './tabs/HomeTab'
import CalendarTab from './tabs/CalendarTab'
import WeatherTab from './tabs/WeatherTab'
import SettingsTab from './tabs/SettingsTab'
import { MemoryProvider } from './context/MemoryContext'
import { useMemory } from './context/MemoryContext'
import { SettingsProvider } from './context/SettingsContext'
import { useSettings } from './context/SettingsContext'
import { applyPersistedPayload, buildPersistencePayload, getOrCreateClientId } from './utils/persistence'
import './App.css'

function PersistenceManager() {
  const { settings, updateSettings } = useSettings()
  const { memory, mergeRemoteMemory } = useMemory()
  const timerRef = useRef(null)
  const isFirstRender = useRef(true)
  const hydratedRef = useRef(false)

  useEffect(() => {
    const clientId = getOrCreateClientId()
    ;(async () => {
      try {
        const res = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}`)
        const { data } = await res.json()
        applyPersistedPayload(data, { updateSettings, mergeRemoteMemory })
      } catch {
        // Ignore bootstrap sync issues and keep local state usable.
      } finally {
        hydratedRef.current = true
      }
    })()
  }, [])

  const persistNow = useCallback(async () => {
    const clientId = getOrCreateClientId()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const payload = buildPersistencePayload(settings, memory)
        const res = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const { savedAt } = await res.json()
        if (savedAt) localStorage.setItem('jarvis_last_synced', savedAt)
      } catch {
        // Keep the app responsive even if persistence is temporarily unavailable.
      }
    }, 2000)
  }, [settings, memory])

  useEffect(() => {
    const events = [
      'jarvis:calendar-updated',
      'jarvis:email-updated',
      'jarvis:weather-updated',
      'jarvis:ha-updated',
      'jarvis:stocks-updated',
    ]
    events.forEach(eventName => window.addEventListener(eventName, persistNow))
    return () => {
      events.forEach(eventName => window.removeEventListener(eventName, persistNow))
    }
  }, [persistNow])

  useEffect(() => {
    if (!hydratedRef.current) return
    if (isFirstRender.current) { isFirstRender.current = false; return }
    persistNow()
    return () => clearTimeout(timerRef.current)
  }, [settings, memory, persistNow])

  return null
}

export const TABS = [
  { id: 'jarvis',    label: 'JARVIS',    icon: '🤖', color: '#3b82f6' },
  { id: 'weather',   label: 'Weather',   icon: '🌦️',  color: '#06b6d4' },
  { id: 'esp32',     label: 'ESP32',     icon: '📡', color: '#06b6d4' },
  { id: 'spotify',   label: 'Spotify',   icon: '🎵', color: '#1db954' },
  { id: 'home',      label: 'Home',      icon: '🏠', color: '#f97316' },
  { id: 'calendar',  label: 'Calendar',  icon: '📅', color: '#ec4899' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊', color: '#8b5cf6' },
  { id: 'settings',  label: 'Settings',  icon: '⚙️',  color: '#64748b' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('jarvis')

  return (
    <SettingsProvider>
      <MemoryProvider>
        <PersistenceManager />
        <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
          {activeTab === 'jarvis'    && <JarvisTab />}
          {activeTab === 'weather'   && <WeatherTab />}
          {activeTab === 'esp32'     && <ESP32Tab />}
          {activeTab === 'spotify'   && <SpotifyTab />}
          {activeTab === 'home'      && <HomeTab />}
          {activeTab === 'calendar'  && <CalendarTab />}
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'settings'  && <SettingsTab />}
        </Layout>
      </MemoryProvider>
    </SettingsProvider>
  )
}
