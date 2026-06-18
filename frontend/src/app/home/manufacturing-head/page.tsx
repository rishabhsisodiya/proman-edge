'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useManufacturingHomepage } from '@/hooks/useManufacturingHomepage'
import type { PipelineStage, SubStage } from '@/types/manufacturing'

const NAVY   = '#0C447C'
const RED    = '#A32D2D'
const AMBER  = '#854F0B'
const GREEN  = '#1A6B3A'
const BORDER = '#E5E7EB'

const RAG_BG:    Record<string, string> = { red: '#FCEBEB', amber: '#FEF3C7', green: '#D1FAE5', hold: '#F1EFE8' }
const RAG_COLOR: Record<string, string> = { red: RED,       amber: AMBER,     green: '#065F46', hold: '#5F5E5A' }

// Roles that can switch dashboards and where they can go back to
const BACK_OPTIONS: Record<string, { label: string; slug: string }[]> = {
  'sales-head': [{ label: 'Sales Head',  slug: 'sales-head'  }],
  'md':         [{ label: 'Sales Head',  slug: 'sales-head'  }],
}

const QUICK_ACTIONS = [
  { icon: 'ti-arrow-right',    label: 'Update WO stage',      path: 'work-order'                              },
  { icon: 'ti-tool',           label: 'Log downtime',         path: 'downtime-entry/new-downtime-entry-1'     },
  { icon: 'ti-layout-kanban',  label: 'View pipeline',        path: 'work-order?status=In+Process'            },
  { icon: 'ti-refresh',        label: 'Create rework',        path: 'work-order/new-work-order-1'             },
  { icon: 'ti-package-off',    label: 'Shortage report',      path: 'material-request?status=Pending'         },
  { icon: 'ti-users',          label: 'Attendance',           path: 'attendance'                              },
  { icon: 'ti-chart-bar',      label: 'Completion report',    path: 'work-order?status=Completed'             },
  { icon: 'ti-alert-triangle', label: 'Escalate to dispatch', path: 'delivery-note'                           },
]

function PipelineTile({ s }: { s: PipelineStage }) {
  const total = s.red + s.amber + s.green + s.hold
  return (
    <div style={{ background: s.color, borderRadius: 8, padding: '8px 6px', textAlign: 'center', cursor: 'pointer' }}>
      <div style={{ fontSize: 8, fontWeight: 500, color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>{s.label}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: '#fff' }}>{total}</div>
      <div style={{ display: 'flex', height: 3, borderRadius: 99, overflow: 'hidden', marginTop: 4, gap: 1 }}>
        {s.red   > 0 && <div style={{ flex: s.red,   background: '#DC2626', borderRadius: 2 }} />}
        {s.amber > 0 && <div style={{ flex: s.amber, background: '#D97706' }} />}
        {s.green > 0 && <div style={{ flex: s.green, background: '#16A34A' }} />}
        {s.hold  > 0 && <div style={{ flex: s.hold,  background: '#6B7280', borderRadius: '0 2px 2px 0' }} />}
      </div>
    </div>
  )
}

