"use client"

import React, { ChangeEvent, useCallback, useMemo, useState, useEffect } from 'react'
import Button from './ui/Button'
import { useRouter } from 'next/navigation'
import { uploadFile, ingestUrl, pollJobStatus, JobStatus, STAGE_PROGRESS } from '../lib/api'

type UploadState = 'idle' | 'loading' | 'success' | 'error'

const isYouTubeURL = (url: string) => {
  const re = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/)?([\w-]{11})(?:.*)?$/i
  return re.test(url)
}

export default function UploadForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [youtubeURL, setYoutubeURL] = useState('')
  const [streamURL, setStreamURL] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  // Pause/resume is not available with the current in-process pipeline.
  // This is a future enhancement.

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      setFile(files[0])
    }
  }, [])

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
  }

  const canSubmit = useMemo(() => !!file || isYouTubeURL(youtubeURL) || (!!streamURL), [file, youtubeURL, streamURL])

  const startPolling = async (jobId: string) => {
    // Poll for job progress. This will update jobStatus and eventually episodeId.
    const finalStatus = await pollJobStatus(jobId, (s) => {
      setJobStatus(s)
      if (s.status === 'completed') {
        setEpisodeId(s.episode_id ?? null)
      }
      if (s.status === 'failed') {
        setError(s.error || 'Unknown error')
      }
    })
    // Final resolution
    setJobStatus(finalStatus)
    if (finalStatus.status === 'completed') {
      setEpisodeId(finalStatus.episode_id ?? null)
      // Navigate to watch page after short delay to allow UI to render the success state
      setStatus('success')
      setTimeout(() => {
        if (finalStatus.episode_id) {
          router.push(`/watch/${finalStatus.episode_id}`)
        }
      }, 400)
    } else if (finalStatus.status === 'failed') {
      setError(finalStatus.error || 'Processing failed')
      setStatus('error')
    }
  }

  const onSubmit = async () => {
    setError(null)
    setJobStatus(null)
    if (!canSubmit) return
    setStatus('loading')
    try {
      if (file) {
        // Upload file and poll
        const res = await uploadFile(file)
        if (!res?.job_id) throw new Error('Invalid response from server')
        await startPolling(res.job_id)
      } else if (youtubeURL && isYouTubeURL(youtubeURL)) {
        const res = await ingestUrl(youtubeURL)
        if (!res?.job_id) throw new Error('Invalid response from server')
        await startPolling(res.job_id)
      } else if (streamURL) {
        const res = await ingestUrl(streamURL)
        if (!res?.job_id) throw new Error('Invalid response from server')
        await startPolling(res.job_id)
      } else {
        throw new Error('No valid input')
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
      setStatus('error')
    }
  }

  const progressPercent = useMemo(() => {
    if (!jobStatus) return 0
    if (jobStatus.status === 'failed') return 100
    if (jobStatus.status === 'completed') return 100
    const stage = (jobStatus.stage ?? jobStatus.status).toLowerCase()
    for (const [key, value] of Object.entries(STAGE_PROGRESS)) {
      if (stage.includes(key)) return value
    }
    return 25
  }, [jobStatus])

  const currentStepIndex = useMemo(() => {
    if (!jobStatus) return 0
    if (jobStatus.status === 'completed') return 4
    if (jobStatus.status === 'failed') return -1
    const pct = progressPercent
    if (pct < 15) return 0
    if (pct < 60) return 1
    if (pct < 80) return 2
    if (pct < 100) return 3
    return 4
  }, [jobStatus, progressPercent])

  const STEPS = [
    'Downloading Audio',
    'Transcribing',
    'Segmentation',
    'Summaries',
    'Done'
  ]

  // Reset status if inputs change while idle
  useEffect(() => {
    if (status === 'idle') {
      setError(null)
    }
  }, [status])

  const etaDisplay = useMemo(() => {
    if (!jobStatus?.eta_seconds || jobStatus.eta_seconds <= 0) return null
    const total = jobStatus.eta_seconds
    const m = Math.floor(total / 60)
    const s = total % 60
    if (m > 0) return `~${m}m ${s}s remaining`
    return `~${s}s remaining`
  }, [jobStatus?.eta_seconds])

  return (
    <div className="space-y-5" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)}>
      <div
        className="border-2 border-dashed rounded-xl p-6 text-center transition-colors"
        style={{
          borderColor: dragActive ? 'var(--accent-primary)' : 'var(--border-color)',
          background: dragActive ? 'var(--bg-tertiary)' : 'transparent',
        }}
      >
        <div className="text-3xl mb-3">📁</div>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Drag & drop video here
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          MP4, MOV, AVI, WebM
        </p>
        <label className="btn-secondary inline-flex cursor-pointer">
          Browse Files
          <input type="file" onChange={onFileChange} accept="video/*" className="hidden" />
        </label>
        {file && (
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Selected: <span className="font-medium">{file.name}</span>
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            YouTube URL
          </label>
          <input
            className="input-field"
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeURL}
            onChange={(e) => setYoutubeURL(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Streaming URL
          </label>
          <input
            className="input-field"
            placeholder="https://stream.example.com/live"
            value={streamURL}
            onChange={(e) => setStreamURL(e.target.value)}
          />
        </div>
      </div>

      {youtubeURL && !isYouTubeURL(youtubeURL) && (
        <p className="text-sm" style={{ color: 'var(--accent-warning)' }}>Invalid YouTube URL format</p>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>{error}</p>}

      {(status === 'loading' || jobStatus) && (
        <div className="border rounded-xl p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {jobStatus?.status === 'failed' ? 'Processing Failed' : jobStatus?.status === 'completed' ? 'Processing Complete' : 'Processing Video...'}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--accent-primary)' }}>
              {progressPercent}%
            </span>
          </div>
          
          <div className="relative mb-6">
            <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded" style={{ background: 'var(--bg-elevated)' }} />
            <div 
              className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded transition-all duration-500" 
              style={{ width: `${progressPercent}%`, background: jobStatus?.status === 'failed' ? 'var(--accent-danger)' : 'var(--accent-primary)' }} 
            />
            
            <div className="relative flex justify-between">
              {STEPS.map((step, idx) => {
                const isCompleted = idx < currentStepIndex
                const isCurrent = idx === currentStepIndex
                const isError = jobStatus?.status === 'failed'
                
                let bgColor = 'var(--bg-elevated)'
                let borderColor = 'var(--bg-elevated)'
                let color = 'var(--text-muted)'
                
                if (isCompleted) {
                  bgColor = 'var(--accent-primary)'
                  borderColor = 'var(--accent-primary)'
                  color = '#fff'
                } else if (isCurrent && !isError) {
                  bgColor = 'var(--bg-secondary)'
                  borderColor = 'var(--accent-primary)'
                  color = 'var(--accent-primary)'
                } else if (isError && isCurrent) {
                  bgColor = 'var(--bg-secondary)'
                  borderColor = 'var(--accent-danger)'
                  color = 'var(--accent-danger)'
                }
                
                return (
                  <div key={step} className="flex flex-col items-center gap-2 z-10" style={{ width: 60 }}>
                    <div 
                      className="w-4 h-4 rounded-full border-2 transition-colors duration-300"
                      style={{ background: bgColor, borderColor }}
                    />
                    <span 
                      className="text-[10px] text-center leading-tight transition-colors duration-300" 
                      style={{ color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isCurrent ? 600 : 400 }}
                    >
                      {step}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {jobStatus?.stage ? `Current operation: ${jobStatus.stage.replace('_', ' ')}` : 'Preparing...'}
            </span>
            {etaDisplay && jobStatus?.status !== 'completed' && jobStatus?.status !== 'failed' && (
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {etaDisplay}
              </span>
            )}
          </div>
        </div>
      )}

      {episodeId && (
        <div className="flex items-center gap-3">
          <span className="badge badge-emerald">Completed</span>
          <a href={`/watch/${episodeId}`} className="text-sm" style={{ color: 'var(--text-primary)' }}>
            View Episode {episodeId}
          </a>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={onSubmit} disabled={!canSubmit}>
          {status === 'loading' ? 'Processing...' : 'Upload & Process'}
        </Button>
        {status === 'success' && (
          <span className="badge badge-emerald">Upload Initiated</span>
        )}
      </div>
    </div>
  )
}
