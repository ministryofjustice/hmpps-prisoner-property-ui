import { Router } from 'express'

import type { Services } from '../../services'
import requireAdminRole from '../../middleware/requireAdminRole'
import type {
  AgencyStatus,
  CleanupCount,
  CleanupReason,
  LegacyCleanupItem,
  LegacyCleanupJob,
  LegacyCleanupPreview,
} from '../../data/prisonerPropertyApiTypes'

/** Human wording for why the preview left containers alone, keyed by the API's IneligibleReason. */
export const INELIGIBLE_REASON_LABELS: Record<string, string> = {
  CONFISCATED: 'Confiscated property',
  DISPOSAL_DATE_NOT_REACHED: 'The disposal date has not been reached',
  OWNER_HERE: 'The person is at this prison',
  TOO_RECENT: 'The person left less than 13 months ago',
  IN_TRANSIT: 'The person is in transit between prisons',
  UNRESOLVED: 'The person could not be found in prisoner search',
  NOT_RELEASED_MOVEMENT: 'The person is out, but not on a release',
  NO_MOVEMENT_DATE: 'Prisoner search has no date for the movement',
}

/**
 * Why the people whose property will be removed left, keyed by the API's CleanupReason, in the order the
 * preview lists them. Whatever the reason, the property is marked as removed.
 */
export const REMOVAL_REASON_LABELS: Record<CleanupReason, string> = {
  RELEASED: 'Released',
  DIED: 'Died in custody',
  ESCAPED: 'Escaped or absconded',
  TRANSFERRED: 'Now at another prison',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Queued',
  STARTED: 'In progress',
  FINISHED: 'Finished',
}

const NONE: CleanupCount = { containers: 0, prisoners: 0 }

const isInFlight = (job: LegacyCleanupJob) => job.status === 'PENDING' || job.status === 'STARTED'

export default function adminCleanupRoutes({ prisonerPropertyService }: Services): Router {
  const router = Router()

  const findAgency = async (agencyId: string, username: string): Promise<AgencyStatus> => {
    const agencies = await prisonerPropertyService.getAllAgencies(username)
    return agencies.find(agency => agency.agencyId === agencyId) ?? { agencyId, name: agencyId, active: false }
  }

  // The preview: what a run would close under the fixed 13-month retention rule, against what the tiles
  // currently show.
  router.get('/admin/prisons/:agencyId/cleanup', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)

    const [agency, jobs, preview] = await Promise.all([
      findAgency(agencyId, username),
      prisonerPropertyService.getLegacyCleanupJobs(agencyId, username),
      prisonerPropertyService.previewLegacyCleanup(agencyId, username),
    ])
    const inFlight = jobs.find(isInFlight)

    return res.render('pages/admin/cleanup/preview', {
      agency,
      preview: presentPreview(preview),
      inFlight,
      jobs: jobs.map(presentJob),
      successMessage: req.flash('success')[0],
      errorMessage: req.flash('error')[0],
    })
  })

  // Run it. 202 sends the admin to the job page, which refreshes itself until the run finishes; a 409
  // (someone else got there first) goes back to the preview with the reason.
  router.post('/admin/prisons/:agencyId/cleanup', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)

    try {
      const job = await prisonerPropertyService.startLegacyCleanup(agencyId, username)
      const name = typeof req.body.name === 'string' && req.body.name ? req.body.name : agencyId
      req.flash(
        'success',
        job.totalRecords === 0
          ? `There was nothing to clean up for ${name}.`
          : `Clean-up started for ${name}: ${job.totalRecords} containers queued.`,
      )
      return res.redirect(`/admin/prisons/${agencyId}/cleanup/jobs/${job.id}`)
    } catch (e) {
      if ((e as { responseStatus?: number }).responseStatus === 409) {
        req.flash(
          'error',
          'A clean-up is already running for this prison. Wait for it to finish before starting another.',
        )
        return res.redirect(`/admin/prisons/${agencyId}/cleanup`)
      }
      throw e
    }
  })

  // Progress. Reloads itself every five seconds while the job is queued or running - an inline script
  // with the CSP nonce rather than a meta refresh, which the accessibility checks reject.
  router.get('/admin/prisons/:agencyId/cleanup/jobs/:jobId', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)
    const jobId = String(req.params.jobId)

    const [agency, job] = await Promise.all([
      findAgency(agencyId, username),
      prisonerPropertyService.getLegacyCleanupJob(jobId, username),
    ])

    return res.render('pages/admin/cleanup/job', {
      agency,
      job: presentJob(job),
      inProgress: isInFlight(job),
      attention: (job.items ?? [])
        .filter(item => item.status === 'SKIPPED' || item.status === 'FAILED')
        .map(item => ({ ...item, actionLabel: actionLabel(item) })),
      successMessage: req.flash('success')[0],
    })
  })

  return router
}

// REMOVE since the 13-month rule; RETURN and TRANSFER only appear on jobs run before it.
const actionLabel = (item: LegacyCleanupItem): string => {
  if (item.action === 'REMOVE') return 'Remove'
  if (item.action === 'RETURN') return 'Return'
  return item.plannedToPrisonId ? `Transfer to ${item.plannedToPrisonId}` : 'Transfer'
}

const presentPreview = (preview: LegacyCleanupPreview) => ({
  ...preview,
  willClose: preview.toRemove.containers,
  reasonRows: (Object.keys(REMOVAL_REASON_LABELS) as CleanupReason[])
    .map(reason => ({ label: REMOVAL_REASON_LABELS[reason], ...(preview.toRemoveByReason[reason] ?? NONE) }))
    .filter(row => row.containers > 0),
  ineligibleRows: Object.entries(preview.ineligible)
    .filter(([, count]) => count && count.containers > 0)
    .map(([reason, count]) => ({ label: INELIGIBLE_REASON_LABELS[reason] ?? reason, ...count })),
})

// Jobs run before the 13-month rule marked property returned or transferred rather than removed, so "closed"
// counts all three.
const presentJob = (job: LegacyCleanupJob) => ({
  ...job,
  statusLabel: JOB_STATUS_LABELS[job.status] ?? job.status,
  percent: job.totalRecords === 0 ? 100 : Math.round((job.processedRecords / job.totalRecords) * 100),
  closedRecords: job.removedRecords + job.returnedRecords + job.transferredRecords,
})