function SubStageChart({ stages }: { stages: SubStage[] }) {
  const SMAX = Math.max(...stages.map(s => s.red + s.amber + s.green + s.hold), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, paddingTop: 4 }}>
      {stages.map((s, i) => {
        const tot = s.red + s.amber + s.green + s.hold
        const h   = Math.round(66 * tot / SMAX)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'flex-end', flex: 1 }}>
              {s.red   > 0 && <div style={{ width: '100%', height: Math.round(h * s.red   / tot), background: '#DC2626', borderRadius: '2px 2px 0 0', minHeight: 2 }} />}
              {s.amber > 0 && <div style={{ width: '100%', height: Math.round(h * s.amber / tot), background: '#D97706', minHeight: 2 }} />}
              {s.green > 0 && <div style={{ width: '100%', height: Math.round(h * s.green / tot), background: '#16A34A', minHeight: 2 }} />}
              {s.hold  > 0 && <div style={{ width: '100%', height: Math.round(h * s.hold  / tot), background: '#6B7280', minHeight: 2 }} />}
            </div>
            <div style={{ fontSize: 8, color: '#6B7280', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function th(label: string) {
  return <th key={label} style={{ fontSize: 9, fontWeight: 500, color: '#6B7280', textAlign: 'left', padding: '4px 5px', borderBottom: `0.5px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{label}</th>
}
function td(children: React.ReactNode, extra?: React.CSSProperties) {
  return <td style={{ padding: '5px 5px', borderBottom: `0.5px solid ${BORDER}`, fontSize: 10, verticalAlign: 'middle', ...extra }}>{children}</td>
}
function Tag({ rag, label }: { rag: string; label: string }) {
  return <span style={{ fontSize: 8, fontWeight: 500, padding: '2px 5px', borderRadius: 99, whiteSpace: 'nowrap', background: RAG_BG[rag], color: RAG_COLOR[rag] }}>{label}</span>
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', ...style }}>{children}</div>
}
function CardTitle({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: '#111', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14, color: NAVY }} />
        {title}
      </div>
      {right}
    </div>
  )
}

export default function ManufacturingHeadHomepage() {
  const router      = useRouter()
  const switcherRef = useRef<HTMLDivElement>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const { user, isLoading: userLoading } = useCurrentUser()
  const { data, isLoading, isError } = useManufacturingHomepage()

  const backOptions = BACK_OPTIONS[user?.roleSlug ?? ''] ?? []

  useEffect(() => {
    function h(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (isLoading || userLoading) return <div style={{ padding: 40, fontSize: 13, color: '#6B7280' }}>Loading dashboard…</div>
  if (isError || !data) return <div style={{ padding: 40, fontSize: 13, color: RED }}>Unable to load dashboard. Check middleware connection.</div>

  const erpBase = data.erpBaseUrl.replace(/\/$/, '')
  const erpUrl  = (path: string) => `${erpBase}/app/${path}`
  const syncTime = new Date(data.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const { kpis, pipelineStages, delayedWOs, mfgSubStages, materialShortages, attendance, downtime, completingThisWeek } = data

  const KPI_TILES = [
    { label: 'Active work orders', value: kpis.activeWOs.value,      sub: kpis.activeWOs.sub,      accent: NAVY,  valueColor: '#111'  },
    { label: 'Completed today',    value: kpis.completedToday.value,  sub: kpis.completedToday.sub, accent: GREEN, valueColor: '#111'  },
    { label: 'Delayed — Red',      value: kpis.delayedRed.value,      sub: kpis.delayedRed.sub,     accent: RED,   valueColor: RED     },
    { label: 'At risk — Amber',    value: kpis.atRiskAmber.value,     sub: kpis.atRiskAmber.sub,    accent: AMBER, valueColor: AMBER   },
    { label: 'On hold',            value: kpis.onHold.value,          sub: kpis.onHold.sub,         accent: '#888780', valueColor: '#888780' },
  ]

  return (
    <div style={{ fontFamily: "Arial,'Helvetica Neue',Helvetica,sans-serif", background: '#F3F4F6', padding: 16, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Topbar */}
        <div style={{ background: NAVY, borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-building-factory-2" />
              &nbsp;Good morning, {user?.fullName ?? '…'}
            </div>
            <div style={{ fontSize: 11, color: '#A0BDD8', marginTop: 2 }}>
              {user?.role ?? 'Manufacturing Head'} &nbsp;|&nbsp;
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              &nbsp;|&nbsp; Auto-refresh every 5 min
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
              <i className="ti ti-sun" /> Morning shift &nbsp;07:00–15:30
            </span>
            <span style={{ fontSize: 10, color: '#A0BDD8', display: 'flex', alignItems: 'center', gap: 3 }}>
              <i className="ti ti-refresh" /> Synced {syncTime}
            </span>
            {/* Dashboard switcher — for any strategic role visiting this page */}
            {backOptions.length > 0 && (
              <div style={{ position: 'relative' }} ref={switcherRef}>
                <button onClick={() => setShowSwitcher(v => !v)}
                  style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-layout-grid" style={{ fontSize: 13 }} /> Switch dashboard
                </button>
                {showSwitcher && (
                  <div style={{ position: 'absolute', top: 34, right: 0, background: '#fff', border: '1px solid #DDDDE8', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', zIndex: 50, minWidth: 170, padding: 6 }}>
                    {backOptions.map(o => (
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
          </div>
        </div>

        {/* Alert banner */}
        {data.alert && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#991B1B' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 16, flexShrink: 0 }} />
            <strong>{data.alert}</strong>
          </div>
        )}

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {KPI_TILES.map((k, i) => (
            <div key={i} style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderLeft: `4px solid ${k.accent}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, color: k.valueColor }}>{k.value}</div>
              <div style={{ fontSize: 9, color: '#6B7280', marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Pipeline stage strip */}
        <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#111', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-layout-kanban" style={{ color: NAVY }} /> Pipeline stage summary — click to open
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 6 }}>
            {pipelineStages.map((s, i) => <PipelineTile key={i} s={s} />)}
          </div>
        </div>

        {/* Row 1: Delayed WOs | Sub-stages chart | Material shortages */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
          <Card>
            <CardTitle icon="ti-alert-circle" title="Delayed work orders"
              right={<a href={erpUrl('work-order')} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: NAVY, textDecoration: 'none' }}>View all ↗</a>} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['WO No.','Customer','Stage','Status',''].map(h => th(h))}</tr></thead>
              <tbody>
                {delayedWOs.map((r, i) => (
                  <tr key={i} style={{ borderLeft: `3px solid ${r.rag === 'red' ? '#A32D2D' : '#854F0B'}` }}>
                    {td(r.wo,       { color: '#1A4A8A', fontWeight: 500 })}
                    {td(r.customer, { maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
                    {td(r.stage,    { color: '#6B7280' })}
                    {td(<Tag rag={r.rag} label={r.label} />)}
                    {td(<button style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, border: `0.5px solid ${NAVY}`, color: NAVY, background: 'none', cursor: 'pointer' }}>Detail</button>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle icon="ti-chart-bar" title="Mfg sub-stages (S6)" />
            <SubStageChart stages={mfgSubStages} />
          </Card>

          <Card>
            <CardTitle icon="ti-package-off" title="Material shortages"
              right={<span style={{ fontSize: 9, background: '#FCEBEB', color: RED, padding: '2px 6px', borderRadius: 99 }}>{materialShortages.filter(s => s.rag === 'red').length} blocking</span>} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['WO','Item','Short','ETA'].map(h => th(h))}</tr></thead>
              <tbody>
                {materialShortages.map((r, i) => (
                  <tr key={i} style={{ borderLeft: `3px solid ${RAG_COLOR[r.rag]}` }}>
                    {td(r.wo,    { color: '#1A4A8A', fontWeight: 500 })}
                    {td(r.item)}
                    {td(r.short, { color: r.rag === 'red' ? RED : AMBER })}
                    {td(r.eta,   { color: r.rag === 'red' ? AMBER : '#111' })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Row 2: Attendance | Downtime */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Card>
            <CardTitle icon="ti-users" title="Workforce attendance — today" />
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 10 }}>
              {[
                { val: attendance.present, label: 'Present', color: GREEN  },
                { val: attendance.absent,  label: 'Absent',  color: RED    },
                { val: attendance.onLeave, label: 'On leave', color: AMBER },
                { val: `${attendance.pct}%`, label: 'Attendance %', color: '#111' },
              ].map((a, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 500, color: a.color }}>{a.val}</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{a.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {attendance.byDept.map((d, i) => {
                const pct = Math.round(100 * d.present / d.total)
                const color = pct >= 90 ? GREEN : pct >= 80 ? AMBER : RED
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: '#6B7280', width: 80, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.dept}</span>
                    <div style={{ flex: 1, height: 8, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: 8, borderRadius: 99, background: color, width: `${pct}%` }} />
                    </div>
                    <span style={{ fontSize: 9, color: '#6B7280', width: 26, textAlign: 'right', flexShrink: 0 }}>{d.present}/{d.total}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardTitle icon="ti-tool" title="Machine downtime — today"
              right={<span style={{ fontSize: 9, background: '#FEF3C7', color: AMBER, padding: '2px 6px', borderRadius: 99 }}>{data.downtime.totalHrs} hrs total</span>} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Machine','Duration','Reason','Status'].map(h => th(h))}</tr></thead>
              <tbody>
                {downtime.machines.map((m, i) => (
                  <tr key={i}>
                    {td(m.machine)}
                    {td(`${m.hrs} hr${m.hrs !== 1 ? 's' : ''}`)}
                    {td(m.reason, { color: '#6B7280' })}
                    {td(<Tag rag={m.status === 'resolved' ? 'green' : 'amber'} label={m.status === 'resolved' ? 'Resolved' : 'Open'} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Row 3: Completing this week | Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
          <Card>
            <CardTitle icon="ti-calendar" title="WOs completing this week"
              right={<a href={erpUrl('work-order')} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: NAVY, textDecoration: 'none' }}>Risk analysis ↗</a>} />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['WO No.','Customer','Product','Due','Stage','Completion'].map(h => th(h))}</tr></thead>
              <tbody>
                {completingThisWeek.map((r, i) => (
                  <tr key={i} style={{ borderLeft: `3px solid ${RAG_COLOR[r.rag]}` }}>
                    {td(r.wo,       { color: '#1A4A8A', fontWeight: 500 })}
                    {td(r.customer)}
                    {td(r.product)}
                    {td(r.due, { color: r.rag === 'red' ? RED : r.rag === 'amber' ? AMBER : '#111' })}
                    {td(r.stage)}
                    {td(
                      <Tag rag={r.rag}
                        label={r.completion === 100 ? 'On track' : r.rag === 'red' ? `${r.completion}% — ${r.completion < 70 ? 'Overdue' : 'At risk'}` : `${r.completion}% — Watch`} />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle icon="ti-bolt" title="Quick actions" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {QUICK_ACTIONS.map(a => (
                <a key={a.label} href={erpUrl(a.path)} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, padding: '7px 8px', borderRadius: 8, border: `0.5px solid ${BORDER}`, background: '#fff', color: '#111', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', transition: 'background .12s' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F3F4F6')}
                  onMouseOut={e => (e.currentTarget.style.background = '#fff')}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: 13, color: NAVY, flexShrink: 0 }} />
                  {a.label}
                </a>
              ))}
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
