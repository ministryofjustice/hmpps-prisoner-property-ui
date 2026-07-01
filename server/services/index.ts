import { dataAccess } from '../data'
import AuditService from './auditService'
import PrisonerPropertyService from './prisonerPropertyService'

export const services = () => {
  const { applicationInfo, hmppsAuditClient, prisonerPropertyApiClient } = dataAccess()

  return {
    applicationInfo,
    auditService: new AuditService(hmppsAuditClient),
    prisonerPropertyService: new PrisonerPropertyService(prisonerPropertyApiClient),
  }
}

export type Services = ReturnType<typeof services>
