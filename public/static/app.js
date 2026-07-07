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
const MATCH_LABELS = { shared_interest: { icon: 'fa-heart', label: 'Shared Interest', color: 'text-pink-400' }, same_company: { icon: 'fa-building', label: 'Same Company', color: 'text-amber-400' }, same_location: { icon: 'fa-location-dot', label: 'Same Location', color: 'text-sky-400' } };

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const badge = p => `<span class="platform-badge pb-${esc(p)}"><i class="fas ${PLATFORM_ICONS[p] || 'fa-circle'}"></i>${esc(p)}</span>`;

let currentView = 'dashboard';

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
  $app.innerHTML = '<div class="text-slate-400 py-10 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Loading…</div>';
  const { data: s } = await axios.get('/api/stats');
  const platRows = (s.by_platform || []).map(p => `<div class="flex justify-between items-center py-1.5">${badge(p.platform)}<span class="font-semibold">${p.n}</span></div>`).join('') || '<p class="text-slate-500 text-sm">No imports yet</p>';
  $app.innerHTML = `
  <section class="fade-in">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${statCard('fa-address-book', 'text-indigo-400', s.total_contacts, 'Total Contacts')}
      ${statCard('fa-people-arrows', 'text-pink-400', s.total_matches, 'Matches Found')}
      ${statCard('fa-layer-group', 'text-teal-400', s.multi_platform_contacts, 'Multi-Platform People')}
      ${statCard('fa-heart', 'text-amber-400', s.total_interests, 'Interests Tracked')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <article class="card p-5">
        <h2 class="font-semibold mb-3"><i class="fas fa-chart-pie text-indigo-400 mr-2"></i>Contacts by Platform</h2>
        <div class="max-w-xs mx-auto"><canvas id="platform-chart"></canvas></div>
      </article>
      <article class="card p-5">
        <h2 class="font-semibold mb-3"><i class="fas fa-list text-indigo-400 mr-2"></i>Platform Breakdown</h2>
        ${platRows}
        <div class="mt-4 pt-4 border-t border-slate-800">
          <button onclick="document.querySelector('[data-view=import]').click()" class="w-full bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2.5 font-semibold text-sm"><i class="fas fa-file-import mr-2"></i>Import Contacts</button>
        </div>
      </article>
    </div>
  </section>`;
  if (s.by_platform?.length) {
    new Chart(document.getElementById('platform-chart'), {
      type: 'doughnut',
      data: {
        labels: s.by_platform.map(p => p.platform),
        datasets: [{ data: s.by_platform.map(p => p.n), backgroundColor: ['#22c55e', '#f97316', '#3b82f6', '#60a5fa', '#ec4899', '#a1a1aa', '#8b5cf6'], borderWidth: 0 }]
      },
      options: { plugins: { legend: { labels: { color: '#94a3b8' } } } }
    });
  }
}
const statCard = (icon, color, val, label) => `
  <article class="card p-4 text-center">
    <i class="fas ${icon} ${color} text-2xl mb-2"></i>
    <div class="text-2xl font-bold">${val}</div>
    <div class="text-xs text-slate-400">${label}</div>
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
      <button id="add-contact-btn" class="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm font-semibold"><i class="fas fa-plus mr-1"></i>Add</button>
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
      list.innerHTML = '<div class="card p-10 text-center text-slate-500"><i class="fas fa-inbox text-3xl mb-3 block"></i>No contacts yet. Import your contacts to get started!</div>';
      return;
    }
    list.innerHTML = `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">` + data.contacts.map(ct => `
      <article class="card contact-card p-4 cursor-pointer hover:border-indigo-500 transition" data-id="${ct.id}">
        <div class="flex items-start gap-3">
          <div class="avatar" style="background:${esc(ct.avatar_color)}">${initials(ct.full_name)}</div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold truncate">${esc(ct.full_name)}</h3>
            <p class="text-xs text-slate-400 truncate">${esc(ct.job_title || '')}${ct.job_title && ct.company ? ' · ' : ''}${esc(ct.company || '')}</p>
            <p class="text-xs text-slate-500 truncate">${esc(ct.email || ct.phone || '')}</p>
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
            <p class="text-sm text-slate-400">${esc(c.job_title || '')}${c.job_title && c.company ? ' @ ' : ''}${esc(c.company || '')}</p>
            <div class="flex gap-1 mt-1">${data.sources.map(s => badge(s.platform)).join('')}</div>
          </div>
        </div>
        <button id="close-detail" class="text-slate-500 hover:text-white text-xl"><i class="fas fa-xmark"></i></button>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 text-sm mb-4">
        ${c.email ? `<p><i class="fas fa-envelope text-slate-500 mr-2 w-4"></i>${esc(c.email)}</p>` : ''}
        ${c.phone ? `<p><i class="fas fa-phone text-slate-500 mr-2 w-4"></i>${esc(c.phone)}</p>` : ''}
        ${c.location ? `<p><i class="fas fa-location-dot text-slate-500 mr-2 w-4"></i>${esc(c.location)}</p>` : ''}
        <p><i class="fas fa-user-tag text-slate-500 mr-2 w-4"></i>${esc(c.relationship_type)} · strength ${'★'.repeat(c.strength)}${'☆'.repeat(5 - c.strength)}</p>
      </div>
      ${c.notes ? `<p class="text-sm bg-slate-900 rounded-lg p-3 mb-4 text-slate-300"><i class="fas fa-note-sticky text-slate-500 mr-2"></i>${esc(c.notes)}</p>` : ''}

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-heart text-pink-400 mr-1"></i>Interests</h3>
        <div class="flex flex-wrap gap-1.5 mb-2">
          ${data.interests.map(i => `<span class="interest-tag">${esc(i.name)} <button class="del-interest hover:text-red-400" data-iid="${i.id}"><i class="fas fa-xmark"></i></button></span>`).join('') || '<span class="text-slate-500 text-xs">None yet</span>'}
        </div>
        <form id="add-interest-form" class="flex gap-2">
          <input name="name" placeholder="Add interest (e.g. film production)" class="flex-1 text-sm">
          <button class="bg-slate-700 hover:bg-slate-600 rounded-lg px-3 text-sm"><i class="fas fa-plus"></i></button>
        </form>
      </section>

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-people-arrows text-teal-400 mr-1"></i>Connections & Matches (${data.matches.length})</h3>
        <div class="space-y-1.5 max-h-44 overflow-y-auto">
          ${data.matches.map(m => {
            const ml = MATCH_LABELS[m.match_type] || {};
            return `<div class="flex items-center gap-2 text-sm bg-slate-900 rounded-lg px-3 py-2">
              <div class="avatar" style="background:${esc(m.other_color)};width:1.6rem;height:1.6rem;font-size:.6rem">${initials(m.other_name)}</div>
              <span class="font-medium">${esc(m.other_name)}</span>
              <span class="text-xs ${ml.color || ''} ml-auto"><i class="fas ${ml.icon || ''} mr-1"></i>${esc(m.match_detail || ml.label || m.match_type)}</span>
            </div>`;
          }).join('') || '<p class="text-slate-500 text-xs">No matches yet — add interests, company or location, then recompute matches.</p>'}
        </div>
      </section>

      <section class="mb-4">
        <h3 class="font-semibold text-sm mb-2"><i class="fas fa-clock-rotate-left text-amber-400 mr-1"></i>Interaction Log</h3>
        <form id="add-note-form" class="flex gap-2 mb-2">
          <select name="kind" class="text-sm"><option>note</option><option>call</option><option>meeting</option><option>email</option><option>message</option></select>
          <input name="content" placeholder="What happened?" class="flex-1 text-sm">
          <button class="bg-slate-700 hover:bg-slate-600 rounded-lg px-3 text-sm"><i class="fas fa-plus"></i></button>
        </form>
        <div class="space-y-1 max-h-32 overflow-y-auto">
          ${data.interactions.map(n => `<p class="text-xs text-slate-400 bg-slate-900 rounded px-2.5 py-1.5"><span class="uppercase text-slate-500 font-semibold mr-2">${esc(n.kind)}</span>${esc(n.content)} <span class="text-slate-600 float-right">${esc((n.created_at || '').slice(0, 16))}</span></p>`).join('') || ''}
        </div>
      </section>

      <div class="flex gap-2 pt-3 border-t border-slate-800">
        <button id="edit-contact" class="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 text-sm font-semibold"><i class="fas fa-pen mr-1"></i>Edit</button>
        <button id="delete-contact" class="bg-red-900/60 hover:bg-red-800 text-red-300 rounded-lg px-4 text-sm"><i class="fas fa-trash"></i></button>
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
        <label class="block text-slate-400 text-xs">Relationship strength: <span id="strength-val">${c?.strength || 3}</span>/5
          <input name="strength" type="range" min="1" max="5" value="${c?.strength || 3}" class="w-full" oninput="document.getElementById('strength-val').textContent=this.value">
        </label>
        <textarea name="notes" placeholder="Notes" rows="2" class="w-full">${esc(c?.notes || '')}</textarea>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 font-semibold">Save</button>
          <button type="button" id="cancel-form" class="bg-slate-700 rounded-lg px-4">Cancel</button>
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
    <p class="text-sm text-slate-400 mb-5">Social networks don't allow apps to pull contacts directly — but you can export them yourself and upload here. Duplicates are automatically merged across platforms.</p>
    <div class="grid sm:grid-cols-2 gap-3 mb-6" id="platform-cards">
      ${PLATFORMS.map(p => `
        <button class="card p-4 text-left hover:border-indigo-500 transition platform-pick" data-platform="${p.id}">
          <i class="fas ${p.icon} text-indigo-400 text-xl mb-2 block"></i>
          <span class="font-semibold text-sm">${p.label}</span>
          <p class="text-xs text-slate-500 mt-1">${p.hint}</p>
        </button>`).join('')}
    </div>
    <div id="upload-area" class="hidden">
      <div class="drop-zone p-10 text-center cursor-pointer" id="drop-zone">
        <i class="fas fa-cloud-arrow-up text-3xl text-indigo-400 mb-3 block"></i>
        <p class="font-semibold" id="upload-title">Drop your file here or click to browse</p>
        <p class="text-xs text-slate-500 mt-1">Accepts .csv and .vcf files (max 1000 contacts per import)</p>
        <input type="file" id="file-input" accept=".csv,.vcf,.txt" class="hidden">
      </div>
      <div id="import-result" class="mt-4"></div>
    </div>
  </section>`;
  let selectedPlatform = null;
  document.querySelectorAll('.platform-pick').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.platform-pick').forEach(b => b.classList.remove('border-indigo-500', 'ring-1', 'ring-indigo-500'));
    btn.classList.add('border-indigo-500', 'ring-1', 'ring-indigo-500');
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
    $r.innerHTML = '<p class="text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Importing & matching…</p>';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('platform', selectedPlatform);
    try {
      const { data } = await axios.post('/api/import', fd);
      $r.innerHTML = `
        <div class="card p-4 border-green-800 fade-in">
          <p class="font-semibold text-green-400 mb-1"><i class="fas fa-check-circle mr-1"></i>Import complete!</p>
          <p class="text-sm text-slate-300">Parsed <b>${data.parsed}</b> rows → <b>${data.added}</b> new contacts added, <b>${data.merged}</b> merged with existing people. <b>${data.matches}</b> total matches computed.</p>
          <button onclick="document.querySelector('[data-view=contacts]').click()" class="mt-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm font-semibold">View Contacts →</button>
        </div>`;
    } catch (err) {
      $r.innerHTML = `<div class="card p-4 border-red-800"><p class="text-red-400 text-sm"><i class="fas fa-triangle-exclamation mr-1"></i>${esc(err.response?.data?.error || 'Import failed')}</p></div>`;
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
      <button id="recompute-btn" class="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm font-semibold"><i class="fas fa-rotate mr-1"></i>Recompute</button>
    </div>
    <div id="match-list"></div>
  </section>`;
  const load = async () => {
    const type = document.getElementById('match-filter').value;
    const { data } = await axios.get('/api/matches', { params: { type } });
    const $l = document.getElementById('match-list');
    if (!data.matches.length) {
      $l.innerHTML = '<div class="card p-10 text-center text-slate-500"><i class="fas fa-people-arrows text-3xl mb-3 block"></i>No matches yet. Import contacts and add interests, companies or locations — then hit Recompute.</div>';
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
        <h3 class="text-sm font-semibold mb-2 ${ml.color || ''}"><i class="fas ${ml.icon} mr-1.5"></i>${esc(ml.label)}: <span class="text-white">${esc(detail)}</span> <span class="text-slate-500 font-normal">(${ms.length} pair${ms.length > 1 ? 's' : ''})</span></h3>
        <div class="grid sm:grid-cols-2 gap-2">
          ${ms.slice(0, 10).map(m => `
            <div class="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 text-sm">
              <div class="avatar" style="background:${esc(m.color_a)};width:1.7rem;height:1.7rem;font-size:.6rem">${initials(m.name_a)}</div>
              <span class="truncate">${esc(m.name_a)}</span>
              <i class="fas fa-arrows-left-right text-slate-600 text-xs"></i>
              <div class="avatar" style="background:${esc(m.color_b)};width:1.7rem;height:1.7rem;font-size:.6rem">${initials(m.name_b)}</div>
              <span class="truncate">${esc(m.name_b)}</span>
            </div>`).join('')}
          ${ms.length > 10 ? `<p class="text-xs text-slate-500 self-center">+${ms.length - 10} more…</p>` : ''}
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
    <p class="text-sm text-slate-400 mb-4">Add your own interests — I'll show which of your contacts share them, so you know who to connect with about what.</p>
    <form id="my-interest-form" class="flex gap-2 mb-4">
      <input name="name" placeholder="e.g. film production, golf, AI, real estate…" class="flex-1" required>
      <select name="category"><option>general</option><option>business</option><option>hobby</option><option>industry</option></select>
      <button class="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 text-sm font-semibold"><i class="fas fa-plus"></i></button>
    </form>
    <div class="flex flex-wrap gap-2 mb-6">
      ${data.my_interests.map(i => `<span class="interest-tag text-sm !py-1.5 !px-3">${esc(i.name)} <span class="text-indigo-400 text-xs">${esc(i.category)}</span> <button class="del-mine hover:text-red-400 ml-1" data-id="${i.id}"><i class="fas fa-xmark"></i></button></span>`).join('') || '<p class="text-slate-500 text-sm">No interests added yet.</p>'}
    </div>
    <h3 class="font-semibold mb-3"><i class="fas fa-user-group text-teal-400 mr-1"></i>Contacts who share your interests</h3>
    ${Object.entries(grouped).map(([interest, people]) => `
      <article class="card p-4 mb-3">
        <h4 class="text-sm font-semibold text-pink-400 mb-2"><i class="fas fa-heart mr-1"></i>${esc(interest)} <span class="text-slate-500 font-normal">(${people.length})</span></h4>
        <div class="flex flex-wrap gap-2">
          ${people.map(p => `<button class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 rounded-lg px-3 py-1.5 text-sm shared-person" data-id="${p.id}">
            <div class="avatar" style="background:${esc(p.avatar_color)};width:1.5rem;height:1.5rem;font-size:.55rem">${initials(p.full_name)}</div>
            ${esc(p.full_name)}${p.company ? `<span class="text-slate-500 text-xs">· ${esc(p.company)}</span>` : ''}
          </button>`).join('')}
        </div>
      </article>`).join('') || '<p class="text-slate-500 text-sm card p-6 text-center">No overlaps yet — add interests above and tag your contacts with interests too.</p>'}
  </section>`;
  document.getElementById('my-interest-form').onsubmit = async e => {
    e.preventDefault();
    await axios.post('/api/my-interests', { name: e.target.name.value, category: e.target.category.value });
    renderInterests();
  };
  $app.querySelectorAll('.del-mine').forEach(b => b.onclick = async () => { await axios.delete(`/api/my-interests/${b.dataset.id}`); renderInterests(); });
  $app.querySelectorAll('.shared-person').forEach(b => b.onclick = () => openContact(b.dataset.id));
}

/* ---------- boot ---------- */
render('dashboard');
