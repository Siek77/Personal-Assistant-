// JARVIS Voice API — receives speech text from Alexa Lambda, returns spoken reply
// Called server-side so secrets never touch the browser
//
// Required Vercel env vars:
//   GROQ_API_KEY   — from console.groq.com
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

// Fetch synced JARVIS data from Vercel Blob (same store the site pushes to)
async function fetchSyncedData(syncKey) {
  if (!syncKey || !/^[a-f0-9]{64}$/.test(syncKey)) return null
  try {
    const { blobs } = await list({ prefix: `jarvis-sync/${syncKey}.json` })
    if (!blobs.length) return null
    const resp = await fetch(blobs[0].url)
    return resp.ok ? resp.json() : null
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

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' })

  // ── Load synced data from Vercel Blob (same source as the JARVIS site) ──
  const synced = await fetchSyncedData(process.env.SYNC_KEY)
  const syncedSettings = synced?.settings || {}
  const syncedMemory  = synced?.memory  || {}

  // Prefer synced settings; fall back to env vars
  const haUrl    = ((syncedSettings.haUrl   || process.env.HA_URL   || '').replace(/\/$/, ''))
  const haToken  =  (syncedSettings.haToken || process.env.HA_TOKEN || '')
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

  // ── Fetch live HA entity states ──
  let entitySummary = ''
  if (haEnabled) {
    try {
      const r = await fetch(`${haUrl}/api/states`, {
        headers: { Authorization: `Bearer ${haToken}` },
      })
      if (r.ok) {
        const states = await r.json()
        const DOMAINS = ['light', 'switch', 'climate', 'media_player', 'sensor', 'binary_sensor', 'lock', 'cover', 'fan', 'input_boolean']
        const lines = states
          .filter(e => DOMAINS.some(d => e.entity_id.startsWith(d + '.')))
          .slice(0, 60)
          .map(e => {
            const name = e.attributes?.friendly_name
            const extra = e.attributes?.temperature || e.attributes?.current_temperature
            return `${e.entity_id}: ${e.state}${name ? ` (${name})` : ''}${extra ? ` [${extra}°]` : ''}`
          })
        if (lines.length) entitySummary = `\nCurrent home state:\n${lines.join('\n')}`
      }
    } catch { /* HA unreachable, continue without */ }
  }

  // ── System prompt (voice-optimised — no markdown) ──
  const memorySection = [
    facts       ? `Facts about ${userName}:\n${facts}`           : '',
    routines    ? `${userName}'s routines:\n${routines}`         : '',
    prefLines   ? `${userName}'s preferences:\n${prefLines}`     : '',
    recentTopics? `Recent topics discussed: ${recentTopics}`     : '',
    envFacts    ? `What you know about ${userName}:\n${envFacts}`: '',
  ].filter(Boolean).join('\n')

  const systemPrompt = [
    `You are JARVIS, a highly intelligent personal assistant. Address the user as "${userName}".`,
    memorySection,
    entitySummary,
    `
STRICT voice rules — you are speaking through Amazon Alexa:
- Maximum 2 sentences. Never use lists, markdown, bullet points, or special characters.
- Confirm actions concisely (e.g. "Done, living room lights at 50 percent.").
- Use natural spoken language. Spell out symbols (say "percent" not "%", "degrees" not "°").
- If you don't know something, say so in one sentence.`,
  ].filter(Boolean).join('\n')

  // ── Groq function-calling tools (only if HA is configured) ──
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

  // Build message history (cap at last 6 to stay within Groq token limits)
  const messages = [
    ...sessionHistory.slice(-6),
    { role: 'user', content: text.trim() },
  ]

  try {
    // ── First Groq call ──
    const groqBody = {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 200,
      temperature: 0.7,
      ...(tools.length && { tools, tool_choice: 'auto' }),
    }

    const r1 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify(groqBody),
    })
    if (!r1.ok) {
      const e = await r1.json()
      throw new Error(e.error?.message || `Groq error ${r1.status}`)
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

      // ── Second Groq call — get the spoken confirmation ──
      const r2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: toolResultMessages,
          max_tokens: 120,
          temperature: 0.7,
        }),
      })
      if (!r2.ok) {
        const e = await r2.json()
        throw new Error(e.error?.message || `Groq error ${r2.status}`)
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
