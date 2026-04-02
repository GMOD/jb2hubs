interface SelfLinkProps {
  href: string
}

export default function SelfLink({ href }: SelfLinkProps) {
  return <a href={href}>{href}</a>
}
