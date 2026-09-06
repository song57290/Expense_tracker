import { useState, useEffect } from 'react'
import FilterPopup from './FilterPopup.jsx'
import { bankColor, getCustomIconColor } from '../utils.js'

// cards: [{ name, id, has_custom_icon }]
export default function TxListFilter({
  sortAsc, onSortChange, showBalance, onShowBalanceChange, showTime, onShowTimeChange,
  cards = [], cardFilter, onCardFilterChange,
}) {
  const [customColors, setCustomColors] = useState({})

  useEffect(() => {
    cards.forEach(c => {
      if (c.has_custom_icon && c.id && !(c.id in customColors)) {
        getCustomIconColor(c.id).then(color => {
          setCustomColors(prev => (prev[c.id] !== undefined ? prev : { ...prev, [c.id]: color }))
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  const sections = [
    { label: '정렬', options: [[false, '최신순'], [true, '과거순']], value: sortAsc, onChange: onSortChange },
    { label: '통장 잔고', options: [[true, '표시'], [false, '숨김']], value: showBalance, onChange: onShowBalanceChange },
    { label: '시간', options: [[true, '표시'], [false, '숨김']], value: showTime, onChange: onShowTimeChange },
  ]
  if (cards.length > 0) {
    sections.push({
      label: '은행/카드', type: 'grid',
      options: cards.map(c => {
        const custom = c.has_custom_icon ? customColors[c.id] : null
        const color = custom || bankColor(c.name).background
        return [c.name, c.name, color, `${color}22`]
      }),
      value: cardFilter, onChange: onCardFilterChange,
    })
  }
  return <FilterPopup sections={sections} />
}
