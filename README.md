# MyConnect Hub CRM

## Project Overview
- **Name**: MyConnect Hub CRM
- **Goal**: Unify contacts from phone, email, LinkedIn, Facebook, Instagram and TikTok into one personal CRM, automatically merge duplicates across platforms, and surface matches based on shared interests, companies, locations, friendships and business ties.
- **Owner**: Liz

## URLs
- **Sandbox (dev)**: https://3000-i13fighxsv6oz40dkfgx7-dfc00ec5.sandbox.novita.ai
- **Production**: not deployed yet (Cloudflare Pages ready)

## Currently Completed Features
- Landing/intro page with sign-in, create-account, Google button (placeholder until OAuth Client ID provided) and instant email demo
- Auth: email+password accounts (PBKDF2 hashed), 30-day cookie sessions, per-user data isolation; demo accounts auto-seeded and upgradeable to real accounts
- AI Discovery Engine on dashboard: live activity feed narrating contact research, interest-match suggestions with confidence scores, one-click Apply that tags + recomputes matches
- ✅ **Dashboard** — total contacts, matches, multi-platform people, interests, doughnut chart of contacts by platform
- ✅ **Contact list** — search, filter by platform & relationship type, avatar cards with platform badges + interest tags
- ✅ **Contact detail** — sources, interests (add/remove), matches with other contacts, interaction log (notes/calls/meetings), edit/delete
- ✅ **Manual add/edit contacts** — relationship type (friend/business/family/acquaintance) + strength 1–5
- ✅ **File import** for 6 platforms — accepts **CSV** (Google/Outlook/LinkedIn Connections.csv and generic) and **vCard (.vcf)** from iPhone/Android
- ✅ **Automatic dedupe/merge** — matches on email → phone → exact name; fills in missing fields, never overwrites
- ✅ **Matching engine** — computes pairs by shared interest, same company, same location; grouped match browser with recompute
- ✅ **My Interests** — track your own interests and see which contacts share them (who to talk to about what)

## Functional API Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` `/api/auth/login` `/api/auth/demo` `/api/auth/logout` | Auth flows |
| GET | `/api/auth/me` | Session check |
| GET | `/api/discover/scan` | AI engine: scan contacts for interest suggestions |
| POST | `/api/discover/apply` | Apply a suggestion (tag interest + recompute) |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/contacts?q=&platform=&relationship=` | List/search contacts |
| GET/PUT/DELETE | `/api/contacts/:id` | Contact detail / update / delete |
| POST | `/api/contacts` | Add manual contact (auto-dedupes) |
| POST/DELETE | `/api/contacts/:id/interests[/:iid]` | Tag/untag interests |
| POST | `/api/contacts/:id/interactions` | Log note/call/meeting |
| POST | `/api/import` | multipart: `file` (.csv/.vcf) + `platform` |
| GET | `/api/matches?type=` | List matches (shared_interest/same_company/same_location) |
| POST | `/api/matches/recompute` | Rebuild match graph |
| GET/POST/DELETE | `/api/my-interests[/:id]` | Manage my interests + overlap view |

## Data Architecture
- **Storage**: Cloudflare D1 (SQLite) — local dev uses `--local` SQLite in `.wrangler/state`
- **Tables**: `users`, `sessions`, `contacts`, `contact_sources` (platform links), `interests`, `contact_interests`, `my_interests`, `matches`, `interactions`
- **Data flow**: file upload → parser (CSV/vCard) → dedupe upsert → source tagging → match recompute

## User Guide
1. **Export your contacts** from each platform (none allow direct API pulls anymore):
   - iPhone: iCloud.com → Contacts → Export vCard | Android: Contacts → Export
   - Google: contacts.google.com → Export → Google CSV | Outlook: People → Export
   - LinkedIn: Settings → Data privacy → Get a copy of your data → Connections.csv
   - Facebook/Instagram/TikTok: "Download your information" → convert/save as CSV
2. Go to **Import**, pick the platform, drop the file — duplicates across platforms merge automatically.
3. Open contacts to tag **interests**, set relationship type & strength, log interactions.
4. Add **My Interests** to see who in your network shares them.
5. Browse **Matches** to discover shared-interest, same-company and same-location clusters.

## Features Not Yet Implemented
- Direct OAuth sync (blocked by platform APIs) — file import is the supported path
- Fuzzy name matching (nicknames, typos) for dedupe
- Reminders / follow-up scheduling
- Export CRM back to CSV
- Real Google OAuth (button present; needs GOOGLE_CLIENT_ID)
- Live web scraping in discovery engine (edge runtime can't scrape; currently signal-based inference — can wire a search API)

## Recommended Next Steps
1. Deploy to Cloudflare Pages + create production D1 database
2. Add fuzzy dedupe (Levenshtein on names) with a manual "merge these two?" review UI
3. Follow-up reminders ("haven't talked to X in 90 days")
4. CSV export of the whole CRM

## Deployment
- **Platform**: Cloudflare Pages (ready, not yet deployed)
- **Status**: ✅ Active in sandbox
- **Tech Stack**: Hono + TypeScript + Cloudflare D1 + TailwindCSS (CDN) + Chart.js
- **Local dev**: `npm run build && pm2 start ecosystem.config.cjs`
- **DB**: `npx wrangler d1 migrations apply webapp-production --local` then seed with `seed.sql`
- **Last Updated**: 2026-07-07
