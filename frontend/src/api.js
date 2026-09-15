function doFetch(url, opts) {
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'same-origin',
    ...opts,
  })
}

async function req(url, opts = {}, retriedAfter401 = false) {
  let r = await doFetch(url, opts)
  if (r.status === 401 && !retriedAfter401) {
    // 로그인 직후 곧바로 이어지는 요청이 드물게 401로 응답할 때가 있다(쿠키가
    // 아직 반영되기 전 타이밍 문제로 추정) — 바로 로그인 화면으로 튕기기 전에
    // 한 번만 재시도해서 진짜 로그아웃 상태인지 확인한다.
    await new Promise(res => setTimeout(res, 700))
    r = await doFetch(url, opts)
  }
  if (r.status === 401) {
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    const err = new Error(body.error || `HTTP ${r.status}`)
    err.data = body
    throw err
  }
  return r.json()
}

const api = {
  get: (url) => req(url),
  post: (url, data) => req(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => req(url, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (url) => req(url, { method: 'DELETE' }),
}

export default api
