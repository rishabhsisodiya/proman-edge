import type { SalesHomepageData } from '../types/sales'

export const salesHomepageMock: SalesHomepageData = {
  syncedAt:   new Date().toISOString(),
  erpBaseUrl: 'http://proman.localhost:8000',

  decisionBand: {
    day: 11,
    daysInMonth: 30,
    targetCr: 3.0,
    achievedCr: 2.19,
    gapCr: 0.81,
    coverageX: 5.2,
    weightedCr: 3.0,
    verdict: 'ok',
    verdictLabel: 'Ahead of pace',
    headline: 'June is reachable',
    subtext: 'At day 11 of 30, ₹2.19 Cr of the ₹3.0 Cr target is booked. Weighted open pipeline (₹3.0 Cr) more than covers the ₹0.81 Cr gap — protect the 3 deals expiring today.',
  },

  attention: [
    { type: 'expiring', count: '3', title: 'Quotations expire today', sub: 'Heidelberg ₹22L · Shree ₹17L · Wonder ₹9L', severity: 'red' },
    { type: 'followup', count: '7', title: 'Follow-ups overdue', sub: 'Oldest: NTPC 12d · JSW 9d · SAIL 7d', severity: 'red' },
    { type: 'conversion', count: '31%', title: 'Conversion rate drop', sub: '−4% vs last month · lowest in 6 months', severity: 'amber' },
  ],

  kpis: [
    { label: 'Enquiries MTD',       value: '24',      delta: '+6 vs last month',   direction: 'up',  color: '#1A4A8A', spark: [14,18,16,20,17,24] },
    { label: 'Quotations open',      value: '18',      delta: '₹4.2 Cr pipeline',   direction: 'neu', color: '#854F0B', spark: [12,15,14,17,16,18] },
    { label: 'Orders confirmed MTD', value: '9',       delta: '₹2.84 Cr value',     direction: 'up',  color: '#1A6B3A', spark: [5,7,8,6,7,9]      },
    { label: 'Conversion rate',      value: '31%',     delta: '−4% vs last month',  direction: 'dn',  color: '#A32D2D', spark: [38,35,36,33,35,31] },
    { label: 'Revenue MTD',          value: '₹2.19Cr', delta: 'vs ₹3.0 Cr target', direction: 'neu', color: '#C2410C', spark: [1.4,1.8,2.2,1.9,2.6,2.19] },
  ],

  kpisAll: {
    month: [
      { label: 'Enquiries',        value: '24',      delta: '+6 vs last month',   direction: 'up',  color: '#1A4A8A', spark: [14,18,16,20,17,24] },
      { label: 'Quotations open',  value: '18',      delta: '₹4.2 Cr pipeline',   direction: 'neu', color: '#854F0B', spark: [12,15,14,17,16,18] },
      { label: 'Orders confirmed', value: '9',       delta: '₹2.84 Cr value',     direction: 'up',  color: '#1A6B3A', spark: [5,7,8,6,7,9]      },
      { label: 'Conversion',       value: '31%',     delta: '−4% vs last month',  direction: 'dn',  color: '#A32D2D', spark: [38,35,36,33,35,31] },
      { label: 'Revenue MTD',      value: '₹2.19Cr', delta: 'vs ₹3.0 Cr target', direction: 'neu', color: '#C2410C', spark: [1.4,1.8,2.2,1.9,2.6,2.19] },
    ],
    q: [
      { label: 'Enquiries',        value: '68',      delta: '+14 vs prev qtr',    direction: 'up',  color: '#1A4A8A', spark: [40,52,68]    },
      { label: 'Quotations open',  value: '32',      delta: '₹11.8 Cr pipeline',  direction: 'neu', color: '#854F0B', spark: [22,28,32]    },
      { label: 'Orders confirmed', value: '24',      delta: '₹7.4 Cr value',      direction: 'up',  color: '#1A6B3A', spark: [14,19,24]    },
      { label: 'Conversion',       value: '34%',     delta: 'flat vs prev qtr',   direction: 'neu', color: '#A32D2D', spark: [33,35,34]    },
      { label: 'Revenue QTD',      value: '₹6.8Cr',  delta: 'vs ₹8.0 Cr target', direction: 'neu', color: '#C2410C', spark: [18,24,26]    },
    ],
    ytd: [
      { label: 'Enquiries',        value: '142',     delta: '+22% YoY',           direction: 'up',  color: '#1A4A8A', spark: [90,110,142]  },
      { label: 'Quotations open',  value: '67',      delta: '₹23 Cr pipeline',    direction: 'neu', color: '#854F0B', spark: [40,55,67]    },
      { label: 'Orders confirmed', value: '51',      delta: '₹15.8 Cr value',     direction: 'up',  color: '#1A6B3A', spark: [30,42,51]    },
      { label: 'Conversion',       value: '36%',     delta: '+2% YoY',            direction: 'up',  color: '#A32D2D', spark: [33,34,36]    },
      { label: 'Revenue YTD',      value: '₹14.2Cr', delta: 'vs ₹16 Cr plan',    direction: 'neu', color: '#C2410C', spark: [40,46,48]    },
    ],
  },

  funnel: {
    month: [
      { stage: 'Enquiry',     count: 24,  value: 6.8,  avgDays: 3,    isStalling: false, dropPct: null },
      { stage: 'Qualified',   count: 16,  value: 4.9,  avgDays: 6,    isStalling: false, dropPct: 33   },
      { stage: 'Quoted',      count: 12,  value: 4.2,  avgDays: 9,    isStalling: false, dropPct: 25   },
      { stage: 'Negotiation', count: 7,   value: 2.1,  avgDays: 14,   isStalling: true,  dropPct: 42   },
      { stage: 'Won',         count: 9,   value: 2.84, avgDays: null, isStalling: false, dropPct: null },
    ],
    q: [
      { stage: 'Enquiry',     count: 68,  value: 19.2, avgDays: 3,    isStalling: false, dropPct: null },
      { stage: 'Qualified',   count: 44,  value: 14.1, avgDays: 7,    isStalling: false, dropPct: 35   },
      { stage: 'Quoted',      count: 32,  value: 11.8, avgDays: 10,   isStalling: false, dropPct: 27   },
      { stage: 'Negotiation', count: 18,  value: 5.9,  avgDays: 15,   isStalling: true,  dropPct: 44   },
      { stage: 'Won',         count: 24,  value: 7.4,  avgDays: null, isStalling: false, dropPct: null },
    ],
    ytd: [
      { stage: 'Enquiry',     count: 142, value: 41,   avgDays: 4,    isStalling: false, dropPct: null },
      { stage: 'Qualified',   count: 94,  value: 28,   avgDays: 7,    isStalling: false, dropPct: 34   },
      { stage: 'Quoted',      count: 67,  value: 23,   avgDays: 11,   isStalling: false, dropPct: 29   },
      { stage: 'Negotiation', count: 38,  value: 12,   avgDays: 16,   isStalling: true,  dropPct: 43   },
      { stage: 'Won',         count: 51,  value: 15.8, avgDays: null, isStalling: false, dropPct: null },
    ],
  },

  revenueTarget: {
    pct: 73,
    achieved: 2.19,
    target: 3.0,
    daysRemaining: 19,
    trend: [
      { month: 'Jan', value: 1.4  },
      { month: 'Feb', value: 1.8  },
      { month: 'Mar', value: 2.2  },
      { month: 'Apr', value: 1.9  },
      { month: 'May', value: 2.6  },
      { month: 'Jun', value: 2.19 },
    ],
  },

  followUps: [
    { quotation: 'Q-2026-0088', customer: 'NTPC Vindhyachal', product: 'PE-1200×1500', value: '₹38L', daysOverdue: 12, validTill: '18 Jun', owner: 'R. Menon',  region: 'Chhattisgarh', stage: 'Negotiation', severity: 'red'   },
    { quotation: 'Q-2026-0081', customer: 'JSW Steel',         product: 'HP-300',       value: '₹22L', daysOverdue: 9,  validTill: '20 Jun', owner: 'R. Menon',  region: 'Karnataka',    stage: 'Quoted',      severity: 'red'   },
    { quotation: 'Q-2026-0075', customer: 'SAIL Bhilai',       product: 'VSI-900',      value: '₹17L', daysOverdue: 7,  validTill: '24 Jun', owner: 'A. Pillai', region: 'Chhattisgarh', stage: 'Quoted',      severity: 'red'   },
    { quotation: 'Q-2026-0069', customer: 'Dalmia Bharat',     product: 'SO-150',       value: '₹14L', daysOverdue: 5,  validTill: '28 Jun', owner: 'A. Pillai', region: 'Rajasthan',    stage: 'Negotiation', severity: 'amber' },
    { quotation: 'Q-2026-0062', customer: 'ACC Limited',       product: 'VF-2448',      value: '₹9L',  daysOverdue: 5,  validTill: '30 Jun', owner: 'S. Nair',   region: 'Maharashtra',  stage: 'Quoted',      severity: 'amber' },
    { quotation: 'Q-2026-0058', customer: 'UltraTech',         product: 'HP-200',       value: '₹28L', daysOverdue: 4,  validTill: '02 Jul', owner: 'S. Nair',   region: 'Gujarat',      stage: 'Negotiation', severity: 'amber' },
    { quotation: 'Q-2026-0054', customer: 'Shree Cement',      product: 'PE-900',       value: '₹18L', daysOverdue: 4,  validTill: '04 Jul', owner: 'R. Menon',  region: 'Rajasthan',    stage: 'Quoted',      severity: 'amber' },
    { quotation: 'Q-2026-0049', customer: 'Ambuja Cements',    product: 'CS-200',       value: '₹24L', daysOverdue: 3,  validTill: '06 Jul', owner: 'A. Pillai', region: 'Gujarat',      stage: 'Negotiation', severity: 'amber' },
    { quotation: 'Q-2026-0045', customer: 'Wonder Cement',     product: 'SO-120',       value: '₹11L', daysOverdue: 3,  validTill: '08 Jul', owner: 'S. Nair',   region: 'Rajasthan',    stage: 'Quoted',      severity: 'amber' },
    { quotation: 'Q-2026-0041', customer: 'Nuvoco Vistas',     product: 'VSI-700',      value: '₹15L', daysOverdue: 2,  validTill: '10 Jul', owner: 'R. Menon',  region: 'Maharashtra',  stage: 'Quoted',      severity: 'amber' },
    { quotation: 'Q-2026-0037', customer: 'Star Cement',       product: 'VF-1830',      value: '₹7L',  daysOverdue: 2,  validTill: '12 Jul', owner: 'A. Pillai', region: 'Odisha',       stage: 'Quoted',      severity: 'amber' },
    { quotation: 'Q-2026-0033', customer: 'JK Lakshmi',        product: 'HP-250',       value: '₹21L', daysOverdue: 1,  validTill: '14 Jul', owner: 'S. Nair',   region: 'Rajasthan',    stage: 'Negotiation', severity: 'amber' },
  ],
  followUpsTotal: 12,

  expiringQuotations: [
    { quotation: 'Q-2026-0088', customer: 'Heidelberg Cement', value: '₹22L', validTill: 'Today' },
    { quotation: 'Q-2026-0083', customer: 'Shree Cement',      value: '₹17L', validTill: 'Today' },
    { quotation: 'Q-2026-0079', customer: 'Wonder Cement',     value: '₹9L',  validTill: 'Today' },
    { quotation: 'Q-2026-0071', customer: 'ACC Limited',       value: '₹13L', validTill: 'Thu'   },
    { quotation: 'Q-2026-0066', customer: 'Dalmia Bharat',     value: '₹19L', validTill: 'Fri'   },
  ],

  lostDeals: {
    summary: [
      { reason: 'Price — competitor lower',  deals: 2, value: '₹42L', pct: 68 },
      { reason: 'Delivery timeline',          deals: 1, value: '₹28L', pct: 45 },
      { reason: 'Technical spec mismatch',    deals: 1, value: '₹11L', pct: 18 },
      { reason: 'Budget constraints',         deals: 1, value: '₹8L',  pct: 13 },
    ],
    deals: [
      { quotation: 'Q-2026-0044', customer: 'Ramco Cements',  value: '₹14L', lostReason: 'Price — competitor lower', stageLost: 'Negotiation' },
      { quotation: 'Q-2026-0039', customer: 'Ambuja Cements', value: '₹28L', lostReason: 'Delivery timeline',        stageLost: 'Quoted'      },
      { quotation: 'Q-2026-0031', customer: 'Birla Corp',     value: '₹11L', lostReason: 'Technical spec mismatch',  stageLost: 'Quoted'      },
      { quotation: 'Q-2026-0025', customer: 'Prism Cement',   value: '₹8L',  lostReason: 'Budget constraints',       stageLost: 'Negotiation' },
      { quotation: 'Q-2026-0019', customer: 'Penna Cement',   value: '₹16L', lostReason: 'Price — competitor lower', stageLost: 'Negotiation' },
      { quotation: 'Q-2026-0014', customer: 'India Cements',  value: '₹9L',  lostReason: 'Lost to incumbent',        stageLost: 'Quoted'      },
      { quotation: 'Q-2026-0009', customer: 'Sanghi Ind.',    value: '₹12L', lostReason: 'Delivery timeline',        stageLost: 'Quoted'      },
      { quotation: 'Q-2026-0004', customer: 'Mangalam Cem.', value: '₹6L',   lostReason: 'Project shelved',          stageLost: 'Qualified'   },
    ],
  },

  topCustomers: [
    { rank: 1,  name: 'NTPC Vindhyachal', value: '₹52L', orders: 3, barPct: 88, trend: 'up', trendVs: '₹38L last month', ytdValue: '₹3.4 Cr', lastOrder: '09 Jun' },
    { rank: 2,  name: 'JSW Steel',         value: '₹44L', orders: 2, barPct: 74, trend: 'eq', trendVs: 'same as last mo', ytdValue: '₹2.9 Cr', lastOrder: '07 Jun' },
    { rank: 3,  name: 'UltraTech Cement',  value: '₹38L', orders: 4, barPct: 64, trend: 'dn', trendVs: '₹45L last month', ytdValue: '₹2.6 Cr', lastOrder: '10 Jun' },
    { rank: 4,  name: 'SAIL Bhilai',       value: '₹31L', orders: 2, barPct: 52, trend: 'up', trendVs: '₹22L last month', ytdValue: '₹2.1 Cr', lastOrder: '05 Jun' },
    { rank: 5,  name: 'Dalmia Bharat',     value: '₹28L', orders: 3, barPct: 47, trend: 'up', trendVs: '₹19L last month', ytdValue: '₹1.8 Cr', lastOrder: '08 Jun' },
    { rank: 6,  name: 'Heidelberg Cement', value: '₹22L', orders: 1, barPct: 37, trend: 'dn', trendVs: '₹31L last month', ytdValue: '₹1.4 Cr', lastOrder: '03 Jun' },
    { rank: 7,  name: 'ACC Limited',       value: '₹18L', orders: 2, barPct: 30, trend: 'eq', trendVs: 'same as last mo', ytdValue: '₹1.2 Cr', lastOrder: '06 Jun' },
    { rank: 8,  name: 'Shree Cement',      value: '₹17L', orders: 1, barPct: 28, trend: 'dn', trendVs: '₹24L last month', ytdValue: '₹1.1 Cr', lastOrder: '02 Jun' },
    { rank: 9,  name: 'Ambuja Cements',    value: '₹14L', orders: 2, barPct: 23, trend: 'up', trendVs: '₹9L last month',  ytdValue: '₹0.9 Cr', lastOrder: '04 Jun' },
    { rank: 10, name: 'Nuvoco Vistas',     value: '₹11L', orders: 1, barPct: 18, trend: 'eq', trendVs: 'same as last mo', ytdValue: '₹0.7 Cr', lastOrder: '01 Jun' },
  ],

  regionPipeline: [
    { region: 'Rajasthan',     quoted: 82, negotiation: 34, won: 24 },
    { region: 'Maharashtra',   quoted: 68, negotiation: 28, won: 38 },
    { region: 'Gujarat',       quoted: 54, negotiation: 42, won: 18 },
    { region: 'Chhattisgarh',  quoted: 42, negotiation: 18, won: 40 },
    { region: 'Odisha',        quoted: 36, negotiation: 26, won: 12 },
    { region: 'Karnataka',     quoted: 28, negotiation: 20, won: 16 },
    { region: 'Madhya Pradesh',quoted: 24, negotiation: 14, won: 10 },
    { region: 'Tamil Nadu',    quoted: 19, negotiation: 11, won: 9  },
    { region: 'Telangana',     quoted: 15, negotiation: 8,  won: 7  },
  ],

  productRevenue: [
    { label: 'PE — Jaw Crusher',  value: '₹82L', pct: 100 },
    { label: 'HP — Cone Crusher', value: '₹58L', pct: 71  },
    { label: 'VSI Crusher',       value: '₹42L', pct: 51  },
    { label: 'SO — Sand Optim.',  value: '₹27L', pct: 33  },
    { label: 'Screens',           value: '₹15L', pct: 18  },
    { label: 'Feeders',           value: '₹8L',  pct: 10  },
  ],

  deliveryRisk: [
    { woNo: 'WO-2026-058', customer: 'Dalmia Bharat', product: 'PE-900',  committedDate: 'Jun 10', currentStage: 'S3 Procurement',     severity: 'critical' },
    { woNo: 'WO-2026-074', customer: 'SAIL Bhilai',   product: 'VSI-900', committedDate: 'Jun 11', currentStage: 'S3, 4 days overdue', severity: 'critical' },
    { woNo: 'WO-2026-081', customer: 'UltraTech',     product: 'HP-200',  committedDate: 'Jun 14', currentStage: 'S6 Manufacturing',   severity: 'at-risk'  },
    { woNo: 'WO-2026-046', customer: 'Shree Cement',  product: 'PE-600',  committedDate: 'Jun 15', currentStage: 'S5 Stores',          severity: 'watch'    },
  ],
}
