import { ImapFlow } from 'imapflow'

function parseMailboxHeaders(source = '') {
  const lines = source.split(/\r?\n/)
  const values = {}
  let currentKey = null

  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      values[currentKey] += ' ' + line.trim()
      continue
    }
    const idx = line.indexOf(':')
    if (idx === -1) continue
    currentKey = line.slice(0, idx).trim().toLowerCase()
    values[currentKey] = line.slice(idx + 1).trim()
  }

  return values
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { host, port = 993, secure = true, username, password, maxResults = 10 } = req.body || {}
  if (!host || !username || !password) {
    return res.status(400).json({ error: 'host, username, and password are required' })
  }

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password,
    },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    const unseen = await client.search({ seen: false })
    const ids = unseen.slice(-maxResults).reverse()
    if (!ids.length) {
      return res.status(200).json({ emails: [] })
    }

    const emails = []
    for await (const msg of client.fetch(ids, { envelope: true, source: true, flags: true })) {
      const headers = parseMailboxHeaders(msg.source?.toString() || '')
      emails.push({
        id: String(msg.uid),
        subject: msg.envelope?.subject || headers.subject || '(no subject)',
        from: msg.envelope?.from?.map(item => item.name ? `${item.name} <${item.address}>` : item.address).join(', ') || headers.from || '',
        date: msg.envelope?.date?.toISOString?.() || headers.date || '',
        snippet: '',
        unread: !(msg.flags || []).has?.('\\Seen'),
      })
    }

    return res.status(200).json({ emails })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'IMAP fetch failed' })
  } finally {
    try { await client.logout() } catch {}
  }
}
