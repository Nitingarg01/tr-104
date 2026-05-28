"use client"

import React from 'react'
import UploadForm from '../../components/UploadForm'
import Card from '../../components/ui/Card'

const steps = [
  { icon: '📁', title: 'Upload Video', desc: 'Drag & drop or browse files (MP4, MOV, AVI)' },
  { icon: '🎙️', title: 'AI Transcription', desc: 'Faster Whisper model transcribes audio in real-time' },
  { icon: '📑', title: 'Segmentation', desc: 'SBERT embeddings detect topic boundaries' },
  { icon: '🔍', title: 'Search Ready', desc: 'Semantic search index built for instant queries' },
]

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold mb-2">
          Upload & <span className="text-gradient">Process</span>
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upload a video file or paste a URL — AI handles the rest
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {steps.map((step, i) => (
          <div key={i} className="card p-4 text-center">
            <div className="text-2xl mb-2">{step.icon}</div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{step.desc}</p>
          </div>
        ))}
      </div>

      <Card>
        <UploadForm />
      </Card>
    </div>
  )
}
