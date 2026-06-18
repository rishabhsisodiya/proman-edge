'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSalesHomepage } from '@/hooks/useSalesHomepage'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useQuotationDetail, extendQuotation, convertToSalesOrder } from '@/hooks/useQuotationDetail'
import type { FunnelStage, FollowUpItem } from '@/types/sales'

// Roles that can switch to other dashboards
const SWITCHER_OPTIONS: Record<string, { label: string; slug: string }[]> = {
  'sales-head': [{ label: 'Manufacturing Head', slug: 'manufacturing-head' }],
  'md': [
    { label: 'Sales Head',         slug: 'sales-head'         },
    { label: 'Manufacturing Head', slug: 'manufacturing-head' },
  ],
}

// ── brand tokens ───────────────────────────────────────────────────────────
// Official Proman brand: Navy #2A2F69 | Orange #FF7604 | Arial font
const NAVY    = '#2A2F69'
const ORANGE  = '#FF7604'
const BORDER  = '#DDDDE8'
const BG      = '#F7F7F9'
const TEXT    = '#2A2F69'
const TEXT2   = '#5F638F'
const TEXT3   = '#8F92B5'
const HOVER   = '#EAEAF0'
const SUCCESS = '#1A6B3A'
const WARNING = '#B45309'
const ERROR   = '#A32D2D'

