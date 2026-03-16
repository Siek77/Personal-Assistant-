export const CLIENT_ID_STORAGE_KEY = 'jarvis_client_id'
export const LAST_SYNCED_STORAGE_KEY = 'jarvis_last_synced'

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export function getOrCreateClientId() {
  let clientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
  if (!clientId) {
    clientId = `jarvis-${crypto.randomUUID()}`
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId)
  }
  return clientId
}

export function buildPersistencePayload(settings, memory) {
  return {
    settings,
    memory,
    esp32: readJson('jarvis_esp32', []),
    recentConv: readJson('jarvis_recent_conv', []),
    calendarEvents: readJson('jarvis_calendar_events', []),
    emailSummary: readJson('jarvis_email_summary', []),
    habits: readJson('jarvis_habits', []),
    habitsDone: readJson('jarvis_habits_done', {}),
    weatherCache: readJson('jarvis_weather_cache', null),
    haSnapshot: readJson('jarvis_ha_snapshot', null),
    stocksCache: readJson('jarvis_stocks_cache', []),
  }
}

export function applyPersistedPayload(data, { updateSettings, mergeRemoteMemory }) {
  if (!data) return

  if (data.settings) updateSettings(data.settings)
  if (data.memory) mergeRemoteMemory(data.memory)

  const localStateEntries = [
    ['jarvis_esp32', data.esp32],
    ['jarvis_recent_conv', data.recentConv],
    ['jarvis_calendar_events', data.calendarEvents],
    ['jarvis_email_summary', data.emailSummary],
    ['jarvis_habits', data.habits],
    ['jarvis_habits_done', data.habitsDone],
    ['jarvis_weather_cache', data.weatherCache],
    ['jarvis_ha_snapshot', data.haSnapshot],
    ['jarvis_stocks_cache', data.stocksCache],
  ]

  for (const [key, value] of localStateEntries) {
    if (value !== undefined) {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }

  if (data.savedAt) {
    localStorage.setItem(LAST_SYNCED_STORAGE_KEY, data.savedAt)
  }
}
