import type { SplashScreenCondition } from '../data/prisonApiTypes'

// The NOMIS screens/modules that manage prisoner property. Blocking them for a caseload forces staff at
// that prison to use DPS instead — the NOMIS half of the DPS/NOMIS mutual-exclusivity rollout. They are
// always warned/blocked together; the first (OIDMPCON, property management) drives the state shown.
// OIUPROPE is the Deactivate Property Box admin screen.
export const NOMIS_PROPERTY_MODULES = ['OIDMPCON', 'OIUPROPE'] as const

// The screens as a readable list for admin-console messages, e.g. "OIDMPCON and OIUPROPE".
export const NOMIS_PROPERTY_MODULES_TEXT = NOMIS_PROPERTY_MODULES.join(' and ')

// We drive access per prison, so every condition we manage is a CASELOAD condition keyed by prison id.
export const CASELOAD_CONDITION = 'CASELOAD'

// The three states a prison's NOMIS property screen can be in, derived from its caseload condition:
// NORMAL = no condition, WARNING = condition with blockAccess=false, BLOCKED = blockAccess=true.
export type NomisScreenState = 'NORMAL' | 'WARNING' | 'BLOCKED'

export const NOMIS_STATE_LABELS: Record<NomisScreenState, string> = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  BLOCKED: 'Blocked',
}

export const isNomisScreenState = (value: unknown): value is NomisScreenState =>
  value === 'NORMAL' || value === 'WARNING' || value === 'BLOCKED'

/** Derive a prison's NOMIS property-screen state from the splash screen's caseload conditions. */
export const deriveNomisState = (conditions: SplashScreenCondition[], agencyId: string): NomisScreenState => {
  const condition = conditions.find(c => c.conditionType === CASELOAD_CONDITION && c.conditionValue === agencyId)
  if (!condition) return 'NORMAL'
  return condition.blockAccess ? 'BLOCKED' : 'WARNING'
}

/** The success-banner message shown after an admin moves a prison's NOMIS property screen to a state. */
export const nomisStateSuccessMessage = (name: string, state: NomisScreenState): string => {
  switch (state) {
    case 'BLOCKED':
      return `NOMIS property access is now blocked for ${name}.`
    case 'WARNING':
      return `A NOMIS property closure warning is now showing for ${name}.`
    default:
      return `NOMIS property access is back to normal for ${name}.`
  }
}

// Thrown when an admin tries to warn/block a caseload but one of the property splash screens has not
// been set up in NOMIS yet (the warning/blocked message text is configured manually first).
export class NomisScreenNotSetUpError extends Error {
  constructor(readonly moduleName: string) {
    super(`The NOMIS ${moduleName} splash screen has not been set up`)
    this.name = 'NomisScreenNotSetUpError'
  }
}
