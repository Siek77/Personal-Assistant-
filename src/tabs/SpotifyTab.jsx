import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-top-read',
  'playlist-read-private',
  'streaming',
].join(' ')

async function generateCodeVerifier() {
  const arr = new Uint8Array(64)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}
async function generateCodeChallenge(v) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}
function fmt(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
}
function getRedirectUri() {
  return window.location.origin + window.location.pathname
}

const DEVICE_ICON = { Computer:'💻', Smartphone:'📱', Speaker:'🔊', TV:'📺', GameConsole:'🎮', Automobile:'🚗' }

// ── Device Picker ──────────────────────────────────────────────────────────────
function DevicePicker({ devices, activeId, onSelect, onRefresh, loading }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = devices.find(d => d.id === activeId)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) onRefresh() }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 14px 6px 10px',
          cursor: 'pointer', color: active ? '#1db954' : '#94a3b8', fontSize: 12, fontWeight: 500,
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        <span>{DEVICE_ICON[active?.type] ?? '🔊'}</span>
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active?.name ?? 'Select device'}
        </span>
        <span style={{ opacity: 0.5, fontSize: 9 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          background: '#161b27', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, padding: 8, minWidth: 260, zIndex: 100,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 10px 8px' }}>
            Available Devices
          </div>

          {loading && <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>Scanning…</div>}

          {!loading && devices.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              No devices found.<br/>Open Spotify on any device first.
            </div>
          )}

          {devices.map(d => {
            const isActive = d.id === activeId
            return (
              <button
                key={d.id}
                onClick={() => { onSelect(d.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 10px', borderRadius: 8, background: isActive ? 'rgba(29,185,84,0.12)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{DEVICE_ICON[d.type] ?? '🎵'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? '#1db954' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                    {d.type}{d.volume_percent != null ? ` · ${d.volume_percent}%` : ''}
                  </div>
                </div>
                {isActive && <span style={{ fontSize: 10, color: '#1db954', fontWeight: 700, flexShrink: 0 }}>ACTIVE</span>}
              </button>
            )
          })}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 6, paddingTop: 6 }}>
            <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: '#64748b' }}>
              ⟳ Refresh devices
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seek Bar ───────────────────────────────────────────────────────────────────
function SeekBar({ position, duration, onSeek }) {
  const ref = useRef(null)
  const [hover, setHover] = useState(false)
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0

  const seek = (e) => {
    if (!ref.current || !duration) return
    const rect = ref.current.getBoundingClientRect()
    onSeek(Math.floor(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#475569', width: 32, textAlign: 'right', flexShrink: 0 }}>{fmt(position)}</span>
      <div
        ref={ref} onClick={seek}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ flex: 1, height: hover ? 6 : 4, background: 'rgba(255,255,255,0.1)', borderRadius: 3, cursor: 'pointer', transition: 'height 0.15s', position: 'relative' }}
      >
        <div style={{ height: '100%', width: `${pct}%`, background: hover ? '#fff' : '#1db954', borderRadius: 3, transition: 'background 0.15s', position: 'relative' }}>
          {hover && <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }} />}
        </div>
      </div>
      <span style={{ fontSize: 11, color: '#475569', width: 32, flexShrink: 0 }}>{fmt(duration)}</span>
    </div>
  )
}

