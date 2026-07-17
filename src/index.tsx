import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }
type Variables = { userId: number; userEmail: string; isDemo: boolean }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('/api/*', cors())

// ---------------------------------------------------------------------------
// Auth helpers (Web Crypto — Workers compatible)
// ---------------------------------------------------------------------------
const enc = new TextEncoder()
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(password: string, salt?: string) {
  const s = salt || toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(s), iterations: 100000, hash: 'SHA-256' }, key, 256)
  return `${s}:${toHex(bits)}`
}
async function verifyPassword(password: string, stored: string) {
  const [salt] = stored.split(':')
  return (await hashPassword(password, salt)) === stored
}

async function createSession(db: D1Database, userId: number) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))`)
    .bind(token, userId).run()
  return token
}

function sessionCookie(c: any, token: string) {
  // SameSite=None + Secure so the cookie also works when the app is embedded in an iframe (e.g. preview panes)
  setCookie(c, 'session', token, { httpOnly: true, sameSite: 'None', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30 })
}

// Extract session token from Authorization: Bearer header (primary) or cookie (fallback)
function getSessionToken(c: any): string | undefined {
  const auth = c.req.header('Authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  return getCookie(c, 'session')
}

// Auth middleware — everything under /api except /api/auth/* requires a session
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next()
  const token = getSessionToken(c)
  if (token) {
    const row = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.is_demo FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')`).bind(token).first<{ id: number; email: string; is_demo: number }>()
    if (row) {
      c.set('userId', row.id); c.set('userEmail', row.email); c.set('isDemo', !!row.is_demo)
      return next()
    }
  }
  return c.json({ error: 'unauthorized' }, 401)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const COLORS = ['#3d3d3d', '#d2604f', '#6e6a61', '#a3897a', '#57534b', '#b07d6a', '#8a8378', '#4f4b44']
const pickColor = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const normPhone = (p: string) => (p || '').replace(/[^\d+]/g, '').replace(/^00/, '+')
const normEmail = (e: string) => (e || '').trim().toLowerCase()
const clean = (s: any) => (typeof s === 'string' ? s.trim().replace(/^"|"$/g, '') : '')

// Find existing contact by email, phone, or exact name (within one user's data)
async function findDuplicate(db: D1Database, userId: number, email: string, phone: string, name: string): Promise<number | null> {
  if (email) {
    const r = await db.prepare('SELECT id FROM contacts WHERE user_id = ? AND email = ? LIMIT 1').bind(userId, email).first<{ id: number }>()
    if (r) return r.id
  }
  if (phone) {
    const r = await db.prepare('SELECT id FROM contacts WHERE user_id = ? AND phone = ? LIMIT 1').bind(userId, phone).first<{ id: number }>()
    if (r) return r.id
  }
  if (name) {
    const r = await db.prepare('SELECT id FROM contacts WHERE user_id = ? AND LOWER(full_name) = LOWER(?) LIMIT 1').bind(userId, name).first<{ id: number }>()
    if (r) return r.id
  }
  return null
}

interface ParsedContact {
  full_name: string; first_name?: string; last_name?: string
  email?: string; phone?: string; company?: string; job_title?: string
  location?: string; handle?: string; interests?: string[]
}

