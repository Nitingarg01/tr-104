"use client"

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import VideoPlayer, { VideoPlayerHandle, SegmentMarker } from '../../../components/VideoPlayer'
import SearchBar from '../../../components/SearchBar'
import AnalysisChat from '../../../components/AnalysisChat'
import {
  getEpisode,
  getTranscript,
  Episode,
  EpisodeSegment,
  TranscriptChunk,
  getVideoUrl,
  getAudioUrl,
  BACKEND_URL,
  connectCaptionsWebSocket,
  semanticSearch,
  SemanticSearchResult,
} from '../../../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'))
  return (
    <span>
      {parts.map((p, idx) =>
        p.toLowerCase() === query.toLowerCase()
          ? (
            <mark
              key={idx}
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                borderRadius: 3,
                padding: '0 2px',
              }}
            >
              {p}
            </mark>
          )
          : <span key={idx}>{p}</span>
      )}
    </span>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00'
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  const hours = Math.floor(m / 60)
  const mins = m % 60
  if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(sec)}`
  return `${pad(mins)}:${pad(sec)}`
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '00:00'
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}

function sentimentColor(score: number): string {
  if (score > 0.3) return 'var(--accent-emerald)'
  if (score < -0.3) return 'var(--accent-danger)'
  return 'var(--accent-warning)'
}

function sentimentEmoji(label: string): string {
  if (label === 'Very Positive') return '😊'
  if (label === 'Positive') return '🙂'
  if (label === 'Negative') return '😕'
  if (label === 'Very Negative') return '😟'
  return '😐'
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WatchClient({ episodeId }: { episodeId: string }) {
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [captions, setCaptions] = useState<{ start: number; end: number; text: string }[]>([])
  const [segmentUI, setSegmentUI] = useState<
    { id: number; timestamp: string; topic: string; summary: string; keywords: string[]; start: number; end: number }[]
  >([])
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined)
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined)
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [liveCaptions, setLiveCaptions] = useState<{ start: number; end: number; text: string }[]>([])
  const [sidebarTab, setSidebarTab] = useState<'analysis' | 'search'>('analysis')

  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [kwQuery, setKwQuery] = useState('')
  const [highlightedKeyword, setHighlightedKeyword] = useState<string | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  // Transcript expand state — which segment is showing full text
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<number | null>(null)
  // Prefill for Analysis chat — set when user clicks "Send to Analysis"
  const [analysisPrefill, setAnalysisPrefill] = useState<string>('')
  const [analysisPrefillKey, setAnalysisPrefillKey] = useState<number>(0)

  const videoRef = useRef<VideoPlayerHandle>(null)
  const activeSegmentRef = useRef<HTMLButtonElement | null>(null)

  // ── Preconnect to backend for faster media loading ────────────────────────
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = BACKEND_URL
    document.head.appendChild(link)
    return () => { link.remove() }
  }, [])

  // ── Set video src IMMEDIATELY, before episode data arrives ────────────────
  // The video filename always follows {episodeId}.mp4 in this project. Setting
  // the src on mount decouples video loading from the episode-data API fetch,
  // so the <video> element starts streaming in parallel with the API call
  // instead of waiting for it to complete. The getEpisode() effect below will
  // override this with the authoritative URL from the API, or clear it (set to
  // undefined → falls through to audio player) for audio-only episodes.
  useEffect(() => {
    setVideoSrc(`${BACKEND_URL}/media/video/${episodeId}.mp4`)
  }, [episodeId])

  // ── Load episode ──────────────────────────────────────────────────────────
  // Phase 1: fetch episode data immediately — renders segments/summary/media.
  // Phase 2: fetch fine-grained transcript in the background after render,
  //          then upgrade captions without blocking the initial paint.
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    getEpisode(episodeId)
      .then((ep) => {
        if (!mounted) return
        setEpisode(ep)

        // Derive coarse captions from segments immediately so the player
        // has something to show while the transcript loads in the background.
        setCaptions(
          (ep.segments || []).map((s: EpisodeSegment) => ({
            start: Number(s.start_time ?? 0),
            end: Number(s.end_time ?? 0),
            text: s.text ?? (s.words?.map((w) => w.word).join(' ') ?? ''),
          }))
        )

        const segUI = (ep.segments || []).map((s, idx) => ({
          id: s.segment_id ?? idx + 1,
          timestamp: formatTime(Number(s.start_time ?? 0)),
          topic: s.topic ?? '',
          summary: s.summary ?? '',
          keywords: s.keywords ?? [],
          start: Number(s.start_time ?? 0),
          end: Number(s.end_time ?? 0),
        }))
        setSegmentUI(segUI)
        setActiveSegmentId(segUI[0]?.id ?? null)

        let vsrc: string | undefined
        if ((ep.video_url ?? '').length > 0) {
          const filename = ep.video_url!.split('/').pop() || ''
          vsrc = filename ? getVideoUrl(filename) : ep.video_url
        }
        let asrc: string | undefined
        if ((ep.audio_url ?? '').length > 0) {
          const filename = ep.audio_url!.split('/').pop() || ''
          asrc = filename ? getAudioUrl(filename) : ep.audio_url
        }
        setVideoSrc(vsrc)
        setAudioSrc(asrc)
        setLoading(false)

        // Phase 2: upgrade to fine-grained Whisper transcript in background.
        // Runs after the episode is already rendered — doesn't block anything.
        getTranscript(episodeId)
          .then((transcript) => {
            if (!mounted || !transcript || transcript.length === 0) return
            setCaptions(
              transcript.map((c) => ({
                start: Number(c.start),
                end: Number(c.end),
                text: c.text.trim(),
              }))
            )
          })
          .catch(() => {
            // 404 or network error — coarse captions from segments are already set, no-op
          })
      })
      .catch((err) => {
        if (!mounted) return
        setError(err?.message ?? 'Failed to load episode')
        setLoading(false)
      })
    return () => { mounted = false }
  }, [episodeId])

  // ── Track active segment from currentTime ────────────────────────────────
  useEffect(() => {
    if (!segmentUI.length) { setActiveSegmentId(null); return }
    const active = segmentUI.find((s) => currentTime >= s.start && currentTime <= s.end)
    if (active && active.id !== activeSegmentId) {
      setActiveSegmentId(active.id)
    }
  }, [currentTime, segmentUI, activeSegmentId])

  // ── Auto-scroll active segment into view ─────────────────────────────────
  useEffect(() => {
    if (activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSegmentId])

  // ── Computed values ───────────────────────────────────────────────────────
  const overallSentiment = useMemo(() => {
    if (!episode?.segments?.length) return 0
    return episode.segments.reduce((a, s) => a + (s.sentiment?.compound ?? 0), 0) / episode.segments.length
  }, [episode])

  const sentimentLabel = useMemo(() => {
    if (overallSentiment > 0.5) return 'Very Positive'
    if (overallSentiment > 0.0) return 'Positive'
    if (overallSentiment < -0.5) return 'Very Negative'
    if (overallSentiment < 0) return 'Negative'
    return 'Neutral'
  }, [overallSentiment])

  const durationStr = useMemo(() => formatDuration(episode?.duration), [episode?.duration])

  const overallSummary = useMemo(() => {
    if (episode?.overall_summary) return episode.overall_summary
    return segmentUI.map((s) => s.summary).filter(Boolean).slice(0, 6).join(' ')
  }, [segmentUI, episode])

  const overallKeywords = useMemo(() => {
    if (episode?.overall_keywords?.length) return episode.overall_keywords.slice(0, 12)
    const counts = new Map<string, number>()
    segmentUI.forEach((s) =>
      s.keywords.forEach((kw) => {
        const key = kw.toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
      })
    )
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([kw]) => kw)
  }, [segmentUI, episode])

  const mergedCaptions = useMemo(() => {
    if (liveCaptions.length === 0) return captions
    return [...captions, ...liveCaptions]
  }, [captions, liveCaptions])

  const segmentMarkers: SegmentMarker[] = useMemo(() =>
    segmentUI.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      keyword: s.topic || s.keywords?.[0] || s.summary?.slice(0, 20) || `Seg ${s.id}`,
    })),
    [segmentUI]
  )

  const totalDuration = episode?.duration ?? segmentUI[segmentUI.length - 1]?.end ?? 1

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSeek = useCallback((seg: typeof segmentUI[0]) => {
    setSeekTo(seg.start)
    setActiveSegmentId(seg.id)
  }, [])

  const handleSegmentClick = useCallback((segmentId: number) => {
    const seg = segmentUI.find((s) => s.id === segmentId)
    if (seg) handleSeek(seg)
  }, [segmentUI, handleSeek])

  const handleSearch = useCallback(async (q: string) => {
    const query = q.trim()
    if (!query) return
    setSearchQuery(query)
    setSearchLoading(true)
    try {
      const hits = await semanticSearch(query, 12, episodeId)
      setSearchResults(hits)
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [episodeId])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (e.code) {
        case 'Space': e.preventDefault(); videoRef.current?.togglePlay(); break
        case 'ArrowLeft': e.preventDefault(); videoRef.current?.seekRelative(-10); break
        case 'ArrowRight': e.preventDefault(); videoRef.current?.seekRelative(10); break
        case 'KeyF': e.preventDefault(); videoRef.current?.toggleFullscreen(); break
        case 'KeyM': e.preventDefault(); videoRef.current?.toggleMute(); break
        default:
          if (e.code.startsWith('Digit')) {
            const n = parseInt(e.code.replace('Digit', ''), 10)
            if (n >= 1 && n <= segmentUI.length && n <= 9) handleSeek(segmentUI[n - 1])
          }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [segmentUI, handleSeek])

  // ── Deep-link to segment from URL hash ───────────────────────────────────
  useEffect(() => {
    if (!segmentUI.length) return
    const hash = window.location.hash
    if (!hash.startsWith('#segment-')) return
    const id = parseInt(hash.replace('#segment-', ''), 10)
    if (isNaN(id)) return
    const seg = segmentUI.find((s) => s.id === id)
    if (seg) setTimeout(() => handleSeek(seg), 300)
  }, [segmentUI, handleSeek])

  // ── Live captions WebSocket ───────────────────────────────────────────────
  // Only connect once the episode has loaded and media is available.
  // Opening it on mount wastes bandwidth and competes with the episode fetch.
  useEffect(() => {
    if (loading || (!videoSrc && !audioSrc)) return
    const ws = connectCaptionsWebSocket(episodeId, (data) => {
      setLiveCaptions((prev) => [...prev, { start: data.start, end: data.end, text: data.text }])
    })
    return () => ws.close()
  }, [episodeId, loading, videoSrc, audioSrc])

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-8 text-center" style={{ color: 'var(--accent-danger)' }}>
        {error}
      </div>
    )
  }

  const isSummarizing = loading || (!overallSummary && segmentUI.length > 0)
  const SUMMARY_PREVIEW_CHARS = 220

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold">
            Episode:{' '}
            <span className="text-gradient font-mono text-base">{episode?.episode_id ?? episodeId}</span>
          </h1>
          {/* Compact stats strip */}
          {!loading && episode && (
            <div className="flex items-center gap-4 mt-1.5">
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                ⏱ {durationStr}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ◫ {episode.segments?.length ?? 0} segments
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: sentimentColor(overallSentiment) }}
              >
                {sentimentEmoji(sentimentLabel)} {sentimentLabel}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {loading ? (
            <span className="badge animate-pulse-glow">Processing</span>
          ) : (
            <span className="badge badge-emerald animate-fade-in">
              {episode ? 'Ready' : 'Unavailable'}
            </span>
          )}
        </div>
      </div>

      {/* ── Main layout: video column + sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.6fr_1fr] gap-6">
        {/* ── Left column: video + segments panel ── */}
        <div className="space-y-5">
          {videoSrc ? (
            <div className="animate-fade-in-up">
              <VideoPlayer
                ref={videoRef}
                src={videoSrc}
                captions={mergedCaptions}
                segments={segmentMarkers}
                duration={totalDuration}
                activeSegmentId={activeSegmentId}
                onTimeUpdate={setCurrentTime}
                onSegmentClick={handleSegmentClick}
                seekTime={seekTo}
              />
            </div>
          ) : audioSrc ? (
            <div
              className="rounded-xl overflow-hidden shadow-lg animate-fade-in-up"
              style={{ background: 'var(--bg-secondary)', padding: 12 }}
            >
              <audio controls src={audioSrc} style={{ width: '100%' }} />
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden shadow-lg animate-fade-in-up"
              style={{ padding: 48, textAlign: 'center', background: 'var(--bg-secondary)' }}
            >
              <div>No media available for this episode yet.</div>
            </div>
          )}

          {/* ── Segments panel (below video) ── */}
          <div className="card animate-fade-in-up stagger-2">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Segments
                <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
                  ({segmentUI.length})
                </span>
              </h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Click to jump · keyboard 1–9
              </span>
            </div>
            <div className="px-3 pb-4">
              <div className="space-y-1.5 max-h-[340px] overflow-auto scrollbar-thin pr-1">
                {segmentUI.length === 0 && !loading ? (
                  <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    <div className="text-2xl mb-2">📝</div>
                    <div className="text-sm">No segments yet</div>
                  </div>
                ) : (
                  segmentUI.map((seg, idx) => {
                    const isActive = seg.id === activeSegmentId
                    const isExpanded = expandedTranscriptId === seg.id
                    // Full text lives in the episode segments array
                    const fullText = episode?.segments?.find(s => s.segment_id === seg.id)?.text ?? ''
                    return (
                      <div
                        key={seg.id}
                        className={`rounded-lg animate-fade-in-up ${isActive ? 'active' : ''}`}
                        style={{
                          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                          border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          animationDelay: `${Math.min(idx * 0.03, 0.35)}s`,
                          overflow: 'hidden',
                        }}
                      >
                        {/* ── Main clickable row ── */}
                        <button
                          ref={isActive ? activeSegmentRef : null}
                          onClick={() => handleSeek(seg)}
                          className="w-full text-left px-3 py-2.5 segment-card"
                          style={{ background: 'transparent', border: 'none' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isActive && (
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: 'var(--accent-emerald)', boxShadow: '0 0 6px var(--accent-emerald)' }}
                                />
                              )}
                              {seg.topic && (
                                <span
                                  className="text-xs font-semibold truncate max-w-[180px]"
                                  style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                >
                                  {seg.topic}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                              {seg.timestamp}
                            </span>
                          </div>
                          {seg.summary && (
                            <div
                              className="text-xs mt-1 line-clamp-3"
                              style={{
                                color: 'var(--text-muted)',
                                lineHeight: 1.5,
                                whiteSpace: 'pre-line',
                              }}
                            >
                              {highlightedKeyword
                                ? highlightText(seg.summary, highlightedKeyword)
                                : seg.summary.replace(/^\*\*(Topic|Key Points|References|Overview|Takeaway)\*\*/gm, '$1:')}
                            </div>
                          )}
                          {seg.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {seg.keywords.slice(0, 4).map((kw, i) => (
                                <span
                                  key={i}
                                  className="badge badge-primary keyword-tag"
                                  style={{
                                    fontSize: '0.6rem',
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    opacity: highlightedKeyword && highlightedKeyword !== kw ? 0.35 : 1,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setHighlightedKeyword(highlightedKeyword === kw ? null : kw)
                                  }}
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>

                        {/* ── Bottom action bar ── */}
                        <div
                          className="flex items-center justify-between px-3 pb-2"
                          style={{ gap: 6 }}
                        >
                          {/* Transcript toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedTranscriptId(isExpanded ? null : seg.id)
                            }}
                            className="text-xs flex items-center gap-1 transition-colors"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: isExpanded ? 'var(--accent-primary)' : 'var(--text-muted)',
                              padding: '2px 0',
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                            {isExpanded ? 'Hide transcript' : 'Full transcript'}
                          </button>

                          {/* Send to Analysis */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const q = `Summarize and explain the key points from this segment (${seg.timestamp}): "${seg.topic}"`
                              setAnalysisPrefill(q)
                              setAnalysisPrefillKey(k => k + 1)
                              setSidebarTab('analysis')
                            }}
                            className="text-xs flex items-center gap-1 px-2 py-1 rounded transition-all"
                            style={{
                              background: 'rgba(46,91,255,0.1)',
                              border: '1px solid rgba(46,91,255,0.2)',
                              color: 'var(--accent-primary)',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                              <path d="M10 2L2 10l8 8 8-8-8-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                            </svg>
                            Ask Analysis
                          </button>
                        </div>

                        {/* ── Full transcript panel ── */}
                        {isExpanded && fullText && (
                          <div
                            className="mx-3 mb-3 rounded-lg p-3 animate-fade-in"
                            style={{
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            <div
                              className="text-xs leading-relaxed mb-2"
                              style={{ color: 'var(--text-secondary)', maxHeight: 180, overflowY: 'auto' }}
                            >
                              {fullText}
                            </div>
                            {seg.summary && (
                              <div
                                className="text-xs mb-2"
                                style={{
                                  color: 'var(--text-secondary)',
                                  lineHeight: 1.5,
                                  whiteSpace: 'pre-line',
                                }}
                              >
                                {seg.summary}
                              </div>
                            )}
                            {seg.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {seg.keywords.map((kw, i) => (
                                  <span
                                    key={i}
                                    className="badge"
                                    style={{
                                      fontSize: '0.6rem',
                                      padding: '2px 7px',
                                      background: 'rgba(46,91,255,0.15)',
                                      color: 'var(--accent-primary)',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Send full transcript text to analysis */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const q = `Based on this transcript segment from ${seg.timestamp}: "${fullText.slice(0, 600)}${fullText.length > 600 ? '…' : ''}" — what are the key insights and main argument being made?`
                                setAnalysisPrefill(q)
                                setAnalysisPrefillKey(k => k + 1)
                                setSidebarTab('analysis')
                                setExpandedTranscriptId(null)
                              }}
                              className="w-full text-xs py-1.5 rounded font-semibold transition-all"
                              style={{
                                background: 'var(--accent-primary)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              ◇ Analyse this transcript
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">

          <div className="card animate-fade-in-up" style={{ overflow: 'hidden' }}>
            <div
              className="flex"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              {([
                { key: 'analysis', label: 'Chat with Video', icon: '◇' },
                { key: 'search',   label: 'Keyword Search', icon: '#' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSidebarTab(tab.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all"
                  style={{
                    background: sidebarTab === tab.key ? 'var(--bg-tertiary)' : 'transparent',
                    color: sidebarTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderBottom: sidebarTab === tab.key
                      ? '2px solid var(--accent-primary)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                    letterSpacing: '0.03em',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Analysis tab ── */}
            {sidebarTab === 'analysis' && (
              <AnalysisChat
                episodeId={episodeId}
                onSeek={(time) => {
                  setSeekTo(time)
                  const seg = segmentUI.find((s) => time >= s.start && time <= s.end)
                  if (seg) setActiveSegmentId(seg.id)
                }}
                embedded
                prefillQuestion={analysisPrefill}
                prefillKey={analysisPrefillKey}
              />
            )}

            {/* ── Keyword Search tab ── */}
            {sidebarTab === 'search' && (() => {
              // Client-side keyword search over segments — instant, no backend needed
              const q = kwQuery.trim().toLowerCase()
              const kwMatches = q.length < 1 ? [] : segmentUI.filter((seg) => {
                const inTopic = seg.topic.toLowerCase().includes(q)
                const inSummary = seg.summary.toLowerCase().includes(q)
                const inKeywords = seg.keywords.some(k => k.toLowerCase().includes(q))
                const inText = (episode?.segments?.find(s => s.segment_id === seg.id)?.text ?? '').toLowerCase().includes(q)
                return inTopic || inSummary || inKeywords || inText
              })
              // Top keywords from all segments for suggestion chips
              const topKws = overallKeywords.slice(0, 8)

              return (
                <div className="px-4 pt-3 pb-4 animate-fade-in">
                  {/* Description */}
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Search by keyword across all segments — results show which segment contains it and jump to that moment.
                  </p>

                  {/* Search input */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={kwQuery}
                      onChange={e => setKwQuery(e.target.value)}
                      placeholder="Type a keyword…"
                      className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {kwQuery && (
                      <button
                        onClick={() => setKwQuery('')}
                        className="text-xs px-2 rounded-lg"
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Suggestion chips from episode keywords */}
                  {!kwQuery && topKws.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                        Suggestions
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {topKws.map((kw) => (
                          <button
                            key={kw}
                            onClick={() => setKwQuery(kw)}
                            className="text-xs px-2.5 py-1 rounded-full transition-all"
                            style={{
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Results count */}
                  {q.length > 0 && (
                    <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      {kwMatches.length === 0
                        ? `No segments contain "${kwQuery}"`
                        : `${kwMatches.length} segment${kwMatches.length > 1 ? 's' : ''} match "${kwQuery}" · click to jump`}
                    </div>
                  )}

                  {/* Segment results */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-thin pr-1">
                    {kwMatches.map((seg, idx) => {
                      const fullText = episode?.segments?.find(s => s.segment_id === seg.id)?.text ?? ''
                      // Find the sentence in fullText that contains the query
                      const sentences = fullText.split(/(?<=[.!?])\s+/)
                      const matchSentence = sentences.find(s => s.toLowerCase().includes(q)) ?? seg.summary
                      const matchedKws = seg.keywords.filter(k => k.toLowerCase().includes(q))

                      return (
                        <button
                          key={seg.id}
                          onClick={() => {
                            setSeekTo(seg.start)
                            setActiveSegmentId(seg.id)
                          }}
                          className="w-full text-left rounded-lg p-3 animate-fade-in-up"
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderLeft: '3px solid var(--accent-primary)',
                            cursor: 'pointer',
                            animationDelay: `${idx * 0.04}s`,
                          }}
                        >
                          {/* Segment number + topic + timestamp */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(46,91,255,0.12)', color: 'var(--accent-primary)' }}
                              >
                                #{seg.id}
                              </span>
                              {seg.topic && (
                                <span className="text-xs font-semibold truncate max-w-[130px]" style={{ color: 'var(--text-primary)' }}>
                                  {seg.topic}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>
                              ▶ {seg.timestamp}
                            </span>
                          </div>

                          {/* Matching sentence with keyword highlighted */}
                          {matchSentence && (
                            <div className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-secondary)' }}>
                              {highlightText(matchSentence.slice(0, 140), kwQuery)}
                              {matchSentence.length > 140 && '…'}
                            </div>
                          )}

                          {/* Matched keywords */}
                          {matchedKws.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {matchedKws.slice(0, 4).map((kw, ki) => (
                                <span
                                  key={ki}
                                  className="badge"
                                  style={{
                                    fontSize: '0.55rem',
                                    padding: '1px 6px',
                                    background: 'rgba(46,91,255,0.18)',
                                    color: 'var(--accent-primary)',
                                    borderRadius: 4,
                                  }}
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Video Summary — always visible below tabs ── */}
          <div className="summary-section animate-fade-in-up stagger-1">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Video Summary
              </h3>
              {isSummarizing && <div className="summarizing-spinner" />}
            </div>
            <div className="px-5 pb-4">
              {isSummarizing ? (
                <div className="space-y-2">
                  <div className="skeleton h-3.5 w-full" />
                  <div className="skeleton h-3.5 w-5/6" />
                  <div className="skeleton h-3.5 w-4/6" />
                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="skeleton h-5 w-14 rounded-full" />
                    <div className="skeleton h-5 w-18 rounded-full" />
                    <div className="skeleton h-5 w-12 rounded-full" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 animate-fade-in">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                    {summaryExpanded || overallSummary.length <= SUMMARY_PREVIEW_CHARS
                      ? overallSummary
                      : `${overallSummary.slice(0, SUMMARY_PREVIEW_CHARS)}…`}
                  </p>
                  {overallSummary.length > SUMMARY_PREVIEW_CHARS && (
                    <button
                      onClick={() => setSummaryExpanded((v) => !v)}
                      className="text-xs font-medium transition-colors"
                      style={{ color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {summaryExpanded ? '↑ Show less' : '↓ Show more'}
                    </button>
                  )}
                  {overallKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {overallKeywords.map((kw, i) => (
                        <span
                          key={i}
                          className="badge badge-primary keyword-tag"
                          style={{
                            fontSize: '0.65rem',
                            animationDelay: `${i * 0.04}s`,
                            cursor: 'pointer',
                            opacity: highlightedKeyword && highlightedKeyword !== kw ? 0.4 : 1,
                          }}
                          onClick={() => setHighlightedKeyword(highlightedKeyword === kw ? null : kw)}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}
