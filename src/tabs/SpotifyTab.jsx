import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../context/SettingsContext'

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-top-read',
  'playlist-read-private',
  'streaming',
].join(' ')

// PKCE helpers
async function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function msToTime(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function getRedirectUri() {
  return window.location.origin + window.location.pathname
}

export default function SpotifyTab() {
  const { settings } = useSettings()
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('spotify_token')
    const exp = localStorage.getItem('spotify_token_exp')
    if (t && exp && Date.now() < Number(exp)) return t
    return null
  })
  const [topTracks, setTopTracks] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [player, setPlayer] = useState(null)
  const [activeView, setActiveView] = useState('player')
  const [error, setError] = useState(null)
  const [exchanging, setExchanging] = useState(false)
  const pollRef = useRef(null)

  // Handle redirect back from Spotify with ?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const verifier = localStorage.getItem('spotify_code_verifier')

    if (code && verifier && !exchanging) {
      setExchanging(true)
      exchangeCode(code, verifier)
    }
  }, [])

  const exchangeCode = async (code, verifier) => {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: getRedirectUri(),
          client_id: settings.spotifyClientId,
          code_verifier: verifier,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed')

      localStorage.setItem('spotify_token', data.access_token)
      localStorage.setItem('spotify_token_exp', String(Date.now() + data.expires_in * 1000))
      if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token)
      localStorage.removeItem('spotify_code_verifier')

      setToken(data.access_token)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } catch (e) {
      setError(e.message)
    } finally {
      setExchanging(false)
    }
  }

  const refreshToken = async () => {
    const rt = localStorage.getItem('spotify_refresh_token')
    if (!rt || !settings.spotifyClientId) return null
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: rt,
          client_id: settings.spotifyClientId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error('Refresh failed')
      localStorage.setItem('spotify_token', data.access_token)
      localStorage.setItem('spotify_token_exp', String(Date.now() + data.expires_in * 1000))
      if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token)
      setToken(data.access_token)
      return data.access_token
    } catch {
      return null
    }
  }

  const authorize = async () => {
    if (!settings.spotifyClientId) {
      setError('Add your Spotify Client ID in Settings first.')
      return
    }
    const verifier = await generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    localStorage.setItem('spotify_code_verifier', verifier)

    const params = new URLSearchParams({
      client_id: settings.spotifyClientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })
    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }

  const api = async (endpoint, method = 'GET', body = null, currentToken = token) => {
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) {
      const newToken = await refreshToken()
      if (newToken) return api(endpoint, method, body, newToken)
      setToken(null)
      localStorage.removeItem('spotify_token')
      return null
    }
    if (res.status === 204 || res.status === 202) return null
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText) }
    return res.json()
  }

  const fetchPlayer = async () => {
    try { const d = await api('/me/player'); if (d) setPlayer(d) } catch {}
  }
  const fetchTopTracks = async () => {
    try { const d = await api('/me/top/tracks?limit=20&time_range=short_term'); if (d) setTopTracks(d.items) } catch {}
  }
  const fetchPlaylists = async () => {
    try { const d = await api('/me/playlists?limit=20'); if (d) setPlaylists(d.items) } catch {}
  }

  useEffect(() => {
    if (!token) return
    fetchPlayer(); fetchTopTracks(); fetchPlaylists()
    pollRef.current = setInterval(fetchPlayer, 5000)
    return () => clearInterval(pollRef.current)
  }, [token])

  const control = async (action) => {
    try {
      switch (action) {
        case 'play': await api('/me/player/play', 'PUT'); break
        case 'pause': await api('/me/player/pause', 'PUT'); break
        case 'next': await api('/me/player/next', 'POST'); break
        case 'prev': await api('/me/player/previous', 'POST'); break
      }
      setTimeout(fetchPlayer, 500)
    } catch (e) { setError(e.message) }
  }

  const playTrack = async (uri) => {
    try { await api('/me/player/play', 'PUT', { uris: [uri] }); setTimeout(fetchPlayer, 600) }
    catch (e) { setError(e.message) }
  }

  const setVolume = async (v) => {
    try { await api(`/me/player/volume?volume_percent=${v}`, 'PUT') } catch {}
  }

  const disconnect = () => {
    setToken(null)
    ;['spotify_token', 'spotify_token_exp', 'spotify_refresh_token', 'spotify_code_verifier']
      .forEach(k => localStorage.removeItem(k))
  }

  const isPlaying = player?.is_playing
  const track = player?.item
  const progress = track ? (player.progress_ms / track.duration_ms) * 100 : 0

  // Loading state while exchanging code
  if (exchanging) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - var(--header) - 40px)', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🎵</div>
        <div style={{ color: 'var(--text2)', fontSize: 14 }}>Connecting to Spotify...</div>
      </div>
    )
  }

  if (!token) {
    const redirectUri = getRedirectUri()
    const clientId = settings.spotifyClientId || ''
    const maskedId = clientId.length > 8
      ? clientId.slice(0, 4) + '••••' + clientId.slice(-4)
      : clientId ? '(too short — check it)' : '(not set)'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - var(--header) - 40px)', gap: 16, padding: 20 }}>
        <div style={{ fontSize: 60 }}>🎵</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--spotify)' }}>Connect Spotify</h2>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--red)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="btn"
          style={{ background: 'var(--spotify)', color: 'white', padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
          onClick={authorize}
        >
          Connect with Spotify
        </button>

        {/* Debug checklist */}
        <div style={{ width: '100%', maxWidth: 460, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            Checklist — fix "invalid_client"
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Step 1 */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                1. Your Client ID (from Settings)
              </div>
              <code style={{ fontSize: 12, color: clientId ? 'var(--green)' : 'var(--red)', background: 'var(--bg2)', padding: '2px 6px', borderRadius: 4 }}>
                {maskedId}
              </code>
              {!clientId && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                  → Go to Settings → Spotify and paste your Client ID
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                2. Add this exact Redirect URI in your Spotify app
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 11, color: 'var(--cyan)', background: 'var(--bg2)', padding: '4px 8px', borderRadius: 4, flex: 1, wordBreak: 'break-all', lineHeight: 1.5 }}>
                  {redirectUri}
                </code>
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(redirectUri)}>
                  Copy
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
                In Spotify Dashboard → your app → <strong>Edit Settings</strong> → Redirect URIs → paste above → Save
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                3. App type must be set correctly
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                In Spotify Dashboard → your app → <strong>Edit Settings</strong> → check that <strong>Web API</strong> is enabled (not just Web Playback SDK)
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, height: 'calc(100vh - var(--header) - 40px)', overflow: 'hidden' }}>
      {/* Player */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <div className="spotify-player">
          <div className="album-art">
            {track?.album?.images?.[0]?.url
              ? <img src={track.album.images[0].url} alt="album" />
              : <span>🎵</span>}
          </div>
          <div className="track-name">{track?.name || 'Nothing Playing'}</div>
          <div className="track-artist">{track?.artists?.map(a => a.name).join(', ') || '—'}</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginTop: -6 }}>
            <span>{msToTime(player?.progress_ms || 0)}</span>
            <span>{msToTime(track?.duration_ms || 0)}</span>
          </div>
          <div className="player-controls">
            <button className="ctrl-btn" onClick={() => control('prev')}>⏮</button>
            <button className="ctrl-btn play" onClick={() => control(isPlaying ? 'pause' : 'play')}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="ctrl-btn" onClick={() => control('next')}>⏭</button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>🔊</span>
            <input type="range" min={0} max={100}
              defaultValue={player?.device?.volume_percent || 50}
              style={{ flex: 1, accentColor: 'var(--spotify)' }}
              onChange={e => setVolume(e.target.value)} />
          </div>
          {player?.device && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text2)' }}>
              Playing on: <span style={{ color: 'var(--spotify)' }}>{player.device.name}</span>
            </div>
          )}
        </div>

        <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={disconnect}>
          Disconnect Spotify
        </button>

        {error && (
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[['player', '🎵 Now Playing'], ['top', '⭐ Top Tracks'], ['playlists', '📋 Playlists']].map(([v, l]) => (
            <button key={v} className={`btn btn-sm ${activeView === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveView(v)}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeView === 'top' && (
            <div className="card">
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Your Top Tracks (Last 4 Weeks)</h4>
              <div className="track-list">
                {topTracks.map((t, i) => (
                  <div key={t.id} className={`track-row ${track?.id === t.id ? 'active' : ''}`} onClick={() => playTrack(t.uri)}>
                    <span className="track-num">{i + 1}</span>
                    <div style={{ width: 36, height: 36, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                      <img src={t.album.images?.[2]?.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    </div>
                    <div className="track-info">
                      <div className="t-name">{t.name}</div>
                      <div className="t-artist">{t.artists.map(a => a.name).join(', ')}</div>
                    </div>
                    <span className="t-dur">{msToTime(t.duration_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'playlists' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {playlists.map(pl => (
                <div key={pl.id} className="card" style={{ cursor: 'pointer' }}
                  onClick={() => playTrack(`spotify:playlist:${pl.id}`)}>
                  <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', marginBottom: 8, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
                    {pl.images?.[0]?.url
                      ? <img src={pl.images[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : '🎵'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{pl.tracks.total} tracks</div>
                </div>
              ))}
            </div>
          )}

          {activeView === 'player' && (
            <div className="card">
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Now Playing Context</h4>
              {track ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                    <img src={track.album.images?.[1]?.url} style={{ width: 60, height: 60, borderRadius: 8 }} alt="" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{track.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{track.artists.map(a => a.name).join(', ')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Album: {track.album.name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                    {[
                      ['Popularity', `${track.popularity}%`],
                      ['Duration', msToTime(track.duration_ms)],
                      ['Release', track.album.release_date?.split('-')[0]],
                      ['Explicit', track.explicit ? 'Yes' : 'No'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: 'var(--spotify)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>No track currently playing. Start something in Spotify!</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
