'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useFinanceHomepage, releasePayment } from '@/hooks/useFinanceHomepage'
import { colors } from '@/lib/brand'
import { formatMoney } from '@/lib/format'
import type { SparkPoint, PeriodStat, TopDebtor, PayablesInvoiceRow, GrossMarginStat } from '@/types/finance'

// ── Design tokens (shared visual language with other homepages) ─────────────
const NAVY      = colors.navy
const NAVY_TINT = colors.navyTint
const ORANGE    = colors.orange
const BG        = colors.navySoft
const BORDER    = colors.border
const INK       = colors.textPrimary
const INK2      = colors.textSecondary
const INK3      = colors.textDisabled
const GREEN     = colors.success
const AMBER     = colors.warning
const RED       = colors.error
const RED_BG    = colors.errorBg
const AMBER_BG  = colors.warningBg

const fmtMoney = formatMoney

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const BUCKET_COLOR: Record<string, string> = {
  '0-30': GREEN, '31-60': AMBER, '61-90': ORANGE, '90+': RED, 'Advance / credit': INK2,
}

// Known 5 entities (per the design template). Only entries with a `match` are
// backed by real, reachable DB data today — the rest render an explicit
// "no data yet" state rather than a fake filtered result.
const ENTITY_LABELS = ['PISPL', 'ACE', 'PROMAX', 'QMS Pro', 'Dynatek'] as const
const ENTITY_MATCH: Record<string, string | undefined> = {
  PISPL: 'Proman Infrastructure Services Private Limited',
}

function filterByLabel<T extends { entity: string }>(items: T[], label: string | null): { rows: T[]; unavailable: boolean } {
  if (!label) return { rows: items, unavailable: false }
  const match = ENTITY_MATCH[label]
  if (!match) return { rows: [], unavailable: true }
  return { rows: items.filter(i => i.entity === match), unavailable: false }
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Card({ title, icon, right, children }: { title: React.ReactNode; icon: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '15px 16px', boxShadow: '0 1px 2px rgba(42,47,105,.05), 0 4px 12px rgba(42,47,105,.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 12.5, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <i className={`ti ${icon}`} style={{ color: ORANGE, fontSize: 15 }} />{title}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function EntityFilterBar({ active, onSelect }: { active: string | null; onSelect: (label: string | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 10, marginTop: 2, borderTop: `1px solid ${BORDER}` }}>
      <button onClick={() => onSelect(null)} style={pillStyle(active === null)}>All entities</button>
      {ENTITY_LABELS.map(label => (
        <button key={label} onClick={() => onSelect(label)} style={pillStyle(active === label)}>{label}</button>
      ))}
    </div>
  )
}

function pillStyle(on: boolean): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, padding: '5px 11px', borderRadius: 99,
    border: `1px solid ${on ? NAVY : BORDER}`, background: on ? NAVY : '#fff',
    color: on ? '#fff' : NAVY, cursor: 'pointer',
  }
}

function BlockedState({ reason }: { reason: string }) {
  return (
    <div style={{ fontSize: 11, color: INK2, background: BG, borderRadius: 10, padding: '16px 14px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <i className="ti ti-tool" style={{ color: AMBER, fontSize: 16, flexShrink: 0, marginTop: 1 }} />
      <div><strong style={{ color: INK }}>Awaiting ERP setup.</strong> {reason}</div>
    </div>
  )
}

function NoDataForEntity({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10.5, color: INK3, textAlign: 'center', padding: '14px 4px', fontStyle: 'italic' }}>
      No data yet for {label} — DB access for this site hasn&apos;t been set up.
    </div>
  )
}

