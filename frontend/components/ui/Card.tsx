import React from 'react'

type Props = {
  children: React.ReactNode
  title?: string
  className?: string
}

export default function Card({ children, title, className = '' }: Props) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        </div>
      )}
      <div className={title ? 'px-5 pb-5' : 'p-5'}>{children}</div>
    </div>
  )
}
