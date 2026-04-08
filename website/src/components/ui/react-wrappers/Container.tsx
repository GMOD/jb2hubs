import React from 'react'

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export default function Container({
  children,
  className,
  ...props
}: ContainerProps) {
  return (
    <div className="container">
      <div
        className={`content ${className ?? ''}`}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}
