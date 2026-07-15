# Prisoner Property UI — Technical Implementation

How this front end is put together: the shape of a request, what lives where, and what it depends on.
For the service as a whole — both repos, diagrams, the domain model, messaging — see the
[architecture doc](https://github.com/ministryofjustice/hmpps-prisoner-property-api/blob/main/docs/architecture.md)
in the API repo.

**Related docs:**
[Business overview](https://github.com/ministryofjustice/hmpps-prisoner-property-api/blob/main/docs/business-overview.md) (what the service does and why) ·
[Architecture](https://github.com/ministryofjustice/hmpps-prisoner-property-api/blob/main/docs/architecture.md) ·
[API technical implementation](https://github.com/ministryofjustice/hmpps-prisoner-property-api/blob/main/docs/technical-implementation.md) ·
[README](../README.md) (setup, environment variables, running, tests)

> Links into the API repo are absolute on purpose — relative links silently 404 across repositories.

**Not repeated here:** local setup, OAuth2 credentials, Redis, build and test commands are all in the
[README](../README.md).

---

## What this app is

A standard HMPPS DPS front end — Express + Nunjucks + GOV.UK/MoJ Frontend, built from
[hmpps-template-typescript](https://github.com/ministryofjustice/hmpps-template-typescript). It holds
**no data of its own**. Every screen is assembled from other services' APIs, and every write is a call to
`hmpps-prisoner-property-api`.

**It does not call Locations Inside Prison.** Storage locations reach this app only through the property
API. This is the most common wrong assumption about the front end, so it's worth stating plainly.

---

## The shape of a request

```
browser
  → setUpWebSession        session (Redis in deployed envs, memory locally)
  → passport / auth        signed in? token still valid?
  → setUpCurrentUser       decode JWT → res.locals.user (incl. roles)
  → requireManageRole      does this user hold the role for this journey?      (write journeys only)
  → requireActivePrison    is their caseload prison live on DPS?               (write journeys only)
  → route handler          validate input, orchestrate
      → service            orchestration (+ small TTL caches)
        → data client      REST call with a service token
  → utils/ view builder    API shapes → template-ready view model
  → Nunjucks render
```

The two gates in the middle are the interesting part: **role** answers "may this person do this at all",
**active prison** answers "is this prison using DPS for property yet". Both must pass to write.

---

## Directory map

| Path | What's in it |
| --- | --- |
| `server/routes/` | Every route. See the note below — it's one file. |
| `server/services/` | Orchestration between routes and data clients. Some hold small caches. |
| `server/data/` | REST clients, one per external API, plus the Redis client and audit client. |
| `server/utils/` | View-model builders and Nunjucks filters — where API shapes become template shapes. |
| `server/middleware/` | Session, auth, CSRF, security headers, health, and the role/active-prison gates. |
| `server/views/` | Nunjucks templates: `pages/**`, `partials/**`. |
| `server/config.ts` | All environment configuration, in one place. |

---

## Routes

> **All routes live in a single `server/routes/index.ts`.** It is large. This doc describes route groups
> by *responsibility* rather than by location in the file, so it stays true if the router is ever split —
> which would be a reasonable post-beta cleanup.

| Group | What it does | Gated by |
| --- | --- | --- |
| **Establishment property list** (`/`) | The landing page: all property in the user's active caseload prison, searchable, filterable and paginated, with the summary tiles. Renders a "no caseload" page if the user has none. | — |
| **Prisoner property** (`/prisoner/:prisonerNumber`) | One person's property: held in this establishment, plus property still elsewhere that's due to transfer in. | — |
| **Property history** (`/prisoner/:prisonerNumber/history`) | The timeline tab — property events interleaved with the person's arrivals and transfers. | — |
| **Container history** (`/prisoner/:prisonerNumber/container/:id`) | Everything that ever happened to one container. | — |
| **Prisoner photo** (`/prisoner/:prisonerNumber/image`) | Proxies the photo from Prison API so the browser never holds a token. | — |
| **Add container** | Search → details → location → check answers → confirm. | manage + active prison |
| **Change container** | Details → location → check → confirm. | manage + active prison |
| **Remove container** | Reason → (transfer interruption) → check → confirm. | manage + active prison |
| **Combine containers** | Select → details → location → check → confirm. | manage + active prison |
| **Admin: prisons** (`/admin/prisons`) | The rollout console: switch prisons onto DPS, and control the warning staff see on the NOMIS property screen. | admin |
| **Admin: locations** (`/admin/locations`) | Add, edit and remove a prison's storage locations. | location admin |

The four write journeys share a shape: each step validates and stashes state in the session, `check`
renders a summary, and only `confirm` calls the API.

---

## Services

Thin by design — most are a pass-through to a data client. The exceptions earn their keep:

| Service | Responsibility |
| --- | --- |
| `prisonerPropertyService` | Everything property. A direct wrapper over the property API client. |
| `prisonerService` | Prisoner detail and photo, plus the NOMIS splash-screen read/write logic (idempotent add/update/remove of the caseload condition). |
| `userService` | The signed-in user's active caseload — which scopes the whole app — and staff display-name lookups. **Caches names in memory for 1 hour.** |
| `activeAgenciesService` | Is this prison live on DPS? **Caches for 5 minutes**, invalidated when an admin toggles a prison. |
| `auditService` | Records page views to HMPPS Audit over SQS. |

Both caches are process-local and deliberately so — they're small, cheap to rebuild, and tolerate being
a few minutes stale. Neither needs Redis.

---

## Data clients

All extend `RestClient` from `@ministryofjustice/hmpps-rest-client` and are constructed in
`server/data/index.ts`.

| Client | Service | Used for | Token |
| --- | --- | --- | --- |
| `prisonerPropertyApiClient` | Property API | All property reads and writes; box locations; summary; active agencies; location admin | `asSystem(username)` — except `getActiveAgencyIds()`, which hits the public `/info` **unauthenticated** |
| `prisonerSearchApiClient` | Prisoner Search | Prisoner detail; name/number search scoped to one prison | `asSystem(username)` |
| `prisonApiClient` | Prison API | Prisoner photo; NOMIS splash-screen management | `asSystem(username)` |
| `manageUsersApiClient` | Manage Users | Active caseload; staff display names | `asUser(token)` for the caller's own caseload; `asSystem(username)` when looking up *another* user |
| `hmppsAuditClient` | HMPPS Audit | Page-view audit events | AWS SQS, not JWT |

### The two-token model

This trips people up, so it's worth being precise:

- **`asUser(token)`** — the signed-in user's own token. Used only for `/users/me/caseloads`, because the
  answer *is* "who is the caller".
- **`asSystem(username)`** — a service (client-credentials) token that carries the acting username. Used
  for everything else. The service, not the user, holds the permission; the username rides along so the
  downstream service can attribute the action.

Service tokens are cached by the shared `AuthenticationClient` — in Redis when `REDIS_ENABLED`, in memory
otherwise. Redis is used for exactly two things: that token store, and the session store.

---

## View-model builders (`server/utils/`)

Where an API response becomes something a template can render. Keeping this out of the routes is what
makes it unit-testable without an Express app.

| Module | In → out |
| --- | --- |
| `prisonerTimeline.ts` | Timeline items → titles, bylines, expandable detail, status tags. |
| `propertyList.ts` | Establishment list + query params → rows, status tags, pagination, parsed filters. |
| `personProperty.ts` | A person's containers → split into held-here vs due-to-transfer-in, with viewer-relative tags. |
| `prisonerBanner.ts` | Prisoner detail → the banner, with a fallback when Prisoner Search is unavailable. |
| `containerHistory.ts` | Container events → labels and descriptions. |
| `nomisSplash.ts` | Splash-screen conditions → `NORMAL` / `WARNING` / `BLOCKED`, and back. |
| `addContainer.ts`, `changeContainer.ts`, `removeContainer.ts` | Form parsing, validation and journey state. |
| `utils.ts` | Date and name formatting. |

> **Careful: there are three status-tag palettes, and they disagree on purpose.** The timeline
> (`prisonerTimeline.ts`) shows *Stored* as green; the establishment list (`propertyList.ts`) shows
> *Due for transfer out* as yellow where the timeline shows grey; `personProperty.ts` adds a
> viewer-relative turquoise *Due for transfer in*. They are not a mistake to be unified — each answers a
> different question. Check which one you're in before changing a colour.

Most of these are registered as Nunjucks filters in `server/utils/nunjucksSetup.ts`.

---

## Auth and roles

Staff sign in through HMPPS Auth (OAuth2 authorisation-code, `passport-oauth2`,
`server/middleware/setUpAuthentication.ts`). Every request re-checks the token against the Token
Verification API. `setUpCurrentUser` decodes the JWT into `res.locals.user`, stripping the `ROLE_` prefix
— so the authority `ROLE_PRISONERPROP__MANAGE` becomes the role `PRISONERPROP__MANAGE`.

| Role | Gates | Middleware |
| --- | --- | --- |
| *(signed in)* | Reading property | `authorisationMiddleware` |
| `PRISONERPROP__MANAGE` | Add / change / remove / combine | `requireManageRole` |
| `PRISONERPROP__ADMIN` | The rollout console | `requireAdminRole` |
| `PRISONERPROP__LOCATION_ADMIN` | Storage-location management | `requireLocationAdminRole` |

`requireActivePrison` sits alongside `requireManageRole` on every write journey. It blocks writes when the
user's active caseload prison isn't switched on in DPS — the rule being that a prison uses DPS **or**
NOMIS for property, never both. The UI hiding a journey is a courtesy; the API enforces it independently.

---

## Views

Nunjucks (`server/utils/nunjucksSetup.ts`), searching `server/views`, `govuk-frontend`,
`@ministryofjustice/frontend` and the DPS components package. `partials/layout.njk` extends the GOV.UK
template and injects the shared DPS header/footer fetched at request time, falling back to a local header
if the component service is unavailable. Assets are cache-busted via the `assetMap` filter reading the
esbuild-generated `assets/manifest.json`.

There are no custom macro files — components come straight from GOV.UK and MoJ Frontend.

---

## Testing

- **Unit:** Jest, co-located `*.test.ts` beside almost every module, plus route-level tests using
  `routes/testutils/appSetup.ts`.
- **Integration:** **Playwright** (not Cypress), specs in `integration_tests/specs`, page objects in
  `integration_tests/pages`, with every external API stubbed through **WireMock**
  (`integration_tests/mockApis/`). Run with docker-compose + `npm run start-feature` + `npm run int-test`.

Commands are in the [README](../README.md).

---

## Gaps worth knowing

- **No `CLAUDE.md`** in this repo, unlike the API. Contributor conventions live only in this doc and in
  code comments.
- **`server/routes/index.ts` is one large file.** Splitting it per journey is the obvious next tidy-up.
