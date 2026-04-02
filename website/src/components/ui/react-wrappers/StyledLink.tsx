import React from 'react'

interface StyledLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: React.ReactNode
}

export default function StyledLink({
  href,
  children,
  ...props
}: StyledLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  )
}
