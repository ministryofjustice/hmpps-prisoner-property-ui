import { dataAccess } from '../data'
import AuditService from './auditService'
import PrisonerPropertyService from './prisonerPropertyService'
import PrisonerService from './prisonerService'
import UserService from './userService'

export const services = () => {
  const {
    applicationInfo,
    hmppsAuditClient,
    prisonerPropertyApiClient,
    prisonerSearchApiClient,
    prisonApiClient,
    manageUsersApiClient,
  } = dataAccess()

  return {
    applicationInfo,
    auditService: new AuditService(hmppsAuditClient),
    prisonerPropertyService: new PrisonerPropertyService(prisonerPropertyApiClient),
    prisonerService: new PrisonerService(prisonerSearchApiClient, prisonApiClient),
    userService: new UserService(manageUsersApiClient),
  }
}

export type Services = ReturnType<typeof services>
