import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext()

const DEFAULTS = {
  aiProvider: 'groq',           // 'groq' | 'claude' | 'gemini' | 'openrouter'
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-6',
  geminiApiKey: '',
  openrouterApiKey: '',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  spotifyClientId: '',
  weatherApiKey: '',
  newsApiKey: '',
  googleClientId: '',
  userName: 'User',
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  wakeWord: 'Hey JARVIS',
  voiceEnabled: false,
  scanlineEffect: true,
  theme: 'dark',
  // Theme colors
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  // Dashboard layout — JSON string of [{id, x, y, w}] or null for default
  dashboardLayout: null,
  // Custom widgets — JSON string of [{id, title, icon, type, content}]
  customWidgets: '[]',
  // Home Assistant / HomeKit / Matter
  haUrl: '',
  haToken: '',
  // Notion
  notionApiKey: '',
  notionDatabaseId: '',
  // Apple Calendar (CalDAV)
  calDavEmail: '',
  calDavPassword: '',
  // Uptime monitoring — JSON string of [{label, url}]
  uptimeUrls: '[]',
}

// Convert #rrggbb to "r,g,b"
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

function applyThemeColors(primary, secondary) {
  const root = document.documentElement
  root.style.setProperty('--blue', primary)
  root.style.setProperty('--blue-glow', `rgba(${hexToRgb(primary)},0.25)`)
  root.style.setProperty('--purple', secondary)
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_settings')
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  // Apply theme colors whenever primary/secondary change
  useEffect(() => {
    applyThemeColors(
      settings.primaryColor || DEFAULTS.primaryColor,
      settings.secondaryColor || DEFAULTS.secondaryColor
    )
  }, [settings.primaryColor, settings.secondaryColor])

  const updateSetting = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('jarvis_settings', JSON.stringify(next))
      return next
    })
  }

  const updateSettings = (updates) => {
    setSettings(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem('jarvis_settings', JSON.stringify(next))
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
