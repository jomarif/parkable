# Parkable — Project Plan & Context

> Context document for future Claude agents (and humans). Read this first to understand
> what this app is, why it exists, and the decisions already made.

## What we're building

A **personal parking knowledge base** web app. The core idea: as you learn about parking spots,
you journal them (location + structured details — price, time limit, plus a freeform note for
restrictions/whatever). Later, when you're planning a trip or back in the area, you can look up
your saved spots on a map and know what to expect: how much it costs, how long you can stay, is
it the cheapest, is it close by, and — if it's full — what your backup options nearby are.

**This is a reference journal, not a "find my car" app.** The value is the accumulated, reliable
*lookup* later, not capturing your exact live location in the moment. Losing 30 seconds while
parking doesn't break the product the way it would for find-my-car.

The pain being solved: figuring out parking in unfamiliar places is annoying, and you forget
what you learned. Google Maps *can* be bent into this (drop a pin, add a note), but it was never
built for it — pinning, labeling, and saving are separate clunky steps, notes aren't structured,
and parking pins get buried among every other saved place. Our wedge is a **user-friendly,
parking-only UI** — a clean capture flow (drop pin → note → time → price → done) and a map +
lookup scoped to just parking.

## Origin & vision

The idea started from wanting to improve on Parkopedia's hard-to-navigate site, and from a
GasBuddy-style concept where users crowdsource and verify parking-sign accuracy (verified
checkmark if accurate, absent if not). That crowdsourced-verification version was intentionally
**set aside** because:
- Parking signs change rarely, so there's no daily "come back and check" habit like gas prices.
- The people who can verify a spot (locals) aren't the ones who need it (visitors) — a
  two-sided incentive mismatch.

So the product pivoted to a **personal-first** tool that can *grow* a social/crowd layer later,
once there's real personal-usage data and density in some area.

## Goals

1. **Ship a genuinely usable MVP** that the author actually uses for their own parking.
2. **Resume-worthy** — a live, polished, full-stack containerized app demonstrating real
   architecture (auth, database, geospatial queries, Docker).
3. **Eventually public & monetized** — long-term goal is a public site to find parking, with a
   possible paid tier (see below). Monetization is explicitly a *later* concern, not MVP.

## Phasing

- **v1 (current target):** Personal diary behind a login. Save/edit/delete spots, see them on a
  map and in a list. Single user sees only their own spots.
- **v2:** Multi-device sync (already covered by having a real backend + auth from day one),
  Google OAuth/SSO, richer structured fields (price, time limit, restriction types).
- **v3 (only if real usage exists):** A **paid tier** to see *other users'* saved spots, shown
  as "unverified" / "take with a grain of salt." The free tier remains a personal saver. This is
  why the data model reserves a `visibility` field from the start.

## Tech stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Vite + React + TypeScript** | SPA. Chose over Next.js because backend is separate; SEO not needed for a login-gated app. Public/SEO marketing pages, if ever needed, will be a *separate* static site behind a reverse proxy — not a reason to adopt Next.js. |
| Styling | **Plain CSS + BEM** | Deliberate — author wants to practice BEM. One `.css` file per component, global CSS + strict BEM naming (not CSS Modules). |
| Backend | **NestJS (TypeScript)** | Chosen over Express (more structure), .NET (author uses it at their internship — wants to explore something else), and Python (wanted built-in/first-class typing). Shares TS types with the frontend. |
| Database | **PostgreSQL + PostGIS** | Geospatial "spots near me" is core. See ORM note below. |
| ORM | **Prisma** | Chosen for DX / it being the more standard/popular choice. **Important caveat:** Prisma has weak native PostGIS support. Coordinates are therefore stored as plain `lat`/`lng` **float columns** (fully typed, no friction), and the one geospatial "nearby" query is written as **raw SQL** (`prisma.$queryRaw` with `ST_DWithin`/`ST_MakePoint`). Do NOT try to use an `Unsupported("geography")` column — that was explicitly rejected as too much friction. A generated geography column + GiST index can be added later without changing app code. |
| Auth | **Passport + JWT, email/password** | See Auth section. |
| Containerization | **Docker + docker-compose** | Local for now. Container-shaped so future deploy to AWS ECS/EC2 is open. |
| Repo layout | **Monorepo** | So a `shared` package of TS types is genuinely imported by both frontend and backend. |

## Auth (locked)

- **Email + password** (bcrypt-hashed). No OAuth yet — Google OAuth is a future Passport
  strategy that drops in without reworking existing auth.
- **JWT stored in an httpOnly + Secure + SameSite cookie** — the "real-world" approach, chosen
  over the localStorage/Bearer shortcut for XSS safety. Requires CORS-with-credentials between
  the Vite frontend and NestJS backend.
- **Level 1 auth for MVP:** a single, moderately short-lived JWT (~7 days). Structured so that
  **Level 2** (short-lived access token + revocable refresh token with rotation, a
  `refresh_tokens` table, and `/auth/refresh`) can be added later as an additive feature, not a
  rewrite. Level 2 is deliberately deferred — real-world, but unnecessary surface area before
  there are users.

## v1 scope

