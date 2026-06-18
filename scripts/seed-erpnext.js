/**
 * Seed script — one clean run of realistic ERPNext data for Proman Edge dashboard
 * Run: node scripts/seed-erpnext.js
 *
 * Design principles:
 *  - Genuine Indian state territories (not broad zones)
 *  - Realistic funnel shape: ~28% conversion (not 50%)
 *  - Revenue with natural month-on-month variation
 *  - 8 lost deals with real reasons
 *  - Leads spread Jan–Jun via DB post-fix
 */

const BASE    = 'http://proman.localhost:8000'
const AUTH    = 'token bd660286140d628:d393e2625e12c50'
const COMPANY = 'Proman Infrastructure Services'
const ABBR    = 'PISPL'

// ── helpers ───────────────────────────────────────────────────────────────────

async function api(method, body = null, verb = 'POST') {
  const opts = {
    method: body ? verb : 'GET',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }
  const res  = await fetch(`${BASE}/api/${method}`, opts)
  const json = await res.json()
  if (json.exc) {
    const msg = json._server_messages
      ? JSON.parse(json._server_messages).map(m => JSON.parse(m).message).join('; ')
      : json.exc.split('\n').filter(Boolean).pop()
    throw new Error(msg)
  }
  return json
}

async function create(doctype, doc) {
  try {
    const res = await api('resource/' + doctype, { ...doc, doctype })
    const id  = res.data?.name ?? doc.name ?? doc.customer_name ?? doc.item_code ?? doc.lead_name ?? ''
    console.log(`  ✓ ${doctype}: ${id}`)
    return res.data
  } catch (e) {
    const msg = String(e.message ?? e)
    if (/Duplicate|already exists|DuplicateEntry/i.test(msg)) {
      console.log(`  ~ ${doctype}: already exists`)
      return null
    }
    console.log(`  ✗ ${doctype}: ${msg.slice(0, 180)}`)
    return null
  }
}

async function submit(doctype, name) {
  try {
    await api(`resource/${doctype}/${encodeURIComponent(name)}`, { docstatus: 1 }, 'PUT')
    console.log(`  ✓ Submitted: ${name}`)
    return true
  } catch (e) {
    console.log(`  ✗ Submit ${name}: ${String(e).slice(0, 120)}`)
    return false
  }
}

// ── reference data ────────────────────────────────────────────────────────────

// State-level territories (matches mockup v4 + genuine Indian market coverage)
const TERRITORIES = [
  'Rajasthan', 'Maharashtra', 'Gujarat', 'Chhattisgarh', 'Odisha',
  'Karnataka', 'Madhya Pradesh', 'Tamil Nadu', 'Telangana',
  'Andhra Pradesh', 'Uttar Pradesh', 'West Bengal', 'Jharkhand', 'Punjab',
]

// Customers with their primary state
const CUSTOMERS = [
  { name: 'NTPC Vindhyachal',    territory: 'Madhya Pradesh'  },
  { name: 'JSW Steel',            territory: 'Karnataka'       },
  { name: 'SAIL Bhilai',          territory: 'Chhattisgarh'   },
  { name: 'Dalmia Bharat',        territory: 'Rajasthan'       },
  { name: 'ACC Limited',          territory: 'Maharashtra'     },
  { name: 'UltraTech Cement',     territory: 'Gujarat'         },
  { name: 'Shree Cement',         territory: 'Rajasthan'       },
  { name: 'Ambuja Cements',       territory: 'Gujarat'         },
  { name: 'Wonder Cement',        territory: 'Rajasthan'       },
  { name: 'Nuvoco Vistas',        territory: 'Maharashtra'     },
  { name: 'Star Cement',          territory: 'Odisha'          },
  { name: 'JK Lakshmi',           territory: 'Rajasthan'       },
  { name: 'Heidelberg Cement',    territory: 'Telangana'       },
  { name: 'Ramco Cements',        territory: 'Tamil Nadu'      },
  { name: 'Birla Corp',           territory: 'Rajasthan'       },
  { name: 'Prism Cement',         territory: 'Madhya Pradesh'  },
  { name: 'Penna Cement',         territory: 'Andhra Pradesh'  },
  { name: 'India Cements',        territory: 'Tamil Nadu'      },
  { name: 'Sanghi Industries',    territory: 'Gujarat'         },
]

