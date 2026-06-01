'use client'

import { useState } from 'react'
import { Menu, X, GraduationCap, Search, Bell, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CollegeHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const navLinks = [
    { label: 'Academics', href: '#academics' },
    { label: 'Research', href: '#research' },
    { label: 'Campus Life', href: '#campus' },
    { label: 'Admissions', href: '#admissions' },
    { label: 'About', href: '#about' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900 leading-tight">
                Tech University
              </h1>
              <p className="text-xs text-neutral-500 leading-tight">
                Excellence in Innovation
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-neutral-600 hover:text-blue-600 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <button className="p-2 text-neutral-500 hover:text-neutral-700 transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 text-neutral-500 hover:text-neutral-700 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <User className="w-4 h-4" />
              Student Portal
            </button>
          </div>

          <button
            className="md:hidden p-2 text-neutral-500 hover:text-neutral-700"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="block text-sm font-medium text-neutral-600 hover:text-blue-600 py-2"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-neutral-200">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <User className="w-4 h-4" />
                Student Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
