import { Router, type RequestHandler } from 'express'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import requireLocationAdminRole from '../../middleware/requireLocationAdminRole'
import { isSafeLocationReturnTo } from '../journeyHelpers'

/**
 * On the storage-location management routes, remember where a user came from so they can be offered a way
 * back. When arriving from a location-search page the button passes a `returnTo`; store it in the session so
 * it survives the several hops through the management screens, and expose it to the views for the breadcrumb.
 */
const captureManageLocationsReturnTo: RequestHandler = (req, res, next) => {
  if (isSafeLocationReturnTo(req.query.returnTo)) {
    req.session.manageLocationsReturnTo = req.query.returnTo
  }
  res.locals.returnTo = req.session.manageLocationsReturnTo
  next()
}

/** Read and trim the property-location form fields from a request body. */
function readPropertyLocationForm(body: unknown): { localName: string; capacity: string } {
  const source = (body ?? {}) as { localName?: unknown; capacity?: unknown }
  return {
    localName: typeof source.localName === 'string' ? source.localName.trim() : '',
    capacity: typeof source.capacity === 'string' ? source.capacity.trim() : '',
  }
}

/** Error shown when capacity would be set below the number of containers already stored in a location. */
function capacityBelowHeldMessage(containersHeld: number): string {
  return `Capacity cannot be less than the ${containersHeld} container${containersHeld === 1 ? '' : 's'} currently stored here`
}

/**
 * Validate the property-location form, returning a field-keyed map of error messages (empty when valid).
 * [containersHeld] is how many containers the location already holds (0 for the add flow); capacity may not
 * be set below it. When [allowZeroCapacity] is set (the edit flow), an empty location may be dropped to 0 to
 * take it out of use; new locations still require at least 1.
 */
function validatePropertyLocationForm(
  values: { localName: string; capacity: string },
  containersHeld = 0,
  allowZeroCapacity = false,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!values.localName) {
    errors.localName = 'Enter a name for the storage location'
  } else if (values.localName.length > 80) {
    errors.localName = 'Name must be 80 characters or fewer'
  }
  if (!values.capacity) {
    errors.capacity = 'Enter how many containers this location can hold'
  } else if (!/^\d+$/.test(values.capacity)) {
    errors.capacity = 'Capacity must be a whole number'
  } else if (Number(values.capacity) < 1 && !allowZeroCapacity) {
    errors.capacity = 'Capacity must be at least 1'
  } else if (Number(values.capacity) < containersHeld) {
    errors.capacity = capacityBelowHeldMessage(containersHeld)
  }
  return errors
}

