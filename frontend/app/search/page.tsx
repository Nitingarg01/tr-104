"use client"

import React, { useCallback, useState } from 'react'
import Link from 'next/link'
import SearchBar from '../../components/SearchBar'
import { semanticSearch, askQuestion, SemanticSearchResult, AskResponse, Citation } from '../../lib/api'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlight(text: string, query: string) {
  if (!query) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'))
  return (
    <span>
      {parts.map((p, idx) => (
        p.toLowerCase() === query.toLowerCase() ? (
          <mark key={idx} style={{ background: 'var(--accent-primary)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>{p}</mark>
        ) : (
          <span key={idx}>{p}</span>
        )
      ))}
    </span>
  )
}

type SearchMode = 'semantic' | 'ask'

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [noResults, setNoResults] = useState(false)

  const [askQuestionText, setAskQuestionText] = useState('')
  const [askAnswer, setAskAnswer] = useState<AskResponse | null>(null)
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    const queryText = q.trim()
    setQuery(queryText)
    if (!queryText) return
    setLoading(true)
    setNoResults(false)
    try {
      const hits = await semanticSearch(queryText, 25)
      if (hits.length === 0) {
        setNoResults(true)
        setResults([])
      } else {
        setResults(hits)
        setNoResults(false)
      }
    } catch (e) {
      console.error('Search failed', e)
      setNoResults(true)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const doAsk = useCallback(async () => {
    const q = askQuestionText.trim()
    if (!q) return
    setAskLoading(true)
    setAskError(null)
    setAskAnswer(null)
    try {
      const response = await askQuestion(q)
      setAskAnswer(response)
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Ask failed')
    } finally {
      setAskLoading(false)
    }
  }, [askQuestionText])

  const ResultItem = ({ hit }: { hit: SemanticSearchResult }) => {
    const segText = hit.text
    const time = formatTime(hit.start_time)
    return (
      <Link href={`/watch/${hit.episode_id}#segment-${hit.segment_id}`} className="block group">
        <div className="p-4 rounded-lg mb-3" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Episode {hit.episode_id} &bull; Segment {hit.segment_id}
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--accent-primary)' }}>{time}</span>
          </div>
          <div className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            {highlight(segText, query)}
          </div>
          {hit.summary && (
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{hit.summary}</div>
          )}
          {hit.keywords && hit.keywords.length > 0 && (
            <div className="text-xs mt-1 flex flex-wrap gap-1" style={{ color: 'var(--text-muted)' }}>
              {hit.keywords.map((kw, i) => (
                <span key={i} className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{kw}</span>
              ))}
            </div>
          )}
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-gradient">Search</span> &amp; Ask
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Semantic search across transcripts, or ask questions about your content
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-4">
        <button
          className={mode === 'semantic' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setMode('semantic')}
        >Semantic Search</button>
        <button
          className={mode === 'ask' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setMode('ask')}
        >Ask Questions</button>
      </div>

      {mode === 'semantic' && (
        <>
          <div className="max-w-3xl mx-auto">
            <SearchBar onSearch={(q) => doSearch(q)} loading={loading} />
          </div>

          <div className="max-w-4xl mx-auto px-4 py-2">
            {loading && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Searching...</div>}
            {!loading && noResults && query && (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No results for &quot;{query}&quot;.</div>
            )}
            {!loading && results.length > 0 && (
              <div className="space-y-3">
                {results.map((hit, idx) => (
                  <ResultItem key={`${hit.episode_id}-${hit.segment_id}`} hit={hit} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'ask' && (
        <div className="max-w-3xl mx-auto px-4">
          <div className="space-y-3">
            <textarea
              className="input-field"
              rows={3}
              value={askQuestionText}
              onChange={(e) => setAskQuestionText(e.target.value)}
              placeholder="Ask anything about your content... e.g. 'What topics were discussed about machine learning?' or 'Summarize the key arguments in episode 3'"
            />
            <button className="btn-primary" onClick={doAsk} disabled={askLoading || !askQuestionText.trim()}>
              {askLoading ? 'Thinking...' : 'Ask'}
            </button>
          </div>

          {askError && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-danger)' }}>
              {askError}
            </div>
          )}

          {askAnswer && (
            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {askAnswer.answer}
                </div>
              </div>

              {askAnswer.citations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Sources ({askAnswer.citations.length})
                  </h3>
                  <div className="space-y-2">
                    {askAnswer.citations.map((c, i) => (
                      <Link
                        key={i}
                        href={`/watch/${c.episode_id}#segment-${c.segment_id}`}
                        className="block rounded-lg p-3"
                        style={{ background: 'var(--bg-tertiary)' }}
                      >
                        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span>Episode {c.episode_id} &bull; Segment {c.segment_id}</span>
                          <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                            {formatTime(c.start_time)} &ndash; {formatTime(c.end_time)}
                          </span>
                        </div>
                        <div className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                          {c.text.slice(0, 200)}&hellip;
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          Relevance: {Math.round(c.relevance_score * 100)}%
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
