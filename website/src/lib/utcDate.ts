// "Oct 19, 2026" in UTC, the zone the pipelines record dates in: the build
// host's Pacific time put a date from the first hours of a UTC day on the day
// before
export const utcDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
