"use client"

import React, { useEffect, useState } from 'react'
import Card from '../../components/ui/Card'
import Link from 'next/link'
import { listEpisodes, EpisodeListItem } from '../../lib/api'

// Helper to format duration from seconds to H:MM:SS or M:SS
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export default function LibraryPage() {
  const [episodes, setEpisodes] = useState<EpisodeListItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listEpisodes()
      .then((list) => {
        if (mounted) {
          setEpisodes(list)
          setError(null)
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err?.message ?? 'Failed to load episodes')
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold mb-2">
          Your <span className="text-gradient">Library</span>
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          All processed episodes with captions, segments, and summaries
        </p>
      </div>

      <div className="flex items-center justify-between">
        {loading ? (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading…
          </span>
        ) : (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {episodes.length} episodes
          </span>
        )}
        <Link href="/upload" className="btn-primary text-sm">
          + New Episode
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-6" aria-label="loading">
          <div className="w-6 h-6 border-4 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && episodes.length === 0 && (
        <div className="flex justify-center">
          <Card className="w-full max-w-md p-6 text-center">
            <div className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              No episodes yet
            </div>
            <Link href="/upload" className="btn-primary mt-2 inline-block">
              Upload your first video
            </Link>
          </Card>
        </div>
      )}

      {!loading && episodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodes.map((ep) => (
            <Card key={ep.episode_id} className="cursor-pointer hover:shadow-lg transition-shadow">
              <Link href={`/watch/${ep.episode_id}`}>
                <div className="aspect-video rounded-lg mb-3 flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
                  <span className="text-3xl">🎬</span>
                </div>
                <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                  {ep.episode_id}
                </h3>
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>{new Date(ep.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>⏱ {formatDuration(ep.duration)}</span>
                  <span>📑 {ep.segment_count} segments</span>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