// ── Track Row ──────────────────────────────────────────────────────────────────
function TrackRow({ track, index, active, playing, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        borderRadius: 8, cursor: 'pointer',
        background: active ? 'rgba(29,185,84,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ width: 18, textAlign: 'center', fontSize: 12, color: active ? '#1db954' : '#475569', flexShrink: 0 }}>
        {active && playing ? <span style={{ color: '#1db954' }}>♫</span> : index + 1}
      </div>
      <div style={{ width: 38, height: 38, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: '#1e2533' }}>
        {track.album?.images?.[2]?.url && <img src={track.album.images[2].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: active ? '#1db954' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artists?.map(a => a.name).join(', ')}</div>
      </div>
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', flexShrink: 0 }}>{fmt(track.duration_ms)}</div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function SpotifyTab() {
  const { settings } = useSettings()
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('spotify_token')
    const exp = localStorage.getItem('spotify_token_exp')
    return t && exp && Date.now() < Number(exp) ? t : null
  })
  const tokenRef = useRef(token)
  tokenRef.current = token

  const [player, setPlayer] = useState(null)
  const [devices, setDevices] = useState([])
  const [devLoading, setDevLoading] = useState(false)
  const [topTracks, setTopTracks] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [view, setView] = useState('top')
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('off')
  const [volume, setVolume] = useState(50)
  const [localPos, setLocalPos] = useState(0)
  const [error, setError] = useState(null)
  const [exchanging, setExchanging] = useState(false)
  const pollRef = useRef(null)
  const tickRef = useRef(null)

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const code = p.get('code')
    const verifier = localStorage.getItem('spotify_code_verifier')
    if (code && verifier) { setExchanging(true); exchangeCode(code, verifier) }
  }, [])

  const exchangeCode = async (code, verifier) => {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: getRedirectUri(), client_id: settings.spotifyClientId, code_verifier: verifier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || data.error)
      storeToken(data)
      localStorage.removeItem('spotify_code_verifier')
      setToken(data.access_token)
      window.history.replaceState({}, '', window.location.pathname)
    } catch (e) { setError(e.message) }
    finally { setExchanging(false) }
  }

  const storeToken = (data) => {
    localStorage.setItem('spotify_token', data.access_token)
    localStorage.setItem('spotify_token_exp', String(Date.now() + data.expires_in * 1000))
    if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token)
    tokenRef.current = data.access_token
  }

  const doRefresh = async () => {
    const rt = localStorage.getItem('spotify_refresh_token')
    if (!rt) return null
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: settings.spotifyClientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error()
      storeToken(data); setToken(data.access_token); return data.access_token
    } catch { return null }
  }

  const authorize = async () => {
    if (!settings.spotifyClientId) { setError('Add Spotify Client ID in Settings first.'); return }
    const verifier = await generateCodeVerifier()
    localStorage.setItem('spotify_code_verifier', verifier)
    const params = new URLSearchParams({
      client_id: settings.spotifyClientId, response_type: 'code',
      redirect_uri: getRedirectUri(), scope: SCOPES,
      code_challenge_method: 'S256', code_challenge: await generateCodeChallenge(verifier),
    })
    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }

  // ── API ───────────────────────────────────────────────────
  const api = useCallback(async (endpoint, method = 'GET', body = null, tok = null) => {
    const t = tok || tokenRef.current
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) {
      const newTok = await doRefresh()
      if (newTok) return api(endpoint, method, body, newTok)
      setToken(null); return null
    }
    if (res.status === 204 || res.status === 202) return null
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText) }
    return res.json()
  }, [])

  // ── Fetchers ──────────────────────────────────────────────
  const fetchPlayer = useCallback(async () => {
    try {
      const d = await api('/me/player')
      if (d) { setPlayer(d); setShuffle(d.shuffle_state); setRepeat(d.repeat_state); setVolume(d.device?.volume_percent ?? 50); setLocalPos(d.progress_ms || 0) }
    } catch {}
  }, [api])

  const fetchDevices = async () => {
    setDevLoading(true)
    try { const d = await api('/me/player/devices'); if (d) setDevices(d.devices) } catch {}
    setDevLoading(false)
  }

  useEffect(() => {
    if (!token) return
    fetchPlayer(); fetchDevices()
    api('/me/top/tracks?limit=30&time_range=short_term').then(d => d && setTopTracks(d.items)).catch(() => {})
    api('/me/playlists?limit=24').then(d => d && setPlaylists(d.items)).catch(() => {})
    pollRef.current = setInterval(fetchPlayer, 5000)
    return () => clearInterval(pollRef.current)
  }, [token])

  // Local progress tick
  useEffect(() => {
    clearInterval(tickRef.current)
    if (player?.is_playing) tickRef.current = setInterval(() => setLocalPos(p => p + 1000), 1000)
    return () => clearInterval(tickRef.current)
  }, [player?.is_playing, player?.item?.id])

  // ── Controls ──────────────────────────────────────────────
  const control = async (action) => {
    try {
      if (action === 'play') await api('/me/player/play', 'PUT')
      else if (action === 'pause') await api('/me/player/pause', 'PUT')
      else if (action === 'next') await api('/me/player/next', 'POST')
      else if (action === 'prev') await api('/me/player/previous', 'POST')
      setTimeout(fetchPlayer, 500)
    } catch (e) { setError(e.message) }
  }

  const seek = async (ms) => { setLocalPos(ms); try { await api(`/me/player/seek?position_ms=${ms}`, 'PUT') } catch {} }
  const setVol = async (v) => { setVolume(v); try { await api(`/me/player/volume?volume_percent=${v}`, 'PUT') } catch {} }
  const toggleShuffle = async () => { const n = !shuffle; setShuffle(n); try { await api(`/me/player/shuffle?state=${n}`, 'PUT') } catch {} }
  const cycleRepeat = async () => {
    const n = repeat === 'off' ? 'context' : repeat === 'context' ? 'track' : 'off'
    setRepeat(n); try { await api(`/me/player/repeat?state=${n}`, 'PUT') } catch {}
  }
  const transferDevice = async (id) => {
    try { await api('/me/player', 'PUT', { device_ids: [id], play: true }); setTimeout(fetchPlayer, 800) }
    catch (e) { setError(e.message) }
  }
  const playUri = async (uri) => {
    const body = uri.startsWith('spotify:track:') ? { uris: [uri] } : { context_uri: uri }
    try { await api('/me/player/play', 'PUT', body); setTimeout(fetchPlayer, 600) }
    catch (e) { setError(e.message) }
  }
  const disconnect = () => {
    setToken(null); clearInterval(pollRef.current); clearInterval(tickRef.current)
    ;['spotify_token','spotify_token_exp','spotify_refresh_token','spotify_code_verifier'].forEach(k => localStorage.removeItem(k))
  }

  const track = player?.item
  const playing = player?.is_playing
  const albumImg = track?.album?.images?.[0]?.url
  const repeatIcon = { off: '↩', context: '🔁', track: '🔂' }

  // ── Auth Screens ──────────────────────────────────────────
  if (exchanging) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, flexDirection: 'column' }}>
      <div style={{ fontSize: 40 }}>🎵</div>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Connecting to Spotify…</div>
    </div>
  )

  if (!token) {
    const uri = getRedirectUri()
    const cid = settings.spotifyClientId || ''
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: 24 }}>
        <div style={{ fontSize: 56 }}>🎵</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1db954', margin: 0 }}>Connect Spotify</h2>
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#ef4444', maxWidth: 420, textAlign: 'center' }}>⚠️ {error}</div>}
        <button onClick={authorize} style={{ background: '#1db954', color: '#000', border: 'none', borderRadius: 24, padding: '13px 36px', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3, boxShadow: '0 0 24px rgba(29,185,84,0.35)' }}>
          Connect with Spotify
        </button>
        <div style={{ width: '100%', maxWidth: 460, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' }}>Setup checklist</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client ID</div>
            <code style={{ fontSize: 12, color: cid ? '#1db954' : '#ef4444' }}>
              {cid.length > 8 ? cid.slice(0,4)+'••••'+cid.slice(-4) : cid || '(not set — go to Settings)'}
            </code>
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Redirect URI — add this in Spotify Dashboard</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <code style={{ fontSize: 11, color: '#06b6d4', wordBreak: 'break-all', lineHeight: 1.5, flex: 1 }}>{uri}</code>
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(uri)}>Copy</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Player UI ─────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', height: 'calc(100vh - var(--header) - 40px)', overflow: 'hidden', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: '#0a0e17' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Dynamic blurred background from album art */}
        {albumImg && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${albumImg})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.8)', opacity: 0.25, transform: 'scale(1.2)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,14,23,0.4) 0%, rgba(10,14,23,0.95) 60%, #0a0e17 100%)' }} />

        {/* Content */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 20px 0', gap: 16, overflow: 'hidden' }}>

          {/* Album art */}
          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#1a2030', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
            {albumImg
              ? <img src={albumImg} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="album" />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: '#1db954' }}>🎵</div>
            }
          </div>

          {/* Track info */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track?.name || 'Nothing playing'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track?.artists?.map(a => a.name).join(', ') || '—'}
            </div>
            {track?.album?.name && (
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {track.album.name} · {track.album.release_date?.split('-')[0]}
              </div>
            )}
          </div>

          {/* Seek bar */}
          <SeekBar position={localPos} duration={track?.duration_ms} onSeek={seek} />

          {/* Shuffle + Repeat */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
            {[
              { icon: '🔀', active: shuffle, onClick: toggleShuffle, tip: 'Shuffle' },
              { icon: repeatIcon[repeat], active: repeat !== 'off', onClick: cycleRepeat, tip: 'Repeat' },
            ].map(b => (
              <button key={b.tip} onClick={b.onClick} title={b.tip} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, opacity: b.active ? 1 : 0.3, transition: 'opacity 0.2s', position: 'relative', padding: 4 }}>
                {b.icon}
                {b.active && <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1db954' }} />}
              </button>
            ))}
          </div>

          {/* Prev / Play / Next */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => control('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: '#cbd5e1', opacity: 0.75, transition: 'opacity 0.1s', padding: 4 }}
              onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.75}>⏮</button>

            <button onClick={() => control(playing ? 'pause' : 'play')} style={{
              width: 56, height: 56, borderRadius: '50%', background: '#1db954', border: 'none', cursor: 'pointer',
              fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900,
              boxShadow: '0 0 24px rgba(29,185,84,0.45)', transition: 'transform 0.12s, box-shadow 0.12s',
            }}
              onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.07)'; e.currentTarget.style.boxShadow = '0 0 36px rgba(29,185,84,0.65)' }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(29,185,84,0.45)' }}>
              {playing ? '⏸' : '▶'}
            </button>

            <button onClick={() => control('next')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: '#cbd5e1', opacity: 0.75, transition: 'opacity 0.1s', padding: 4 }}
              onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.75}>⏭</button>
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.4 }}>🔈</span>
            <input type="range" min={0} max={100} value={volume} onChange={e => setVol(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#1db954', cursor: 'pointer' }} />
            <span style={{ fontSize: 13, opacity: 0.4 }}>🔊</span>
          </div>

          {/* Device picker */}
          <div style={{ paddingBottom: 4 }}>
            <DevicePicker devices={devices} activeId={player?.device?.id} onSelect={transferDevice} onRefresh={fetchDevices} loading={devLoading} />
          </div>
        </div>

        {/* Disconnect */}
        <div style={{ position: 'relative', padding: '10px 20px 16px' }}>
          {error && (
            <div onClick={() => setError(null)} style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', borderRadius: 6, padding: '4px 8px' }}>
              ⚠️ {error} — tap to dismiss
            </div>
          )}
          <button onClick={disconnect} style={{ width: '100%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '7px 0', cursor: 'pointer', fontSize: 12, color: '#ef4444', fontWeight: 500, transition: 'background 0.15s' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.16)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}>
            Disconnect Spotify
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0c1018' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {[['top','Top Tracks'],['playlists','Playlists']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '14px 18px', fontSize: 13, fontWeight: 500,
              color: view === v ? '#e2e8f0' : '#475569',
              borderBottom: view === v ? '2px solid #1db954' : '2px solid transparent',
              transition: 'color 0.15s', marginBottom: -1,
            }}>{l}</button>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
          {view === 'top' && (
            <>
              {topTracks.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading top tracks…</div>}
              {topTracks.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} active={track?.id === t.id} playing={playing} onClick={() => playUri(t.uri)} />
              ))}
            </>
          )}

          {view === 'playlists' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12, padding: '8px 12px' }}>
              {playlists.map(pl => (
                <div key={pl.id} onClick={() => playUri(`spotify:playlist:${pl.id}`)} style={{ borderRadius: 10, overflow: 'hidden', background: '#111827', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(29,185,84,0.35)' }}
                  onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' }}>
                  <div style={{ aspectRatio: '1', background: '#1a2030', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden' }}>
                    {pl.images?.[0]?.url
                      ? <img src={pl.images[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : '🎵'}
                  </div>
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{pl.tracks.total} tracks</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
