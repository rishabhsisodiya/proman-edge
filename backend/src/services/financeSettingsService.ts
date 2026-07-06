import fs from 'fs'
import path from 'path'

const SETTINGS_FILE = path.resolve(__dirname, '../../data/finance_settings.json')

export interface EntitySetting {
  default: number
  byEntity: Record<string, number>
}

export interface FinanceSettings {
  grossMarginTargetPct: EntitySetting
}

const DEFAULTS: FinanceSettings = {
  // 24% per Shivam — fixed target across all instances until overridden per entity below.
  grossMarginTargetPct: { default: 24, byEntity: {} },
}

export function readFinanceSettings(): FinanceSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return DEFAULTS
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return { ...DEFAULTS, ...raw, grossMarginTargetPct: { ...DEFAULTS.grossMarginTargetPct, ...raw.grossMarginTargetPct } }
  } catch {
    return DEFAULTS
  }
}

export function writeFinanceSettings(settings: FinanceSettings): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  const tmp = SETTINGS_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  fs.renameSync(tmp, SETTINGS_FILE)
}

export function getGmTargetPct(company: string): number {
  const s = readFinanceSettings().grossMarginTargetPct
  return s.byEntity[company] ?? s.default
}

// entity = null updates the default (applies to any entity without its own override)
export function setGmTargetPct(entity: string | null, value: number): FinanceSettings {
  const settings = readFinanceSettings()
  if (entity === null) {
    settings.grossMarginTargetPct.default = value
  } else {
    settings.grossMarginTargetPct.byEntity[entity] = value
  }
  writeFinanceSettings(settings)
  return settings
}

export function clearGmTargetPctOverride(entity: string): FinanceSettings {
  const settings = readFinanceSettings()
  delete settings.grossMarginTargetPct.byEntity[entity]
  writeFinanceSettings(settings)
  return settings
}
