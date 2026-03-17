import { useState } from 'react'
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
import { SettingsProvider } from './context/SettingsContext'
import './App.css'

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