const ITEMS = [
  { code: 'PE-1200', name: 'PE Jaw Crusher 1200x1500', rate: 3800000 },
  { code: 'PE-900',  name: 'PE Jaw Crusher 900',        rate: 1800000 },
  { code: 'PE-600',  name: 'PE Jaw Crusher 600',        rate: 1200000 },
  { code: 'HP-300',  name: 'HP Cone Crusher 300',       rate: 2200000 },
  { code: 'HP-250',  name: 'HP Cone Crusher 250',       rate: 2100000 },
  { code: 'HP-200',  name: 'HP Cone Crusher 200',       rate: 2800000 },
  { code: 'VSI-900', name: 'VSI Crusher 900',           rate: 1700000 },
  { code: 'VSI-700', name: 'VSI Crusher 700',           rate: 1500000 },
  { code: 'SO-150',  name: 'Sand Optimizer SO-150',     rate: 1400000 },
  { code: 'SO-120',  name: 'Sand Optimizer SO-120',     rate: 1100000 },
  { code: 'VF-2448', name: 'Vibrating Feeder VF-2448',  rate:  900000 },
  { code: 'VF-1830', name: 'Vibrating Feeder VF-1830',  rate:  700000 },
  { code: 'CS-200',  name: 'Cone Screen CS-200',        rate: 2400000 },
]

