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

The app-wide middleware stack is assembled in `server/app.ts`, in this order:

```
browser
  → setUpHealthChecks      /health, /info — before auth, so probes never sign in
  → setUpWebSecurity       helmet, CSP
  → setUpWebSession        session (Redis in deployed envs, memory locally)
  → setUpWebRequestParsing body / urlencoded
  → setUpStaticResources   assets
  → nunjucksSetup          view engine, filters
  → setUpAuthentication    passport — signed in?
  → authorisationMiddleware token still valid? (Token Verification API)
  → setUpCsrf              csrf-sync
  → setUpCurrentUser       decode JWT → res.locals.user (incl. roles)
  → dpsComponents          shared DPS header / footer
  → routes(services)       ↓
```

and then, inside a route:

```
  → requireManageRole      does this user hold the role for this journey?      (write journeys only)
  → requireActivePrison    is their caseload prison live on DPS?               (write journeys only)
  → route handler          validate input, orchestrate
      → service            orchestration (+ small TTL caches)
        → data client      REST call with a service token
  → utils/ view builder    API shapes → template-ready view model
  → Nunjucks render
```

The two gates are the interesting part: **role** answers "may this person do this at all", **active
prison** answers "is this prison using DPS for property yet". Both must pass to write. Note they are
route-level, not app-level — a read-only page passes through neither.

---

## Directory map

| Path | What's in it |
| --- | --- |
| `server/routes/` | Every route, one file per group. `index.ts` only composes them; `journeys/` holds the four write journeys, `admin/` the two admin areas, and `journeyHelpers.ts` the context guard they share. |
| `server/services/` | Orchestration between routes and data clients. Some hold small caches. |
| `server/data/` | REST clients, one per external API, plus the Redis client and audit client. |
| `server/utils/` | View-model builders and Nunjucks filters — where API shapes become template shapes. |
| `server/middleware/` | Session, auth, CSRF, security headers, health, and the role/active-prison gates. |
| `server/views/` | Nunjucks templates: `pages/**`, `partials/**`, and `components/**` — which holds exactly one thing, a local fork of the MoJ pagination component. |
| `server/config.ts` | All environment configuration, in one place. |

---

## Routes

`server/routes/index.ts` is 32 lines: it builds the one shared gate — `requireActivePrison`, which needs
the two services — and mounts eight routers, passing that gate to the four write journeys.
`requireManageRole` needs no construction, so each journey imports it directly. Each group below is its
own file.

| Group | File | What it does | Gated by |
| --- | --- | --- | --- |
| **Establishment property list** (`/`) | `establishmentList.ts` | The landing page: all property in the user's active caseload prison, searchable, filterable and paginated, with the summary tiles. Renders a "no caseload" page if the user has none. | — |
| **Prisoner property** (`/prisoner/:prisonerNumber`) | `prisonerProperty.ts` | One person's property: held in this establishment, plus property still elsewhere that's due to transfer in. | — |
| **Property history** (`/prisoner/:prisonerNumber/history`) | `prisonerProperty.ts` | The timeline tab — property events interleaved with the person's arrivals and transfers. | — |
| **Property returned or transferred** (`/prisoner/:prisonerNumber/returned`) | `prisonerProperty.ts` | The third tab: a plain table of the person's property that has left storage — removed, returned, disposed or transferred out. | — |
| **Container history** (`/prisoner/:prisonerNumber/container/:id`) | `prisonerProperty.ts` | Everything that ever happened to one container. | — |
| **Prisoner photo** (`/prisoner/:prisonerNumber/image`) | `prisonerProperty.ts` | Proxies the photo from Prison API so the browser never holds a token. | — |
| **Add container** | `journeys/addContainer.ts` | Search → details → where stored → location → check answers → confirm. | manage + active prison |
| **Change container** | `journeys/changeContainer.ts` | Details → where stored → location → check → confirm. | manage + active prison |
| **Remove container** | `journeys/removeContainer.ts` | Reason → (transfer interruption) → check → confirm. | manage + active prison |
| **Combine containers** | `journeys/combineContainer.ts` | Select → details → location → check → confirm. | manage + active prison |
| **Admin: prisons** (`/admin/prisons`) | `admin/prisons.ts` | The rollout console: switch prisons onto DPS, and control the warning staff see on the NOMIS property screen. | admin |
| **Admin: locations** (`/admin/locations`) | `admin/locations.ts` | Add, edit and remove a prison's storage locations. | location admin |

All three person tabs share `partials/personHeader.njk`, which is where the *Add property* button lives.
Any handler rendering one of them has to compute `canManage` the same way, or the button appears on a tab
where the write gate will then refuse it (MAPB-738).

The four write journeys share a shape: each step validates and stashes state in the session, `check`
renders a summary, and only `confirm` calls the API. `journeyHelpers.ts` holds the `resolveContext` guard
every step runs first. **Combine is the exception to how you enter one**: its entry point is a POST from
the person page (it carries the selected containers), so it is the one journey you cannot reach by typing
a URL.

