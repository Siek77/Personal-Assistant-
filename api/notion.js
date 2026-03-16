// Notion API proxy — routes requests server-side to avoid CORS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Notion-Key')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = req.headers['x-notion-key'] || process.env.NOTION_API_KEY
  if (!apiKey) return res.status(401).json({ error: 'Notion API key required' })

  const { action, databaseId, pageId, filter, sorts, page_size = 20 } = req.body || {}

  try {
    let endpoint, body

    if (action === 'query' && databaseId) {
      endpoint = `https://api.notion.com/v1/databases/${databaseId}/query`
      body = { filter, sorts, page_size }
    } else if (action === 'get_page' && pageId) {
      endpoint = `https://api.notion.com/v1/pages/${pageId}`
      body = null
    } else if (action === 'get_database' && databaseId) {
      endpoint = `https://api.notion.com/v1/databases/${databaseId}`
      body = null
    } else {
      return res.status(400).json({ error: 'Invalid action or missing id' })
    }

    const notionRes = await fetch(endpoint, {
      method: body !== null ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      ...(body !== null && { body: JSON.stringify(body) }),
    })

    const data = await notionRes.json()
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
    return res.status(notionRes.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
