import { dataAccess } from '../data'
import AuditService from './auditService'
import PrisonerPropertyService from './prisonerPropertyService'
import UserService from './userService'

export const services = () => {
  const { applicationInfo, hmppsAuditClient, prisonerPropertyApiClient, manageUsersApiClient } = dataAccess()

  return {
    applicationInfo,
    auditService: new AuditService(hmppsAuditClient),
    prisonerPropertyService: new PrisonerPropertyService(prisonerPropertyApiClient),
    userService: new UserService(manageUsersApiClient),
  }
}

export type Services = ReturnType<typeof services>