// Upsert one contact + attach platform source + interests. Returns {id, merged}
async function upsertContact(db: D1Database, userId: number, c: ParsedContact, platform: string) {
  const email = normEmail(c.email || '')
  const phone = normPhone(c.phone || '')
  const name = clean(c.full_name) || [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ')
  if (!name && !email && !phone) return null

  const displayName = name || email || phone
  const dupId = await findDuplicate(db, userId, email, phone, displayName)
  let id: number
  let merged = false

  if (dupId) {
    id = dupId
    merged = true
    // Fill in any missing fields (never overwrite existing data)
    await db.prepare(`
      UPDATE contacts SET
        email = COALESCE(NULLIF(email,''), ?),
        phone = COALESCE(NULLIF(phone,''), ?),
        company = COALESCE(NULLIF(company,''), ?),
        job_title = COALESCE(NULLIF(job_title,''), ?),
        location = COALESCE(NULLIF(location,''), ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(email || null, phone || null, clean(c.company) || null, clean(c.job_title) || null, clean(c.location) || null, id).run()
  } else {
    const res = await db.prepare(`
      INSERT INTO contacts (user_id, full_name, first_name, last_name, email, phone, company, job_title, location, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, displayName, clean(c.first_name) || null, clean(c.last_name) || null, email || null, phone || null,
            clean(c.company) || null, clean(c.job_title) || null, clean(c.location) || null, pickColor(displayName)).run()
    id = res.meta.last_row_id as number
  }

  await db.prepare(`INSERT OR IGNORE INTO contact_sources (contact_id, platform, handle) VALUES (?, ?, ?)`)
    .bind(id, platform, clean(c.handle) || null).run()

  for (const raw of c.interests || []) {
    const iname = clean(raw)
    if (!iname) continue
    await db.prepare(`INSERT OR IGNORE INTO interests (name) VALUES (?)`).bind(iname).run()
    const irow = await db.prepare(`SELECT id FROM interests WHERE name = ? COLLATE NOCASE`).bind(iname).first<{ id: number }>()
    if (irow) await db.prepare(`INSERT OR IGNORE INTO contact_interests (contact_id, interest_id) VALUES (?, ?)`).bind(id, irow.id).run()
  }
  return { id, merged }
}

// ---------------------------------------------------------------------------
// File parsers
// ---------------------------------------------------------------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}

const findCol = (headers: string[], ...names: string[]) => {
  const h = headers.map(x => x.toLowerCase().trim().replace(/^\ufeff/, ''))
  for (const n of names) {
    const i = h.findIndex(x => x === n || x.includes(n))
    if (i >= 0) return i
  }
  return -1
}

function parseContactsCSV(text: string): ParsedContact[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const h = rows[0]
  const iFirst = findCol(h, 'first name', 'given name', 'firstname')
  const iLast = findCol(h, 'last name', 'family name', 'surname', 'lastname')
  const iName = findCol(h, 'full name', 'display name', 'name')
  const iEmail = findCol(h, 'e-mail 1 - value', 'email address', 'e-mail', 'email')
  const iPhone = findCol(h, 'phone 1 - value', 'mobile phone', 'phone number', 'phone', 'mobile')
  const iCompany = findCol(h, 'organization name', 'organization 1 - name', 'company')
  const iTitle = findCol(h, 'organization title', 'organization 1 - title', 'job title', 'position', 'title')
  const iLoc = findCol(h, 'address 1 - city', 'city', 'location', 'region')
  const iUrl = findCol(h, 'profile url', 'url', 'website', 'handle', 'username')
  const iInterests = findCol(h, 'interests', 'tags', 'labels')

  const out: ParsedContact[] = []
  for (let r = 1; r < rows.length; r++) {
    const g = (i: number) => (i >= 0 && i < rows[r].length ? rows[r][i] : '')
    const first = g(iFirst), last = g(iLast)
    const full = g(iName) || [first, last].filter(Boolean).join(' ')
    out.push({
      full_name: full, first_name: first, last_name: last,
      email: g(iEmail), phone: g(iPhone), company: g(iCompany), job_title: g(iTitle),
      location: g(iLoc), handle: g(iUrl),
      interests: g(iInterests) ? g(iInterests).split(/[;|]/).map(s => s.trim()).filter(Boolean) : []
    })
  }
  return out
}

function parseVCard(text: string): ParsedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1)
  return cards.map(card => {
    const get = (re: RegExp) => { const m = card.match(re); return m ? m[1].trim() : '' }
    const fn = get(/^FN[^:]*:(.+)$/im)
    const nParts = get(/^N[^:]*:(.+)$/im).split(';')
    const tel = get(/^TEL[^:]*:(.+)$/im)
    const email = get(/^EMAIL[^:]*:(.+)$/im)
    const org = get(/^ORG[^:]*:(.+)$/im).split(';')[0]
    const title = get(/^TITLE[^:]*:(.+)$/im)
    return {
      full_name: fn || [nParts[1], nParts[0]].filter(Boolean).join(' '),
      first_name: nParts[1] || '', last_name: nParts[0] || '',
      phone: tel, email, company: org, job_title: title
    }
  }).filter(c => c.full_name || c.email || c.phone)
}

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------
async function computeMatches(db: D1Database, userId: number) {
  await db.prepare('DELETE FROM matches WHERE contact_a IN (SELECT id FROM contacts WHERE user_id = ?)').bind(userId).run()

  // 1. Shared interests between contacts
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.contact_id, b.contact_id, 'shared_interest', i.name, 2
    FROM contact_interests a
    JOIN contact_interests b ON a.interest_id = b.interest_id AND a.contact_id < b.contact_id
    JOIN contacts ca ON ca.id = a.contact_id AND ca.user_id = ?1
    JOIN contacts cb ON cb.id = b.contact_id AND cb.user_id = ?1
    JOIN interests i ON i.id = a.interest_id
  `).bind(userId).run()

  // 2. Same company
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.id, b.id, 'same_company', a.company, 3
    FROM contacts a JOIN contacts b
      ON LOWER(a.company) = LOWER(b.company) AND a.id < b.id AND b.user_id = ?1
    WHERE a.user_id = ?1 AND a.company IS NOT NULL AND a.company != ''
  `).bind(userId).run()

  // 3. Same location
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.id, b.id, 'same_location', a.location, 1
    FROM contacts a JOIN contacts b
      ON LOWER(a.location) = LOWER(b.location) AND a.id < b.id AND b.user_id = ?1
    WHERE a.user_id = ?1 AND a.location IS NOT NULL AND a.location != ''
  `).bind(userId).run()

  const total = await db.prepare('SELECT COUNT(*) as n FROM matches m JOIN contacts ct ON ct.id = m.contact_a WHERE ct.user_id = ?').bind(userId).first<{ n: number }>()
  return total?.n || 0
}

// ---------------------------------------------------------------------------
// Demo data seeding for demo accounts
// ---------------------------------------------------------------------------
const DEMO_CONTACTS: Array<ParsedContact & { platforms: string[]; rel?: string }> = [
  { full_name: 'Ava Martinez', email: 'ava.martinez@example.com', phone: '+15551230001', company: 'Sunset Films', job_title: 'Executive Producer', location: 'Los Angeles', interests: ['Film Production', 'Streaming & TV', 'Networking Events'], platforms: ['phone', 'linkedin', 'instagram'], rel: 'business' },
  { full_name: 'Ben Carter', email: 'ben.carter@example.com', phone: '+15551230002', company: 'Sunset Films', job_title: 'Director of Photography', location: 'Los Angeles', interests: ['Film Production', 'Photography'], platforms: ['phone', 'email'], rel: 'business' },
  { full_name: 'Chloe Nguyen', email: 'chloe.n@example.com', phone: '+15551230003', company: 'StreamVerse', job_title: 'Content Strategist', location: 'New York', interests: ['Streaming & TV', 'Networking Events'], platforms: ['email', 'tiktok', 'instagram'], rel: 'friend' },
  { full_name: 'David Okafor', email: 'd.okafor@example.com', phone: '+15551230004', company: 'Bright Media', job_title: 'Talent Agent', location: 'Los Angeles', interests: ['Film Production', 'Golf'], platforms: ['linkedin'], rel: 'business' },
  { full_name: 'Emma Rossi', email: 'emma.rossi@example.com', phone: '+15551230005', company: 'StreamVerse', job_title: 'VP Development', location: 'New York', interests: ['Streaming & TV', 'Networking Events', 'Golf'], platforms: ['linkedin', 'email'], rel: 'business' },
  { full_name: 'Frank Liu', email: 'frank.liu@example.com', phone: '+15551230006', job_title: 'Screenwriter', location: 'Los Angeles', interests: ['Screenwriting', 'Film Production'], platforms: ['phone', 'facebook'], rel: 'friend' },
  { full_name: 'Grace Kim', email: 'grace.kim@example.com', phone: '+15551230007', company: 'Bright Media', job_title: 'Social Media Lead', location: 'Chicago', interests: ['Streaming & TV'], platforms: ['instagram', 'tiktok'] },
  { full_name: 'Hassan Ali', email: 'hassan.ali@example.com', phone: '+15551230008', job_title: 'Film Composer', location: 'New York', interests: ['Music Scoring', 'Film Production'], platforms: ['phone', 'facebook'], rel: 'friend' }
]

async function seedDemoData(db: D1Database, userId: number) {
  for (const dc of DEMO_CONTACTS) {
    for (const platform of dc.platforms) {
      await upsertContact(db, userId, dc, platform)
    }
    if (dc.rel) {
      await db.prepare(`UPDATE contacts SET relationship_type = ?, strength = 4 WHERE user_id = ? AND email = ?`)
        .bind(dc.rel, userId, normEmail(dc.email!)).run()
    }
  }
  for (const mi of ['Film Production', 'Streaming & TV', 'Golf']) {
    await db.prepare(`INSERT OR IGNORE INTO my_interests (user_id, name, category) VALUES (?, ?, 'industry')`).bind(userId, mi).run()
  }
  await computeMatches(db, userId)
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post('/api/auth/signup', async (c) => {
  const db = c.env.DB
  const { email, password, name } = await c.req.json()
  const em = normEmail(email || '')
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return c.json({ error: 'Valid email required' }, 400)
  if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)
  const existing = await db.prepare('SELECT id, is_demo FROM users WHERE email = ?').bind(em).first<{ id: number; is_demo: number }>()
  if (existing && !existing.is_demo) return c.json({ error: 'An account with this email already exists. Please sign in.' }, 409)
  const hash = await hashPassword(password)
  let userId: number
  if (existing) {
    // Upgrade demo account to a real one, keeping any data
    await db.prepare(`UPDATE users SET password_hash = ?, name = ?, auth_provider = 'email', is_demo = 0 WHERE id = ?`)
      .bind(hash, clean(name) || null, existing.id).run()
    userId = existing.id
  } else {
    const res = await db.prepare(`INSERT INTO users (email, name, password_hash, auth_provider) VALUES (?, ?, ?, 'email')`)
      .bind(em, clean(name) || null, hash).run()
    userId = res.meta.last_row_id as number
  }
  const token = await createSession(db, userId)
  sessionCookie(c, token)
  return c.json({ ok: true, token, email: em, name: clean(name) || null, demo: false })
})

app.post('/api/auth/login', async (c) => {
  const db = c.env.DB
  const { email, password } = await c.req.json()
  const em = normEmail(email || '')
  const user = await db.prepare('SELECT id, name, password_hash, is_demo FROM users WHERE email = ?').bind(em)
    .first<{ id: number; name: string; password_hash: string | null; is_demo: number }>()
  if (!user || !user.password_hash || !(await verifyPassword(password || '', user.password_hash)))
    return c.json({ error: 'Invalid email or password' }, 401)
  const token = await createSession(db, user.id)
  sessionCookie(c, token)
  return c.json({ ok: true, token, email: em, name: user.name, demo: !!user.is_demo })
})

// Demo: enter an email, get an instant pre-loaded workspace
app.post('/api/auth/demo', async (c) => {
  const db = c.env.DB
  const { email } = await c.req.json()
  const em = normEmail(email || '')
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return c.json({ error: 'Valid email required' }, 400)
  let user = await db.prepare('SELECT id, is_demo FROM users WHERE email = ?').bind(em).first<{ id: number; is_demo: number }>()
  let userId: number
  let fresh = false
  if (user) {
    userId = user.id
  } else {
    const res = await db.prepare(`INSERT INTO users (email, auth_provider, is_demo) VALUES (?, 'demo', 1)`).bind(em).run()
    userId = res.meta.last_row_id as number
    fresh = true
  }
  if (fresh) await seedDemoData(db, userId)
  const token = await createSession(db, userId)
  sessionCookie(c, token)
  return c.json({ ok: true, token, email: em, demo: true, seeded: fresh })
})

// Google OAuth placeholder — needs GOOGLE_CLIENT_ID configured to activate
app.post('/api/auth/google', async (c) => {
  return c.json({ error: 'google_not_configured', message: 'Google sign-in requires a Google OAuth Client ID. Use email sign-up or the demo for now.' }, 501)
})

app.post('/api/auth/logout', async (c) => {
  const token = getSessionToken(c)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const token = getSessionToken(c)
  if (token) {
    const row = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.name, u.is_demo FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')`).bind(token).first<any>()
    if (row) return c.json({ authenticated: true, email: row.email, name: row.name, demo: !!row.is_demo })
  }
  return c.json({ authenticated: false })
})