// ── constants ──────────────────────────────────────────────────────────────
// Funnel: Navy shades (darkest → lighter shades → success green for Won)
const FCOL   = ['#2A2F69', '#3D4490', '#5259A8', '#6B73B8', '#1A6B3A']
// KPI card top-border accent per card index (0=Enquiries,1=Quot,2=Orders,3=Conv,4=Revenue)
const ACCENT = [NAVY, WARNING, SUCCESS, WARNING, ORANGE]
const CARD_ORDER = [1, 3, 0, 2, 4]
const CARDS = [
  { base: 'Enquiries',        toggle: true  },
  { base: 'Quotations Open',  toggle: false },
  { base: 'Orders Confirmed', toggle: true  },
  { base: 'Conversion Rate',  toggle: false },
  { base: 'Revenue',          toggle: true  },
]
const SUFFIX: Record<string, string> = { month: 'MTD', q: 'QTD', ytd: 'YTD' }
const MLAB = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const QLAB = ["Sep'25", "Dec'25", "Mar'26", "Jun'26"]
const YLAB = ['2024', '2025', '2026']
// Spark value formatter per card index
function fmtRupee(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${Math.round(v / 100_000)}L`
  if (v >= 1_000)      return `₹${Math.round(v / 1_000)}K`
  return `₹${Math.round(v)}`
}
const SFMT: ((v: number) => string)[] = [
  v => String(v),
  v => String(v),
  v => fmtRupee(v),
  v => `${v}%`,
  v => fmtRupee(v),
]
const QUICK_ACTIONS: { icon: string; label: string; path: string }[] = [
  { icon: 'ti-file-dollar',  label: 'Create quotation',      path: 'quotation/new-quotation-1'                      },
  { icon: 'ti-pencil-plus',  label: 'Log enquiry',           path: 'lead/new-lead-1'                                },
  { icon: 'ti-phone',        label: 'Record follow-up',      path: 'crm-call-log/new-crm-call-log-1'                },
  { icon: 'ti-funnel',       label: 'View CRM pipeline',     path: 'crm-pipeline'                                   },
  { icon: 'ti-circle-x',    label: 'Lost order analysis',   path: 'quotation?docstatus=1&status=Lost'              },
  { icon: 'ti-report',       label: 'Customer visit report', path: 'customer-visit/new-customer-visit-1'            },
  { icon: 'ti-checkup-list', label: 'Approval status',       path: 'workflow-action'                                },
  { icon: 'ti-chart-bar',    label: 'Target vs actuals',     path: 'sales-person'                                   },
]

type Period = 'month' | 'q' | 'ytd'

// ── helpers ────────────────────────────────────────────────────────────────
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) + amt
  const g = ((n >>  8) & 255) + amt
  const b = ( n        & 255) + amt
  const c = (x: number) => Math.max(0, Math.min(255, x))
  return '#' + (0x1000000 + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1)
}

function labelsFor(spark: number[]): string[] {
  if (spark.length <= 3) return YLAB.slice(0, spark.length)
  if (spark.length <= 4) return QLAB.slice(0, spark.length)
  return MLAB.slice(0, spark.length)
}

// ── SVG 3D funnel ──────────────────────────────────────────────────────────
function SvgFunnel({ funnel, onStage }: { funnel: FunnelStage[]; onStage: (s: string) => void }) {
  const CX = 200, H = 54, Y0 = 36, MAXW = 340, MINW = 96
  const maxN = Math.max(...funnel.map(s => s.count))
  const W: number[] = []
  funnel.forEach((s, i) => {
    const natural = Math.max(MINW, Math.round(MAXW * s.count / maxN))
    W.push(i === 0 ? natural : Math.min(W[i - 1], natural))
  })
  W.push(Math.round(W[W.length - 1] * 0.5))
  const bow = W.map(w => w * 0.08)
  const svgH = Y0 + funnel.length * H + Math.round(bow[W.length - 1] * 2) + 10

  return (
    <svg viewBox={`0 0 580 ${svgH}`} style={{ width: '100%', height: 'auto', maxWidth: 640, display: 'block' }}>
      <defs>
        {funnel.map((_, i) => (
          <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0"   stopColor={shade(FCOL[i], -26)} />
            <stop offset=".5"  stopColor={shade(FCOL[i],  46)} />
            <stop offset="1"   stopColor={shade(FCOL[i], -26)} />
          </linearGradient>
        ))}
      </defs>
      {/* open mouth */}
      <ellipse cx={CX} cy={Y0 + bow[0]}     rx={W[0] / 2}       ry={bow[0]}       fill="#E8EBF0" />
      <ellipse cx={CX} cy={Y0 + bow[0]}     rx={W[0] / 2 * 0.9} ry={bow[0] * 0.82} fill="#D7DCE4" />
      {funnel.map((r, i) => {
        const hT = W[i] / 2, hB = W[i + 1] / 2
        const yT = Y0 + i * H, yB = yT + H
        const drop = i > 0 ? Math.round(100 - (r.count / funnel[i - 1].count * 100)) : null
        const path = `M${CX - hT},${yT} Q${CX},${yT + 2 * bow[i]} ${CX + hT},${yT} L${CX + hB},${yB} Q${CX},${yB + 2 * bow[i + 1]} ${CX - hB},${yB} Z`
        return (
          <g key={i} onClick={() => onStage(r.stage)} style={{ cursor: 'pointer' }}>
            <path d={path} fill={`url(#fg${i})`} />
            <text x={CX} y={yT + H / 2 + bow[i] * 0.7 + 5} textAnchor="middle"
              fill="#fff" fontSize="13.5" fontWeight="700"
              style={{ pointerEvents: 'none', letterSpacing: '.3px' }}>
              {r.stage} {r.count}
            </text>
            <text x={CX + Math.max(hT, 120) + 26} y={yT + H / 2 + 10}
              fontSize="14.5" fontWeight="700" fill="#1A2433">
              {r.value != null ? `₹${r.value}Cr` : '—'}
              {drop !== null && <tspan dx="9" fontSize="11.5" fill="#C0392B">{drop}% drop</tspan>}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── page ──────────────────────────────────────────────────────────────────
export default function SalesHeadHomepage() {
  const router  = useRouter()
  const { user, isLoading: userLoading } = useCurrentUser()
  const companies = user?.companies ?? ['PISPL']

  const { data, isLoading, isError, refresh } = useSalesHomepage(companies)

  const [cardPeriods, setCardPeriods] = useState<Period[]>(['month', 'month', 'month', 'month', 'month'])
  const [funnelPeriod, setFunnelPeriod] = useState<Period>('month')
  const [activeTab, setActiveTab]       = useState(0)
  const [showBell, setShowBell]         = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [drawerDeal, setDrawerDeal]     = useState<FollowUpItem | null>(null)
  const [actionMsg, setActionMsg]       = useState('')
  const bellRef     = useRef<HTMLDivElement>(null)
  const actionQRef  = useRef<HTMLDivElement>(null)
  const switcherRef = useRef<HTMLDivElement>(null)

  const switcherOptions = SWITCHER_OPTIONS[user?.roleSlug ?? ''] ?? []

  function erpUrl(path: string) {
    const base = (data?.erpBaseUrl ?? 'http://proman.localhost:8000').replace(/\/$/, '')
    return `${base}/app/${path}`
  }

  function goActionTab(tab: number) {
    setActiveTab(tab)
    actionQRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Load real quotation detail when drawer opens
  const { detail, isLoading: detailLoading } = useQuotationDetail(drawerDeal?.quotation ?? null)

  function toast(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3000)
  }

  async function handleExtend(quotation: string) {
    try {
      const result = await extendQuotation(quotation, { days: 14 })
      toast(result.validTill ? `Validity extended to ${result.validTill}` : 'Validity extended by 14 days')
    } catch {
      toast('Extend failed — check ERPNext connection')
    }
  }

  async function handleConvert(quotation: string) {
    try {
      const res = await convertToSalesOrder(quotation)
      toast(res.salesOrder ? `Sales Order ${res.salesOrder} created` : 'Conversion initiated')
      setDrawerDeal(null)
    } catch {
      toast('Convert failed — check ERPNext connection')
    }
  }

  useEffect(() => {
    function h(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowBell(false)
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (isLoading || userLoading) return <div className="p-10 text-sm text-gray-500">Loading dashboard…</div>
  if (isError || !data) return (
    <div style={{ minHeight: '100vh', background: '#F7F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "Arial,'Helvetica Neue',Helvetica,sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
        {/* Icon */}
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        {/* Heading */}
        <div style={{ fontSize: 20, fontWeight: 700, color: '#2A2F69', marginBottom: 8 }}>
          Dashboard unavailable
        </div>
        {/* Message */}
        <div style={{ fontSize: 13.5, color: '#5F638F', lineHeight: 1.6, marginBottom: 6 }}>
          Unable to reach the ERPNext server. This is usually a temporary issue with the API connection.
        </div>
        <div style={{ fontSize: 12, color: '#8F92B5', marginBottom: 28 }}>
          Error: 5xx — server did not respond
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={refresh}
            style={{ background: '#2A2F69', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
          <button onClick={() => window.location.reload()}
            style={{ background: '#fff', color: '#2A2F69', border: '1.5px solid #DDDDE8', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reload page
          </button>
        </div>
        {/* Footer note */}
        <div style={{ marginTop: 32, fontSize: 11, color: '#B0B3CC' }}>
          If this persists, check with your system administrator that the ERPNext server is running.
        </div>
      </div>
    </div>
  )

  // A5 alert triggers
  const pct      = Math.round(data.revenueTarget.pct)
  const day      = data.decisionBand.day
  const dim      = data.decisionBand.daysInMonth
  const expToday = data.expiringQuotations.filter(q => q.validTill === 'Today').length
  const overdue7 = data.followUps.filter(f => f.daysOverdue > 7).length

  const alerts: { sev: 'red' | 'amber'; icon: string; text: string; action: string; tab: number }[] = []
  if (pct < 60 && day > 20)
    alerts.push({ sev: 'red', icon: 'ti-alert-octagon', text: `Revenue critically below target — ${pct}% achieved with ${dim - day} days remaining`, action: '', tab: -1 })
  if (expToday > 0)
    alerts.push({ sev: 'red', icon: 'ti-alert-triangle', text: `${expToday} quotations expire today. Extend or convert before end of day.`, action: 'Review', tab: 1 })
  if (overdue7 > 0)
    alerts.push({ sev: 'amber', icon: 'ti-bell-ringing', text: `${overdue7} quotations with no follow-up for over 7 days.`, action: 'Open queue', tab: 0 })

  // Bell notifications (A5 + conversion)
  const convMtd = parseFloat((data.kpis[3]?.value ?? '0').replace('%', ''))
  const bellItems: { color: string; title: string; sub: string }[] = [
    ...alerts.map(a => ({
      color: a.sev === 'red' ? '#EF4444' : '#B45309',
      title: a.text.split('.')[0],
      sub:   a.text.split('.').slice(1).join('.').trim(),
    })),
    ...(convMtd < 25 ? [{ color: '#B45309', title: 'Conversion rate below 25% this month', sub: 'Below 30-day average' }] : []),
  ]

  const monthName = new Date().toLocaleString('en', { month: 'long' })
  const syncTime  = new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const funnel  = data.funnel[funnelPeriod]
  const rMax    = Math.max(...data.regionPipeline.map(r => r.quoted + r.negotiation + r.won))
  const gaugeR  = 49, gaugeCirc = 2 * Math.PI * gaugeR
  const gaugeColor = pct >= 90 ? '#1A6B3A' : pct >= 70 ? '#FF7604' : '#B42318'
  const sparkMax   = Math.max(...data.revenueTarget.trend.map(t => t.value))

  function setCard(idx: number, p: Period, e: React.MouseEvent) {
    e.stopPropagation()
    const next = [...cardPeriods] as Period[]
    next[idx] = p
    setCardPeriods(next)
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: "Arial,'Helvetica Neue',Helvetica,sans-serif", background: BG, color: TEXT, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── TOPBAR ── */}
        <div style={{ background: 'linear-gradient(100deg,#2A2F69,#363B82)', borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-trending-up" style={{ color: 'rgba(255,255,255,.6)' }} />
              Good morning, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>
              {user?.role ?? 'Sales Head'} &nbsp;|&nbsp;
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              &nbsp;|&nbsp; Synced {syncTime}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
            {/* Target chip */}
            <span style={{ background: '#FF7604', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 13px', borderRadius: 99, whiteSpace: 'nowrap' }}>
              {monthName} target: {pct}%
            </span>
            {/* Dashboard switcher — only for strategic roles */}
            {switcherOptions.length > 0 && (
              <div style={{ position: 'relative' }} ref={switcherRef}>
                <button onClick={() => setShowSwitcher(v => !v)}
                  style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-layout-grid" style={{ fontSize: 13 }} />
                  Switch dashboard
                </button>
                {showSwitcher && (
                  <div style={{ position: 'absolute', top: 34, right: 0, background: '#fff', border: '1px solid #DDDDE8', borderRadius: 10, boxShadow: '0 8px 24px rgba(42,47,105,.15)', zIndex: 50, minWidth: 190, padding: 6 }}>
                    {switcherOptions.map(o => (
                      <button key={o.slug} onClick={() => router.push(`/home/${o.slug}`)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 11.5, padding: '8px 11px', borderRadius: 7, border: 'none', background: 'none', color: '#2A2F69', cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#EAEAF0')}
                        onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Bell */}
            <div style={{ position: 'relative' }} ref={bellRef}>
              <button onClick={() => setShowBell(v => !v)}
                style={{ position: 'relative', fontSize: 11, color: '#FFFFFF', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>
                </svg>
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {bellItems.length}
                </span>
              </button>
              {showBell && (
                <div style={{ position: 'absolute', right: 0, top: 34, width: 300, background: '#fff', border: '1px solid #DDDDE8', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,34,64,.18)', padding: 8, zIndex: 40 }}>
                  <h4 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#8F92B5', padding: '4px 6px 6px' }}>Needs attention</h4>
                  {bellItems.length === 0
                    ? <div style={{ padding: '7px 6px', fontSize: 11 }}>No active alerts</div>
                    : bellItems.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 6px', borderRadius: 7, fontSize: 11, color: '#2A2F69', cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#EAEAF0')}
                        onMouseOut={e => (e.currentTarget.style.background = '')}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0, marginTop: 4 }} />
                        <div>{it.title}<small style={{ display: 'block', color: '#5F638F', fontSize: 10 }}>{it.sub}</small></div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── A5 ALERT STACK ── */}
        {alerts.map((a, i) => (
          <div key={i} style={{
            background: a.sev === 'red' ? '#FEF2F2' : '#FEF3C7',
            border: `1px solid ${a.sev === 'red' ? '#FCA5A5' : '#F2DCAE'}`,
            borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12, color: a.sev === 'red' ? '#991B1B' : '#92600A'
          }}>
            <i className={`ti ${a.icon}`} style={{ fontSize: 17, color: a.sev === 'red' ? '#B42318' : '#B45309', flexShrink: 0 }} />
            <div dangerouslySetInnerHTML={{ __html: `<strong>${a.text.split('.')[0]}.</strong>${a.text.includes('.') ? ' ' + a.text.split('.').slice(1).join('.') : ''}` }} />
            {a.action && (
              <button onClick={() => goActionTab(a.tab)}
                style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, fontWeight: 600, border: '1px solid currentColor', background: 'none', color: 'inherit', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>
                {a.action}
              </button>
            )}
          </div>
        ))}

        {/* ── KPI BAND ── */}
        <div style={{ background: 'linear-gradient(135deg,#2A2F69,#242859)', borderRadius: 13, padding: '13px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Pipeline snapshot</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9 }}>
            {CARD_ORDER.map(idx => {
              const card = CARDS[idx]
              const per  = card.toggle ? cardPeriods[idx] : 'month'
              const kpi  = card.toggle ? data.kpisAll[per][idx] : data.kpis[idx]
              if (!kpi) return null
              const spark  = kpi.spark ?? []
              const labels = labelsFor(spark)
              const mx     = Math.max(...spark, 1)
              const fmt    = SFMT[idx]
              const label  = card.base + (card.toggle ? ' ' + SUFFIX[per] : '')
              return (
                <div key={idx}
                  style={{ background: 'rgba(255,255,255,.07)', border: `1px solid rgba(255,255,255,.13)`, borderTop: `3px solid ${ACCENT[idx]}`, borderRadius: 11, padding: '11px 13px', cursor: 'pointer', transition: 'border-color .12s' }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)')}
                  onMouseOut={e => (e.currentTarget.style.borderTopColor = ACCENT[idx])}>
                  {/* label row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'rgba(255,255,255,.6)', marginBottom: 5 }}>
                    <span>{label}</span>
                    {card.toggle && (
                      <span style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                        {(['month', 'q', 'ytd'] as Period[]).map(p => (
                          <button key={p} onClick={e => setCard(idx, p, e)}
                            style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', border: 'none', background: per === p ? '#2A2F69' : 'transparent', color: per === p ? '#fff' : 'rgba(255,255,255,.6)', cursor: 'pointer', lineHeight: 1.4 }}>
                            {p === 'month' ? 'M' : p === 'q' ? 'Q' : 'Y'}
                          </button>
                        ))}
                      </span>
                    )}
                    {!card.toggle && idx === 1 && (
                      <button style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', cursor: 'pointer', border: 'none', background: 'none', padding: 0, fontWeight: 600 }}>View all ↗</button>
                    )}
                    {!card.toggle && idx === 3 && (convMtd < 25) && (
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#92600A' }}>below 25%</span>
                    )}
                  </div>
                  {/* value */}
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: kpi.value }} />
                  {/* sub */}
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: kpi.direction === 'up' ? '#7FE0A8' : kpi.direction === 'dn' ? '#FFA8A8' : '#F2C078' }}>
                      {kpi.direction === 'up' ? '↑' : kpi.direction === 'dn' ? '↓' : ''}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,.6)' }}>{kpi.delta}</span>
                  </div>
                  {/* sparkline with value + month labels */}
                  {spark.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54, marginTop: 8 }}>
                      {spark.map((v, j) => {
                        const isCur = j === spark.length - 1
                        return (
                          <div key={j} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 8, fontWeight: 600, color: '#FFFFFF', lineHeight: 1, whiteSpace: 'nowrap' }}>{fmt(v)}</span>
                            <div style={{ width: '100%', maxWidth: 26, background: isCur ? '#FF7604' : 'rgba(181,212,244,.42)', borderRadius: 2, height: Math.max(4, Math.round(28 * v / mx)) }} />
                            <span style={{ fontSize: 8, color: '#8F92B5', lineHeight: 1 }}>{labels[j] ?? ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── FUNNEL + GAUGE ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 11 }}>
          {/* Funnel */}
          <div style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69' }}>
                <i className="ti ti-filter" style={{ fontSize: 15, color: '#2A2F69' }} />
                Pipeline funnel &nbsp;<span style={{ fontSize: 11, fontWeight: 400, color: '#5F638F' }}>{SUFFIX[funnelPeriod]}</span>
              </div>
              <span style={{ display: 'inline-flex', border: '1px solid #DDDDE8', borderRadius: 6, overflow: 'hidden' }}>
                {(['month', 'q', 'ytd'] as Period[]).map(p => (
                  <button key={p} onClick={() => setFunnelPeriod(p)}
                    style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', border: 'none', background: funnelPeriod === p ? '#2A2F69' : '#fff', color: funnelPeriod === p ? '#fff' : '#8F92B5', cursor: 'pointer', lineHeight: 1.4 }}>
                    {p === 'month' ? 'M' : p === 'q' ? 'Q' : 'Y'}
                  </button>
                ))}
              </span>
            </div>
            <SvgFunnel funnel={funnel} onStage={(s) => {
              const hit = data.followUps.find(f => f.stage === s)
              if (hit) setDrawerDeal(hit)
            }} />
            <div style={{ fontSize: 9.5, color: '#5F638F', marginTop: 9 }}>
              <span style={{ color: '#C0392B', fontWeight: 700 }}>% drop</span> = fall from previous stage
            </div>
          </div>

          {/* Gauge */}
          <div style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69', marginBottom: 11 }}>
              <i className="ti ti-target" style={{ fontSize: 15, color: '#2A2F69' }} />
              Monthly revenue target
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, flex: 1 }}>
              {/* Gauge ring */}
              <div style={{ position: 'relative', width: 118, height: 118 }}>
                <svg viewBox="0 0 118 118" width="118" height="118" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="59" cy="59" r="49" fill="none" stroke="#DDDDE8" strokeWidth="11" />
                  <circle cx="59" cy="59" r="49" fill="none" stroke={gaugeColor} strokeWidth="11"
                    strokeDasharray={`${gaugeCirc} ${gaugeCirc}`}
                    strokeDashoffset={gaugeCirc * (1 - pct / 100)}
                    strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#2A2F69' }}>{pct}%</div>
                  <div style={{ fontSize: 9.5, color: '#5F638F' }}>₹{data.revenueTarget.achieved} / {data.revenueTarget.target}Cr</div>
                </div>
              </div>
              {/* Gauge note */}
              <div style={{ fontSize: 11, color: '#2A2F69', textAlign: 'center' }}>
                Day {day} of {dim} · {dim - day} days remaining in {monthName} ·{' '}
                {(() => {
                  const pacePct = Math.round(day / dim * 100)
                  const diff = pct - pacePct
                  return diff >= 0
                    ? <span style={{ color: '#1A6B3A', fontWeight: 700 }}>{diff}% ahead of target pace</span>
                    : <span style={{ color: '#B42318', fontWeight: 700 }}>{-diff}% behind target pace</span>
                })()}
              </div>
              {/* Sparkline */}
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: 9, color: '#5F638F', marginBottom: 4 }}>6-month revenue trend (₹Cr)</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                  {data.revenueTarget.trend.map((t, i) => {
                    const isCur = i === data.revenueTarget.trend.length - 1
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#2A2F69', lineHeight: 1, whiteSpace: 'nowrap' }}>₹{t.value}</span>
                        <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: Math.round(46 * t.value / sparkMax), background: isCur ? '#FF7604' : 'rgba(42,47,105,.35)' }} />
                        <span style={{ fontSize: 9, color: '#5F638F', lineHeight: 1 }}>{t.month}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN GRID: Action queue + Customers (left) | Region + Quick actions (right) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 11, alignItems: 'start' }}>
          {/* LEFT colstack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
            {/* Action queue */}
            <div ref={actionQRef} style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69' }}>
                  <i className="ti ti-clock-hour-4" style={{ fontSize: 15, color: '#2A2F69' }} />
                  Action queue
                </div>
                <a href={erpUrl(
                    activeTab === 0 ? 'quotation?docstatus=1&status=Open' :
                    activeTab === 1 ? `quotation?docstatus=1&valid_till=Today` :
                                     'quotation?docstatus=1&status=Lost'
                  )} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: '#2A2F69', cursor: 'pointer', border: 'none', background: 'none', padding: 0, fontWeight: 500, textDecoration: 'none' }}>
                  View all ↗
                </a>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #DDDDE8', marginBottom: 9, flexWrap: 'wrap' }}>
                {[
                  { label: 'Follow-ups due today',          count: data.followUps.length,           bg: '#FCEBEB', color: '#991B1B' },
                  { label: 'Quotations expiring this week', count: data.expiringQuotations.length,  bg: '#FEF3C7', color: '#92600A' },
                  { label: 'Lost orders this month',        count: data.lostDeals.deals.length,     bg: '#EEF0F3', color: '#5F638F' },
                ].map((t, i) => (
                  <button key={i} onClick={() => setActiveTab(i)}
                    style={{ fontSize: 10.5, padding: '6px 12px', cursor: 'pointer', border: 'none', background: 'none', borderBottom: activeTab === i ? '2px solid #2A2F69' : '2px solid transparent', color: activeTab === i ? '#2A2F69' : '#5F638F', fontWeight: activeTab === i ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {t.label}
                    <span style={{ borderRadius: 99, padding: '1px 6px', fontSize: 9, marginLeft: 4, background: t.bg, color: t.color }}>{t.count}</span>
                    {i === 1 && expToday > 0 && (
                      <span style={{ borderRadius: 99, padding: '1px 6px', fontSize: 9, marginLeft: 4, background: '#EF4444', color: '#fff' }}>{expToday} today</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              <div style={{ overflowX: 'auto' }}>
                {activeTab === 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Product', 'Value', 'Days', ''].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: '#8F92B5', textAlign: 'left', padding: '5px 7px', borderBottom: '1px solid #DDDDE8', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.followUps.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer', background: r.daysOverdue > 7 ? '#FFF8E6' : '' }}
                          onClick={() => setDrawerDeal(r)}
                          onMouseOver={e => { if (r.daysOverdue <= 7) e.currentTarget.style.background = '#EAEAF0' }}
                          onMouseOut={e => { e.currentTarget.style.background = r.daysOverdue > 7 ? '#FFF8E6' : '' }}>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', color: '#2A2F69', fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', color: '#5F638F' }}>{r.product}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap', background: r.severity === 'red' ? '#FCEBEB' : '#FEF3C7', color: r.severity === 'red' ? '#991B1B' : '#92600A' }}>
                              {r.daysOverdue}d
                            </span>
                          </td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>
                            <button onClick={e => e.stopPropagation()}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: '1px solid #2A2F69', color: '#2A2F69' }}>
                              Log follow-up
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {activeTab === 1 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Value', 'Valid till', ''].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: '#8F92B5', textAlign: 'left', padding: '5px 7px', borderBottom: '1px solid #DDDDE8', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.expiringQuotations.map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#EAEAF0'}
                          onMouseOut={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', color: '#2A2F69', fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#FCEBEB', color: '#991B1B' }}>{r.validTill}</span>
                          </td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>
                            <button onClick={e => { e.stopPropagation(); handleExtend(r.quotation) }}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: `1px solid ${NAVY}`, color: NAVY, marginRight: 5 }}>
                              Extend
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleConvert(r.quotation) }}
                              style={{ fontSize: 9, padding: '3px 9px', borderRadius: 99, background: 'none', cursor: 'pointer', border: `1px solid ${ORANGE}`, color: ORANGE }}>
                              Convert
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {activeTab === 2 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead><tr>
                      {['Quotation', 'Customer', 'Value', 'Lost reason'].map(h => (
                        <th key={h} style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: '#8F92B5', textAlign: 'left', padding: '5px 7px', borderBottom: '1px solid #DDDDE8', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.lostDeals.deals.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#EAEAF0'}
                          onMouseOut={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', color: '#2A2F69', fontWeight: 600 }}>{r.quotation}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8' }}>{r.customer}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                          <td style={{ padding: '6px 7px', borderBottom: '1px solid #DDDDE8', color: '#5F638F' }}>{r.lostReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Top customers */}
            <div style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69' }}>
                  <i className="ti ti-star" style={{ fontSize: 15, color: '#2A2F69' }} />
                  Top customers — order value MTD
                </div>
                <a href={erpUrl('sales-order?docstatus=1')} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: '#2A2F69', fontWeight: 500, textDecoration: 'none' }}>
                  View all ↗
                </a>
              </div>
              <div>
                {data.topCustomers.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7, cursor: 'pointer', borderRadius: 6, padding: 2 }}
                    onMouseOver={e => e.currentTarget.style.background = '#EAEAF0'}
                    onMouseOut={e => e.currentTarget.style.background = ''}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2A2F69', width: 18, flexShrink: 0, textAlign: 'center' }}>{c.rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
                      </div>
                      <div style={{ fontSize: 9, color: '#5F638F' }}>{c.orders} orders · YTD {c.ytdValue} · last {c.lastOrder}</div>
                      <div style={{ height: 3, background: '#DDDDE8', borderRadius: 99, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#2A2F69', borderRadius: 99, width: `${c.barPct}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT colstack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
            {/* Region chart */}
            <div style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69', marginBottom: 11 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 15, color: '#2A2F69' }} />
                Pipeline by region (₹L)
              </div>
              <div>
                <div style={{ display: 'flex', gap: 12, fontSize: 9, color: '#5F638F', marginBottom: 8 }}>
                  {[['#2A2F69', 'Quoted'], ['#B45309', 'Negotiation'], ['#1A6B3A', 'Won']].map(([c, l]) => (
                    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c }} />{l}
                    </span>
                  ))}
                </div>
                {data.regionPipeline.map((r, i) => {
                  const total = r.quoted + r.negotiation + r.won
                  const wq = Math.round(100 * r.quoted / rMax)
                  const wn = Math.round(100 * r.negotiation / rMax)
                  const ww = Math.round(100 * r.won / rMax)
                  return (
                    <div key={i} style={{ marginBottom: 6, borderRadius: 6, padding: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#5F638F', marginBottom: 3 }}>
                        <span>{r.region}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₹{total}L</span>
                      </div>
                      {/* inline value labels */}
                      <div style={{ display: 'flex', fontSize: 8.5, fontWeight: 700, margin: '2px 0', lineHeight: 1 }}>
                        <span style={{ color: '#2A2F69', width: `${wq}%`, whiteSpace: 'nowrap', overflow: 'hidden', paddingRight: 3 }}>₹{r.quoted}L</span>
                        <span style={{ color: '#B45309', width: `${wn}%`, whiteSpace: 'nowrap', overflow: 'hidden', paddingRight: 3 }}>₹{r.negotiation}L</span>
                        <span style={{ color: '#1A6B3A', width: `${ww}%`, whiteSpace: 'nowrap', overflow: 'hidden' }}>₹{r.won}L</span>
                      </div>
                      <div style={{ display: 'flex', height: 11, borderRadius: 99, overflow: 'hidden', gap: 1 }}>
                        <div style={{ width: `${wq}%`, background: '#2A2F69', borderRadius: '99px 0 0 99px' }} />
                        <div style={{ width: `${wn}%`, background: '#B45309' }} />
                        <div style={{ width: `${ww}%`, background: '#1A6B3A', borderRadius: '0 99px 99px 0' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ background: '#fff', border: '1px solid #DDDDE8', borderRadius: 11, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#2A2F69', marginBottom: 11 }}>
                <i className="ti ti-bolt" style={{ fontSize: 15, color: '#2A2F69' }} />
                Quick actions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {QUICK_ACTIONS.map(a => (
                  <a key={a.label} href={erpUrl(a.path)} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10.5, padding: 9, borderRadius: 9, border: '1px solid #DDDDE8', background: '#fff', color: '#2A2F69', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
                    onMouseOver={e => (e.currentTarget as HTMLElement).style.background = '#EAEAF0'}
                    onMouseOut={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                    <i className={`ti ${a.icon}`} style={{ fontSize: 15, color: '#2A2F69', flexShrink: 0 }} />
                    {a.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
      </div>

      {/* ── DEAL DRAWER ── */}
      {drawerDeal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,47,105,.3)', zIndex: 50 }}
            onClick={() => setDrawerDeal(null)} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 380, maxWidth: '92vw', background: '#fff', boxShadow: '-12px 0 40px rgba(42,47,105,.2)', zIndex: 51, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ background: NAVY, color: '#fff', padding: '15px 17px', position: 'relative' }}>
              <button style={{ position: 'absolute', top: 13, right: 14, color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 20, background: 'none', border: 'none' }}
                onClick={() => setDrawerDeal(null)}>×</button>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{drawerDeal.quotation}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{drawerDeal.customer}</div>
            </div>
            {/* Body — shows skeleton then real detail once loaded */}
            <div style={{ padding: '15px 17px', overflowY: 'auto', flex: 1 }}>
              {detailLoading ? (
                <div style={{ color: TEXT3, fontSize: 11, paddingTop: 12 }}>Loading details…</div>
              ) : (
                <>
                  {/* Key-value pairs — prefer real detail, fall back to followUp data */}
                  {[
                    ['Product',              detail?.product     ?? drawerDeal.product],
                    ['Quotation value',      detail?.value       ?? drawerDeal.value],
                    ['Current stage',        detail?.status      ?? drawerDeal.stage],
                    ['Region',               detail?.region      ?? drawerDeal.region],
                    ['Valid till',           detail?.validTill   ?? drawerDeal.validTill],
                    ['Days since follow-up', `${detail?.daysOverdue ?? drawerDeal.daysOverdue}d`],
                    ['Owner',                detail?.owner       ?? drawerDeal.owner],
                    ...(detail?.contact ? [['Contact', detail.contact]] : []),
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ color: TEXT2 }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  {/* Activity timeline */}
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: TEXT3, margin: '15px 0 8px' }}>Activity timeline</p>
                  <div style={{ position: 'relative', paddingLeft: 18, borderLeft: `2px solid ${BORDER}` }}>
                    {(detail?.timeline ?? [
                      { date: `${drawerDeal.daysOverdue}d ago`, event: `Quotation sent · ${drawerDeal.owner}` },
                      { date: `${Math.max(0, drawerDeal.daysOverdue - 2)}d ago`, event: 'Technical clarification shared' },
                      { date: 'No activity since', event: 'Awaiting customer response' },
                    ]).map((t, i, arr) => (
                      <div key={i} style={{ fontSize: 11, paddingBottom: 9, opacity: i === arr.length - 1 ? 0.5 : 1 }}>
                        <p style={{ fontWeight: 500 }}>{t.event}</p>
                        <p style={{ fontSize: 9.5, color: TEXT3, marginTop: 2 }}>{t.date}</p>
                      </div>
                    ))}
                  </div>
                  {/* Suggested next action */}
                  <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 9, padding: '10px 12px', fontSize: 11, color: '#9A3412', marginTop: 6 }}>
                    💡 {detail?.suggestedNextAction ?? (
                      drawerDeal.severity === 'red'
                        ? `No contact in ${drawerDeal.daysOverdue} days. Call today and extend validity before ${drawerDeal.validTill}.`
                        : `Follow up to keep momentum before validity lapses on ${drawerDeal.validTill}.`
                    )}
                  </div>
                  {/* Deep link to ERPNext */}
                  {detail?.deepLink && (
                    <a href={detail.deepLink} target="_blank" rel="noreferrer"
                      style={{ display: 'block', marginTop: 10, fontSize: 10, color: NAVY, textDecoration: 'underline' }}>
                      Open in ERPNext ↗
                    </a>
                  )}
                </>
              )}
            </div>
            {/* Footer actions */}
            <div style={{ padding: '13px 17px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <button onClick={() => toast('Follow-up logging — connect to ERPNext CRM')}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY }}>
                Log follow-up
              </button>
              <button onClick={() => detail?.deepLink && window.open(detail.deepLink, '_blank')}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: 9, borderRadius: 9, cursor: 'pointer', border: `1px solid ${NAVY}`, background: NAVY, color: '#fff' }}>
                Open in ERPNext
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── TOAST ── */}
      {actionMsg && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: NAVY, color: '#fff', fontSize: 12, padding: '10px 16px', borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,.25)', zIndex: 60, maxWidth: '90vw', whiteSpace: 'nowrap' }}>
          {actionMsg}
        </div>
      )}
    </div>
  )
}
