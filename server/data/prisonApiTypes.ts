// A caseload (or other) condition on a NOMIS splash screen. `blockAccess=false` shows the warning
// text and lets the user proceed; `blockAccess=true` blocks access and shows the blocked text.
export interface SplashScreenCondition {
  conditionType: string
  conditionValue: string
  blockAccess: boolean
}

// A NOMIS splash screen for a screen/module (e.g. OIDMPCON = property management). The warning/blocked
// text and `blockAccessType` (YES/NO/COND) are configured manually; this app only reads them and edits
// the per-caseload conditions.
export interface SplashScreen {
  moduleName: string
  warningText?: string
  blockedText?: string
  blockAccessType?: string
  conditions: SplashScreenCondition[]
}