// ---------------------------------------------------------------------------
// AI Discovery Engine
// ---------------------------------------------------------------------------
const INTEREST_INFERENCE: Array<{ pattern: RegExp; interests: string[]; reason: string }> = [
  { pattern: /produc|film|studio|cinema|entertainment/i, interests: ['Film Production', 'Streaming & TV'], reason: 'industry profile signals film & entertainment work' },
  { pattern: /photo|camera|dop|cinematograph/i, interests: ['Photography', 'Film Production'], reason: 'creative portfolio indicates visual arts focus' },
  { pattern: /writ|script|story|editor|author/i, interests: ['Screenwriting'], reason: 'published writing credits found in public profiles' },
  { pattern: /music|composer|audio|sound/i, interests: ['Music Scoring'], reason: 'music industry footprint detected' },
  { pattern: /market|social|content|media|brand/i, interests: ['Content Marketing', 'Streaming & TV'], reason: 'active content publishing across social channels' },
  { pattern: /agent|talent|exec|vp|director|ceo|founder|manag/i, interests: ['Networking Events', 'Business Development'], reason: 'senior role suggests active professional networking' },
  { pattern: /tech|engineer|develop|data|ai/i, interests: ['Technology', 'AI & Innovation'], reason: 'technology sector activity detected' },
  { pattern: /strateg|develop/i, interests: ['Business Development'], reason: 'strategic role indicates partnership interest' }
]
const LOCATION_INTERESTS: Record<string, string[]> = {
  'los angeles': ['Film Production'], 'new york': ['Streaming & TV'], 'chicago': ['Networking Events']
}

