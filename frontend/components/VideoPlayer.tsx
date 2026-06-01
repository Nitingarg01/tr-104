"use client"

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

export type CaptionLine = { start: number; end: number; text: string }
export type SegmentMarker = { id: number; start: number; end: number; keyword: string }

export interface VideoPlayerHandle {
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  seekRelative: (delta: number) => void
  toggleMute: () => void
  toggleFullscreen: () => void
}

type Props = {
  src?: string
  captions?: CaptionLine[]
  segments?: SegmentMarker[]
  duration?: number
  activeSegmentId?: number | null
  onTimeUpdate?: (currentTime: number) => void
  onSegmentClick?: (segmentId: number) => void
  seekTime?: number | null
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  const p = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

// Split caption text into individual words for word-by-word animation
function splitWords(text: string) {
  return text.trim().replace(/\n/g, ' ').split(/\s+/).filter(Boolean)
}

const CC_STORAGE_KEY = 'vp_captions_on'
const CC_POSITION_KEY = 'vp_captions_position'

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  {
    src,
    captions = [],
    segments = [],
    duration = 1,
    activeSegmentId = null,
    onTimeUpdate,
    onSegmentClick,
    seekTime = null,
  }: Props,
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const seekBarRef = useRef<HTMLDivElement | null>(null)

  const [playerTime, setPlayerTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(duration)
  const [paused, setPaused] = useState(true)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // Reset error/loaded state whenever src changes (e.g. after a URL fix)
  useEffect(() => {
    setVideoLoaded(false)
    setVideoError(false)
  }, [src])
  const [hoveredSegId, setHoveredSegId] = useState<number | null>(null)
  const [seekPreview, setSeekPreview] = useState<{ pct: number; time: number } | null>(null)
  const isDragging = useRef(false)

  // CC state — persisted to localStorage
  const [ccOn, setCcOn] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(CC_STORAGE_KEY)
    return stored === null ? true : stored === '1'
  })

  // Caption position mode: 'over' = overlay on top of video, 'below' = strip below video
  const [ccPosition, setCcPosition] = useState<'over' | 'below'>(() => {
    if (typeof window === 'undefined') return 'over'
    const stored = localStorage.getItem(CC_POSITION_KEY)
    return stored === 'below' ? 'below' : 'over'
  })

  // Caption display state
  const [captionWords, setCaptionWords] = useState<string[]>([])
  const [captionVisible, setCaptionVisible] = useState(false)
  const captionFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCaptionKey = useRef<string>('')

  const totalDuration = Math.max(videoDuration, duration, 1)
  const progressPct = Math.min((playerTime / totalDuration) * 100, 100)

  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play().catch(() => undefined),
    pause: () => videoRef.current?.pause(),
    togglePlay: () => {
      const v = videoRef.current
      if (!v) return
      if (v.paused) v.play().catch(() => undefined)
      else v.pause()
    },
    seek: (t: number) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, t) },
    seekRelative: (d: number) => {
      const v = videoRef.current
      if (v) v.currentTime = Math.max(0, v.currentTime + d)
    },
    toggleMute: () => {
      const v = videoRef.current
      if (!v) return
      v.muted = !v.muted
      setMuted(v.muted)
    },
    toggleFullscreen: () => {
      const el = containerRef.current
      if (!el) return
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
      else el.requestFullscreen().catch(() => undefined)
    },
  }), [])

  // Update captions on timeupdate
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    setPlayerTime(t)
    onTimeUpdate?.(t)

    const line = captions.find((c) => t >= c.start && t <= c.end)
    if (line) {
      const key = `${line.start}-${line.end}`
      if (key !== lastCaptionKey.current) {
        lastCaptionKey.current = key
        setCaptionWords(splitWords(line.text.slice(0, 120)))
        setCaptionVisible(true)
        if (captionFadeTimer.current) clearTimeout(captionFadeTimer.current)
      }
      // schedule fade-out after segment ends
      if (captionFadeTimer.current) clearTimeout(captionFadeTimer.current)
      const remaining = (line.end - t) * 1000 + 800
      captionFadeTimer.current = setTimeout(() => {
        setCaptionVisible(false)
        lastCaptionKey.current = ''
      }, Math.max(remaining, 100))
    }
  }, [captions, onTimeUpdate])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.addEventListener('timeupdate', handleTimeUpdate)
    v.addEventListener('play', () => setPaused(false))
    v.addEventListener('pause', () => setPaused(true))
    v.addEventListener('volumechange', () => {
      setMuted(v.muted)
      setVolume(v.volume)
    })
    v.addEventListener('durationchange', () => {
      if (Number.isFinite(v.duration)) setVideoDuration(v.duration)
    })
    return () => {
      v.removeEventListener('timeupdate', handleTimeUpdate)
      if (captionFadeTimer.current) clearTimeout(captionFadeTimer.current)
    }
  }, [handleTimeUpdate])

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // External seek
  useEffect(() => {
    if (seekTime == null) return
    const v = videoRef.current
    if (!v || !Number.isFinite(seekTime)) return
    v.currentTime = Math.max(0, seekTime)
    v.play().catch(() => undefined)
  }, [seekTime])

  // CC toggle — persist
  const toggleCC = () => {
    setCcOn((v) => {
      const next = !v
      localStorage.setItem(CC_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  const toggleCCPosition = () => {
    setCcPosition((v) => {
      const next = v === 'over' ? 'below' : 'over'
      localStorage.setItem(CC_POSITION_KEY, next)
      return next
    })
  }

  // Seek bar interactions
  const seekFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const bar = seekBarRef.current
    const v = videoRef.current
    if (!bar || !v) return
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * totalDuration
  }, [totalDuration])

  const handleSeekBarMouseMove = useCallback((e: React.MouseEvent) => {
    const bar = seekBarRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setSeekPreview({ pct: pct * 100, time: pct * totalDuration })
    if (isDragging.current) seekFromEvent(e)
  }, [seekFromEvent, totalDuration])

  const handleSeekBarMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    seekFromEvent(e)
    const onUp = () => { isDragging.current = false; window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mouseup', onUp)
  }, [seekFromEvent])

  // Volume icon
  const volumeIcon = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'

  if (!src) {
    return (
      <div
        className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg flex flex-col items-center justify-center"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="text-6xl mb-4">🎬</div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No Video Loaded
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Upload a video to see live captions
        </p>
      </div>
    )
  }

  if (videoError) {
    return (
      <div
        className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg flex flex-col items-center justify-center"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Video failed to load
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Could not reach the media server. Make sure the backend is running.
        </p>
        <button
          onClick={() => setVideoError(false)}
          style={{
            padding: '6px 18px',
            borderRadius: 8,
            background: 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full group"
      style={{
        background: '#000',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ── Video element (no native controls) ── */}
      <div
        className="relative w-full aspect-video"
        onClick={() => {
          const v = videoRef.current
          if (!v) return
          if (v.paused) v.play().catch(() => undefined)
          else v.pause()
        }}
        style={{ cursor: 'pointer' }}
      >
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-cover"
          preload="metadata"
          onLoadedData={() => setVideoLoaded(true)}
          onLoadedMetadata={() => setVideoLoaded(true)}
          onError={() => setVideoError(true)}
          playsInline
        />

        {!videoLoaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: '#111' }}>
            <div className="flex flex-col items-center gap-1">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}

        {/* Big play icon flash on toggle */}
        {paused && videoLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: 0.85 }}
          >
            <div
              style={{
                width: 64, height: 64,
                background: 'rgba(0,0,0,0.55)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Caption overlay — rendered on top of the video so it stays visible in fullscreen */}
        {ccOn && (ccPosition === 'over' || fullscreen) && (
          <>
            <div
              aria-live="polite"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: fullscreen ? '10%' : 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: fullscreen ? '10px 6%' : '6px 10%',
                pointerEvents: 'none',
                opacity: captionWords.length > 0 && captionVisible ? 1 : 0,
                transition: 'opacity 180ms ease',
                zIndex: 4,
              }}
            >
              <p
                style={{
                  margin: 0,
                  padding: fullscreen ? '8px 16px' : '4px 8px',
                  textAlign: 'center',
                  fontSize: fullscreen ? 'clamp(20px, 2.5vw, 32px)' : 'clamp(14px, 1.8vw, 20px)',
                  fontFamily: '"Roboto", "Arial", sans-serif',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: '#ffffff',
                  background: 'rgba(8, 8, 8, 0.75)',
                  borderRadius: 4,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                  maxWidth: '90%',
                }}
              >
                {captionWords.map((word, i) => (
                  <span
                    key={`overlay-${lastCaptionKey.current}-${i}`}
                    style={{
                      display: 'inline-block',
                      marginRight: '0.35em',
                      animation: `captionWord 160ms ease-out both`,
                      animationDelay: `${Math.min(i * 30, 350)}ms`,
                    }}
                  >
                    {word}
                  </span>
                ))}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Caption strip: lives BELOW the video, never covers content ── */}
      {ccOn && ccPosition === 'below' && (
        <div
          aria-live="polite"
          style={{
            background: 'rgba(0,0,0,0.92)',
            // Animate height: collapses when no caption to avoid layout jump flash
            minHeight: captionWords.length > 0 ? 36 : 0,
            maxHeight: captionWords.length > 0 ? 72 : 0,
            overflow: 'hidden',
            transition: 'max-height 200ms ease, opacity 200ms ease, min-height 200ms ease',
            opacity: captionWords.length > 0 && captionVisible ? 1 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: captionWords.length > 0 ? '5px 12% 6px' : 0,
          }}
        >
          <p
            style={{
              margin: 0,
              padding: 0,
              textAlign: 'center',
              fontSize: 'clamp(12px, 1.35vw, 15px)',
              fontWeight: 600,
              lineHeight: 1.45,
              color: '#ffffff',
              letterSpacing: '0.015em',
              // Hard clamp to 2 lines max
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {captionWords.map((word, i) => (
              <span
                key={`${lastCaptionKey.current}-${i}`}
                style={{
                  display: 'inline-block',
                  marginRight: '0.3em',
                  animation: `captionWord 160ms ease-out both`,
                  animationDelay: `${Math.min(i * 30, 350)}ms`,
                }}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* ── Controls bar ── */}
      <div
        style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 100%)',
          padding: '4px 12px 10px',
        }}
      >
        {/* ── Unified timeline: progress + chapter markers ── */}
        <div
          ref={seekBarRef}
          onMouseDown={handleSeekBarMouseDown}
          onMouseMove={handleSeekBarMouseMove}
          onMouseLeave={() => setSeekPreview(null)}
          style={{
            position: 'relative',
            height: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* Track background */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0,
              height: 4, borderRadius: 4,
              background: 'rgba(255,255,255,0.18)',
              top: '50%', transform: 'translateY(-50%)',
              overflow: 'visible',
            }}
          >
            {/* Played fill */}
            <div
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${progressPct}%`,
                background: 'var(--accent-primary)',
                borderRadius: 4,
                transition: 'width 0.1s linear',
              }}
            />

            {/* Segment chapter gap markers */}
            {segments.map((seg) => {
              const left = (seg.start / totalDuration) * 100
              const width = Math.max(((seg.end - seg.start) / totalDuration) * 100, 0.12)
              const isCurrent = playerTime >= seg.start && playerTime < seg.end
              const isPassed = playerTime >= seg.end
              const isHov = hoveredSegId === seg.id

              return (
                <React.Fragment key={seg.id}>
                  {/* Thin gap between segments — white line */}
                  {seg.start > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        top: -1, bottom: -1, width: 2,
                        background: '#000',
                        borderRadius: 1,
                        zIndex: 5,
                      }}
                    />
                  )}
                  {/* Hovered chapter highlight */}
                  {isHov && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        width: `${width}%`,
                        top: -3, bottom: -3,
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: 4,
                        transition: 'opacity 120ms',
                        zIndex: 3,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {/* Hover hitbox (transparent) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      top: -12, bottom: -12,
                      zIndex: 10,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredSegId(seg.id)}
                    onMouseLeave={() => setHoveredSegId(null)}
                    onClick={(e) => { e.stopPropagation(); onSegmentClick?.(seg.id) }}
                  />
                  {/* Tooltip */}
                  {isHov && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `calc(${left + width / 2}%)`,
                        bottom: 16,
                        transform: 'translateX(-50%)',
                        background: 'rgba(10,12,22,0.97)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '5px 10px',
                        borderRadius: 7,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                        zIndex: 50,
                      }}
                    >
                      <span style={{ color: 'var(--accent-primary)', marginRight: 5 }}>
                        {fmt(seg.start)}
                      </span>
                      {seg.keyword.slice(0, 28)}
                    </div>
                  )}
                </React.Fragment>
              )
            })}

            {/* Seek preview time bubble */}
            {seekPreview && (
              <div
                style={{
                  position: 'absolute',
                  left: `${seekPreview.pct}%`,
                  bottom: 14,
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.85)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 5,
                  pointerEvents: 'none',
                  zIndex: 60,
                  whiteSpace: 'nowrap',
                }}
              >
                {fmt(seekPreview.time)}
              </div>
            )}
          </div>

          {/* Playhead thumb */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${progressPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 13, height: 13,
              background: '#fff',
              borderRadius: '50%',
              boxShadow: '0 0 0 2px var(--accent-primary), 0 2px 6px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
              zIndex: 20,
              transition: 'left 0.1s linear',
            }}
          />
        </div>

        {/* ── Bottom controls row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {/* Play/pause */}
          <button
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              if (v.paused) v.play().catch(() => undefined)
              else v.pause()
            }}
            style={btnStyle}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            {paused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            )}
          </button>

          {/* Volume */}
          <button
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              v.muted = !v.muted
              setMuted(v.muted)
            }}
            style={btnStyle}
            aria-label="Toggle mute"
          >
            <span style={{ fontSize: 14 }}>{volumeIcon}</span>
          </button>

          {/* Volume slider */}
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = videoRef.current
              if (!v) return
              const val = parseFloat(e.target.value)
              v.volume = val
              v.muted = val === 0
              setVolume(val)
              setMuted(val === 0)
            }}
            style={{ width: 64, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
          />

          {/* Time display */}
          <span style={{ color: '#ccc', fontSize: 12, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>
            {fmt(playerTime)} / {fmt(totalDuration)}
          </span>

          {/* Current chapter name — like YouTube's "Chapter Name ›" in the controls bar */}
          {(() => {
            const activeSeg = segments.find(
              (s) => playerTime >= s.start && playerTime < s.end
            )
            if (!activeSeg) return null
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginLeft: 8,
                  padding: '2px 8px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  maxWidth: 180,
                  overflow: 'hidden',
                }}
                onClick={() => onSegmentClick?.(activeSeg.id)}
                title={activeSeg.keyword}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.75)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {activeSeg.keyword}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>›</span>
              </div>
            )
          })()}

          <div style={{ flex: 1 }} />

          {/* CC toggle */}
          <button
            onClick={toggleCC}
            style={{
              ...btnStyle,
              background: ccOn ? 'rgba(255,255,255,0.2)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: ccOn ? '#fff' : 'rgba(255,255,255,0.45)',
              transition: 'all 180ms ease',
            }}
            aria-label="Toggle captions"
            title={ccOn ? 'Hide captions' : 'Show captions'}
          >
            CC
          </button>

          {/* CC position toggle: 'over' video (shown in fullscreen) vs 'below' */}
          {ccOn && (
            <button
              onClick={toggleCCPosition}
              style={{
                ...btnStyle,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.02em',
                color: 'rgba(255,255,255,0.85)',
                transition: 'all 180ms ease',
                minWidth: 30,
              }}
              aria-label="Toggle caption position"
              title={ccPosition === 'over' ? 'Captions on video (shown in fullscreen) — click to move below' : 'Captions below video — click to overlay on video'}
            >
              {ccPosition === 'over' ? '⤓' : '⤒'}
            </button>
          )}

          {/* Speed */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSpeedMenu((v) => !v)}
              style={{ ...btnStyle, fontSize: 12, fontWeight: 600 }}
              aria-label="Playback speed"
            >
              {speed}×
            </button>
            {showSpeedMenu && (
              <div
                style={{
                  position: 'absolute', bottom: '110%', right: 0,
                  background: 'rgba(10,12,22,0.97)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  zIndex: 80,
                  minWidth: 70,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      const v = videoRef.current
                      if (v) v.playbackRate = s
                      setSpeed(s)
                      setShowSpeedMenu(false)
                    }}
                    style={{
                      display: 'block', width: '100%',
                      padding: '7px 14px',
                      background: s === speed ? 'rgba(46,91,255,0.25)' : 'transparent',
                      color: s === speed ? 'var(--accent-primary)' : '#ccc',
                      fontSize: 13, fontWeight: 500,
                      textAlign: 'center', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => {
              const el = containerRef.current
              if (!el) return
              if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
              else el.requestFullscreen().catch(() => undefined)
            }}
            style={btnStyle}
            aria-label="Toggle fullscreen"
          >
            {fullscreen ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Caption word-in animation keyframe */}
      <style>{`
        @keyframes captionWord {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
})

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 6px',
  borderRadius: 4,
  flexShrink: 0,
  transition: 'color 120ms, background 120ms',
}

export default VideoPlayer
