// JARVIS Voice API — receives speech text from Alexa Lambda, returns spoken reply
// Called server-side so secrets never touch the browser
//
// Required Vercel env vars:
//   OPENAI_API_KEY — from platform.openai.com
//   VOICE_SECRET   — any random string, must match Lambda env var
//   SYNC_KEY       — SHA-256 hash of your sync passphrase (64-char hex).
//                    Copy it from browser console: await crypto.subtle.digest('SHA-256',
//                    new TextEncoder().encode('jarvis:YOUR_PASSPHRASE'))
//                    .then(b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))
//                    When set, voice pulls live memory (facts, routines, preferences) from
//                    the same blob that the JARVIS site syncs to — no manual USER_FACTS needed.
//
// Optional fallback env vars (used when SYNC_KEY is not set):
//   HA_URL         — e.g. http://homeassistant.local:8123 (otherwise reads from synced settings)
//   HA_TOKEN       — Home Assistant long-lived access token (otherwise reads from synced settings)
//   USER_NAME      — your first name (otherwise reads from synced settings)
//   USER_FACTS     — comma-separated facts (only used if SYNC_KEY not set)

import { list } from '@vercel/blob'
import { fetchBlobJson } from './blob-utils'

// Fetch the N most recent blob conversations for prior-session context
async function fetchRecentBlobConversations(syncKey, limit = 3) {
  if (!syncKey || !/^[a-f0-9]{64}$/.test(syncKey)) return []
  try {
    const { blobs } = await list({ prefix: `jarvis-conv/${syncKey}/`, limit: 100 })
    const recent = blobs
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, limit)
    const results = await Promise.all(
      recent.map(b => fetchBlobJson(b.url).catch(() => null))
    )
    return results.filter(Boolean).reverse() // oldest first so context reads naturally
  } catch {
    return []
  }
}

// Fetch Notion database pages (tasks, notes, etc.) with 3s timeout
async function fetchNotionTasks(apiKey, dbId) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 25 }),
      signal: controller.signal,
    })
    if (!r.ok) return null
    return r.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Extract a human-readable summary line from a Notion page
function formatNotionPage(page) {
  const props = page.properties || {}
  let title = ''
  const extras = []
  for (const prop of Object.values(props)) {
    if (prop.type === 'title') {
      title = (prop.title || []).map(t => t.plain_text).join('')
    } else if (prop.type === 'checkbox') {
      extras.push(prop.checkbox ? 'done' : 'pending')
    } else if (prop.type === 'status' && prop.status?.name) {
      extras.push(prop.status.name)
    } else if (prop.type === 'select' && prop.select?.name) {
      extras.push(prop.select.name)
    } else if (prop.type === 'date' && prop.date?.start) {
      extras.push(prop.date.start.slice(0, 10))
    }
  }
  if (!title) return null
  return extras.length ? `${title} [${extras.join(', ')}]` : title
}

