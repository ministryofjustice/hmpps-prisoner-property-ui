import { Router } from 'express'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import requireAdminRole from '../../middleware/requireAdminRole'
import {
  isNomisScreenState,
  NOMIS_PROPERTY_MODULE,
  NomisScreenNotSetUpError,
  nomisStateSuccessMessage,
} from '../../utils/nomisSplash'

export default function adminPrisonsRoutes({
  auditService,
  prisonerPropertyService,
  prisonerService,
  activeAgenciesService,
}: Services): Router {
  const router = Router()

  // Admin console: switch the property service on/off per prison. Not caseload-scoped - it is a
  // national rollout control gated on the admin role.
  router.get('/admin/prisons', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    // The DPS active list drives one column; the NOMIS property-screen states (from prison-api) drive
    // the other. The NOMIS read degrades gracefully so a missing splash screen / role never 500s the page.
    const [agencies, nomisStates] = await Promise.all([
      prisonerPropertyService.getAllAgencies(username),
      prisonerService.getNomisScreenStates(username),
    ])
    const nomisScreenAvailable = nomisStates !== null

    const needle = search.toLowerCase()
    const filtered = (
      needle
        ? agencies.filter(
            agency => agency.name.toLowerCase().includes(needle) || agency.agencyId.toLowerCase().includes(needle),
          )
        : agencies
    ).map(agency => ({ ...agency, nomisState: nomisStates?.get(agency.agencyId) ?? 'NORMAL' }))

    await auditService.logPageView(Page.ADMIN_PRISONS, { who: username, correlationId: req.id })

    return res.render('pages/admin/prisons', {
      agencies: filtered,
      search,
      nomisScreenAvailable,
      nomisModule: NOMIS_PROPERTY_MODULE,
      activeCount: agencies.filter(agency => agency.active).length,
      totalCount: agencies.length,
      successMessage: req.flash('success')[0],
      errorMessage: req.flash('error')[0],
    })
  })

  router.post('/admin/prisons/:agencyId', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)
    const active = req.body.active === 'true'
    const name = typeof req.body.name === 'string' && req.body.name ? req.body.name : agencyId

    await prisonerPropertyService.setAgencyActive(agencyId, active, username)
    // Drop the cached active-prison set so this pod reflects the toggle immediately (other pods
    // converge on the TTL). Keeps the read-only gate in step with what the admin just changed.
    activeAgenciesService.invalidate()
    req.flash('success', `Property is now switched ${active ? 'on' : 'off'} for ${name}.`)

    const params = new URLSearchParams()
    if (typeof req.body.q === 'string' && req.body.q) params.set('q', req.body.q)
    const query = params.toString()
    return res.redirect(`/admin/prisons${query ? `?${query}` : ''}`)
  })

  // Control the legacy NOMIS property screen (OIDMPCON) for a prison: show a warning, block it, or
  // clear it. Independent of the DPS toggle above so the rollout steps stay explicit.
  router.post('/admin/prisons/:agencyId/nomis-screen', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)
    const name = typeof req.body.name === 'string' && req.body.name ? req.body.name : agencyId
    const { state } = req.body

    if (!isNomisScreenState(state)) {
      req.flash('error', 'Select a valid NOMIS property screen state.')
    } else {
      try {
        await prisonerService.setNomisScreenState(agencyId, state, username)
        req.flash('success', nomisStateSuccessMessage(name, state))
      } catch (error) {
        if (error instanceof NomisScreenNotSetUpError) {
          req.flash(
            'error',
            `The NOMIS ${NOMIS_PROPERTY_MODULE} splash screen has not been set up yet. Create it before changing prison access.`,
          )
        } else {
          throw error
        }
      }
    }

    const params = new URLSearchParams()
    if (typeof req.body.q === 'string' && req.body.q) params.set('q', req.body.q)
    const query = params.toString()
    return res.redirect(`/admin/prisons${query ? `?${query}` : ''}`)
  })

  return router
}
