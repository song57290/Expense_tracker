import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api.js'
import { syncWidget } from '../widgetSync.js'
import { PAYMENT_LOGOS, fmt, bankLogo, cardLogo, fmtMonth, fmtDate, today, restoreCaretAfterFormat, useLocalStorageState } from '../utils.js'
import DatePickerSheet from '../components/DatePickerSheet.jsx'
import CardPicker from '../components/CardPicker.jsx'
import { ListToolbar, filterSortItems } from '../components/ListTools.jsx'
import { BROKERS, brokerOf, keyOfName, BrokerBadge, BrokerPicker, BrokerSearch } from '../components/Broker.jsx'
import ImageCropper from '../components/ImageCropper.jsx'
import FilterPopup from '../components/FilterPopup.jsx'
import TxItem from '../components/TxItem.jsx'

// Manually drives scrollLeft from raw touch deltas instead of relying on the browser's
// native touch-scroll gesture recognition, the same way this app's own swipe-to-edit/
// delete gesture already manually tracks touch deltas instead of depending on native
// behavior. A *callback* ref, not useRef+useEffect(,[]) — these rows live inside sheets
// (AddSheet/SavingsSheet/InvestmentSheet) that are mounted once, unconditionally, and
// only stop returning null once `open` flips true, so an empty-deps effect fires at that
// very first null render, before the row exists, and never runs again. A callback ref
// fires exactly when the node actually mounts (and again on remount), no matter when
// that happens.
function useDragScrollX() {
  return useCallback(el => {
    if (!el) return
    let startX = 0, startScroll = 0, dragging = false, moved = false
    function onStart(e) {
      dragging = true
      startX = e.touches[0].clientX
      startScroll = el.scrollLeft
    }
    function onMove(e) {
      if (!dragging) return
      el.scrollLeft = startScroll - (e.touches[0].clientX - startX)
    }
    function onEnd() { dragging = false }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    // Mouse (PC) support — pointer capture keeps move/up events targeted at `el`
    // even once the cursor leaves its bounds mid-drag, so no window-level
    // listeners (and their leak-on-remount risk) are needed.
    el.style.cursor = 'grab'
    let pointerId = null
    function onPointerDown(e) {
      if (e.pointerType !== 'mouse') return
      dragging = true; moved = false
      startX = e.clientX
      startScroll = el.scrollLeft
      pointerId = e.pointerId
    }
    function onPointerMove(e) {
      if (!dragging || e.pointerType !== 'mouse') return
      const delta = e.clientX - startX
      if (!moved) {
        if (Math.abs(delta) <= 5) return
        // 실제로 드래그가 시작된 뒤에만 캡처한다 — pointerdown 즉시 캡처하면
        // 드래그 없이 그냥 클릭만 해도(예: 은행 버튼) click의 target이 이
        // 컨테이너로 강제로 바뀌어버려 안쪽 버튼의 onClick이 아예 안 잡혔다.
        moved = true
        el.style.cursor = 'grabbing'
        try { el.setPointerCapture(pointerId) } catch {}
      }
      el.scrollLeft = startScroll - delta
    }
    function onPointerUp(e) {
      if (e.pointerType !== 'mouse') return
      dragging = false
      el.style.cursor = 'grab'
      try { el.releasePointerCapture(e.pointerId) } catch {}
    }
    function onClickCapture(e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false }
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('click', onClickCapture, true)
  }, [])
}

// No visible handle — long-press (300ms, dnd-kit's activationConstraint below) anywhere
// on the item starts a reorder-drag; a quick swipe within that window is released to the
// item's own edit/delete swipe gesture instead. Passes {listeners, isDragging} down so the
// item can attach the activator to its own swipeable content and suppress swipe while dragging.
function SortableWrap({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1, position: 'relative', zIndex: isDragging ? 999 : 'auto',
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ listeners, isDragging })}
    </div>
  )
}

// 정렬(수동순) 프리셋일 때만 드래그로 순서 변경 가능 — 다른 프리셋은 계산된 정렬 순서라 드래그를 비활성화
function SortableSection({ items, sortable, onReorder, renderItem }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  )
  // dnd-kit 내장 autoScroll이 가속을 아무리 올려도 체감상 느려서, 화면 끝 근처에서
  // 매 프레임 window를 큰 폭으로 스크롤하는 방식으로 교체 — 포인터 위치는 window
  // touchmove/pointermove로 직접 추적하면 모바일에서 dnd-kit 센서가 이벤트를 먼저
  // 채가 안 잡히는 경우가 있어, 대신 dnd-kit 자신이 매 프레임 갱신하는
  // active.rect.current.translated(마우스·터치 공통)를 그대로 사용한다.
  const pointerYRef = useRef(null)
  const rafRef = useRef(null)
  const lastTickRef = useRef(null)
  // 부트스트랩 reboot.css가 :root에 scroll-behavior:smooth를 걸어놔서,
  // behavior를 명시하지 않은 scrollBy는 매 프레임 요청과 무관하게 브라우저의
  // 스무스 스크롤 easing에 의해 실제 이동량이 크게 줄어든다(직접 측정 결과
  // 요청량의 20% 안팎만 반영됨). behavior:'instant'로 강제해 우회한다.
  function autoScrollTick(now) {
    const y = pointerYRef.current
    const dt = lastTickRef.current ? Math.min((now - lastTickRef.current) / 1000, 0.1) : 0
    if (y !== null && dt > 0) {
      const vh = window.innerHeight
      const edgeZone = 120
      const maxSpeed = 900 // px/sec at full intensity
      if (y > vh - edgeZone) {
        const intensity = Math.min(1, (y - (vh - edgeZone)) / edgeZone)
        window.scrollBy({ top: maxSpeed * intensity * dt, behavior: 'instant' })
      } else if (y < edgeZone) {
        const intensity = Math.min(1, (edgeZone - y) / edgeZone)
        window.scrollBy({ top: -maxSpeed * intensity * dt, behavior: 'instant' })
      }
    }
    lastTickRef.current = now
    rafRef.current = requestAnimationFrame(autoScrollTick)
  }
  function handleDragMove(e) {
    const rect = e.active?.rect?.current?.translated
    if (rect) pointerYRef.current = (rect.top + rect.bottom) / 2
  }
  function startAutoScroll() {
    pointerYRef.current = null
    lastTickRef.current = null
    rafRef.current = requestAnimationFrame(autoScrollTick)
  }
  function stopAutoScroll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    pointerYRef.current = null
    lastTickRef.current = null
  }
  async function handleDragEnd(e) {
    stopAutoScroll()
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex(x => x.id === active.id)
    const newIdx = items.findIndex(x => x.id === over.id)
    await onReorder(arrayMove(items, oldIdx, newIdx))
  }
  if (!sortable) return <>{items.map(item => <div key={item.id}>{renderItem(item, null)}</div>)}</>
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      autoScroll={false} onDragStart={startAutoScroll} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={stopAutoScroll}>
      <SortableContext items={items.map(x => x.id)} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <SortableWrap key={item.id} id={item.id}>{dnd => renderItem(item, dnd)}</SortableWrap>
        ))}
      </SortableContext>
    </DndContext>
  )
}

// 만기일처럼 null일 수 있는 값을 항상 맨 뒤로 보내면서 오름/내림차순을 뒤집는 비교 헬퍼
function sortByNullable(getVal, dir) {
  return (a, b) => {
    const va = getVal(a), vb = getVal(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return dir === 'asc' ? va - vb : vb - va
  }
}

const BANKS = [
  ['신한은행', '/static/cards/sinhanbank.png', '신한은행'],
  ['국민은행', '/static/cards/kbbank.png', 'KB국민'],
  ['농협은행', '/static/cards/nhbank.png', '농협은행'],
  ['하나은행', '/static/cards/hanabank.png', '하나은행'],
  ['우리은행', '/static/cards/wooribank.png', '우리은행'],
  ['IBK기업은행', '/static/cards/ibkbank.png', 'IBK기업'],
  ['카카오뱅크', '/static/cards/kakaobank.png', '카카오뱅크'],
  ['토스뱅크', '/static/cards/tossbank.png', '토스뱅크'],
  ['케이뱅크', '/static/cards/kbank.png', '케이뱅크'],
  ['SC제일은행', '/static/cards/scbank.png', 'SC제일'],
  ['씨티은행', '/static/cards/citibank.png', '씨티은행'],
  ['iM뱅크', '/static/cards/imbank.png', 'iM뱅크'],
  ['수협은행', '/static/cards/suhyupbank.png', '수협은행'],
  ['KDB산업은행', '/static/cards/kdbbank.png', 'KDB산업'],
  ['BNK부산은행', '/static/cards/bnkbank.png', 'BNK부산'],
  ['우체국은행', '/static/cards/epostbank.png', '우체국'],
  ['SBI저축은행', '/static/cards/sbibank.png', 'SBI저축'],
  ['신협', '/static/cards/cubank.png', '신협'],
]
const CARD_COMPANIES = [
  ['BC카드', '/static/banks/bccard.png', 'BC카드'],
  ['현대카드', '/static/banks/hyundaicard.png', '현대카드'],
  ['롯데카드', '/static/banks/lottecard.png', '롯데카드'],
  ['삼성카드', '/static/banks/samsungcard.png', '삼성카드'],
]

// wide: 가로형 로고(간편결제)용. 칩 높이는 정사각형 칩과 같고, 로고는 가로 칸 안에 비율을 유지해 맞춘다
function BankBtn({ bankName, logo, label, selected, onPick, wide = false }) {
  const isSel = selected === bankName
  return (
    <button type="button" onClick={() => onPick(bankName)}
      className="d-flex flex-column align-items-center rounded-3 p-2 flex-shrink-0"
      style={{ border: `1.5px solid ${isSel ? '#b088f9' : '#e8d5ff'}`, background: isSel ? 'rgba(176,136,249,0.12)' : 'var(--bg-card)', width: wide ? 104 : 72, cursor: 'pointer' }}>
      {wide
        ? <div style={{ width: 88, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={logo} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        : <img src={logo} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8 }} />}
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </button>
  )
}

// 칩 목록을 거를 검색어. 이름 칸이 목록의 정확한 항목 이름이면(이미 고른 상태) 걸러내지 않고 전체를 보여준다
// 이름 칸과 정확히 같은 항목은 목록 맨 앞으로 옮긴다 (가로로 넘겨 보는 칩 줄에서 바로 보이도록)
function chipOrder(list, name, keyOf) {
  const i = list.findIndex(x => keyOf(x) === name)
  return i <= 0 ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)]
}

function chipQuery(name) {
  const exact = [...BANKS, ...CARD_COMPANIES].some(b => b[0] === name) || PAYMENT_LOGOS.some(p => p[0] === name)
  return exact ? '' : name
}

