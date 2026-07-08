/* ConnectHub CRM frontend */
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');

const PLATFORMS = [
  { id: 'phone', label: 'Phone Contacts', icon: 'fa-mobile-screen', hint: 'Export from iPhone (iCloud.com → Contacts → Export vCard) or Android (Contacts app → Export). Accepts .vcf or .csv' },
  { id: 'email', label: 'Email (Google / Outlook)', icon: 'fa-envelope', hint: 'Google Contacts → Export → Google CSV. Outlook → People → Manage → Export contacts.' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin', hint: 'LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. Upload Connections.csv' },
  { id: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook', hint: 'Facebook → Settings → Download your information → Friends. Convert to CSV with columns: Name, Email...' },
  { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', hint: 'Instagram → Accounts Center → Download your information. Upload a CSV of followers/following (Name, Username columns).' },
  { id: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok', hint: 'TikTok → Settings → Account → Download your data. Upload a CSV of followers/following.' },
];
const PLATFORM_ICONS = { phone: 'fa-mobile-screen', email: 'fa-envelope', linkedin: 'fa-brands fa-linkedin', facebook: 'fa-brands fa-facebook', instagram: 'fa-brands fa-instagram', tiktok: 'fa-brands fa-tiktok', manual: 'fa-pen' };
const REL_TYPES = ['unknown', 'friend', 'business', 'family', 'acquaintance'];
const MATCH_LABELS = { shared_interest: { icon: 'fa-heart', label: 'Shared Interest', color: 'text-[#d2604f]' }, same_company: { icon: 'fa-building', label: 'Same Company', color: 'text-[#a05f1f]' }, same_location: { icon: 'fa-location-dot', label: 'Same Location', color: 'text-[#6e6a61]' } };

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const badge = p => `<span class="platform-badge pb-${esc(p)}"><i class="fas ${PLATFORM_ICONS[p] || 'fa-circle'}"></i>${esc(p)}</span>`;

let currentView = 'dashboard';
let currentUser = null;

/* Token-based auth: works even where cookies are blocked (iframes / strict browsers) */
const TOKEN_KEY = 'mch_session';
const savedToken = localStorage.getItem(TOKEN_KEY);
if (savedToken) axios.defaults.headers.common['Authorization'] = 'Bearer ' + savedToken;
function storeToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  delete axios.defaults.headers.common['Authorization'];
}

/* ---------- auth / landing ---------- */
const $topbar = document.getElementById('topbar');

async function checkAuth() {
  try {
    const { data } = await axios.get('/api/auth/me');
    if (data.authenticated) { currentUser = data; enterApp(); return; }
  } catch (e) { /* fallthrough */ }
  renderLanding();
}

function enterApp() {
  $topbar.style.display = '';
  renderUserChip();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-view=dashboard]').classList.add('active');
  render('dashboard');
}

function renderUserChip() {
  let chip = document.getElementById('user-chip');
  if (chip) chip.remove();
  chip = document.createElement('div');
  chip.id = 'user-chip';
  chip.className = 'flex items-center gap-2 text-xs';
  chip.innerHTML = `
    ${currentUser.demo ? '<span class="platform-badge" style="background:#f7ddda;color:#b8443a">Demo</span>' : ''}
    <span class="font-semibold hidden sm:inline" style="color:#57534b">${esc(currentUser.name || currentUser.email)}</span>
    <button id="logout-btn" class="btn-soft rounded-lg px-3 py-1.5 font-semibold" title="Sign out"><i class="fas fa-right-from-bracket"></i></button>`;
  document.querySelector('#topbar > div').appendChild(chip);
  document.getElementById('logout-btn').onclick = async () => {
    try { await axios.post('/api/auth/logout'); } catch (e) { /* ignore */ }
    clearToken();
    currentUser = null;
    location.reload();
  };
}

function renderLanding() {
  $topbar.style.display = 'none';
  $app.innerHTML = `
  <section id="landing" class="fade-in min-h-[85vh] flex flex-col justify-center py-8">
    <div class="grid lg:grid-cols-2 gap-10 items-center max-w-6xl mx-auto w-full">

      <div>
        <p class="font-bold text-sm mb-3 tracking-wide" style="color:#d2604f">YOUR NETWORK, UNIFIED</p>
        <h1 class="text-4xl sm:text-5xl font-bold leading-tight mb-5" style="color:#2a2a2a">
          MyConnect <span style="color:#d2604f">Hub</span> CRM
        </h1>
        <p class="text-lg mb-6" style="color:#8a8378">
          Bring your phone, email, LinkedIn, Facebook, Instagram and TikTok contacts into one
          intelligent CRM. Merge duplicates automatically and let the AI engine discover
          shared interests, friendships and business matches across your entire network.
        </p>
        <ul class="space-y-3 text-sm mb-8">
          <li class="flex items-center gap-3"><span class="avatar" style="background:#3d3d3d;width:2rem;height:2rem"><i class="fas fa-file-import text-xs"></i></span><span style="color:#57534b">Import from 6 platforms — CSV and vCard supported</span></li>
          <li class="flex items-center gap-3"><span class="avatar" style="background:#d2604f;width:2rem;height:2rem"><i class="fas fa-wand-magic-sparkles text-xs"></i></span><span style="color:#57534b">AI discovery engine researches contacts for interest matches</span></li>
          <li class="flex items-center gap-3"><span class="avatar" style="background:#8a8378;width:2rem;height:2rem"><i class="fas fa-people-arrows text-xs"></i></span><span style="color:#57534b">See who shares interests, companies and cities across your network</span></li>
        </ul>
      </div>

      <div class="card p-7 max-w-md w-full mx-auto" id="auth-card">
        <div class="flex gap-1 mb-5 p-1 rounded-full" style="background:#f3e9da" id="auth-tabs">
          <button data-tab="signin" class="auth-tab active flex-1">Sign in</button>
          <button data-tab="signup" class="auth-tab flex-1">Create account</button>
        </div>

        <form id="signin-form" class="space-y-3">
          <input name="email" type="email" placeholder="Email" required class="w-full">
          <input name="password" type="password" placeholder="Password" required class="w-full">
          <button class="btn-primary rounded-lg w-full py-2.5 font-semibold text-sm">Sign in</button>
        </form>

        <form id="signup-form" class="space-y-3 hidden">
          <input name="name" placeholder="Your name" class="w-full">
          <input name="email" type="email" placeholder="Email" required class="w-full">
          <input name="password" type="password" placeholder="Password (6+ characters)" required minlength="6" class="w-full">
          <button class="btn-primary rounded-lg w-full py-2.5 font-semibold text-sm">Create my account</button>
        </form>

        <div class="flex items-center gap-3 my-4">
          <div class="h-px flex-1" style="background:#eadfcd"></div>
          <span class="text-xs" style="color:#a89d8d">or</span>
          <div class="h-px flex-1" style="background:#eadfcd"></div>
        </div>

        <button id="google-btn" class="w-full border rounded-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 bg-white hover:shadow-md transition" style="border-color:#eadfcd;color:#3d3d3d">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div class="mt-5 pt-5 border-t" style="border-color:#eadfcd">
          <p class="text-xs font-semibold mb-2" style="color:#8a8378"><i class="fas fa-bolt mr-1" style="color:#d2604f"></i>Just want a look around? Try the instant demo:</p>
          <form id="demo-form" class="flex gap-2">
            <input name="email" type="email" placeholder="Enter your email" required class="flex-1 text-sm">
            <button class="rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style="background:#d2604f">Demo</button>
          </form>
        </div>

        <p id="auth-error" class="text-xs mt-3 hidden" style="color:#c0492f"></p>
      </div>
    </div>
  </section>`;

  const showError = msg => {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.classList.remove('hidden');
  };

  document.getElementById('auth-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.auth-tab'); if (!tab) return;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('signin-form').classList.toggle('hidden', tab.dataset.tab !== 'signin');
    document.getElementById('signup-form').classList.toggle('hidden', tab.dataset.tab !== 'signup');
  });

  document.getElementById('signin-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"], button');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const { data } = await axios.post('/api/auth/login', f);
      storeToken(data.token);
      currentUser = data; enterApp();
    } catch (err) {
      btn.innerHTML = orig;
      showError(err.response?.data?.error || 'Sign in failed — please try again');
    }
  };
  document.getElementById('signup-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"], button');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const { data } = await axios.post('/api/auth/signup', f);
      storeToken(data.token);
      currentUser = data; enterApp();
    } catch (err) {
      btn.innerHTML = orig;
      showError(err.response?.data?.error || 'Sign up failed — please try again');
    }
  };
  document.getElementById('demo-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const { data } = await axios.post('/api/auth/demo', f);
      storeToken(data.token);
      currentUser = data; enterApp();
    } catch (err) { btn.textContent = 'Demo'; showError(err.response?.data?.error || 'Demo failed — please try again'); }
  };
  document.getElementById('google-btn').onclick = async () => {
    try { await axios.post('/api/auth/google'); }
    catch (err) { showError(err.response?.data?.message || 'Google sign-in is not configured yet — use email or the demo.'); }
  };
}

