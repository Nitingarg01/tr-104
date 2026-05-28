"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { semanticSearch, SemanticSearchResult } from '../lib/api'

type SegmentData = {
  id: number
  timestamp: string
  topic: string
  summary: string
  keywords: string[]
  start: number
  end: number
}

type Props = {
  segment: SegmentData
  episodeId: string
  sentimentLabel?: string
  onClose: () => void
  onSeek: (segment: SegmentData) => void
}

export default function SegmentModal({ segment, episodeId, sentimentLabel, onClose, onSeek }: Props) {
  const [related, setRelated] = useState<SemanticSearchResult[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  useEffect(() => {
    const query = segment.keywords?.[0] || segment.summary?.slice(0, 60) || ''
    if (!query) return
    setRelatedLoading(true)
    semanticSearch(query, 5)
      .then((results) => {
        setRelated(results.filter((r) => !(r.episode_id === episodeId && r.segment_id === segment.id)))
      })
      .catch(() => {})
      .finally(() => setRelatedLoading(false))
  }, [segment, episodeId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Segment Detail</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {segment.topic && (
            <div className="modal-section">
              <span className="modal-label">Topic</span>
              <p className="modal-summary" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{segment.topic}</p>
            </div>
          )}
          <div className="modal-section">
            <span className="modal-label">Summary</span>
            <p className="modal-summary" style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{segment.summary || 'No summary available.'}</p>
          </div>

          {segment.keywords.length > 0 && (
            <div className="modal-section">
              <span className="modal-label">Keywords</span>
              <div className="modal-keywords">
                {segment.keywords.map((kw, i) => (
                  <span key={i} className="modal-keyword">{kw}</span>
                ))}
              </div>
            </div>
          )}

          {sentimentLabel && (
            <div className="modal-section">
              <span className="modal-label">Sentiment</span>
              <span className="modal-sentiment">{sentimentLabel}</span>
            </div>
          )}

          <button className="modal-seek-btn" onClick={() => onSeek(segment)}>
            &#9654; Seek to section
          </button>

          <div className="modal-divider" />

          <div className="modal-section">
            <span className="modal-label">Related Segments</span>
            {relatedLoading ? (
              <div className="modal-related-loading">Searching...</div>
            ) : related.length > 0 ? (
              <div className="modal-related-list">
                {related.slice(0, 5).map((r, i) => (
                  <div key={i} className="modal-related-item">
                    <span className="modal-related-title">
                      Episode {r.episode_id} &middot; {r.summary?.slice(0, 50) || r.text?.slice(0, 50)}&hellip;
                    </span>
                    <span className="modal-related-score">{Math.round((r.score || 0) * 100)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="modal-related-empty">No related segments found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
