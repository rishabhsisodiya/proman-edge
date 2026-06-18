'use client'
import type { AttentionItem } from '@/types/sales'

const DOT_COLOR = { red: '#A32D2D', amber: '#854F0B' }
const COUNT_COLOR = { red: '#A32D2D', amber: '#854F0B' }

export default function AttentionStrip({
  items,
  onTabSwitch,
}: {
  items: AttentionItem[]
  onTabSwitch: (tab: number) => void
}) {
  const TAB_MAP: Record<string, number> = { expiring: 1, followup: 0, conversion: 2 }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[10px] font-medium text-gray-500 mb-2 flex items-center gap-1">
        <span style={{ color: '#A32D2D' }}>●</span> Needs your attention now
      </p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((a, i) => (
          <div
            key={i}
            onClick={() => onTabSwitch(TAB_MAP[a.type] ?? 0)}
            className="flex gap-2 items-start p-2 rounded-lg border border-gray-100 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
              style={{ background: DOT_COLOR[a.severity] }}
            />
            <div className="min-w-0">
              <p className="text-[20px] font-bold leading-none" style={{ color: COUNT_COLOR[a.severity] }}>
                {a.count}
              </p>
              <p className="text-[10px] font-medium text-gray-800 mt-0.5">{a.title}</p>
              <p className="text-[9px] text-gray-500 mt-0.5 truncate">{a.sub}</p>
              <p className="text-[9px] mt-1.5" style={{ color: '#1A4A8A' }}>→ {a.type === 'expiring' ? 'Review all' : a.type === 'followup' ? 'View queue' : 'View analysis'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
