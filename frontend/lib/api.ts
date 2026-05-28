export const BACKEND_URL: string =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL)) ||
  'http://localhost:8000'

const PROXY_PREFIX = '/api/proxy'

// Pipeline stage → cumulative progress percentage (matched to backend PipelineStage enum)
export const STAGE_PROGRESS: Record<string, number> = {
  queued: 5,
  preprocess: 15,
  transcribe: 60,
  tune: 70,
  segment: 80,
  keywords: 85,
  summarize: 90,
  sentiment: 95,
  enrich: 100,
  completed: 100,
}

export interface EpisodeSegment {
  segment_id: number
  start_time: number
  end_time: number
  text: string
  topic?: string
  summary?: string
  keywords?: string[]
  sentiment?: { compound: number; positive: number; neutral: number; negative: number }
  sentiment_score?: number
  embedding?: number[]
  words?: { word: string; start: number; end: number }[]
}

export interface Episode {
  episode_id: string
  duration: number
  segments: EpisodeSegment[]
  audio_url?: string
  video_url?: string
  media_type?: string
  overall_summary?: string
  overall_keywords?: string[]
}

export interface EpisodeListItem {
  episode_id: string
  duration: number
  segment_count: number
  updated_at: string
}

export interface EpisodeList {
  episodes: EpisodeListItem[]
}

export interface SemanticSearchResult {
  episode_id: string
  segment_id: number
  score: number
  start_time: number
  end_time: number
  text: string
  summary?: string
  keywords?: string[]
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[]
}

export interface Citation {
  episode_id: string
  segment_id: number
  start_time: number
  end_time: number
  text: string
  relevance_score: number
}

export interface AskResponse {
  answer: string
  citations: Citation[]
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed'
  stage?: string
  filename?: string
  episode_id?: string
  media_type?: string
  created_at?: string
  updated_at?: string
  logs?: string[]
  error?: string | null
  result?: Episode | null
  eta_seconds?: number | null
}

function proxied(path: string): string {
  if (!path.startsWith('/')) path = '/' + path
  return `${PROXY_PREFIX}${path}`
}

async function jsonFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = proxied(path)
  const resp = await fetch(url, init)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`)
  }
  const ct = resp.headers.get('Content-Type') || ''
  if (ct.includes('application/json')) {
    return resp.json() as T
  }
  const text = await resp.text()
  return (text as unknown) as T
}

export async function uploadFile(file: File): Promise<{ job_id: string }> {
  const form = new FormData()
  form.append('media', file)
  const data = await jsonFetch<{ job_id: string }>('/api/upload', {
    method: 'POST',
    body: form,
  })
  return data
}

export async function ingestUrl(url: string): Promise<{ job_id: string }> {
  const data = await jsonFetch<{ job_id: string }>('/api/ingest-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return data
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return jsonFetch<JobStatus>(`/api/status/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  })
}

export async function getJobs(): Promise<JobStatus[]> {
  return jsonFetch<JobStatus[]>('/api/jobs', { method: 'GET' })
}

export async function pollJobStatus(
  jobId: string,
  onProgress?: (status: JobStatus) => void
): Promise<JobStatus> {
  return new Promise<JobStatus>((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        onProgress?.(status)
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval)
          resolve(status)
        }
      } catch (err) {
        clearInterval(interval)
        reject(err)
      }
    }, 2000)
  })
}

export async function listEpisodes(): Promise<EpisodeListItem[]> {
  const data = await jsonFetch<EpisodeList>('/api/episodes', { method: 'GET' })
  if (Array.isArray((data as any).episodes)) {
    return (data as EpisodeList).episodes
  }
  const arr = (data as any) as EpisodeListItem[]
  return Array.isArray(arr) ? arr : []
}

export async function getEpisode(episodeId: string): Promise<Episode> {
  // next: revalidate lets Next.js cache this at the edge for 30s,
  // matching the backend's own Cache-Control: max-age=30 header.
  return jsonFetch<Episode>(`/api/episodes/${encodeURIComponent(episodeId)}`, {
    method: 'GET',
    // @ts-ignore — Next.js fetch extension
    next: { revalidate: 30 },
  })
}

export interface TranscriptChunk {
  text: string
  start: number
  end: number
}

/**
 * Fetch the raw Whisper transcript for an episode.
 * Returns fine-grained sentence-level chunks with precise start/end times —
 * ideal for live caption display synced to the video timeline.
 */
export async function getTranscript(episodeId: string): Promise<TranscriptChunk[]> {
  return jsonFetch<TranscriptChunk[]>(`/api/transcript/${encodeURIComponent(episodeId)}`, {
    method: 'GET',
  })
}

export async function askQuestion(question: string, topK = 5, episodes?: string[]): Promise<AskResponse> {
  return jsonFetch<AskResponse>('/search/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, top_k: topK, episodes }),
  })
}

export async function semanticSearch(query: string, limit = 10, episodeId?: string): Promise<SemanticSearchResult[]> {
  const data = await jsonFetch<SemanticSearchResponse>('/search/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit, ...(episodeId ? { episode_id: episodeId } : {}) }),
  })
  return data?.results ?? []
}

// Media files (video/audio) go DIRECTLY to the backend, bypassing the
// Next.js proxy. The proxy cannot handle HTTP Range requests properly —
// browsers require range support to seek/stream video, and buffering a
// full video file through a serverless function causes errors and timeouts.
export function getVideoUrl(filename: string): string {
  return `${BACKEND_URL}/media/video/${encodeURIComponent(filename)}`
}

export function getAudioUrl(filename: string): string {
  return `${BACKEND_URL}/media/clean/${encodeURIComponent(filename)}`
}

export function getRawAudioUrl(filename: string): string {
  return `${BACKEND_URL}/media/raw/${encodeURIComponent(filename)}`
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const resp = await fetch(`${BACKEND_URL}/health`)
  if (!resp.ok) {
    throw new Error(`Health check failed: HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function login(username: string, password: string): Promise<{ access_token: string; token_type: string }> {
  return jsonFetch<{ access_token: string; token_type: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export async function signup(username: string, password: string): Promise<{ message: string }> {
  return jsonFetch<{ message: string }>('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function connectCaptionsWebSocket(
  episodeId: string,
  onCaption: (data: { text: string; start: number; end: number; confidence: number }) => void,
  onError?: (error: string) => void
): WebSocket {
  const wsUrl = BACKEND_URL.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsUrl}/stream/ws/captions/${encodeURIComponent(episodeId)}`)
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'caption') {
        onCaption(data)
      } else if (data.type === 'error') {
        onError?.(data.error)
      }
    } catch {
    }
  }
  ws.onerror = () => {
    onError?.('WebSocket connection error')
  }
  return ws
}
