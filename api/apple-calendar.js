// Apple Calendar (iCloud CalDAV) proxy
// Handles full discovery + event fetching server-side to bypass CORS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, password, calendarUrl, startDate, endDate, icsUrl } = req.body || {}
  const auth = email && password
    ? 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64')
    : null

  try {
    if (action === 'discover') {
      if (!email || !password) return res.status(400).json({ error: 'email and password required' })
      const calendars = await discoverCalendars(email, auth)
      return res.status(200).json({ calendars })
    }

    if (action === 'events') {
      if (!email || !password) return res.status(400).json({ error: 'email and password required' })
      if (!calendarUrl || !startDate || !endDate) {
        return res.status(400).json({ error: 'calendarUrl, startDate, endDate required' })
      }
      const events = await fetchEvents(calendarUrl, auth, startDate, endDate)
      return res.status(200).json({ events })
    }

    if (action === 'ics') {
      if (!icsUrl || !startDate || !endDate) {
        return res.status(400).json({ error: 'icsUrl, startDate, endDate required' })
      }
      const events = await fetchIcsEvents(icsUrl, startDate, endDate)
      return res.status(200).json({ events })
    }

    return res.status(400).json({ error: 'action must be discover, events, or ics' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function discoverCalendars(email, auth) {
  // Step 1: Find principal URL via PROPFIND
  const principalXml = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`

  const step1 = await fetch('https://caldav.icloud.com/', {
    method: 'PROPFIND',
    headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: '0' },
    body: principalXml,
  })
  const step1Text = await step1.text()
  const principalHref = extractXmlValue(step1Text, 'href', 'current-user-principal')
    || `/principals/${email.replace('@', '%40')}/`

  const principalUrl = principalHref.startsWith('http')
    ? principalHref
    : `https://caldav.icloud.com${principalHref}`

  // Step 2: Find calendar home set
  const homeXml = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`

  const step2 = await fetch(principalUrl, {
    method: 'PROPFIND',
    headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: '0' },
    body: homeXml,
  })
  const step2Text = await step2.text()
  const homeHref = extractXmlValue(step2Text, 'href', 'calendar-home-set')

  const homeUrl = homeHref
    ? (homeHref.startsWith('http') ? homeHref : `https://caldav.icloud.com${homeHref}`)
    : `https://caldav.icloud.com${principalHref}calendars/`

  // Step 3: List calendars
  const listXml = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`

  const step3 = await fetch(homeUrl, {
    method: 'PROPFIND',
    headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' },
    body: listXml,
  })
  const step3Text = await step3.text()

  return parseCalendarList(step3Text, 'https://caldav.icloud.com')
}

async function fetchEvents(calendarUrl, auth, startDate, endDate) {
  const reportXml = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toICalDate(startDate)}" end="${toICalDate(endDate)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

  const r = await fetch(calendarUrl, {
    method: 'REPORT',
    headers: { Authorization: auth, 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' },
    body: reportXml,
  })
  const text = await r.text()
  return parseEvents(text)
}

async function fetchIcsEvents(icsUrl, startDate, endDate) {
  const r = await fetch(icsUrl)
  if (!r.ok) throw new Error(`ICS fetch failed with ${r.status}`)
  const text = await r.text()
  const start = new Date(startDate)
  const end = new Date(endDate)
  return parseICAL(text).filter(event => {
    if (!event.start) return false
    const eventStart = new Date(event.start)
    return eventStart >= start && eventStart <= end
  })
}

// ── XML/iCal helpers ────────────────────────────────────────────────────────

function extractXmlValue(xml, tag, parentHint) {
  // Try to find <href> inside the parent element
  const parentRe = new RegExp(`<[^>]*${parentHint}[^>]*>([\\s\\S]*?)<\\/[^>]*${parentHint}[^>]*>`, 'i')
  const parentMatch = xml.match(parentRe)
  const scope = parentMatch ? parentMatch[1] : xml
  const tagRe = new RegExp(`<[^>]*${tag}[^>]*>([^<]+)<`, 'i')
  const m = scope.match(tagRe)
  return m ? m[1].trim() : null
}

function parseCalendarList(xml, baseUrl) {
  const calendars = []
  const responseRe = /<d?:?response[^>]*>([\s\S]*?)<\/d?:?response>/gi
  let match
  while ((match = responseRe.exec(xml)) !== null) {
    const block = match[1]
    const hrefMatch = block.match(/<d?:?href[^>]*>([^<]+)<\/d?:?href/i)
    const nameMatch = block.match(/<d?:?displayname[^>]*>([^<]*)<\/d?:?displayname/i)
    const isCalendar = /calendar(?!-home)/i.test(block) && !/principal/i.test(block)
    if (!hrefMatch || !isCalendar) continue
    const href = hrefMatch[1].trim()
    calendars.push({
      url: href.startsWith('http') ? href : `${baseUrl}${href}`,
      name: nameMatch ? decodeEntities(nameMatch[1].trim()) : 'Calendar',
    })
  }
  return calendars
}

function parseEvents(xml) {
  const events = []
  // Extract all calendar-data sections
  const dataRe = /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/gi
  let m
  while ((m = dataRe.exec(xml)) !== null) {
    const ical = decodeEntities(m[1])
    events.push(...parseICAL(ical))
  }
  return events
}

function parseICAL(ical) {
  const events = []
  // Unfold lines (RFC 5545)
  const unfolded = ical.replace(/\r?\n[ \t]/g, '')
  const vevents = unfolded.split(/BEGIN:VEVENT/i)
  for (let i = 1; i < vevents.length; i++) {
    const block = vevents[i]
    const get = (key) => {
      const re = new RegExp(`^${key}[;:][^\r\n]*`, 'im')
      const m = block.match(re)
      if (!m) return null
      return m[0].replace(new RegExp(`^${key}[^:]*:`, 'i'), '').trim()
    }
    const title = get('SUMMARY')
    if (!title) continue
    events.push({
      uid: get('UID') || Math.random().toString(36).slice(2),
      title: title.replace(/\\,/g, ',').replace(/\\n/g, ' '),
      description: (get('DESCRIPTION') || '').replace(/\\n/g, '\n').replace(/\\,/g, ','),
      location: (get('LOCATION') || '').replace(/\\,/g, ','),
      start: parseICalDate(get('DTSTART')),
      end: parseICalDate(get('DTEND') || get('DTSTART')),
      allDay: !/T/.test(get('DTSTART') || ''),
    })
  }
  return events
}

function parseICalDate(str) {
  if (!str) return null
  // Strip TZID= prefix if present
  const s = str.replace(/^TZID=[^:]+:/, '')
  if (s.includes('T')) {
    const d = s.replace('Z', '')
    const date = new Date(
      parseInt(d.slice(0,4)), parseInt(d.slice(4,6))-1, parseInt(d.slice(6,8)),
      parseInt(d.slice(9,11)), parseInt(d.slice(11,13)), parseInt(d.slice(13,15) || 0)
    )
    return s.endsWith('Z') ? new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString() : date.toISOString()
  }
  return new Date(parseInt(s.slice(0,4)), parseInt(s.slice(4,6))-1, parseInt(s.slice(6,8))).toISOString()
}

function toICalDate(iso) {
  // Convert ISO date string to iCal format YYYYMMDDTHHMMSSZ
  return iso.replace(/[-:]/g, '').replace('.000', '')
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
