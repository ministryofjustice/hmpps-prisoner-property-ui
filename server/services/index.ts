import { AuditServiceFactory } from '@ministryofjustice/hmpps-audit-client'
import { dataAccess } from '../data'
import config from '../config'
import logger from '../../logger'
import PrisonerPropertyService from './prisonerPropertyService'
import PrisonerService from './prisonerService'
import UserService from './userService'
import ActiveAgenciesService from './activeAgenciesService'

export const services = () => {
  const { applicationInfo, prisonerPropertyApiClient, prisonerSearchApiClient, prisonApiClient, manageUsersApiClient } =
    dataAccess()

  return {
    applicationInfo,
    auditService: AuditServiceFactory.createInstance(config.sqs.audit, logger),
    prisonerPropertyService: new PrisonerPropertyService(prisonerPropertyApiClient),
    prisonerService: new PrisonerService(prisonerSearchApiClient, prisonApiClient),
    userService: new UserService(manageUsersApiClient),
    activeAgenciesService: new ActiveAgenciesService(prisonerPropertyApiClient),
  }
}

export type Services = ReturnType<typeof services>
