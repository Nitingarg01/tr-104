"use client"

import React, { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme')
    const dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setIsDark(dark)
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.add('light')
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ width: 220, background: 'var(--bg-secondary)' }} />
        <main className="flex-1 p-6 ml-[220px]">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar onToggleTheme={toggleTheme} isDark={isDark} />
      <main className="flex-1 ml-[220px] p-6 min-h-screen">
        {children}
      </main>
    </div>
  )
}
