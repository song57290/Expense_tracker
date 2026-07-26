import { fmt, bankColor } from '../utils.js'

export default function TxItem({ tx, emojiMap = {}, large }) {
  const hasBadges = tx.exclude_perf || tx.exclude_stats
  const sz = large
    ? { badge: '0.82rem', cat: '1rem', desc: '0.92rem', sep: '0.8rem', amt: '1.08rem' }
    : { badge: '0.72rem', cat: '0.85rem', desc: '0.82rem', sep: '0.7rem', amt: '0.95rem' }
  return (
    <div className="d-flex justify-content-between align-items-start">
      <div className="me-2" style={{ minWidth: 0 }}>
        <div>
          {tx.card && (() => { const bc = bankColor(tx.card); return <span className="badge me-1" style={{ fontSize: sz.badge, background: bc.background, color: bc.color }}>{tx.card}</span> })()}
          <span className={`badge me-1 ${tx.type === 'income' ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: sz.badge }}>{tx.type === 'income' ? '수입' : '지출'}</span>
          <span className="text-muted me-1" style={{ fontSize: sz.sep, opacity: 0.35, verticalAlign: 'middle' }}>|</span>
          <span style={{ fontSize: sz.cat }}>{emojiMap[tx.category] ? `${emojiMap[tx.category]} ` : ''}{tx.category}</span>
          {tx.description && <>
            <span className="ms-1 text-muted" style={{ fontSize: sz.sep, opacity: 0.35, verticalAlign: 'middle' }}>|</span>
            <span className="ms-1 text-muted" style={{ fontSize: sz.desc }}>{tx.description.replace(/\](?!\s)/, '] ')}</span>
          </>}
        </div>
        {hasBadges && (
          <div className="mt-1">
            {tx.exclude_perf && <span className="badge me-1" style={{ fontSize: sz.badge, background: '#fff0f0', color: '#dc3545', border: '1px solid #fcc' }}>실적제외</span>}
            {tx.exclude_stats && <span className="badge" style={{ fontSize: sz.badge, background: '#f0f4ff', color: '#5a7fd4', border: '1px solid #c5d5f5' }}>통계제외</span>}
          </div>
        )}
      </div>
      <div className="text-end flex-shrink-0">
        <div className={`fw-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontSize: sz.amt }}>
          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
        </div>
        {tx.time && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1, opacity: 0.7 }}>{tx.time}</div>}
      </div>
    </div>
  )
}