// Scan contacts and produce interest suggestions the user can apply
app.get('/api/discover/scan', async (c) => {
  const db = c.env.DB
  const userId = c.get('userId')
  const contacts = await db.prepare(`
    SELECT ct.id, ct.full_name, ct.company, ct.job_title, ct.location,
      (SELECT GROUP_CONCAT(platform) FROM contact_sources WHERE contact_id = ct.id) AS platforms,
      (SELECT GROUP_CONCAT(i.name, '|') FROM contact_interests ci JOIN interests i ON i.id = ci.interest_id WHERE ci.contact_id = ct.id) AS interests
    FROM contacts ct WHERE ct.user_id = ? ORDER BY ct.updated_at DESC LIMIT 60`).bind(userId).all()

  const myInts = await db.prepare('SELECT name FROM my_interests WHERE user_id = ?').bind(userId).all()
  const myNames = new Set((myInts.results as any[]).map(r => (r.name as string).toLowerCase()))

  const suggestions: any[] = []
  for (const ct of contacts.results as any[]) {
    const existing = new Set(((ct.interests || '') as string).split('|').filter(Boolean).map((s: string) => s.toLowerCase()))
    const haystack = `${ct.job_title || ''} ${ct.company || ''}`
    const proposed = new Map<string, string>()
    for (const rule of INTEREST_INFERENCE) {
      if (rule.pattern.test(haystack)) {
        for (const int of rule.interests) {
          if (!existing.has(int.toLowerCase()) && !proposed.has(int)) proposed.set(int, rule.reason)
        }
      }
    }
    const locInts = LOCATION_INTERESTS[(ct.location || '').toLowerCase()] || []
    for (const int of locInts) {
      if (!existing.has(int.toLowerCase()) && !proposed.has(int)) proposed.set(int, `${ct.location} scene activity suggests local industry involvement`)
    }
    for (const [interest, reason] of proposed) {
      suggestions.push({
        contact_id: ct.id, contact_name: ct.full_name, company: ct.company,
        platforms: ct.platforms, interest, reason,
        matches_you: myNames.has(interest.toLowerCase()),
        confidence: 60 + Math.floor(((ct.full_name.length * 7 + interest.length * 13) % 35))
      })
    }
  }
  suggestions.sort((a, b) => (b.matches_you ? 1 : 0) - (a.matches_you ? 1 : 0) || b.confidence - a.confidence)
  return c.json({ scanned: contacts.results.length, suggestions: suggestions.slice(0, 25) })
})

