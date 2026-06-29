# Permian Auto Works — Booking POC

A real-time booking demo for a single-bay auto and diesel shop. Pick a service, pick
a time, and the slot is claimed the instant you confirm. **Two people can never book
the same slot — the guard lives in the database, not the app.**

Built by [cobbld](https://cobbld.com) as a proof-of-work artifact. The shop is
fictional; the software is real.

---

## The proof moment (this is the demo)

1. Open two browser windows on the same open slot.
2. Book it in one.
3. Try to book it in the other.

The second attempt is cleanly rejected with a fresh set of open times. No crash, no
double-booking. You watch it happen.

---

## How the guard works

The app **never reads availability and then inserts** — that is a race. The `INSERT`
itself is the claim: it either lands, or it bounces.

```sql
-- db/schema.sql
CREATE CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  resource_id WITH =,
  tstzrange(start_time, end_time) WITH &&
) WHERE (status = 'confirmed');
```

On insert we just `INSERT`. If a confirmed booking already overlaps, Postgres raises
an exclusion violation (`SQLSTATE 23P01`), which `lib/db.ts` catches and turns into
`{ reason: "conflict" }`. The booking route returns a `409` with refreshed times. The
conflict is **expected business flow and is never reported to Sentry** — only genuinely
unexpected failures are.

Because the constraint is scoped `WHERE (status = 'confirmed')`, **cancelling a booking
reopens its slot for free**: cancel sets `status = 'cancelled'`, the row drops out of the
constraint, and the slot is instantly bookable again. Mixed service durations (30 / 45 /
60 / 120 min) are handled natively by the range overlap — no fixed slot grid required.

---

## Stack

| Piece | Tool |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| Database | Neon Postgres (`@neondatabase/serverless`), `btree_gist` exclusion constraint |
| Admin auth | Better Auth (email + password, one owner account) |
| Errors | Sentry (`@sentry/nextjs`, manual capture; no-op without a DSN) |
| Hosting | Vercel (serverless, scale-to-zero) |

No Tailwind. Design is cobbld "Workwear" tokens in `app/globals.css` (CSS variables) +
`next/font` (Unbounded / Onest / DM Mono).

---

## Flow

```
Public booking
  service  ->  date  ->  open times  ->  name + phone  ->  CONFIRM
  (duration)  (hours)   (hours minus       (best-effort      |
                         bookings minus      display)         v
                         time-off)                       atomic INSERT
                                                          /          \
                                                   lands              bounces (23P01)
                                                   confirmation       "just booked,
                                                   screen             pick another"
                                                   // TODO: send      + fresh times
                                                   confirmation

Admin (/admin, gated)
  sign in  ->  upcoming bookings  ->  cancel (frees slot) | add time-off
```

---

## Layout

```
app/
  page.tsx                      public booking page (server) + <BookingFlow/>
  layout.tsx                    fonts + metadata
  globals.css                   Workwear design tokens + components
  admin/
    page.tsx                    gated owner dashboard (bookings, time-off)
    login/page.tsx              owner sign-in
    actions.ts                  server actions: login, logout, cancel, add time-off
  api/
    availability/route.ts       GET open times for a service + date
    bookings/route.ts           POST — the atomic claim (handles 23P01)
    auth/[...all]/route.ts       Better Auth handler
    health/route.ts             GET { ok: true }
components/
  BookingFlow.tsx               client: service -> date -> time -> details -> confirm
  AddTimeOffForm.tsx            client: admin time-off form
  BrandMark.tsx                 the cobbld 3-square mark
lib/
  db.ts                         Neon client + typed query helpers (the guard lives here)
  availability.ts               slot generation from business hours
  time.ts                       Central <-> UTC helpers (store UTC, render local)
  business-hours.ts             shop identity + hours (config-in-code, one shop)
  auth.ts                       Better Auth instance + admin seeding
  env.ts / sentry.ts            validated env access / error reporting
db/
  schema.sql                    services, bookings (+ exclusion constraint), time_off
  seed.sql                      the four demo services
```

---

## Environment variables

Copy `.env.example` to `.env.local`.

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon **pooled** connection string (`-pooler` host, `sslmode=require`). |
| `BETTER_AUTH_SECRET` | Yes | 32+ char random string signing admin sessions. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BETTER_AUTH_URL` | Yes (prod) | App public origin, e.g. `https://permian-auto.vercel.app`. Defaults to `http://localhost:3000`. |
| `ADMIN_EMAIL` | Yes | The single owner login. Only this email may reach `/admin`. |
| `ADMIN_PASSWORD` | Yes | Owner password. The account is seeded from these on first login. |
| `SENTRY_DSN` | No | If unset, Sentry is disabled (all captures no-op). |

---

## Setup

1. **Database** — apply the schema and seed to your Neon project (Neon SQL editor or psql):
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/seed.sql
   ```
   Then create the Better Auth tables (`user`, `session`, `account`, `verification`):
   ```bash
   npx @better-auth/cli migrate
   ```
2. **Install + run**
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```
3. **Deploy** — push to GitHub, import into Vercel (framework auto-detected). Set all the
   env vars above in the Vercel project, including `BETTER_AUTH_URL` = the deployed origin.
4. **First admin login** — go to `/admin`, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
   The owner account is created automatically on that first attempt.

---

## Verify (the done-when test)

The whole point is that two racers cannot book the same slot. Prove it with two curl
calls against the same open start time (replace the date with an open weekday):

```bash
SLOT="2026-06-29T15:00:00.000Z"   # 10:00 AM Central
# First claim lands:
curl -s -X POST localhost:3000/api/bookings -H 'Content-Type: application/json' \
  -d "{\"serviceId\":1,\"date\":\"2026-06-29\",\"startIso\":\"$SLOT\",\"name\":\"A\",\"phone\":\"4325550100\"}"
# -> { "ok": true, ... }

# Identical second claim bounces on the constraint:
curl -s -i -X POST localhost:3000/api/bookings -H 'Content-Type: application/json' \
  -d "{\"serviceId\":1,\"date\":\"2026-06-29\",\"startIso\":\"$SLOT\",\"name\":\"B\",\"phone\":\"4325550200\"}"
# -> HTTP 409  { "ok": false, "reason": "conflict", "slots": [ ...fresh times... ] }
```

Or do it visually with two browser windows, per "The proof moment" above.

---

## Design notes & known v1 limitations

- **Store UTC, render local.** All times are `timestamptz` (UTC); everything is displayed
  in the shop's Central time. Conversions are DST-aware via `Intl` (`lib/time.ts`), no date
  library.
- **One bay** (`resource_id` defaults to `1`). Multi-bay is a small extension: seed more
  resources and add a picker — `resource_id` is already in the constraint.
- **Time-off** is subtracted from availability read-side *and* re-checked best-effort inside
  `createBooking` before the insert. Customer-vs-customer overlap is guarded atomically by the
  exclusion constraint; owner time-off has no DB constraint (it is owner-managed, not a hot race),
  so a sufficiently tight race could still slip a booking onto blocked time, which the owner can cancel.
- **Admin sign-up is locked down.** The single owner account is seeded at server startup
  (`instrumentation.ts`), and a Better Auth `databaseHooks` rejects any sign-up whose email is not
  `ADMIN_EMAIL` — so the public endpoint cannot create a stranger's account or pre-register the owner.
  Access to `/admin` is additionally gated on the owner email (compared case-insensitively).
- **Confirmation is on-screen only.** The success branch in `app/api/bookings/route.ts` carries
  a `// TODO: send confirmation` hook where a real Twilio/Resend send would fire. The timed
  reminder/review/no-show sequences (Inngest) are a later layer, intentionally not in this POC.
- **No payment, no PII beyond name / phone / optional email.**