// Fetch synced JARVIS data from Vercel Blob (same store the site pushes to)
async function fetchSyncedData(syncKey) {
  if (!syncKey || !/^[a-f0-9]{64}$/.test(syncKey)) return null
  try {
    const { blobs } = await list({ prefix: `jarvis-sync/${syncKey}.json` })
    if (!blobs.length) return null
    return await fetchBlobJson(blobs[0].url)
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──
  const secret = process.env.VOICE_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' })
  }

  const { text, sessionHistory = [] } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

  const openaiKey = process.env.OPENAI_API_KEY
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' })

  // ── Helper: fetch HA states with a 3s timeout ──
  const cfClientId = process.env.CF_ACCESS_CLIENT_ID || ''
  const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || ''
  const cfHeaders = cfClientId && cfClientSecret
    ? { 'CF-Access-Client-Id': cfClientId, 'CF-Access-Client-Secret': cfClientSecret }
    : {}

  async function fetchHaStates(url, token) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      const r = await fetch(`${url}/api/states`, {
        headers: { Authorization: `Bearer ${token}`, ...cfHeaders },
        signal: controller.signal,
      })
      return r.ok ? r.json() : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Kick off all independent fetches immediately in parallel ──
  const envHaUrl   = (process.env.HA_URL   || '').replace(/\/$/, '')
  const envHaToken =  process.env.HA_TOKEN  || ''
  const earlyHaPromise = (envHaUrl && envHaToken)
    ? fetchHaStates(envHaUrl, envHaToken)
    : null

  // Blob conversations fetch starts NOW — no credentials needed, uses SYNC_KEY directly
  const blobConvPromise = fetchRecentBlobConversations(process.env.SYNC_KEY)

  const synced = await fetchSyncedData(process.env.SYNC_KEY)
  const syncedSettings = synced?.settings || {}
  const syncedMemory  = synced?.memory  || {}

  // Prefer synced settings; fall back to env vars
  const haUrl    = ((syncedSettings.haUrl   || envHaUrl  ).replace(/\/$/, ''))
  const haToken  =  (syncedSettings.haToken || envHaToken)
  const haEnabled = !!(haUrl && haToken)
  const userName  =  (syncedSettings.userName || process.env.USER_NAME || 'Boss')

  // ── Build memory context from synced facts / routines / preferences ──
  const facts = (syncedMemory.facts || [])
    .slice(0, 30) // cap to avoid token bloat
    .map(f => `- ${f.text}`)
    .join('\n')

  const routines = (syncedMemory.routines || [])
    .slice(0, 10)
    .map(r => `- ${r.name || r.text || JSON.stringify(r)}`)
    .join('\n')

  const prefs = syncedMemory.preferences || {}
  const prefLines = Object.entries(prefs)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const recentTopics = (syncedMemory.recentTopics || []).slice(0, 10).join(', ')

  // Fall back to USER_FACTS env var when no sync key is set
  const envFacts = !synced
    ? (process.env.USER_FACTS || '').split(',').map(f => f.trim()).filter(Boolean).map(f => `- ${f}`).join('\n')
    : ''

  const notionKey = syncedSettings.notionApiKey || ''
  const notionDbId = syncedSettings.notionDatabaseId || ''

  // ── Kick off HA states + Notion in parallel ──
  const useEarlyHa = earlyHaPromise && haUrl === envHaUrl && haToken === envHaToken
  const haStatesPromise = haEnabled
    ? (useEarlyHa ? earlyHaPromise : fetchHaStates(haUrl, haToken))
    : Promise.resolve(null)
  const notionPromise = (notionKey && notionDbId)
    ? fetchNotionTasks(notionKey, notionDbId)
    : Promise.resolve(null)

  const [haStates, notionData, recentBlobConvs] = await Promise.all([haStatesPromise, notionPromise, blobConvPromise])

  // ── Format HA entity summary ──
  let entitySummary = ''
  if (haStates) {
    try {
      const DOMAINS = ['light', 'switch', 'climate', 'media_player', 'sensor', 'binary_sensor', 'lock', 'cover', 'fan', 'input_boolean']
      const lines = haStates
        .filter(e => DOMAINS.some(d => e.entity_id.startsWith(d + '.')))
        .slice(0, 60)
        .map(e => {
          const name = e.attributes?.friendly_name
          const extra = e.attributes?.temperature || e.attributes?.current_temperature
          return `${e.entity_id}: ${e.state}${name ? ` (${name})` : ''}${extra ? ` [${extra}°]` : ''}`
        })
      if (lines.length) entitySummary = `\nCurrent home state:\n${lines.join('\n')}`
    } catch { /* ignore */ }
  }

  // ── Format Notion tasks summary ──
  let notionSummary = ''
  if (notionData?.results?.length) {
    const lines = notionData.results.map(formatNotionPage).filter(Boolean).slice(0, 20)
    if (lines.length) notionSummary = `\nNotion tasks/notes:\n${lines.map(l => `- ${l}`).join('\n')}`
  }

  // ── Email summary from synced blob (written by JarvisTab Gmail section) ──
  let emailSummary = ''
  const emails = synced?.emailSummary || []
  if (emails.length) {
    const lines = emails.slice(0, 5).map(e =>
      `- ${e.unread ? '[UNREAD] ' : ''}${e.subject} — from ${e.from}`
    )
    if (lines.length) emailSummary = `\nRecent emails:\n${lines.join('\n')}`
  }

  // ── Calendar events from synced blob (written by CalendarTab) ──
  let calendarSummary = ''
  const calEvents = synced?.calendarEvents || []
  if (calEvents.length) {
    const now = new Date()
    const cutoff = new Date(now.getTime() + 7 * 86400000)
    const upcoming = calEvents
      .filter(e => e.start && new Date(e.start) >= now && new Date(e.start) <= cutoff)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 15)
      .map(e => {
        const d = new Date(e.start)
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const timeStr = e.allDay ? 'All day' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        return `- ${dateStr} ${timeStr}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`
      })
    if (upcoming.length) calendarSummary = `\nUpcoming events (next 7 days):\n${upcoming.join('\n')}`
  }

  // ── Prior conversation context from blob conversations ──
  // Flatten last 6 messages from each of the 3 most recent sessions → max 18 turns
  const recentConv = recentBlobConvs
    .flatMap(c => (c.messages || []).filter(m => m.role && m.content).slice(-6))
    .slice(-18)
    .map(m => ({ role: m.role, content: m.content }))

  // ── System prompt (voice-optimised — no markdown) ──
  const memorySection = [
    facts       ? `Facts about ${userName}:\n${facts}`           : '',
    routines    ? `${userName}'s routines:\n${routines}`         : '',
    prefLines   ? `${userName}'s preferences:\n${prefLines}`     : '',
    recentTopics? `Recent topics discussed: ${recentTopics}`     : '',
    envFacts    ? `What you know about ${userName}:\n${envFacts}`: '',
  ].filter(Boolean).join('\n')

  const systemPrompt = [
    `You are JARVIS, a highly intelligent personal assistant. Address the user as "${userName}". Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
    memorySection,
    entitySummary,
    notionSummary,
    calendarSummary,
    emailSummary,
    `
STRICT voice rules — you are speaking through Amazon Alexa:
- Maximum 2 sentences. Never use lists, markdown, bullet points, or special characters.
- Confirm actions concisely (e.g. "Done, living room lights at 50 percent.").
- Use natural spoken language. Spell out symbols (say "percent" not "%", "degrees" not "°").
- If you don't know something, say so in one sentence.`,
  ].filter(Boolean).join('\n')

  // ── Function-calling tools (only if HA is configured) ──
  const tools = haEnabled ? [
    {
      type: 'function',
      function: {
        name: 'control_home',
        description: 'Control any Home Assistant entity — lights, switches, climate, locks, covers, media players, fans.',
        parameters: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'HA domain: light, switch, climate, media_player, cover, lock, fan, input_boolean',
            },
            service: {
              type: 'string',
              description: 'HA service: turn_on, turn_off, toggle, set_temperature, media_play, media_pause, lock, unlock, open_cover, close_cover',
            },
            entity_id: {
              type: 'string',
              description: 'Full entity ID e.g. light.living_room, switch.bedroom_fan',
            },
            service_data: {
              type: 'object',
              description: 'Optional extra params e.g. { "brightness_pct": 50, "temperature": 72, "color_temp": 300 }',
            },
          },
          required: ['domain', 'service'],
        },
      },
    },
  ] : []

  // Build message history — prior session context + current session (cap to avoid token bloat)
  const messages = [
    ...recentConv,
    ...sessionHistory.slice(-6),
    { role: 'user', content: text.trim() },
  ]

  try {
    // ── First OpenAI call ──
    const openaiBody = {
      model: openaiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 200,
      temperature: 0.7,
      ...(tools.length && { tools, tool_choice: 'auto' }),
    }

    const r1 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify(openaiBody),
    })
    if (!r1.ok) {
      const e = await r1.json()
      throw new Error(e.error?.message || `OpenAI error ${r1.status}`)
    }
    const d1 = await r1.json()
    const assistantMsg = d1.choices[0].message
    const actions = []

    // ── Handle tool calls → execute HA services ──
    if (assistantMsg.tool_calls?.length) {
      const toolResultMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
        assistantMsg,
      ]

      for (const tc of assistantMsg.tool_calls) {
        if (tc.function.name !== 'control_home') continue
        let args
        try { args = JSON.parse(tc.function.arguments) } catch { continue }

        const { domain, service, entity_id, service_data = {} } = args
        let result = 'done'

        try {
          const haRes = await fetch(`${haUrl}/api/services/${domain}/${service}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${haToken}`,
              'Content-Type': 'application/json',
              ...cfHeaders,
            },
            body: JSON.stringify({ entity_id, ...service_data }),
          })
          result = haRes.ok ? 'done' : `error ${haRes.status}`
        } catch (e) {
          result = `error: ${e.message}`
        }

        actions.push({ domain, service, entity_id, result })
        toolResultMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }

      // ── Second OpenAI call — get the spoken confirmation ──
      const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: openaiModel,
          messages: toolResultMessages,
          max_tokens: 120,
          temperature: 0.7,
        }),
      })
      if (!r2.ok) {
        const e = await r2.json()
        throw new Error(e.error?.message || `OpenAI error ${r2.status}`)
      }
      const d2 = await r2.json()
      const reply = d2.choices[0].message.content || 'Done.'

      const newHistory = [
        ...messages,
        assistantMsg,
        ...toolResultMessages.slice(messages.length + 2), // tool results
        { role: 'assistant', content: reply },
      ]
      return res.status(200).json({ reply, actions, sessionHistory: newHistory.slice(-8) })
    }

    // ── Plain reply (no tool calls) ──
    const reply = assistantMsg.content || 'I did not catch that.'
    const newHistory = [...messages, { role: 'assistant', content: reply }]
    return res.status(200).json({ reply, actions, sessionHistory: newHistory.slice(-8) })

  } catch (err) {
    console.error('[voice] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