function Sparkline({ points }: { points: SparkPoint[] }) {
  if (!points.length) return <div style={{ fontSize: 8.5, color: '#7E84B8', marginTop: 6 }}>No trend history yet</div>
  const max = Math.max(...points.map(p => Math.abs(p.value)), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28, marginTop: 10 }}>
        {points.map((p, i) => (
          <div key={p.label + i} title={`${p.label}: ${fmtMoney(p.value)}`} style={{
            flex: 1, minHeight: 3, height: `${Math.max(8, Math.round(100 * Math.abs(p.value) / max))}%`,
            background: i === points.length - 1 ? ORANGE : 'rgba(255,255,255,.22)', borderRadius: '2px 2px 0 0',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {points.map((p, i) => (
          <span key={p.label + i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#7E84B8', fontFamily: 'monospace' }}>{p.label}</span>
        ))}
      </div>
    </div>
  )
}

function DebtorBar({ debtor }: { debtor: TopDebtor }) {
  const max = Math.max(debtor.buckets.reduce((s, b) => s + b.amount, 0), 1)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: INK }}>{debtor.customer}</span>
        <span style={{ fontFamily: 'monospace', color: INK2 }}>{fmtMoney(debtor.netReceivable)}</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: BG }}>
        {debtor.buckets.map(b => (
          <div key={b.bucket} title={`${b.bucket}: ${fmtMoney(b.amount)}`} style={{ width: `${100 * b.amount / max}%`, background: BUCKET_COLOR[b.bucket] }} />
        ))}
      </div>
    </div>
  )
}

const URGENCY_COLOR = (daysAway: number) => daysAway <= 1 ? { bg: RED_BG, fg: RED } : daysAway <= 5 ? { bg: AMBER_BG, fg: AMBER } : { bg: BG, fg: NAVY }

function groupInvoicesByDate(rows: PayablesInvoiceRow[]) {
  const byDate = new Map<string, PayablesInvoiceRow[]>()
  for (const r of rows) {
    if (!byDate.has(r.dueDate)) byDate.set(r.dueDate, [])
    byDate.get(r.dueDate)!.push(r)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function PeriodTabs({ period, onChange }: { period: 'M' | 'Q' | 'Y'; onChange: (p: 'M' | 'Q' | 'Y') => void }) {
  return (
    <span style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {(['M', 'Q', 'Y'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none',
          background: period === p ? ORANGE : 'transparent', color: period === p ? '#fff' : '#A9C2DC', cursor: 'pointer',
        }}>{p}</button>
      ))}
    </span>
  )
}

function PeriodTabsLight({ period, onChange }: { period: 'M' | 'Q' | 'Y'; onChange: (p: 'M' | 'Q' | 'Y') => void }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {(['M', 'Q', 'Y'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none',
          background: period === p ? NAVY : '#fff', color: period === p ? '#fff' : INK2, cursor: 'pointer',
        }}>{p}</button>
      ))}
    </span>
  )
}

