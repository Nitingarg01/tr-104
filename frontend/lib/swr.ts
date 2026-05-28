/**
 * Lightweight stale-while-revalidate cache backed by localStorage.
 *
 * On first load: returns null (no cache yet).
 * On subsequent loads: returns stale data immediately, then refetches
 * in the background and calls onRefresh when fresh data arrives.
 *
 * Works for any serialisable value. TTL is in milliseconds.
 */

type CacheEntry<T> = { data: T; ts: number }

function swr_read<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

function swr_write<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // ignore quota errors
  }
}

/**
 * fetch() wrapper that serves stale data immediately and revalidates in background.
 *
 * @param key       localStorage key
 * @param fetcher   async function that returns fresh data
 * @param ttlMs     how long before the cache is considered stale (default 30s)
 * @returns         { stale: T | null, fresh: Promise<T> }
 */
export function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000
): { stale: T | null; fresh: Promise<T> } {
  const entry = swr_read<T>(key)
  const stale = entry?.data ?? null
  const age = entry ? Date.now() - entry.ts : Infinity

  const fresh: Promise<T> = fetcher().then((data) => {
    swr_write(key, data)
    return data
  })

  // If still fresh enough, we don't need to re-render on the fresh result
  // (the consumer can decide based on whether stale === null)
  return { stale: age < ttlMs ? stale : null, fresh }
}

/**
 * React hook: returns data immediately from cache (stale) then updates when
 * the network responds. Triggers a re-render only when data actually changes.
 */
import { useEffect, useState } from 'react'

export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000
): { data: T | null; loading: boolean } {
  // Always start with null/true so server and client render identically.
  // Reading localStorage here would cause a hydration mismatch because the
  // server has no window and therefore produces different HTML than the client.
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let mounted = true
    // Now we are safely on the client — read the cache.
    const entry = swr_read<T>(key)
    const age = entry ? Date.now() - entry.ts : Infinity

    if (entry) {
      // Serve stale data immediately so the UI isn't blank.
      setData(entry.data)
    }

    // If still within TTL, skip the network request.
    if (entry && age < ttlMs) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetcher()
      .then((fresh) => {
        if (!mounted) return
        swr_write(key, fresh)
        setData(fresh)
      })
      .catch(() => {
        // network failed — keep showing stale data
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, loading }
}
