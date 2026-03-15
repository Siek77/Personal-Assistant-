import { useState, useEffect, useRef, useCallback } from 'react'

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export function useGoogleDrive(clientId) {
  const [token, setToken] = useState(() => {
    // Restore token from sessionStorage if not expired
    const t = sessionStorage.getItem('gdrive_token')
    const exp = parseInt(sessionStorage.getItem('gdrive_token_exp') || '0')
    return t && Date.now() < exp ? t : null
  })
  const [signInStatus, setSignInStatus] = useState('idle') // idle | signing-in | signed-in | error
  const clientRef = useRef(null)
  const scriptRef = useRef(null)

  useEffect(() => {
    if (!clientId) return

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token) {
            const exp = Date.now() + (response.expires_in - 60) * 1000
            sessionStorage.setItem('gdrive_token', response.access_token)
            sessionStorage.setItem('gdrive_token_exp', exp)
            setToken(response.access_token)
            setSignInStatus('signed-in')
          } else {
            setSignInStatus('error')
          }
        },
        error_callback: () => setSignInStatus('error'),
      })
      // If we already have a valid token from sessionStorage, mark as signed in
      if (token) setSignInStatus('signed-in')
    }
    document.head.appendChild(script)
    scriptRef.current = script
    return () => script.remove()
  }, [clientId])

  const signIn = useCallback(() => {
    if (!clientRef.current) return
    setSignInStatus('signing-in')
    // Empty prompt = silent if already consented, popup if first time
    clientRef.current.requestAccessToken({ prompt: token ? '' : 'consent' })
  }, [token])

  const signOut = useCallback(() => {
    if (token) window.google?.accounts?.oauth2?.revoke(token, () => {})
    sessionStorage.removeItem('gdrive_token')
    sessionStorage.removeItem('gdrive_token_exp')
    setToken(null)
    setSignInStatus('idle')
  }, [token])

  // Ensure token is fresh before a call; refresh if close to expiry
  const getToken = useCallback(() => {
    const exp = parseInt(sessionStorage.getItem('gdrive_token_exp') || '0')
    if (Date.now() > exp - 30000) {
      // Token expired or expiring soon — request silently
      clientRef.current?.requestAccessToken({ prompt: '' })
      return null // caller should retry after token updates
    }
    return token
  }, [token])

  const driveReq = useCallback(async (url, options = {}) => {
    const t = getToken()
    if (!t) throw new Error('Not signed in to Google Drive')
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${t}`, ...options.headers },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Drive error ${res.status}`)
    }
    return res
  }, [getToken])

  // Save or update a conversation in appDataFolder
  const saveConversation = useCallback(async (convId, messages) => {
    if (!token) return
    const filename = `jarvis_conv_${convId}.json`
    const body = JSON.stringify({ id: convId, savedAt: new Date().toISOString(), messages })

    // Check if file exists
    const listRes = await driveReq(
      `${DRIVE}/files?spaces=appDataFolder&q=name%3D'${filename}'&fields=files(id)`
    )
    const { files } = await listRes.json()

    if (files?.length) {
      // Patch existing file content
      await driveReq(`${UPLOAD}/files/${files[0].id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } else {
      // Create new multipart upload
      const boundary = 'jarvis_boundary'
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify({ name: filename, parents: ['appDataFolder'] }),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`,
      ].join('\r\n')

      await driveReq(`${UPLOAD}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      })
    }
  }, [token, driveReq])

  // Load the N most recent conversations
  const loadRecentConversations = useCallback(async (limit = 3) => {
    if (!token) return []
    const listRes = await driveReq(
      `${DRIVE}/files?spaces=appDataFolder&q=name+contains+'jarvis_conv_'` +
      `&orderBy=createdTime+desc&pageSize=${limit}&fields=files(id,name,createdTime)`
    )
    const { files = [] } = await listRes.json()
    const results = await Promise.all(
      files.map(async (f) => {
        const r = await driveReq(`${DRIVE}/files/${f.id}?alt=media`)
        return r.json()
      })
    )
    return results.filter(Boolean)
  }, [token, driveReq])

  // List all saved conversations (metadata only)
  const listAllConversations = useCallback(async () => {
    if (!token) return []
    const listRes = await driveReq(
      `${DRIVE}/files?spaces=appDataFolder&q=name+contains+'jarvis_conv_'` +
      `&orderBy=createdTime+desc&pageSize=100&fields=files(id,name,createdTime,size)`
    )
    const { files = [] } = await listRes.json()
    return files
  }, [token, driveReq])

  // Delete a conversation by Drive file ID
  const deleteConversation = useCallback(async (fileId) => {
    if (!token) return
    await driveReq(`${DRIVE}/files/${fileId}`, { method: 'DELETE' })
  }, [token, driveReq])

  return {
    isSignedIn: !!token,
    signInStatus,
    signIn,
    signOut,
    saveConversation,
    loadRecentConversations,
    listAllConversations,
    deleteConversation,
  }
}
