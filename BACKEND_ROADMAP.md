# Parkable — Backend Roadmap (hands-on build guide)

> A step-by-step learning path for building the Parkable backend **by hand**.
> Each goal is self-contained: build it, verify it, then move on. Don't skip the
> "Verify" step — proving each layer works before stacking the next one on top is
> the whole point.
>
> **How to use this:** work top to bottom. When you're stuck, ask for help on the
> *specific* concept or error — the goal is for you to write the code.
>
> Stack recap: **NestJS + Prisma + PostgreSQL/PostGIS + Passport/JWT (httpOnly cookie)**.
> See `PROJECT_PLAN.md` for the *why* behind every locked decision.

---

## Legend for each goal

- **Goal** — the one thing this step accomplishes.
- **Why** — where it fits in the bigger picture.
- **Learn** — concepts worth understanding before/while you build (so it's not cargo-culting).
- **Build** — the concrete checklist.
- **Verify** — how you *prove* it works, with no frontend.
- **Done when** — the bar to clear before moving on.

---

## Goal 0 — Database is running and reachable

**Goal:** A Postgres + PostGIS container up via docker-compose, and you can connect to it.

**Why:** Everything downstream needs a database. Get it running first so it's never the unknown when something else breaks.

**Learn:**
- What a Docker image vs. container vs. volume is (the volume is why your data survives restarts).
- Why we use the `postgis/postgis` image instead of plain `postgres` (PostGIS extension preinstalled).
- What "exposing a port" means (`5432:5432`) and the risk of leaving it open.

**Build:**
- [x] A `docker-compose.yml` at the repo root with a `db` service using the `postgis/postgis` image.
- [x] Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- [x] A named volume for persistence.
- [x] A `.env` at the root (and add it to `.gitignore`) — never commit real credentials.

**Verify:**
- [x] `docker compose up -d db` starts without errors.
- [x] Connect with `psql` (or a GUI like TablePlus/DBeaver) and run `SELECT postgis_version();` — it should return a version, proving PostGIS is live, not just Postgres.

**Done when:** you can connect to the DB and PostGIS responds. ✅ **Done 2026-09-12** — confirmed persistence survives a full `docker compose down && up`.

---

## Goal 1 — NestJS app boots

**Goal:** A minimal NestJS backend under `apps/backend` that starts and serves one route.

**Why:** Establishes the framework skeleton — modules, controllers, providers — that everything else plugs into.

**Learn:**
- The NestJS mental model: **Module → Controller → Provider (Service)**. What dependency injection is and why Nest leans on it.
- The request lifecycle: middleware → guards → interceptors → pipes → controller. (You'll use each of these later; know the order now.)
- How Nest's CLI scaffolds things (`nest generate ...`).

**Build:**
- [ ] Scaffold a Nest app in `apps/backend` (name it `@parkable/backend` to match the workspace).
- [ ] Get a health-check route responding (e.g. `GET /health` → `{ status: 'ok' }`).
- [ ] Wire it into the npm workspace so `npm run dev:backend` from the root works.

**Verify:**
- [ ] `curl localhost:3000/health` returns your JSON.

**Done when:** the server boots and a route responds over HTTP.

---

## Goal 2 — Config & environment

**Goal:** Typed, validated environment configuration (DB URL, JWT secret, cookie settings, port).

**Why:** Secrets and per-environment values must not be hardcoded. Doing this early means every later module reads config the right way from day one.

**Learn:**
- `@nestjs/config` and how it loads `.env`.
- Why you should **validate** env at startup (fail fast if a required var is missing) rather than discover it at runtime.
- The difference between config the *backend* needs vs. what docker-compose injects.

**Build:**
- [ ] Install and register `@nestjs/config` (global).
- [ ] Define the vars you'll need: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`, `COOKIE_SECURE`.
- [ ] Add startup validation (schema check).

**Verify:**
- [ ] Temporarily remove a required var → the app refuses to start with a clear error.

**Done when:** config is read from env, validated, and injectable.

---

## Goal 3 — Prisma connected + schema + first migration

**Goal:** Prisma talks to your DB, the `User` and `ParkingSpot` tables exist via a migration, and PostGIS is enabled.

**Why:** This is the data spine. The schema is your contract with the database.

**Learn:**
- What an ORM does and what a **migration** is (versioned, reviewable schema changes — not the ORM silently mutating your DB).
- Prisma's pieces: `schema.prisma`, the generated client, `prisma migrate dev` vs `prisma db push`.
- **The PostGIS caveat (important):** per the plan, coordinates are plain `lat`/`lng` **Float columns** — *not* an `Unsupported("geography")` column. Understand why (Prisma's weak PostGIS support) so you don't "fix" it later.
- How to enable the PostGIS extension inside a migration (`CREATE EXTENSION IF NOT EXISTS postgis;`).

**Build:**
- [ ] Install Prisma, init it, point `DATABASE_URL` at your compose DB.
- [ ] Model `User` and `ParkingSpot` in `schema.prisma` per the data model in `PROJECT_PLAN.md` (note the reserved `visibility` field).
- [ ] Create the first migration; add the `CREATE EXTENSION` for PostGIS to it.
- [ ] Wire a `PrismaService` into Nest (a provider that manages the client's lifecycle).

**Verify:**
- [ ] Migration applies cleanly; `\dt` in psql shows your tables.
- [ ] `SELECT postgis_version();` still works (extension enabled inside the tracked migration, not manually).

**Done when:** tables exist via a migration and Nest can query through Prisma.

---

## Goal 4 — Your test harness: validation + Swagger

**Goal:** Global request validation and an interactive Swagger UI at `/api`.

**Why:** This is *how you'll test the backend without a frontend.* Build it before the real endpoints so every endpoint you add is instantly clickable and documented. Validation ensures bad input is rejected consistently.

**Learn:**
- `ValidationPipe` + `class-validator`/`class-transformer`: how DTO classes with decorators become runtime validation.
- Why validation belongs at the boundary (never trust the client).
- `@nestjs/swagger`: how decorators generate an OpenAPI spec and a "Try it out" UI.

**Build:**
- [ ] Enable a global `ValidationPipe` (with `whitelist`/`forbidNonWhitelisted` so unknown fields are stripped/rejected).
- [ ] Install and configure Swagger; expose it at `/api`.
- [ ] Configure Swagger to work with cookie auth (so "Try it out" sends the login cookie).

**Verify:**
- [ ] Visit `localhost:3000/api` — you see your `/health` route and can call it from the browser.

**Done when:** Swagger renders and validation rejects a malformed body with a 400.

---

## Goal 5 — Users persistence layer

**Goal:** A `UsersModule`/`UsersService` that can create and look up users by email.

**Why:** Auth needs users. Building this as its own service keeps auth logic separate from raw DB access.

**Learn:**
- Nest module boundaries: why `UsersService` is a provider that `AuthModule` will import.
- Why email should be **unique** (DB-level constraint, not just app-level checking).
- Never return the `passwordHash` to callers — shaping DB rows into safe response objects.

**Build:**
- [ ] `UsersService` with `create(email, passwordHash)` and `findByEmail(email)`.
- [ ] Enforce email uniqueness (schema constraint) and handle the duplicate-email error path.

**Verify:**
- [ ] Hard to test directly yet (no endpoint) — a quick throwaway script or a temporary debug route, or just wait for Goal 6 which exercises it. Prefer covering it via the register endpoint next.

**Done when:** you can create and fetch a user through the service.

---

## Goal 6 — Auth: registration (password hashing)

**Goal:** `POST /auth/register` creates a user with a bcrypt-hashed password.

**Why:** First real endpoint. Establishes secure password handling — the thing you must not get wrong.

**Learn:**
- Why you **hash** (not encrypt) passwords, and what bcrypt's salt + work-factor do.
- Why hashing is async/CPU-bound and how that affects the request.
- What info to leak on "email already exists" (a real security/UX tradeoff).

**Build:**
- [ ] `AuthModule` + `AuthService`.
- [ ] `RegisterDto` (reuse the shape from `@parkable/shared`; add validation decorators).
- [ ] `POST /auth/register`: validate → check email free → hash → create user → return safe user (no hash).

**Verify:**
- [ ] Register via Swagger → 201 + user object (no `passwordHash`).
- [ ] In psql, confirm the stored `passwordHash` is a bcrypt string, not plaintext.
- [ ] Registering the same email twice → clean 409/400, not a 500.

**Done when:** a user is safely created and the password is stored hashed.

---

## Goal 7 — Auth: login + JWT in an httpOnly cookie

**Goal:** `POST /auth/login` verifies credentials and sets a JWT in an httpOnly + Secure + SameSite cookie.

**Why:** The core of the "real-world" auth approach from the plan. This is the trickiest integration in the whole backend — take it slow.

**Learn:**
- What a JWT is: header.payload.signature, what's safe to put in the payload (never secrets), and how the signature is verified with `JWT_SECRET`.
- **Why the cookie, not a Bearer token in localStorage** (XSS safety — re-read the Auth section of the plan).
- Each cookie flag: `httpOnly` (JS can't read it), `Secure` (HTTPS only), `SameSite` (CSRF posture), `maxAge`.
- Passport's role: the `local` strategy (validate email/password) vs. the `jwt` strategy (validate the token on later requests).

**Build:**
- [ ] Install Passport + JWT bits (`@nestjs/passport`, `@nestjs/jwt`, `passport-jwt`, cookie parser).
- [ ] `LocalStrategy` (or manual credential check) to validate email + password against the hash.
- [ ] On success, sign a JWT and set it as an httpOnly cookie on the response.
- [ ] `LoginDto` from `@parkable/shared`.

**Verify:**
- [ ] Login via Swagger with good creds → 200, and a `Set-Cookie` header appears in the response.
- [ ] Login with a wrong password → 401, no cookie.

**Done when:** a correct login sets a signed JWT cookie; a wrong one is rejected.

---

## Goal 8 — Auth: the JWT guard, `/auth/me`, and logout

**Goal:** A guard that reads the JWT from the cookie and protects routes; `GET /auth/me` and `POST /auth/logout`.

**Why:** This is what makes every `/spots` route secure. Once this works, protecting anything is a one-line decorator.

**Learn:**
- The `JwtStrategy` configured to extract the token **from the cookie** (not the `Authorization` header — the default).
- Nest **guards**: how `@UseGuards(JwtAuthGuard)` gates a route and attaches the user to the request.
- How "logout" works with a stateless JWT (you can't invalidate it server-side at Level 1 — you clear the cookie; understand this limitation, it's why Level 2 exists later).

**Build:**
- [ ] `JwtStrategy` that pulls the token from the cookie and validates the signature.
- [ ] A `JwtAuthGuard`.
- [ ] `GET /auth/me` (guarded) → current user.
- [ ] `POST /auth/logout` → clears the cookie.
- [ ] A way to grab the current user in controllers (a `@CurrentUser()` param decorator).

**Verify:**
- [ ] Call `/auth/me` in Swagger *after* logging in → your user.
- [ ] Call `/auth/me` with no cookie (or after logout) → 401.

**Done when:** the cookie's JWT gates protected routes and `/auth/me` reflects login state.

---

## Goal 9 — Spots CRUD (owner-scoped)

**Goal:** `GET/POST/PATCH/DELETE /spots`, all guarded and scoped to the current user.

**Why:** The write side of the journal. The critical rule: **a user can only ever touch their own spots.**

**Learn:**
- Why every query must filter/guard on `ownerId = currentUser` — and the classic bug (IDOR) where a user edits someone else's row by guessing an id.
- REST semantics: `POST` (create), `PATCH` (partial update), `DELETE`, and the right status codes.
- Where ownership is enforced: in the query (`WHERE ownerId = me`) and/or a guard — decide deliberately.

**Build:**
- [ ] `SpotsModule` + `SpotsService` + `SpotsController` (all routes guarded).
- [ ] `CreateSpotDto` / `UpdateSpotDto` from `@parkable/shared` (+ validation: lat/lng ranges, string lengths).
- [ ] `POST /spots`, `GET /spots` (current user's), `PATCH /spots/:id`, `DELETE /spots/:id` — every one scoped to owner.
- [ ] Return 404 (not 403) when touching a spot that isn't yours, or a deliberate choice — think about what leaks less.

**Verify:**
- [ ] Create a spot, list it, edit it, delete it via Swagger — all while logged in.
- [ ] Register a *second* user, log in as them, try to `PATCH`/`DELETE` the first user's spot id → you must NOT be able to. This is the test that matters most.

**Done when:** full CRUD works and cross-user access is impossible.

---

## Goal 10 — `/spots/near` (raw SQL + PostGIS)

**Goal:** `GET /spots/near?lat&lng&radius` returns the user's spots within a radius, ranked by distance.

**Why:** The read-side heart of the journal — the whole "what are my options in this area" payoff. Also your one deliberate drop into raw SQL.

**Learn:**
- Why this can't be plain Prisma: distance math on a sphere needs PostGIS.
- `ST_MakePoint`, `ST_SetSRID` (SRID 4326 = GPS lat/lng), `ST_DWithin` (radius filter), `ST_Distance` (for ranking) — understand each, don't paste blindly.
- `prisma.$queryRaw` and **parameterization** (never string-concatenate lat/lng/radius into SQL — that's SQL injection).
- That `lat`/`lng` are Float columns, so you build the geometry inline in the query (per the plan's design).

**Build:**
- [ ] `GET /spots/near` (guarded) with a query DTO (`lat`, `lng`, `radius`), validated.
- [ ] A parameterized `$queryRaw` using `ST_DWithin` to filter and `ST_Distance` to sort, scoped to `ownerId = me`.
- [ ] Return `NearbySpot[]` (spots + `distanceMeters`) from `@parkable/shared`.

**Verify:**
- [ ] Seed a few spots at known coords; query with a radius that should include some and exclude others → correct set, sorted nearest-first, with sane distances.
- [ ] Confirm distances look right (spot-check against a known real-world distance).

**Done when:** the radius query returns the right spots, distance-ranked, and only yours.

---

## Goal 11 — Automated tests (lock it in)

**Goal:** e2e tests covering the critical paths so you can refactor without fear.

**Why:** Proves the whole thing works end-to-end and documents intended behavior. The auth + ownership + PostGIS paths especially can't be confidently mocked — test them for real.

**Learn:**
- `supertest` + Jest: firing real HTTP requests at an in-memory Nest app.
- Testing against a **real test Postgres** (migrate + wipe between runs) — required because of the raw PostGIS query.
- What's worth covering vs. not (favor a few high-value e2e flows over many thin unit tests here).

**Build:**
- [ ] Test setup that boots the app against a test DB.
- [ ] Cover: register → login sets cookie → guarded route needs cookie → CRUD → **cross-user access denied** → `/spots/near` returns the right set.

**Verify:**
- [ ] `npm test` (e2e) passes from a clean DB.

**Done when:** the critical flows are green in CI-style automated tests.

---

## After the backend

Once Goals 0–11 are done, the backend is a verified, documented API. The natural next move
(per the plan) is a **thin frontend slice** to prove the real browser → cookie → CORS →
guarded-route path — the one thing Swagger can't fully validate. That's the start of the
frontend roadmap.

## Suggested checkpoints to ask for help
- PostGIS extension inside a Prisma migration (Goal 3).
- Extracting the JWT from a cookie in `JwtStrategy` (Goal 8) — the most common snag.
- Getting cookies to flow in Swagger's "Try it out" (Goal 4/7).
- Writing the `ST_DWithin` raw query with proper parameterization (Goal 10).
- Test DB lifecycle for e2e (Goal 11).
