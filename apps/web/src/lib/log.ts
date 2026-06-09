export function remoteLog(
  source: 'control' | 'display' | 'debug',
  event: string,
  data?: Record<string, unknown> | null,
): void {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, event, data }),
  }).catch(() => {})
}
