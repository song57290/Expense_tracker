import { fmt, bankColor } from '../utils.js'

export default function TxItem({ tx, emojiMap = {} }) {
  const hasBadges = tx.exclude_perf || tx.exclude_stats
  return (
    <div className="d-flex justify-content-between align-items-start">
      <div className="me-2" style={{ minWidth: 0 }}>
        <div>
          {tx.card && (() => { const bc = bankColor(tx.card); return <span className="badge me-1" style={{ fontSize: '0.72rem', background: bc.background, color: bc.color }}>{tx.card}</span> })()}
          <span className={`badge me-1 ${tx.type === 'income' ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: '0.72rem' }}>{tx.type === 'income' ? '수입' : '지출'}</span>
          <span className="text-muted me-1" style={{ fontSize: '0.7rem', opacity: 0.35, verticalAlign: 'middle' }}>|</span>
          <span style={{ fontSize: '0.85rem' }}>{emojiMap[tx.category] ? `${emojiMap[tx.category]} ` : ''}{tx.category}</span>
          {tx.description && <>
            <span className="ms-1 text-muted" style={{ fontSize: '0.7rem', opacity: 0.35, verticalAlign: 'middle' }}>|</span>
            <span className="ms-1 text-muted" style={{ fontSize: '0.82rem' }}>{tx.description}</span>
          </>}
        </div>
        {hasBadges && (
          <div className="mt-1">
            {tx.exclude_perf && <span className="badge me-1" style={{ fontSize: '0.72rem', background: '#fff0f0', color: '#dc3545', border: '1px solid #fcc' }}>실적제외</span>}
            {tx.exclude_stats && <span className="badge" style={{ fontSize: '0.72rem', background: '#f0f4ff', color: '#5a7fd4', border: '1px solid #c5d5f5' }}>통계제외</span>}
          </div>
        )}
      </div>
      <div className="text-end flex-shrink-0">
        <div className={`fw-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.95rem' }}>
          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}원
        </div>
      </div>
    </div>
  )
}
