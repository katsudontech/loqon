const projectPathPattern = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/?$/i

export function requestedOfflineProjectId(pathname: string, search: string) {
  const queryId = new URLSearchParams(search).get('project')
  if (queryId) return queryId
  const match = projectPathPattern.exec(pathname)
  return match?.[0].replace(/^\//, '').replace(/\/$/, '') ?? null
}
