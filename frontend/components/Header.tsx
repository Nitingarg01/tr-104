"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  onToggleTheme: () => void
  isDark: boolean
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/upload', label: 'Upload', icon: '⬆️' },
  { href: '/library', label: 'Library', icon: '📚' },
  { href: '/search', label: 'Search', icon: '🔍' },
]

export default function Header({ onToggleTheme, isDark }: Props) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b" style={{
      background: 'var(--bg-secondary)',
      borderBottomColor: 'var(--border-color)',
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold text-white"
              style={{ background: 'var(--accent-primary)' }}>
              AI
            </div>
            <span className="text-lg font-bold hidden sm:block" style={{ color: 'var(--text-primary)' }}>
              Live <span className="text-gradient">Studio</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-white/10"
                  style={{
                    background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: isActive ? '#818cf8' : '#e0e0e0',
                  }}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-lg font-medium transition-all duration-150 hover:scale-105 hover:bg-white/10"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
              aria-label="Toggle theme"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