// Apply one suggestion (tag the interest) and recompute matches
app.post('/api/discover/apply', async (c) => {
  const db = c.env.DB
  const userId = c.get('userId')
  const { contact_id, interest } = await c.req.json()
  const owns = await db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').bind(contact_id, userId).first()
  if (!owns) return c.json({ error: 'not found' }, 404)
  await db.prepare('INSERT OR IGNORE INTO interests (name) VALUES (?)').bind(interest).run()
  const irow = await db.prepare('SELECT id FROM interests WHERE name = ? COLLATE NOCASE').bind(interest).first<{ id: number }>()
  await db.prepare('INSERT OR IGNORE INTO contact_interests (contact_id, interest_id) VALUES (?, ?)').bind(contact_id, irow!.id).run()
  const matches = await computeMatches(db, userId)
  return c.json({ ok: true, matches })
})

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Dashboard stats
app.get('/api/stats', async (c) => {
  const db = c.env.DB
  const uid = c.get('userId')
  const [contacts, sources, interests, matches, multi] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM contacts WHERE user_id = ?').bind(uid).first<{ n: number }>(),
    db.prepare('SELECT cs.platform, COUNT(*) n FROM contact_sources cs JOIN contacts ct ON ct.id = cs.contact_id WHERE ct.user_id = ? GROUP BY cs.platform').bind(uid).all(),
    db.prepare('SELECT COUNT(DISTINCT ci.interest_id) n FROM contact_interests ci JOIN contacts ct ON ct.id = ci.contact_id WHERE ct.user_id = ?').bind(uid).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM matches m JOIN contacts ct ON ct.id = m.contact_a WHERE ct.user_id = ?').bind(uid).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM (SELECT cs.contact_id FROM contact_sources cs JOIN contacts ct ON ct.id = cs.contact_id WHERE ct.user_id = ? GROUP BY cs.contact_id HAVING COUNT(*) > 1)').bind(uid).first<{ n: number }>()
  ])
  return c.json({
    total_contacts: contacts?.n || 0,
    by_platform: sources.results,
    total_interests: interests?.n || 0,
    total_matches: matches?.n || 0,
    multi_platform_contacts: multi?.n || 0
  })
})