export default function adminLocationsRoutes({ auditService, prisonerPropertyService, userService }: Services): Router {
  const router = Router()

  // Property storage location management: add, rename, re-capacity and remove the locations the user's
  // establishment can store property in. Scoped to the user's active caseload and gated on the
  // location-admin role.
  router.get('/admin/locations', requireLocationAdminRole, captureManageLocationsReturnTo, async (req, res) => {
    const { token, username } = res.locals.user
    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) return res.render('pages/noCaseload')

    const locations = await prisonerPropertyService.getPropertyLocations(activeCaseloadId, username)
    await auditService.logPageView(Page.MANAGE_PROPERTY_LOCATIONS, {
      who: username,
      correlationId: req.id,
      details: { prisonId: activeCaseloadId },
    })

    return res.render('pages/admin/locations/list', {
      locations,
      successMessage: req.flash('success')[0],
      errorMessage: req.flash('error')[0],
    })
  })

  router.get('/admin/locations/add', requireLocationAdminRole, captureManageLocationsReturnTo, (req, res) =>
    res.render('pages/admin/locations/add', { values: {}, errors: {} }),
  )

  router.post('/admin/locations/add', requireLocationAdminRole, captureManageLocationsReturnTo, async (req, res) => {
    const { token, username } = res.locals.user
    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) return res.render('pages/noCaseload')

    const values = readPropertyLocationForm(req.body)
    const errors = validatePropertyLocationForm(values)
    if (Object.keys(errors).length > 0) {
      return res.status(400).render('pages/admin/locations/add', { values, errors })
    }

    try {
      await prisonerPropertyService.createPropertyLocation(
        activeCaseloadId,
        { localName: values.localName, capacity: Number(values.capacity) },
        username,
      )
      req.flash('success', `Storage location “${values.localName}” added.`)
      return res.redirect('/admin/locations')
    } catch (error) {
      if ((error as { responseStatus?: number }).responseStatus === 409) {
        return res.status(400).render('pages/admin/locations/add', {
          values,
          errors: { localName: 'A storage location with this name already exists' },
        })
      }
      throw error
    }
  })

  router.get(
    '/admin/locations/:id/edit',
    requireLocationAdminRole,
    captureManageLocationsReturnTo,
    async (req, res) => {
      const { token, username } = res.locals.user
      const { activeCaseloadId } = await userService.getActiveCaseload(token)
      if (!activeCaseloadId) return res.render('pages/noCaseload')

      const id = String(req.params.id)
      const location = (await prisonerPropertyService.getPropertyLocations(activeCaseloadId, username)).find(
        candidate => candidate.id === id,
      )
      if (!location) {
        req.flash('error', 'That storage location could not be found.')
        return res.redirect('/admin/locations')
      }

      return res.render('pages/admin/locations/edit', {
        location,
        values: { localName: location.name, capacity: String(location.capacity) },
        errors: {},
      })
    },
  )

  router.post(
    '/admin/locations/:id/edit',
    requireLocationAdminRole,
    captureManageLocationsReturnTo,
    async (req, res) => {
      const { token, username } = res.locals.user
      const { activeCaseloadId } = await userService.getActiveCaseload(token)
      if (!activeCaseloadId) return res.render('pages/noCaseload')

      const id = String(req.params.id)
      const location = (await prisonerPropertyService.getPropertyLocations(activeCaseloadId, username)).find(
        candidate => candidate.id === id,
      )
      if (!location) {
        req.flash('error', 'That storage location could not be found.')
        return res.redirect('/admin/locations')
      }

      const values = readPropertyLocationForm(req.body)
      const errors = validatePropertyLocationForm(values, location.containersHeld, true)
      if (Object.keys(errors).length > 0) {
        return res.status(400).render('pages/admin/locations/edit', { location, values, errors })
      }

      try {
        await prisonerPropertyService.updatePropertyLocation(
          id,
          { localName: values.localName, capacity: Number(values.capacity) },
          username,
        )
        req.flash('success', `Storage location “${values.localName}” updated.`)
        return res.redirect('/admin/locations')
      } catch (error) {
        const status = (error as { responseStatus?: number }).responseStatus
        if (status === 409) {
          // A 409 is a name clash unless the capacity has since dropped below what the location now holds
          // (a concurrent add between our read and the write).
          const conflictErrors =
            Number(values.capacity) < location.containersHeld
              ? { capacity: capacityBelowHeldMessage(location.containersHeld) }
              : { localName: 'A storage location with this name already exists' }
          return res.status(400).render('pages/admin/locations/edit', { location, values, errors: conflictErrors })
        }
        if (status === 404) {
          req.flash('error', 'That storage location could not be found.')
          return res.redirect('/admin/locations')
        }
        throw error
      }
    },
  )

  router.get(
    '/admin/locations/:id/remove',
    requireLocationAdminRole,
    captureManageLocationsReturnTo,
    async (req, res) => {
      const { token, username } = res.locals.user
      const { activeCaseloadId } = await userService.getActiveCaseload(token)
      if (!activeCaseloadId) return res.render('pages/noCaseload')

      const id = String(req.params.id)
      const location = (await prisonerPropertyService.getPropertyLocations(activeCaseloadId, username)).find(
        candidate => candidate.id === id,
      )
      if (!location) {
        req.flash('error', 'That storage location could not be found.')
        return res.redirect('/admin/locations')
      }

      return res.render('pages/admin/locations/remove', { location })
    },
  )

  router.post(
    '/admin/locations/:id/remove',
    requireLocationAdminRole,
    captureManageLocationsReturnTo,
    async (req, res) => {
      const { username } = res.locals.user
      const id = String(req.params.id)

      try {
        await prisonerPropertyService.removePropertyLocation(id, username)
        req.flash('success', 'Storage location removed.')
      } catch (error) {
        const status = (error as { responseStatus?: number }).responseStatus
        if (status === 409) {
          req.flash(
            'error',
            'This location still holds property and cannot be removed. Move or remove the containers stored here first.',
          )
        } else if (status === 404) {
          req.flash('error', 'That storage location could not be found.')
        } else {
          throw error
        }
      }
      return res.redirect('/admin/locations')
    },
  )

  return router
}
