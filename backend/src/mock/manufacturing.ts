import type { ManufacturingHomepageData } from '../types/manufacturing'

export const manufacturingHomepageMock: ManufacturingHomepageData = {
  syncedAt:   new Date().toISOString(),
  erpBaseUrl: 'http://proman.localhost:8000',

  kpis: {
    activeWOs:      { value: 16, sub: 'Across 8 stages' },
    completedToday: { value: 2,  sub: 'WO-046, WO-041'  },
    delayedRed:     { value: 4,  sub: 'Needs action now' },
    atRiskAmber:    { value: 5,  sub: 'Monitor closely'  },
    onHold:         { value: 2,  sub: 'Active holds'     },
  },

  alert: '2 Work Orders critically overdue (7+ days) — WO-2026-058 (Dalmia Bharat, PE-900×1200) and WO-2026-074 (SAIL Bhilai, VSI-900). Immediate escalation required.',

  pipelineStages: [
    { label: 'Eng & design',  short: 'S1', color: '#1E3A5F', red: 2, amber: 0, green: 0, hold: 0 },
    { label: 'Prod planning', short: 'S2', color: '#185FA5', red: 2, amber: 0, green: 0, hold: 0 },
    { label: 'Procurement',   short: 'S3', color: '#1A6B3A', red: 0, amber: 1, green: 1, hold: 0 },
    { label: 'Vendor dev',    short: 'S4', color: '#6B4226', red: 0, amber: 1, green: 0, hold: 0 },
    { label: 'Stores',        short: 'S5', color: '#4A235A', red: 0, amber: 0, green: 1, hold: 1 },
    { label: 'Manufacturing', short: 'S6', color: '#0C447C', red: 2, amber: 1, green: 1, hold: 0 },
    { label: 'Quality',       short: 'S7', color: '#7D6608', red: 0, amber: 1, green: 1, hold: 0 },
    { label: 'Dispatch',      short: 'S8', color: '#185FA5', red: 0, amber: 0, green: 1, hold: 0 },
    { label: 'Installation',  short: 'S9', color: '#6E2C00', red: 0, amber: 0, green: 1, hold: 0 },
  ],

  delayedWOs: [
    { wo: 'WO-2026-058', customer: 'Dalmia Bharat',    stage: 'S6 — Mfg',        daysOver: 4, rag: 'red',   label: '4d over' },
    { wo: 'WO-2026-074', customer: 'SAIL Bhilai',      stage: 'S3 — Procurement', daysOver: 4, rag: 'red',   label: '4d over' },
    { wo: 'WO-2026-065', customer: 'UltraTech Cement', stage: 'S5 — Stores',      daysOver: 2, rag: 'amber', label: 'Hold'    },
    { wo: 'WO-2026-022', customer: 'Prism Cement',     stage: 'S6 — Mfg',        daysOver: 5, rag: 'amber', label: 'Hold'    },
    { wo: 'WO-2026-050', customer: 'ACC Limited',      stage: 'S7 — Quality',     daysOver: 2, rag: 'amber', label: '2d'      },
    { wo: 'WO-2026-081', customer: 'NTPC Vindhyachal', stage: 'S1 — Eng',         daysOver: 1, rag: 'amber', label: 'At risk' },
  ],

  mfgSubStages: [
    { label: 'Fabrication', red: 1, amber: 1, green: 1, hold: 0 },
    { label: 'Machining',   red: 0, amber: 1, green: 1, hold: 0 },
    { label: 'Sub-assy',    red: 0, amber: 0, green: 1, hold: 1 },
    { label: 'Final assy',  red: 1, amber: 0, green: 1, hold: 0 },
    { label: 'Paint',       red: 0, amber: 1, green: 0, hold: 0 },
  ],

  materialShortages: [
    { wo: 'WO-065', item: 'Jaw plate — Mn14',             short: '12 nos', eta: 'Jun 10', rag: 'red'   },
    { wo: 'WO-071', item: 'Self-aligning bearing 22326',  short: '4 nos',  eta: 'Jun 12', rag: 'red'   },
    { wo: 'WO-079', item: 'Hydraulic cylinder 80×200',    short: '2 nos',  eta: 'Jun 15', rag: 'amber' },
    { wo: 'WO-033', item: 'Electric motor 15kW',          short: '1 no',   eta: 'Jun 14', rag: 'green' },
  ],

  attendance: {
    present: 148, absent: 12, onLeave: 8, pct: 88,
    byDept: [
      { dept: 'Production',   present: 148, total: 168 },
      { dept: 'Fabrication',  present: 32,  total: 36  },
      { dept: 'Quality',      present: 18,  total: 20  },
      { dept: 'Stores',       present: 14,  total: 16  },
      { dept: 'Dispatch',     present: 8,   total: 8   },
    ],
  },

  downtime: {
    totalHrs: 3.5,
    machines: [
      { machine: 'Welding set #3',  hrs: 2.0, reason: 'Power failure',    status: 'resolved' },
      { machine: 'CNC lathe #1',    hrs: 1.0, reason: 'Tool change',       status: 'resolved' },
      { machine: 'Overhead crane',  hrs: 0.5, reason: 'Brake adjustment',  status: 'open'     },
    ],
  },

  completingThisWeek: [
    { wo: 'WO-058', customer: 'Dalmia Bharat',  product: 'PE-900',    due: 'Jun 10', stage: 'S6', completion: 85,  rag: 'red'   },
    { wo: 'WO-074', customer: 'SAIL Bhilai',    product: 'VSI-900',   due: 'Jun 11', stage: 'S3', completion: 65,  rag: 'red'   },
    { wo: 'WO-046', customer: 'Shree Cement',   product: 'HP-200',    due: 'Jun 12', stage: 'S8', completion: 100, rag: 'green' },
    { wo: 'WO-050', customer: 'ACC Limited',    product: 'VSI-750',   due: 'Jun 13', stage: 'S7', completion: 90,  rag: 'amber' },
    { wo: 'WO-041', customer: 'Ambuja Cements', product: 'PE-600',    due: 'Jun 13', stage: 'S9', completion: 100, rag: 'green' },
  ],
}