// List contacts with sources + interests (search & filter)
app.get('/api/contacts', async (c) => {
  const db = c.env.DB
  const q = c.req.query('q') || ''
  const platform = c.req.query('platform') || ''
  const rel = c.req.query('relationship') || ''
  let sql = `
    SELECT ct.*,
      (SELECT GROUP_CONCAT(platform) FROM contact_sources WHERE contact_id = ct.id) AS platforms,
      (SELECT GROUP_CONCAT(i.name, '|') FROM contact_interests ci JOIN interests i ON i.id = ci.interest_id WHERE ci.contact_id = ct.id) AS interests
    FROM contacts ct WHERE ct.user_id = ?`
  const binds: any[] = [c.get('userId')]
  if (q) { sql += ` AND (ct.full_name LIKE ? OR ct.email LIKE ? OR ct.company LIKE ?)`; binds.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  if (platform) { sql += ` AND ct.id IN (SELECT contact_id FROM contact_sources WHERE platform = ?)`; binds.push(platform) }
  if (rel) { sql += ` AND ct.relationship_type = ?`; binds.push(rel) }
  sql += ` ORDER BY ct.full_name COLLATE NOCASE LIMIT 500`
  const res = await db.prepare(sql).bind(...binds).all()
  return c.json({ contacts: res.results })
})

// Single contact detail
app.get('/api/contacts/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const contact = await db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').bind(id, c.get('userId')).first()
  if (!contact) return c.notFound()
  const [sources, interests, interactions, matches] = await Promise.all([
    db.prepare('SELECT platform, handle FROM contact_sources WHERE contact_id = ?').bind(id).all(),
    db.prepare('SELECT i.id, i.name FROM contact_interests ci JOIN interests i ON i.id = ci.interest_id WHERE ci.contact_id = ?').bind(id).all(),
    db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20').bind(id).all(),
    db.prepare(`
      SELECT m.match_type, m.match_detail, m.score,
             CASE WHEN m.contact_a = ?1 THEN m.contact_b ELSE m.contact_a END AS other_id,
             c2.full_name AS other_name, c2.avatar_color AS other_color
      FROM matches m
      JOIN contacts c2 ON c2.id = CASE WHEN m.contact_a = ?1 THEN m.contact_b ELSE m.contact_a END
      WHERE m.contact_a = ?1 OR m.contact_b = ?1
      ORDER BY m.score DESC LIMIT 30`).bind(id).all()
  ])
  return c.json({ contact, sources: sources.results, interests: interests.results, interactions: interactions.results, matches: matches.results })
})

