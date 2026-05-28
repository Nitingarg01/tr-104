"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  onToggleTheme: () => void
  isDark: boolean
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/upload', label: 'Upload', icon: '⊕' },
  { href: '/library', label: 'Library', icon: '☰' },
]

export default function Sidebar({ onToggleTheme, isDark }: Props) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-50 flex flex-col"
      style={{
        width: 220,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b" style={{ borderBottomColor: 'var(--border-color)' }}>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-white"
          style={{ background: 'var(--accent-primary)' }}
        >
          VS
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          VidSense AI
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle + User */}
      <div className="px-3 py-4 border-t space-y-3" style={{ borderTopColor: 'var(--border-color)' }}>
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full transition-all duration-150"
          style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
        >
          <span className="text-base w-5 text-center">{isDark ? '☀' : '☾'}</span>
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'var(--accent-secondary)' }}
          >
            A
          </div>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>User</span>
        </div>
      </div>
    </aside>
  )
}