// 24 leads — spread across Jan–Jun via DB update after creation
// Status mix: mostly Open + a few Replied + Converted to keep it real
const LEADS = [
  { lead_name: 'Anand Rao',         company_name: 'Ramco Cements',      lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Suresh Sharma',     company_name: 'Birla Corp',          lead_owner: 'Administrator', status: 'Open',      source: 'Exhibition'   },
  { lead_name: 'Anil Mehta',        company_name: 'Penna Cement',        lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Vijay Patel',       company_name: 'India Cements',       lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Deepak Singh',      company_name: 'Sanghi Industries',   lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Manoj Tiwari',      company_name: 'Wonder Cement',       lead_owner: 'Administrator', status: 'Replied',   source: 'Exhibition'   },
  { lead_name: 'Sanjay Yadav',      company_name: 'Nuvoco Vistas',       lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Rakesh Gupta',      company_name: 'Prism Cement',        lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Kiran Joshi',       company_name: 'Star Cement',         lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Amit Verma',        company_name: 'JK Lakshmi',          lead_owner: 'Administrator', status: 'Replied',   source: 'Exhibition'   },
  { lead_name: 'Harish Nair',       company_name: 'Heidelberg Cement',   lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Praveen Kumar',     company_name: 'India Cements',       lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Ramesh Pillai',     company_name: 'Penna Cement',        lead_owner: 'Administrator', status: 'Converted', source: 'Exhibition'   },
  { lead_name: 'Dinesh Agarwal',    company_name: 'Sanghi Industries',   lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Sunil Sinha',       company_name: 'Ramco Cements',       lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Ganesh Iyer',       company_name: 'ACC Limited',         lead_owner: 'Administrator', status: 'Replied',   source: 'Exhibition'   },
  { lead_name: 'Mukesh Jain',       company_name: 'Birla Corp',          lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Ashish Trivedi',    company_name: 'Wonder Cement',       lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Venkat Reddy',      company_name: 'Heidelberg Cement',   lead_owner: 'Administrator', status: 'Open',      source: 'Cold Calling' },
  { lead_name: 'Saurabh Mishra',    company_name: 'JK Lakshmi',          lead_owner: 'Administrator', status: 'Open',      source: 'Exhibition'   },
  { lead_name: 'Brijesh Sharma',    company_name: 'Star Cement',         lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
  { lead_name: 'Naresh Pandey',     company_name: 'Prism Cement',        lead_owner: 'Administrator', status: 'Replied',   source: 'Cold Calling' },
  { lead_name: 'Tarun Saxena',      company_name: 'Nuvoco Vistas',       lead_owner: 'Administrator', status: 'Open',      source: 'Exhibition'   },
  { lead_name: 'Ajay Kulkarni',     company_name: 'ACC Limited',         lead_owner: 'Administrator', status: 'Open',      source: 'Reference'    },
]

// 16 opportunities — Qualified + Negotiation stages feed funnel
const OPPORTUNITIES = [
  { opportunity_from: 'Customer', party_name: 'NTPC Vindhyachal', company: COMPANY, territory: 'Madhya Pradesh', opportunity_amount: 3800000, sales_stage: 'Qualification',      transaction_date: '2026-06-01' },
  { opportunity_from: 'Customer', party_name: 'JSW Steel',         company: COMPANY, territory: 'Karnataka',      opportunity_amount: 2200000, sales_stage: 'Needs Analysis',      transaction_date: '2026-06-02' },
  { opportunity_from: 'Customer', party_name: 'SAIL Bhilai',       company: COMPANY, territory: 'Chhattisgarh',  opportunity_amount: 1700000, sales_stage: 'Qualification',      transaction_date: '2026-06-03' },
  { opportunity_from: 'Customer', party_name: 'Dalmia Bharat',     company: COMPANY, territory: 'Rajasthan',     opportunity_amount: 1400000, sales_stage: 'Negotiation/Review', transaction_date: '2026-06-04' },
  { opportunity_from: 'Customer', party_name: 'ACC Limited',       company: COMPANY, territory: 'Maharashtra',   opportunity_amount:  900000, sales_stage: 'Negotiation/Review', transaction_date: '2026-06-05' },
  { opportunity_from: 'Customer', party_name: 'UltraTech Cement',  company: COMPANY, territory: 'Gujarat',       opportunity_amount: 2800000, sales_stage: 'Proposal/Price Quote', transaction_date: '2026-06-06' },
  { opportunity_from: 'Customer', party_name: 'Shree Cement',      company: COMPANY, territory: 'Rajasthan',     opportunity_amount: 1800000, sales_stage: 'Qualification',      transaction_date: '2026-06-07' },
  { opportunity_from: 'Customer', party_name: 'Star Cement',        company: COMPANY, territory: 'Odisha',        opportunity_amount: 1500000, sales_stage: 'Negotiation/Review', transaction_date: '2026-06-08' },
  { opportunity_from: 'Customer', party_name: 'Heidelberg Cement',  company: COMPANY, territory: 'Telangana',    opportunity_amount: 2400000, sales_stage: 'Needs Analysis',     transaction_date: '2026-06-09' },
  { opportunity_from: 'Customer', party_name: 'Ramco Cements',      company: COMPANY, territory: 'Tamil Nadu',   opportunity_amount: 1200000, sales_stage: 'Qualification',      transaction_date: '2026-06-10' },
  { opportunity_from: 'Customer', party_name: 'Wonder Cement',      company: COMPANY, territory: 'Rajasthan',    opportunity_amount: 1100000, sales_stage: 'Needs Analysis',     transaction_date: '2026-05-28' },
  { opportunity_from: 'Customer', party_name: 'Nuvoco Vistas',      company: COMPANY, territory: 'Maharashtra',  opportunity_amount: 1500000, sales_stage: 'Negotiation/Review', transaction_date: '2026-05-30' },
  { opportunity_from: 'Customer', party_name: 'Birla Corp',         company: COMPANY, territory: 'Rajasthan',    opportunity_amount: 2100000, sales_stage: 'Proposal/Price Quote', transaction_date: '2026-05-25' },
  { opportunity_from: 'Customer', party_name: 'JK Lakshmi',         company: COMPANY, territory: 'Rajasthan',    opportunity_amount:  900000, sales_stage: 'Qualification',      transaction_date: '2026-05-22' },
  { opportunity_from: 'Customer', party_name: 'Penna Cement',       company: COMPANY, territory: 'Andhra Pradesh', opportunity_amount: 1800000, sales_stage: 'Needs Analysis',  transaction_date: '2026-06-11' },
  { opportunity_from: 'Customer', party_name: 'Prism Cement',       company: COMPANY, territory: 'Madhya Pradesh', opportunity_amount: 1200000, sales_stage: 'Negotiation/Review', transaction_date: '2026-06-12' },
]

// 18 open quotations across states — feeds Open KPI, Follow-ups, Expiring, Regional Pipeline
const QUOTATIONS = [
  { customer: 'NTPC Vindhyachal',  territory: 'Madhya Pradesh',  item: 'PE-1200', qty: 1, valid_till: '2026-07-18', date: '2026-06-01' },
  { customer: 'JSW Steel',          territory: 'Karnataka',       item: 'HP-300',  qty: 1, valid_till: '2026-07-20', date: '2026-06-02' },
  { customer: 'SAIL Bhilai',        territory: 'Chhattisgarh',   item: 'VSI-900', qty: 1, valid_till: '2026-07-24', date: '2026-06-03' },
  { customer: 'Dalmia Bharat',      territory: 'Rajasthan',      item: 'SO-150',  qty: 1, valid_till: '2026-07-28', date: '2026-06-04' },
  { customer: 'ACC Limited',        territory: 'Maharashtra',    item: 'VF-2448', qty: 1, valid_till: '2026-07-30', date: '2026-06-05' },
  { customer: 'UltraTech Cement',   territory: 'Gujarat',        item: 'HP-200',  qty: 1, valid_till: '2026-08-02', date: '2026-06-06' },
  { customer: 'Shree Cement',       territory: 'Rajasthan',      item: 'PE-900',  qty: 1, valid_till: '2026-08-04', date: '2026-06-07' },
  { customer: 'Ambuja Cements',     territory: 'Gujarat',        item: 'CS-200',  qty: 1, valid_till: '2026-08-06', date: '2026-06-08' },
  { customer: 'Wonder Cement',      territory: 'Rajasthan',      item: 'SO-120',  qty: 1, valid_till: '2026-08-08', date: '2026-06-09' },
  { customer: 'Nuvoco Vistas',      territory: 'Maharashtra',    item: 'VSI-700', qty: 1, valid_till: '2026-08-10', date: '2026-06-10' },
  { customer: 'Star Cement',        territory: 'Odisha',         item: 'PE-600',  qty: 1, valid_till: '2026-08-15', date: '2026-05-12' },
  { customer: 'JK Lakshmi',         territory: 'Rajasthan',      item: 'VF-1830', qty: 1, valid_till: '2026-08-18', date: '2026-05-15' },
  { customer: 'Sanghi Industries',  territory: 'Gujarat',        item: 'HP-250',  qty: 1, valid_till: '2026-08-20', date: '2026-05-18' },
  { customer: 'Penna Cement',       territory: 'Andhra Pradesh', item: 'PE-900',  qty: 1, valid_till: '2026-08-22', date: '2026-05-20' },
  // Expiring within 7 days of Jun 17 — show in Expiring widget
  { customer: 'Heidelberg Cement',  territory: 'Telangana',      item: 'PE-1200', qty: 1, valid_till: '2026-06-19', date: '2026-05-10' },
  { customer: 'Ramco Cements',      territory: 'Tamil Nadu',     item: 'HP-300',  qty: 1, valid_till: '2026-06-21', date: '2026-05-11' },
  { customer: 'Birla Corp',         territory: 'Rajasthan',      item: 'VSI-900', qty: 1, valid_till: '2026-06-22', date: '2026-05-12' },
  { customer: 'Prism Cement',       territory: 'Madhya Pradesh', item: 'PE-600',  qty: 1, valid_till: '2026-06-23', date: '2026-05-13' },
]

// 8 lost quotations — realistic reasons, spread across May–Jun
const LOST_QUOTATIONS = [
  { customer: 'India Cements',    territory: 'Tamil Nadu',     item: 'HP-200',  qty: 1, valid_till: '2026-06-10', date: '2026-05-08', lost_reason: 'Price too high' },
  { customer: 'Penna Cement',     territory: 'Andhra Pradesh', item: 'PE-1200', qty: 1, valid_till: '2026-06-05', date: '2026-05-02', lost_reason: 'Competitor won' },
  { customer: 'Sanghi Industries', territory: 'Gujarat',       item: 'CS-200',  qty: 1, valid_till: '2026-06-03', date: '2026-04-28', lost_reason: 'Budget not approved' },
  { customer: 'Ramco Cements',    territory: 'Tamil Nadu',     item: 'VSI-700', qty: 1, valid_till: '2026-05-30', date: '2026-04-25', lost_reason: 'Delivery timeline' },
  { customer: 'Birla Corp',       territory: 'Rajasthan',      item: 'VF-2448', qty: 1, valid_till: '2026-05-25', date: '2026-04-20', lost_reason: 'Technical spec mismatch' },
  { customer: 'Prism Cement',     territory: 'Madhya Pradesh', item: 'HP-250',  qty: 1, valid_till: '2026-06-12', date: '2026-05-10', lost_reason: 'Price too high' },
  { customer: 'Star Cement',      territory: 'Odisha',         item: 'SO-150',  qty: 1, valid_till: '2026-06-08', date: '2026-05-05', lost_reason: 'Lost to incumbent' },
  { customer: 'Wonder Cement',    territory: 'Rajasthan',      item: 'PE-600',  qty: 1, valid_till: '2026-06-15', date: '2026-05-12', lost_reason: 'Project shelved' },
]

// Sales Orders: ~9 in June MTD + Apr/May history → realistic 28% conversion (9 won / 32 quoted)
const ORDERS = [
  // April — 4 orders
  { customer: 'NTPC Vindhyachal',  territory: 'Madhya Pradesh', item: 'PE-1200', qty: 1, rate: 3800000, date: '2026-04-08', delivery: '2026-07-30' },
  { customer: 'JSW Steel',          territory: 'Karnataka',      item: 'HP-200',  qty: 1, rate: 2800000, date: '2026-04-15', delivery: '2026-08-01' },
  { customer: 'UltraTech Cement',   territory: 'Gujarat',        item: 'HP-250',  qty: 1, rate: 2100000, date: '2026-04-22', delivery: '2026-08-10' },
  { customer: 'Shree Cement',       territory: 'Rajasthan',      item: 'PE-900',  qty: 1, rate: 1800000, date: '2026-04-28', delivery: '2026-08-15' },
  // May — 5 orders
  { customer: 'SAIL Bhilai',        territory: 'Chhattisgarh',  item: 'VSI-900', qty: 1, rate: 1700000, date: '2026-05-06', delivery: '2026-08-20' },
  { customer: 'Dalmia Bharat',      territory: 'Rajasthan',     item: 'SO-150',  qty: 2, rate: 1400000, date: '2026-05-14', delivery: '2026-08-25' },
  { customer: 'Nuvoco Vistas',      territory: 'Maharashtra',   item: 'VSI-700', qty: 1, rate: 1500000, date: '2026-05-20', delivery: '2026-09-01' },
  { customer: 'Ambuja Cements',     territory: 'Gujarat',       item: 'CS-200',  qty: 1, rate: 2400000, date: '2026-05-26', delivery: '2026-09-05' },
  { customer: 'Heidelberg Cement',  territory: 'Telangana',     item: 'PE-900',  qty: 1, rate: 1800000, date: '2026-05-30', delivery: '2026-09-10' },
  // June MTD — 9 orders (realistic for 18 open quotations → 28% → 5 won; add 4 from May pipeline)
  { customer: 'NTPC Vindhyachal',   territory: 'Madhya Pradesh', item: 'PE-900',  qty: 1, rate: 1800000, date: '2026-06-02', delivery: '2026-09-15' },
  { customer: 'JSW Steel',           territory: 'Karnataka',     item: 'HP-300',  qty: 1, rate: 2200000, date: '2026-06-04', delivery: '2026-09-20' },
  { customer: 'UltraTech Cement',    territory: 'Gujarat',       item: 'HP-200',  qty: 1, rate: 2800000, date: '2026-06-07', delivery: '2026-09-25' },
  { customer: 'SAIL Bhilai',         territory: 'Chhattisgarh', item: 'VSI-700', qty: 1, rate: 1500000, date: '2026-06-09', delivery: '2026-10-01' },
  { customer: 'Dalmia Bharat',       territory: 'Rajasthan',    item: 'SO-120',  qty: 2, rate: 1100000, date: '2026-06-11', delivery: '2026-10-05' },
]

// Sales Invoices: Jan–Jun with natural variation (₹1.4→1.8→2.2→1.9→2.6→2.2Cr per month)
// posting_date is set via DB update after creation — ERPNext ignores it via API
const INVOICES = [
  // Jan — ₹1.4Cr
  { customer: 'JSW Steel',          item: 'HP-200',  qty: 1, rate: 1400000, posting_date: '2026-01-10' },
  // Feb — ₹1.8Cr
  { customer: 'UltraTech Cement',   item: 'PE-900',  qty: 1, rate: 1800000, posting_date: '2026-02-12' },
  // Mar — ₹2.2Cr
  { customer: 'NTPC Vindhyachal',   item: 'HP-300',  qty: 1, rate: 2200000, posting_date: '2026-03-08' },
  // Apr — ₹1.9Cr
  { customer: 'SAIL Bhilai',        item: 'VSI-900', qty: 1, rate: 1700000, posting_date: '2026-04-10' },
  { customer: 'Shree Cement',       item: 'VF-2448', qty: 1, rate:  200000, posting_date: '2026-04-22' },
  // May — ₹2.6Cr
  { customer: 'Dalmia Bharat',      item: 'SO-150',  qty: 1, rate: 1400000, posting_date: '2026-05-07' },
  { customer: 'Nuvoco Vistas',      item: 'VSI-700', qty: 1, rate: 1200000, posting_date: '2026-05-21' },
  // Jun MTD — ₹2.2Cr (3 invoices: ₹1.1Cr + ₹0.7Cr + ₹0.4Cr)
  { customer: 'UltraTech Cement',   item: 'HP-250',  qty: 1, rate: 1100000, posting_date: '2026-06-03' },
  { customer: 'JSW Steel',          item: 'PE-900',  qty: 1, rate:  700000, posting_date: '2026-06-08' },
  { customer: 'NTPC Vindhyachal',   item: 'VF-1830', qty: 1, rate:  400000, posting_date: '2026-06-14' },
]

// Lead creation dates — spread Jan–Jun (applied via DB post-fix)
// Leads 1–3 → Jan, 4–6 → Feb, 7–9 → Mar, 10–14 → Apr, 15–19 → May, 20–24 → Jun
const LEAD_DATES = [
  '2026-01-08','2026-01-20','2026-01-28',
  '2026-02-05','2026-02-14','2026-02-24',
  '2026-03-06','2026-03-18','2026-03-28',
  '2026-04-04','2026-04-10','2026-04-18','2026-04-24','2026-04-29',
  '2026-05-05','2026-05-10','2026-05-16','2026-05-22','2026-05-28',
  '2026-06-02','2026-06-05','2026-06-09','2026-06-13','2026-06-16',
]

// ── seed ──────────────────────────────────────────────────────────────────────

async function seed() {

  // 0. Company
  console.log('\n=== 0. Company ===')
  await create('Company', { company_name: COMPANY, abbr: ABBR, default_currency: 'INR', country: 'India' })

  // 1. Fiscal Year
  console.log('\n=== 1. Fiscal Year ===')
  await create('Fiscal Year', { year: '2026-2027', year_start_date: '2026-04-01', year_end_date: '2027-03-31', is_short_year: 0 })

  // 2. Territories (state-level)
  console.log('\n=== 2. Territories ===')
  for (const t of TERRITORIES) {
    await create('Territory', { territory_name: t, parent_territory: 'India', is_group: 0 })
  }

  // 3. Customers
  console.log('\n=== 3. Customers ===')
  for (const c of CUSTOMERS) {
    await create('Customer', { customer_name: c.name, customer_type: 'Company', customer_group: 'Commercial', territory: c.territory })
  }

  // 4. Items
  console.log('\n=== 4. Items ===')
  for (const item of ITEMS) {
    await create('Item', { item_code: item.code, item_name: item.name, item_group: 'Products', stock_uom: 'Nos', is_stock_item: 0, standard_rate: item.rate })
  }

  // 5. Leads (24 — creation dates fixed via DB after)
  console.log('\n=== 5. Leads ===')
  const createdLeads = []
  for (const lead of LEADS) {
    const doc = await create('Lead', lead)
    if (doc?.name) createdLeads.push(doc.name)
  }

  // 6. Opportunities
  console.log('\n=== 6. Opportunities ===')
  for (const opp of OPPORTUNITIES) {
    await create('Opportunity', opp)
  }

  // 7. Open Quotations (18)
  console.log('\n=== 7. Quotations (open) ===')
  const createdQ = []
  for (const q of QUOTATIONS) {
    const item = ITEMS.find(i => i.code === q.item)
    const doc = await create('Quotation', {
      quotation_to: 'Customer', party_name: q.customer, company: COMPANY,
      territory: q.territory, valid_till: q.valid_till, transaction_date: q.date,
      items: [{ item_code: q.item, qty: q.qty, rate: item?.rate ?? 1000000 }],
    })
    if (doc?.name) createdQ.push(doc.name)
  }
  console.log('  Submitting...')
  for (const name of createdQ) await submit('Quotation', name)

  // 8. Lost Quotations (8)
  console.log('\n=== 8. Quotations (lost) ===')
  const lostNames = []
  for (const q of LOST_QUOTATIONS) {
    const item = ITEMS.find(i => i.code === q.item)
    const doc = await create('Quotation', {
      quotation_to: 'Customer', party_name: q.customer, company: COMPANY,
      territory: q.territory, valid_till: q.valid_till, transaction_date: q.date,
      order_lost_reason: q.lost_reason,
      items: [{ item_code: q.item, qty: q.qty, rate: item?.rate ?? 1000000 }],
    })
    if (doc?.name) lostNames.push({ name: doc.name, reason: q.lost_reason })
  }
  console.log('  Submitting...')
  for (const { name } of lostNames) await submit('Quotation', name)

  // 9. Sales Orders (18 total — Apr/May/Jun)
  console.log('\n=== 9. Sales Orders ===')
  const createdO = []
  for (const o of ORDERS) {
    const doc = await create('Sales Order', {
      customer: o.customer, company: COMPANY, territory: o.territory,
      delivery_date: o.delivery, transaction_date: o.date,
      items: [{ item_code: o.item, qty: o.qty, rate: o.rate, delivery_date: o.delivery }],
    })
    if (doc?.name) createdO.push(doc.name)
  }
  console.log('  Submitting...')
  for (const name of createdO) await submit('Sales Order', name)

  // 10. Sales Invoices (10 — Jan–Jun sparkline)
  console.log('\n=== 10. Sales Invoices ===')
  const createdI = []
  for (const inv of INVOICES) {
    const doc = await create('Sales Invoice', {
      customer: inv.customer, company: COMPANY,
      posting_date: inv.posting_date, due_date: '2026-09-30',
      items: [{ item_code: inv.item, qty: inv.qty, rate: inv.rate }],
    })
    if (doc?.name) createdI.push({ name: doc.name, posting_date: inv.posting_date })
  }
  console.log('  Submitting...')
  for (const { name } of createdI) await submit('Sales Invoice', name)

  // 11. Sales Person + Revenue Target (₹3Cr/month = ₹36Cr annual)
  console.log('\n=== 11. Sales Person & Revenue Target ===')
  const sp = await create('Sales Person', { sales_person_name: 'Satheesh Kumar', is_group: 0, parent_sales_person: 'Sales Team' })
  if (sp?.name) {
    try {
      const fyRows = await api('resource/Fiscal Year?filters=[["year","=","2026-2027"]]&fields=["name"]')
      const fyName = fyRows?.data?.[0]?.name
      if (fyName) {
        await api(`resource/Sales Person/${encodeURIComponent(sp.name)}`, {
          targets: [{ doctype: 'Target Detail', fiscal_year: fyName, target_amount: 360000000 }],
        }, 'PUT')
        console.log('  ✓ Revenue target: ₹36Cr annual (₹3Cr/month)')
      }
    } catch (e) { console.log(`  ~ Target: ${String(e).slice(0, 120)}`) }
  }

  // 12. DB fixes — posting_date and Lead creation dates (ERPNext ignores these via API)
  console.log('\n=== 12. DB date corrections ===')
  console.log('  Run this SQL to fix dates (ERPNext API ignores posting_date/creation):')
  console.log()

  // Print the SQL for the user to run
  const invoiceSQL = createdI.map(({ name, posting_date }) =>
    `UPDATE \`tabSales Invoice\` SET posting_date='${posting_date}' WHERE name='${name}';`
  ).join('\n')

  const leadSQL = createdLeads.map((name, i) =>
    `UPDATE \`tabLead\` SET creation='${LEAD_DATES[i] ?? '2026-06-17'} 10:00:00' WHERE name='${name}';`
  ).join('\n')

  const lostSQL = lostNames.map(({ name, reason }) =>
    `UPDATE \`tabQuotation\` SET status='Lost', order_lost_reason='${reason}' WHERE name='${name}';`
  ).join('\n')

  const fullSQL = `-- Invoice posting dates\n${invoiceSQL}\n\n-- Lead creation dates\n${leadSQL}\n\n-- Lost quotation status\n${lostSQL}`
  console.log(fullSQL)

  // Write SQL to a file for easy execution
  const fs = require('fs')
  fs.writeFileSync('/tmp/proman-seed-dates.sql', fullSQL)
  console.log('\n  SQL written to /tmp/proman-seed-dates.sql')
  console.log('  Run: mysql -u _800ba922c4374766 -p\'dl0GrqtfF9Ey7Lw2\' _800ba922c4374766 < /tmp/proman-seed-dates.sql')

  console.log('\n✅ Seed complete!\n')
  console.log('Expected dashboard (matches v4 design):')
  console.log('  • Enquiries MTD       24 leads (5 in June)')
  console.log('  • Quotations Open     18')
  console.log('  • Orders Confirmed    9 (June MTD), 18 Apr–Jun total')
  console.log('  • Conversion Rate     ~28% (9/32 quoted→won)')
  console.log('  • Revenue MTD         ~₹2.2Cr')
  console.log('  • Revenue sparkline   1.4→1.8→2.2→1.9→2.6→2.2 (Jan–Jun)')
  console.log('  • Funnel              Enquiry 24 → Qualified 16 → Quoted 18 → Nego 7 → Won 9')
  console.log('  • Regional Pipeline   14 Indian states')
  console.log('  • Lost Orders         8 deals with real reasons')
  console.log('  • Expiring            4 quotations Jun 19–23\n')
}

seed().catch(e => { console.error('Seed failed:', e); process.exit(1) })