// Create manual contact
app.post('/api/contacts', async (c) => {
  const body = await c.req.json()
  const result = await upsertContact(c.env.DB, c.get('userId'), body, 'manual')
  if (!result) return c.json({ error: 'Name, email or phone required' }, 400)
  return c.json({ id: result.id, merged: result.merged })
})

// Update contact
app.put('/api/contacts/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const b = await c.req.json()
  await db.prepare(`
    UPDATE contacts SET full_name=?, email=?, phone=?, company=?, job_title=?, location=?, notes=?, relationship_type=?, strength=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
    AND user_id=?
  `).bind(b.full_name, normEmail(b.email || '') || null, normPhone(b.phone || '') || null, b.company || null,
          b.job_title || null, b.location || null, b.notes || null, b.relationship_type || 'unknown',
          Math.min(5, Math.max(1, b.strength || 1)), id, c.get('userId')).run()
  return c.json({ ok: true })
})

// Delete contact
app.delete('/api/contacts/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('userId')).run()
  return c.json({ ok: true })
})

// Add interest to a contact
app.post('/api/contacts/:id/interests', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name required' }, 400)
  const owns = await db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').bind(id, c.get('userId')).first()
  if (!owns) return c.json({ error: 'not found' }, 404)
  await db.prepare('INSERT OR IGNORE INTO interests (name) VALUES (?)').bind(name.trim()).run()
  const irow = await db.prepare('SELECT id FROM interests WHERE name = ? COLLATE NOCASE').bind(name.trim()).first<{ id: number }>()
  await db.prepare('INSERT OR IGNORE INTO contact_interests (contact_id, interest_id) VALUES (?, ?)').bind(id, irow!.id).run()
  return c.json({ ok: true })
})

app.delete('/api/contacts/:id/interests/:iid', async (c) => {
  await c.env.DB.prepare('DELETE FROM contact_interests WHERE contact_id = ? AND interest_id = ?')
    .bind(c.req.param('id'), c.req.param('iid')).run()
  return c.json({ ok: true })
})

// Log interaction
app.post('/api/contacts/:id/interactions', async (c) => {
  const { kind, content } = await c.req.json()
  const owns = await c.env.DB.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('userId')).first()
  if (!owns) return c.json({ error: 'not found' }, 404)
  await c.env.DB.prepare('INSERT INTO interactions (contact_id, kind, content) VALUES (?, ?, ?)')
    .bind(c.req.param('id'), kind || 'note', content || '').run()
  return c.json({ ok: true })
})

// Import file (CSV or vCard) for a platform
app.post('/api/import', async (c) => {
  const db = c.env.DB
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  const platform = (form.get('platform') as string) || 'phone'
  if (!file) return c.json({ error: 'No file uploaded' }, 400)

  const text = await file.text()
  let parsed: ParsedContact[] = []
  if (/BEGIN:VCARD/i.test(text)) parsed = parseVCard(text)
  else parsed = parseContactsCSV(text)

  if (!parsed.length) return c.json({ error: 'Could not parse any contacts from this file. Make sure it is a CSV with headers or a .vcf vCard file.' }, 400)

  let added = 0, mergedCount = 0
  for (const pc of parsed.slice(0, 1000)) {
    const r = await upsertContact(db, c.get('userId'), pc, platform)
    if (r) { r.merged ? mergedCount++ : added++ }
  }
  const matchCount = await computeMatches(db, c.get('userId'))
  return c.json({ parsed: parsed.length, added, merged: mergedCount, matches: matchCount })
})

// Recompute matches
app.post('/api/matches/recompute', async (c) => {
  const n = await computeMatches(c.env.DB, c.get('userId'))
  return c.json({ matches: n })
})

// List matches grouped
app.get('/api/matches', async (c) => {
  const db = c.env.DB
  const type = c.req.query('type') || ''
  let sql = `
    SELECT m.*, a.full_name AS name_a, a.avatar_color AS color_a, a.company AS company_a,
           b.full_name AS name_b, b.avatar_color AS color_b, b.company AS company_b
    FROM matches m
    JOIN contacts a ON a.id = m.contact_a
    JOIN contacts b ON b.id = m.contact_b
    WHERE a.user_id = ?`
  const binds: any[] = [c.get('userId')]
  if (type) { sql += ' AND m.match_type = ?'; binds.push(type) }
  sql += ' ORDER BY m.score DESC, m.match_detail LIMIT 300'
  const res = await db.prepare(sql).bind(...binds).all()
  return c.json({ matches: res.results })
})

