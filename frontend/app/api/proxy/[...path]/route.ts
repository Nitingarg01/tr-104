import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_BASE || 'http://localhost:8000').replace(/\/$/, '')

const BINARY_PREFIXES = ['/media/', '/audio/', '/video/']

function buildUrl(path: string[]): string {
  return `${BACKEND}/${(path ?? []).join('/')}`
}

function forwardHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      result[key] = value
    }
  })
  return result
}

function isBinary(path: string): boolean {
  return BINARY_PREFIXES.some((p) => path.includes(p))
}

/** Forward Cache-Control and ETag headers from backend response to the client. */
function buildResponseHeaders(
  res: Response,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const cc = res.headers.get('cache-control')
  if (cc) headers['Cache-Control'] = cc
  const etag = res.headers.get('etag')
  if (etag) headers['ETag'] = etag
  return headers
}

/** Timeout (ms) for all proxied requests. Backend can be slow on first load. */
const PROXY_TIMEOUT_MS = 60_000

/** Longer timeout for LLM/search endpoints that may take more time. */
const LLM_PROXY_TIMEOUT_MS = 300_000

/** Build an AbortSignal that fires after the given timeout. */
function timeoutSignal(ms: number = PROXY_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms)
}

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const url = buildUrl(path)
  const method = request.method
  const isMedia = isBinary(url)

  const isLLMEndpoint = url.includes('/search/ask') || url.includes('/search/')
  const signal = timeoutSignal(isLLMEndpoint ? LLM_PROXY_TIMEOUT_MS : PROXY_TIMEOUT_MS)

  try {
    if (method === 'GET') {
      const fetchHeaders = forwardHeaders(request.headers)

      // Forward conditional request headers so the backend can return 304
      const ifNoneMatch = request.headers.get('if-none-match')
      if (ifNoneMatch) fetchHeaders['If-None-Match'] = ifNoneMatch
      const ifModifiedSince = request.headers.get('if-modified-since')
      if (ifModifiedSince) fetchHeaders['If-Modified-Since'] = ifModifiedSince

      if (isMedia) {
        const res = await fetch(url, { method: 'GET', headers: fetchHeaders, signal })
        const contentType = res.headers.get('content-type') || ''
        const contentLength = res.headers.get('content-length') || ''
        const contentRange = res.headers.get('content-range') || ''
        const acceptRanges = res.headers.get('accept-ranges') || ''

        const responseHeaders: Record<string, string> = {
          'Content-Type': contentType || 'application/octet-stream',
        }
        if (contentLength) responseHeaders['Content-Length'] = contentLength
        if (contentRange) responseHeaders['Content-Range'] = contentRange
        if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges

        return new NextResponse(res.body, { status: res.status, headers: responseHeaders })
      }

      const res = await fetch(url, { method: 'GET', headers: fetchHeaders, signal })
      const contentType = res.headers.get('content-type') || ''

      if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
        const buffer = await res.arrayBuffer()
        return new NextResponse(buffer, {
          status: res.status,
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
            'Content-Length': res.headers.get('content-length') || '',
            'Accept-Ranges': 'bytes',
          },
        })
      }

      // JSON / text — forward Cache-Control + ETag so the browser can cache
      // Handle 304 Not Modified — no body to forward, just pass headers through
      if (res.status === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: buildResponseHeaders(res),
        })
      }
      const text = await res.text()
      return new NextResponse(text, {
        status: res.status,
        headers: buildResponseHeaders(res, {
          'Content-Type': contentType || 'text/plain',
        }),
      })
    }

    if (method === 'POST') {
      const contentType = request.headers.get('content-type') || ''

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData()
        const res = await fetch(url, { method: 'POST', body: formData, signal })
        const text = await res.text()
        return new NextResponse(text, {
          status: res.status,
          headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' },
        })
      }

      const body = await request.text()
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
      })
      const text = await res.text()
      return new NextResponse(text, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' },
      })
    }

    return new NextResponse('Method not allowed', { status: 405 })
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        (err as any).code === 'UND_ERR_HEADERS_TIMEOUT')
    const status = isTimeout ? 504 : 502
    const message = isTimeout
      ? `Gateway timeout: backend did not respond within ${(isLLMEndpoint ? LLM_PROXY_TIMEOUT_MS : PROXY_TIMEOUT_MS) / 1000}s`
      : `Bad gateway: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[proxy] ${status} ${url}:`, err)
    return NextResponse.json({ error: message }, { status })
  }
}

export const GET = handleRequest
export const POST = handleRequest