**In:**
- Register / login / logout (email + password)
- Save a parking spot via a clean capture flow: **drop pin → note → time limit → price → done**
- **Draggable pin** with a sensible start position (see pin-start fallback in UX section) — never 0,0
- Structured **price** and **time-limit** fields per spot, plus a freeform **note** for
  restrictions/anything else (add + edit)
- Map view with a pin per spot
- **Nearby lookup** (`/spots/near`) — radius query returning spots ranked by distance with their
  price/time-limit, so you can compare options in an area. This is the read-side heart of the journal.
- Edit + delete spots
- List view of the user's spots
- Client-side **draft buffer** (cache/session storage) so a spot in-progress survives poor
  connectivity (e.g. in a garage) and syncs when back online

**Explicitly out of v1:** photo/sign upload, OAuth/SSO, the shared/paid layer, richer structured
fields beyond price/time-limit (restriction *types*, price-with-timestamp history), refresh
tokens, reverse proxy, marketing site.

## Data model (prototype)

Kept intentionally minimal for v1; a detailed data-model pass (structured price with timestamp,
time limits, restriction types, etc.) is deferred to a later session.

```
User
  id, email, passwordHash, createdAt

ParkingSpot
  id, ownerId -> User, lat, lng, note, price, timeLimit, createdAt, updatedAt
  // price     : freeform short STRING in v1 (e.g. "$3/hr", "free after 6pm", "$15 event flat").
  //             Deliberately not numeric — real prices vary by time of day / day / event, so one
  //             number would be misleading. Future structured version = multiple labeled rate
  //             entries (by time window), which unlocks "cheapest nearby" sorting. Later pass.
  // timeLimit : freeform short STRING in v1 (e.g. "2 hr", "no overnight", "free Sundays"). Same
  //             reasoning as price — limits vary by context, so structured restriction *types*
  //             (and any enforced-hours modeling) are deferred to the later data-model pass.
  // note      : freeform, for restrictions/anything the structured fields don't cover
  visibility = 'private'   // reserved/unused in v1; enables the future shared/paid layer
```

## Architecture

```
docker-compose
├── frontend   (Vite + React + BEM CSS)      -> calls backend REST API with credentials
├── backend    (NestJS + Prisma + Passport/JWT)
└── db         (Postgres + PostGIS, persistent volume)
```

A reverse proxy (Caddy/Traefik) + a static marketing site are a **future** addition (for a
public, SEO-discoverable landing page), not part of v1.

## Planned API endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET  /auth/me`
- `GET  /spots` — the current user's spots
- `GET  /spots/near?lat&lng&radius` — geospatial radius query (raw SQL / PostGIS)
- `POST /spots`
- `PATCH /spots/:id`
- `DELETE /spots/:id`

All `/spots` routes are auth-guarded and scoped to the current user (`WHERE ownerId = me`).

## Deployment

- **Now:** local `docker-compose up`.
- **Future:** AWS ECS/EC2 (kept open by containerizing from day one). No cloud setup yet.

## Design/UX principle

**North star: rich, reliable lookup later — enabled by a capture flow that's *user-friendly*, not
necessarily fast.** The win over Google Maps is UI/ease-of-use for a parking-specific job, not
raw save speed. Capture should be clean and unclunky: drop pin → note → time → price → done.
Auto-locating is a nice-to-have head start, not the point.

**Pin-start fallback (never 0,0), in priority order:**
1. Browser geolocation succeeds → drop the (draggable) pin there.
2. Geolocation denied/fails → let the user **search/select a city or place** and drop into that
   area to drag from.
3. Nothing available → last-used map center (from cache/session storage), else a sensible default.

For v1 the UI can be a basic prototype; polish comes in later iterations. But don't lose the
"user-friendly, parking-only capture feeding reliable lookup" north star.

## Decisions log (why, not just what)

- **Reference journal, not find-my-car** — the value is reliable *lookup* later (price, time
  limit, nearby options), not capturing exact live location in the moment. This makes `/spots/near`
  and the structured price/time-limit fields core to v1 (not deferred), makes garage-connectivity
  a minor risk (handled by a client-side draft buffer), and reframes the wedge from "fast save" to
  "user-friendly parking-only UI."
- **Price & timeLimit as freeform strings, not structured (v1)** — real prices/limits vary by time
  of day/day/event, so a single value would be misleading; a string captures the truth now, and the
  eventual structured form is multiple labeled entries (not one value). Sorting/"cheapest nearby"
  and enforced-hours logic wait for that later data-model pass.
- **Personal-first over crowdsourced verification** — sign-change frequency is too low for a
  crowd-verification habit; verifier/beneficiary incentive mismatch.
- **Vite over Next.js** — separate backend wanted; app is login-gated so SEO is moot; keeps a
  clean frontend/backend split.
- **NestJS over Express/.NET/Python** — structure + one TS language across stack; author already
  knows .NET; wanted built-in typing (ruled out Python's optional hints).
- **Prisma over TypeORM** — more standard/popular; accepted the raw-SQL-for-geo tradeoff with
  lat/lng floats to avoid the `Unsupported("geography")` friction.
- **httpOnly cookie over localStorage** — XSS safety; the professional/real-world approach.
- **Level 1 auth now, Level 2 later** — refresh-token rotation is real-world but is unnecessary
  surface area (and easy to get subtly wrong) before there are users.
