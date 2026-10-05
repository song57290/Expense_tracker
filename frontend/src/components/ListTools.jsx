// 선택 창 목록용 검색 + 가나다 정렬 (BrokerPicker, CardPicker 공용)
// dir: null(기본 순서) → 'asc'(가나다↑) → 'desc'(가나다↓) → null 순으로 바뀐다
export const nextSortDir = dir => (dir === null ? 'asc' : dir === 'asc' ? 'desc' : null)

const normalize = s => (s || '').replace(/\s/g, '').toLowerCase()

export function filterSortItems(items, query, dir, getName) {
  const q = normalize(query)
  const list = q ? items.filter(it => normalize(getName(it)).includes(q)) : items.slice()
  if (dir) list.sort((a, b) => getName(a).localeCompare(getName(b), 'ko') * (dir === 'desc' ? -1 : 1))
  return list
}

// inset: 선택 창처럼 여백이 없는 곳에서 좌우 여백을 준다. 이미 여백이 있는 창에서는 inset={false}
// hideSearch: 검색은 다른 입력칸(예: 이름 입력)이 맡을 때 정렬 버튼만 보여준다
export function ListToolbar({ query = '', onQuery, dir, onDir, placeholder = '이름으로 검색', inset = true, hideSearch = false }) {
  const label = dir === 'asc' ? '가나다 ↑' : dir === 'desc' ? '가나다 ↓' : '정렬'
  return (
    <div style={{ display: 'flex', gap: 8, padding: inset ? '10px 16px 4px' : '4px 0 8px', justifyContent: hideSearch ? 'flex-end' : undefined }}>
      {!hideSearch && (
        <input type="text" value={query} placeholder={placeholder} onChange={e => onQuery(e.target.value)}
          style={{ flex: 1, minWidth: 0, borderRadius: 10, padding: '8px 12px', border: '1px solid var(--border-input)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
      )}
      <button type="button" onClick={() => onDir(nextSortDir(dir))}
        style={{ borderRadius: 10, border: '1px solid var(--border-input)', background: dir ? 'rgba(176,136,249,0.1)' : 'var(--input-bg)', color: dir ? '#b088f9' : 'var(--text-secondary)', padding: '0 12px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>
        {label}
      </button>
    </div>
  )
}
