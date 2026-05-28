import React from 'react'

type Props = {
  label: string
  color?: 'emerald' | 'danger' | 'primary' | 'warning'
  className?: string
}

export default function Badge({ label, color = 'emerald', className = '' }: Props) {
  return (
    <span className={`badge badge-${color} ${className}`}>
      {label}
    </span>
  )
}
