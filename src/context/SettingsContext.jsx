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
  userName: 'User',
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  wakeWord: 'Hey JARVIS',
  voiceEnabled: false,
  scanlineEffect: true,
  theme: 'dark',
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
