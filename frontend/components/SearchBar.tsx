"use client"

import React, { useState } from 'react'

type Props = {
  onSearch?: (query: string) => void
  loading?: boolean
  placeholder?: string
}

const DEFAULT_SUGGESTIONS = ['AI', 'Transcript', 'Semantic Search', 'WebSocket', 'Segmentation', 'Summary', 'Keywords']

export default function SearchBar({ onSearch, loading, placeholder = 'Search transcripts, topics, speakers...' }: Props) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const filteredSuggestions = query
    ? DEFAULT_SUGGESTIONS.filter((x) => x.toLowerCase().includes(query.toLowerCase()))
    : DEFAULT_SUGGESTIONS

  const handleSearch = () => {
    if (!query.trim()) return
    if (typeof onSearch === 'function') {
      onSearch(query)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              className="input-field w-full pr-10"
              placeholder={placeholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>
              ⌘K
            </div>
          </div>
          <button className="btn-primary" onClick={handleSearch} disabled={!query.trim() || loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            className="absolute z-10 w-full mt-2 rounded-lg p-2 shadow-xl"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
          >
            <div className="text-xs font-medium mb-1 px-2" style={{ color: 'var(--text-muted)' }}>Suggestions</div>
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { setQuery(s); setShowSuggestions(false) }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse text-sm" style={{ color: 'var(--text-muted)' }}>
            Searching across transcripts...
          </div>
        </div>
      )}
    </div>
  )
}
