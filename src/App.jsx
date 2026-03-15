import { useState, useEffect, useRef } from 'react'
import Layout from './components/Layout'
import JarvisTab from './tabs/JarvisTab'
import ESP32Tab from './tabs/ESP32Tab'
import SpotifyTab from './tabs/SpotifyTab'
import DashboardTab from './tabs/DashboardTab'
import SettingsTab from './tabs/SettingsTab'
import { MemoryProvider } from './context/MemoryContext'
import { useMemory } from './context/MemoryContext'
import { SettingsProvider } from './context/SettingsContext'
import { useSettings } from './context/SettingsContext'
import './App.css'

async function hashPassphrase(passphrase) {
  const encoder = new TextEncoder()
  const data = encoder.encode('jarvis:' + passphrase)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Auto-push on settings change (debounced 2s) + auto-pull on mount
function SyncAutoManager() {
  const { settings, updateSettings } = useSettings()
  const { mergeRemoteMemory } = useMemory()
  const timerRef = useRef(null)
  const isFirstRender = useRef(true)

  // Auto-pull on mount if passphrase is set — MERGES memory, never overwrites
  useEffect(() => {
    const passphrase = localStorage.getItem('jarvis_sync_passphrase')
    if (!passphrase) return
    ;(async () => {
      try {
        const key = await hashPassphrase(passphrase)
        const res = await fetch(`/api/sync?key=${key}`)
        const { data } = await res.json()
        if (!data?.settings) return
        updateSettings(data.settings)
        if (data.esp32) localStorage.setItem('jarvis_esp32', JSON.stringify(data.esp32))
        if (data.memory) mergeRemoteMemory(data.memory)  // merge, not overwrite
        if (data.savedAt) localStorage.setItem('jarvis_last_synced', data.savedAt)
      } catch {}
    })()
  }, [])

  // Auto-push on settings change (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const passphrase = localStorage.getItem('jarvis_sync_passphrase')
    if (!passphrase) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const key = await hashPassphrase(passphrase)
        const payload = {
          settings,
          esp32: JSON.parse(localStorage.getItem('jarvis_esp32') || '[]'),
          memory: JSON.parse(localStorage.getItem('jarvis_memory') || '{}'),
        }
        const res = await fetch(`/api/sync?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const { savedAt } = await res.json()
        if (savedAt) localStorage.setItem('jarvis_last_synced', savedAt)
      } catch {}
    }, 2000)
    return () => clearTimeout(timerRef.current)
  }, [settings])

  return null
}

export const TABS = [
  { id: 'jarvis',    label: 'JARVIS',    icon: '🤖', color: '#3b82f6' },
  { id: 'esp32',     label: 'ESP32',     icon: '📡', color: '#06b6d4' },
  { id: 'spotify',   label: 'Spotify',   icon: '🎵', color: '#1db954' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊', color: '#8b5cf6' },
  { id: 'settings',  label: 'Settings',  icon: '⚙️',  color: '#64748b' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('jarvis')

  return (
    <SettingsProvider>
      <MemoryProvider>
        <SyncAutoManager />
        <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
          {activeTab === 'jarvis'    && <JarvisTab />}
          {activeTab === 'esp32'     && <ESP32Tab />}
          {activeTab === 'spotify'   && <SpotifyTab />}
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'settings'  && <SettingsTab />}
        </Layout>
      </MemoryProvider>
    </SettingsProvider>
  )
}
