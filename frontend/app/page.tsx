"use client"

import React, { useMemo } from 'react'
import UploadForm from '../components/UploadForm'
import Link from 'next/link'
import { listEpisodes, EpisodeListItem } from '../lib/api'
import { useSWR } from '../lib/swr'

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`
  return `${secs}s`
}

function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `${days}d ago`
  if (hrs > 0) return `${hrs}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'Just now'
}

// Mini stat card
function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: string
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1.5 animate-fade-in-up"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        minWidth: 0,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="text-lg" style={{ color: accent }}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: accent }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const { data: episodesData, loading } = useSWR(
    'episodes_list',
    listEpisodes,
    20_000  // 20s TTL — show stale data instantly, refresh if older
  )
  const episodes: EpisodeListItem[] = episodesData ?? []

  const totalDurationSecs = useMemo(
    () => episodes.reduce((sum, ep) => sum + (ep.duration ?? 0), 0),
    [episodes]
  )
  const totalSegments = useMemo(
    () => episodes.reduce((sum, ep) => sum + (ep.segment_count ?? 0), 0),
    [episodes]
  )
  const avgSegmentsPerEp = episodes.length
    ? Math.round(totalSegments / episodes.length)
    : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6 px-2">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Video Intelligence
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            AI-Powered Podcast &amp; Video Analysis
          </p>
        </div>
        <Link href="/upload" className="btn-primary text-sm">
          + New Analysis
        </Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up">
        <StatCard
          icon="🎬"
          label="Episodes"
          value={loading ? '—' : String(episodes.length)}
          sub={loading ? undefined : episodes.length === 0 ? 'Upload your first' : 'Processed'}
          accent="var(--accent-primary)"
        />
        <StatCard
          icon="⏱"
          label="Total Duration"
          value={loading ? '—' : formatDuration(totalDurationSecs)}
          sub={loading ? undefined : 'Audio analysed'}
          accent="var(--accent-secondary)"
        />
        <StatCard
          icon="◫"
          label="Segments"
          value={loading ? '—' : String(totalSegments)}
          sub={loading ? undefined : `~${avgSegmentsPerEp} per episode`}
          accent="var(--accent-emerald)"
        />
        <StatCard
          icon="🔍"
          label="Searchable"
          value={loading ? '—' : `${episodes.length}`}
          sub={loading ? undefined : 'Semantic index ready'}
          accent="var(--accent-warning)"
        />
      </div>

      {/* ── Upload + Recent episodes row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
        {/* Upload panel */}
        <div
          className="rounded-xl p-5 animate-fade-in-up stagger-1"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Upload &amp; Analyse
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Drop a video or paste a YouTube/podcast URL. Transcription, segmentation, and keyword
            extraction run automatically.
          </p>
          <UploadForm />
        </div>

        {/* Recent episodes */}
        <div className="animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Episodes
            </h2>
            <Link href="/library" className="text-xs" style={{ color: 'var(--accent-primary)' }}>
              View All →
            </Link>
          </div>

          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          )}

          {!loading && episodes.length === 0 && (
            <div
              className="rounded-xl p-8 text-center"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
              <div className="text-3xl mb-2">🎙️</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No episodes yet. Upload your first video to get started.
              </div>
            </div>
          )}

          {!loading && episodes.length > 0 && (
            <div className="space-y-2">
              {episodes.slice(0, 4).map((ep, idx) => {
                const segPct = Math.min((ep.segment_count / 20) * 100, 100)
                return (
                  <Link
                    key={ep.episode_id}
                    href={`/watch/${ep.episode_id}`}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-150 group"
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      animationDelay: `${idx * 0.04}s`,
                    }}
                  >
                    {/* Play icon */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-primary)' }}
                    >
                      ▶
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {ep.episode_id}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {formatDurationShort(ep.duration)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          · {ep.segment_count} seg
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          · {relativeTime(ep.updated_at)}
                        </span>
                      </div>
                      {/* Segment density bar */}
                      <div
                        className="mt-1.5 h-1 rounded-full overflow-hidden"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${segPct}%`,
                            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                          }}
                        />
                      </div>
                    </div>

                    <span className="badge badge-emerald text-xs flex-shrink-0">Ready</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
