import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', cors())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#22c55e']
const pickColor = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const normPhone = (p: string) => (p || '').replace(/[^\d+]/g, '').replace(/^00/, '+')
const normEmail = (e: string) => (e || '').trim().toLowerCase()
const clean = (s: any) => (typeof s === 'string' ? s.trim().replace(/^"|"$/g, '') : '')

// Find existing contact by email, phone, or exact name → returns id or null
async function findDuplicate(db: D1Database, email: string, phone: string, name: string): Promise<number | null> {
  if (email) {
    const r = await db.prepare('SELECT id FROM contacts WHERE email = ? LIMIT 1').bind(email).first<{ id: number }>()
    if (r) return r.id
  }
  if (phone) {
    const r = await db.prepare('SELECT id FROM contacts WHERE phone = ? LIMIT 1').bind(phone).first<{ id: number }>()
    if (r) return r.id
  }
  if (name) {
    const r = await db.prepare('SELECT id FROM contacts WHERE LOWER(full_name) = LOWER(?) LIMIT 1').bind(name).first<{ id: number }>()
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
async function upsertContact(db: D1Database, c: ParsedContact, platform: string) {
  const email = normEmail(c.email || '')
  const phone = normPhone(c.phone || '')
  const name = clean(c.full_name) || [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ')
  if (!name && !email && !phone) return null

  const displayName = name || email || phone
  const dupId = await findDuplicate(db, email, phone, displayName)
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
      INSERT INTO contacts (full_name, first_name, last_name, email, phone, company, job_title, location, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(displayName, clean(c.first_name) || null, clean(c.last_name) || null, email || null, phone || null,
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
async function computeMatches(db: D1Database) {
  await db.prepare('DELETE FROM matches').run()

  // 1. Shared interests between contacts
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.contact_id, b.contact_id, 'shared_interest', i.name, 2
    FROM contact_interests a
    JOIN contact_interests b ON a.interest_id = b.interest_id AND a.contact_id < b.contact_id
    JOIN interests i ON i.id = a.interest_id
  `).run()

  // 2. Same company
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.id, b.id, 'same_company', a.company, 3
    FROM contacts a JOIN contacts b
      ON LOWER(a.company) = LOWER(b.company) AND a.id < b.id
    WHERE a.company IS NOT NULL AND a.company != ''
  `).run()

  // 3. Same location
  await db.prepare(`
    INSERT OR IGNORE INTO matches (contact_a, contact_b, match_type, match_detail, score)
    SELECT a.id, b.id, 'same_location', a.location, 1
    FROM contacts a JOIN contacts b
      ON LOWER(a.location) = LOWER(b.location) AND a.id < b.id
    WHERE a.location IS NOT NULL AND a.location != ''
  `).run()

  const total = await db.prepare('SELECT COUNT(*) as n FROM matches').first<{ n: number }>()
  return total?.n || 0
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

// Dashboard stats
app.get('/api/stats', async (c) => {
  const db = c.env.DB
  const [contacts, sources, interests, matches, multi] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM contacts').first<{ n: number }>(),
    db.prepare('SELECT platform, COUNT(*) n FROM contact_sources GROUP BY platform').all(),
    db.prepare('SELECT COUNT(*) n FROM interests').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM matches').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM (SELECT contact_id FROM contact_sources GROUP BY contact_id HAVING COUNT(*) > 1)').first<{ n: number }>()
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
    FROM contacts ct WHERE 1=1`
  const binds: any[] = []
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
  const contact = await db.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first()
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
  const result = await upsertContact(c.env.DB, body, 'manual')
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
  `).bind(b.full_name, normEmail(b.email || '') || null, normPhone(b.phone || '') || null, b.company || null,
          b.job_title || null, b.location || null, b.notes || null, b.relationship_type || 'unknown',
          Math.min(5, Math.max(1, b.strength || 1)), id).run()
  return c.json({ ok: true })
})

// Delete contact
app.delete('/api/contacts/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// Add interest to a contact
app.post('/api/contacts/:id/interests', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name required' }, 400)
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
    const r = await upsertContact(db, pc, platform)
    if (r) { r.merged ? mergedCount++ : added++ }
  }
  const matchCount = await computeMatches(db)
  return c.json({ parsed: parsed.length, added, merged: mergedCount, matches: matchCount })
})

// Recompute matches
app.post('/api/matches/recompute', async (c) => {
  const n = await computeMatches(c.env.DB)
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
    JOIN contacts b ON b.id = m.contact_b`
  const binds: any[] = []
  if (type) { sql += ' WHERE m.match_type = ?'; binds.push(type) }
  sql += ' ORDER BY m.score DESC, m.match_detail LIMIT 300'
  const res = await db.prepare(sql).bind(...binds).all()
  return c.json({ matches: res.results })
})

// My interests + matching contacts sharing them
app.get('/api/my-interests', async (c) => {
  const db = c.env.DB
  const mine = await db.prepare('SELECT * FROM my_interests ORDER BY name').all()
  const shared = await db.prepare(`
    SELECT mi.name AS interest, ct.id, ct.full_name, ct.avatar_color, ct.company
    FROM my_interests mi
    JOIN interests i ON i.name = mi.name COLLATE NOCASE
    JOIN contact_interests ci ON ci.interest_id = i.id
    JOIN contacts ct ON ct.id = ci.contact_id
    ORDER BY mi.name, ct.full_name`).all()
  return c.json({ my_interests: mine.results, shared_with_contacts: shared.results })
})

app.post('/api/my-interests', async (c) => {
  const { name, category } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'name required' }, 400)
  await c.env.DB.prepare('INSERT OR IGNORE INTO my_interests (name, category) VALUES (?, ?)')
    .bind(name.trim(), category || 'general').run()
  return c.json({ ok: true })
})

app.delete('/api/my-interests/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM my_interests WHERE id = ?').bind(c.req.param('id')).run()
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
  <title>ConnectHub CRM — Your Unified Network</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔗</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <header id="topbar" class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <h1 class="text-xl font-bold flex items-center gap-2">
        <i class="fas fa-circle-nodes text-indigo-400"></i>
        Connect<span class="text-indigo-400">Hub</span> CRM
      </h1>
      <nav id="main-nav" class="flex gap-1 text-sm">
        <button data-view="dashboard" class="nav-btn active"><i class="fas fa-chart-pie mr-1"></i>Dashboard</button>
        <button data-view="contacts" class="nav-btn"><i class="fas fa-address-book mr-1"></i>Contacts</button>
        <button data-view="import" class="nav-btn"><i class="fas fa-file-import mr-1"></i>Import</button>
        <button data-view="matches" class="nav-btn"><i class="fas fa-people-arrows mr-1"></i>Matches</button>
        <button data-view="interests" class="nav-btn"><i class="fas fa-heart mr-1"></i>My Interests</button>
      </nav>
    </div>
  </header>
  <main id="app" class="max-w-7xl mx-auto px-4 py-6"></main>
  <div id="modal-root"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
