async function req(url, opts = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'same-origin',
    ...opts,
  })
  if (r.status === 401) {
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const api = {
  get: (url) => req(url),
  post: (url, data) => req(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => req(url, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (url) => req(url, { method: 'DELETE' }),
}

export default api
