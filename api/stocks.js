const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Module-level cache so warm Vercel instances reuse the same crumb.
let _crumb  = null
let _cookie = null
let _expiry = 0

async function getYahooCrumb() {
  if (_crumb && Date.now() < _expiry) return { crumb: _crumb, cookie: _cookie }

  // 1. Hit Yahoo Finance homepage to receive session cookies.
  const pageRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })

  // Collect all Set-Cookie values (Node 18+ native fetch).
  const setCookies =
    typeof pageRes.headers.getSetCookie === 'function'
      ? pageRes.headers.getSetCookie()
      : (pageRes.headers.get('set-cookie') || '').split(/,(?=[^ ])/)

  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ')

  // 2. Exchange cookies for a crumb.
  const crumbRes = await fetch(
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
    {
      headers: { 'User-Agent': UA, Accept: 'text/plain', Cookie: cookieStr },
      signal: AbortSignal.timeout(8_000),
    }
  )
  if (!crumbRes.ok) throw new Error(`crumb HTTP ${crumbRes.status}`)

  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.startsWith('<')) throw new Error('no crumb received')

  _crumb  = crumb
  _cookie = cookieStr
  _expiry = Date.now() + 25 * 60 * 1000   // reuse for 25 min
  return { crumb, cookie: cookieStr }
}

async function fetchQuote(symbol, crumb, cookie) {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`

  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: cookie },
    signal: AbortSignal.timeout(8_000),
  })
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`)

  const data = await r.json()
  const meta = data.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error(`${symbol}: no data`)

  const price = meta.regularMarketPrice
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price
  const change        = price - prev
  const changePercent = prev ? (change / prev) * 100 : 0

  return {
    symbol:        meta.symbol,
    name:          meta.shortName || meta.longName || meta.symbol,
    price,
    change,
    changePercent,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  const list = symbols.split(',').map(s => s.trim()).filter(Boolean)

  try {
    const { crumb, cookie } = await getYahooCrumb()

    const results = await Promise.allSettled(list.map(sym => fetchQuote(sym, crumb, cookie)))

    const quotes = []
    const errors = []
    for (const r of results) {
      if (r.status === 'fulfilled') quotes.push(r.value)
      else errors.push(r.reason?.message || 'unknown error')
    }

    res.json({ quotes, ...(errors.length ? { errors } : {}) })
  } catch (e) {
    // Crumb fetch failed — surface error so client knows what went wrong.
    res.status(502).json({ error: e.message })
  }
}
