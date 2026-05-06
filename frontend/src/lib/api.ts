const API = ''

function auth(credential: string): Record<string, string> {
  return { Authorization: `Bearer ${credential}` }
}

export async function googleLogin(credential: string) {
  const res = await fetch(`${API}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) throw new Error('AUTH_FAILED')
  return res.json()
}

export async function guestLogin(): Promise<{ user_id: string; name: string; picture: string }> {
  const res = await fetch(`${API}/auth/guest`, { method: 'POST' })
  if (!res.ok) throw new Error('AUTH_FAILED')
  return res.json()
}

export async function getProfile(userId: string, credential: string) {
  const res = await fetch(`${API}/profile/${userId}`, { headers: auth(credential) })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  return res.json()
}

export async function deleteProfile(userId: string, credential: string) {
  await fetch(`${API}/profile/${userId}`, { method: 'DELETE', headers: auth(credential) })
}

export async function sendMessage(message: string, sessionId: string | null, credential: string, forceNew = false) {
  const res = await fetch(`${API}/chat/async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(credential) },
    body: JSON.stringify({ message, session_id: sessionId, force_new: forceNew }),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  return res.json() as Promise<{ job_id: string; session_id: string }>
}

export async function getJobStatus(jobId: string) {
  const res = await fetch(`${API}/chat/status/${jobId}`)
  return res.json()
}

export async function getReports(userId: string, credential: string) {
  const res = await fetch(`${API}/reports/${userId}`, { headers: auth(credential) })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  return res.json() as Promise<{ reports: Array<{ created_at: string; report_text: string; destinations: Array<{ city: string; country: string }> }> }>
}

export async function patchProfile(userId: string, credential: string, data: Record<string, unknown>) {
  const res = await fetch(`${API}/profile/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth(credential) },
    body: JSON.stringify(data),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error('PATCH_FAILED')
  return res.json()
}