### The establishment list

Two behaviours on that page are worth knowing before changing it:

- **Search and filters persist.** The resolved query string is kept in the session and reapplied when the
  user comes back from a journey, so returning from a container doesn't silently drop their filters.
  `/?clear=1` is the explicit reset.
- **Applied filters render as removable tags**, with a clear-all link — because the filter panel is
  collapsed by default, and without the tags nothing on screen says the list is filtered, or on what.

One oddity: "Due for transfer in" is a *pseudo-status*. It shares the status checkbox group in the UI but
is a separate concern in the API, so it is mapped in and out via `TRANSFER_IN_FILTER_VALUE` rather than
being a `ContainerStatus`.

---

## Services

Thin by design — most are a pass-through to a data client. The exceptions earn their keep:

| Service | Responsibility |
| --- | --- |
| `prisonerPropertyService` | Everything property. A direct wrapper over the property API client. |
| `prisonerService` | Prisoner detail and photo, plus the NOMIS splash-screen read/write logic (idempotent add/update/remove of the caseload condition). |
| `userService` | The signed-in user's active caseload — which scopes the whole app — and staff display-name lookups. **Caches names in memory for 1 hour.** |
| `activeAgenciesService` | Is this prison live on DPS? **Read live, not cached** — see below. |
| `auditService` | Records page views to HMPPS Audit over SQS. |

`userService`'s name cache is process-local and deliberately so: names are cheap to rebuild and tolerate
being an hour stale.

**`activeAgenciesService` deliberately has no cache**, and it must stay that way. It had a five-minute TTL,
invalidated on an admin toggle — but the invalidation only reached the pod that served that POST, so every
other pod carried on refusing writes for a prison that had just been switched on. Staff saw roughly every
other request fail with the "not authorised" page (MAPB-739). A per-pod cache cannot be invalidated from
another pod, so there is no version of that design that works. The read is the property API's `/info`,
itself actuator-cached for two seconds over a table with a few hundred rows, and the set changes a handful
of times across the whole rollout. The last successful read is kept only as a fallback for when that call
fails, so a blip leaves edits blocked rather than opening them up.

The API removed its own copy of this cache for exactly the same reason. Don't reintroduce it here.

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
| `statusTags.ts` | Container status → the one tag palette. Everything below defers to it. |
| `prisonerTimeline.ts` | Timeline items → titles, bylines, expandable detail, status tags. |
| `propertyList.ts` | Establishment list + query params → rows, status tags, pagination, parsed filters, applied-filter tags. |
| `personProperty.ts` | A person's containers → split into held-here vs due-to-transfer-in, with viewer-relative tags; and the returned/transferred tab's rows. |
| `prisonerBanner.ts` | Prisoner detail → the banner, with a fallback when Prisoner Search is unavailable. |
| `containerHistory.ts` | Container events → labels and descriptions. |
| `nomisSplash.ts` | Splash-screen conditions → `NORMAL` / `WARNING` / `BLOCKED`, and back. |
| `addContainer.ts`, `changeContainer.ts`, `removeContainer.ts` | Form parsing, validation and journey state. |
| `utils.ts` | Date and name formatting. |

> **There is one status palette: `statusTags.ts`.** There used to be more than one, and they had drifted
> apart — the same container read as a different colour depending on which screen you were looking at.
> `containerStatusTag` is now the single source, imported by the timeline, the establishment list and the
> person view alike, so a colour change lands everywhere at once. Change it there, not at a call site.

The one genuinely screen-specific tag is *Due for transfer in* (`DUE_FOR_TRANSFER_IN_TAG` in
`propertyList.ts`). It is **viewer-relative** rather than a property of the container: the same box is
"due for transfer in" to the prison expecting it and something else entirely to the prison still holding
it. `isIncomingTo` in `personProperty.ts` decides which, and previous-seal matching keys off the same
judgement — so if you change what counts as incoming, check `matchableContainers` too.

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

Components come straight from GOV.UK and MoJ Frontend, with **one** exception:
`views/components/pagination/` (`macro.njk` + `template.njk`) is a **local fork of the MoJ Frontend
`mojPagination` component**, taken so the results line ("Showing 1 to 20 of 43 people") could be
worded for a list that pages by *prisoner* rather than by row. It is imported as `mojPagination` by
`propertyList.njk` and the two `addContainer` search/location pages.

Because it is a fork, two things follow: its params are built by `buildPagination` in
`utils/propertyList.ts` (there is no `paginationComponent.ts` — only
`paginationComponent.test.ts`, which renders the macro to assert the wording), and it does **not**
pick up upstream fixes. Re-check it whenever `@ministryofjustice/frontend` is upgraded.

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

- **Contributor conventions aren't written down** anywhere in this repo — they live in this doc and in
  code comments only.
- **`server/routes/index.test.ts` is one ~3,000-line file**, even though the routes themselves were split
  into one file per group. If you go looking for `establishmentList.test.ts`, it isn't there. Splitting it
  to mirror the routes is the obvious next tidy-up.
