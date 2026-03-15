import { useState, useEffect, useRef, useCallback } from 'react'

// drive.file gives access to files the app creates — visible in Google Drive
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'JARVIS Conversations'

export function useGoogleDrive(clientId) {
  const [token, setToken] = useState(() => {
    const t = sessionStorage.getItem('gdrive_token')
    const exp = parseInt(sessionStorage.getItem('gdrive_token_exp') || '0')
    return t && Date.now() < exp ? t : null
  })
  const [signInStatus, setSignInStatus] = useState(() =>
    sessionStorage.getItem('gdrive_token') ? 'signed-in' : 'idle'
  )
  const clientRef = useRef(null)
  const folderIdRef = useRef(sessionStorage.getItem('gdrive_folder_id') || null)

  useEffect(() => {
    if (!clientId) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) { setSignInStatus('error'); return }
          const exp = Date.now() + (response.expires_in - 30) * 1000
          sessionStorage.setItem('gdrive_token', response.access_token)
          sessionStorage.setItem('gdrive_token_exp', String(exp))
          setToken(response.access_token)
          setSignInStatus('signed-in')
        },
        error_callback: () => setSignInStatus('error'),
      })
    }
    document.head.appendChild(script)
    return () => script.remove()
  }, [clientId])

  const signIn = useCallback(() => {
    if (!clientRef.current) return
    setSignInStatus('signing-in')
    clientRef.current.requestAccessToken({ prompt: '' })
  }, [])

  const signOut = useCallback(() => {
    const t = sessionStorage.getItem('gdrive_token')
    if (t) window.google?.accounts?.oauth2?.revoke(t, () => {})
    sessionStorage.removeItem('gdrive_token')
    sessionStorage.removeItem('gdrive_token_exp')
    sessionStorage.removeItem('gdrive_folder_id')
    folderIdRef.current = null
    setToken(null)
    setSignInStatus('idle')
  }, [])

  // Core fetch — retries once with fresh token on 401
  const driveReq = useCallback(async (url, options = {}) => {
    let currentToken = sessionStorage.getItem('gdrive_token')
    if (!currentToken) throw new Error('Not signed in to Google Drive')

    const doFetch = (t) => fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${t}`, ...options.headers },
    })

    let res = await doFetch(currentToken)

    if (res.status === 401 && clientRef.current) {
      await new Promise((resolve) => {
        const prev = clientRef.current.callback
        clientRef.current.callback = (r) => {
          if (!r.error) {
            const exp = Date.now() + (r.expires_in - 30) * 1000
            sessionStorage.setItem('gdrive_token', r.access_token)
            sessionStorage.setItem('gdrive_token_exp', String(exp))
            setToken(r.access_token)
            currentToken = r.access_token
          }
          clientRef.current.callback = prev
          resolve()
        }
        clientRef.current.requestAccessToken({ prompt: '' })
      })
      res = await doFetch(currentToken)
    }

    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Drive error ${res.status}`)
    }
    return res
  }, [])

  // Find or create the "JARVIS Conversations" folder in My Drive root
  const getOrCreateFolder = useCallback(async () => {
    if (folderIdRef.current) return folderIdRef.current

    // Search for existing folder
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const res = await driveReq(`${DRIVE}/files?q=${q}&fields=files(id,name)`)
    const { files = [] } = await res.json()

    let folderId
    if (files.length > 0) {
      folderId = files[0].id
    } else {
      // Create the folder
      const createRes = await driveReq(`${DRIVE}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      })
      const folder = await createRes.json()
      folderId = folder.id
    }

    folderIdRef.current = folderId
    sessionStorage.setItem('gdrive_folder_id', folderId)
    return folderId
  }, [driveReq])

  // Save (create or update) a conversation — visible in Google Drive > JARVIS Conversations
  const saveConversation = useCallback(async (convId, messages) => {
    if (!sessionStorage.getItem('gdrive_token')) return
    const folderId = await getOrCreateFolder()
    const filename = `jarvis_conv_${convId}.json`
    const payload = JSON.stringify({
      id: convId,
      savedAt: new Date().toISOString(),
      messages: messages.filter(m => m.id !== 'welcome'),
    })

    // Check if file exists in the JARVIS folder
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`)
    const listRes = await driveReq(`${DRIVE}/files?q=${q}&fields=files(id)`)
    const { files = [] } = await listRes.json()

    if (files.length > 0) {
      await driveReq(`${UPLOAD}/files/${files[0].id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    } else {
      const boundary = 'jarvis_boundary'
      const meta = JSON.stringify({ name: filename, parents: [folderId] })
      const body = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}`,
        `--${boundary}--`,
      ].join('\r\n')
      await driveReq(`${UPLOAD}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
    }
  }, [driveReq, getOrCreateFolder])

  // Load N most recent conversations (full content) for AI context
  const loadRecentConversations = useCallback(async (limit = 3) => {
    if (!sessionStorage.getItem('gdrive_token')) return []
    const folderId = await getOrCreateFolder()
    const q = encodeURIComponent(`name contains 'jarvis_conv_' and '${folderId}' in parents and trashed=false`)
    const listRes = await driveReq(
      `${DRIVE}/files?q=${q}&orderBy=createdTime+desc&pageSize=${limit}&fields=files(id,name,createdTime)`
    )
    const { files = [] } = await listRes.json()
    const results = await Promise.all(
      files.map(async (f) => {
        const r = await driveReq(`${DRIVE}/files/${f.id}?alt=media`)
        return r.json().catch(() => null)
      })
    )
    return results.filter(Boolean)
  }, [driveReq, getOrCreateFolder])

  // List all conversation files (metadata for history panel)
  const listAllConversations = useCallback(async () => {
    if (!sessionStorage.getItem('gdrive_token')) return []
    const folderId = await getOrCreateFolder()
    const q = encodeURIComponent(`name contains 'jarvis_conv_' and '${folderId}' in parents and trashed=false`)
    const listRes = await driveReq(
      `${DRIVE}/files?q=${q}&orderBy=createdTime+desc&pageSize=100&fields=files(id,name,createdTime)`
    )
    const { files = [] } = await listRes.json()
    return files
  }, [driveReq, getOrCreateFolder])

  // Delete a conversation by Drive file ID
  const deleteConversation = useCallback(async (fileId) => {
    if (!sessionStorage.getItem('gdrive_token')) return
    await driveReq(`${DRIVE}/files/${fileId}`, { method: 'DELETE' })
  }, [driveReq])

  return {
    isSignedIn: !!token,
    signInStatus,
    folderName: FOLDER_NAME,
    signIn,
    signOut,
    saveConversation,
    loadRecentConversations,
    listAllConversations,
    deleteConversation,
  }
}