function GaugeRing({ pct, target, subLabel }: { pct: number | null; target: number; subLabel: string }) {
  const r = 42, c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const color = pct === null ? INK3 : pct >= target ? GREEN : pct >= target - 5 ? AMBER : RED
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <div style={{ position: 'relative', width: 104, height: 104 }}>
        <svg viewBox="0 0 104 104" width="104" height="104" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="52" cy="52" r={r} fill="none" stroke={BG} strokeWidth="10" />
          <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - clamped / 100)} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 21, color: INK }}>{pct === null ? '—' : `${pct}%`}</div>
          <div style={{ fontSize: 8.5, color: INK2, fontFamily: 'monospace', marginTop: 2 }}>{subLabel}</div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: INK2 }}>vs {target}% target</div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceHeadPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const { data, isLoading, isError, refresh } = useFinanceHomepage()

  const [rcvEntity, setRcvEntity] = useState<string | null>(null)
  const [payEntity, setPayEntity] = useState<string | null>(null)
  const [poEntity, setPoEntity]   = useState<string | null>(null)
  const [aqEntity, setAqEntity]   = useState<string | null>(null)
  const [aqTab, setAqTab]         = useState<0 | 1 | 2>(0)
  const [revPeriod, setRevPeriod] = useState<'M' | 'Q' | 'Y'>('M')
  const [gstPeriod, setGstPeriod] = useState<'M' | 'Q' | 'Y'>('M')
  const [gmPeriod, setGmPeriod]   = useState<'M' | 'Q' | 'Y'>('M')
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [releasingInvoice, setReleasingInvoice] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showNotif, setShowNotif]       = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)

  const switcherOptions = [
    { label: 'Sales Head',         slug: 'sales-head'         },
    { label: 'Manufacturing Head', slug: 'manufacturing-head' },
    { label: 'Procurement Head',   slug: 'procurement-head'   },
    { label: 'Stores Head',        slug: 'stores-head'        },
  ]

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    setShowNotif(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const syncTime = data ? new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

  async function handleRelease(invoiceNo: string) {
    setReleasingInvoice(invoiceNo)
    try {
      const result = await releasePayment(invoiceNo)
      if (result.ok) {
        setToastMsg(`Draft Payment Entry created for ${invoiceNo}`)
        refresh()
      } else {
        setToastMsg(`⚠ ${result.error?.message ?? 'Release failed'}`)
      }
    } catch (err) {
      setToastMsg(`⚠ ${err instanceof Error ? err.message : 'Release failed'}`)
    } finally {
      setReleasingInvoice(null)
      setTimeout(() => setToastMsg(''), 4000)
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 14 }}>
        Loading finance dashboard…
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED, fontSize: 14 }}>
        Failed to load dashboard. <button onClick={() => refresh()} style={{ marginLeft: 8, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
      </div>
    )
  }

  const revStat: PeriodStat = data.revenue[revPeriod]
  const gstStat: PeriodStat = data.gstLiability[gstPeriod]
  const gmStat: GrossMarginStat = data.grossMargin[gmPeriod]

  const bucketsFor = (label: string | null) => {
    if (!label) return { buckets: data.receivablesAgeing.buckets, unavailable: false }
    const match = ENTITY_MATCH[label]
    if (!match) return { buckets: [], unavailable: true }
    return { buckets: data.receivablesAgeing.byEntity[match] ?? [], unavailable: false }
  }
  const debtorsResult = filterByLabel(data.receivablesAgeing.topDebtors, rcvEntity)
  const payInvoicesResult = filterByLabel(data.payablesInvoices14d, payEntity)
  const poApprovalResult = filterByLabel(data.poApprovalQueue, poEntity)
  const paymentsResult = filterByLabel(data.actionQueue.paymentsToRelease, aqEntity)
  const journalsResult = filterByLabel(data.actionQueue.journalEntriesPending, aqEntity)
  const apReconResult  = filterByLabel(data.actionQueue.apReconciliation, aqEntity)
  const aqResult = aqTab === 0 ? paymentsResult : aqTab === 1 ? journalsResult : apReconResult

  const bucketData = bucketsFor(rcvEntity)
  const payGrouped = groupInvoicesByDate(payInvoicesResult.rows)

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "Arial,'Arial Narrow',Helvetica,sans-serif", padding: 12 }}>
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: NAVY, color: '#fff', fontSize: 12, padding: '10px 18px', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        }}>{toastMsg}</div>
      )}
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* Top bar */}
        <div style={{
          background: NAVY, borderBottom: `2px solid ${ORANGE}`, borderRadius: 12,
          padding: '13px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 6px 20px rgba(27,31,71,.22)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 19, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-report-money" style={{ color: '#9AA0D8' }} />
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 13, color: '#B9BEE0' }}>
              Finance Head (CFO)&nbsp;|&nbsp;{today}&nbsp;|&nbsp;Synced {syncTime}&nbsp;|&nbsp;{data.entities.length} of {ENTITY_LABELS.length} entities reachable
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Dashboard switcher */}
            <div style={{ position: 'relative' }} ref={switcherRef}>
              <button onClick={() => setShowSwitcher(v => !v)} style={{
                fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
                padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <i className="ti ti-layout-grid" style={{ fontSize: 13 }} /> Switch dashboard
              </button>
              {showSwitcher && (
                <div style={{
                  position: 'absolute', top: 34, right: 0, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(42,47,105,.15)', zIndex: 50, minWidth: 190, padding: 6,
                }}>
                  {switcherOptions.map(o => (
                    <button key={o.slug} onClick={() => router.push(`/home/${o.slug}`)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      fontSize: 11.5, padding: '8px 11px', borderRadius: 7,
                      border: 'none', background: 'none', color: INK, cursor: 'pointer',
                    }}
                      onMouseOver={e => (e.currentTarget.style.background = NAVY_TINT)}
                      onMouseOut={e  => (e.currentTarget.style.background = 'none')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Logout */}
            <button onClick={() => {
              localStorage.removeItem('proman_token')
              localStorage.removeItem('proman_user')
              document.cookie = 'proman_role=; path=/; max-age=0'
              router.push('/')
            }} title="Logout" style={{
              fontSize: 11, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
              padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,80,80,.25)')}
              onMouseOut={e  => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
              <i className="ti ti-logout" style={{ fontSize: 14 }} /> <span>Logout</span>
            </button>

            {/* Bell / alerts */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button onClick={() => setShowNotif(v => !v)} style={{
                position: 'relative', fontSize: 11, color: '#fff',
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 8, padding: '5px 9px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>
                </svg>
                {data.alerts.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff',
                    fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{data.alerts.length}</span>
                )}
              </button>
              {showNotif && (
                <div style={{
                  position: 'absolute', right: 0, top: 34, width: 320, background: '#fff',
                  border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 50,
                }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: INK3, padding: '4px 6px 6px', margin: 0 }}>Needs attention</h4>
                  {data.alerts.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11, color: INK3 }}>No active alerts</div>
                    : data.alerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: INK }}>
                        <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 15, color: a.level === 'red' ? RED : AMBER, flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <div style={{ lineHeight: 1.4 }}>{a.message}</div>
                          {a.reason && <div style={{ fontSize: 9.5, color: INK3, marginTop: 2, fontStyle: 'italic' }}>{a.reason}</div>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert banner */}
        {data.alerts.map((a, i) => (
          <div key={i} style={{
            background: a.level === 'red' ? RED_BG : AMBER_BG,
            border: `1px solid ${a.level === 'red' ? '#E4B4B4' : '#F2DCAE'}`,
            borderRadius: 10, padding: '9px 14px', display: 'flex', flexDirection: 'column', gap: 2,
            fontSize: 12, color: a.level === 'red' ? RED : AMBER,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <i className={`ti ${a.level === 'red' ? 'ti-alert-octagon' : 'ti-alert-triangle'}`} style={{ fontSize: 17, flexShrink: 0 }} />
              <span>{a.message}</span>
            </div>
            {a.reason && <div style={{ fontSize: 10.5, marginLeft: 26, opacity: .85 }}><strong>Why:</strong> {a.reason}</div>}
          </div>
        ))}

        {/* KPI band */}
        <div style={{ background: '#1E2352', borderRadius: 14, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A9C2DC', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-report-money" style={{ color: ORANGE, fontSize: 15 }} />Group financial summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
            <KpiTile label="Cash & Bank (Group)" value={fmtMoney(data.cashBank.total)} sub={`${data.cashBank.changeVs7d >= 0 ? '+' : ''}${fmtMoney(data.cashBank.changeVs7d)} vs last week`} accent={data.cashBank.changeVs7d >= 0 ? GREEN : AMBER} spark={data.cashBank.spark} />
            <KpiTile label="Overdue Receivables" value={fmtMoney(data.overdueReceivables.total)} sub={`${fmtMoney(data.overdueReceivables.over90)} > 90 days (${data.overdueReceivables.over90Count})`} accent={RED} negative spark={data.overdueReceivables.spark} />
            <KpiTile label="Payables Due This Week" value={fmtMoney(data.payablesDue7d.total)} sub={`${data.payablesDue7d.vendors} vendor${data.payablesDue7d.vendors === 1 ? '' : 's'}${data.payablesDue7d.lastDueDate ? ` — due by ${fmtDate(data.payablesDue7d.lastDueDate)}` : ''}`} accent={AMBER} spark={data.payablesDue7d.spark} />
            <KpiTile
              label={<>Revenue <span style={{ fontWeight: 400 }}>{revStat.periodLabel}</span></>}
              value={fmtMoney(revStat.total)} sub="vs target — awaiting ERP setup" accent={AMBER} spark={data.revenue.spark}
              toggle={<PeriodTabs period={revPeriod} onChange={setRevPeriod} />}
            />
            <KpiTile
              label={<>GST Liability <span style={{ fontWeight: 400 }}>{gstStat.periodLabel}</span></>}
              value={fmtMoney(gstStat.total)} sub="Output tax" accent={RED} negative spark={data.gstLiability.spark}
              toggle={<PeriodTabs period={gstPeriod} onChange={setGstPeriod} />}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Cash & Bank Position" icon="ti-building-bank">
              <div style={{ background: NAVY, borderRadius: 10, padding: '11px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#B9BEE0' }}>Group total</div>
                  <div style={{ fontSize: 9, color: '#9DA0C4', marginTop: 3 }}>Confirmed as of {syncTime} today</div>
                </div>
                <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 22, color: '#fff' }}>{fmtMoney(data.cashBank.total)}</div>
              </div>
              {data.cashBank.byEntity.map(e => {
                const expanded = expandedEntity === e.entity
                const accounts = data.cashBank.accountsByEntity[e.entity] ?? []
                return (
                  <div key={e.entity} style={{ borderRadius: 9, background: BG, overflow: 'hidden' }}>
                    <div onClick={() => setExpandedEntity(expanded ? null : e.entity)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', cursor: 'pointer' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className={`ti ti-chevron-${expanded ? 'down' : 'right'}`} style={{ fontSize: 12 }} />{e.entity}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: e.changeVs7d >= 0 ? GREEN : RED }}>
                          {e.changeVs7d >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(e.changeVs7d))}
                        </span>
                        <span style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 13, color: INK }}>{fmtMoney(e.value)}</span>
                      </span>
                    </div>
                    {expanded && (
                      <div style={{ padding: '0 11px 10px 26px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {accounts.map(a => (
                          <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                            <span style={{ color: INK2 }}>{a.account}</span>
                            <span style={{ fontFamily: 'monospace', color: a.balance < 0 ? RED : INK }}>{fmtMoney(a.balance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>

            <Card title={<>Gross Margin — by Entity <span style={{ fontWeight: 400 }}>{gmStat.periodLabel}</span></>} icon="ti-chart-bar" right={<PeriodTabsLight period={gmPeriod} onChange={setGmPeriod} />}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 14, marginBottom: 4, borderBottom: `1px solid ${BORDER}` }}>
                <GaugeRing pct={gmStat.gmPct} target={gmStat.targetPct} subLabel="Blended GM" />
                {gmStat.gmPct === null && <div style={{ fontSize: 9.5, color: INK3, fontStyle: 'italic' }}>No income posted in this period</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: INK2, marginBottom: 10 }}>
                <span>Direct Income: <strong style={{ color: INK }}>{fmtMoney(gmStat.income)}</strong></span>
                <span>Direct Expense: <strong style={{ color: INK }}>{fmtMoney(gmStat.expense)}</strong></span>
              </div>
              {gmStat.byEntity.map(e => {
                const color = e.gmPct === null ? INK3 : e.gmPct >= gmStat.targetPct ? GREEN : e.gmPct >= gmStat.targetPct - 5 ? AMBER : RED
                const barWidth = e.gmPct === null ? 0 : Math.min(100, e.gmPct * 2.5)
                return (
                  <div key={e.entity} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: INK, width: 96, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.entity}</span>
                    <div style={{ flex: 1, height: 12, background: BG, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: 12, borderRadius: 99, background: color }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace', color }}>{e.gmPct === null ? '—' : `${e.gmPct}%`}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: 9, color: INK3, fontStyle: 'italic', marginTop: 4 }}>Only entities with a reachable database are shown — currently {data.entities.length} of {ENTITY_LABELS.length}.</div>
            </Card>
          </div>

          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Receivables Ageing" icon="ti-clock">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9.5, color: INK2 }}>
                {(['0-30', '31-60', '61-90', '90+'] as const).map(b => (
                  <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i style={{ width: 9, height: 9, borderRadius: 2, background: BUCKET_COLOR[b], display: 'inline-block' }} />{b} days
                  </span>
                ))}
              </div>
              {bucketData.unavailable
                ? <NoDataForEntity label={rcvEntity!} />
                : <>
                    {bucketData.buckets.filter(b => b.bucket !== 'TOTAL').map(b => (
                      <div key={b.bucket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                        <span style={{ color: BUCKET_COLOR[b.bucket] ?? INK2, fontWeight: 700 }}>{b.bucket}</span>
                        <span style={{ fontFamily: 'monospace' }}>{fmtMoney(b.amount)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
                      <span>Net total</span>
                      <span>{fmtMoney(bucketData.buckets.find(b => b.bucket === 'TOTAL')?.amount ?? 0)}</span>
                    </div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: INK2, marginTop: 4 }}>Top debtors</div>
                    {debtorsResult.rows.slice(0, 8).map(d => <DebtorBar key={d.customer + d.entity} debtor={d} />)}
                  </>
              }
              <EntityFilterBar active={rcvEntity} onSelect={setRcvEntity} />
            </Card>
          </div>

          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="Approval Queue — Purchase Orders" icon="ti-checklist" right={
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: RED_BG, color: RED }}>
                {poApprovalResult.rows.length} pending
              </span>
            }>
              {poApprovalResult.unavailable
                ? <NoDataForEntity label={poEntity!} />
                : poApprovalResult.rows.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No POs pending approval.</div>
                  : poApprovalResult.rows.slice(0, 10).map(p => (
                    <div key={p.poNo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY }}>{p.poNo} <span style={{ fontWeight: 400, color: INK2 }}>· {p.vendor}</span></div>
                        <div style={{ fontSize: 9, color: INK3 }}>{p.approvalStage}</div>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: INK, flexShrink: 0 }}>{fmtMoney(p.value)}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: AMBER_BG, color: AMBER, flexShrink: 0, whiteSpace: 'nowrap' }}>{p.daysPending}d</span>
                    </div>
                  ))
              }
              <EntityFilterBar active={poEntity} onSelect={setPoEntity} />
            </Card>

            <Card title="Revenue vs Budget" icon="ti-target">
              <BlockedState reason={data.revenueVsTarget.reason} />
            </Card>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px' }}>
            <Card title="Payables Due — Next 14 Days" icon="ti-calendar">
              {payInvoicesResult.unavailable
                ? <NoDataForEntity label={payEntity!} />
                : payGrouped.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No payables due in the next 14 days.</div>
                  : payGrouped.map(([dueDate, rows]) => {
                      const daysAway = Math.round((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
                      const { bg, fg } = URGENCY_COLOR(daysAway)
                      const total = rows.reduce((s, r) => s + r.amount, 0)
                      return (
                        <div key={dueDate} style={{ padding: '8px 10px', borderRadius: 9, background: bg }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 700, width: 90, flexShrink: 0, color: fg }}>{fmtDate(dueDate)}</span>
                            <span style={{ flex: 1, fontSize: 10.5, color: INK }}>{rows.map(r => r.supplier).join(', ')}</span>
                            <span style={{ fontWeight: 700, fontSize: 11, color: fg, fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
                          </div>
                        </div>
                      )
                    })
              }
              <EntityFilterBar active={payEntity} onSelect={setPayEntity} />
            </Card>
          </div>

          <div style={{ flex: '1 1 420px' }}>
            <Card title="Action Queue" icon="ti-clock" right={
              <div style={{ display: 'flex', gap: 2 }}>
                {(['Payments to Release', 'Journal Entries', 'AP Reconciliation'] as const).map((label, i) => {
                  const count = i === 0 ? data.actionQueue.paymentsToRelease.length : i === 1 ? data.actionQueue.journalEntriesPending.length : data.actionQueue.apReconciliation.length
                  return (
                    <button key={label} onClick={() => setAqTab(i as 0 | 1 | 2)} style={{
                      fontSize: 10, fontWeight: 700, padding: '5px 9px', border: 'none', background: 'none',
                      color: aqTab === i ? NAVY : INK2, borderBottom: `2px solid ${aqTab === i ? ORANGE : 'transparent'}`, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {label}
                      <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: count > 0 ? RED_BG : BG, color: count > 0 ? RED : INK3 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
            }>
              {aqResult.unavailable
                ? <NoDataForEntity label={aqEntity!} />
                : aqResult.rows.length === 0
                  ? <div style={{ fontSize: 10.5, color: INK2, textAlign: 'center', padding: '14px 4px' }}>No items in this view.</div>
                  : <>
                      {aqTab === 0 && paymentsResult.rows.map(r => (
                        <div key={r.invoiceNo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                          <span style={{ color: NAVY, fontWeight: 700, flexShrink: 0 }}>{r.invoiceNo}</span>
                          <span style={{ color: INK, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.vendor}</span>
                          <span style={{ fontSize: 9.5, color: INK2, flexShrink: 0 }}>{fmtDate(r.dueDate)}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: RED_BG, color: RED, flexShrink: 0 }}>{r.daysOverdue}d overdue</span>
                          <span style={{ fontFamily: 'monospace', flexShrink: 0 }}>{fmtMoney(r.amount)}</span>
                          <button
                            disabled={releasingInvoice === r.invoiceNo}
                            onClick={() => handleRelease(r.invoiceNo)}
                            style={{
                              fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                              border: `1px solid ${GREEN}`, color: GREEN, background: 'none', cursor: 'pointer', flexShrink: 0,
                              opacity: releasingInvoice === r.invoiceNo ? 0.5 : 1,
                            }}>
                            {releasingInvoice === r.invoiceNo ? '...' : 'Release'}
                          </button>
                        </div>
                      ))}
                      {aqTab === 1 && journalsResult.rows.map(r => (
                        <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                          <span style={{ color: NAVY, fontWeight: 700 }}>{r.name}</span>
                          <span style={{ color: INK }}>{r.daysPending}d pending</span>
                          <span style={{ fontFamily: 'monospace' }}>{fmtMoney(r.totalDebit)}</span>
                        </div>
                      ))}
                      {aqTab === 2 && apReconResult.rows.slice(0, 30).map((r, i) => (
                        <div key={r.item + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                          <span style={{ color: INK }}>{r.party}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: RED_BG, color: RED }}>{r.status}</span>
                          <span style={{ fontFamily: 'monospace' }}>{fmtMoney(r.amount)}</span>
                        </div>
                      ))}
                    </>
              }
              <EntityFilterBar active={aqEntity} onSelect={setAqEntity} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, accent, negative, spark, toggle }: {
  label: React.ReactNode; value: string; sub: string; accent: string; negative?: boolean; spark: SparkPoint[]; toggle?: React.ReactNode
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderTop: `3px solid ${accent}`, borderRadius: 10, padding: '12px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: '#A9C2DC', marginBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span>{label}</span>{toggle}
      </div>
      <div style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontSize: 23, color: negative ? '#FFB4B4' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#A9C2DC', marginTop: 8 }}>{sub}</div>
      <Sparkline points={spark} />
    </div>
  )
}
