'use client'
import type { KPI } from '@/types/sales'
import { colors } from '@/lib/brand'

const ARROW = { up: '↗', dn: '↘', neu: '→' }
const DELTA_COLOR = { up: colors.success, dn: colors.error, neu: colors.warning }

export default function KpiCard({ kpi, onClick }: { kpi: KPI; onClick?: () => void }) {
  const max = Math.max(...kpi.spark)
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: kpi.color }} />
      <p className="mt-1 text-[10px] text-gray-500 mb-1">{kpi.label}</p>
      <p className="text-[22px] font-semibold leading-none text-gray-900">{kpi.value}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] flex items-center gap-1" style={{ color: DELTA_COLOR[kpi.direction] }}>
          {ARROW[kpi.direction]} {kpi.delta}
        </span>
        <div className="flex items-end gap-[2px] h-4">
          {kpi.spark.map((v, i) => (
            <div
              key={i}
              className="w-[5px] rounded-t-[1px]"
              style={{
                height: `${Math.round(14 * v / max)}px`,
                background: i === kpi.spark.length - 1 ? kpi.color + 'cc' : kpi.color + '33',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
