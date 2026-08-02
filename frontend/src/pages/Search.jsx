import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'

const fmt = n => Number(n || 0).toLocaleString()

export default function Search() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/api/categories').then(d => {
      setCategories([...( d.expense || []).map(c => c.name), ...(d.income || []).map(c => c.name)])
    }).catch(() => {})
    inputRef.current?.focus()
  }, [])

  async function doSearch() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      if (category) params.set('category', category)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (amountMin) params.set('amount_min', amountMin.replace(/,/g, ''))
      if (amountMax) params.set('amount_max', amountMax.replace(/,/g, ''))
      const data = await api.get(`/api/search?${params}`)
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') doSearch()
  }

  const hasFilter = type || category || dateFrom || dateTo || amountMin || amountMax

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 32 }}>
      {/* iOS 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: 'calc(env(safe-area-inset-top) + 8px) 16px 12px', borderBottom: '0.5px solid var(--border-light)', marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b088f9', fontWeight: 500, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: '3rem', lineHeight: 1, display: 'flex', alignItems: 'center', transform: 'translateY(-4px)' }}>‹</span>
          <span style={{ fontSize: '0.95rem' }}>뒤로</span>
        </button>
        <h5 style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', margin: 0, fontWeight: 700, fontSize: '1.2rem' }}>내역 검색</h5>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* 검색 입력 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={handleKey}
              placeholder="내용, 카테고리 검색"
              style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 12, border: '1.5px solid var(--border-light)', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <button onClick={doSearch} style={{ padding: '11px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            검색
          </button>
        </div>

        {/* 타입 필터 칩 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['', '전체'], ['expense', '지출'], ['income', '수입']].map(([val, label]) => (
            <button key={val} onClick={() => setType(val)}
              style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${type === val ? '#b088f9' : 'var(--border-light)'}`,
                background: type === val ? 'rgba(176,136,249,0.12)' : 'var(--bg-card)',
                color: type === val ? '#b088f9' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: type === val ? 700 : 400, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
          <button onClick={() => setFiltersOpen(o => !o)}
            style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${(hasFilter || filtersOpen) ? '#b088f9' : 'var(--border-light)'}`,
              background: hasFilter ? 'rgba(176,136,249,0.12)' : 'var(--bg-card)',
              color: (hasFilter || filtersOpen) ? '#b088f9' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasFilter ? '필터 적용됨' : '필터'} ▾
          </button>
        </div>

        {/* 추가 필터 */}
        {filtersOpen && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '14px 14px 10px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 5 }}>카테고리</div>
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                <option value="">전체</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 5 }}>시작일</div>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border-input)', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 5 }}>종료일</div>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border-input)', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 5 }}>최소 금액</div>
                <input type="text" inputMode="numeric" value={amountMin} placeholder=""
                  onChange={e => setAmountMin(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 5 }}>최대 금액</div>
                <input type="text" inputMode="numeric" value={amountMax} placeholder=""
                  onChange={e => setAmountMax(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid var(--border-input)', fontSize: '0.88rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button onClick={() => { setCategory(''); setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax('') }}
              style={{ padding: '6px', borderRadius: 8, border: 'none', background: 'var(--bg-accent)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
              필터 초기화
            </button>
          </div>
        )}

        {/* 결과 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>검색 중...</div>
        )}

        {results !== null && !loading && (
          <>
            {results.length > 0 && (() => {
              const totalIncome  = results.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
              const totalExpense = results.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
              const net = totalIncome - totalExpense
              return (
                <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>수입</div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#34c759' }}>+{fmt(totalIncome)}원</div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'var(--border-light)' }} />
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>지출</div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ff3b30' }}>-{fmt(totalExpense)}원</div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'var(--border-light)' }} />
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>합계</div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: net >= 0 ? '#34c759' : '#ff3b30' }}>{net >= 0 ? '+' : ''}{fmt(net)}원</div>
                  </div>
                </div>
              )
            })()}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              {results.length === 0 ? '검색 결과가 없습니다' : `${results.length}건`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map(tx => (
                <div key={tx.id} onClick={() => navigate(`/edit/${tx.id}`)}
                  style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{tx.category}</span>
                      {tx.has_receipt && <span style={{ fontSize: '0.68rem', background: 'rgba(176,136,249,0.15)', color: '#b088f9', borderRadius: 6, padding: '1px 5px' }}>사진</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tx.description || tx.category} · {tx.date} {tx.card ? `· ${tx.card}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: tx.type === 'expense' ? '#ff3b30' : '#34c759', flexShrink: 0, marginLeft: 12 }}>
                    {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}원
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {results === null && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: '0.9rem' }}>키워드, 카테고리, 날짜로<br />내역을 검색하세요</div>
          </div>
        )}
      </div>
    </div>
  )
}