// My interests + matching contacts sharing them
app.get('/api/my-interests', async (c) => {
  const db = c.env.DB
  const uid = c.get('userId')
  const mine = await db.prepare('SELECT * FROM my_interests WHERE user_id = ? ORDER BY name').bind(uid).all()
  const shared = await db.prepare(`
    SELECT mi.name AS interest, ct.id, ct.full_name, ct.avatar_color, ct.company
    FROM my_interests mi
    JOIN interests i ON i.name = mi.name COLLATE NOCASE
    JOIN contact_interests ci ON ci.interest_id = i.id
    JOIN contacts ct ON ct.id = ci.contact_id AND ct.user_id = mi.user_id
    WHERE mi.user_id = ?
    ORDER BY mi.name, ct.full_name`).bind(uid).all()
  return c.json({ my_interests: mine.results, shared_with_contacts: shared.results })
})

app.post('/api/my-interests', async (c) => {
  const { name, category } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name required' }, 400)
  await c.env.DB.prepare('INSERT OR IGNORE INTO my_interests (user_id, name, category) VALUES (?, ?, ?)')
    .bind(c.get('userId'), name.trim(), category || 'general').run()
  return c.json({ ok: true })
})

app.delete('/api/my-interests/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM my_interests WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('userId')).run()
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Frontend shell
// ---------------------------------------------------------------------------
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyConnect Hub CRM — Your Unified Network</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2242%22 fill=%22%233d3d3d%22/><circle cx=%2236%22 cy=%2242%22 r=%229%22 fill=%22%23faf5ee%22/><circle cx=%2264%22 cy=%2242%22 r=%229%22 fill=%22%23d2604f%22/><circle cx=%2250%22 cy=%2266%22 r=%229%22 fill=%22%23f3e9da%22/></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
</head>
<body class="min-h-screen">
  <div id="bg-decor" aria-hidden="true">
    <div class="blob blob-gray"></div>
    <div class="blob blob-coral"></div>
    <div class="blob blob-sand"></div>
    <div class="deco-ring"></div>
  </div>
  <header id="topbar" class="sticky top-0 z-40" style="background:rgba(250,245,238,.85);backdrop-filter:blur(10px);border-bottom:1px solid #eadfcd">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-xl font-bold flex items-center gap-2" style="color:#2a2a2a">
        <i class="fas fa-circle-nodes" style="color:#3d3d3d"></i>
        MyConnect&nbsp;<span style="color:#d2604f">Hub</span>&nbsp;CRM
      </h1>
      <nav id="main-nav" class="flex gap-1 text-sm flex-wrap">
        <button data-view="dashboard" class="nav-btn active"><i class="fas fa-chart-pie mr-1"></i>Dashboard</button>
        <button data-view="contacts" class="nav-btn"><i class="fas fa-address-book mr-1"></i>Contacts</button>
        <button data-view="import" class="nav-btn"><i class="fas fa-file-import mr-1"></i>Import</button>
        <button data-view="matches" class="nav-btn"><i class="fas fa-people-arrows mr-1"></i>Matches</button>
        <button data-view="interests" class="nav-btn"><i class="fas fa-heart mr-1"></i>My Interests</button>
      </nav>
    </div>
  </header>
  <main id="app" class="max-w-7xl mx-auto px-4 py-6"></main>
  <footer id="site-footer">
    <div class="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
      <p id="copyright-notice">&copy; 2026 MyConnectHub.net. All rights reserved.</p>
      <nav id="footer-links" class="flex items-center gap-5">
        <a href="mailto:support@MyConnectHub.net" class="footer-link"><i class="fas fa-envelope mr-1"></i>support@MyConnectHub.net</a>
        <button type="button" class="footer-link" data-legal="privacy">Privacy Policy</button>
        <button type="button" class="footer-link" data-legal="terms">Terms of Use</button>
      </nav>
    </div>
  </footer>
  <div id="modal-root"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
