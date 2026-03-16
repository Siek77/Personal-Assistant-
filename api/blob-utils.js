export async function fetchBlobJson(url) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Blob fetch failed with ${response.status}`)
  }
  return response.json()
}
