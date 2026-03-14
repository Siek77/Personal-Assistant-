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

function msToTime(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function SpotifyTab() {
  const { settings } = useSettings()
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('spotify_token')
    const exp = localStorage.getItem('spotify_token_exp')
    if (t && exp && Date.now() < Number(exp)) return t
    return null
  })
  const [player, setPlayer] = useState(null)   // current playback
  const [queue, setQueue] = useState([])
  const [topTracks, setTopTracks] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [activeView, setActiveView] = useState('player') // player | playlists | top
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  // Check token from URL hash after redirect
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1))
      const t = params.get('access_token')
      const exp = params.get('expires_in')
      if (t) {
        setToken(t)
        localStorage.setItem('spotify_token', t)
        localStorage.setItem('spotify_token_exp', String(Date.now() + Number(exp) * 1000))
        window.location.hash = ''
      }
    }
  }, [])

  const authorize = () => {
    if (!settings.spotifyClientId) {
      setError('Add your Spotify Client ID in Settings first.')
      return
    }
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname)
    const url = `https://accounts.spotify.com/authorize?client_id=${settings.spotifyClientId}&response_type=token&redirect_uri=${redirectUri}&scope=${encodeURIComponent(SCOPES)}`
    window.location.href = url
  }

  const api = async (endpoint, method = 'GET', body = null) => {
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) { setToken(null); localStorage.removeItem('spotify_token'); return null }
    if (res.status === 204 || res.status === 202) return null
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText) }
    return res.json()
  }

  const fetchPlayer = async () => {
    try {
      const data = await api('/me/player')
      if (data) setPlayer(data)
    } catch (e) { console.warn(e) }
  }

  const fetchTopTracks = async () => {
    try {
      const data = await api('/me/top/tracks?limit=20&time_range=short_term')
      if (data) setTopTracks(data.items)
    } catch (e) { console.warn(e) }
  }

  const fetchPlaylists = async () => {
    try {
      const data = await api('/me/playlists?limit=20')
      if (data) setPlaylists(data.items)
    } catch (e) { console.warn(e) }
  }

  useEffect(() => {
    if (!token) return
    fetchPlayer()
    fetchTopTracks()
    fetchPlaylists()
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
    try {
      await api('/me/player/play', 'PUT', { uris: [uri] })
      setTimeout(fetchPlayer, 600)
    } catch (e) { setError(e.message) }
  }

  const setVolume = async (v) => {
    try { await api(`/me/player/volume?volume_percent=${v}`, 'PUT') } catch {}
  }

  const isPlaying = player?.is_playing
  const track = player?.item
  const progress = track ? (player.progress_ms / track.duration_ms) * 100 : 0

  if (!token) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - var(--header) - 40px)', gap: 16 }}>
        <div style={{ fontSize: 60 }}>🎵</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--spotify)' }}>Connect Spotify</h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
          Connect your Spotify account to control playback, browse playlists, and see your top tracks. Add your Client ID in Settings first.
        </p>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠️ {error}</div>}
        <button
          className="btn"
          style={{ background: 'var(--spotify)', color: 'white', padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
          onClick={authorize}
        >
          Connect with Spotify
        </button>
        <p style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 340, textAlign: 'center' }}>
          Requires a Spotify Client ID from the Spotify Developer Dashboard. Set redirect URI to <code style={{ fontSize: 10, background: 'var(--bg3)', padding: '2px 4px', borderRadius: 4 }}>{window.location.origin + window.location.pathname}</code>
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, height: 'calc(100vh - var(--header) - 40px)', overflow: 'hidden' }}>
      {/* Player */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <div className="spotify-player">
          {/* Album Art */}
          <div className="album-art">
            {track?.album?.images?.[0]?.url
              ? <img src={track.album.images[0].url} alt="album" />
              : <span>🎵</span>}
          </div>

          {/* Track Info */}
          <div className="track-name">{track?.name || 'Nothing Playing'}</div>
          <div className="track-artist">{track?.artists?.map(a => a.name).join(', ') || '—'}</div>

          {/* Progress */}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginTop: -6 }}>
            <span>{msToTime(player?.progress_ms || 0)}</span>
            <span>{msToTime(track?.duration_ms || 0)}</span>
          </div>

          {/* Controls */}
          <div className="player-controls">
            <button className="ctrl-btn" onClick={() => control('prev')} title="Previous">⏮</button>
            <button className="ctrl-btn play" onClick={() => control(isPlaying ? 'pause' : 'play')}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="ctrl-btn" onClick={() => control('next')} title="Next">⏭</button>
          </div>

          {/* Volume */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>🔊</span>
            <input
              type="range" min={0} max={100}
              defaultValue={player?.device?.volume_percent || 50}
              style={{ flex: 1, accentColor: 'var(--spotify)' }}
              onChange={e => setVolume(e.target.value)}
            />
          </div>

          {/* Device */}
          {player?.device && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text2)' }}>
              Playing on: <span style={{ color: 'var(--spotify)' }}>{player.device.name}</span>
            </div>
          )}
        </div>

        <button
          className="btn btn-danger btn-sm"
          style={{ width: '100%' }}
          onClick={() => { setToken(null); localStorage.removeItem('spotify_token') }}
        >
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
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[['player', '🎵 Queue'], ['top', '⭐ Top Tracks'], ['playlists', '📋 Playlists']].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${activeView === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveView(v)}
            >{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Top tracks */}
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

          {/* Playlists */}
          {activeView === 'playlists' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {playlists.map(pl => (
                <div
                  key={pl.id}
                  className="card"
                  style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onClick={() => { setError(null); playTrack(`spotify:playlist:${pl.id}`) }}
                >
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

          {/* Queue placeholder */}
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