/* ---------- navigation ---------- */
document.getElementById('main-nav').addEventListener('click', e => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render(btn.dataset.view);
});

function render(view) {
  currentView = view;
  if (view === 'dashboard') renderDashboard();
  else if (view === 'contacts') renderContacts();
  else if (view === 'import') renderImport();
  else if (view === 'matches') renderMatches();
  else if (view === 'interests') renderInterests();
}

/* ---------- Dashboard ---------- */
async function renderDashboard() {
  $app.innerHTML = '<div class="text-[#8a8378] py-10 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Loading…</div>';
  const { data: s } = await axios.get('/api/stats');
  const platRows = (s.by_platform || []).map(p => `<div class="flex justify-between items-center py-1.5">${badge(p.platform)}<span class="font-semibold">${p.n}</span></div>`).join('') || '<p class="text-[#a89d8d] text-sm">No imports yet</p>';
  $app.innerHTML = `
  <section class="fade-in">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${statCard('fa-address-book', 'text-[#3d3d3d]', s.total_contacts, 'Total Contacts')}
      ${statCard('fa-people-arrows', 'text-[#d2604f]', s.total_matches, 'Matches Found')}
      ${statCard('fa-layer-group', 'text-[#3d3d3d]', s.multi_platform_contacts, 'Multi-Platform People')}
      ${statCard('fa-heart', 'text-[#c98a2e]', s.total_interests, 'Interests Tracked')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <article class="card p-5">
        <h2 class="font-semibold mb-3"><i class="fas fa-chart-pie text-[#3d3d3d] mr-2"></i>Contacts by Platform</h2>
        <div class="max-w-xs mx-auto"><canvas id="platform-chart"></canvas></div>
      </article>
      <article class="card p-5">
        <h2 class="font-semibold mb-3"><i class="fas fa-list text-[#3d3d3d] mr-2"></i>Platform Breakdown</h2>
        ${platRows}
        <div class="mt-4 pt-4 border-t border-[#eadfcd]">
          <button onclick="document.querySelector('[data-view=import]').click()" class="w-full btn-primary rounded-lg py-2.5 font-semibold text-sm"><i class="fas fa-file-import mr-2"></i>Import Contacts</button>
        </div>
      </article>
    </div>

    <article class="card p-5 mt-4" id="ai-engine">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 class="font-semibold">
          <span class="ai-pulse-dot"></span>
          <i class="fas fa-wand-magic-sparkles mr-1" style="color:#d2604f"></i>AI Discovery Engine
        </h2>
        <button id="ai-scan-btn" class="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"><i class="fas fa-radar mr-1"></i>Run Discovery Scan</button>
      </div>
      <p class="text-xs text-[#8a8378] mb-4">The connector scans your contacts and researches public signals — roles, companies, locations and platform activity — to surface potential interest matches.</p>
      <div class="grid lg:grid-cols-2 gap-4">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wide text-[#a89d8d] mb-2">Live activity</h3>
          <div id="ai-feed" class="ai-feed"><p class="text-xs text-[#a89d8d] py-6 text-center">Press “Run Discovery Scan” to start the engine.</p></div>
        </div>
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wide text-[#a89d8d] mb-2">Suggested interest matches</h3>
          <div id="ai-suggestions" class="space-y-2 max-h-72 overflow-y-auto"><p class="text-xs text-[#a89d8d] py-6 text-center">Suggestions will appear here after a scan.</p></div>
        </div>
      </div>
    </article>
  </section>`;
  document.getElementById('ai-scan-btn').onclick = runDiscovery;
  if (s.by_platform?.length) {
    new Chart(document.getElementById('platform-chart'), {
      type: 'doughnut',
      data: {
        labels: s.by_platform.map(p => p.platform),
        datasets: [{ data: s.by_platform.map(p => p.n), backgroundColor: ['#3d3d3d', '#d2604f', '#8a8378', '#b5aca0', '#e0a458', '#5c5952', '#c9beae'], borderWidth: 3, borderColor: '#ffffff', hoverOffset: 10 }]
      },
      options: { plugins: { legend: { labels: { color: '#5a5245', font: { family: 'Quicksand', weight: '600' } } } } }
    });
  }
}
/* ---------- AI Discovery Engine ---------- */
async function runDiscovery() {
  const $feed = document.getElementById('ai-feed');
  const $sugg = document.getElementById('ai-suggestions');
  const $btn = document.getElementById('ai-scan-btn');
  $btn.disabled = true;
  $btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Scanning…';
  $feed.innerHTML = '';
  $sugg.innerHTML = '<p class="text-xs text-[#a89d8d] py-6 text-center"><i class="fas fa-spinner fa-spin mr-1"></i>Waiting for scan results…</p>';

  const log = (icon, text, cls) => {
    const row = document.createElement('div');
    row.className = `ai-log-row ${cls || ''}`;
    row.innerHTML = `<i class="fas ${icon}"></i><span>${text}</span>`;
    $feed.appendChild(row);
    $feed.scrollTop = $feed.scrollHeight;
    while ($feed.children.length > 40) $feed.removeChild($feed.firstChild);
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Kick off the real scan while the feed narrates
  const scanPromise = axios.get('/api/discover/scan');
  log('fa-plug-circle-bolt', 'Connector online — authenticating session…', 'ai-sys');
  await sleep(500);
  log('fa-address-book', 'Loading your contact graph…', 'ai-sys');
  await sleep(600);

  const { data } = await scanPromise;
  log('fa-users', `${data.scanned} contacts queued for research`, 'ai-sys');
  await sleep(400);

  const seen = new Set();
  const searchable = data.suggestions.filter(s => { if (seen.has(s.contact_id)) return false; seen.add(s.contact_id); return true; });
  const sources = ['public profiles', 'company pages', 'news mentions', 'social activity', 'industry directories'];
  for (let i = 0; i < searchable.length; i++) {
    const s = searchable[i];
    log('fa-magnifying-glass', `Researching <b>${esc(s.contact_name)}</b> — crawling ${sources[i % sources.length]}…`);
    await sleep(260 + Math.random() * 340);
    log('fa-lightbulb', `Signal found: <b>${esc(s.contact_name)}</b> → likely interested in <b>${esc(s.interest)}</b> (${s.confidence}% confidence)`, 'ai-hit');
    await sleep(180 + Math.random() * 220);
  }
  log('fa-circle-check', `Scan complete — ${data.suggestions.length} potential interest matches surfaced`, 'ai-done');

  if (!data.suggestions.length) {
    $sugg.innerHTML = '<p class="text-xs text-[#a89d8d] py-6 text-center">No new suggestions — your contacts are fully tagged. Import more contacts and scan again.</p>';
  } else {
    $sugg.innerHTML = data.suggestions.map((s, i) => `
      <div class="ai-suggestion card p-3" id="sugg-${i}">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-semibold truncate">${esc(s.contact_name)} <span class="text-[#a89d8d] font-normal">→</span> <span style="color:#d2604f">${esc(s.interest)}</span>
              ${s.matches_you ? '<span class="platform-badge ml-1" style="background:#f7ddda;color:#b8443a">matches you</span>' : ''}
            </p>
            <p class="text-xs text-[#8a8378]">${esc(s.reason)} · ${s.confidence}% confidence</p>
          </div>
          <button class="apply-sugg btn-soft rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap" data-cid="${s.contact_id}" data-interest="${esc(s.interest)}" data-idx="${i}">Apply</button>
        </div>
      </div>`).join('');
    $sugg.querySelectorAll('.apply-sugg').forEach(btn => btn.onclick = async () => {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      await axios.post('/api/discover/apply', { contact_id: +btn.dataset.cid, interest: btn.dataset.interest });
      const card = document.getElementById('sugg-' + btn.dataset.idx);
      card.style.opacity = '.45';
      btn.outerHTML = '<span class="text-xs font-bold" style="color:#3d3d3d"><i class="fas fa-check mr-1"></i>Applied</span>';
      log('fa-tag', `Tagged <b>${esc(btn.dataset.interest)}</b> and recomputed matches`, 'ai-done');
    });
  }
  $btn.disabled = false;
  $btn.innerHTML = '<i class="fas fa-radar mr-1"></i>Run Discovery Scan';
}

const statCard = (icon, color, val, label) => `
  <article class="card p-4 text-center">
    <i class="fas ${icon} ${color} text-2xl mb-2"></i>
    <div class="text-2xl font-bold">${val}</div>
    <div class="text-xs text-[#8a8378]">${label}</div>
  </article>`;

/* ---------- Contacts ---------- */
async function renderContacts() {
  $app.innerHTML = `
  <section class="fade-in">
    <div class="flex flex-wrap gap-2 mb-4 items-center">
      <input id="search-input" placeholder="Search name, email, company…" class="flex-1 min-w-48">
      <select id="platform-filter">
        <option value="">All platforms</option>
        ${PLATFORMS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}
        <option value="manual">Manual</option>
      </select>
      <select id="rel-filter">
        <option value="">All relationships</option>
        ${REL_TYPES.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <button id="add-contact-btn" class="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"><i class="fas fa-plus mr-1"></i>Add</button>
    </div>
    <div id="contact-list"></div>
  </section>`;
  const load = async () => {
    const q = document.getElementById('search-input').value;
    const platform = document.getElementById('platform-filter').value;
    const relationship = document.getElementById('rel-filter').value;
    const { data } = await axios.get('/api/contacts', { params: { q, platform, relationship } });
    const list = document.getElementById('contact-list');
    if (!data.contacts.length) {
      list.innerHTML = '<div class="card p-10 text-center text-[#a89d8d]"><i class="fas fa-inbox text-3xl mb-3 block"></i>No contacts yet. Import your contacts to get started!</div>';
      return;
    }
    list.innerHTML = `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">` + data.contacts.map(ct => `
      <article class="card contact-card p-4 cursor-pointer transition" data-id="${ct.id}">
        <div class="flex items-start gap-3">
          <div class="avatar" style="background:${esc(ct.avatar_color)}">${initials(ct.full_name)}</div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold truncate">${esc(ct.full_name)}</h3>
            <p class="text-xs text-[#8a8378] truncate">${esc(ct.job_title || '')}${ct.job_title && ct.company ? ' · ' : ''}${esc(ct.company || '')}</p>
            <p class="text-xs text-[#a89d8d] truncate">${esc(ct.email || ct.phone || '')}</p>
            <div class="flex flex-wrap gap-1 mt-2">${(ct.platforms || '').split(',').filter(Boolean).map(badge).join('')}</div>
            ${ct.interests ? `<div class="flex flex-wrap gap-1 mt-1.5">${ct.interests.split('|').slice(0, 3).map(i => `<span class="interest-tag">${esc(i)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </article>`).join('') + '</div>';
    list.querySelectorAll('.contact-card').forEach(el => el.addEventListener('click', () => openContact(el.dataset.id)));
  };
  let t; document.getElementById('search-input').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  document.getElementById('platform-filter').addEventListener('change', load);
  document.getElementById('rel-filter').addEventListener('change', load);
  document.getElementById('add-contact-btn').addEventListener('click', () => openContactForm(null, load));
  load();
}

/* ---------- Contact detail modal ---------- */
async function openContact(id) {
  const { data } = await axios.get(`/api/contacts/${id}`);
  const c = data.contact;
  $modal.innerHTML = `
  <div class="modal-overlay" id="detail-overlay">
    <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 fade-in">
      <div class="flex justify-between items-start mb-4">
        <div class="flex gap-3 items-center">
          <div class="avatar" style="background:${esc(c.avatar_color)};width:3.5rem;height:3.5rem;font-size:1.2rem">${initials(c.full_name)}</div>
          <div>
            <h2 class="text-xl font-bold">${esc(c.full_name)}</h2>
            <p class="text-sm text-[#8a8378]">${esc(c.job_title || '')}${c.job_title && c.company ? ' @ ' : ''}${esc(c.company || '')}</p>
            <div class="flex gap-1 mt-1">${data.sources.map(s => badge(s.platform)).join('')}</div>
          </div>
        </div>
        <button id="close-detail" class="text-[#a89d8d] hover:text-[#233c2d] text-xl"><i class="fas fa-xmark"></i></button>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 text-sm mb-4">
        ${c.email ? `<p><i class="fas fa-envelope text-[#a89d8d] mr-2 w-4"></i>${esc(c.email)}</p>` : ''}
        ${c.phone ? `<p><i class="fas fa-phone text-[#a89d8d] mr-2 w-4"></i>${esc(c.phone)}</p>` : ''}
        ${c.location ? `<p><i class="fas fa-location-dot text-[#a89d8d] mr-2 w-4"></i>${esc(c.location)}</p>` : ''}
        <p><i class="fas fa-user-tag text-[#a89d8d] mr-2 w-4"></i>${esc(c.relationship_type)} · strength ${'★'.repeat(c.strength)}${'☆'.repeat(5 - c.strength)}</p>
      </div>
      ${c.notes ? `<p class="text-sm bg-[#faf5ee] rounded-lg p-3 mb-4 text-[#57534b]"><i class="fas fa-note-sticky text-[#a89d8d] mr-2"></i>${esc(c.notes)}</p>` : ''}

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-heart text-[#d2604f] mr-1"></i>Interests</h3>
        <div class="flex flex-wrap gap-1.5 mb-2">
          ${data.interests.map(i => `<span class="interest-tag">${esc(i.name)} <button class="del-interest hover:text-[#c0492f]" data-iid="${i.id}"><i class="fas fa-xmark"></i></button></span>`).join('') || '<span class="text-[#a89d8d] text-xs">None yet</span>'}
        </div>
        <form id="add-interest-form" class="flex gap-2">
          <input name="name" placeholder="Add interest (e.g. film production)" class="flex-1 text-sm">
          <button class="btn-soft rounded-lg px-3 text-sm"><i class="fas fa-plus"></i></button>
        </form>
      </section>

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-people-arrows text-[#3d3d3d] mr-1"></i>Connections & Matches (${data.matches.length})</h3>
        <div class="space-y-1.5 max-h-44 overflow-y-auto">
          ${data.matches.map(m => {
            const ml = MATCH_LABELS[m.match_type] || {};
            return `<div class="flex items-center gap-2 text-sm bg-[#faf5ee] rounded-lg px-3 py-2">
              <div class="avatar" style="background:${esc(m.other_color)};width:1.6rem;height:1.6rem;font-size:.6rem">${initials(m.other_name)}</div>
              <span class="font-medium">${esc(m.other_name)}</span>
              <span class="text-xs ${ml.color || ''} ml-auto"><i class="fas ${ml.icon || ''} mr-1"></i>${esc(m.match_detail || ml.label || m.match_type)}</span>
            </div>`;
          }).join('') || '<p class="text-[#a89d8d] text-xs">No matches yet — add interests, company or location, then recompute matches.</p>'}
        </div>
      </section>

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-clock-rotate-left text-[#c98a2e] mr-1"></i>Interaction Log</h3>
        <form id="add-note-form" class="flex gap-2 mb-2">
          <select name="kind" class="text-sm"><option>note</option><option>call</option><option>meeting</option><option>email</option><option>message</option></select>
          <input name="content" placeholder="What happened?" class="flex-1 text-sm">
          <button class="btn-soft rounded-lg px-3 text-sm"><i class="fas fa-plus"></i></button>
        </form>
        <div class="space-y-1 max-h-32 overflow-y-auto">
          ${data.interactions.map(n => `<p class="text-xs text-[#8a8378] bg-[#faf5ee] rounded px-2.5 py-1.5"><span class="uppercase text-[#a89d8d] font-semibold mr-2">${esc(n.kind)}</span>${esc(n.content)} <span class="text-[#c4b9a4] float-right">${esc((n.created_at || '').slice(0, 16))}</span></p>`).join('') || ''}
        </div>
      </section>

      <div class="flex gap-2 pt-3 border-t border-[#eadfcd]">
        <button id="edit-contact" class="flex-1 btn-primary rounded-lg py-2 text-sm font-semibold"><i class="fas fa-pen mr-1"></i>Edit</button>
        <button id="delete-contact" class="btn-danger rounded-lg px-4 text-sm"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  </div>`;

  const close = () => { $modal.innerHTML = ''; if (currentView === 'contacts') renderContacts(); };
  document.getElementById('close-detail').onclick = close;
  document.getElementById('detail-overlay').addEventListener('click', e => { if (e.target.id === 'detail-overlay') close(); });
  document.getElementById('add-interest-form').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    await axios.post(`/api/contacts/${id}/interests`, { name });
    await axios.post('/api/matches/recompute');
    openContact(id);
  };
  $modal.querySelectorAll('.del-interest').forEach(b => b.onclick = async () => {
    await axios.delete(`/api/contacts/${id}/interests/${b.dataset.iid}`);
    await axios.post('/api/matches/recompute');
    openContact(id);
  });
  document.getElementById('add-note-form').onsubmit = async e => {
    e.preventDefault();
    await axios.post(`/api/contacts/${id}/interactions`, { kind: e.target.kind.value, content: e.target.content.value });
    openContact(id);
  };
  document.getElementById('edit-contact').onclick = () => openContactForm(c, () => openContact(id));
  document.getElementById('delete-contact').onclick = async () => {
    if (!confirm(`Delete ${c.full_name}?`)) return;
    await axios.delete(`/api/contacts/${id}`);
    close();
  };
}

/* ---------- Add / edit contact form ---------- */
function openContactForm(c, onDone) {
  const isEdit = !!c;
  $modal.innerHTML = `
  <div class="modal-overlay" id="form-overlay">
    <div class="card max-w-lg w-full p-6 fade-in">
      <h2 class="text-lg font-bold mb-4">${isEdit ? 'Edit' : 'Add'} Contact</h2>
      <form id="contact-form" class="space-y-3 text-sm">
        <input name="full_name" placeholder="Full name *" required value="${esc(c?.full_name || '')}" class="w-full">
        <div class="grid grid-cols-2 gap-3">
          <input name="email" type="email" placeholder="Email" value="${esc(c?.email || '')}">
          <input name="phone" placeholder="Phone" value="${esc(c?.phone || '')}">
          <input name="company" placeholder="Company" value="${esc(c?.company || '')}">
          <input name="job_title" placeholder="Job title" value="${esc(c?.job_title || '')}">
          <input name="location" placeholder="Location / City" value="${esc(c?.location || '')}">
          <select name="relationship_type">${REL_TYPES.map(r => `<option ${c?.relationship_type === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
        <label class="block text-[#8a8378] text-xs">Relationship strength: <span id="strength-val">${c?.strength || 3}</span>/5
          <input name="strength" type="range" min="1" max="5" value="${c?.strength || 3}" class="w-full" oninput="document.getElementById('strength-val').textContent=this.value">
        </label>
        <textarea name="notes" placeholder="Notes" rows="2" class="w-full">${esc(c?.notes || '')}</textarea>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 btn-primary rounded-lg py-2 font-semibold">Save</button>
          <button type="button" id="cancel-form" class="btn-soft rounded-lg px-4">Cancel</button>
        </div>
      </form>
    </div>
  </div>`;
  document.getElementById('cancel-form').onclick = () => { $modal.innerHTML = ''; };
  document.getElementById('contact-form').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.strength = +f.strength;
    if (isEdit) await axios.put(`/api/contacts/${c.id}`, f);
    else await axios.post('/api/contacts', f);
    await axios.post('/api/matches/recompute');
    $modal.innerHTML = '';
    onDone && onDone();
  };
}

/* ---------- Import ---------- */
function renderImport() {
  $app.innerHTML = `
  <section class="fade-in max-w-3xl mx-auto">
    <h2 class="text-lg font-bold mb-1">Import Your Contacts</h2>
    <p class="text-sm text-[#8a8378] mb-5">Social networks don't allow apps to pull contacts directly — but you can export them yourself and upload here. Duplicates are automatically merged across platforms.</p>
    <div class="grid sm:grid-cols-2 gap-3 mb-6" id="platform-cards">
      ${PLATFORMS.map(p => `
        <button class="card p-4 text-left transition platform-pick" data-platform="${p.id}">
          <i class="fas ${p.icon} text-[#3d3d3d] text-xl mb-2 block"></i>
          <span class="font-semibold text-sm">${p.label}</span>
          <p class="text-xs text-[#a89d8d] mt-1">${p.hint}</p>
        </button>`).join('')}
    </div>
    <div id="upload-area" class="hidden">
      <div class="drop-zone p-10 text-center cursor-pointer" id="drop-zone">
        <i class="fas fa-cloud-arrow-up text-3xl text-[#3d3d3d] mb-3 block"></i>
        <p class="font-semibold" id="upload-title">Drop your file here or click to browse</p>
        <p class="text-xs text-[#a89d8d] mt-1">Accepts .csv and .vcf files (max 1000 contacts per import)</p>
        <input type="file" id="file-input" accept=".csv,.vcf,.txt" class="hidden">
      </div>
      <div id="import-result" class="mt-4"></div>
    </div>
  </section>`;
  let selectedPlatform = null;
  document.querySelectorAll('.platform-pick').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.platform-pick').forEach(b => b.classList.remove('ring-2', 'ring-[#3d3d3d]'));
    btn.classList.add('ring-2', 'ring-[#3d3d3d]');
    selectedPlatform = btn.dataset.platform;
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('upload-title').textContent = `Upload your ${PLATFORMS.find(p => p.id === selectedPlatform).label} file`;
  });
  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-input');
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
  fi.onchange = () => fi.files[0] && upload(fi.files[0]);

  async function upload(file) {
    const $r = document.getElementById('import-result');
    $r.innerHTML = '<p class="text-[#8a8378]"><i class="fas fa-spinner fa-spin mr-2"></i>Importing & matching…</p>';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('platform', selectedPlatform);
    try {
      const { data } = await axios.post('/api/import', fd);
      $r.innerHTML = `
        <div class="card p-4 border-[#d6d3cd] fade-in">
          <p class="font-semibold text-[#3d3d3d] mb-1"><i class="fas fa-check-circle mr-1"></i>Import complete!</p>
          <p class="text-sm text-[#57534b]">Parsed <b>${data.parsed}</b> rows → <b>${data.added}</b> new contacts added, <b>${data.merged}</b> merged with existing people. <b>${data.matches}</b> total matches computed.</p>
          <button onclick="document.querySelector('[data-view=contacts]').click()" class="mt-3 btn-primary rounded-lg px-4 py-2 text-sm font-semibold">View Contacts →</button>
        </div>`;
    } catch (err) {
      $r.innerHTML = `<div class="card p-4 border-[#eec6bd]"><p class="text-[#c0492f] text-sm"><i class="fas fa-triangle-exclamation mr-1"></i>${esc(err.response?.data?.error || 'Import failed')}</p></div>`;
    }
    fi.value = '';
  }
}

/* ---------- Matches ---------- */
async function renderMatches() {
  $app.innerHTML = `
  <section class="fade-in">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <h2 class="text-lg font-bold mr-auto">Connection Matches</h2>
      <select id="match-filter">
        <option value="">All types</option>
        <option value="shared_interest">Shared interests</option>
        <option value="same_company">Same company</option>
        <option value="same_location">Same location</option>
      </select>
      <button id="recompute-btn" class="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"><i class="fas fa-rotate mr-1"></i>Recompute</button>
    </div>
    <div id="match-list"></div>
  </section>`;
  const load = async () => {
    const type = document.getElementById('match-filter').value;
    const { data } = await axios.get('/api/matches', { params: { type } });
    const $l = document.getElementById('match-list');
    if (!data.matches.length) {
      $l.innerHTML = '<div class="card p-10 text-center text-[#a89d8d]"><i class="fas fa-people-arrows text-3xl mb-3 block"></i>No matches yet. Import contacts and add interests, companies or locations — then hit Recompute.</div>';
      return;
    }
    // group by detail
    const groups = {};
    data.matches.forEach(m => {
      const key = `${m.match_type}::${m.match_detail}`;
      (groups[key] = groups[key] || []).push(m);
    });
    $l.innerHTML = Object.entries(groups).map(([key, ms]) => {
      const [type, detail] = key.split('::');
      const ml = MATCH_LABELS[type] || {};
      return `<article class="card p-4 mb-3">
        <h3 class="text-sm font-semibold mb-2 ${ml.color || ''}"><i class="fas ${ml.icon} mr-1.5"></i>${esc(ml.label)}: <span class="text-white">${esc(detail)}</span> <span class="text-[#a89d8d] font-normal">(${ms.length} pair${ms.length > 1 ? 's' : ''})</span></h3>
        <div class="grid sm:grid-cols-2 gap-2">
          ${ms.slice(0, 10).map(m => `
            <div class="flex items-center gap-2 bg-[#faf5ee] rounded-lg px-3 py-2 text-sm">
              <div class="avatar" style="background:${esc(m.color_a)};width:1.7rem;height:1.7rem;font-size:.6rem">${initials(m.name_a)}</div>
              <span class="truncate">${esc(m.name_a)}</span>
              <i class="fas fa-arrows-left-right text-[#c4b9a4] text-xs"></i>
              <div class="avatar" style="background:${esc(m.color_b)};width:1.7rem;height:1.7rem;font-size:.6rem">${initials(m.name_b)}</div>
              <span class="truncate">${esc(m.name_b)}</span>
            </div>`).join('')}
          ${ms.length > 10 ? `<p class="text-xs text-[#a89d8d] self-center">+${ms.length - 10} more…</p>` : ''}
        </div>
      </article>`;
    }).join('');
  };
  document.getElementById('match-filter').onchange = load;
  document.getElementById('recompute-btn').onclick = async () => { await axios.post('/api/matches/recompute'); load(); };
  load();
}

/* ---------- My Interests ---------- */
async function renderInterests() {
  const { data } = await axios.get('/api/my-interests');
  const grouped = {};
  data.shared_with_contacts.forEach(s => (grouped[s.interest] = grouped[s.interest] || []).push(s));
  $app.innerHTML = `
  <section class="fade-in max-w-3xl mx-auto">
    <h2 class="text-lg font-bold mb-1">My Interests</h2>
    <p class="text-sm text-[#8a8378] mb-4">Add your own interests — I'll show which of your contacts share them, so you know who to connect with about what.</p>
    <form id="my-interest-form" class="flex gap-2 mb-4">
      <input name="name" placeholder="e.g. film production, golf, AI, real estate…" class="flex-1" required>
      <select name="category"><option>general</option><option>business</option><option>hobby</option><option>industry</option></select>
      <button class="btn-primary rounded-lg px-4 text-sm font-semibold"><i class="fas fa-plus"></i></button>
    </form>
    <div class="flex flex-wrap gap-2 mb-6">
      ${data.my_interests.map(i => `<span class="interest-tag text-sm !py-1.5 !px-3">${esc(i.name)} <span class="text-[#3d3d3d] text-xs">${esc(i.category)}</span> <button class="del-mine hover:text-[#c0492f] ml-1" data-id="${i.id}"><i class="fas fa-xmark"></i></button></span>`).join('') || '<p class="text-[#a89d8d] text-sm">No interests added yet.</p>'}
    </div>
    <h3 class="font-semibold mb-3"><i class="fas fa-user-group text-[#3d3d3d] mr-1"></i>Contacts who share your interests</h3>
    ${Object.entries(grouped).map(([interest, people]) => `
      <article class="card p-4 mb-3">
        <h4 class="text-sm font-semibold text-[#d2604f] mb-2"><i class="fas fa-heart mr-1"></i>${esc(interest)} <span class="text-[#a89d8d] font-normal">(${people.length})</span></h4>
        <div class="flex flex-wrap gap-2">
          ${people.map(p => `<button class="flex items-center gap-2 bg-[#faf5ee] hover:bg-[#f3e9da] rounded-lg px-3 py-1.5 text-sm shared-person" data-id="${p.id}">
            <div class="avatar" style="background:${esc(p.avatar_color)};width:1.5rem;height:1.5rem;font-size:.55rem">${initials(p.full_name)}</div>
            ${esc(p.full_name)}${p.company ? `<span class="text-[#a89d8d] text-xs">· ${esc(p.company)}</span>` : ''}
          </button>`).join('')}
        </div>
      </article>`).join('') || '<p class="text-[#a89d8d] text-sm card p-6 text-center">No overlaps yet — add interests above and tag your contacts with interests too.</p>'}
  </section>`;
  document.getElementById('my-interest-form').onsubmit = async e => {
    e.preventDefault();
    await axios.post('/api/my-interests', { name: e.target.name.value, category: e.target.category.value });
    renderInterests();
  };
  $app.querySelectorAll('.del-mine').forEach(b => b.onclick = async () => { await axios.delete(`/api/my-interests/${b.dataset.id}`); renderInterests(); });
  $app.querySelectorAll('.shared-person').forEach(b => b.onclick = () => openContact(b.dataset.id));
}

/* ---------- Legal modals ---------- */
const LEGAL_DOCS = {
  privacy: {
    title: 'Privacy Policy',
    body: `
      <p class="mb-3"><b>Effective date:</b> January 1, 2026</p>
      <p class="mb-3">MyConnect Hub CRM ("we", "us") respects your privacy. This policy explains what we collect and how we use it.</p>
      <p class="font-bold mb-1">1. Information we collect</p>
      <p class="mb-3">Account details (name, email, hashed password) and the contact data you choose to import or enter (names, emails, phone numbers, companies, interests, notes). Demo accounts store the email you provide plus sample data.</p>
      <p class="font-bold mb-1">2. How we use it</p>
      <p class="mb-3">Solely to provide the CRM service to you: storing your contacts, merging duplicates, and computing interest and relationship matches. We do not sell, rent, or share your data with third parties for marketing.</p>
      <p class="font-bold mb-1">3. Your contacts' data</p>
      <p class="mb-3">You are responsible for ensuring you have the right to upload contact information you import. Imported data is visible only to your account.</p>
      <p class="font-bold mb-1">4. Storage & security</p>
      <p class="mb-3">Data is stored on Cloudflare's global infrastructure. Passwords are hashed with PBKDF2 and never stored in plain text. Sessions expire after 30 days.</p>
      <p class="font-bold mb-1">5. Deletion</p>
      <p class="mb-3">You may delete contacts at any time in the app. To delete your entire account and data, email us.</p>
      <p class="font-bold mb-1">6. Contact</p>
      <p>Questions or requests: <a href="mailto:support@myconnecthub.app" class="footer-link" style="color:#d2604f">support@myconnecthub.app</a></p>`
  },
  terms: {
    title: 'Terms of Use',
    body: `
      <p class="mb-3"><b>Effective date:</b> January 1, 2026</p>
      <p class="font-bold mb-1">1. Acceptance</p>
      <p class="mb-3">By creating an account or using the demo, you agree to these terms.</p>
      <p class="font-bold mb-1">2. Your responsibilities</p>
      <p class="mb-3">You agree to import only contact data you are lawfully permitted to hold, to keep your credentials secure, and not to use the service for spam, harassment, or unlawful outreach.</p>
      <p class="font-bold mb-1">3. AI features</p>
      <p class="mb-3">Discovery Engine suggestions are automated inferences and may be inaccurate. Review before relying on them.</p>
      <p class="font-bold mb-1">4. Service "as is"</p>
      <p class="mb-3">The service is provided without warranties of any kind. We are not liable for indirect or consequential damages arising from use of the service.</p>
      <p class="font-bold mb-1">5. Termination</p>
      <p class="mb-3">We may suspend accounts that violate these terms. You may stop using the service and request deletion at any time.</p>
      <p class="font-bold mb-1">6. Contact</p>
      <p>Questions: <a href="mailto:support@myconnecthub.app" class="footer-link" style="color:#d2604f">support@myconnecthub.app</a></p>`
  }
};

function openLegal(kind) {
  const doc = LEGAL_DOCS[kind];
  if (!doc) return;
  $modal.innerHTML = `
  <div class="modal-overlay" id="legal-overlay">
    <div class="card max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 fade-in">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold">${doc.title}</h2>
        <button id="close-legal" class="text-[#a89d8d] hover:text-[#333230] text-xl"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="text-sm text-[#57534b] leading-relaxed">${doc.body}</div>
    </div>
  </div>`;
  const close = () => { $modal.innerHTML = ''; };
  document.getElementById('close-legal').onclick = close;
  document.getElementById('legal-overlay').addEventListener('click', e => { if (e.target.id === 'legal-overlay') close(); });
}

document.getElementById('footer-links').addEventListener('click', e => {
  const btn = e.target.closest('[data-legal]');
  if (btn) openLegal(btn.dataset.legal);
});

/* ---------- boot ---------- */
axios.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401 && !err.config.url.includes('/api/auth/')) {
    clearToken();
    currentUser = null;
    renderLanding();
  }
  return Promise.reject(err);
});
checkAuth();
