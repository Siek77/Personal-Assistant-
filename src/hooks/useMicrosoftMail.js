import { useState, useCallback } from 'react'

const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const SCOPE = 'openid profile email offline_access Mail.Read'

function getStoredToken() {
  try {
    const token = sessionStorage.getItem('microsoft_mail_token')
    const exp = Number(sessionStorage.getItem('microsoft_mail_token_exp') || 0)
    return token && Date.now() < exp ? token : null
  } catch {
    return null
  }
}

export function useMicrosoftMail(clientId) {
  const [signInStatus, setSignInStatus] = useState('idle')
  const [token, setToken] = useState(() => getStoredToken())

  const signIn = useCallback(async () => {
    if (!clientId) {
      setSignInStatus('error')
      throw new Error('Missing Microsoft Client ID')
    }

    setSignInStatus('signing-in')
    const redirectUri = `${window.location.origin}/microsoft-auth-callback.html`
    const authUrl = new URL(AUTH_BASE)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('response_type', 'token')
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', SCOPE)
    authUrl.searchParams.set('response_mode', 'fragment')
    authUrl.searchParams.set('prompt', 'select_account')

    const popup = window.open(authUrl.toString(), 'jarvis-microsoft-auth', 'width=520,height=700')
    if (!popup) {
      setSignInStatus('error')
      throw new Error('Popup blocked')
    }

    return await new Promise((resolve, reject) => {
      const cleanup = () => window.removeEventListener('message', onMessage)
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          cleanup()
          if (!getStoredToken()) {
            setSignInStatus('idle')
            reject(new Error('Sign-in canceled'))
          }
        }
      }, 500)

      const onMessage = (event) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.source !== 'jarvis-microsoft-auth') return

        clearInterval(timer)
        cleanup()
        popup.close()

        if (event.data.error || !event.data.accessToken) {
          setSignInStatus('error')
          reject(new Error(event.data.error || 'Microsoft sign-in failed'))
          return
        }

        const exp = Date.now() + (Number(event.data.expiresIn || 3600) * 1000)
        sessionStorage.setItem('microsoft_mail_token', event.data.accessToken)
        sessionStorage.setItem('microsoft_mail_token_exp', String(exp))
        setToken(event.data.accessToken)
        setSignInStatus('signed-in')
        resolve(event.data.accessToken)
      }

      window.addEventListener('message', onMessage)
    })
  }, [clientId])

  const signOut = useCallback(() => {
    sessionStorage.removeItem('microsoft_mail_token')
    sessionStorage.removeItem('microsoft_mail_token_exp')
    setToken(null)
    setSignInStatus('idle')
  }, [])

  const apiFetch = useCallback(async (url) => {
    const accessToken = token || getStoredToken()
    if (!accessToken) throw new Error('Not signed in')
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (response.status === 401) {
      signOut()
      throw new Error('Token expired — please sign in again')
    }
    if (!response.ok) throw new Error(`Microsoft Graph error ${response.status}`)
    return response.json()
  }, [token, signOut])

  const fetchEmails = useCallback(async ({ maxResults = 100, daysBack = 30, unreadOnly = false } = {}) => {
    const query = new URL('https://graph.microsoft.com/v1.0/me/messages')
    query.searchParams.set('$top', String(Math.min(maxResults, 100)))
    query.searchParams.set('$select', 'id,subject,from,receivedDateTime,bodyPreview,isRead')
    query.searchParams.set('$orderby', 'receivedDateTime DESC')
    const filters = []
    if (unreadOnly) filters.push('isRead eq false')
    if (daysBack) {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString()
      filters.push(`receivedDateTime ge ${since}`)
    }
    if (filters.length) query.searchParams.set('$filter', filters.join(' and '))

    const data = await apiFetch(query.toString())
    return (data.value || []).map(msg => ({
      id: msg.id,
      subject: msg.subject || '(no subject)',
      from: msg.from?.emailAddress?.name
        ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
        : (msg.from?.emailAddress?.address || ''),
      date: msg.receivedDateTime,
      snippet: msg.bodyPreview || '',
      unread: !msg.isRead,
      accountType: 'outlook',
    }))
  }, [apiFetch])

  const isSignedIn = signInStatus === 'signed-in' || !!token
  return { token, signInStatus, isSignedIn, signIn, signOut, fetchEmails }
}
