# 🚀 FitFuel — Integrated Fitness App + Cloud Kitchen

**Phase 0 + 1A + 1B complete backend + PWA frontend**

> Fitness tracking · Nutrition logging · Cloud kitchen · AI coaching  
> Railway (PostgreSQL + Redis) · Vanilla JS PWA · Offline-first

---

## Table of Contents
1. [Architecture Overview](#architecture)
2. [Tech Stack](#tech-stack)
3. [Local Setup](#local-setup)
4. [Railway Deployment](#railway-deployment)
5. [Environment Variables](#environment-variables)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Running Tests](#running-tests)
9. [Phase Roadmap](#phase-roadmap)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              PWA Frontend (Netlify)          │
│  Vanilla JS · IndexedDB · Service Worker     │
│  Offline-first · Installable PWA             │
└──────────────────┬──────────────────────────┘
                   │ HTTPS REST
┌──────────────────▼──────────────────────────┐
│           Express API (Railway)              │
│  JWT Auth · Rate Limit · Validation          │
├──────────────────────────────────────────────┤
│   Controllers: Auth · Profile · Workout      │
│                Meal · Nutrition · Dashboard  │
│                Sync · Push                   │
├──────────────┬───────────────────────────────┤
│  PostgreSQL  │  Redis                        │
│  (Prisma)    │  Rate limiting · Session cache│
└──────────────┴───────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| ORM | Prisma 5 |
| Database | PostgreSQL (Railway managed) |
| Cache / Rate Limit | Redis (Railway managed) |
| Auth | JWT + bcrypt PIN hashing |
| Logging | Pino (pretty dev / JSON prod) |
| Validation | express-validator |
| Email | Nodemailer (SendGrid / SMTP) |
| Frontend | Vanilla JS PWA |
| Charts | Chart.js 4 |
| Testing | Jest + Supertest |
| Deployment | Railway (backend) · Netlify (frontend) |

---

## Local Setup

### Prerequisites
- Node.js ≥ 18
- PostgreSQL 15 (or Docker)
- Redis (optional — falls back to memory)

### Steps

```bash
# 1. Clone
git clone https://github.com/yourname/fitfuel-backend
cd fitfuel-backend

# 2. Install dependencies
npm install

# 3. Copy env
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET at minimum

# 4. Push schema to DB
npm run db:push

# 5. Seed (100+ Indian foods, achievements, kitchen, GPS segments)
npm run db:seed

# 6. Start dev server
npm run dev
# → http://localhost:3000
# → http://localhost:3000/api/health
```

### With Docker (PostgreSQL + Redis)

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=fitfuel -p 5432:5432 postgres:15
docker run -d --name redis -p 6379:6379 redis:7

# In .env:
# DATABASE_URL=postgresql://postgres:pass@localhost:5432/fitfuel
# REDIS_URL=redis://localhost:6379
```

---

## Railway Deployment

### One-time setup

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "FitFuel Phase 1"
git remote add origin https://github.com/you/fitfuel-backend
git push -u origin main

# 2. Railway dashboard → New Project → Deploy from GitHub Repo
# 3. Add PostgreSQL plugin  (DATABASE_URL auto-injected)
# 4. Add Redis plugin       (REDIS_URL auto-injected)
# 5. Set env vars (see below)
```

Railway auto-runs on every push:
```
prisma migrate deploy && node src/server.js
```
(defined in `railway.json`)

### Seed production DB once

```bash
railway run npm run db:seed
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (auto on Railway) |
| `REDIS_URL` | ✅ | Redis connection string (auto on Railway) |
| `JWT_SECRET` | ✅ | Min 32 chars random string |
| `JWT_EXPIRES_IN` | | Default `7d` |
| `PORT` | | Default `3000` |
| `NODE_ENV` | | `production` on Railway |
| `FRONTEND_URL` | | Your Netlify URL for CORS |
| `EMAIL_HOST` | | SMTP host (SendGrid: `smtp.sendgrid.net`) |
| `EMAIL_USER` | | SMTP user (`apikey` for SendGrid) |
| `EMAIL_PASS` | | SMTP password / API key |
| `EMAIL_FROM` | | From address |
| `CLAUDE_API_KEY` | Phase 2B | Anthropic API key |
| `GOOGLE_MAPS_API_KEY` | Phase 1C | For delivery tracking |

---

## Database Schema

25+ tables covering all 3 phases:

```
Auth:         users · sessions · otp_tokens
Profile:      fitness_profiles · user_goals
Fitness:      workouts · exercise_logs · segments · segment_times
Nutrition:    foods · meal_items · daily_summaries · voice_logs · vision_logs
Kitchen:      cloud_kitchens · kitchen_meals · orders · order_items
              subscriptions · deliveries · ingredient_inventory · meal_reviews
Social:       friends · kudos · clubs · club_members · challenges
              challenge_participants
Gamification: achievements · user_achievements · user_points · leaderboards
Wearables:    wearable_integrations · wearable_data
AI / Wellbeing: ai_insights · mood_tracking · meal_templates · template_items
                recipe_reviews
Sync:         sync_queue
```

---

## API Reference

All responses: `{ success: bool, message: string, data: {} }`

### Auth
```
POST /api/auth/register        { email, pin(6-digit), name? }
POST /api/auth/login           { email, pin }
POST /api/auth/forgot-password { email }
POST /api/auth/reset-pin       { email, otp, new_pin }
POST /api/auth/logout          Bearer token
POST /api/auth/logout-all      Bearer token
GET  /api/auth/me              Bearer token
```

### Profile
```
POST  /api/profile             { age, gender, height_cm, weight_kg, activity_level, primary_goal }
GET   /api/profile
POST  /api/profile/goals       { target_calories, target_protein_g, target_carbs_g, target_fats_g }
GET   /api/profile/goals
PATCH /api/profile/weight      { weight_kg }
GET   /api/profile/recommended-macros
```

### Workouts (all 6 types)
```
POST /api/workouts/cardio      { duration_min, intensity, date }
POST /api/workouts/resistance  { exercises: [{ exercise, sets: [{ reps, weight_kg }] }], date }
POST /api/workouts/yoga        { yoga_type, duration_min, date }
POST /api/workouts/aerobics    { duration_min, intensity, date }
POST /api/workouts/running     { distance_km?, duration_min?, route_name?, date }
POST /api/workouts/trekking    { distance_km?, duration_min, elevation_m?, trail_name?, date }
GET  /api/workouts             ?date=YYYY-MM-DD&type=CARDIO&page=1&limit=20
GET  /api/workouts/stats       ?period=WEEK|MONTH|YEAR
PUT  /api/workouts/:id
DELETE /api/workouts/:id
```

### Meals & Foods
```
GET  /api/meals/foods          ?q=rice&category=GRAIN&page=1    (public)
GET  /api/meals/foods/barcode/:barcode                           (public)
GET  /api/meals/foods/:id                                        (public)
POST /api/meals/calculate      { food_id, quantity_raw }  — preview, no log
POST /api/meals                { food_id, meal_type, date, quantity_raw }
POST /api/meals/bulk           { items: [{ food_id, quantity_raw }], meal_type, date }
GET  /api/meals                ?date=YYYY-MM-DD&meal_type=BREAKFAST
PUT  /api/meals/:id            { quantity_raw }
DELETE /api/meals/:id
POST /api/meals/voice          { transcript, parsed_foods }
```

### Nutrition (Phase 1B)
```
GET /api/nutrition/daily       ?date=YYYY-MM-DD   — 18 nutrients + recommendations
GET /api/nutrition/weekly      ?days=7            — trend data for charts
GET /api/nutrition/top-foods   ?days=30           — most-eaten foods
GET /api/nutrition/history     ?start_date&end_date&page
GET /api/nutrition/compare     ?food_a=ID&food_b=ID
```

### Dashboard
```
GET  /api/daily-summary        ?date=YYYY-MM-DD
GET  /api/weekly-summary
POST /api/mood                 { date?, sleep_hours, mood_rating, stress_level, energy_level, recovery_state }
GET  /api/mood                 ?start=YYYY-MM-DD&end=YYYY-MM-DD
POST /api/water                { ml, date? }
```

### Sync (offline-first)
```
POST /api/sync                 { items: [{ method, url, body }] }
GET  /api/sync/status
POST /api/push/subscribe       { subscription, device_name }
```

### Health
```
GET /api/health                → { status, version, db, uptime_s }
```

---

## Running Tests

```bash
# All tests (requires DB connection)
npm test

# Specific suite
npx jest tests/auth.test.js
npx jest tests/workout.test.js
npx jest tests/meal.test.js
npx jest tests/profile.test.js
```

Test coverage:
- ✅ Auth: register, login, PIN validation, rate limiting, session, logout
- ✅ Workouts: all 6 types, calorie calc, CRUD, stats
- ✅ Meals: food search, log, bulk log, CRUD, daily summary, nutrition
- ✅ Profile: CRUD, TDEE calc, macro calc, goals
- ✅ Calc utils: BMR, TDEE, MET burn, food nutrition (unit tests)

---

## Phase Roadmap

| Phase | Weeks | Status |
|-------|-------|--------|
| **Phase 0** — Foundation | 1–4 | ✅ Complete |
| **Phase 1A** — Auth + Workouts + Meals | 5–12 | ✅ Complete |
| **Phase 1B** — Nutrition + Charts + Offline Sync | 13–20 | ✅ Complete |
| **Phase 1C** — Cloud Kitchen + Orders | 21–28 | 🔜 Next |
| **Phase 2A** — Gamification + Social + Wearables | 29–36 | 🔜 Planned |
| **Phase 2B** — AI Photo + Claude Insights | 37–44 | 🔜 Planned |
| **Phase 2C** — Multi-city Kitchen + Customisation | 45–52 | 🔜 Planned |

### Phase 1C next sprint:
- `POST /api/kitchen/register` — kitchen setup
- `GET /api/kitchens?city=bangalore`
- `GET /api/kitchen-meals` — menu
- `POST /api/orders` — place order (per-item / subscription)
- `GET /api/orders/:id/track` — real-time delivery tracking
- `POST /api/orders/:id/otp-verify` — delivery confirmation
- `POST /api/nutrition/auto-log` — auto-log delivered meals
- Swiggy/Zomato webhook integration
- Kitchen staff dashboard (order queue, prep status)

---

## Seeded Data

After `npm run db:seed`:
- **109 Indian foods** across 12 categories (Grains, Legumes, Protein, Dairy, Vegetables, Fruits, Nuts, Fats, Beverages, Spices, Prepared, Condiments)
- **14 achievements** (Fitness, Nutrition, Kitchen, Social, Streak)
- **1 cloud kitchen** (Bangalore, Jayanagar)
- **5 GPS segments** (Cubbon Park, Lalbagh, Ulsoor Lake, Nandi Hills, Skandagiri)

---

## Frontend PWA

Served from `/assets/index.html` at the root URL.

**Add to Home Screen** on iOS/Android for full PWA experience.

Features:
- 🔐 6-digit PIN auth with animated dot inputs
- 📊 Dashboard with Apple Watch-style macro rings
- 🏋️ All 6 workout types with smart calorie calculation
- 🍽️ Food search (100+ Indian foods), bulk logging, voice logging
- 🧬 18-nutrient breakdown with progress bars + recommendations  
- 📈 7-day calorie/protein trend chart (Chart.js)
- 💧 Water tracker
- 🔥 Streak counter
- 📷 Barcode scanner (BarcodeDetector API — Chrome/Edge)
- 🎤 Voice logging (Web Speech API)
- 📶 Offline-first with sync queue
- 🌐 Installable PWA (manifest + service worker)

---

*Built with ❤️ for Indian fitness culture*
