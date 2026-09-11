import { Router } from 'express'

import type { Services } from '../../services'
import requireAdminRole from '../../middleware/requireAdminRole'
import type { AgencyStatus, LegacyCleanupJob, LegacyCleanupPreview } from '../../data/prisonerPropertyApiTypes'

export const DEFAULT_OLDER_THAN_DAYS = 28
const MIN_OLDER_THAN_DAYS = 1
const MAX_OLDER_THAN_DAYS = 3650

/** Human wording for why the preview left containers alone, keyed by the API's IneligibleReason. */
export const INELIGIBLE_REASON_LABELS: Record<string, string> = {
  OWNER_HERE: 'The person is at this prison',
  TOO_RECENT: 'The person left within the window',
  IN_TRANSIT: 'The person is in transit between prisons',
  UNRESOLVED: 'The person could not be found in prisoner search',
  NOT_RELEASED_MOVEMENT: 'The person is out, but not on a release',
  NO_MOVEMENT_DATE: 'Prisoner search has no date for the movement',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Queued',
  STARTED: 'In progress',
  FINISHED: 'Finished',
}

/**
 * Parse the look-back window from a query string or form body: a whole number of days, defaulting when
 * absent. Returns the error message instead of a value when it is present but unusable, so the page can
 * show it against the field rather than silently falling back.
 */
export const parseOlderThanDays = (raw: unknown): { value: number; error?: string } => {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: DEFAULT_OLDER_THAN_DAYS }
  }
  const text = String(raw).trim()
  const value = Number(text)
  if (!/^\d+$/.test(text) || !Number.isInteger(value) || value < MIN_OLDER_THAN_DAYS || value > MAX_OLDER_THAN_DAYS) {
    return {
      value: DEFAULT_OLDER_THAN_DAYS,
      error: `Enter a whole number of days between ${MIN_OLDER_THAN_DAYS} and ${MAX_OLDER_THAN_DAYS}`,
    }
  }
  return { value }
}

const isInFlight = (job: LegacyCleanupJob) => job.status === 'PENDING' || job.status === 'STARTED'

export default function adminCleanupRoutes({ prisonerPropertyService }: Services): Router {
  const router = Router()

  const findAgency = async (agencyId: string, username: string): Promise<AgencyStatus> => {
    const agencies = await prisonerPropertyService.getAllAgencies(username)
    return agencies.find(agency => agency.agencyId === agencyId) ?? { agencyId, name: agencyId, active: false }
  }

  // The preview: what a run with this window would close, against what the tiles currently show. Changing
  // the window re-submits as a GET so the URL stays shareable and the back button behaves.
  router.get('/admin/prisons/:agencyId/cleanup', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)
    const { value: olderThanDays, error } = parseOlderThanDays(req.query.olderThanDays)

    const [agency, jobs, preview] = await Promise.all([
      findAgency(agencyId, username),
      prisonerPropertyService.getLegacyCleanupJobs(agencyId, username),
      error ? Promise.resolve(null) : prisonerPropertyService.previewLegacyCleanup(agencyId, olderThanDays, username),
    ])
    const inFlight = jobs.find(isInFlight)

    return res.status(error ? 400 : 200).render('pages/admin/cleanup/preview', {
      agency,
      olderThanDays: error ? String(req.query.olderThanDays) : olderThanDays,
      errors: error ? { olderThanDays: error } : {},
      preview: preview && presentPreview(preview),
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
    const { value: olderThanDays, error } = parseOlderThanDays(req.body.olderThanDays)
    if (error) {
      req.flash('error', error)
      return res.redirect(`/admin/prisons/${agencyId}/cleanup`)
    }

    try {
      const job = await prisonerPropertyService.startLegacyCleanup(agencyId, olderThanDays, username)
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
        return res.redirect(`/admin/prisons/${agencyId}/cleanup?olderThanDays=${olderThanDays}`)
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
      attention: (job.items ?? []).filter(item => item.status === 'SKIPPED' || item.status === 'FAILED'),
      successMessage: req.flash('success')[0],
    })
  })

  return router
}

const presentPreview = (preview: LegacyCleanupPreview) => ({
  ...preview,
  willClose: preview.toReturn.containers + preview.toTransfer.containers,
  ineligibleRows: Object.entries(preview.ineligible)
    .filter(([, count]) => count && count.containers > 0)
    .map(([reason, count]) => ({ label: INELIGIBLE_REASON_LABELS[reason] ?? reason, ...count })),
})

const presentJob = (job: LegacyCleanupJob) => ({
  ...job,
  statusLabel: JOB_STATUS_LABELS[job.status] ?? job.status,
  percent: job.totalRecords === 0 ? 100 : Math.round((job.processedRecords / job.totalRecords) * 100),
})
