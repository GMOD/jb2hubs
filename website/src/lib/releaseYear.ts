export function releaseYear(text: string | null | undefined) {
  const match = /\b(?:19|20)\d{2}\b/.exec(text ?? '')
  return match ? Number(match[0]) : 0
}
