"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { askQuestion, Citation } from '../lib/api'

interface AnalysisChatProps {
  episodeId: string
  onSeek?: (time: number) => void
  embedded?: boolean
  prefillQuestion?: string   // when set, auto-submits this question immediately
  prefillKey?: number        // increment to re-trigger even if same question text
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  timestamp: Date
}

// ── Minimal markdown renderer ─────────────────────────────────────────────
// Handles: **bold**, numbered lists, bullet lists, plain paragraphs.
// No external dependency needed.
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ol' | 'ul' | null = null
  let key = 0

  const flushList = () => {
    if (!listItems.length) return
    if (listType === 'ol') {
      nodes.push(
        <ol key={key++} style={{ paddingLeft: 18, margin: '6px 0', listStyleType: 'decimal' }}>
          {listItems}
        </ol>
      )
    } else {
      nodes.push(
        <ul key={key++} style={{ paddingLeft: 18, margin: '6px 0', listStyleType: 'disc' }}>
          {listItems}
        </ul>
      )
    }
    listItems = []
    listType = null
  }

  const inlineBold = (s: string): React.ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*)/)
    return (
      <>
        {parts.map((p, i) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
            : <span key={i}>{p}</span>
        )}
      </>
    )
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Numbered list: "1. " or "2. " etc.
    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol' }
      listItems.push(
        <li key={key++} style={{ marginBottom: 3, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {inlineBold(olMatch[2])}
        </li>
      )
      continue
    }

    // Bullet list: "- " or "• "
    const ulMatch = line.match(/^[-•]\s+(.+)/)
    if (ulMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul' }
      listItems.push(
        <li key={key++} style={{ marginBottom: 3, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {inlineBold(ulMatch[1])}
        </li>
      )
      continue
    }

    // Empty line — flush list, add spacing
    if (!line.trim()) {
      flushList()
      nodes.push(<div key={key++} style={{ height: 6 }} />)
      continue
    }

    // Plain paragraph
    flushList()
    nodes.push(
      <p key={key++} style={{ margin: '4px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {inlineBold(line)}
      </p>
    )
  }

  flushList()
  return nodes
}

function formatTime(s: number): string {
  const t = Math.max(0, Math.floor(s))
  const m = Math.floor(t / 60)
  const sec = t % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────
export default function AnalysisChat({ episodeId, onSeek, embedded = false, prefillQuestion, prefillKey }: AnalysisChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-submit when a segment is sent from the segment panel
  useEffect(() => {
    if (!prefillQuestion) return
    setInput(prefillQuestion)
    // Small delay so the tab switch animation completes before submitting
    const t = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: prefillQuestion, timestamp: new Date() },
      ])
      setInput('')
      setIsLoading(true)
      askQuestion(prefillQuestion, 5, [episodeId])
        .then((response) => {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: response.answer,
              citations: response.citations,
              timestamp: new Date(),
            },
          ])
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `⚠️ ${msg.startsWith('HTTP') ? msg : 'Could not reach the analysis service — make sure the backend is running on port 8000.'}`,
              timestamp: new Date(),
            },
          ])
        })
        .finally(() => setIsLoading(false))
    }, 120)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey])

  const handleSubmit = useCallback(async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (!question || isLoading) return

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: question, timestamp: new Date() },
    ])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)

    try {
      const response = await askQuestion(question, 5, [episodeId])
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.answer,
          citations: response.citations,
          timestamp: new Date(),
        },
      ])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ ${msg.startsWith('HTTP') ? msg : 'Could not reach the analysis service — make sure the backend is running on port 8000.'}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, episodeId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const SUGGESTIONS = [
    'What are the main topics?',
    'Summarize key arguments',
    'Did they mention any numbers?',
    'Explain the conclusion',
  ]

  return (
    <div className={embedded ? '' : 'card animate-fade-in-up'} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header — only shown when not embedded in a tab */}
      {!embedded && (
        <div className="px-5 pt-4 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: 'rgba(46,91,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L2 10l8 8 8-8-8-8z" stroke="var(--accent-primary)" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Chat with Video</h3>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>AI · RAG</span>
        </div>
      )}

      {/* Messages */}
      <div
        className="px-4 py-3 space-y-3 overflow-y-auto scrollbar-thin"
        style={{ maxHeight: 340, minHeight: 80 }}
      >
        {messages.length === 0 && (
          <div className="py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <div className="text-2xl mb-2">💬</div>
            <div className="text-xs mb-3">Ask anything about this video's content</div>
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  className="text-xs px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in">
            {msg.role === 'user' ? (
              /* User bubble */
              <div
                className="ml-6 rounded-xl px-3 py-2"
                style={{
                  background: 'rgba(46,91,255,0.12)',
                  border: '1px solid rgba(46,91,255,0.2)',
                }}
              >
                <p className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {msg.content}
                </p>
              </div>
            ) : (
              /* Assistant bubble */
              <div
                className="mr-2 rounded-xl px-4 py-3"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {/* Structured answer */}
                <div className="text-sm" style={{ lineHeight: 1.6 }}>
                  {renderMarkdown(msg.content)}
                </div>

                {/* Citation chips — clickable timestamps */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2.5" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div
                      className="text-xs font-medium mb-2"
                      style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}
                    >
                      SOURCES
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.slice(0, 5).map((c, i) => (
                        <button
                          key={i}
                          onClick={() => onSeek?.(c.start_time)}
                          title={c.text.slice(0, 120)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 20,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--accent-primary)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: onSeek ? 'pointer' : 'default',
                            transition: 'background 150ms',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          {formatTime(c.start_time)}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            · {Math.round(c.relevance_score * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3 mt-1 px-2">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
                color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              VI
            </div>
            <div
              className="rounded-2xl px-4 py-2 text-sm max-w-[85%]"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderTopLeftRadius: 4,
              }}
            >
              <div className="flex gap-1.5 items-center h-5">
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0.15s' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your content…"
            className="w-full rounded-lg px-3 py-2.5 pr-14 text-sm resize-none focus:outline-none transition-all"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              minHeight: 44,
              maxHeight: 120,
              lineHeight: 1.5,
            }}
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute bottom-2 right-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: input.trim() && !isLoading ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: input.trim() && !isLoading ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            }}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}
