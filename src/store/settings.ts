import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AutonomyLevel, CURRENT_AUTONOMY_LEVEL } from '@/lib/autonomy'

export interface SettingsState {
  companyName: string
  supportEmail: string
  timezone: string
  smartRetries: boolean
  maxDiscountLimit: string
  dunningEmails: boolean
  autonomyLevel: AutonomyLevel
  alertHighValue: boolean
  alertDailyDigest: boolean
  alertAnomaly: boolean
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings'>>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      companyName: 'Acme Corp',
      supportEmail: 'support@acmecorp.com',
      timezone: 'utc',
      smartRetries: true,
      maxDiscountLimit: '15',
      dunningEmails: true,
      autonomyLevel: CURRENT_AUTONOMY_LEVEL,
      alertHighValue: true,
      alertDailyDigest: true,
      alertAnomaly: true,
      setSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'app-settings',
    }
  )
)