function AddSheet({ open, visible, onClose, onSaved, cards = [] }) {
  const bankScrollRef = useDragScrollX()
  const cardCoScrollRef = useDragScrollX()
  const paymentScrollRef = useDragScrollX()
  // 은행 · 카드사 · 간편결제 칩 줄의 검색과 가나다 정렬
  const [bankDir, setBankDir] = useState(null)
  const [cardCoDir, setCardCoDir] = useState(null)
  const [payDir, setPayDir] = useState(null)
  const [nameErr, setNameErr] = useState(false) // 이름 미입력 시 빨간 테두리와 문구 (브라우저 기본 경고 대신)
  const [assetType, setAssetType] = useState('card')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [initialBalance, setInitialBalance] = useState('')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('')
  const [tier1, setTier1] = useState(20)
  const [tier2, setTier2] = useState(50)
  const [tier3, setTier3] = useState(80)
  const [tierOpen, setTierOpen] = useState(false)
  const [linkedAccountId, setLinkedAccountId] = useState('')
  const [addInterestRate, setAddInterestRate] = useState('')
  const [cashbackType, setCashbackType] = useState('')
  const [cashbackRate, setCashbackRate] = useState('')
  const [pointResetOn, setPointResetOn] = useState(false)
  const [pointResetDay, setPointResetDay] = useState('')
  const [pointResetAmount, setPointResetAmount] = useState('')
  const [customIconFile, setCustomIconFile] = useState(null)
  const [customIconPreview, setCustomIconPreview] = useState(null)
  const [cropFile, setCropFile] = useState(null)

  function pick(cardName) { setSelected(cardName); setName(cardName) }

  function switchType(t) {
    setAssetType(t)
    setSelected(''); setName(t === 'cash' ? '현금' : ''); setUrl('')
    setInitialBalance(t === 'loan' ? '-' : '')
    setLinkedAccountId(''); setAddInterestRate('')
    setCashbackType(''); setCashbackRate('')
    setPointResetOn(t === 'point'); setPointResetDay(''); setPointResetAmount('')
    if (customIconPreview) URL.revokeObjectURL(customIconPreview)
    setCustomIconFile(null); setCustomIconPreview(null)
  }

  function pickCustomIcon(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCropFile(file)
  }
  function onCropConfirm(croppedFile) {
    if (customIconPreview) URL.revokeObjectURL(customIconPreview)
    setCustomIconFile(croppedFile)
    setCustomIconPreview(URL.createObjectURL(croppedFile))
    setCropFile(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setNameErr(true); return }
    const t = parseInt(target.replace(/,/g, '')) || 0
    const ib = parseInt(initialBalance.replace(/,/g, '')) || 0
    const res = await api.post('/api/cards', {
      name, target: t, url, tier1, tier2, tier3, account_balance: ib,
      linked_account_id: linkedAccountId ? Number(linkedAccountId) : null,
      interest_rate: addInterestRate ? parseFloat(addInterestRate) : null,
      cashback_type: cashbackType || null,
      cashback_rate: cashbackType && cashbackRate ? parseFloat(cashbackRate) : null,
      point_reset_day: pointResetOn && pointResetDay ? parseInt(pointResetDay) : null,
      point_reset_amount: pointResetOn && pointResetAmount ? parseInt(pointResetAmount.replace(/,/g, '')) : null,
    })
    if (customIconFile && res?.id) {
      const fd = new FormData()
      fd.append('icon', customIconFile)
      const iconRes = await fetch(`/api/cards/${res.id}/icon`, { method: 'POST', credentials: 'include', body: fd })
      if (!iconRes.ok) {
        const body = await iconRes.json().catch(() => ({}))
        alert('로고 업로드 실패: ' + (body.error || iconRes.status))
      }
    }
    setAssetType('card'); setSelected(''); setName(''); setInitialBalance(''); setTarget(''); setUrl('')
    setTier1(20); setTier2(50); setTier3(80); setTierOpen(false); setLinkedAccountId('')
    setAddInterestRate(''); setCashbackType(''); setCashbackRate('')
    setPointResetOn(false); setPointResetDay(''); setPointResetAmount('')
    if (customIconPreview) URL.revokeObjectURL(customIconPreview)
    setCustomIconFile(null); setCustomIconPreview(null)
    onSaved(); onClose()
  }

  if (!open) return null
  // Layout.jsx의 페이지 전환 컨테이너가 transform을 쓰는 애니메이션 요소라, 그
  // 안에 그대로 두면 position:fixed가 화면이 아니라 그 조상 기준으로 동작해
  // 키보드 리사이즈와 어긋난다 — document.body로 포털링해서 피한다.
  return createPortal(
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">자산 추가</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, paddingBottom: 20 }}>
          <form id="add-card-form" onSubmit={handleSubmit}>
            {/* 자산 유형 선택 */}
            <div className="d-flex gap-2 mb-3">
              {[['card', '💳 카드 / 은행'], ['point', '🎁 포인트'], ['cash', '💵 현금'], ['loan', '💸 대출']].map(([t, label]) => (
                <button key={t} type="button" onClick={() => switchType(t)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `2px solid ${assetType === t ? (t === 'loan' ? '#dc3545' : '#b088f9') : 'var(--border-light)'}`, background: assetType === t ? (t === 'loan' ? 'rgba(220,53,69,0.08)' : 'rgba(176,136,249,0.1)') : 'var(--bg-card)', color: assetType === t ? (t === 'loan' ? '#dc3545' : '#b088f9') : 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>

            {(assetType === 'card' || assetType === 'loan' || assetType === 'point') && (<>
              {(assetType === 'card' || assetType === 'loan') && (<>
                <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>은행</p>
                <ListToolbar hideSearch dir={bankDir} onDir={setBankDir} inset={false} />
                <div ref={bankScrollRef} data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
                  {chipOrder(filterSortItems(BANKS, chipQuery(name), bankDir, b => b[2]), name, b => b[0]).map(([bname, logo, label]) => (
                    <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pick} />
                  ))}
                </div>
                <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>카드사</p>
                <ListToolbar hideSearch dir={cardCoDir} onDir={setCardCoDir} inset={false} />
                <div ref={cardCoScrollRef} data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
                  {chipOrder(filterSortItems(CARD_COMPANIES, chipQuery(name), cardCoDir, b => b[2]), name, b => b[0]).map(([bname, logo, label]) => (
                    <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pick} />
                  ))}
                </div>
              </>)}
              {assetType === 'point' && (<>
                <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>간편결제</p>
                <ListToolbar hideSearch dir={payDir} onDir={setPayDir} inset={false} />
                <div ref={paymentScrollRef} data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
                  {chipOrder(filterSortItems(PAYMENT_LOGOS, chipQuery(name), payDir, p => p[0]), name, p => p[0]).map(([pname, logo]) => (
                    <BankBtn key={pname} bankName={pname} logo={logo} label={pname} selected={selected} onPick={pick} wide />
                  ))}
                </div>
              </>)}
              <div className="d-flex align-items-center gap-2 mb-3">
                <label htmlFor="add-custom-icon-input" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: '1.5px dashed var(--border-light)', color: '#b088f9', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {customIconPreview
                    ? <img src={customIconPreview} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                    : <i className="bi bi-image" />}
                  목록에 없는 은행/포인트사 로고 직접 추가
                </label>
                <input type="file" id="add-custom-icon-input" accept="image/*" onChange={pickCustomIcon} style={{ display: 'none' }} />
                {customIconPreview && (
                  <button type="button" onClick={() => { URL.revokeObjectURL(customIconPreview); setCustomIconFile(null); setCustomIconPreview(null) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem' }}>취소</button>
                )}
              </div>
              <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onCropConfirm} />
            </>)}

            {assetType === 'card' && cards.filter(c => !c.linked_account_id && !c.is_loan).length > 0 && (() => {
              const linkable = cards.filter(c => !c.linked_account_id && !c.is_loan)
              const NONE_LABEL = '연결 없음'
              const linkedCard = linkable.find(c => String(c.id) === String(linkedAccountId))
              return (
                <div className="mb-2">
                  <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>연결 계좌 (선택)</p>
                  <CardPicker cards={[{ id: '__none__', name: NONE_LABEL }, ...linkable]}
                    value={linkedCard ? linkedCard.name : NONE_LABEL}
                    placeholder="연결 계좌 선택"
                    onChange={name => {
                      if (name === NONE_LABEL) { setLinkedAccountId(''); return }
                      const c = linkable.find(c => c.name === name)
                      setLinkedAccountId(c ? String(c.id) : '')
                    }} />
                  {linkedAccountId && (
                    <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>잔고는 선택한 계좌와 공유되며, 실적/목표는 이 카드에만 적용됩니다.</p>
                  )}
                </div>
              )
            })()}
            <input type="text" className="form-control mb-2"
              placeholder={assetType === 'cash' ? '이름 (예: 현금, 지갑)' : assetType === 'loan' ? '이름 (예: 전세 대출, 카드빚)' : assetType === 'point' ? '포인트명 (예: 복지 포인트)' : '카드/은행 이름 (위 선택 시 자동 입력)'}
              value={name} onChange={e => { setName(e.target.value); setNameErr(false) }}
              style={{ borderRadius: 10, border: nameErr ? '1.5px solid #dc3545' : undefined }} />
            {nameErr && (
              <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: -4, marginBottom: 8 }}>
                {assetType === 'card' ? '카드/은행 이름을 입력해 주세요' : assetType === 'point' ? '포인트명을 입력해 주세요' : '이름을 입력해 주세요'}
              </div>
            )}
            <div className="mb-2" style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder={assetType === 'loan' ? '부채 금액 (예: -5,000,000)' : assetType === 'point' ? '초기 포인트 잔액 (선택)' : '초기 잔고 (계좌 등록 시점 잔고, 선택)'} inputMode={assetType === 'loan' ? 'text' : 'numeric'}
                value={initialBalance} onChange={e => {
                  const forceNeg = assetType === 'loan'
                  const neg = forceNeg || e.target.value.startsWith('-')
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (!raw) { setInitialBalance(neg ? '-' : ''); return }
                  const v = (neg ? '-' : '') + parseInt(raw).toLocaleString('ko-KR')
                  restoreCaretAfterFormat(e.target, v)
                  setInitialBalance(v)
                }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div className="mb-2" style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder={assetType === 'loan' ? '월 상환 목표 (선택)' : assetType === 'cash' ? '월 지출 목표 (선택)' : '월 목표 금액 (선택)'} inputMode="numeric"
                value={target} onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''
                  restoreCaretAfterFormat(e.target, v)
                  setTarget(v)
                }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            {assetType === 'loan' && (
              <div className="mb-2" style={{ position: 'relative' }}>
                <input type="number" className="form-control" placeholder="연 이자율 (선택, 예: 3.5)" inputMode="decimal"
                  value={addInterestRate} onChange={e => setAddInterestRate(e.target.value)} style={{ borderRadius: 10, paddingRight: 36 }} step="0.1" min="0" max="100" />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>%</span>
              </div>
            )}
            {assetType === 'card' && (
              <input type="url" className="form-control mb-2" placeholder="혜택 사이트 URL (선택)"
                value={url} onChange={e => setUrl(e.target.value)} style={{ borderRadius: 10 }} />
            )}
            {assetType === 'card' && (
              <div className="mb-3">
                <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>캐시백 / 충전 보너스 (선택)</p>
                <div className="d-flex gap-2 mb-2">
                  {[['', '없음'], ['payment', '결제 시 캐시백'], ['charge', '충전 시 보너스']].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setCashbackType(val)}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1.5px solid ${cashbackType === val ? '#b088f9' : 'var(--border-light)'}`, background: cashbackType === val ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: cashbackType === val ? '#b088f9' : 'var(--text-muted)', fontWeight: cashbackType === val ? 600 : 400, fontSize: '0.78rem', cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {cashbackType && (
                  <div style={{ position: 'relative' }}>
                    <input type="number" className="form-control" placeholder={cashbackType === 'payment' ? '결제 금액 대비 캐시백율 (예: 15)' : '충전 금액 대비 보너스율 (예: 5)'} inputMode="decimal"
                      value={cashbackRate} onChange={e => setCashbackRate(e.target.value)} style={{ borderRadius: 10, paddingRight: 36 }} step="0.1" min="0" max="100" />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>%</span>
                  </div>
                )}
                <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>
                  {cashbackType === 'payment' && '이 카드로 지출 입력 시 캐시백이 자동 계산되어, 카드 실적에서 차감됩니다.'}
                  {cashbackType === 'charge' && '이 카드로 수입(충전) 입력 시 보너스가 자동 계산되어, 잔고에 바로 더해집니다.'}
                </p>
              </div>
            )}
            {assetType === 'point' && (
              <div className="mb-3">
                <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>정기 충전 설정</p>
                <div className="d-flex gap-2 mb-2"> 
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input type="number" className="form-control" placeholder="초기화 일 (예: 5)" inputMode="numeric" required
                      value={pointResetDay} onChange={e => setPointResetDay(e.target.value)} style={{ borderRadius: 10, paddingRight: 28 }} min="1" max="28" />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                  </div>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input type="text" className="form-control" placeholder="충전 금액" inputMode="numeric"
                      value={pointResetAmount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setPointResetAmount(v) }}
                      style={{ borderRadius: 10, paddingRight: 28 }} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                  </div>
                </div>
                <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>
                  매월 지정한 날짜에 이전 잔액과 상관없이 충전 금액으로 초기화됩니다.
                  <br />
                  (주말이면 그 전 영업일에 초기화)
                  <br />
                  남은 포인트는 이월되지 않고 사라지지만, 초기화 전 "전환하기"로 미리 저장해둔 포인트는 초기화돼도 사라지지 않고 "전환" 포인트로 따로 남아서, 지출 등록 시 "전환된 포인트에서 차감"을 켜면 계속 쓸 수 있어요.
                </p>
              </div>
            )}
            <button type="button" style={{ fontSize: '0.8rem', color: '#b088f9', background: 'none', border: 'none', padding: 0 }}
              onClick={() => setTierOpen(o => !o)}>
              실적 구간 설정 {tierOpen ? '▴' : '▾'}
            </button>
            {tierOpen && (
              <div className="d-flex align-items-center gap-2 flex-wrap mt-2 mb-2">
                <span className="badge" style={{ background: '#dc3545' }}>빨강 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier1} min={0} max={100} onChange={e => setTier1(+e.target.value)} />
                <span className="badge" style={{ background: '#ffc107', color: '#333' }}>노랑 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier2} min={0} max={100} onChange={e => setTier2(+e.target.value)} />
                <span className="badge" style={{ background: '#0d6efd' }}>파랑 ≤</span>
                <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={tier3} min={0} max={100} onChange={e => setTier3(+e.target.value)} />
                <span className="badge" style={{ background: '#198754' }}>초록</span>
              </div>
            )}
          </form>
        </div>
        <div style={{ padding: '12px 0 calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
          <div className="d-flex gap-2">
            <button type="submit" form="add-card-form" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>추가하기</button>
            <button type="button" className="btn btn-outline-secondary flex-fill" onClick={onClose} style={{ borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>취소</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function SwipeCard({ card, onEdit, onDelete, onConvert, onPointInfo, onPerfClick, onRepayChange, linkedAccountName, accountCards = [], dnd, hideAmounts = false }) {
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const cardRef = useRef(null)
  const mouseDown = useRef(false)
  const [repayOpen, setRepayOpen] = useState(false)
  const [repayments, setRepayments] = useState([])
  const [repayForm, setRepayForm] = useState({ amount: '', date: today(), memo: '', card: '' })
  const [repayLoading, setRepayLoading] = useState(false)
  const [repayCardPickerPressed, setRepayCardPickerPressed] = useState(false)

  async function loadRepayments() {
    const res = await api.get(`/api/cards/${card.id}/repayments`)
    setRepayments(res || [])
  }
  function toggleRepay(e) {
    e.stopPropagation()
    if (!repayOpen) loadRepayments()
    setRepayOpen(o => !o)
  }
  async function addRepay(e) {
    e.preventDefault()
    const amt = parseInt(repayForm.amount.replace(/,/g, ''))
    if (!amt) return
    setRepayLoading(true)
    await api.post(`/api/cards/${card.id}/repayments`, { amount: amt, date: repayForm.date, memo: repayForm.memo, deduct_card: repayForm.card || '' })
    setRepayForm({ amount: '', date: today(), memo: '', card: '' })
    await loadRepayments()
    setRepayLoading(false)
    if (onRepayChange) onRepayChange()
  }
  async function deleteRepay(rid) {
    await api.delete(`/api/cards/repayments/${rid}`)
    await loadRepayments()
    if (onRepayChange) onRepayChange()
  }

  const onDragStart = e => {
    if (dnd?.isDragging) return
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (dnd?.isDragging) { startX.current = null; return }
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx
    const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (dnd?.isDragging) { startX.current = null; setOffsetX(0); return }
    if (startX.current === null) return
    const cur = offsetX
    startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }
  // 탭(스와이프 없이 제자리에서 눌렀다 뗀 경우) 감지를 onDragEnd의 startX 추적에
  // 얹었더니, 스와이프 제스처 전용으로 넣어둔 화면 가장자리 80px 제외 구간(안드로이드
  // 뒤로가기 제스처와 겹치지 않게 하려고 있는 규칙) 때문에 카드 가장자리를 누르면
  // startX 자체가 안 잡혀서 탭 판정까지 같이 막혀버렸다 — 가운데만 되고 가장자리는
  // 안 되는 증상. 탭은 스와이프와 무관하니 그냥 onClick으로 따로 받는다(스와이프로
  // 끌린 경우엔 touchmove에서 이미 preventDefault를 호출해 합성 클릭이 안 생긴다).
  const onCardClick = () => { if (card.point_reset_day && onPointInfo) onPointInfo() }
  const onSwipeTouchStart = e => { dnd?.listeners?.onTouchStart?.(e); onDragStart(e) }
  const onSwipeMouseDown = e => { dnd?.listeners?.onMouseDown?.(e); onDragStart(e) }

  const tierClass = (pct, t1, t2, t3) => {
    if (pct > t3) return 'bg-success'
    if (pct > t2) return 'bg-primary'
    if (pct > t1) return 'bg-warning'
    return 'bg-danger'
  }

  const isLoan = !!card.is_loan
  const logo = !isLoan && cardLogo(card)
  const isCash = !isLoan && !logo && (card.name.includes('현금') || card.name.includes('지갑'))
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'var(--bg-card)', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onSwipeTouchStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onSwipeMouseDown} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}
        onClick={onCardClick}>
        <div className="d-flex justify-content-between align-items-center mb-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
          <div className="d-flex align-items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
            {logo && <img src={logo} style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />}
            {isCash && <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>💵</span>}
            {isLoan && <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>💸</span>}
            <span className="fw-semibold" style={{ wordBreak: 'keep-all' }}>{card.name}</span>
            {linkedAccountName && (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#f0e8ff', color: '#b088f9', flexShrink: 0, whiteSpace: 'nowrap' }}>🔗 {linkedAccountName}</span>
            )}
            {card.url && (
              <a href={card.url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', color: '#b088f9', fontSize: '0.75rem', textDecoration: 'underline', lineHeight: 1, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                🔗 혜택 사이트
              </a>
            )}
          </div>
          <div className="text-end">
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>잔고</div>
            {(() => {
              const hasCarryover = card.point_reset_day && card.point_carryover > 0
              const displayBalance = hasCarryover ? card.balance + card.point_carryover : card.balance
              return (<>
                <div className={`fw-bold amt-mask${hideAmounts ? ' amt-hidden' : ''}`} style={{ fontSize: '1.15rem', color: displayBalance < 0 ? '#dc3545' : '#198754' }}>
                  {displayBalance < 0 ? '-' : ''}{fmt(Math.abs(displayBalance))}원
                </div>
                {/* 포인트 카드는 "이번 주기에 쓸 수 있는 포인트"와 "다음 주기로 넘겨둔(전환된)
                    포인트"가 서로 다른 돈이라, 위 잔고(둘을 합친 총액) 밑에 각각 얼마씩인지
                    색으로 구분해서 보여준다 — 전환해둔 게 있을 때만. */}
                {hasCarryover && (
                  <div className={`d-flex justify-content-end gap-1 amt-mask${hideAmounts ? ' amt-hidden' : ''}`} style={{ marginTop: 3 }}>
                    <span style={{ fontSize: '0.66rem', fontWeight: 600, color: '#198754', background: 'rgba(25,135,84,0.1)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>사용 {fmt(card.balance)}</span>
                    <span style={{ fontSize: '0.66rem', fontWeight: 600, color: '#b088f9', background: 'rgba(176,136,249,0.12)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>전환 {fmt(card.point_carryover)}</span>
                  </div>
                )}
              </>)
            })()}
          </div>
        </div>
        {card.point_reset_day && card.balance > 0 && card.balance <= 30000 && onConvert && (
          <button type="button" onClick={e => { e.stopPropagation(); onConvert() }}
            className={`amt-mask${hideAmounts ? ' amt-hidden' : ''}`}
            style={{ width: '100%', marginBottom: 10, padding: '6px 0', borderRadius: 8, border: '1.5px dashed #d4a300', background: 'rgba(255,193,7,0.1)', color: '#b08900', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            ⚠️ 남은 포인트 {fmt(card.balance)}원 · 초기화 전 전환하기
          </button>
        )}
        <div className="d-flex mb-3" style={{ gap: 1 }}>
          {isLoan ? (<>
            <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>초기 대출금액</div>
              <div className="text-danger" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(Math.abs(card.initial_balance))}</div>
            </div>
            <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>상환 금액</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#198754' }}>{fmt(card.total_repaid || 0)}</div>
            </div>
            <div className="text-center flex-fill">
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>상환률</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b088f9' }}>
                {card.initial_balance ? Math.min(100, Math.round((card.total_repaid || 0) / Math.abs(card.initial_balance) * 100)) : 0}%
              </div>
            </div>
          </>) : (<>
            {card.cashback_type && (
              <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>캐시백 금액</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#b08900' }}>{fmt(card.total_cashback || 0)}</div>
              </div>
            )}
            <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>이달 수입</div>
              <div className="text-success" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(card.total_income)}</div>
            </div>
            <div className="text-center flex-fill">
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>이달 지출</div>
              <div className="text-danger" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{fmt(card.total_expense)}</div>
            </div>
          </>)}
        </div>
        <div className="border-top pt-2">
          {isLoan ? (
            <div>
              {(() => {
                const loanAmt = Math.abs(card.initial_balance || 0)
                const repaid = card.total_repaid || 0
                const pct = loanAmt ? Math.min(100, Math.round(repaid / loanAmt * 100)) : 0
                return (<>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>상환 현황</span>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>{fmt(repaid)} / {fmt(loanAmt)}원</span>
                  </div>
                  <div className="progress" style={{ height: 7, borderRadius: 4 }}>
                    <div className="progress-bar bg-success" style={{ width: `${pct}%`, borderRadius: 4 }} />
                  </div>
                  <div className="text-end mt-1" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pct}%</div>
                </>)
              })()}
              <div className="mt-2" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onPointerDown={e => e.stopPropagation()} onClick={toggleRepay}
                  style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: repayOpen ? '#f0eaff' : 'rgba(176,136,249,0.12)', color: '#b088f9', fontWeight: 700, cursor: 'pointer' }}>
                  {repayOpen ? '닫기' : '💰 상환'}
                </button>
              </div>
              {repayOpen && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border-light)', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
                  <form onSubmit={addRepay} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: accountCards.length > 0 ? 6 : 0 }}>
                      <div style={{ flex: 2 }}>
                        <DatePickerSheet value={repayForm.date} onChange={date => setRepayForm(f => ({ ...f, date }))} />
                      </div>
                      <input type="text" inputMode="numeric" placeholder="금액" value={repayForm.amount} required
                        onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setRepayForm(f => ({ ...f, amount: v })) }}
                        style={{ flex: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e0d5ff', fontSize: '0.82rem', background: 'var(--bg-accent)', color: 'var(--text-primary)' }} />
                      <button type="submit" disabled={repayLoading}
                        style={{ flex: 1, borderRadius: 8, border: 'none', background: '#b088f9', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                        {repayLoading ? '...' : '등록'}
                      </button>
                    </div>
                    {accountCards.length > 0 && (
                      <div className="no-press-scale"
                        onMouseDown={() => setRepayCardPickerPressed(true)}
                        onMouseUp={() => setRepayCardPickerPressed(false)}
                        onMouseLeave={() => setRepayCardPickerPressed(false)}
                        onTouchStart={() => setRepayCardPickerPressed(true)}
                        onTouchEnd={() => setRepayCardPickerPressed(false)}
                        onTouchCancel={() => setRepayCardPickerPressed(false)}
                        style={{ position: 'relative', transform: repayCardPickerPressed ? 'scale(0.94)' : 'scale(1)', opacity: repayCardPickerPressed ? 0.8 : 1, transition: 'transform 0.1s ease, opacity 0.1s ease' }}>
                        <CardPicker
                          cards={accountCards}
                          value={repayForm.card}
                          onChange={name => setRepayForm(f => ({ ...f, card: name }))}
                          placeholder="카드/계좌 (선택사항)"
                        />
                        {repayForm.card && (
                          <button type="button" onClick={() => setRepayForm(f => ({ ...f, card: '' }))}
                            style={{ position: 'absolute', right: 36, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px', zIndex: 1 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </form>
                  {repayments.length === 0
                    ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>상환 내역 없음</div>
                    : repayments.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 6 }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{r.date}</span>
                        {r.memo && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.memo}</span>}
                        {!r.memo && <span style={{ flex: 1 }} />}
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b088f9', flexShrink: 0 }}>-{fmt(r.amount)}원</span>
                        <button onClick={() => deleteRepay(r.id)}
                          style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: 'none', background: '#fff0f0', color: '#dc3545', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          ) : (
            <div onClick={e => { e.stopPropagation(); onPerfClick?.() }} style={{ cursor: onPerfClick ? 'pointer' : 'default' }}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>이달 실적</span>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>{fmt(card.spent)} / {fmt(card.target)}원</span>
              </div>
              <div className="progress" style={{ height: 7, borderRadius: 4 }}>
                <div className={`progress-bar ${tierClass(card.percent, card.tier1, card.tier2, card.tier3)}`}
                  style={{ width: `${card.percent}%`, borderRadius: 4 }} />
              </div>
              <div className="text-end mt-1" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{card.percent}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SavingsItem({ item, onEdit, onDelete, onDepositChange, dnd, hideAmounts = false }) {
  const am = `amt-mask${hideAmounts ? ' amt-hidden' : ''}`
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const cardRef = useRef(null)
  const mouseDown = useRef(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [deposits, setDeposits] = useState([])
  const [depForm, setDepForm] = useState({ amount: '', date: today(), memo: '' })
  const [depLoading, setDepLoading] = useState(false)
  const [countEditOpen, setCountEditOpen] = useState(false)
  const [countEditVal, setCountEditVal] = useState('')

  async function loadDeposits() {
    const res = await api.get(`/api/savings/${item.id}/deposits`)
    setDeposits(res || [])
  }

  function toggleDeposit() {
    if (!depositOpen) loadDeposits()
    setDepositOpen(o => !o)
  }

  async function addDeposit(e) {
    e.preventDefault()
    setDepLoading(true)
    await api.post(`/api/savings/${item.id}/deposits`, { amount: Number(depForm.amount) || 0, date: depForm.date, memo: depForm.memo })
    setDepForm({ amount: '', date: today(), memo: '' })
    await loadDeposits()
    setDepLoading(false)
    if (onDepositChange) onDepositChange()
  }

  async function deleteDeposit(did) {
    await api.delete(`/api/savings/deposits/${did}`)
    await loadDeposits()
    if (onDepositChange) onDepositChange()
  }

  async function handlePauseToggle(e) {
    e.stopPropagation()
    if (item.is_paused) {
      await api.put(`/api/savings/${item.id}`, { is_paused: false, manual_count: null })
    } else {
      await api.put(`/api/savings/${item.id}`, { is_paused: true, manual_count: item.months_elapsed })
    }
    if (onDepositChange) onDepositChange()
  }

  async function handleCountSave(e) {
    e.stopPropagation()
    const n = parseInt(countEditVal)
    if (isNaN(n) || n < 0) return
    await api.put(`/api/savings/${item.id}`, { manual_count: n })
    setCountEditOpen(false)
    if (onDepositChange) onDepositChange()
  }

  async function handleCountAuto(e) {
    e.stopPropagation()
    await api.put(`/api/savings/${item.id}`, { manual_count: null })
    setCountEditOpen(false)
    if (onDepositChange) onDepositChange()
  }

  const onDragStart = e => {
    if (countEditOpen || dnd?.isDragging) return
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (dnd?.isDragging) { startX.current = null; return }
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx; const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (dnd?.isDragging) { startX.current = null; setOffsetX(0); return }
    if (startX.current === null) return
    const cur = offsetX; startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }
  const onSwipeTouchStart = e => { dnd?.listeners?.onTouchStart?.(e); onDragStart(e) }
  const onSwipeMouseDown = e => { dnd?.listeners?.onMouseDown?.(e); onDragStart(e) }

  const logo = bankLogo(item.bank || item.name)
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)
  const isCheongYak = item.stype === '청약'
  const dDayText = isCheongYak ? `납입 ${item.months_elapsed}회` : item.d_day > 0 ? `D-${item.d_day}` : item.d_day === 0 ? 'D-Day' : `D+${Math.abs(item.d_day)}`
  const dDayColor = isCheongYak ? '#198754' : item.d_day < 0 ? '#198754' : item.d_day < 30 ? '#dc3545' : '#b088f9'

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem', flexShrink: 0 }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'var(--bg-card)', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onSwipeTouchStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onSwipeMouseDown} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <div className="d-flex justify-content-between align-items-center mb-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
          <div className="d-flex align-items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
            {logo && <img src={logo} style={{ height: 26, width: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />}
            <span className="fw-semibold" style={{ wordBreak: 'keep-all' }}>{item.name}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: item.stype === '예금' ? '#e8f4fd' : item.stype === '청약' ? '#e8fdf0' : '#f0e8fd', color: item.stype === '예금' ? '#0d6efd' : item.stype === '청약' ? '#198754' : '#b088f9', flexShrink: 0, whiteSpace: 'nowrap' }}>{item.stype}</span>
            {!isCheongYak && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: 'var(--bg-section)', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{item.interest_type || '단리'}</span>}
            {(isCheongYak || item.stype === '적금') && item.notify_day && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#fff3cd', color: '#856404', flexShrink: 0, whiteSpace: 'nowrap' }}>🔔 {item.notify_day}일</span>}
            {item.stype !== '예금' && item.is_paused && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#fff0e0', color: '#c8630a', flexShrink: 0, whiteSpace: 'nowrap' }}>⏸ 일시정지</span>}
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: dDayColor, flexShrink: 0, whiteSpace: 'nowrap' }}>{dDayText}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.stype === '예금' ? '예치금액' : '월 납입액'}</div>
            <div className={am} style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmt(item.amount)}원</div>
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isCheongYak ? '납입 회차' : '연 이율'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{isCheongYak ? `${item.months_elapsed}회` : `${item.interest_rate}%`}</div>
          </div>
          <div className="text-center flex-fill">
            {isCheongYak
              ? (<><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>총 납입액</div><div className={am} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#198754' }}>{fmt(item.current_paid)}원</div></>)
              : (<><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>만기 수령 <span style={{ fontSize: '0.65rem', color: '#b088f9' }}>(세후)</span></div><div className={am} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#198754' }}>{fmt(item.maturity_after_tax)}원</div></>)
            }
          </div>
        </div>
        {item.stype === '적금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span className={am}>납입 {fmt(item.current_paid)} / {fmt(item.total_paid)}원</span>
            <span className={am}>세후 이자 +{fmt(item.interest_after_tax)}원</span>
          </div>
        )}
        {item.stype === '적금' && item.bonus_amount > 0 && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: '#0d6efd' }}>
            <span className={am}>🎁 정부 지원금 {fmt(item.bonus_amount)}원/월</span>
            <span className={am}>만기 지원금 합계 +{fmt(item.bonus_total)}원</span>
          </div>
        )}
        {isCheongYak && !countEditOpen && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {item.months_elapsed}회차 납입 중
              {item.manual_count != null && <span style={{ fontSize: '0.62rem', color: '#b088f9', fontWeight: 700 }}>수동</span>}
              <button onClick={e => { e.stopPropagation(); setCountEditVal(String(item.months_elapsed)); setCountEditOpen(true) }}
                style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 6, border: 'none', background: '#f0eaff', color: '#b088f9', fontWeight: 700, cursor: 'pointer', marginLeft: 2 }}>✏ 수정</button>
            </span>
            <span className={am}>납입액 {fmt(item.current_paid)}원</span>
          </div>
        )}
        {isCheongYak && countEditOpen && (
          <div className="d-flex align-items-center mb-1" style={{ gap: 6, fontSize: '0.8rem' }} onClick={e => e.stopPropagation()}>
            <input type="number" min="0" value={countEditVal} onChange={e => setCountEditVal(e.target.value)}
              style={{ width: 64, padding: '3px 8px', borderRadius: 8, border: '1.5px solid #b088f9', fontSize: '0.85rem', textAlign: 'center' }} />
            <span style={{ color: '#888', fontSize: '0.75rem' }}>회</span>
            <button onClick={handleCountSave} style={{ padding: '3px 10px', borderRadius: 8, border: 'none', background: '#b088f9', color: 'white', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>저장</button>
            {item.manual_count != null && (
              <button onClick={handleCountAuto} style={{ padding: '3px 8px', borderRadius: 8, border: 'none', background: 'var(--bg-section)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>자동</button>
            )}
            <button onClick={e => { e.stopPropagation(); setCountEditOpen(false) }} style={{ padding: '3px 8px', borderRadius: 8, border: 'none', background: 'var(--bg-section)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>취소</button>
          </div>
        )}
        {item.stype === '예금' && (
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>{item.months_total}개월 · {item.tax_type}</span>
            <span className={am}>세후 이자 +{fmt(item.interest_after_tax)}원</span>
          </div>
        )}
        {!isCheongYak && (
          <>
            <div className="progress" style={{ height: 7, borderRadius: 4 }}>
              <div className="progress-bar" style={{ width: `${item.progress}%`, background: 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 4 }} />
            </div>
            <div className="d-flex justify-content-between mt-1">
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.start_date}</span>
              <span style={{ fontSize: '0.7rem', color: '#b088f9', fontWeight: 600 }}>{item.progress}%</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.end_date}</span>
            </div>
            {item.stype === '적금' && (
              <div className="mt-1" style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={handlePauseToggle}
                  style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: item.is_paused ? '#fff0e0' : 'var(--bg-section)', color: item.is_paused ? '#c8630a' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}>
                  {item.is_paused ? '▶ 재개' : '⏸ 일시정지'}
                </button>
                <button onClick={e => { e.stopPropagation(); toggleDeposit() }}
                  style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: '#e8fdf0', color: '#198754', fontWeight: 700, cursor: 'pointer' }}>
                  {depositOpen ? '닫기' : '+ 추가 입금'}
                </button>
              </div>
            )}
          </>
        )}
        {isCheongYak && (
          <div className="mt-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#aaa' }}>시작일 {item.start_date}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handlePauseToggle}
                style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: item.is_paused ? '#fff0e0' : 'var(--bg-section)', color: item.is_paused ? '#c8630a' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}>
                {item.is_paused ? '▶ 재개' : '⏸ 일시정지'}
              </button>
              <button onClick={e => { e.stopPropagation(); toggleDeposit() }}
                style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, border: 'none', background: '#e8fdf0', color: '#198754', fontWeight: 700, cursor: 'pointer' }}>
                {depositOpen ? '닫기' : '+ 추가 입금'}
              </button>
            </div>
          </div>
        )}
        {(isCheongYak || item.stype === '적금') && depositOpen && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--border-light)', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
            <form onSubmit={addDeposit} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 2 }}>
                <DatePickerSheet value={depForm.date} onChange={date => setDepForm(f => ({ ...f, date }))} />
              </div>
              <input type="number" placeholder="금액" value={depForm.amount}
                onChange={e => setDepForm(f => ({ ...f, amount: e.target.value }))} required
                style={{ flex: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #c3f0d0', fontSize: '0.82rem' }} />
              <button type="submit" disabled={depLoading}
                style={{ flex: 1, borderRadius: 8, border: 'none', background: '#198754', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                등록
              </button>
            </form>
            {deposits.length === 0
              ? <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)', textAlign: 'center', padding: '6px 0' }}>추가 입금 내역 없음</div>
              : deposits.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.date}</span>
                  <span className={am} style={{ fontSize: '0.82rem', fontWeight: 700, color: '#198754' }}>+{fmt(d.amount)}원</span>
                  {d.memo && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.memo}</span>}
                  <button onClick={() => deleteDeposit(d.id)}
                    style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: 'none', background: '#fff0f0', color: '#dc3545', cursor: 'pointer' }}>삭제</button>
                </div>
              ))
            }
            {item.extra_deposit > 0 && (
              <div className={am} style={{ fontSize: '0.78rem', color: '#198754', fontWeight: 600, marginTop: 6 }}>
                추가 입금 합계: +{fmt(item.extra_deposit)}원
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SavingsSheet({ open, visible, onClose, onSaved, editItem }) {
  const bankScrollRef = useDragScrollX()
  const [stype, setStype] = useState('예금')
  const [itype, setItype] = useState('단리')
  const [taxType, setTaxType] = useState('일반과세')
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [notifyDay, setNotifyDay] = useState('')
  const [nameError, setNameError] = useState(false)
  const [amountError, setAmountError] = useState(false)
  const [endDateError, setEndDateError] = useState(false)
  const [autoTx, setAutoTx] = useState(false)
  const [autoTxDay, setAutoTxDay] = useState('')
  const [autoTxCard, setAutoTxCard] = useState('')
  const [weekendAdjust, setWeekendAdjust] = useState('next')
  const [excludeStats, setExcludeStats] = useState(false)
  const [bonusAmount, setBonusAmount] = useState('')
  const [withdrawCard, setWithdrawCard] = useState('')
  const [cards, setCards] = useState([])

  useEffect(() => {
    if (!open) return
    setNameError(false); setAmountError(false); setEndDateError(false)
    api.get('/api/budget').then(d => setCards(d.card_stats || [])).catch(() => {})
    if (editItem) {
      setStype(editItem.stype || '예금')
      setItype(editItem.interest_type || '단리')
      const _tt = editItem.tax_type || '일반과세'
      setTaxType(['ISA', 'ISA(신탁형)', 'ISA(중개형)', 'ISA(일임형)'].includes(_tt) ? 'ISA(일반형)' : _tt)
      setSelected(editItem.bank || '')
      setName(editItem.name || '')
      setAmount(editItem.amount ? String(editItem.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')
      setRate(String(editItem.interest_rate ?? ''))
      setStartDate(editItem.start_date || today())
      setEndDate(editItem.end_date || '')
      setNotifyDay(editItem.notify_day ? String(editItem.notify_day) : '')
      setAutoTx(!!editItem.auto_tx)
      setAutoTxDay(editItem.auto_tx_day ? String(editItem.auto_tx_day) : '')
      setAutoTxCard(editItem.auto_tx_card || '')
      setWeekendAdjust(editItem.weekend_adjust || 'next')
      setExcludeStats(!!editItem.exclude_stats)
      setBonusAmount(editItem.bonus_amount ? String(editItem.bonus_amount) : '')
    } else {
      setStype('예금'); setItype('단리'); setTaxType('일반과세'); setSelected(''); setName(''); setAmount(''); setRate(''); setStartDate(today()); setEndDate(''); setNotifyDay(''); setAutoTx(false); setAutoTxDay(''); setAutoTxCard(''); setWeekendAdjust('next'); setExcludeStats(false); setBonusAmount(''); setWithdrawCard('')
    }
  }, [open, editItem])

  function pickBank(bankName) { setSelected(bankName); setName(bankName) }

  async function handleSubmit(e) {
    e.preventDefault()
    const isCheongYak = stype === '청약'
    const nameOk = !!name.trim()
    const amountOk = (parseInt(amount.replace(/,/g, '')) || 0) > 0
    const endDateOk = isCheongYak || !!endDate
    setNameError(!nameOk)
    setAmountError(!amountOk)
    setEndDateError(!endDateOk)
    if (!nameOk || !amountOk || !endDateOk) return
    const payload = {
      stype,
      interest_type: itype,
      tax_type: taxType,
      bank: selected,
      name: name.trim(),
      amount: parseInt(amount.replace(/,/g, '')) || 0,
      interest_rate: parseFloat(rate) || 0,
      start_date: startDate,
      end_date: isCheongYak ? '' : endDate,
      notify_day: (isCheongYak || stype === '적금') && notifyDay ? parseInt(notifyDay) : null,
      auto_tx: (isCheongYak || stype === '적금') ? autoTx : false,
      auto_tx_day: autoTx && autoTxDay ? parseInt(autoTxDay) : null,
      auto_tx_card: autoTx ? autoTxCard : '',
      weekend_adjust: weekendAdjust,
      exclude_stats: excludeStats,
      bonus_amount: stype === '적금' && bonusAmount ? parseInt(bonusAmount.replace(/,/g, '')) : null,
    }
    if (editItem) await api.put(`/api/savings/${editItem.id}`, payload)
    else await api.post('/api/savings', { ...payload, withdraw_card: withdrawCard })
    onSaved(); onClose()
  }

  function applyDuration(months) {
    if (!startDate) return
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + months)
    setEndDate(d.toISOString().slice(0, 10))
  }

  if (!open) return null
  return createPortal(
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '예·적금 수정' : '예·적금 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1 }}>
          <form id="savings-form" onSubmit={handleSubmit}>
            <div className="d-flex gap-2 mb-3">
              {['예금', '적금', '청약'].map(t => (
                <button key={t} type="button" onClick={() => { setStype(t); if (t === '청약') setTaxType('비과세') }}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${stype === t ? '#b088f9' : 'var(--border-light)'}`, background: stype === t ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: stype === t ? '#b088f9' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>은행</p>
            <div ref={bankScrollRef} data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
              {BANKS.map(([bname, logo, label]) => (
                <BankBtn key={bname} bankName={bname} logo={logo} label={label} selected={selected} onPick={pickBank} />
              ))}
            </div>
            <input type="text" className={`form-control${nameError ? ' field-invalid' : ''} mb-1`} placeholder="이름 (위 선택 시 자동 입력, 수정 가능)"
              value={name} onChange={e => { setName(e.target.value); setNameError(false) }} style={{ borderRadius: 10 }} />
            {nameError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>이름을 입력해 주세요</div>}
            <div className="mb-1" style={{ position: 'relative' }}>
              <input type="text" className={`form-control${amountError ? ' field-invalid' : ''}`} placeholder={stype === '예금' ? '예치금액' : stype === '청약' ? '월 납입액 (2~50만원)' : '월 납입액'} inputMode="numeric"
                value={amount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setAmount(v); setAmountError(false) }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            {amountError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>금액을 입력해 주세요</div>}
            {!editItem && (
              <div className="mb-2">
                <CardPicker
                  cards={cards}
                  value={withdrawCard}
                  onChange={setWithdrawCard}
                  placeholder="출금 계좌 (선택사항)"
                />
                {withdrawCard && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, paddingLeft: 2 }}>
                    저장 시 {withdrawCard}에서 {amount || '0'}원이 자동으로 차감됩니다
                  </div>
                )}
              </div>
            )}
            <div className="d-flex gap-2 mb-2">
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="text" inputMode="decimal" className="form-control" placeholder="연 이율 (없으면 0)"
                  value={rate} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setRate(v) }}
                  style={{ borderRadius: 10, paddingRight: 28 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>%</span>
              </div>
              {['단리', '복리'].map(t => (
                <button key={t} type="button" onClick={() => setItype(t)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 10, border: `2px solid ${itype === t ? '#b088f9' : 'var(--border-light)'}`, background: itype === t ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: itype === t ? '#b088f9' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 mb-2">
              {[['일반과세', '15.4%'], ['세금우대', '9.9%'], ['ISA', '9.9%'], ['비과세', '0%']].map(([t, label]) => {
                const isISA = t === 'ISA'
                const active = isISA ? taxType.startsWith('ISA') : taxType === t
                return (
                  <button key={t} type="button" onClick={() => setTaxType(isISA ? (taxType.startsWith('ISA') ? taxType : 'ISA(신탁형)') : t)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `2px solid ${active ? '#7baff0' : 'var(--border-light)'}`, background: active ? 'rgba(123,175,240,0.1)' : 'var(--bg-card)', color: active ? '#5a9fd4' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                    {t}<br /><span style={{ fontSize: '0.68rem', fontWeight: 400 }}>{label}</span>
                  </button>
                )
              })}
            </div>
            {taxType.startsWith('ISA') && (
              <div className="mb-3">
                <div className="d-flex gap-2 mb-2">
                  {[['일반형', '비과세 200만원'], ['서민형', '비과세 400만원']].map(([sub, desc]) => (
                    <button key={sub} type="button" onClick={() => setTaxType(`ISA(${sub})`)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `2px solid ${taxType === `ISA(${sub})` ? '#7baff0' : 'var(--border-light)'}`, background: taxType === `ISA(${sub})` ? 'rgba(123,175,240,0.1)' : 'var(--bg-card)', color: taxType === `ISA(${sub})` ? '#5a9fd4' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                      {sub}<br /><span style={{ fontSize: '0.66rem', fontWeight: 400 }}>{desc}</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  <span style={{ fontWeight: 600, color: '#5a9fd4' }}>ISA 계좌 내 예금·적금</span>은 <span style={{ fontWeight: 600 }}>신탁형 ISA</span>에서만 가입 가능<br />
                  (중개형·일임형은 주식·ETF·펀드만 가능, 예금·적금 불가)<br />
                  비과세 한도 초과분에만 9.9% 분리과세 적용
                </div>
              </div>
            )}
            <div className="d-flex gap-2 mb-2">
              <div className="flex-fill">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>시작일</label>
                <DatePickerSheet value={startDate} onChange={setStartDate} />
              </div>
              {stype !== '청약' && (
                <div className="flex-fill">
                  <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>만기일</label>
                  <DatePickerSheet value={endDate} onChange={d => { setEndDate(d); setEndDateError(false) }} error={endDateError} />
                  {endDateError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 4 }}>만기일을 선택해 주세요</div>}
                </div>
              )}
            </div>
            {stype !== '청약' && (
              <div className="d-flex gap-2 mb-3">
                {[['6개월', 6], ['1년', 12], ['2년', 24], ['3년', 36]].map(([label, months]) => (
                  <button key={label} type="button" onClick={() => applyDuration(months)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid var(--border-input)', background: 'var(--bg-card)', color: '#b088f9', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(stype === '청약' || stype === '적금') && (
              <div className="mb-3">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>🔔 납입일 알림</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" className="form-control" placeholder="알림 없음" min="1" max="31"
                    value={notifyDay} onChange={e => setNotifyDay(e.target.value)} style={{ borderRadius: 10, paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                </div>
                <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>입력 시 해당 날짜 오전 9시에 납입 알림을 받습니다. 알림을 받으려면 설정에서 알림을 켜주세요.</p>
              </div>
            )}
            {stype === '적금' && (
              <div className="mb-3">
                <label className="text-muted mb-1 d-block" style={{ fontSize: '0.75rem' }}>🎁 월 정부 지원금 <span style={{ color: '#aaa', fontWeight: 400 }}>(청년도약·내일저축 등, 없으면 비워두세요)</span></label>
                <div style={{ position: 'relative' }}>
                  <input type="text" className="form-control" placeholder="없음" inputMode="numeric"
                    value={bonusAmount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setBonusAmount(v) }}
                    style={{ borderRadius: 10, paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              </div>
            )}
            {(stype === '적금' || stype === '청약') && (
              <div className="mb-3" style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: autoTx ? 10 : 0 }}>
                  <input type="checkbox" checked={autoTx} onChange={e => setAutoTx(e.target.checked)} />
                  🔄 자동이체 등록
                </label>
                {autoTx && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                      <input type="number" className="form-control" placeholder="이체일 (몇 일)" min="1" max="31"
                        value={autoTxDay} onChange={e => setAutoTxDay(e.target.value)}
                        style={{ borderRadius: 10, paddingRight: 36, fontSize: '0.88rem' }} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                    </div>
                    <div>
                      <label className="text-muted mb-1 d-block" style={{ fontSize: '0.72rem' }}>이체일이 주말이면</label>
                      <div className="d-flex gap-2">
                        {[['next', '다음 영업일'], ['prev', '이전 영업일']].map(([v, label]) => (
                          <button key={v} type="button" onClick={() => setWeekendAdjust(v)}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1.5px solid ${weekendAdjust === v ? '#b088f9' : 'var(--border-light)'}`, background: weekendAdjust === v ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: weekendAdjust === v ? '#b088f9' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <CardPicker
                      cards={cards}
                      value={autoTxCard}
                      onChange={setAutoTxCard}
                      placeholder="카드/계좌 선택 (선택사항)"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="mb-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setExcludeStats(v => !v)}>
                <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>📊 통계에서 제외</label>
                <div className="ios-toggle">
                  <div className={`ios-track${excludeStats ? ' on' : ''}`} />
                  <div className={`ios-dot${excludeStats ? ' on' : ''}`} />
                </div>
              </div>
            </div>
          </form>
        </div>
        <div style={{ padding: '12px 0 calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
          <button type="submit" form="savings-form" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>
            {editItem ? '수정하기' : '추가하기'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function GoalSheet({ open, visible, onClose, onSaved, editItem, savingsList, investmentList, accountList }) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [mode, setMode] = useState('manual') // 'manual' | 'auto'
  const [linkIds, setLinkIds] = useState([])
  const holdingValue = i => (i.current_value || 0) + (i.realized_sales || 0)
  const linkOptions = [
    ...savingsList.map(s => ({ token: 's' + s.id, label: `${s.bank} ${s.name}`.trim(), sub: '예·적금', value: s.amount, icon: 'bi-piggy-bank' })),
    ...(accountList || []).map(a => {
      const held = (investmentList || []).filter(i => i.account_id === a.id)
      return { token: 'a' + a.id, label: a.name, sub: `투자 계좌 · 종목 ${held.length}개`, value: a.balance || 0, icon: 'bi-bank' }
    }),
    ...(investmentList || []).map(i => ({ token: 'i' + i.id, label: i.name, sub: '투자', value: holdingValue(i), icon: 'bi-graph-up', accountId: i.account_id })),
  ]
  // 선택한 계좌 안의 종목은 계좌 값에 이미 들어 있으므로 중복으로 더하지 않는다
  const selectedAccountIds = linkIds.filter(t => t[0] === 'a').map(t => Number(t.slice(1)))
  const linkTotal = linkOptions
    .filter(o => linkIds.includes(o.token) && !(o.token[0] === 'i' && selectedAccountIds.includes(o.accountId)))
    .reduce((sum, o) => sum + (o.value || 0), 0)
  const [manualAmount, setManualAmount] = useState('')
  const [nameError, setNameError] = useState(false)
  const [targetError, setTargetError] = useState(false)

  useEffect(() => {
    if (!open) return
    setNameError(false); setTargetError(false)
    if (editItem) {
      setName(editItem.name || '')
      setTargetAmount(editItem.target_amount ? String(editItem.target_amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')
      setTargetDate(editItem.target_date || '')
      setMode(editItem.link_ids?.length ? 'auto' : 'manual')
      setLinkIds(editItem.link_ids || [])
      setManualAmount(editItem.manual ? String(editItem.current_amount || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')
    } else {
      setName(''); setTargetAmount(''); setTargetDate(''); setMode('manual'); setLinkIds([]); setManualAmount('')
    }
  }, [open, editItem])

  async function handleSubmit(e) {
    e.preventDefault()
    const nameOk = !!name.trim()
    const targetOk = (parseInt(targetAmount.replace(/,/g, '')) || 0) > 0
    setNameError(!nameOk)
    setTargetError(!targetOk)
    if (!nameOk || !targetOk) return
    const payload = {
      name: name.trim(),
      target_amount: parseInt(targetAmount.replace(/,/g, '')) || 0,
      target_date: targetDate || null,
      link_ids: mode === 'auto' ? linkIds : [],
      manual_amount: mode === 'manual' ? (parseInt(manualAmount.replace(/,/g, '')) || 0) : 0,
    }
    if (editItem) await api.put(`/api/savings-goals/${editItem.id}`, payload)
    else await api.post('/api/savings-goals', payload)
    onSaved(); onClose()
  }

  if (!open) return null
  return createPortal(
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '저축 목표 수정' : '저축 목표 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, paddingTop: 4 }}>
          <form id="goal-form" onSubmit={handleSubmit}>
            <input type="text" className={`form-control${nameError ? ' field-invalid' : ''} mb-1`} placeholder="목표 이름 (예: 여행 자금)"
              value={name} onChange={e => { setName(e.target.value); setNameError(false) }} style={{ borderRadius: 10 }} />
            {nameError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>이름을 입력해 주세요</div>}
            <div className="mb-1" style={{ position: 'relative' }}>
              <input type="text" className={`form-control${targetError ? ' field-invalid' : ''}`} placeholder="목표 금액" inputMode="numeric"
                value={targetAmount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setTargetAmount(v); setTargetError(false) }} style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            {targetError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>목표 금액을 입력해 주세요</div>}
            <p className="mb-1 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>목표일 (선택)</p>
            <div className="mb-3">
              <DatePickerSheet value={targetDate} onChange={setTargetDate} />
              {targetDate && (
                <button type="button" onClick={() => setTargetDate('')}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.76rem', padding: '4px 2px', cursor: 'pointer' }}>날짜 지우기</button>
              )}
            </div>
            <p className="mb-2 text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>진행률 관리 방식</p>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4, borderRadius: 14, background: 'var(--bg-section)', marginBottom: 14 }}>
              <div style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', borderRadius: 11, background: 'var(--bg-card)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transform: mode === 'auto' ? 'translateX(100%)' : 'translateX(0)', transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
              {[['manual', 'bi-pencil-square', '직접 입력', '금액을 직접 기록'], ['auto', 'bi-link-45deg', '계좌·투자 연결', '잔액·평가액으로 자동 반영']].map(([v, icon, label, sub]) => (
                <button key={v} type="button" onClick={() => setMode(v)}
                  style={{ position: 'relative', border: 'none', background: 'transparent', padding: '9px 6px', textAlign: 'center', cursor: 'pointer', color: mode === v ? '#b088f9' : 'var(--text-muted)', transition: 'color 0.25s ease' }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700 }}><i className={`bi ${icon} me-1`} />{label}</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.8, marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>
            {mode === 'auto' ? (
              linkOptions.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>연결할 예·적금이나 투자가 없습니다 — 먼저 추가해 주세요</div>
              ) : (
                <div className="mb-3">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {linkOptions.map(o => {
                      const on = linkIds.includes(o.token)
                      return (
                        <button key={o.token} type="button" onClick={() => setLinkIds(ids => ids.includes(o.token) ? ids.filter(x => x !== o.token) : [...ids, o.token])}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${on ? '#b088f9' : 'var(--border-light)'}`, background: on ? 'rgba(176,136,249,0.08)' : 'var(--bg-card)', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className={`bi ${o.icon}`} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{o.sub} · {fmt(o.value)}원</div>
                          </div>
                          <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ color: on ? '#b088f9' : 'var(--border-input)', fontSize: '1.1rem', flexShrink: 0 }} />
                        </button>
                      )
                    })}
                  </div>
                  {linkIds.length > 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#b088f9', fontWeight: 600, marginTop: 8, textAlign: 'right' }}>
                      {linkIds.length}개 선택 · 합계 {fmt(linkTotal)}원
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="mb-1" style={{ position: 'relative' }}>
                <input type="text" className="form-control" placeholder="지금까지 모은 금액 (선택, 나중에 추가 가능)" inputMode="numeric"
                  value={manualAmount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setManualAmount(v) }} style={{ borderRadius: 10, paddingRight: 36 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
            )}
          </form>
        </div>
        <div style={{ padding: '12px 0 calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
          <button type="submit" form="goal-form" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>
            {editItem ? '수정하기' : '추가하기'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function AddGoalAmountModal({ goal, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  async function handleAdd() {
    const val = parseInt(amount.replace(/,/g, '')) || 0
    if (!val) return
    await api.post(`/api/savings-goals/${goal.id}/add`, { amount: val })
    onSaved(); onClose()
  }
  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '20px', width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <p className="fw-semibold mb-3" style={{ fontSize: '0.95rem' }}>{goal.name}에 금액 추가</p>
        <div className="mb-3" style={{ position: 'relative' }}>
          <input type="text" className="form-control" placeholder="추가할 금액" inputMode="numeric" autoFocus
            value={amount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setAmount(v) }}
            style={{ borderRadius: 10, paddingRight: 36 }} />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
        </div>
        <div className="d-flex gap-2">
          <button onClick={handleAdd} className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>추가</button>
          <button onClick={onClose} className="btn btn-outline-secondary flex-fill" style={{ borderRadius: 10 }}>취소</button>
        </div>
      </div>
    </div>
  )
}

const ITYPE_COLORS = {
  '국내주식': { bg: '#fff0f4', color: '#e84393' },
  '해외주식': { bg: '#fff4e8', color: '#e87000' },
  '펀드': { bg: '#e8f8f0', color: '#1a7a4a' },
  '코인': { bg: '#fffbe8', color: '#c9960a' },
  'ETF': { bg: '#e8f4ff', color: '#0d6efd' },
  '기타': { bg: '#f2f2f7', color: '#666' },
}
const ITYPE_ICONS = { '국내주식': '🇰🇷', '해외주식': '🌎', '펀드': '💼', '코인': '₿', 'ETF': '📊', '기타': '📦' }
const ITYPE_UNITS = { '국내주식': '주', '해외주식': '주', '펀드': '좌', '코인': '개', 'ETF': '주', '기타': '' }
const INV_ACCOUNT_COLORS = { ISA: '#5a9fd4', '연금저축': '#8b5cf6', IRP: '#e87000' }
const INV_TYPE_FILTERS = ['국내주식', '해외주식', '펀드', '코인', 'ETF', '기타']
const INV_TYPE_FILTER_SHORT = { '국내주식': '국내', '해외주식': '해외' }
const INV_ACCOUNT_FILTERS = ['ISA', '연금저축', 'IRP']
const INV_FILTERS = [...INV_TYPE_FILTERS, ...INV_ACCOUNT_FILTERS]
function matchesInvFilter(item, filter) {
  return filter === 'all' || filter.includes(item.itype) || filter.includes(item.account_type)
}

function InvestmentItem({ item, onEdit, onDelete, dnd, hideAmounts = false }) {
  const am = `amt-mask${hideAmounts ? ' amt-hidden' : ''}`
  const startX = useRef(null)
  const startY = useRef(null)
  const [offsetX, setOffsetX] = useState(0)
  const horiz = useRef(false)
  const cardRef = useRef(null)
  const mouseDown = useRef(false)

  const onDragStart = e => {
    if (dnd?.isDragging) return
    if (e.touches) {
      const cx = e.touches[0].clientX
      const wrap = e.currentTarget.closest('.page-wrap')
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, width: window.innerWidth }
      if (cx - rect.left < 80 || cx - rect.left > rect.width - 80) return
      startX.current = cx; startY.current = e.touches[0].clientY; horiz.current = false
    } else {
      startX.current = e.clientX; startY.current = e.clientY; horiz.current = true
      mouseDown.current = true; setOffsetX(0)
    }
  }
  const onDragMove = e => {
    if (dnd?.isDragging) { startX.current = null; return }
    if (startX.current === null) return
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const dx = startX.current - cx; const dy = startY.current - cy
    if (!horiz.current) {
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return }
      if (Math.abs(dx) > 8) horiz.current = true; else return
    }
    if (e.touches) e.preventDefault()
    const maxSlide = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 4) : 80
    setOffsetX(Math.max(-maxSlide, Math.min(maxSlide, -dx)))
  }
  const onDragEnd = () => {
    mouseDown.current = false
    if (dnd?.isDragging) { startX.current = null; setOffsetX(0); return }
    if (startX.current === null) return
    const cur = offsetX; startX.current = null
    const trigger = cardRef.current ? Math.floor(cardRef.current.offsetWidth / 8) : 40
    if (cur < -trigger) { setOffsetX(0); onDelete() }
    else if (cur > trigger) { setOffsetX(0); onEdit() }
    else setOffsetX(0)
  }
  const onSwipeTouchStart = e => { dnd?.listeners?.onTouchStart?.(e); onDragStart(e) }
  const onSwipeMouseDown = e => { dnd?.listeners?.onMouseDown?.(e); onDragStart(e) }

  const tc = ITYPE_COLORS[item.itype] || ITYPE_COLORS['기타']
  const icon = ITYPE_ICONS[item.itype] || '📦'
  const isProfit = item.profit >= 0
  const deleteWidth = Math.max(0, -offsetX)
  const editWidth = Math.max(0, offsetX)

  return (
    <div ref={cardRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 12 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: deleteWidth, background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-trash" style={{ fontSize: '1.15rem' }} /><span>삭제</span>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: editWidth, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'white', fontSize: '0.75rem', gap: 2, overflow: 'hidden' }}>
        <i className="bi bi-pencil" style={{ fontSize: '1.15rem' }} /><span>수정</span>
      </div>
      <div data-item-swipe style={{ position: 'relative', zIndex: 1, background: 'var(--bg-card)', padding: 16, transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.22s ease' : 'none', cursor: 'grab', userSelect: 'none' }}
        onTouchStart={onSwipeTouchStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
        onMouseDown={onSwipeMouseDown} onMouseMove={e => { if (mouseDown.current) onDragMove(e) }} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        <div className="d-flex justify-content-between align-items-center mb-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
          <div className="d-flex align-items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
            <span className="fw-semibold" style={{ fontSize: '0.95rem', wordBreak: 'keep-all' }}>{item.name}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: tc.bg, color: tc.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{item.itype}</span>
            {item.account_type && item.account_type !== '일반' && (() => {
              const atColor = INV_ACCOUNT_COLORS[item.account_type] || '#888'
              return <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${atColor}18`, color: atColor, flexShrink: 0, whiteSpace: 'nowrap' }}>{item.account_type}</span>
            })()}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>(수량 {item.quantity})</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{item.ticker || ''}</span>
        </div>
        <div className="d-flex mb-2" style={{ gap: 1 }}>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>매수금액</div>
            <div className={am} style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(item.purchase_value)}원</div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div className={am} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>(${(item.avg_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
          <div className="text-center flex-fill" style={{ borderRight: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>평가금액</div>
            <div className={am} style={{ fontSize: '0.9rem', fontWeight: 700 }}>{fmt(item.current_value)}원</div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div className={am} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>(${(item.current_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
          <div className="text-center flex-fill">
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>수익</div>
            <div className={am} style={{ fontSize: '0.9rem', fontWeight: 700, color: isProfit ? '#198754' : '#dc3545' }}>
              {isProfit ? '+' : ''}{fmt(item.profit)}원
            </div>
            {item.itype === '해외주식' && item.exchange_rate && (
              <div className={am} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({isProfit ? '+' : ''}${((item.current_price - item.avg_price) * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
            )}
          </div>
        </div>
        <div className="d-flex justify-content-between" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span className={am}>
            {item.itype === '해외주식'
              ? item.current_price
                ? `평단가 $${item.avg_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · 현재가 $${item.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `평단가 $${item.avg_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : item.current_price
                ? `평단가 ${fmt(item.avg_price)}원 · 현재가 ${fmt(item.current_price)}원`
                : item.avg_price ? `평단가 ${fmt(item.avg_price)}원` : ''
            }
          </span>
          <span style={{ color: isProfit ? '#198754' : '#dc3545', fontWeight: 600 }}>
            {isProfit ? '▲' : '▼'} {Math.abs(item.profit_pct).toFixed(2)}%
          </span>
        </div>
        <div className="d-flex justify-content-between mt-1" style={{ fontSize: '0.68rem', color: '#ccc' }}>
          {item.memo ? <span>{item.memo}</span> : <span />}
          {item.price_updated_at
            ? <span>🕒 {item.price_updated_at} 기준</span>
            : <span style={{ color: '#ffb347' }}>현재가 미입력</span>}
        </div>
      </div>
    </div>
  )
}

// 증권사(투자 계좌) 추가 — 투자 추가 창과 분리해서 따로 연다. 증권사 이름은 직접 입력하거나 목록에서 고른다
function AccountAddSheet({ open, onClose, onCreated }) {
  const [brokerName, setBrokerName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [cash, setCash] = useState('')
  const [openedAt, setOpenedAt] = useState('')
  const [principal, setPrincipal] = useState('')

  useEffect(() => {
    if (open) { setBrokerName(''); setNameError(false); setCash(''); setOpenedAt(''); setPrincipal('') }
  }, [open])

  async function save() {
    // 계좌 이름은 증권사 이름을 그대로 따른다
    const bn = brokerName.trim()
    if (!bn) { setNameError(true); return }
    const principalNum = parseInt(principal.replace(/,/g, '')) || 0
    const r = await api.post('/api/invest-accounts', { name: bn, broker: keyOfName(bn), broker_name: bn, opened_at: openedAt || null, principal: principalNum || null })
    const cashNum = parseInt(cash.replace(/,/g, '')) || 0
    if (cash.trim()) await api.put(`/api/invest-accounts/${r.id}`, { cash: cashNum })
    onCreated?.(r.id)
    onClose()
  }

  if (!open) return null
  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', padding: '20px 20px max(32px, calc(env(safe-area-inset-bottom) + 24px))' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">증권사 추가</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1 }}>&times;</button>
        </div>
        <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>증권사</p>
        <div style={{ marginBottom: 6 }}>
          <BrokerSearch value={brokerName} onChange={v => { setBrokerName(v); setNameError(false) }} />
        </div>
        {nameError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>위 증권사 칸에 목록에서 고르거나 이름을 입력해 주세요</div>}
        <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>계좌 개설일 (선택)</p>
        <div style={{ marginBottom: 10 }}><DatePickerSheet value={openedAt} onChange={setOpenedAt} center /></div>
        <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>투자 원금 (선택)</p>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input type="text" inputMode="numeric" value={principal} placeholder="처음 넣은 금액"
            onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setPrincipal(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
            style={{ width: '100%', borderRadius: 10, padding: '9px 12px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', paddingRight: 36 }} />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
        </div>
        <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>예수금 (선택)</p>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input type="text" inputMode="numeric" value={cash} placeholder="지금 계좌에 있는 현금"
            onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setCash(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
            style={{ width: '100%', borderRadius: 10, padding: '9px 36px 9px 12px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
        </div>
        <p className="text-muted mb-2" style={{ fontSize: '0.72rem' }}>입력하면 매수·매도에 따라 자동으로 계산되고, 예수금이 부족하면 매수가 막혀요.</p>
        <p className="text-muted mb-3" style={{ fontSize: '0.75rem' }}>로고 이미지는 계좌 카드의 수정 버튼에서 직접 올릴 수 있어요.</p>
        <div className="d-flex gap-2">
          <button className="btn flex-fill" onClick={save} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>추가</button>
          <button className="btn btn-outline-secondary flex-fill" onClick={onClose} style={{ borderRadius: 10 }}>취소</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// 계좌 상세 — 잔고·예수금·평가손익, 보유 종목, 최근 매매 기록
function AccountDetailSheet({ accountId, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  const [yearForm, setYearForm] = useState(null) // { year, end, net, editing } 연도별 기록 입력
  function refresh() {
    return api.get(`/api/invest-accounts/${accountId}/detail`).then(setD).catch(e => setErr(e?.message || '불러오지 못했습니다'))
  }
  useEffect(() => {
    if (!accountId) return
    setD(null); setErr(''); setYearForm(null)
    refresh()
  }, [accountId])

  async function saveYear() {
    const y = parseInt(yearForm.year)
    if (!y) return
    const end = parseInt(String(yearForm.end).replace(/,/g, '')) || 0
    const net = parseInt(String(yearForm.net).replace(/,/g, '')) || 0
    await api.put(`/api/invest-accounts/${accountId}/years/${y}`, { end_balance: end, net_deposit: net })
    setYearForm(null)
    refresh()
  }
  async function deleteYear() {
    await api.delete(`/api/invest-accounts/${accountId}/years/${yearForm.year}`)
    setYearForm(null)
    refresh()
  }

  if (!accountId) return null
  const gainPct = d && d.purchase_value ? (d.gain / d.purchase_value * 100).toFixed(2) : '0.00'
  const gainColor = (d?.gain ?? 0) >= 0 ? '#e74c3c' : '#3b82f6'
  const sign = v => (v >= 0 ? '+' : '')
  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', padding: '18px 16px 0' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            {d && <BrokerBadge brokerKey={d.broker} size={30} label={d.broker_name} customSrc={d.has_custom_icon ? `/api/invest-accounts/${d.id}/icon?v=${d.icon_v}` : null} />}
            <h6 className="mb-0 fw-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d ? d.name : '계좌'}</h6>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1 }}>&times;</button>
        </div>
        {err && <div style={{ color: '#dc3545', fontSize: '0.85rem' }}>{err}</div>}
        {!d && !err && <div className="text-muted py-4 text-center">불러오는 중…</div>}
        {d && (
          <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[['잔고', `${fmt(d.balance)}원`], ['예수금', d.cash_set ? `${fmt(d.cash)}원` : '미입력'], ['평가금액', `${fmt(d.holdings_value)}원`], ['매입금액', `${fmt(d.purchase_value)}원`]].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--bg-section)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', background: 'var(--bg-section)', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>평가손익</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: gainColor }}>{sign(d.gain)}{fmt(d.gain)}원 ({sign(d.gain)}{gainPct}%)</span>
              </div>
            </div>

            {(d.opened_at || d.principal) && (
              <div style={{ background: 'var(--bg-section)', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
                {d.opened_at && (
                  <div className="d-flex justify-content-between" style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>개설일</span>
                    <span style={{ color: 'var(--text-primary)' }}>{d.opened_at}{d.days_open != null ? ` · ${d.days_open}일째` : ''}</span>
                  </div>
                )}
                {d.principal ? (
                  <>
                    <div className="d-flex justify-content-between" style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>투자 원금</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fmt(d.principal)}원</span>
                    </div>
                    <div className="d-flex justify-content-between" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      <span style={{ color: 'var(--text-muted)' }}>원금 대비 손익</span>
                      <span style={{ color: d.since_gain >= 0 ? '#e74c3c' : '#3b82f6' }}>{sign(d.since_gain)}{fmt(d.since_gain)}원 ({sign(d.since_pct)}{d.since_pct}%)</span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>투자 원금을 입력하면 원금 대비 손익률도 보여요</div>
                )}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <p className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>연도별 수익</p>
                <button type="button" onClick={() => setYearForm({ year: String((d.live_year?.year ?? new Date().getFullYear()) - 1), end: '', net: '', editing: false })}
                  style={{ background: 'none', border: 'none', color: '#b088f9', fontSize: '0.8rem', fontWeight: 600 }}>+ 연도 기록</button>
              </div>
              {yearForm && (
                <div style={{ background: 'var(--bg-section)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div className="d-flex gap-2 mb-2">
                    <input type="number" value={yearForm.year} placeholder="연도" disabled={yearForm.editing}
                      onChange={e => setYearForm(f => ({ ...f, year: e.target.value }))}
                      style={{ width: 90, borderRadius: 10, padding: '8px 10px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
                    <input type="text" inputMode="numeric" value={yearForm.end} placeholder="연말 잔고 (원)"
                      onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setYearForm(f => ({ ...f, end: r ? parseInt(r).toLocaleString('ko-KR') : '' })) }}
                      style={{ flex: 1, minWidth: 0, borderRadius: 10, padding: '8px 10px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
                  </div>
                  <input type="text" inputMode="numeric" value={yearForm.net} placeholder="그 해 순입금 (입금 - 출금, 없으면 비움)"
                    onChange={e => { const r = e.target.value.replace(/[^0-9-]/g, ''); setYearForm(f => ({ ...f, net: r ? parseInt(r).toLocaleString('ko-KR') : '' })) }}
                    style={{ width: '100%', borderRadius: 10, padding: '8px 10px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', marginBottom: 8 }} />
                  <div className="d-flex gap-2">
                    {yearForm.editing && (
                      <button type="button" onClick={deleteYear} style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.82rem', fontWeight: 600, marginRight: 'auto' }}>삭제</button>
                    )}
                    <button type="button" onClick={() => setYearForm(null)} className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 10 }}>취소</button>
                    <button type="button" onClick={saveYear} className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>저장</button>
                  </div>
                </div>
              )}
              {[...(d.years || []), ...(d.live_year ? [d.live_year] : [])].reverse().map(y => {
                const label = y.live ? `${y.year} (현재)` : `${y.year}`
                const hasGain = y.gain !== null && y.gain !== undefined
                const c = !hasGain ? 'var(--text-muted)' : y.gain >= 0 ? '#e74c3c' : '#3b82f6'
                return (
                  <div key={label} onClick={() => !y.live && setYearForm({ year: String(y.year), end: fmt(y.end_balance), net: y.net_deposit ? fmt(y.net_deposit) : '', editing: true })}
                    className="d-flex justify-content-between align-items-center" style={{ padding: '8px 2px', borderBottom: '1px solid var(--border-light)', cursor: y.live ? 'default' : 'pointer' }}>
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-primary)', fontWeight: y.live ? 700 : 500 }}>{label}</span>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: c }}>
                      {hasGain ? `${sign(y.gain)}${fmt(y.gain)}원 (${sign(y.rate ?? 0)}${y.rate ?? '-'}%)` : '원금 입력 또는 전년 기록 필요'}
                    </span>
                  </div>
                )
              })}
              {(d.years || []).length === 0 && !d.live_year && (
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>연도별 기록이 없어요</p>
              )}
            </div>

            <p className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>보유 종목 · {d.holdings.length}개</p>
            {d.holdings.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>이 계좌에 든 종목이 없어요</p>
            ) : d.holdings.map(h => (
              <div key={h.id} className="d-flex justify-content-between align-items-center" style={{ padding: '9px 2px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.quantity}주 · 평균 {fmt(Math.round(h.avg_price))}원</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(h.current_value)}원</div>
                  <div style={{ fontSize: '0.72rem', color: h.profit >= 0 ? '#e74c3c' : '#3b82f6', fontWeight: 600 }}>{sign(h.profit)}{fmt(h.profit)}원 ({sign(h.profit)}{h.profit_pct}%)</div>
                </div>
              </div>
            ))}

            <p className="fw-semibold mt-3 mb-2" style={{ fontSize: '0.85rem' }}>최근 매매</p>
            {d.trades.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>기록된 매매가 없어요</p>
            ) : d.trades.map((t, i) => (
              <div key={i} style={{ padding: '8px 2px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  <span style={{ fontWeight: 700, color: t.side === 'buy' ? '#b088f9' : '#7baff0', marginRight: 6 }}>{t.side === 'buy' ? '매수' : '매도'}</span>{t.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {t.date} · {t.quantity}주 × {fmt(t.price)}{t.fee ? ` · 수수료 ${fmt(t.fee)}원` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function InvestmentSheet({ open, visible, onClose, onSaved, editItem, accounts = [], onAccountsChanged }) {
  const itypeScrollRef = useDragScrollX()
  const [itype, setItype] = useState('국내주식')
  const [accountType, setAccountType] = useState('일반')
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [memo, setMemo] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [accountError, setAccountError] = useState(false)
  const [tradeSide, setTradeSide] = useState('')
  const [tradeQty, setTradeQty] = useState('')
  const [tradePrice, setTradePrice] = useState('')
  const [tradeDate, setTradeDate] = useState(today())
  const [tradeError, setTradeError] = useState('')
  const [tradeFee, setTradeFee] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState(null)
  const [exchangeRate, setExchangeRate] = useState(null)
  const [usdAvgPrice, setUsdAvgPrice] = useState('')
  const [usdCurrentPrice, setUsdCurrentPrice] = useState('')
  const [nameError, setNameError] = useState(false)
  const [quantityError, setQuantityError] = useState(false)
  const [avgPriceError, setAvgPriceError] = useState(false)
  const [excludeStats, setExcludeStats] = useState(false)
  const [currentPriceConfirm, setCurrentPriceConfirm] = useState(false)
  const [currentPriceUnlocked, setCurrentPriceUnlocked] = useState(false)
  // 국내주식·해외주식·ETF는 거래일이 지나면 서버가 시세를 자동으로 다시 조회해
  // current_price를 덮어쓴다(app.py _needs_price_update) — 펀드·코인은 그런 자동
  // 갱신이 없어 직접 입력이 그 항목의 유일한 갱신 수단이므로 잠글 필요가 없다.
  const autoFetchApplies = ['국내주식', '해외주식', 'ETF'].includes(itype)
  const currentPriceLocked = autoFetchApplies && !currentPriceUnlocked

  useEffect(() => {
    if (!open) return
    setNameError(false); setQuantityError(false); setAvgPriceError(false)
    setCurrentPriceUnlocked(false); setCurrentPriceConfirm(false)
    setTradeSide(''); setTradeQty(''); setTradePrice(''); setTradeDate(today()); setTradeError(''); setTradeFee('')
    if (editItem) {
      setItype(editItem.itype || '국내주식')
      setAccountType(editItem.account_type || '일반')
      setName(editItem.name || '')
      setTicker(editItem.ticker || '')
      setQuantity(String(editItem.quantity ?? ''))
      setAvgPrice(editItem.avg_price ? Math.round(editItem.avg_price).toLocaleString('ko-KR') : '')
      setCurrentPrice(editItem.current_price != null ? Math.round(editItem.current_price).toLocaleString('ko-KR') : '')
      setMemo(editItem.memo || '')
      setExcludeStats(!!editItem.exclude_stats)
      setAccountId(editItem.account_id ?? null)
      setAccountError(false)
    } else {
      setItype('국내주식'); setAccountType('일반'); setName(''); setTicker(''); setQuantity(''); setAvgPrice(''); setCurrentPrice(''); setMemo(''); setExcludeStats(false); setAccountId(accounts[0]?.id ?? null); setAccountError(false)
    }
    setUsdAvgPrice(''); setUsdCurrentPrice(''); setExchangeRate(null)
    setFetchResult(null)
  }, [open, editItem])

  // 환율 자동 조회 (해외주식 선택 시)
  useEffect(() => {
    if (itype !== '해외주식') return
    api.get('/api/usd-rate').then(res => {
      if (res.ok) {
        setExchangeRate(res.rate)
      }
    }).catch(() => {})
  }, [itype])

  // 환율 로드 후 수정 항목 USD 가격 초기화
  useEffect(() => {
    if (!editItem || itype !== '해외주식' || !exchangeRate) return
    if (!usdAvgPrice && editItem.avg_price) {
      // exchange_rate가 저장된 항목은 avg_price가 이미 USD, 아니면 KRW → USD 변환
      setUsdAvgPrice(editItem.exchange_rate
        ? editItem.avg_price.toFixed(4)
        : (editItem.avg_price / exchangeRate).toFixed(2))
    }
    if (!usdCurrentPrice && editItem.current_price) {
      setUsdCurrentPrice(editItem.exchange_rate
        ? editItem.current_price.toFixed(2)
        : (editItem.current_price / exchangeRate).toFixed(2))
    }
  }, [exchangeRate, editItem, itype])

  const ITYPES = ['국내주식', '해외주식', '펀드', '코인', 'ETF', '기타']
  const tickerHints = { '국내주식': '예) 005930 (삼성전자)', '해외주식': '예) AAPL, TSLA', '펀드': '펀드코드 (선택)', '코인': '예) KRW-BTC, KRW-ETH', 'ETF': '예) 069500 (KODEX200), QQQ', '기타': '' }

  async function fetchPrice() {
    if (!ticker.trim()) return
    setFetching(true); setFetchResult(null)
    try {
      const res = await api.get(`/api/investments/price?ticker=${encodeURIComponent(ticker.trim())}&itype=${encodeURIComponent(itype)}`)
      if (res.ok) {
        const krw = Math.round(res.price_krw)
        setCurrentPrice(krw.toLocaleString('ko-KR'))
        setFetchResult({ currency: res.currency, price: res.price, price_krw: res.price_krw })
        if (res.currency === 'USD' && res.price > 0) {
          const rate = Math.round(res.price_krw / res.price)
          setExchangeRate(rate)
          setUsdCurrentPrice(res.price.toFixed(2))
        }
      } else {
        setFetchResult({ error: res.error || '조회 실패' })
      }
    } catch { setFetchResult({ error: '네트워크 오류' }) }
    finally { setFetching(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const isUsd = itype === '해외주식'
    const nameOk = !!name.trim()
    const quantityOk = (parseFloat(quantity) || 0) > 0
    const avgPriceRaw = isUsd ? usdAvgPrice : avgPrice.replace(/,/g, '')
    const avgPriceOk = (parseFloat(avgPriceRaw) || 0) > 0
    setNameError(!nameOk)
    setQuantityError(!quantityOk)
    setAvgPriceError(!avgPriceOk)
    const accountOk = !!accountId
    setAccountError(!accountOk)
    if (!nameOk || !quantityOk || !avgPriceOk || !accountOk) return
    const payload = {
      itype, account_type: accountType, name: name.trim(), ticker: ticker.trim(),
      quantity: parseFloat(quantity) || 0,
      avg_price: isUsd ? (parseFloat(usdAvgPrice) || 0) : (parseFloat(avgPrice.replace(/,/g, '')) || 0),
      current_price: isUsd
        ? (usdCurrentPrice ? (parseFloat(usdCurrentPrice) || null) : null)
        : (currentPrice ? parseFloat(currentPrice.replace(/,/g, '')) : null),
      exchange_rate: isUsd ? (exchangeRate || null) : null,
      memo: memo.trim(),
      exclude_stats: excludeStats,
      account_id: accountId,
    }
    if (editItem) await api.put(`/api/investments/${editItem.id}`, payload)
    else await api.post('/api/investments', payload)
    onSaved(); onClose()
  }

  async function submitTrade() {
    const q = parseFloat(tradeQty.replace(/,/g, '')) || 0
    const p = parseFloat(tradePrice.replace(/,/g, '')) || 0
    if (q <= 0 || p <= 0) { setTradeError('수량과 단가를 입력해 주세요'); return }
    try {
      const fee = parseFloat(tradeFee.replace(/,/g, '')) || 0
      await api.post(`/api/investments/${editItem.id}/trades`, { side: tradeSide, quantity: q, price: p, date: tradeDate, fee })
      onSaved(); onClose()
    } catch (e) {
      setTradeError(e?.message || '기록하지 못했습니다')
    }
  }

  const inp = { borderRadius: 10, border: '1.5px solid var(--border-light)', padding: '9px 12px', fontSize: '0.9rem', width: '100%', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)' }
  if (!open) return null

  const sheetEl = createPortal(
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-bold">{editItem ? '투자 수정' : '투자 추가'}</h6>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1 }}>
          <form id="investment-form" onSubmit={handleSubmit}>
            {/* 유형 선택 */}
            <div ref={itypeScrollRef} data-scroll-x className="d-flex gap-2 overflow-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
              {ITYPES.map(t => {
                const tc = ITYPE_COLORS[t] || ITYPE_COLORS['기타']
                return (
                  <button key={t} type="button" onClick={() => setItype(t)}
                    style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: `2px solid ${itype === t ? tc.color : 'var(--border-light)'}`, background: itype === t ? tc.bg : 'var(--bg-card)', color: itype === t ? tc.color : 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {ITYPE_ICONS[t]} {t}
                  </button>
                )
              })}
            </div>
            {/* 계좌 종류 */}
            <div className="d-flex gap-2 mb-3">
              {[['일반', null], ['ISA', '#5a9fd4'], ['연금저축', '#8b5cf6'], ['IRP', '#e87000']].map(([at, color]) => (
                <button key={at} type="button" onClick={() => setAccountType(at)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 10, border: `2px solid ${accountType === at ? (color || '#888') : 'var(--border-light)'}`, background: accountType === at ? `${color || '#888'}18` : 'var(--bg-card)', color: accountType === at ? (color || 'var(--text-secondary)') : 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                  {at}
                </button>
              ))}
            </div>

            <input type="text" placeholder="종목명" value={name} onChange={e => { setName(e.target.value); setNameError(false) }}
              style={{ ...inp, marginBottom: nameError ? 4 : 10, border: nameError ? '1.5px solid #dc3545' : inp.border }} />
            {nameError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>종목명을 입력해 주세요</div>}

            {/* 티커 + 현재가 불러오기 */}
            <div className="d-flex gap-2 mb-1">
              <input type="text" placeholder={tickerHints[itype] || '티커/심볼'} value={ticker} onChange={e => setTicker(e.target.value)}
                style={{ ...inp, flex: 1, minWidth: 0, width: 'auto' }} />
              <button type="button" onClick={fetchPrice} disabled={!ticker.trim() || fetching}
                style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: ticker.trim() ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#eee', color: ticker.trim() ? 'white' : '#aaa', fontWeight: 600, fontSize: '0.82rem', cursor: ticker.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                {fetching ? '조회중...' : '현재가 불러오기'}
              </button>
            </div>
            {fetchResult && (
              <div style={{ fontSize: '0.75rem', marginBottom: 8, padding: '5px 10px', borderRadius: 8, background: fetchResult.error ? '#fff0f0' : '#f0faf4', color: fetchResult.error ? '#dc3545' : '#198754' }}>
                {fetchResult.error ? `오류: ${fetchResult.error}` : `현재가: ${fetchResult.currency === 'USD' ? `$${fetchResult.price.toLocaleString()} ≈ ` : ''}${Math.round(fetchResult.price_krw).toLocaleString()}원 (자동 입력됨)`}
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: quantityError ? 4 : 10 }}>
              <input type="text" placeholder="수량 (소수 가능, 예: 0.5)" value={quantity} onChange={e => { setQuantity(e.target.value); setQuantityError(false) }}
                inputMode="decimal" style={{ ...inp, paddingRight: ITYPE_UNITS[itype] ? 36 : undefined, border: quantityError ? '1.5px solid #dc3545' : inp.border }} />
              {ITYPE_UNITS[itype] && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>{ITYPE_UNITS[itype]}</span>}
            </div>
            {quantityError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>수량을 입력해 주세요</div>}
            {itype === '해외주식' ? (<>
              <div style={{ fontSize: '0.72rem', color: '#b08040', background: '#fffbf0', border: '1px solid #ffe8a0', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
                ⚠️ 환율은 실시간이 아닐 수 있어 실제 금액과 차이가 있을 수 있습니다{exchangeRate ? ` (현재 적용 환율: $1 ≈ ${exchangeRate.toLocaleString()}원)` : ''}
              </div>
              <div style={{ marginBottom: 10 }}>
                <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>평균 매수가</p>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="평균 매수가" value={usdAvgPrice} inputMode="decimal"
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      setUsdAvgPrice(val)
                      setAvgPriceError(false)
                      const krw = exchangeRate ? Math.round((parseFloat(val) || 0) * exchangeRate) : 0
                      setAvgPrice(krw ? krw.toLocaleString('ko-KR') : '')
                    }}
                    style={{ ...inp, paddingRight: 46, border: avgPriceError ? '1.5px solid #dc3545' : inp.border }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>달러</span>
                </div>
                {exchangeRate && usdAvgPrice && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, paddingLeft: 4 }}>({Math.round((parseFloat(usdAvgPrice) || 0) * exchangeRate).toLocaleString()}원)</div>}
                {avgPriceError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 3 }}>평균 매수가를 입력해 주세요</div>}
              </div>
              <div style={{ marginBottom: 10 }}>
                <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>현재가 (선택사항)</p>
                <div style={{ position: 'relative' }}>
                  <input type="text" placeholder="현재가 (선택사항)" value={usdCurrentPrice} inputMode="decimal"
                    readOnly={currentPriceLocked}
                    onFocus={e => { if (currentPriceLocked) { e.target.blur(); setCurrentPriceConfirm(true) } }}
                    onMouseDown={() => { if (currentPriceLocked) setCurrentPriceConfirm(true) }}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      setUsdCurrentPrice(val)
                      const krw = exchangeRate ? Math.round((parseFloat(val) || 0) * exchangeRate) : 0
                      setCurrentPrice(krw ? krw.toLocaleString('ko-KR') : '')
                    }}
                    style={{ ...inp, paddingRight: 46, ...(currentPriceLocked ? { background: 'var(--bg-section)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}) }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>달러</span>
                </div>
                {exchangeRate && usdCurrentPrice && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, paddingLeft: 4 }}>({Math.round((parseFloat(usdCurrentPrice) || 0) * exchangeRate).toLocaleString()}원)</div>}
              </div>
            </>) : (<>
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>평균 매수가</p>
              <div style={{ position: 'relative', marginBottom: avgPriceError ? 4 : 10 }}>
                <input type="text" placeholder="평균 매수가" value={avgPrice} inputMode="numeric"
                  onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); const v = r ? parseInt(r).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setAvgPrice(v); setAvgPriceError(false) }}
                  style={{ ...inp, paddingRight: 36, border: avgPriceError ? '1.5px solid #dc3545' : inp.border }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
              {avgPriceError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>평균 매수가를 입력해 주세요</div>}
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>현재가 (선택사항)</p>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input type="text" placeholder="현재가 (선택사항)" value={currentPrice} inputMode="numeric"
                  readOnly={currentPriceLocked}
                  onFocus={e => { if (currentPriceLocked) { e.target.blur(); setCurrentPriceConfirm(true) } }}
                  onMouseDown={() => { if (currentPriceLocked) setCurrentPriceConfirm(true) }}
                  onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); const v = r ? parseInt(r).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setCurrentPrice(v) }}
                  style={{ ...inp, paddingRight: 36, ...(currentPriceLocked ? { background: 'var(--bg-section)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}) }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
            </>)}
            <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>투자 계좌</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {accounts.map(a => {
                const on = a.id === accountId
                return (
                  <button key={a.id} type="button" onClick={() => { setAccountId(a.id); setAccountError(false) }}
                    style={{ padding: '6px 12px', borderRadius: 16, border: `1.5px solid ${on ? '#b088f9' : 'var(--border-light)'}`, background: on ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: on ? '#b088f9' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {a.broker && <BrokerBadge brokerKey={a.broker} size={18} customSrc={a.has_custom_icon ? `/api/invest-accounts/${a.id}/icon?v=${a.icon_v}` : null} label={a.broker_name} />}
                      {a.name}
                    </span>
                  </button>
                )
              })}
            </div>
            {accountError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginBottom: 8 }}>투자 계좌를 선택해 주세요{accounts.length === 0 ? ' — 먼저 계좌를 추가해 주세요' : ''}</div>}
            {accounts.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>투자 계좌가 없어요 — 투자 탭의 "증권사 추가"에서 먼저 추가해 주세요</div>
            )}
            {editItem && (
              <div style={{ marginBottom: 12 }}>
                <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>매수 · 매도 기록</p>
                <div className="d-flex gap-2 mb-2">
                  {[['buy', '매수', '#b088f9'], ['sell', '매도', '#7baff0']].map(([v, label, c]) => (
                    <button key={v} type="button" onClick={() => { setTradeSide(tradeSide === v ? '' : v); setTradeError('') }}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${tradeSide === v ? c : 'var(--border-light)'}`, background: tradeSide === v ? `${c}18` : 'var(--bg-card)', color: tradeSide === v ? c : 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>{label}</button>
                  ))}
                </div>
                {tradeSide && (
                  <div style={{ background: 'var(--bg-section)', borderRadius: 12, padding: 12 }}>
                    <div className="d-flex gap-2 mb-2">
                      <input type="text" inputMode="decimal" placeholder="수량" value={tradeQty} onChange={e => setTradeQty(e.target.value.replace(/[^0-9.]/g, ''))} style={{ ...inp, flex: 1 }} />
                      <input type="text" inputMode="decimal" placeholder={isUsd ? '단가 (달러)' : '단가 (원)'} value={tradePrice} onChange={e => setTradePrice(e.target.value.replace(/[^0-9.]/g, ''))} style={{ ...inp, flex: 1 }} />
                    </div>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <input type="text" inputMode="numeric" placeholder="수수료·세금 (선택)" value={tradeFee}
                        onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setTradeFee(r ? parseInt(r).toLocaleString('ko-KR') : '') }}
                        style={{ ...inp, paddingRight: 36 }} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                    </div>
                    {(() => {
                      // 주문 금액과 수수료로 예상 차감·정산 금액을 보여주고, 예수금이 부족하면 알려준다
                      const q = parseFloat(tradeQty.replace(/,/g, '')) || 0
                      const p = parseFloat(tradePrice.replace(/,/g, '')) || 0
                      const fee = parseFloat(tradeFee.replace(/,/g, '')) || 0
                      if (!q || !p) return null
                      const krw = q * p * (isUsd ? (exchangeRate || 1) : 1)
                      const total = Math.round(tradeSide === 'buy' ? krw + fee : krw - fee)
                      const acct = accounts.find(x => x.id === editItem?.account_id)
                      const short = acct?.cash_set && tradeSide === 'buy' && total > acct.cash
                      return (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 8px', lineHeight: 1.6 }}>
                          {tradeSide === 'buy' ? '예상 차감' : '예상 정산'} <b>{fmt(total)}원</b>
                          {acct?.cash_set && (
                            <> · 예수금 {fmt(acct.cash)}원{tradeSide === 'buy' && <> → {fmt(Math.round(acct.cash - total))}원</>}</>
                          )}
                          {short && <div style={{ color: '#dc3545' }}>예수금이 부족해요</div>}
                        </div>
                      )
                    })()}
                    <DatePickerSheet value={tradeDate} onChange={setTradeDate} />
                    {tradeError && <div style={{ color: '#dc3545', fontSize: '0.78rem', marginTop: 6 }}>{tradeError}</div>}
                    <div className="d-flex gap-2 mt-2">
                      <button type="button" onClick={() => setTradeSide('')} className="btn btn-outline-secondary flex-fill" style={{ borderRadius: 10 }}>취소</button>
                      <button type="button" onClick={submitTrade} className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>기록</button>
                    </div>
                  </div>
                )}
                {(editItem.realized_sales || 0) > 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>지금까지 매도 금액 {fmt(editItem.realized_sales)}원</div>
                )}
              </div>
            )}
            <input type="text" placeholder="메모 (선택)" value={memo} onChange={e => setMemo(e.target.value)}
              style={{ ...inp, marginBottom: 10 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }} onClick={() => setExcludeStats(v => !v)}>
              <label style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0, cursor: 'pointer' }}>📊 통계에서 제외</label>
              <div className="ios-toggle">
                <div className={`ios-track${excludeStats ? ' on' : ''}`} />
                <div className={`ios-dot${excludeStats ? ' on' : ''}`} />
              </div>
            </div>
          </form>
        </div>
        <div style={{ padding: '12px 0 calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
          <button type="submit" form="investment-form" className="btn w-100" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>
            {editItem ? '수정하기' : '추가하기'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )

  return <>
    {sheetEl}
    {currentPriceConfirm && createPortal(
      <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2100, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <p className="text-center fw-semibold mb-2" style={{ fontSize: '0.95rem' }}>현재가를 직접 수정하시겠어요?</p>
          <p className="text-center text-muted mb-4" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            현재가는 다음 거래일이 지나면 시장 가격으로 자동 갱신돼요. 지금 직접 입력해도 다음 갱신 때 덮어써질 수 있어요.
          </p>
          <div className="d-flex gap-2">
            <button autoFocus className="btn flex-fill" onClick={() => { setCurrentPriceUnlocked(true); setCurrentPriceConfirm(false) }}
              style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>그래도 수정</button>
            <button className="btn btn-outline-secondary flex-fill" onClick={() => setCurrentPriceConfirm(false)} style={{ borderRadius: 10 }}>취소</button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
}

// 예산 탭 평소 화면 — 은행/예·적금/저축 목표/투자 4개 섹션을 요약 카드 2x2
// 그리드로만 보여주고, 하나를 탭하면 그 섹션의 상세 화면(기존 목록·필터·추가
// 버튼 등)으로 전환된다. 섹션이 길어서 밑에 있는 걸 찾기 힘들다는 피드백 —
// 평소엔 요약만, 필요할 때만 들어가서 보게 바꿨다.
function BudgetSectionGrid({ data, goals, hiddenParts, setHiddenParts, onPick }) {
  const hideBalance = hiddenParts === 'all' || hiddenParts.includes('balance')
  const hideSavings = hiddenParts === 'all' || hiddenParts.includes('savings')
  const hideGoal = hiddenParts === 'all' || hiddenParts.includes('goal')
  const hideInvest = hiddenParts === 'all' || hiddenParts.includes('invest')
  const bankTotal = (data.card_stats || []).filter(c => !c.is_loan).reduce((s, c) => s + c.balance, 0)
  const savingsTotal = (data.savings || []).reduce((s, i) => s + i.current_paid, 0)
  const goalCount = goals.length
  const goalAvgPct = goalCount
    ? Math.round(goals.reduce((s, g) => s + (g.target_amount > 0 ? Math.min(100, g.current_amount / g.target_amount * 100) : 0), 0) / goalCount)
    : 0
  const invTotal = (data.investments || []).reduce((s, i) => s + i.current_value, 0)
  const invPurch = (data.investments || []).reduce((s, i) => s + i.purchase_value, 0)
  const invPct = invPurch ? (invTotal - invPurch) / invPurch * 100 : 0

  const tiles = [
    { key: 'bank', icon: '🏦', title: '은행별 잔고', value: `${fmt(bankTotal)}원`, hide: hideBalance, sub: `카드 ${(data.card_stats || []).length}개` },
    { key: 'savings', icon: '💰', title: '예·적금', value: `${fmt(savingsTotal)}원`, hide: hideSavings, sub: `${(data.savings || []).length}개 가입 중` },
    { key: 'goal', icon: '🎯', title: '저축 목표', value: goalCount ? `평균 ${goalAvgPct}%` : '없음', hide: hideGoal, sub: goalCount ? `${goalCount}개 진행 중` : '목표를 추가해 보세요' },
    { key: 'invest', icon: '📈', title: '투자', value: `${fmt(invTotal)}원`, hide: hideInvest, sub: `${invPct >= 0 ? '+' : ''}${invPct.toFixed(1)}%`, subColor: invPct >= 0 ? '#198754' : '#dc3545' },
  ]

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* 지금까지 금액 가리기 토글이 "은행별 잔고" 상세 화면 안에만 있어서, 그리드
          요약 화면(정작 금액이 바로 보이는 곳)에선 가릴 방법이 없었다 — 그리드에도
          같은 토글을 노출해서 상세로 들어가지 않아도 바로 가릴 수 있게 한다. */}
      <div className="d-flex justify-content-end mb-2">
        <FilterPopup title="금액 가리기"
          trigger={open => (
            <button onClick={open} style={{
              background: 'var(--bg-accent)', border: 'none', borderRadius: 20, padding: '5px 12px',
              display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer',
            }}>
              <i className={`bi ${hiddenParts === 'all' || hiddenParts.length > 0 ? 'bi-eye-slash' : 'bi-eye'}`} />
              금액 가리기
            </button>
          )}
          sections={[{
            label: '가릴 항목', type: 'grid',
            options: [['balance', '은행별 잔고'], ['savings', '예·적금'], ['goal', '저축 목표'], ['invest', '투자']],
            value: hiddenParts, onChange: setHiddenParts,
          }]} />
      </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {tiles.map(t => (
        <button key={t.key} onClick={e => onPick(t.key, e.currentTarget.getBoundingClientRect())} className="card" style={{
          border: '1.5px solid var(--border)', borderRadius: 16, padding: '16px 14px', textAlign: 'left',
          background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: '1.4rem' }}>{t.icon}</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t.title}</div>
          <div className={`amt-mask${t.hide ? ' amt-hidden' : ''}`} style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{t.value}</div>
          <div style={{ fontSize: '0.72rem', color: t.subColor || 'var(--text-faint)' }}>{t.sub}</div>
        </button>
      ))}
    </div>
    </div>
  )
}

// 탭 전환마다 이 페이지가 다시 마운트되면서 로딩 스피너가 매번 깜빡이지 않도록,
// 마지막으로 받아온 데이터를 모듈 스코프에 캐시해두고 재마운트 시 즉시 보여준다.
let _budgetCache = null

export default function Budget() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(() => _budgetCache)
  const [confirmCard, setConfirmCard] = useState(null)
  const [convertCard, setConvertCard] = useState(null)
  const [convertAmount, setConvertAmount] = useState('')
  const [convertAmountError, setConvertAmountError] = useState(false)
  const [convertLoading, setConvertLoading] = useState(false)
  const [pointInfoCard, setPointInfoCard] = useState(null)
  const [perfTxCard, setPerfTxCard] = useState(null)
  const [perfTxList, setPerfTxList] = useState([])
  const [perfTxEmojiMap, setPerfTxEmojiMap] = useState({})
  const [perfTxLoading, setPerfTxLoading] = useState(false)
  const [pointInfoEditing, setPointInfoEditing] = useState(false)
  const [pointInfoUsable, setPointInfoUsable] = useState('')
  const [pointInfoCarryover, setPointInfoCarryover] = useState('')
  const [pointInfoSaving, setPointInfoSaving] = useState(false)
  const [editCard, setEditCard] = useState(null)
  const [editInitial, setEditInitial] = useState('')
  const [editBalanceDate, setEditBalanceDate] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editTier1, setEditTier1] = useState(20)
  const [editTier2, setEditTier2] = useState(50)
  const [editTier3, setEditTier3] = useState(80)
  const [editInterestRate, setEditInterestRate] = useState('')
  const [editCashbackType, setEditCashbackType] = useState('')
  const [editCashbackRate, setEditCashbackRate] = useState('')
  const [editCashbackMonthlyCap, setEditCashbackMonthlyCap] = useState('')
  const [cashbackRulesSheetOpen, setCashbackRulesSheetOpen] = useState(false)
  const [cashbackRules, setCashbackRules] = useState([])
  const [cashbackRuleModal, setCashbackRuleModal] = useState(null) // null | 'new' | rule object
  const [ruleName, setRuleName] = useState('')
  const [ruleKeywords, setRuleKeywords] = useState('')
  const [ruleRate, setRuleRate] = useState('')
  const [ruleDailyCap, setRuleDailyCap] = useState('')
  const [ruleDailyCountCap, setRuleDailyCountCap] = useState('')
  const [ruleMonthlyCap, setRuleMonthlyCap] = useState('')
  const [ruleMonthlyCountCap, setRuleMonthlyCountCap] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)
  const [rulePrevMin, setRulePrevMin] = useState('')
  const [ruleHelpOpen, setRuleHelpOpen] = useState(false)
  const [editPointResetOn, setEditPointResetOn] = useState(false)
  const [editPointResetDay, setEditPointResetDay] = useState('')
  const [editPointResetAmount, setEditPointResetAmount] = useState('')
  const [editPointCarryover, setEditPointCarryover] = useState('')
  const [editCustomIconFile, setEditCustomIconFile] = useState(null)
  const [editCustomIconPreview, setEditCustomIconPreview] = useState(null)
  const [editCropFile, setEditCropFile] = useState(null)
  const [editRemoveIcon, setEditRemoveIcon] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editSheetVisible, setEditSheetVisible] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addSheetVisible, setAddSheetVisible] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [savingsSheetVisible, setSavingsSheetVisible] = useState(false)
  const [editSavings, setEditSavings] = useState(null)
  const [confirmSavings, setConfirmSavings] = useState(null)
  const [invSheetOpen, setInvSheetOpen] = useState(false)
  const [cashEdit, setCashEdit] = useState(null) // { id, name, value } 예수금 수정 창
  const [acctAddOpen, setAcctAddOpen] = useState(false)
  const [detailId, setDetailId] = useState(null) // 계좌 상세 창
  const [acctEdit, setAcctEdit] = useState(null) // { id, name, broker, confirmDelete, hasIcon, iconPreview, iconBlob, removeIcon, cropFile } 계좌 수정·삭제 창
  const [invSheetVisible, setInvSheetVisible] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [confirmInv, setConfirmInv] = useState(null)
  // 예산 탭이 길어지면서 밑에 있는 섹션(특히 저축 목표)이 안 보인다는 피드백 —
  // 평소엔 4개 섹션(은행·예적금·저축목표·투자)을 요약 카드 2x2 그리드로만 보여주고,
  // 하나를 누르면 그 섹션의 기존 상세 화면(목록·필터·추가 버튼 등)으로 전환한다.
  // null = 그리드, 그 외엔 해당 섹션의 상세 화면만 보여줌.
  const [activeSection, setActiveSection] = useState(null)
  // 그리드 → 상세 전환을 "그 카드 자리에서 실제로 커지는" FLIP 애니메이션으로
  // 보이게 하려고, 탭한 카드의 화면상 위치·크기(originRect)를 기억해뒀다가 상세
  // 화면이 그려진 뒤 그 위치/크기에서 시작해 제자리(transform: none)로 트랜지션
  // 시킨다 — CSS keyframe만으로는 "탭한 자리에서" 커지는 걸 표현할 수 없어서 직접
  // 계산해 style을 준다.
  const [originRect, setOriginRect] = useState(null)
  const detailRef = useRef(null)
  const handlePick = (key, rect) => { setOriginRect(rect); setActiveSection(key) }
  useLayoutEffect(() => {
    if (!activeSection || !originRect || !detailRef.current) return
    const el = detailRef.current
    const finalRect = el.getBoundingClientRect()
    if (!finalRect.width || !finalRect.height) return
    // 카드 높이(작다) 대비 상세 화면 높이(목록이 길면 아주 크다) 차이가 커서
    // scaleX/scaleY를 각각 따로 맞추면 세로로 확 늘어나며 찌그러지듯 보여 "조잡한"
    // 느낌을 줬다 — 가로 비율 기준으로 균일하게(scaleX만) 확대해서, 세로는 위쪽이
    // 살짝 눌린 채로 시작해 펴지는 정도로만 보이게 한다(찌그러짐 없음).
    const scale = Math.max(0.4, Math.min(1, originRect.width / finalRect.width))
    const translateX = originRect.left - finalRect.left
    const translateY = originRect.top - finalRect.top
    el.style.transition = 'none'
    el.style.transformOrigin = '0 0'
    el.style.opacity = '0'
    el.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.46s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease'
        el.style.transform = 'none'
        el.style.opacity = '1'
      })
    })
  }, [activeSection, originRect])
  const closingRef = useRef(false)
  // 뒤로가기 시 상세 화면만 사라지고 그리드는 그 뒤에 늦게 나타나던 게 "그냥
  // 구석으로 사라지는" 느낌의 원인이었다 — 그리드를 먼저(즉시) 그려두고, 상세
  // 화면은 그 위에 겹쳐진 채로(overlay) 카드 자리로 줄어들게 해서, 줄어드는
  // 동안 뒤에 있는 그리드가 계속 비쳐 보이게(사실상 크로스페이드) 한다.
  const [closingSection, setClosingSection] = useState(null)
  const closingOverlayStyle = {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    maxHeight: '75vh', overflow: 'hidden', background: 'var(--bg-page)',
    borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
  }
  function closeDetail() {
    if (closingRef.current) return
    const key = activeSection
    const el = detailRef.current
    if (!el || !originRect || !key) { setActiveSection(null); return }
    closingRef.current = true
    // 목록이 긴 상세 화면을 스크롤해서 보다가 뒤로가기를 누르면, 상세 화면이
    // position:absolute + maxHeight로 확 줄어들면서 문서 전체 높이가 갑자기
    // 짧아져 브라우저가 스크롤 위치를 강제로 당겨버린다 — 이때 originRect(그리드
    // 볼 때 기준)랑 지금 좌표계가 어긋나면서 카드 자리가 아니라 엉뚱한 곳(화면
    // 가운데 근처)으로 줄어드는 것처럼 보였다. 애니메이션을 시작하기 전에 항상
    // 맨 위로 스크롤을 고정해서 좌표 기준을 일치시킨다.
    window.scrollTo(0, 0)
    const curRect = el.getBoundingClientRect()
    setClosingSection(key)
    setActiveSection(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrapEl = detailRef.current
        if (!wrapEl) { closingRef.current = false; setClosingSection(null); return }
        const wrapRect = wrapEl.parentElement.getBoundingClientRect()
        const scale = Math.max(0.4, Math.min(1, originRect.width / curRect.width))
        const translateX = originRect.left - wrapRect.left
        const translateY = originRect.top - wrapRect.top
        wrapEl.style.transformOrigin = '0 0'
        // 내용이 그대로 축소된 스크린샷처럼 줄어드는 것처럼 보이지 않게 — opacity를
        // transform보다 훨씬 빠르게 0으로 만들어서, 초반에 콘텐츠가 얼른 하얗게
        // 사라지고 남은 시간 동안은 빈 박스만 카드 자리로 줄어드는 것처럼 보이게 한다.
        wrapEl.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease-in'
        wrapEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
        wrapEl.style.opacity = '0'
      })
    })
    setTimeout(() => { closingRef.current = false; setClosingSection(null) }, 420)
  }
  const [goals, setGoals] = useState([])
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)
  const [goalSheetVisible, setGoalSheetVisible] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [confirmGoal, setConfirmGoal] = useState(null)
  const [addAmountGoal, setAddAmountGoal] = useState(null)
  // 필터·정렬 선택이 탭 이동·앱 재실행 후에도 유지되도록 로컬 저장(서버 무관)
  // 잔고와 예·적금·투자를 따로 가릴 수 있게 필터 팝업과 같은 다중 선택 방식으로 저장
  // ('all' = 둘 다, 배열 = 그 중 선택된 것만, [] = 아무 것도 안 가림)
  const [hiddenPartsRaw, setHiddenParts] = useLocalStorageState('hide_amounts_budget', [])
  // 예전 버전엔 이 키에 단순 boolean(true/false)을 저장했다 — 그 값이 남아있는
  // 기기에서도 배열 메서드 호출 중 죽지 않도록 항상 배열/'all'로 보정한다.
  const hiddenParts = hiddenPartsRaw === 'all' ? 'all' : Array.isArray(hiddenPartsRaw) ? hiddenPartsRaw : (hiddenPartsRaw ? 'all' : [])
  const hideBalance = hiddenParts === 'all' || hiddenParts.includes('balance')
  const hideSavings = hiddenParts === 'all' || hiddenParts.includes('savings')
  const hideGoal = hiddenParts === 'all' || hiddenParts.includes('goal')
  const hideInvest = hiddenParts === 'all' || hiddenParts.includes('invest')
  const [invFilter, setInvFilter] = useLocalStorageState('budget_inv_filter', 'all')
  const [cardSort, setCardSort] = useLocalStorageState('budget_card_sort', '기본')
  const [cardSortDir, setCardSortDir] = useLocalStorageState('budget_card_sort_dir', 'desc')
  const [savingsSort, setSavingsSort] = useLocalStorageState('budget_savings_sort', '기본')
  const [savingsSortDir, setSavingsSortDir] = useLocalStorageState('budget_savings_sort_dir', 'asc')
  const [invSort, setInvSort] = useLocalStorageState('budget_inv_sort', '기본')
  const [invSortDir, setInvSortDir] = useLocalStorageState('budget_inv_sort_dir', 'desc')
  const [balHistOpen, setBalHistOpen] = useLocalStorageState('budget_balhist_open', false)
  const [balHistCardId, setBalHistCardId] = useState('')
  const [balHistStart, setBalHistStart] = useState('')
  const [balHistEnd, setBalHistEnd] = useState('')
  const [balHistResults, setBalHistResults] = useState(null)
  const [balHistError, setBalHistError] = useState('')
  const [balHistLoading, setBalHistLoading] = useState(false)
  const loadBalHist = () => {
    if (!balHistCardId || !balHistStart || !balHistEnd) return
    setBalHistLoading(true)
    setBalHistError('')
    api.get(`/api/budget/monthly-balances?card_id=${balHistCardId}&start=${balHistStart}&end=${balHistEnd}`)
      .then(d => setBalHistResults(d.results || []))
      .catch(err => { setBalHistResults(null); setBalHistError(err.message || '조회 중 오류가 발생했습니다.') })
      .finally(() => setBalHistLoading(false))
  }
  const load = useCallback(() => api.get('/api/budget').then(d => { _budgetCache = d; setData(d) }).catch(console.error), [])
  useEffect(() => { load() }, [load])
  const loadGoals = useCallback(() => api.get('/api/savings-goals').then(g => { setGoals(g); syncWidget() }).catch(console.error), [])
  useEffect(() => { loadGoals() }, [loadGoals])

  useEffect(() => {
    if (!data) return
    const section = searchParams.get('section')
    if (!section) return
    // 그리드 → 상세 화면 전환 방식으로 바뀌면서, 링크로 들어올 때도 스크롤 대신
    // 바로 해당 상세 화면을 열어준다.
    const map = { cards: 'bank', savings: 'savings', investment: 'invest' }
    setActiveSection(map[section] || section)
  }, [data, searchParams])

  useEffect(() => {
    const open = addSheetOpen || editSheetOpen || savingsSheetOpen || invSheetOpen || goalSheetOpen || !!confirmCard || !!confirmSavings || !!confirmInv || !!confirmGoal || !!addAmountGoal || !!convertCard || !!pointInfoCard || !!perfTxCard
    document.body.classList.toggle('sheet-open', open)
    return () => document.body.classList.remove('sheet-open')
  }, [addSheetOpen, editSheetOpen, savingsSheetOpen, invSheetOpen, goalSheetOpen, confirmCard, confirmSavings, confirmInv, confirmGoal, addAmountGoal, convertCard, pointInfoCard, perfTxCard])

  // 안드로이드 뒤로가기로 열린 시트 닫기 — 그리드→상세 화면 전환도 일종의
  // "화면 안 이동"이라, 시트/확인창이 하나도 안 열려있을 때는 뒤로가기로 상세
  // 화면에서 그리드로 돌아가게(activeSection을 null로) 한다. 우선순위는 시트나
  // 확인창이 열려 있으면 그것부터 닫고, 없으면 그 다음에 상세 화면을 닫는다.
  useEffect(() => {
    if (!addSheetOpen && !editSheetOpen && !savingsSheetOpen && !invSheetOpen && !goalSheetOpen && !confirmCard && !confirmSavings && !confirmInv && !confirmGoal && !addAmountGoal && !convertCard && !pointInfoCard && !perfTxCard && !activeSection) return
    const handler = (e) => {
      e.preventDefault()
      if (addSheetOpen) { closeAdd(); return }
      if (editSheetOpen) { closeEdit(); return }
      if (savingsSheetOpen) { closeSavingsSheet(); return }
      if (invSheetOpen) { closeInvSheet(); return }
      if (goalSheetOpen) { closeGoalSheet(); return }
      if (confirmCard) { setConfirmCard(null); return }
      if (confirmSavings) { setConfirmSavings(null); return }
      if (confirmInv) { setConfirmInv(null); return }
      if (confirmGoal) { setConfirmGoal(null); return }
      if (addAmountGoal) { setAddAmountGoal(null); return }
      if (convertCard) { setConvertCard(null); return }
      if (pointInfoCard) { setPointInfoCard(null); return }
      if (perfTxCard) { setPerfTxCard(null); return }
      if (activeSection) { closeDetail(); return }
    }
    window.addEventListener('appBackButton', handler)
    return () => window.removeEventListener('appBackButton', handler)
  }, [addSheetOpen, editSheetOpen, savingsSheetOpen, invSheetOpen, goalSheetOpen, confirmCard, confirmSavings, confirmInv, confirmGoal, addAmountGoal, convertCard, pointInfoCard, perfTxCard, activeSection])

  async function handleConvert() {
    if (!convertCard) return
    const amt = parseInt(convertAmount.replace(/,/g, '')) || 0
    if (amt <= 0 || amt > convertCard.balance) {
      setConvertAmountError(true)
      return
    }
    setConvertAmountError(false)
    setConvertLoading(true)
    try {
      await api.post(`/api/cards/${convertCard.id}/point-convert`, { amount: amt })
      setConvertCard(null)
      await load()
    } finally {
      setConvertLoading(false)
    }
  }

  async function openPerfTx(card) {
    setPerfTxCard(card)
    setPerfTxList([])
    setPerfTxLoading(true)
    try {
      const d = await api.get(`/api/cards/${card.id}/perf-transactions`)
      setPerfTxList(d.transactions || [])
      setPerfTxEmojiMap(d.emoji_map || {})
    } finally {
      setPerfTxLoading(false)
    }
  }

  async function handlePointBalanceSave() {
    if (!pointInfoCard) return
    const usable = parseInt(pointInfoUsable.replace(/,/g, '')) || 0
    const carryover = parseInt(pointInfoCarryover.replace(/,/g, '')) || 0
    setPointInfoSaving(true)
    try {
      await api.put(`/api/cards/${pointInfoCard.id}/point-balance`, { usable, carryover })
      setPointInfoCard(null)
      setPointInfoEditing(false)
      await load()
    } finally {
      setPointInfoSaving(false)
    }
  }

  function openAdd() {
    setAddSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setAddSheetVisible(true)))
  }
  function closeAdd() {
    setAddSheetVisible(false)
    setTimeout(() => setAddSheetOpen(false), 350)
  }

  function openEdit(card) {
    setEditCard(card)
    setEditInitial((card.initial_balance || 0).toLocaleString('ko-KR'))
    setEditBalanceDate(card.balance_since || today())
    setEditTarget((card.target || 0).toLocaleString('ko-KR'))
    setEditUrl(card.url || '')
    setEditTier1(card.tier1 || 20)
    setEditTier2(card.tier2 || 50)
    setEditTier3(card.tier3 || 80)
    setEditInterestRate(card.interest_rate != null ? String(card.interest_rate) : '')
    setEditCashbackType(card.cashback_type || '')
    setEditCashbackRate(card.cashback_rate != null ? String(card.cashback_rate) : '')
    setEditCashbackMonthlyCap(card.cashback_monthly_cap != null ? card.cashback_monthly_cap.toLocaleString('ko-KR') : '')
    setCashbackRules([])
    if (!card.is_loan) api.get(`/api/cards/${card.id}/cashback-rules`).then(d => setCashbackRules(d.rules || [])).catch(() => {})
    setEditPointResetOn(!!card.point_reset_day)
    setEditPointResetDay(card.point_reset_day != null ? String(card.point_reset_day) : '')
    setEditPointResetAmount(card.point_reset_amount != null ? card.point_reset_amount.toLocaleString('ko-KR') : '')
    setEditPointCarryover((card.point_carryover || 0).toLocaleString('ko-KR'))
    setEditCustomIconFile(null); setEditCustomIconPreview(null); setEditRemoveIcon(false)
    setEditSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setEditSheetVisible(true)))
  }
  function pickEditCustomIcon(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEditCropFile(file)
  }
  function onEditCropConfirm(croppedFile) {
    if (editCustomIconPreview) URL.revokeObjectURL(editCustomIconPreview)
    setEditCustomIconFile(croppedFile)
    setEditCustomIconPreview(URL.createObjectURL(croppedFile))
    setEditRemoveIcon(false)
    setEditCropFile(null)
  }
  function closeEdit() {
    setEditSheetVisible(false)
    setCashbackRulesSheetOpen(false)
    setTimeout(() => setEditSheetOpen(false), 350)
  }

  async function handleEditSave(e) {
    e.preventDefault()
    const initial = parseInt(editInitial.replace(/,/g, '')) || 0
    const target = parseInt(editTarget.replace(/,/g, '')) || 0
    await api.put(`/api/cards/${editCard.id}`, {
      name: editCard.name, target,
      tier1: editTier1, tier2: editTier2, tier3: editTier3,
      account_balance: initial, balance_since: editBalanceDate, url: editUrl,
      interest_rate: editInterestRate ? parseFloat(editInterestRate) : null,
      cashback_type: editCashbackType || null,
      cashback_rate: editCashbackType && editCashbackRate ? parseFloat(editCashbackRate) : null,
      cashback_monthly_cap: editCashbackMonthlyCap ? parseInt(editCashbackMonthlyCap.replace(/,/g, '')) : null,
      point_reset_day: editPointResetOn && editPointResetDay ? parseInt(editPointResetDay) : null,
      point_reset_amount: editPointResetOn && editPointResetAmount ? parseInt(editPointResetAmount.replace(/,/g, '')) : null,
    })
    if (editPointResetOn) {
      const newCarryover = parseInt(editPointCarryover.replace(/,/g, '')) || 0
      if (newCarryover !== (editCard.point_carryover || 0)) {
        // 잔고(사용 가능한 포인트)는 그대로 두고 전환 포인트만 바꾼다 — 포인트 탭해서
        // 뜨는 수정창과 같은 엔드포인트라, 값은 그쪽과 항상 일치한다.
        await api.put(`/api/cards/${editCard.id}/point-balance`, { usable: editCard.balance, carryover: newCarryover })
      }
    }
    if (editCustomIconFile) {
      const fd = new FormData()
      fd.append('icon', editCustomIconFile)
      const iconRes = await fetch(`/api/cards/${editCard.id}/icon`, { method: 'POST', credentials: 'include', body: fd })
      if (!iconRes.ok) {
        const body = await iconRes.json().catch(() => ({}))
        alert('로고 업로드 실패: ' + (body.error || iconRes.status))
      }
    } else if (editRemoveIcon) {
      await fetch(`/api/cards/${editCard.id}/icon`, { method: 'DELETE', credentials: 'include' })
    }
    closeEdit(); load()
  }

  function openRuleModal(rule) {
    if (rule) {
      setRuleName(rule.name); setRuleKeywords(rule.keywords); setRuleRate(String(rule.rate))
      setRuleDailyCap(rule.daily_cap != null ? String(rule.daily_cap) : '')
      setRuleDailyCountCap(rule.daily_count_cap != null ? String(rule.daily_count_cap) : '')
      setRuleMonthlyCap(rule.monthly_cap != null ? String(rule.monthly_cap) : '')
      setRuleMonthlyCountCap(rule.monthly_count_cap != null ? String(rule.monthly_count_cap) : '')
      setRulePrevMin(rule.prev_month_min != null ? rule.prev_month_min.toLocaleString('ko-KR') : '')
      setRuleHelpOpen(false)
      setCashbackRuleModal(rule)
    } else {
      setRuleName(''); setRuleKeywords(''); setRuleRate('')
      setRuleDailyCap(''); setRuleDailyCountCap(''); setRuleMonthlyCap(''); setRuleMonthlyCountCap(''); setRulePrevMin(''); setRuleHelpOpen(false)
      setCashbackRuleModal('new')
    }
  }

  async function saveRule() {
    if (!ruleName.trim() || !ruleKeywords.trim() || !ruleRate) return
    setRuleSaving(true)
    const payload = {
      name: ruleName.trim(), keywords: ruleKeywords.trim(), rate: parseFloat(ruleRate),
      daily_cap: ruleDailyCap ? parseInt(ruleDailyCap.replace(/,/g, '')) : null,
      daily_count_cap: ruleDailyCountCap ? parseInt(ruleDailyCountCap) : null,
      monthly_cap: ruleMonthlyCap ? parseInt(ruleMonthlyCap.replace(/,/g, '')) : null,
      monthly_count_cap: ruleMonthlyCountCap ? parseInt(ruleMonthlyCountCap) : null,
      prev_month_min: rulePrevMin ? parseInt(rulePrevMin.replace(/,/g, '')) : null,
    }
    try {
      if (cashbackRuleModal === 'new') {
        await api.post(`/api/cards/${editCard.id}/cashback-rules`, payload)
      } else {
        await api.put(`/api/cashback-rules/${cashbackRuleModal.id}`, payload)
      }
      const d = await api.get(`/api/cards/${editCard.id}/cashback-rules`)
      setCashbackRules(d.rules || [])
      setCashbackRuleModal(null)
    } finally {
      setRuleSaving(false)
    }
  }

  async function deleteRule(ruleId) {
    await api.delete(`/api/cashback-rules/${ruleId}`)
    setCashbackRules(rs => rs.filter(r => r.id !== ruleId))
  }

  async function handleDelete() {
    if (!confirmCard) return
    await api.delete(`/api/cards/${confirmCard.id}`)
    setConfirmCard(null); load()
  }

  function openSavingsAdd() {
    setEditSavings(null)
    setSavingsSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSavingsSheetVisible(true)))
  }
  function openSavingsEdit(item) {
    setEditSavings(item)
    setSavingsSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSavingsSheetVisible(true)))
  }
  function closeSavingsSheet() {
    setSavingsSheetVisible(false)
    setTimeout(() => { setSavingsSheetOpen(false); setEditSavings(null) }, 350)
  }
  async function handleDeleteSavings() {
    if (!confirmSavings) return
    await api.delete(`/api/savings/${confirmSavings.id}`)
    setConfirmSavings(null); load()
  }
  function openGoalAdd() {
    setEditGoal(null)
    setGoalSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setGoalSheetVisible(true)))
  }
  function openGoalEdit(item) {
    setEditGoal(item)
    setGoalSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setGoalSheetVisible(true)))
  }
  function closeGoalSheet() {
    setGoalSheetVisible(false)
    setTimeout(() => { setGoalSheetOpen(false); setEditGoal(null) }, 350)
  }
  async function handleDeleteGoal() {
    if (!confirmGoal) return
    await api.delete(`/api/savings-goals/${confirmGoal.id}`)
    setConfirmGoal(null); loadGoals()
  }

  function openInvAdd() {
    setEditInv(null); setInvSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setInvSheetVisible(true)))
  }
  function openInvEdit(item) {
    setEditInv(item); setInvSheetOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setInvSheetVisible(true)))
  }
  function closeInvSheet() {
    setInvSheetVisible(false)
    setTimeout(() => { setInvSheetOpen(false); setEditInv(null) }, 350)
  }
  async function handleDeleteInv() {
    if (!confirmInv) return
    await api.delete(`/api/investments/${confirmInv.id}`)
    setConfirmInv(null); load()
  }

  function fmtInput(val, setter, allowNeg = false, forceNeg = false, inputEl = null) {
    const neg = forceNeg || (allowNeg && val.startsWith('-'))
    const raw = val.replace(/[^0-9]/g, '')
    if (!raw) { setter(neg ? '-' : ''); return }
    const formatted = (neg ? '-' : '') + parseInt(raw).toLocaleString('ko-KR')
    restoreCaretAfterFormat(inputEl, formatted)
    setter(formatted)
  }

  if (!data) return null

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
    <div style={{ position: 'relative' }}>
      {activeSection === null && (
        <BudgetSectionGrid data={data} goals={goals} hiddenParts={hiddenParts} setHiddenParts={setHiddenParts} onPick={handlePick} />
      )}
      {(activeSection === 'bank' || closingSection === 'bank') && (
      <div ref={detailRef} style={closingSection === 'bank' ? closingOverlayStyle : undefined}>
      <div id="budget-section-cards" className="d-flex align-items-center justify-content-between mb-3 px-1">
        <span className="d-flex align-items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={closeDetail}>
          <i className="bi bi-chevron-left" style={{ color: '#b088f9', fontSize: '1.5rem', WebkitTextStroke: '1px #b088f9', position: 'relative', top: 1.5 }} />
          <span className="fw-semibold" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>은행별 잔고</span>
        </span>
        <div className="d-flex align-items-center gap-2">
          <FilterPopup title="금액 가리기"
            trigger={open => (
              <i className={`bi ${hiddenParts === 'all' || hiddenParts.length > 0 ? 'bi-eye-slash' : 'bi-eye'}`}
                onClick={open}
                style={{ fontSize: '1.05rem', color: 'var(--text-muted)', cursor: 'pointer' }} />
            )}
            sections={[{
              label: '가릴 항목', type: 'grid',
              options: [['balance', '은행별 잔고'], ['savings', '예·적금'], ['goal', '저축 목표'], ['invest', '투자']],
              value: hiddenParts, onChange: setHiddenParts,
            }]} />
          <FilterPopup sections={[{
            label: '정렬', options: [['기본', '기본순'], ['잔액순', '잔액순']],
            value: cardSort, onChange: setCardSort, dir: cardSortDir, onDirChange: setCardSortDir,
          }]} />
          <button onClick={openAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg me-1" />자산 추가
          </button>
        </div>
      </div>

      {data.card_stats.length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-5 text-muted">
            <i className="bi bi-credit-card" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 자산이 없습니다</p>
            <button onClick={openAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>자산 추가 →</button>
          </div>
        </div>
      ) : (() => {
        const allNormalCards = data.card_stats.filter(c => !c.is_loan)
        let loanCards = data.card_stats.filter(c => c.is_loan)
        let pointCards = allNormalCards.filter(c => !c.linked_account_id && c.point_reset_day)
        let accountCards = allNormalCards.filter(c => !c.linked_account_id && !c.point_reset_day)
        const linkedByAccount = {}
        allNormalCards.filter(c => c.linked_account_id).forEach(c => {
          if (!linkedByAccount[c.linked_account_id]) linkedByAccount[c.linked_account_id] = []
          linkedByAccount[c.linked_account_id].push(c)
        })
        if (cardSort === '잔액순') {
          accountCards = [...accountCards].sort(sortByNullable(c => c.balance, cardSortDir))
          pointCards = [...pointCards].sort(sortByNullable(c => c.balance, cardSortDir))
          loanCards = [...loanCards].sort(sortByNullable(c => Math.abs(c.balance), cardSortDir))
        }
        async function reorderCards(group, newOrder) {
          setData(d => ({
            ...d, card_stats: [
              ...(group === 'account' ? newOrder : accountCards),
              ...(group === 'point' ? newOrder : pointCards),
              ...(group === 'loan' ? newOrder : loanCards),
              ...allNormalCards.filter(c => c.linked_account_id),
            ]
          }))
          await api.post('/api/cards/reorder', { ids: newOrder.map(c => c.id) })
        }
        return (
          <>
            <SortableSection items={accountCards} sortable={cardSort === '기본'} onReorder={o => reorderCards('account', o)}
              renderItem={(card, dnd) => (
                <div key={card.id}>
                  <SwipeCard card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} onPerfClick={() => openPerfTx(card)} dnd={dnd} hideAmounts={hideBalance} />
                  {(linkedByAccount[card.id] || []).map(lc => (
                    <div key={lc.id} style={{ marginLeft: 16, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -12, top: 0, bottom: 12, width: 2, background: '#e8d5ff', borderRadius: 1 }} />
                      <SwipeCard card={lc} onEdit={() => openEdit(lc)} onDelete={() => setConfirmCard(lc)} onPerfClick={() => openPerfTx(lc)} linkedAccountName={card.name} hideAmounts={hideBalance} />
                    </div>
                  ))}
                </div>
              )} />
            {pointCards.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b08900' }}>🎁 포인트 </span>
                  <div style={{ flex: 1, height: 1, background: '#fdf3d5' }} />
                </div>
                <SortableSection items={pointCards} sortable={cardSort === '기본'} onReorder={o => reorderCards('point', o)}
                  renderItem={(card, dnd) => (
                    <SwipeCard key={card.id} card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} onConvert={() => { setConvertCard(card); setConvertAmount(''); setConvertAmountError(false) }} onPointInfo={() => { setPointInfoCard(card); setPointInfoEditing(false) }} onPerfClick={() => openPerfTx(card)} dnd={dnd} hideAmounts={hideBalance} />
                  )} />
              </>
            )}
            {loanCards.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc3545' }}>💸 대출 </span>
                  <div style={{ flex: 1, height: 1, background: '#fde8e8' }} />
                </div>
                <SortableSection items={loanCards} sortable={cardSort === '기본'} onReorder={o => reorderCards('loan', o)}
                  renderItem={(card, dnd) => (
                    <SwipeCard key={card.id} card={card} onEdit={() => openEdit(card)} onDelete={() => setConfirmCard(card)} onRepayChange={load} accountCards={allNormalCards} dnd={dnd} hideAmounts={hideBalance} />
                  )} />
              </>
            )}
          </>
        )
      })()}

      {/* 자산별 잔고 종합 */}
      {data.card_stats.length > 0 && (() => {
        const allNormalCards = data.card_stats.filter(c => !c.is_loan)
        const loanCards = data.card_stats.filter(c => c.is_loan)
        // exclude linked cards from balance sum to avoid double-counting
        const accountCards = allNormalCards.filter(c => !c.linked_account_id)
        const totalBalance = accountCards.reduce((s, c) => s + c.balance, 0)
        const totalSpent = allNormalCards.reduce((s, c) => s + c.spent, 0)
        const totalTarget = allNormalCards.reduce((s, c) => s + c.target, 0)
        const totalLoan = loanCards.reduce((s, c) => s + Math.abs(c.balance), 0)
        const totalRepaid = loanCards.reduce((s, c) => s + (c.total_repaid || 0), 0)
        return (
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid rgba(176,136,249,0.3)' }}>
            <div className="card-body py-3">
              <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9' }}>자산별 잔고 종합</span>
              </div>
              <div className="d-flex gap-2">
                {[
                  { label: '총 잔고', val: totalBalance, color: totalBalance >= 0 ? '#198754' : '#dc3545' },
                  { label: '이번달 지출', val: totalSpent, color: '#dc3545' },
                  { label: '이번달 한도', val: totalTarget, color: 'var(--text-secondary)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                    <div className={`amt-mask${hideBalance ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{fmt(val)}원</div>
                  </div>
                ))}
              </div>
              {loanCards.length > 0 && (
                <div className="d-flex gap-2 mt-2">
                  {[
                    { label: '총 부채', val: totalLoan, color: '#dc3545' },
                    { label: '상환 금액', val: totalRepaid, color: '#198754' },
                    { label: '순자산', val: totalBalance - totalLoan, color: (totalBalance - totalLoan) >= 0 ? '#198754' : '#dc3545' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ flex: 1, background: 'var(--bg-danger-subtle)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                      <div className={`amt-mask${hideBalance ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{label === '총 부채' ? '-' : ''}{fmt(val)}원</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* 월별 잔고 추이 */}
      {data.card_stats.filter(c => !c.is_loan && !c.linked_account_id).length > 0 && (
        <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid rgba(176,136,249,0.3)' }}>
          <div className="card-body py-3">
            <div className="d-flex align-items-center justify-content-between" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setBalHistOpen(o => !o)}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9' }}>월별 잔고 추이</span>
              <span style={{ fontSize: '1.2rem', color: '#b088f9', lineHeight: 1 }}>{balHistOpen ? '▴' : '▾'}</span>
            </div>
            {balHistOpen && (() => {
              const balHistAccounts = data.card_stats.filter(c => !c.is_loan && !c.linked_account_id)
              const balHistSelected = balHistAccounts.find(c => String(c.id) === String(balHistCardId))
              return (
              <div className="mt-3">
                <div className="mb-2">
                  <CardPicker cards={balHistAccounts} value={balHistSelected?.name || ''} placeholder="계좌 선택"
                    onChange={name => { const c = balHistAccounts.find(c => c.name === name); setBalHistCardId(c ? String(c.id) : '') }} />
                </div>
                <div className="d-flex gap-2 mb-2" style={{ flexWrap: 'nowrap' }}>
                  <div className="d-flex align-items-center gap-1" style={{ flex: 1, minWidth: 0 }}>
                    <input type="month" className="form-control form-control-sm" style={{ flex: 1, minWidth: 0, borderRadius: 8, padding: '4px 6px' }}
                      value={balHistStart} onChange={e => setBalHistStart(e.target.value)} />
                    <span className="text-muted" style={{ flexShrink: 0 }}>~</span>
                    <input type="month" className="form-control form-control-sm" style={{ flex: 1, minWidth: 0, borderRadius: 8, padding: '4px 6px' }}
                      value={balHistEnd} onChange={e => setBalHistEnd(e.target.value)} />
                  </div>
                  <button onClick={loadBalHist} disabled={!balHistCardId || !balHistStart || !balHistEnd || balHistLoading}
                    style={{ flexShrink: 0, background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 8, padding: '4px 14px', fontSize: '0.82rem', fontWeight: 600, opacity: (!balHistCardId || !balHistStart || !balHistEnd || balHistLoading) ? 0.5 : 1 }}>
                    {balHistLoading ? '조회 중…' : '조회'}
                  </button>
                </div>
                {balHistError && <p className="text-danger mb-0" style={{ fontSize: '0.82rem' }}>{balHistError}</p>}
                {balHistResults && (
                  balHistResults.length === 0 ? (
                    <p className="text-muted mb-0" style={{ fontSize: '0.82rem' }}>표시할 데이터가 없습니다.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table table-sm mb-0" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>월</th>
                            <th className="text-end">잔고</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balHistResults.map(r => (
                            <tr key={r.month}>
                              <td>{fmtMonth(r.month)}</td>
                              <td className="text-end" style={{ fontWeight: 600, color: r.balance == null ? 'var(--text-muted)' : (r.balance < 0 ? '#dc3545' : 'var(--text-primary)') }}>
                                {r.balance == null ? '데이터 없음' : `${fmt(r.balance)}원`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
              )
            })()}
          </div>
        </div>
      )}
      </div>
      )}

      {(activeSection === 'savings' || closingSection === 'savings') && (
      <div ref={detailRef} style={closingSection === 'savings' ? closingOverlayStyle : undefined}>
      <div id="budget-section-savings" className="d-flex align-items-center justify-content-between mb-3 px-1 mt-2">
        <span className="d-flex align-items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={closeDetail}>
          <i className="bi bi-chevron-left" style={{ color: '#b088f9', fontSize: '1.5rem', WebkitTextStroke: '1px #b088f9', position: 'relative', top: 1.5 }} />
          <span className="fw-semibold" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>예·적금</span>
        </span>
        <div className="d-flex align-items-center gap-2">
          <FilterPopup sections={[{
            label: '정렬', options: [['기본', '기본순'], ['만기일순', '만기일순']],
            value: savingsSort, onChange: setSavingsSort, dir: savingsSortDir, onDirChange: setSavingsSortDir,
          }]} />
          <button onClick={openSavingsAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg me-1" />예·적금 추가
          </button>
        </div>
      </div>
      {(data.savings || []).length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-4 text-muted">
            <i className="bi bi-piggy-bank" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 예·적금이 없습니다</p>
            <button onClick={openSavingsAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>예·적금 추가 →</button>
          </div>
        </div>
      ) : (() => {
        let savingsItems = data.savings || []
        if (savingsSort === '만기일순') {
          savingsItems = [...savingsItems].sort(sortByNullable(s => s.d_day, savingsSortDir))
        }
        return (
          <>
            <SortableSection items={savingsItems} sortable={savingsSort === '기본'}
              onReorder={async newOrder => {
                setData(d => ({ ...d, savings: newOrder }))
                await api.post('/api/savings/reorder', { ids: newOrder.map(s => s.id) })
              }}
              renderItem={(item, dnd) => (
                <SavingsItem key={item.id} item={item}
                  onEdit={() => openSavingsEdit(item)}
                  onDelete={() => setConfirmSavings(item)}
                  onDepositChange={load} dnd={dnd} hideAmounts={hideSavings} />
              )} />
          </>
        )
      })()}

      {/* 예·적금 종합 */}
      {(data.savings || []).length > 0 && (() => {
        const savings = data.savings || []
        const depositTotal = savings.filter(s => s.stype === '예금').reduce((s, i) => s + i.current_paid, 0)
        const installTotal = savings.filter(s => s.stype !== '예금').reduce((s, i) => s + i.current_paid, 0)
        const maturityTotal = savings.reduce((s, i) => s + i.maturity_after_tax, 0)
        const interestTotal = savings.reduce((s, i) => s + i.interest_after_tax, 0)
        return (
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid var(--border)' }}>
            <div className="card-body py-3">
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9', marginBottom: 10 }}>예·적금 종합</div>
              <div className="d-flex gap-2 mb-2">
                <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 3 }}>예금 원금</div>
                  <div className={`amt-mask${hideSavings ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{fmt(depositTotal)}원</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 3 }}>적금/청약 월 납입액</div>
                  <div className={`amt-mask${hideSavings ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{fmt(installTotal)}원</div>
                </div>
              </div>
              <div className="d-flex gap-2">
                <div style={{ flex: 1, background: 'var(--bg-success-subtle)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 3 }}>예상이자 (세후)</div>
                  <div className={`amt-mask${hideSavings ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#198754' }}>+{fmt(interestTotal)}원</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-success-subtle)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.66rem', color: '#aaa', marginBottom: 3 }}>예상만기금액 (세후)</div>
                  <div className={`amt-mask${hideSavings ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#198754' }}>{fmt(maturityTotal)}원</div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      </div>
      )}

      {(activeSection === 'goal' || closingSection === 'goal') && (
      <div ref={detailRef} style={closingSection === 'goal' ? closingOverlayStyle : undefined}>
      <div className="d-flex align-items-center justify-content-between mb-3 px-1 mt-2">
        <span className="d-flex align-items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={closeDetail}>
          <i className="bi bi-chevron-left" style={{ color: '#b088f9', fontSize: '1.5rem', WebkitTextStroke: '1px #b088f9', position: 'relative', top: 1.5 }} />
          <span className="fw-semibold" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>🎯 저축 목표</span>
        </span>
        <button onClick={openGoalAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          <i className="bi bi-plus-lg me-1" />목표 추가
        </button>
      </div>
      {goals.length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-4 text-muted">
            <i className="bi bi-flag" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 저축 목표가 없습니다</p>
            <button onClick={openGoalAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>목표 추가 →</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="mb-4">
          {goals.map(g => {
            const pct = g.target_amount > 0 ? Math.min(100, Math.round(g.current_amount / g.target_amount * 100)) : 0
            const dDay = g.target_date ? Math.ceil((new Date(g.target_date) - new Date(today())) / 86400000) : null
            return (
              <div key={g.id} className="card" style={{ borderRadius: 14, border: '1.5px solid var(--border)' }}>
                <div className="card-body py-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {g.manual ? '직접 입력' : `${g.savings_name} 연결`}
                        {g.target_date && (
                          <> · {g.target_date}{dDay !== null && (dDay >= 0 ? ` (D-${dDay})` : ' (기한 지남)')}</>
                        )}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      {g.manual && (
                        <button onClick={() => setAddAmountGoal(g)} title="금액 추가"
                          style={{ background: 'rgba(176,136,249,0.12)', border: 'none', borderRadius: 8, width: 28, height: 28, color: '#b088f9', fontSize: '1rem', cursor: 'pointer' }}>+</button>
                      )}
                      <button onClick={() => openGoalEdit(g)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button onClick={() => setConfirmGoal(g)} style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span className={`amt-mask${hideGoal ? ' amt-hidden' : ''}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(g.current_amount)}원</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span className={`amt-mask${hideGoal ? ' amt-hidden' : ''}`}>/ {fmt(g.target_amount)}원</span> ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-section)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#198754' : 'linear-gradient(90deg,#b088f9,#7baff0)', borderRadius: 6, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
      )}

      {(activeSection === 'invest' || closingSection === 'invest') && (
      <div ref={detailRef} style={closingSection === 'invest' ? closingOverlayStyle : undefined}>
      <div id="budget-section-investment" className="d-flex align-items-center justify-content-between mb-3 px-1 mt-2">
        <span className="d-flex align-items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={closeDetail}>
          <i className="bi bi-chevron-left" style={{ color: '#b088f9', fontSize: '1.5rem', WebkitTextStroke: '1px #b088f9', position: 'relative', top: 1.5 }} />
          <span className="fw-semibold" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>투자</span>
        </span>
        <div className="d-flex align-items-center gap-2">
          <FilterPopup sections={[
            {
              label: '정렬', options: [['기본', '기본순'], ['평가금액순', '평가금액순'], ['수익률순', '수익률순']],
              value: invSort, onChange: setInvSort, dir: invSortDir, onDirChange: setInvSortDir,
            },
            {
              // 투자 종류(국내주식/ETF 등)와 절세 계좌(ISA/연금저축/IRP)를 한 목록에
              // 섞어 나열하면 선택지가 뭐가 뭔지 구분이 안 되고 산만해 보인다는
              // 피드백 — 두 섹션으로 나눠 각각 자기 "전체" 토글을 갖게 하되, 실제
              // 선택 값은 하나의 invFilter 배열로 계속 합쳐서 관리(OR 매칭 유지).
              label: '종류', type: 'grid',
              options: INV_TYPE_FILTERS.map(f => {
                // 필터 칩은 3열로 좁아서 아이콘 + 전체 이름을 같이 붙이면
                // "국내..."처럼 글자가 잘려 보였다 — 아이콘은 유지하고 칩 안
                // 이름만 짧게 줄인다(국내주식→국내, 해외주식→해외).
                const tc = ITYPE_COLORS[f]
                const shortLabel = INV_TYPE_FILTER_SHORT[f] || f
                return [f, ITYPE_ICONS[f] ? `${ITYPE_ICONS[f]} ${shortLabel}` : shortLabel, tc?.color, tc?.bg]
              }),
              value: invFilter === 'all' ? 'all' : invFilter.filter(v => INV_TYPE_FILTERS.includes(v)),
              onChange: next => {
                const accSel = invFilter === 'all' ? INV_ACCOUNT_FILTERS : invFilter.filter(v => INV_ACCOUNT_FILTERS.includes(v))
                const typeSel = next === 'all' ? INV_TYPE_FILTERS : next
                const merged = [...typeSel, ...accSel]
                setInvFilter(merged.length === INV_FILTERS.length ? 'all' : merged)
              },
            },
            {
              label: '계좌', type: 'grid',
              options: INV_ACCOUNT_FILTERS.map(f => [f, f, INV_ACCOUNT_COLORS[f], `${INV_ACCOUNT_COLORS[f]}18`]),
              value: invFilter === 'all' ? 'all' : invFilter.filter(v => INV_ACCOUNT_FILTERS.includes(v)),
              onChange: next => {
                const typeSel = invFilter === 'all' ? INV_TYPE_FILTERS : invFilter.filter(v => INV_TYPE_FILTERS.includes(v))
                const accSel = next === 'all' ? INV_ACCOUNT_FILTERS : next
                const merged = [...typeSel, ...accSel]
                setInvFilter(merged.length === INV_FILTERS.length ? 'all' : merged)
              },
            },
          ]} />
          <button onClick={openInvAdd} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg me-1" />투자 추가
          </button>
        </div>
      </div>
      {acctEdit && createPortal(
        <div onClick={e => e.target === e.currentTarget && setAcctEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '22px 20px', width: 'min(88vw,340px)' }}>
            {!acctEdit.confirmDelete ? (<>
              <div className="fw-bold mb-3">계좌 수정</div>
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>증권사</p>
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>증권사</p>
              <div style={{ marginBottom: 12 }}>
                <BrokerSearch value={acctEdit.brokerName || ''} onChange={v => setAcctEdit(c => ({ ...c, brokerName: v, broker: keyOfName(v) }))} />
              </div>
              {(
                <div style={{ marginBottom: 12 }}>
                  <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>증권사 로고 (선택)</p>
                  <div className="d-flex align-items-center gap-2">
                    <label htmlFor="acct-icon-input" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, border: '1.5px dashed var(--border-light)', color: '#b088f9', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                      {acctEdit.iconPreview
                        ? <img src={acctEdit.iconPreview} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                        : (acctEdit.hasIcon && !acctEdit.removeIcon)
                          ? <img src={`/api/invest-accounts/${acctEdit.id}/icon?v=${acctEdit.iconVersion}`} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                          : <i className="bi bi-image" />}
                      {(acctEdit.hasIcon && !acctEdit.removeIcon) || acctEdit.iconPreview ? '로고 변경' : '로고 이미지 직접 올리기'}
                    </label>
                    <input type="file" id="acct-icon-input" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setAcctEdit(c => ({ ...c, cropFile: f })) }} />
                    {((acctEdit.hasIcon && !acctEdit.removeIcon) || acctEdit.iconPreview) && (
                      <button type="button" onClick={() => setAcctEdit(c => ({ ...c, iconPreview: null, iconBlob: null, removeIcon: true }))}
                        style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.8rem' }}>로고 삭제</button>
                    )}
                  </div>
                </div>
              )}
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>계좌 개설일 (선택)</p>
              <div style={{ marginBottom: 10 }}><DatePickerSheet value={acctEdit.openedAt || ''} onChange={v => setAcctEdit(c => ({ ...c, openedAt: v }))} center /></div>
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>투자 원금 (선택)</p>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input type="text" inputMode="numeric" value={acctEdit.principal || ''} placeholder="처음 넣은 금액"
                  onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setAcctEdit(c => ({ ...c, principal: r ? parseInt(r).toLocaleString('ko-KR') : '' })) }}
                  style={{ width: '100%', borderRadius: 10, padding: '9px 12px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', paddingRight: 36 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
              </div>
              <p className="mb-1 text-muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>계좌 이름</p>
              <input type="text" value={acctEdit.name} onChange={e => setAcctEdit(c => ({ ...c, name: e.target.value }))}
                style={{ width: '100%', borderRadius: 10, padding: '9px 12px', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: 16 }} />
              <div className="d-flex gap-2 mb-3">
                <button className="btn flex-fill" disabled={!acctEdit.name.trim()} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}
                  onClick={async () => {
                    await api.put(`/api/invest-accounts/${acctEdit.id}`, { name: acctEdit.name.trim(), broker: acctEdit.broker, broker_name: (acctEdit.brokerName || '').trim(), opened_at: acctEdit.openedAt || null, principal: parseInt((acctEdit.principal || '').replace(/,/g, '')) || null })
                    if (acctEdit.iconBlob) {
                      const fd = new FormData()
                      fd.append('icon', acctEdit.iconBlob)
                      await fetch(`/api/invest-accounts/${acctEdit.id}/icon`, { method: 'POST', credentials: 'include', body: fd })
                    } else if (acctEdit.removeIcon) {
                      await fetch(`/api/invest-accounts/${acctEdit.id}/icon`, { method: 'DELETE', credentials: 'include' })
                    }
                    setAcctEdit(null); load()
                  }}>저장</button>
                <button className="btn btn-outline-secondary flex-fill" onClick={() => setAcctEdit(null)} style={{ borderRadius: 10 }}>취소</button>
              </div>
              <button type="button" onClick={() => setAcctEdit(c => ({ ...c, confirmDelete: true }))}
                style={{ width: '100%', background: 'none', border: 'none', color: '#dc3545', fontSize: '0.85rem', fontWeight: 600, padding: '6px 0', cursor: 'pointer' }}>계좌 삭제</button>
            </>) : (<>
              <p className="text-center fw-semibold mb-1">"{acctEdit.name}" 계좌를 삭제할까요?</p>
              <p className="text-center text-muted mb-3" style={{ fontSize: '0.8rem' }}>계좌 안 종목은 지워지지 않고 "계좌 없음"이 돼요. 다시 계좌를 지정해야 매매 기록을 할 수 있어요.</p>
              <div className="d-flex gap-2">
                <button className="btn flex-fill" style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 10 }}
                  onClick={async () => { await api.delete(`/api/invest-accounts/${acctEdit.id}`); setAcctEdit(null); load() }}>삭제</button>
                <button className="btn btn-outline-secondary flex-fill" onClick={() => setAcctEdit(c => ({ ...c, confirmDelete: false }))} style={{ borderRadius: 10 }}>취소</button>
              </div>
            </>)}
          </div>
        </div>,
        document.body
      )}

      <AccountAddSheet open={acctAddOpen} onClose={() => setAcctAddOpen(false)} onCreated={() => load()} />
      <AccountDetailSheet accountId={detailId} onClose={() => setDetailId(null)} />

      <ImageCropper file={acctEdit?.cropFile || null}
        onCancel={() => setAcctEdit(c => c && ({ ...c, cropFile: null }))}
        onConfirm={blob => setAcctEdit(c => c && ({ ...c, cropFile: null, iconBlob: blob, iconPreview: URL.createObjectURL(blob), removeIcon: false }))} />

      {cashEdit && createPortal(
        <div onClick={e => e.target === e.currentTarget && setCashEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '22px 20px', width: 'min(88vw,320px)' }}>
            <div className="fw-bold mb-1">{cashEdit.name} 예수금</div>
            <p className="text-muted mb-3" style={{ fontSize: '0.78rem' }}>매수·매도를 기록하면 자동으로 바뀌어요. 실제 금액과 다르면 여기서 고쳐 주세요.</p>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input type="text" inputMode="numeric" value={cashEdit.value} placeholder="0"
                onChange={e => { const r = e.target.value.replace(/[^0-9-]/g, ''); setCashEdit(c => ({ ...c, value: r ? parseInt(r).toLocaleString('ko-KR') : '' })) }}
                style={{ borderRadius: 10, padding: '10px 36px 10px 12px', width: '100%', border: '1.5px solid var(--border-light)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.95rem' }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setCashEdit(null)} style={{ borderRadius: 10 }}>취소</button>
              <button className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}
                onClick={async () => { const n = parseInt(String(cashEdit.value).replace(/,/g, '')) || 0; await api.put(`/api/invest-accounts/${cashEdit.id}`, { cash: n }); setCashEdit(null); load() }}>저장</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {(data.investments || []).some(i => !i.account_id) && (
        <div style={{ fontSize: '0.8rem', color: '#e67e22', background: 'rgba(230,126,34,0.1)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
          <i className="bi bi-exclamation-circle me-1" />계좌가 없는 종목 {(data.investments || []).filter(i => !i.account_id).length}개 — 수정에서 투자 계좌를 지정해 주세요
        </div>
      )}
      {(

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 10, scrollbarWidth: 'none' }}>
          {(data.invest_accounts || []).map(a => {
            // 손익은 종목 평가액 기준 (예수금은 투자 원금이 아니므로 제외)
            const gain = a.holdings_value - a.purchase_value
            const pct = a.purchase_value ? (gain / a.purchase_value * 100).toFixed(1) : '0.0'
            return (
              <div key={a.id} onClick={e => { if (e.target.closest('button')) return; setDetailId(a.id) }} style={{ cursor: 'pointer', minWidth: 170, padding: '12px 14px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(176,136,249,0.12),rgba(123,175,240,0.12))', border: '1px solid var(--border-light)', flexShrink: 0, position: 'relative' }}>
                <button type="button" onClick={() => setAcctEdit({ id: a.id, name: a.name, broker: a.broker || '', brokerName: a.broker_name || brokerOf(a.broker)?.name || '', openedAt: a.opened_at || '', principal: a.principal ? Math.round(a.principal).toLocaleString('ko-KR') : '', confirmDelete: false, hasIcon: !!a.has_custom_icon, iconVersion: a.icon_v, iconPreview: null, iconBlob: null, removeIcon: false, cropFile: null })}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.9rem', padding: 2, cursor: 'pointer' }} aria-label="계좌 수정">
                  <i className="bi bi-gear" />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <BrokerBadge brokerKey={a.broker} size={22} customSrc={a.has_custom_icon ? `/api/invest-accounts/${a.id}/icon?v=${a.icon_v}` : null} label={a.broker_name} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b088f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{fmt(a.balance)}원</div>
                <button type="button" onClick={() => setCashEdit({ id: a.id, name: a.name, value: a.cash ? Math.round(a.cash).toLocaleString('ko-KR') : '' })}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left' }}>
                  {a.cash_set ? <>예수금 {fmt(a.cash)}원</> : <>예수금 입력</>} <i className="bi bi-pencil" style={{ fontSize: '0.65rem' }} />
                </button>
                <div style={{ fontSize: '0.72rem', color: gain >= 0 ? '#e74c3c' : '#3b82f6', marginTop: 2, fontWeight: 600 }}>
                  {gain >= 0 ? '+' : ''}{fmt(gain)}원 ({gain >= 0 ? '+' : ''}{pct}%) · 종목 {a.holding_count}개
                </div>
              </div>
            )
          })}
          <button type="button" onClick={() => setAcctAddOpen(true)}
            style={{ minWidth: 120, padding: '12px 14px', borderRadius: 14, border: '1.5px dashed #b088f9', background: 'transparent', color: '#b088f9', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg me-1" />증권사 추가
          </button>
        </div>
      )}
      {(data.investments || []).length === 0 ? (
        <div className="card mb-4 text-center">
          <div className="card-body py-4 text-muted">
            <i className="bi bi-graph-up-arrow" style={{ fontSize: '2rem' }} />
            <p className="mt-2 mb-0">등록된 투자가 없습니다</p>
            <button onClick={openInvAdd} className="btn btn-sm mt-3" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>투자 추가 →</button>
          </div>
        </div>
      ) : (() => {
        let filteredInv = (data.investments || []).filter(i => matchesInvFilter(i, invFilter))
        if (invSort === '평가금액순') filteredInv = [...filteredInv].sort(sortByNullable(i => i.current_value, invSortDir))
        else if (invSort === '수익률순') filteredInv = [...filteredInv].sort(sortByNullable(i => i.profit_pct, invSortDir))
        return (
        <>
          {filteredInv.length === 0 ? (
            <div className="card mb-4 text-center">
              <div className="card-body py-4 text-muted">
                <p className="mb-0">필터에 해당하는 투자가 없습니다</p>
              </div>
            </div>
          ) : (
            <SortableSection items={filteredInv} sortable={invSort === '기본'}
              onReorder={async newOrder => {
                const otherIds = new Set(newOrder.map(i => i.id))
                setData(d => ({ ...d, investments: [...newOrder, ...(d.investments || []).filter(i => !otherIds.has(i.id))] }))
                await api.post('/api/investments/reorder', { ids: newOrder.map(i => i.id) })
              }}
              renderItem={(item, dnd) => (
                <InvestmentItem key={item.id} item={item}
                  onEdit={() => openInvEdit(item)}
                  onDelete={() => setConfirmInv(item)} dnd={dnd} hideAmounts={hideInvest} />
              )} />
          )}
          <div className="card mb-4" style={{ borderRadius: 14, border: '1.5px solid var(--border)' }}>
            <div className="card-body py-3">
              <div className="d-flex justify-content-between align-items-center">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{invFilter === 'all' ? '총 평가금액' : '선택 평가금액'}</span>
                <span className={`amt-mask${hideInvest ? ' amt-hidden' : ''}`} style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(filteredInv.reduce((s, i) => s + i.current_value, 0))}원</span>
              </div>
              {(() => {
                const totalPurch = filteredInv.reduce((s, i) => s + i.purchase_value, 0)
                const totalCur = filteredInv.reduce((s, i) => s + i.current_value, 0)
                const profit = totalCur - totalPurch
                const pct = totalPurch ? (profit / totalPurch * 100).toFixed(2) : 0
                return (
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{invFilter === 'all' ? '총 수익' : '선택 수익'}</span>
                    <span className={`amt-mask${hideInvest ? ' amt-hidden' : ''}`} style={{ fontWeight: 700, fontSize: '0.95rem', color: profit >= 0 ? '#198754' : '#dc3545' }}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)}원 ({profit >= 0 ? '+' : ''}{pct}%)
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        </>
        )
      })()}
      </div>
      )}
    </div>

      <div className="d-lg-none" style={{ height: 90 }} />

      <AddSheet open={addSheetOpen} visible={addSheetVisible} onClose={closeAdd} onSaved={load} cards={data?.card_stats || []} />

      <SavingsSheet open={savingsSheetOpen} visible={savingsSheetVisible} onClose={closeSavingsSheet} onSaved={load} editItem={editSavings} />

      <InvestmentSheet open={invSheetOpen} visible={invSheetVisible} onClose={closeInvSheet} onSaved={load} editItem={editInv} accounts={data?.invest_accounts || []} onAccountsChanged={load} />

      <GoalSheet open={goalSheetOpen} visible={goalSheetVisible} onClose={closeGoalSheet} onSaved={loadGoals} editItem={editGoal} savingsList={data?.savings || []} investmentList={data?.investments || []} accountList={data?.invest_accounts || []} />

      {confirmCard && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>카드를 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button autoFocus className="btn flex-fill" onClick={handleDelete} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmCard(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {convertCard && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-1" style={{ fontSize: '1rem' }}>포인트 전환</p>
            <p className="text-center text-muted mb-3" style={{ fontSize: '0.8rem' }}>
              {convertCard.name}에 남은 <span className={`amt-mask${hideBalance ? ' amt-hidden' : ''}`}>{fmt(convertCard.balance)}원</span> 중 전환할 금액만큼 다음 초기화 때 사라지지 않고 초기화 금액에 그대로 더해져 쌓여요.
            </p>
            <div className="mb-1" style={{ position: 'relative' }}>
              <input type="text" className={`form-control${convertAmountError ? ' field-invalid' : ''}`} placeholder="전환할 금액" inputMode="numeric" autoFocus
                value={convertAmount}
                onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setConvertAmount(v); setConvertAmountError(false) }}
                style={{ borderRadius: 10, paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
            </div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              {convertAmountError
                ? <div style={{ color: '#dc3545', fontSize: '0.75rem' }}>남은 금액 이하로 입력해 주세요</div>
                : <span />}
              <button type="button" onClick={() => { setConvertAmount(String(convertCard.balance)); setConvertAmountError(false) }}
                style={{ background: 'none', border: 'none', color: '#b088f9', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>전액 전환</button>
            </div>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" disabled={convertLoading} onClick={handleConvert}
                style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, opacity: convertLoading ? 0.5 : 1 }}>
                {convertLoading ? '전환 중…' : '전환하기'}
              </button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConvertCard(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {perfTxCard && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setPerfTxCard(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '75dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px' }}>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <h6 className="mb-0 fw-bold">{perfTxCard.name} · 이달 실적 내역</h6>
              <button onClick={() => setPerfTxCard(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            <p className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>{fmt(perfTxCard.spent)} / {fmt(perfTxCard.target)}원 · {perfTxCard.percent}%</p>
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1 }}>
              {perfTxLoading ? (
                <p className="text-center text-muted" style={{ fontSize: '0.82rem', padding: '20px 0' }}>불러오는 중…</p>
              ) : perfTxList.length === 0 ? (
                <p className="text-center text-muted" style={{ fontSize: '0.82rem', padding: '20px 0' }}>이달 실적에 해당하는 내역이 없습니다</p>
              ) : (() => {
                const byDate = perfTxList.reduce((acc, tx) => {
                  if (!acc[tx.date]) acc[tx.date] = []
                  acc[tx.date].push(tx)
                  return acc
                }, {})
                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
                return dates.map(date => (
                  <div key={date} className="mb-2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 4px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>{fmtDate(date)}</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        -{fmt(byDate[date].reduce((s, t) => s + t.amount, 0))}원
                      </span>
                    </div>
                    <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      {byDate[date].map((tx, i) => (
                        <div key={tx.id} style={{ padding: '12px 14px', background: 'var(--bg-card)', borderBottom: i < byDate[date].length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                          <TxItem tx={tx} emojiMap={perfTxEmojiMap} showBalance={false} showTime />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {pointInfoCard && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setPointInfoCard(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <p className="fw-semibold mb-0" style={{ fontSize: '1rem' }}>{pointInfoCard.name}</p>
              {!pointInfoEditing && (
                <button type="button" onClick={() => {
                  setPointInfoUsable(String(pointInfoCard.balance)); setPointInfoCarryover(String(pointInfoCard.point_carryover || 0)); setPointInfoEditing(true)
                }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>✏️ 수정</button>
              )}
            </div>
            {!pointInfoEditing ? (<>
              <div className="d-flex justify-content-between align-items-center mb-2" style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(25,135,84,0.08)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>남은 포인트</span>
                <span className={`fw-bold amt-mask${hideBalance ? ' amt-hidden' : ''}`} style={{ fontSize: '0.95rem', color: '#198754' }}>{fmt(pointInfoCard.balance)}원</span>
              </div>
              <div className="d-flex justify-content-between align-items-center mb-3" style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(176,136,249,0.1)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>전환 포인트</span>
                <span className={`fw-bold amt-mask${hideBalance ? ' amt-hidden' : ''}`} style={{ fontSize: '0.95rem', color: '#b088f9' }}>{fmt(pointInfoCard.point_carryover || 0)}원</span>
              </div>
              <div className="d-flex gap-2">
                {pointInfoCard.balance > 0 && (
                  <button className="btn flex-fill" onClick={() => {
                    setConvertCard(pointInfoCard); setConvertAmount(''); setConvertAmountError(false); setPointInfoCard(null)
                  }} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>전환하기</button>
                )}
                <button className="btn btn-outline-secondary flex-fill" onClick={() => setPointInfoCard(null)} style={{ borderRadius: 10 }}>닫기</button>
              </div>
            </>) : (<>
              <p className="text-muted mb-2" style={{ fontSize: '0.72rem' }}>전환하기를 잘못 눌렀을 때 등 직접 바로잡을 때만 사용하세요.</p>
              <div className="mb-2">
                <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>남은 포인트</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, paddingRight: 36 }}
                    value={pointInfoUsable} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setPointInfoUsable(v) }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>전환 포인트</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, paddingRight: 36 }}
                    value={pointInfoCarryover} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? String(parseInt(raw)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; restoreCaretAfterFormat(e.target, v); setPointInfoCarryover(v) }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn flex-fill" disabled={pointInfoSaving} onClick={handlePointBalanceSave}
                  style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, opacity: pointInfoSaving ? 0.5 : 1 }}>
                  {pointInfoSaving ? '저장 중…' : '저장'}
                </button>
                <button className="btn btn-outline-secondary flex-fill" onClick={() => setPointInfoEditing(false)} style={{ borderRadius: 10 }}>취소</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {cashbackRulesSheetOpen && editCard && createPortal(
        <div onClick={e => e.target === e.currentTarget && setCashbackRulesSheetOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px' }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0 fw-bold">{editCard.name} · 캐시백 규칙</h6>
              <button onClick={() => setCashbackRulesSheetOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            <p className="text-muted mb-3" style={{ fontSize: '0.72rem' }}>
              규칙을 하나라도 등록하면, 카드의 "캐시백 / 충전 보너스" 고정 비율 대신 가맹점명(항목 설명) 매칭으로 캐시백을 계산합니다.
            </p>
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1 }}>
              {cashbackRules.length > 0 ? cashbackRules.map(r => (
                <div key={r.id} onClick={() => openRuleModal(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-accent)', marginBottom: 8, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name} · {r.rate}%</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {r.keywords}
                      {r.prev_month_min ? ` · 전월 ${r.prev_month_min.toLocaleString('ko-KR')}원 이상` : ''}
                      {(r.daily_cap || r.monthly_cap) && (
                        <> · {r.daily_cap ? `일 ${r.daily_cap.toLocaleString('ko-KR')}원` : ''}{r.daily_cap && r.monthly_cap ? ' · ' : ''}{r.monthly_cap ? `월 ${r.monthly_cap.toLocaleString('ko-KR')}원` : ''}</>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); deleteRule(r.id) }}
                    style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.78rem', padding: '2px 6px', flexShrink: 0 }}>삭제</button>
                </div>
              )) : (
                <p className="text-center text-muted" style={{ fontSize: '0.82rem', padding: '20px 0' }}>등록된 규칙이 없습니다</p>
              )}
              <button type="button" onClick={() => openRuleModal(null)}
                style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px dashed #b088f9', background: 'rgba(176,136,249,0.06)', color: '#b088f9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginBottom: 14 }}>
                + 규칙 추가
              </button>
              {cashbackRules.length > 0 && (
                <div className="mb-3" style={{ position: 'relative' }}>
                  <label className="text-muted mb-1 d-block" style={{ fontSize: '0.78rem' }}>통합 월 한도 (선택, 예: 전월실적 구간별 한도)</label>
                  <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, paddingRight: 36 }}
                    value={editCashbackMonthlyCap} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; setEditCashbackMonthlyCap(v) }} />
                  <span style={{ position: 'absolute', right: 12, top: 34, color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {cashbackRuleModal && createPortal(
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2500, alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}
          onClick={e => e.target === e.currentTarget && setCashbackRuleModal(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '20px', width: '100%', maxWidth: 340, maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="fw-semibold mb-3" style={{ fontSize: '1rem' }}>{cashbackRuleModal === 'new' ? '캐시백 규칙 추가' : '캐시백 규칙 수정'}</p>
            <div className="mb-2">
              <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>규칙 이름</label>
              <input type="text" className="form-control" placeholder="예: 편의점 20%" style={{ borderRadius: 10 }}
                value={ruleName} onChange={e => setRuleName(e.target.value)} />
            </div>
            <div className="mb-2">
              <div className="d-flex align-items-center gap-1 mb-1">
                <label className="text-muted mb-0" style={{ fontSize: '0.78rem' }}>가맹점명 키워드</label>
                <button type="button" onClick={() => setRuleHelpOpen(o => !o)} style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid #b088f9', background: 'transparent', color: '#b088f9', fontSize: '0.7rem', fontWeight: 700, padding: 0, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>?</button>
              </div>
              <input type="text" className="form-control" placeholder="예: GS25, CU" style={{ borderRadius: 10 }}
                value={ruleKeywords} onChange={e => setRuleKeywords(e.target.value)} />
              {ruleHelpOpen && (
                <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-accent)', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  쉼표(,)로 구분해서 여러 개 적을 수 있어요. 항목 설명에 이 중 하나라도 들어 있으면 이 규칙이 적용됩니다.
                  <div style={{ marginTop: 4, color: 'var(--text-primary)' }}>예) <b>GS25, CU</b> → 설명에 "GS25"나 "CU"가 들어간 거래</div>
                  <div style={{ color: 'var(--text-primary)' }}>예) <b>스타벅스, 이디야, 메가커피</b> → 세 매장 중 하나라도 해당</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>대소문자는 구분하지 않아요.</div>
                </div>
              )}
            </div>
            <div className="mb-2">
              <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>전월 실적 조건</label>
              <div className="d-flex gap-2 mb-2">
                {[['none', '조건 없음'], ['min', '전월 실적 이상일 때만']].map(([val, label]) => {
                  const on = (val === 'min') === !!rulePrevMin
                  return (
                    <button key={val} type="button" onClick={() => setRulePrevMin(val === 'min' ? (rulePrevMin || '0') : '')}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1.5px solid ${on ? '#b088f9' : 'var(--border-light)'}`, background: on ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: on ? '#b088f9' : 'var(--text-muted)', fontWeight: on ? 600 : 400, fontSize: '0.78rem', cursor: 'pointer' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
              {!!rulePrevMin && (
                <div style={{ position: 'relative' }}>
                  <input type="text" inputMode="numeric" className="form-control" placeholder="지난달 이 카드 지출 합계 기준 (예: 300,000)" style={{ borderRadius: 10, paddingRight: 36 }}
                    value={rulePrevMin} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setRulePrevMin(raw ? parseInt(raw).toLocaleString('ko-KR') : '0') }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                </div>
              )}
              <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>구간별로 다른 비율이면, 높은 구간 규칙을 위에 두고 구간마다 규칙을 따로 만드세요.</div>
            </div>
            <div className="mb-2">
              <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>캐시백 비율</label>
              <div style={{ position: 'relative' }}>
                <input type="number" className="form-control" style={{ borderRadius: 10, paddingRight: 36 }} step="0.1" min="0" max="100"
                  value={ruleRate} onChange={e => setRuleRate(e.target.value)} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>%</span>
              </div>
            </div>
            <p className="text-muted mb-1 mt-3" style={{ fontSize: '0.78rem', fontWeight: 600 }}>한도 (선택, 비워두면 무제한)</p>
            <div className="d-flex gap-2 mb-2">
              <div style={{ flex: 1 }}>
                <label className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>일 한도 금액</label>
                <input type="text" inputMode="numeric" className="form-control form-control-sm" style={{ borderRadius: 8 }}
                  value={ruleDailyCap} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setRuleDailyCap(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>일 최대 횟수</label>
                <input type="number" className="form-control form-control-sm" style={{ borderRadius: 8 }} min="0"
                  value={ruleDailyCountCap} onChange={e => setRuleDailyCountCap(e.target.value)} />
              </div>
            </div>
            <div className="d-flex gap-2 mb-3">
              <div style={{ flex: 1 }}>
                <label className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>월 한도 금액</label>
                <input type="text" inputMode="numeric" className="form-control form-control-sm" style={{ borderRadius: 8 }}
                  value={ruleMonthlyCap} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setRuleMonthlyCap(raw ? parseInt(raw).toLocaleString('ko-KR') : '') }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>월 최대 횟수</label>
                <input type="number" className="form-control form-control-sm" style={{ borderRadius: 8 }} min="0"
                  value={ruleMonthlyCountCap} onChange={e => setRuleMonthlyCountCap(e.target.value)} />
              </div>
            </div>
            <div className="d-flex gap-2">
              <button className="btn flex-fill" disabled={ruleSaving || !ruleName.trim() || !ruleKeywords.trim() || !ruleRate} onClick={saveRule}
                style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, opacity: ruleSaving ? 0.5 : 1 }}>
                {ruleSaving ? '저장 중…' : '저장'}
              </button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setCashbackRuleModal(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmSavings && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>예·적금을 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button autoFocus className="btn flex-fill" onClick={handleDeleteSavings} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmSavings(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {confirmInv && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>투자 항목을 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button autoFocus className="btn flex-fill" onClick={handleDeleteInv} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmInv(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {confirmGoal && createPortal(
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px', width: 'min(88vw,320px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p className="text-center fw-semibold mb-4" style={{ fontSize: '1rem' }}>저축 목표를 삭제하시겠습니까?</p>
            <div className="d-flex gap-2">
              <button autoFocus className="btn flex-fill" onClick={handleDeleteGoal} style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10 }}>확인</button>
              <button className="btn btn-outline-secondary flex-fill" onClick={() => setConfirmGoal(null)} style={{ borderRadius: 10 }}>취소</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {addAmountGoal && createPortal(
        <AddGoalAmountModal goal={addAmountGoal} onClose={() => setAddAmountGoal(null)} onSaved={loadGoals} />,
        document.body
      )}

      {editSheetOpen && createPortal(
        <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, alignItems: 'flex-end', justifyContent: 'center', opacity: editSheetVisible ? 1 : 0, transition: 'opacity 0.28s ease' }}
          onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', padding: '20px 16px 0', transform: editSheetVisible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), max-height 0.2s ease' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="mb-0 fw-bold">{editCard?.name} 수정</h6>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </div>
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, paddingBottom: 20 }}>
              <form id="edit-card-form" onSubmit={handleEditSave}>
                {!editCard?.point_reset_day && (
                  <div className="mb-3">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>초기 잔고</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" inputMode={editCard?.is_loan ? 'text' : 'numeric'} className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }}
                        value={editInitial} onChange={e => fmtInput(e.target.value, setEditInitial, true, editCard?.is_loan, e.target)} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                    </div>
                    <div className="mt-2">
                      <label className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>작성한 반영할 날짜</label>
                      <DatePickerSheet value={editBalanceDate} onChange={setEditBalanceDate} />
                    </div>
                  </div>
                )}
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>월 실적 목표 금액</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" inputMode="numeric" className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }}
                      value={editTarget} onChange={e => fmtInput(e.target.value, setEditTarget, false, false, e.target)} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>색상 구간 설정 (%)</label>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="badge" style={{ background: '#dc3545' }}>빨강 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier1} min={0} max={100} onChange={e => setEditTier1(+e.target.value)} />
                    <span className="badge" style={{ background: '#ffc107', color: '#333' }}>노랑 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier2} min={0} max={100} onChange={e => setEditTier2(+e.target.value)} />
                    <span className="badge" style={{ background: '#0d6efd' }}>파랑 ≤</span>
                    <input type="number" className="form-control form-control-sm" style={{ width: 60, borderRadius: 8 }} value={editTier3} min={0} max={100} onChange={e => setEditTier3(+e.target.value)} />
                    <span className="badge" style={{ background: '#198754' }}>초록</span>
                  </div>
                </div>
                {!editCard?.is_loan && (
                  <div className="mb-2">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>로고 (선택)</label>
                    <div className="d-flex align-items-center gap-2">
                      <label htmlFor="edit-custom-icon-input" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: '1.5px dashed var(--border-light)', color: '#b088f9', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                        {editCustomIconPreview
                          ? <img src={editCustomIconPreview} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                          : (editCard?.has_custom_icon && !editRemoveIcon)
                            ? <img src={`/api/cards/${editCard.id}/icon`} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                            : <i className="bi bi-image" />}
                        {editCard?.has_custom_icon || editCustomIconPreview ? '로고 변경' : '목록에 없는 은행/포인트사 로고 직접 추가'}
                      </label>
                      <input type="file" id="edit-custom-icon-input" accept="image/*" onChange={pickEditCustomIcon} style={{ display: 'none' }} />
                      {((editCard?.has_custom_icon && !editRemoveIcon) || editCustomIconPreview) && (
                        <button type="button" onClick={() => {
                          if (editCustomIconPreview) URL.revokeObjectURL(editCustomIconPreview)
                          setEditCustomIconFile(null); setEditCustomIconPreview(null); setEditRemoveIcon(true)
                        }} style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.8rem' }}>로고 삭제</button>
                      )}
                    </div>
                  </div>
                )}
                <ImageCropper file={editCropFile} onCancel={() => setEditCropFile(null)} onConfirm={onEditCropConfirm} />
                {!editCard?.is_loan && (
                  <div className="mb-2">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>혜택 사이트 URL (선택)</label>
                    <input type="url" className="form-control" style={{ borderRadius: 10, fontSize: '1rem' }} placeholder="https://..."
                      value={editUrl} onChange={e => setEditUrl(e.target.value)} />
                  </div>
                )}
                {!editCard?.is_loan && editUrl && (
                  <a href={editUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-block', fontSize: '0.82rem', color: '#b088f9', textDecoration: 'none', marginBottom: 8 }}>
                    🔗 혜택 사이트 바로가기
                  </a>
                )}
                {!editCard?.is_loan && (
                  <div className="mb-3">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>캐시백 / 충전 보너스 (선택)</label>
                    <div className="d-flex gap-2 mb-2">
                      {[['', '없음'], ['payment', '결제 시 캐시백'], ['charge', '충전 시 보너스']].map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setEditCashbackType(val)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1.5px solid ${editCashbackType === val ? '#b088f9' : 'var(--border-light)'}`, background: editCashbackType === val ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: editCashbackType === val ? '#b088f9' : 'var(--text-muted)', fontWeight: editCashbackType === val ? 600 : 400, fontSize: '0.78rem', cursor: 'pointer' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {editCashbackType && (
                      <div style={{ position: 'relative' }}>
                        <input type="number" className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }}
                          placeholder={editCashbackType === 'payment' ? '결제 금액 대비 캐시백율 (예: 15)' : '충전 금액 대비 보너스율 (예: 5)'}
                          value={editCashbackRate} onChange={e => setEditCashbackRate(e.target.value)} step="0.1" min="0" max="100" inputMode="decimal" />
                        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>%</span>
                      </div>
                    )}
                  </div>
                )}
                {!editCard?.is_loan && (
                  <div className="mb-3">
                    <button type="button" onClick={() => setCashbackRulesSheetOpen(true)}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-accent)', cursor: 'pointer' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        🎁 캐시백 규칙{cashbackRules.length > 0 ? ` (${cashbackRules.length}개)` : ' (가맹점별, 선택)'}
                      </span>
                      <i className="bi bi-chevron-right" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
                    </button>
                  </div>
                )}
                {!editCard?.is_loan && (
                  <div className="mb-3">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>포인트 정기 충전 (선택)</label>
                    <div className="d-flex gap-2 mb-2">
                      {[[false, '일반 (이월)'], [true, '정기 충전 (복지 포인트 등)']].map(([val, label]) => (
                        <button key={String(val)} type="button" onClick={() => setEditPointResetOn(val)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1.5px solid ${editPointResetOn === val ? '#b088f9' : 'var(--border-light)'}`, background: editPointResetOn === val ? 'rgba(176,136,249,0.1)' : 'var(--bg-card)', color: editPointResetOn === val ? '#b088f9' : 'var(--text-muted)', fontWeight: editPointResetOn === val ? 600 : 400, fontSize: '0.78rem', cursor: 'pointer' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {editPointResetOn && (
                      <>
                        <div className="d-flex gap-2 mb-2">
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input type="number" className="form-control" placeholder="매월 며칠 (예: 5)" inputMode="numeric"
                              value={editPointResetDay} onChange={e => setEditPointResetDay(e.target.value)} style={{ borderRadius: 10, paddingRight: 28 }} min="1" max="28" />
                            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>일</span>
                          </div>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input type="text" className="form-control" placeholder="충전 금액" inputMode="numeric"
                              value={editPointResetAmount} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setEditPointResetAmount(v) }}
                              style={{ borderRadius: 10, paddingRight: 28 }} />
                            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                          </div>
                        </div>
                        <div className="mb-2" style={{ position: 'relative' }}>
                          <label className="text-muted mb-1" style={{ fontSize: '0.76rem' }}>전환 포인트 (선택, 포인트 카드 탭해서도 수정 가능)</label>
                          <input type="text" className="form-control" inputMode="numeric" style={{ borderRadius: 10, paddingRight: 36 }}
                            value={editPointCarryover} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); const v = raw ? parseInt(raw).toLocaleString('ko-KR') : ''; restoreCaretAfterFormat(e.target, v); setEditPointCarryover(v) }} />
                          <span style={{ position: 'absolute', right: 12, top: 34, color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>원</span>
                        </div>
                        <p className="text-muted mt-1 mb-0" style={{ fontSize: '0.72rem' }}>
                          매월 지정한 날짜에 이전 잔액과 상관없이 충전 금액으로 초기화됩니다.
                          <br />
                          (그 날짜가 주말이면 그 전 영업일에 초기화)
                          <br />
                          남은 포인트는 이월되지 않고 사라지지만, 초기화 전 "전환하기"로 미리 저장해둔 포인트는 초기화돼도 사라지지 않고 "전환" 포인트로 따로 남아서, 지출 등록 시 "전환된 포인트에서 차감"을 켜면 계속 쓸 수 있어요.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {editCard?.is_loan && (
                  <div className="mb-2">
                    <label className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>연 이자율 (선택)</label>
                    <div style={{ position: 'relative' }}>
                      <input type="number" className="form-control" style={{ borderRadius: 10, fontSize: '1rem', paddingRight: 36 }} placeholder="예: 3.5"
                        value={editInterestRate} onChange={e => setEditInterestRate(e.target.value)} step="0.1" min="0" max="100" inputMode="decimal" />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: '0.83rem', pointerEvents: 'none' }}>%</span>
                    </div>
                  </div>
                )}
              </form>
            </div>
            <div style={{ padding: '12px 0 calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
              <div className="d-flex gap-2">
                <button type="submit" form="edit-card-form" className="btn flex-fill" style={{ background: 'linear-gradient(135deg,#b088f9,#7baff0)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>저장</button>
                <button type="button" className="btn btn-outline-secondary flex-fill" onClick={closeEdit} style={{ borderRadius: 10, padding: '12px 0', fontWeight: 600 }}>취소</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
