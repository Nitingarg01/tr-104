import React from 'react'

type Props = {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
}

export default function Button({ children, onClick, className = '', variant = 'primary', disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-${variant} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
