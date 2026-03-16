const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Yahoo Finance v8 chart — one request per symbol, no crumb/cookie required.
async function fetchQuote(symbol) {
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=5d`

  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`)

  const data = await r.json()
  const meta = data.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`${symbol}: no data`)

  const price = meta.regularMarketPrice ?? null
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price
  const change        = price != null && prev != null ? price - prev : null
  const changePercent = prev  ? (change / prev) * 100              : null

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
    const results = await Promise.allSettled(list.map(fetchQuote))

    const quotes  = []
    const errors  = []
    for (const r of results) {
      if (r.status === 'fulfilled') quotes.push(r.value)
      else errors.push(r.reason?.message || 'unknown error')
    }

    res.json({ quotes, ...(errors.length ? { errors } : {}) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
