// GenNS - app shell, router, and view rendering
// Real GenLayerJS SDK integration with name_service.py contract
import { TLD, TRENDING, FAQ, MIN_COMMITMENT_AGE, ZERO_ADDRESS, connectWallet, disconnectWallet, getContractAddress, shortenAddress, initReadClient, normalize, isValidLabel, hashStringSync, fmtGEN, formatEth, computeCommitment, generateSecret, contractIsAvailable, contractResolve, contractGetDefaultFee, contractGetFee, contractGetPremium, contractGetText, contractGetNamesByOwner, contractIsNameOwner, contractCheckNormalization, contractReverseResolve, contractCommit, contractReveal, contractRenew, contractSetText, contractSetPrimaryName, contractRegisterSubdomain, contractTransfer, contractFileDispute, loadOwnedNames, getNameInfo, currentAddress, readClient, contractAddress } from './mock-data.js';

const state = { wallet: { connected: false, address: null }, route: { path: '/', params: {}, query: {} } };
const app = document.getElementById('app');
const walletBtn = document.getElementById('walletBtn');
const toastStack = document.getElementById('toastStack');
const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');

// --- helpers ---

function fmtDate(d) {
  if (!d) return 'Unknown';
  if (typeof d === 'number') d = new Date(d * 1000);
  return (d instanceof Date && !isNaN(d))
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown';
}

function daysUntil(d) {
  if (!d) return 0;
  if (typeof d === 'number') d = new Date(d * 1000);
  return (!(d instanceof Date) || isNaN(d)) ? 0 : Math.max(0, Math.round((d - new Date()) / 86400000));
}

function toast(message, kind) {
  kind = kind || 'default';
  const el = document.createElement('div');
  el.className = 'toast toast--' + kind;
  el.textContent = message;
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 250); }, 3200);
}

function openModal(html, opts) {
  opts = opts || {};
  modal.innerHTML = html;
  modalBackdrop.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  if (!opts.persist) {
    modal.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
    modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
}

function closeModal() { modalBackdrop.classList.remove('is-open'); document.body.style.overflow = ''; }

function renderWalletBtn() {
  if (state.wallet.connected) {
    walletBtn.textContent = shortenAddress(state.wallet.address);
    walletBtn.classList.add('is-connected');
  } else {
    walletBtn.textContent = 'Connect wallet';
    walletBtn.classList.remove('is-connected');
  }
}

// --- Wallet ---

async function doConnectWallet() {
  try {
    openModal('<div class="modal-wallet"><div class="wallet-spinner"></div><h3>Connecting wallet...</h3><p>Approve the connection in your wallet.</p></div>', { persist: true });
    const addr = await connectWallet();
    state.wallet.connected = true;
    state.wallet.address = addr;
    renderWalletBtn();
    closeModal();
    toast('Wallet connected', 'success');
    return true;
  } catch (err) {
    closeModal();
    toast(err.message || 'Connection failed', 'error');
    return false;
  }
}

async function ensureWallet() {
  if (state.wallet.connected) return true;
  return doConnectWallet();
}

walletBtn.addEventListener('click', () => {
  if (state.wallet.connected) {
    openModal(`<div class="modal-simple">
      <button class="modal-close" data-close-modal>&times;</button>
      <h3>${shortenAddress(state.wallet.address)}</h3>
      <p>Connected to GenNS via MetaMask.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close-modal>Cancel</button>
        <button class="btn btn-danger" id="disconnectBtn">Disconnect</button>
      </div>
    </div>`);
    document.getElementById('disconnectBtn').addEventListener('click', () => {
      state.wallet.connected = false; state.wallet.address = null;
      disconnectWallet(); renderWalletBtn(); closeModal(); toast('Wallet disconnected');
      if (state.route.path === '/names') navigate('#/');
    });
  } else { doConnectWallet(); }
});

// --- mobile nav ---
const navToggle = document.getElementById('navMenuToggle');
const mainNav = document.getElementById('mainNav');
navToggle.addEventListener('click', () => { const open = mainNav.classList.toggle('is-open'); navToggle.setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', (e) => { if (e.target.matches('[data-nav]')) { mainNav.classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); } });

// --- router ---

const routes = [
  { test: /^\/$/, view: viewHome },
  { test: /^\/search$/, view: viewSearch },
  { test: /^\/name\/([^/]+)$/, view: viewName },
  { test: /^\/register\/([^/]+)$/, view: viewRegister },
  { test: /^\/names$/, view: viewNames },
  { test: /^\/profile\/([^/]+)$/, view: viewProfile },
  { test: /^\/settings\/([^/]+)$/, view: viewSettings },
  { test: /^\/learn$/, view: viewLearn },
];

function parseHash() {
  let hash = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = hash.split('?');
  const query = {};
  if (queryPart) new URLSearchParams(queryPart).forEach((v, k) => (query[k] = v));
  return { path: pathPart || '/', query };
}

function navigate(hash) { location.hash = hash; }
document.addEventListener('click', (e) => { const a = e.target.closest('[data-nav]'); if (a) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); });

function render() {
  const { path, query } = parseHash();
  const match = routes.find(r => r.test.test(path));
  window.scrollTo(0, 0);
  if (!match) { app.innerHTML = '<section class="page-inner not-found"><h1>Name not found</h1><p>That page does not exist.</p><a class="btn btn-primary" href="#/" data-nav>Back to search</a></section>'; return; }
  const params = path.match(match.test).slice(1);
  state.route = { path, params, query };
  app.classList.remove('is-in');
  match.view(...params, query);
  requestAnimationFrame(() => app.classList.add('is-in'));
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => { initReadClient(); renderWalletBtn(); render(); });

function useTemplate(id) { const tpl = document.getElementById(id); app.innerHTML = ''; app.appendChild(tpl.content.cloneNode(true)); }

// --- HOME ---

function viewHome() {
  useTemplate('tpl-home');

  // Fetch real default fee from contract
  (async () => {
    try {
      const fee = await contractGetDefaultFee();
      document.getElementById('statDefaultFee').textContent = fmtGEN(fee) + ' GEN';
    } catch (_) {}
  })();

  const trendingList = document.getElementById('trendingList');
  trendingList.innerHTML = TRENDING.map(n => `<button class="trending-pill" data-name="${n}">${n}${TLD}</button>`).join('');
  trendingList.addEventListener('click', (e) => { const btn = e.target.closest('.trending-pill'); if (btn) navigate('#/name/' + btn.dataset.name); });

  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const live = document.getElementById('searchLive');
  let searchDebounce = null;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const val = input.value.trim();
    if (!val) { live.innerHTML = ''; live.classList.remove('is-open'); return; }
    const normalizedName = normalize(val);
    if (!isValidLabel(normalizedName)) {
      live.classList.add('is-open');
      live.innerHTML = '<div class="live-row live-row--error">Use lowercase letters, numbers, and hyphens only</div>';
      return;
    }
    live.classList.add('is-open');
    live.innerHTML = '<div class="live-row"><span class="live-name">' + normalizedName + TLD + '</span><span class="muted">Checking...</span></div>';
    searchDebounce = setTimeout(async () => {
      if (!contractAddress) { live.innerHTML = '<a class="live-row" href="#/name/' + normalizedName + '" data-nav><span class="live-name">' + normalizedName + TLD + '</span><span class="muted">No contract configured</span></a>'; return; }
      try {
        const [available, normCheck] = await Promise.all([contractIsAvailable(normalizedName, ''), contractCheckNormalization(normalizedName).catch(() => 'SAFE')]);
        let normBadge = '';
        if (normCheck === 'SUSPICIOUS') normBadge = '<span class="badge badge-taken" style="margin-left:8px">Warning: Suspicious</span>';
        else if (normCheck === 'REJECT') normBadge = '<span class="badge badge-taken" style="margin-left:8px;color:var(--error)">Rejected</span>';
        live.innerHTML = '<a class="live-row" href="#/name/' + normalizedName + '" data-nav><span class="live-name">' + normalizedName + TLD + normBadge + '</span><span class="badge ' + (available ? 'badge-available' : 'badge-taken') + '">' + (available ? 'Available' : 'Taken') + '</span></a>';
      } catch (e) {
        live.innerHTML = '<a class="live-row" href="#/name/' + normalizedName + '" data-nav><span class="live-name">' + normalizedName + TLD + '</span><span class="muted">Error - click to view</span></a>';
      }
    }, 400);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); const val = input.value.trim(); if (val) navigate('#/search?q=' + encodeURIComponent(val)); });
}

// --- SEARCH RESULTS ---

function viewSearch(query) {
  useTemplate('tpl-search');
  const q = query.q || '';
  const input = document.getElementById('searchInputPage');
  input.value = q;
  document.getElementById('searchFormPage').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) navigate('#/search?q=' + encodeURIComponent(v)); });
  document.getElementById('resultsTitle').textContent = q ? 'Results for "' + q + '"' : 'Search for a name';
  const list = document.getElementById('resultsList');
  let filter = 'all';

  async function draw() {
    if (!q) { list.innerHTML = '<div class="empty-state"><p>Type a name above to check availability.</p></div>'; return; }
    const normalizedName = normalize(q);
    if (!isValidLabel(normalizedName)) { list.innerHTML = '<div class="empty-state"><p>"' + q + '" is not a valid name.</p></div>'; return; }
    list.innerHTML = '<div class="empty-state"><p>Checking availability...</p></div>';
    try {
      const nameInfo = await getNameInfo(q);
      if (!nameInfo) { list.innerHTML = '<div class="empty-state"><p>Invalid name.</p></div>'; return; }
      const suffixes = ['hq', 'onchain', 'labs', 'dao', 'app', 'dev'];
      const alternatives = [];
      for (const s of suffixes) {
        if (alternatives.length >= 4) break;
        try { const altInfo = await getNameInfo(normalizedName + s); if (altInfo && altInfo.available) alternatives.push(altInfo); } catch (_) {}
      }
      const rows = [nameInfo, ...alternatives];
      const filtered = rows.filter(r => filter === 'available' ? r.available : filter === 'taken' ? r.taken : true);
      if (!filtered.length) { list.innerHTML = '<div class="empty-state"><p>No results match this filter.</p></div>'; return; }
      list.innerHTML = filtered.map(resultRowHTML).join('');
    } catch (e) { list.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>'; }
  }
  draw();
  document.getElementById('filterRow').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#filterRow .chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active'); filter = chip.dataset.filter; draw();
  });
}

function resultRowHTML(r) {
  return '<div class="result-row"><div class="result-main"><span class="result-name">' + r.full + '</span><span class="badge ' + (r.available ? 'badge-available' : 'badge-taken') + '">' + (r.available ? 'Available' : 'Taken') + '</span></div><div class="result-side">' + (r.available ? '<span class="result-price">' + (r.perYear > 0 ? r.perYear.toFixed(4) + ' GEN' : '...') + '<span class="muted">/yr</span></span>' : '<span class="result-owner">' + (r.owner ? shortenAddress(r.owner) : '---') + '</span>') + '<a class="btn ' + (r.available ? 'btn-primary' : 'btn-ghost') + ' btn-sm" href="#/name/' + r.name + '" data-nav>' + (r.available ? 'Register' : 'View') + '</a></div></div>';
}

// --- NAME DETAIL ---

async function viewName(rawName) {
  useTemplate('tpl-name');
  const card = document.getElementById('nameCard');
  const normalizedName = normalize(rawName);
  if (!isValidLabel(normalizedName)) { card.innerHTML = '<div class="empty-state"><p>That name is not valid.</p></div>'; return; }
  card.innerHTML = '<div class="empty-state"><p>Loading name info...</p></div>';
  try {
    if (!contractAddress) { card.innerHTML = '<div class="name-card"><h1>' + normalizedName + TLD + '</h1><p class="name-tier">' + normalizedName.length + ' characters</p><div class="price-block"><span class="price-num">0.0005 GEN</span><span class="muted">per year</span></div><div class="name-meta"><div class="meta-row"><span>Contract</span><span class="muted">Not configured</span></div></div></div>'; return; }
    const available = await contractIsAvailable(normalizedName, '');
    let owner = null, normCheck = 'SAFE';
    if (!available) { try { const r = await contractResolve(normalizedName); if (r && r !== ZERO_ADDRESS) owner = r; } catch (_) {} }
    try { normCheck = await contractCheckNormalization(normalizedName); } catch (_) {}
    let feeStr = '0.0005 GEN';
    try { const fee = await contractGetFee(normalizedName.length); feeStr = formatEth(fee); } catch (_) {}
    let normBadge = '';
    if (normCheck === 'SUSPICIOUS') normBadge = '<span class="badge badge-taken" style="margin-left:8px">Warning: Suspicious</span>';
    else if (normCheck === 'REJECT') normBadge = '<span class="badge badge-taken" style="margin-left:8px;color:var(--error)">Rejected by AI</span>';

    if (available) {
      const tier = normalizedName.length <= 3 ? 'Premium - 3 characters' : normalizedName.length === 4 ? 'Rare - 4 characters' : normalizedName.length + ' characters';
      let feeWei = 0n;
      try { feeWei = BigInt(await contractGetFee(normalizedName.length)); } catch (_) {}
      card.innerHTML = '<div class="name-card-head"><h1>' + normalizedName + TLD + normBadge + '</h1><span class="badge badge-available">Available</span></div>'
        + '<p class="name-tier">' + tier + '</p>'
        + '<div class="price-block"><span class="price-num" id="totalPrice">' + fmtGEN(feeWei) + '</span><span class="muted">GEN total</span></div>'
        + '<div class="year-stepper"><button class="stepper-btn" id="yearMinus" aria-label="Decrease years" disabled>–</button><div class="stepper-value"><span class="mono" id="yearCount">1</span><span class="stepper-label" id="yearWord">year</span></div><button class="stepper-btn" id="yearPlus" aria-label="Increase years">+</button></div>'
        + '<button class="btn btn-primary btn-lg btn-block" id="registerCta">Register this name</button>'
        + '<div class="name-meta"><div class="meta-row"><span>Network</span><span>GenLayer StudioNet</span></div><div class="meta-row"><span>Contract</span><span class="mono">' + shortenAddress(contractAddress) + '</span></div><div class="meta-row"><span>Renewable</span><span>Yes, any time</span></div><div class="meta-row"><span>Min. commit wait</span><span>60 seconds</span></div></div>';

      let nameYears = 1;
      const MAX_YEARS = 5;
      function updateTotal() {
        document.getElementById('yearCount').textContent = nameYears;
        document.getElementById('yearWord').textContent = nameYears === 1 ? 'year' : 'years';
        document.getElementById('totalPrice').textContent = fmtGEN(feeWei * BigInt(nameYears));
        document.getElementById('yearMinus').disabled = nameYears <= 1;
        document.getElementById('yearPlus').disabled = nameYears >= MAX_YEARS;
      }
      document.getElementById('yearMinus').addEventListener('click', () => { if (nameYears > 1) { nameYears--; updateTotal(); } });
      document.getElementById('yearPlus').addEventListener('click', () => { if (nameYears < MAX_YEARS) { nameYears++; updateTotal(); } });
      document.getElementById('registerCta').addEventListener('click', () => navigate('#/register/' + normalizedName + '?years=' + nameYears));
    } else {
      card.innerHTML = '<div class="name-card-head"><h1>' + normalizedName + TLD + '</h1><span class="badge badge-taken">Taken</span></div><div class="owner-block"><span class="owner-label">Owned by</span><span class="mono owner-address">' + (owner ? shortenAddress(owner) : 'Unknown') + '</span></div><div class="name-meta"><div class="meta-row"><span>Status</span><span>Registered</span></div></div><a class="btn btn-ghost btn-block" href="#/profile/' + normalizedName + '" data-nav>View public profile</a>';
    }
  } catch (e) { card.innerHTML = '<div class="empty-state"><p>Error loading name: ' + e.message + '</p></div>'; }
}

// --- REGISTER FLOW ---

const STEP_LABELS = ['Duration', 'Wallet', 'Commit', 'Wait', 'Reveal', 'Done'];

function viewRegister(rawName, query) {
  useTemplate('tpl-register');
  const normalizedName = normalize(rawName);
  const panel = document.getElementById('registerPanel');
  if (!isValidLabel(normalizedName)) { panel.innerHTML = '<div class="empty-state"><p>This name is not valid.</p></div>'; document.getElementById('stepper').innerHTML = ''; return; }

  let step = 0, years = parseInt(query && query.years, 10) || 1, commitSecret = null, commitHash = null, commitTimestamp = null;

  function drawStepper() {
    document.getElementById('stepper').innerHTML = STEP_LABELS.map((label, i) =>
      '<div class="step ' + (i < step ? 'is-done' : i === step ? 'is-active' : '') + '"><span class="step-dot">' + (i < step ? '&#10003;' : (i + 1)) + '</span><span class="step-label">' + label + '</span></div>'
    ).join('');
  }

  async function drawPanel() {
    drawStepper();
    try {
      if (step === 0) panel.innerHTML = stepDurationHTML(normalizedName, years);
      if (step === 1) panel.innerHTML = stepWalletHTML(normalizedName);
      if (step === 2) panel.innerHTML = stepCommitHTML(normalizedName, years);
      if (step === 3) panel.innerHTML = stepWaitHTML(normalizedName, commitTimestamp);
      if (step === 4) panel.innerHTML = stepRevealHTML(normalizedName, years);
      if (step === 5) panel.innerHTML = stepDoneHTML(normalizedName, years);
      bindPanel();
    } catch (e) { panel.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>'; }
  }

  function bindPanel() {
    if (step === 0) {
      panel.querySelectorAll('[data-years]').forEach(btn => btn.addEventListener('click', () => { years = parseInt(btn.dataset.years, 10); drawPanel(); }));
      panel.querySelector('#toWallet').addEventListener('click', () => { step = 1; drawPanel(); });
    }
    if (step === 1) { panel.querySelector('#doConnect').addEventListener('click', async () => { await ensureWallet(); step = 2; drawPanel(); }); }
    if (step === 2) {
      panel.querySelector('#backStep').addEventListener('click', () => { step = 0; drawPanel(); });
      panel.querySelector('#doCommit').addEventListener('click', () => runCommit());
    }
    if (step === 3) { panel.querySelector('#toReveal').addEventListener('click', () => { step = 4; drawPanel(); }); startWaitTimer(); }
    if (step === 4) { panel.querySelector('#backToWait').addEventListener('click', () => { step = 3; drawPanel(); }); panel.querySelector('#doReveal').addEventListener('click', () => runReveal()); }
    if (step === 5) { panel.querySelector('#toDashboard').addEventListener('click', () => navigate('#/names')); }
  }

  async function runCommit() {
    panel.innerHTML = txPendingHTML('Submitting commitment...');
    try {
      commitSecret = generateSecret();
      commitHash = await computeCommitment(normalizedName, currentAddress, commitSecret);
      await contractCommit(commitHash);
      commitTimestamp = Date.now();
      toast('Commitment submitted', 'success');
      step = 3; drawPanel();
    } catch (e) { panel.innerHTML = txErrorHTML('Commit failed: ' + e.message); }
  }

  function startWaitTimer() {
    const timerEl = document.getElementById('waitTimer');
    if (!timerEl || !commitTimestamp) return;
    function update() {
      const elapsed = Math.floor((Date.now() - commitTimestamp) / 1000);
      const remaining = Math.max(0, MIN_COMMITMENT_AGE - elapsed);
      const pct = Math.min(100, (elapsed / MIN_COMMITMENT_AGE) * 100);
      if (remaining <= 0) { timerEl.innerHTML = '<div class="done-mark" style="width:40px;height:40px;font-size:18px;margin-bottom:12px">&#10003;</div><p>Commitment mature - ready to reveal</p>'; return; }
      const min = Math.floor(remaining / 60), sec = remaining % 60;
      timerEl.innerHTML = '<div class="tx-spinner" style="margin-bottom:16px"></div><p>Waiting ' + min + ':' + String(sec).padStart(2, '0') + '...</p><div style="width:100%;height:6px;background:var(--border);border-radius:3px;margin-top:12px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--ember);border-radius:3px;transition:width 1s linear"></div></div>';
      requestAnimationFrame(() => setTimeout(update, 1000));
    }
    update();
  }

  async function runReveal() {
    panel.innerHTML = txPendingHTML('Revealing and registering...');
    try { await contractReveal(normalizedName, commitSecret, years); toast(normalizedName + TLD + ' registered', 'success'); step = 5; drawPanel(); }
    catch (e) { panel.innerHTML = txErrorHTML('Reveal failed: ' + e.message); }
  }

  drawPanel();
}

function stepDurationHTML(name, years) {
  const html = '<div class="panel-card"><h2>Choose a duration</h2><p class="panel-sub">' + name + TLD + '</p><div class="years-grid">' + [1,2,3,5].map(y => '<button class="year-opt ' + (y === years ? 'is-active' : '') + '" data-years="' + y + '"><span class="year-num">' + y + '</span><span class="year-label">' + (y === 1 ? 'year' : 'years') + '</span></button>').join('') + '</div><div class="total-row"><span>Registration period</span><span class="total-num">' + (years * 365) + ' days</span></div><div class="total-row"><span>Estimated total</span><span class="total-num" id="durationPrice">Loading...</span></div><button class="btn btn-primary btn-lg btn-block" id="toWallet">Continue</button></div>';
  // async fetch price
  contractGetFee(name.length).then(fee => {
    const el = document.getElementById('durationPrice');
    if (el) el.textContent = fmtGEN(BigInt(fee) * BigInt(years)) + ' GEN';
  }).catch(() => {});
  return html;
}

function stepWalletHTML(name) {
  if (state.wallet.connected) return '<div class="panel-card"><h2>Wallet connected</h2><p class="panel-sub">Continue to commit your registration.</p><div class="wallet-row"><span class="wallet-dot"></span><span class="mono">' + shortenAddress(state.wallet.address) + '</span></div><button class="btn btn-primary btn-lg btn-block" id="doConnect">Continue</button></div>';
  return '<div class="panel-card"><h2>Connect a wallet</h2><p class="panel-sub">Registering ' + name + TLD + ' requires a connected wallet.</p><button class="btn btn-primary btn-lg btn-block" id="doConnect">Connect wallet</button></div>';
}

function stepCommitHTML(name, years) {
  return '<div class="panel-card"><h2>Confirm commitment</h2><p class="panel-sub">A secret commitment will be submitted on-chain. After 60 seconds you can reveal to complete registration.</p><div class="confirm-grid"><div class="confirm-row"><span>Name</span><span>' + name + TLD + '</span></div><div class="confirm-row"><span>Duration</span><span>' + (years * 365) + ' days</span></div><div class="confirm-row"><span>Wallet</span><span class="mono">' + shortenAddress(state.wallet.address) + '</span></div><div class="confirm-row"><span>Wait</span><span>60 seconds after commit</span></div></div><button class="btn btn-primary btn-lg btn-block" id="doCommit">Submit commitment</button><button class="btn btn-ghost btn-block" id="backStep">Back</button></div>';
}

function stepWaitHTML(name, timestamp) {
  const elapsed = timestamp ? Math.floor((Date.now() - timestamp) / 1000) : 0;
  const ready = elapsed >= MIN_COMMITMENT_AGE;
  return '<div class="panel-card panel-card--center"><div id="waitTimer">' + (ready ? '<div class="done-mark" style="width:40px;height:40px;font-size:18px;margin-bottom:12px">&#10003;</div><p>Commitment mature</p>' : '<div class="tx-spinner" style="margin-bottom:16px"></div><p>Waiting for commitment to mature...</p>') + '</div><button class="btn btn-primary btn-lg btn-block" id="toReveal" ' + (ready ? '' : 'disabled') + '>Continue to reveal</button></div>';
}

function stepRevealHTML(name, years) {
  return '<div class="panel-card"><h2>Reveal and register</h2><p class="panel-sub">Submit the reveal transaction to register ' + name + TLD + '. The registration fee will be charged.</p><div class="confirm-grid"><div class="confirm-row"><span>Name</span><span>' + name + TLD + '</span></div><div class="confirm-row"><span>Duration</span><span>' + (years * 365) + ' days</span></div><div class="confirm-row"><span>Wallet</span><span class="mono">' + shortenAddress(state.wallet.address) + '</span></div></div><button class="btn btn-primary btn-lg btn-block" id="doReveal">Reveal and register</button><button class="btn btn-ghost btn-block" id="backToWait">Back</button></div>';
}

function txPendingHTML(message) {
  return '<div class="panel-card panel-card--center"><div class="tx-spinner"></div><h2>' + (message || 'Confirming transaction...') + '</h2><p class="panel-sub">Check your wallet for the confirmation prompt.</p></div>';
}

function txErrorHTML(message) {
  return '<div class="panel-card panel-card--center"><div style="width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:rgba(255,107,107,0.14);color:var(--error);font-size:26px;display:flex;align-items:center;justify-content:center">X</div><h2>Transaction failed</h2><p class="panel-sub">' + message + '</p><button class="btn btn-primary btn-lg btn-block" onclick="location.reload()">Try again</button></div>';
}

function stepDoneHTML(name, years) {
  return '<div class="panel-card panel-card--center"><div class="done-mark">&#10003;</div><h2>' + name + TLD + ' is yours</h2><p class="panel-sub">Registered for ' + (years * 365) + ' days. You can manage it from your dashboard.</p><button class="btn btn-primary btn-lg btn-block" id="toDashboard">Go to my names</button></div>';
}

// --- MY NAMES / DASHBOARD ---

async function viewNames() {
  useTemplate('tpl-names');
  const body = document.getElementById('namesBody');
  if (!state.wallet.connected) { body.innerHTML = '<div class="empty-state empty-state--card"><p>Connect a wallet to see your names.</p><button class="btn btn-primary" id="connectFromDash">Connect wallet</button></div>'; document.getElementById('connectFromDash').addEventListener('click', async () => { await ensureWallet(); viewNames(); }); return; }
  if (!contractAddress) { body.innerHTML = '<div class="empty-state empty-state--card"><p>No contract address configured.</p></div>'; return; }
  body.innerHTML = '<div class="empty-state"><p>Loading your names...</p></div>';
  try {
    const owned = await loadOwnedNames();
    if (!owned.length) { body.innerHTML = '<div class="empty-state empty-state--card"><p>You do not own any names yet.</p><a class="btn btn-primary" href="#/" data-nav>Search names</a></div>'; return; }
    body.innerHTML = '<div class="names-grid">' + owned.map(ownedCardHTML).join('') + '</div>';
  } catch (e) { body.innerHTML = '<div class="empty-state empty-state--card"><p>Error loading names: ' + e.message + '</p></div>'; }
}

function ownedCardHTML(n) {
  return '<div class="owned-card"><div class="owned-head"><span class="owned-name">' + n.full + '</span>' + (n.primary ? '<span class="badge badge-primary">Primary</span>' : '') + '</div><div class="owned-meta"><span class="' + (n.isActive ? 'muted' : 'text-warn') + '">' + (n.isActive ? 'Active' : 'Expired') + '</span></div><div class="owned-actions"><a class="btn btn-ghost btn-sm" href="#/profile/' + n.name + '" data-nav>View</a><a class="btn btn-ghost btn-sm" href="#/settings/' + n.name + '" data-nav>Manage</a></div></div>';
}

// --- PUBLIC PROFILE ---

async function viewProfile(rawName) {
  useTemplate('tpl-profile');
  const normalizedName = normalize(rawName);
  const body = document.getElementById('profileBody');
  body.innerHTML = '<a href="#/" class="back-link" data-nav>&larr; Back to search</a><div class="profile-card"><div class="profile-avatar" style="background:' + avatarGradient(normalizedName) + '"></div><h1>' + normalizedName + TLD + '</h1><p class="mono profile-address">Loading...</p><div class="profile-records" id="profileRecords"><div class="record-row"><span>Loading records...</span></div></div></div>';
  try {
    if (!contractAddress) { body.querySelector('.profile-address').textContent = 'No contract configured'; return; }
    const [resolvedAddr, website, twitter, bio] = await Promise.all([
      contractResolve(normalizedName).catch(() => ZERO_ADDRESS),
      contractGetText(normalizedName, 'website').catch(() => ''),
      contractGetText(normalizedName, 'twitter').catch(() => ''),
      contractGetText(normalizedName, 'bio').catch(() => ''),
    ]);
    const displayAddr = resolvedAddr && resolvedAddr !== ZERO_ADDRESS ? resolvedAddr : 'Not set';
    body.querySelector('.profile-address').textContent = shortenAddress(displayAddr);
    const recordsEl = document.getElementById('profileRecords');
    recordsEl.innerHTML = '<div class="record-row"><span>Address</span><span class="mono">' + shortenAddress(displayAddr) + '</span></div><div class="record-row"><span>Website</span><span>' + (website || '<span class="muted">Not set</span>') + '</span></div><div class="record-row"><span>X / Twitter</span><span>' + (twitter || '<span class="muted">Not set</span>') + '</span></div><div class="record-row"><span>Bio</span><span>' + (bio || '<span class="muted">Not set</span>') + '</span></div>';

    const isOwner = state.wallet.connected && resolvedAddr && resolvedAddr.toLowerCase() === (currentAddress || '').toLowerCase();
    if (state.wallet.connected && !isOwner) {
      recordsEl.innerHTML += '<div style="margin-top:20px"><button class="btn btn-danger btn-block" id="reportNameBtn">Report this name</button></div>';
      document.getElementById('reportNameBtn').addEventListener('click', () => {
        openModal('<div class="modal-simple"><button class="modal-close" data-close-modal>&times;</button><h3>Report ' + normalizedName + TLD + '</h3><label class="field"><span>Reason</span><input type="text" id="disputeReason" placeholder="e.g. phishing impersonation" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;color:var(--text);font-size:14px;width:100%"></label><label class="field"><span>Evidence URL</span><input type="text" id="disputeEvidence" placeholder="https://..." style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;color:var(--text);font-size:14px;width:100%"></label><div class="modal-actions"><button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-danger" id="submitDispute">Submit dispute</button></div></div>');
        document.getElementById('submitDispute').addEventListener('click', async () => {
          const reason = document.getElementById('disputeReason').value.trim();
          const evidence = document.getElementById('disputeEvidence').value.trim();
          if (!reason || !evidence) { toast('Fill in all fields', 'error'); return; }
          closeModal(); toast('Submitting dispute...');
          try { await contractFileDispute(normalizedName, reason, evidence); toast('Dispute filed', 'success'); }
          catch (e) { toast('Dispute failed: ' + e.message, 'error'); }
        });
      });
    }
  } catch (e) { body.querySelector('.profile-address').textContent = 'Error loading profile'; }
}

function avatarGradient(name) {
  const h = hashStringSync(name) % 360;
  return 'linear-gradient(135deg, hsl(' + h + ',85%,58%), hsl(' + ((h + 40) % 360) + ',90%,45%))';
}

// --- SETTINGS ---

async function viewSettings(rawName) {
  useTemplate('tpl-settings');
  const normalizedName = normalize(rawName);
  const body = document.getElementById('settingsBody');
  if (!state.wallet.connected) { body.innerHTML = '<div class="empty-state"><p>Connect a wallet to manage this name.</p></div>'; return; }
  body.innerHTML = '<p>Loading settings...</p>';
  try {
    if (!contractAddress) { body.innerHTML = '<div class="empty-state"><p>Set a contract address first.</p></div>'; return; }
    const isOwner = await contractIsNameOwner(currentAddress, normalizedName);
    if (!isOwner) { body.innerHTML = '<div class="empty-state"><p>You do not own this name.</p></div>'; return; }
    const [website, twitter, bio] = await Promise.all([
      contractGetText(normalizedName, 'website').catch(() => ''),
      contractGetText(normalizedName, 'twitter').catch(() => ''),
      contractGetText(normalizedName, 'bio').catch(() => ''),
    ]);
    const currentPrimary = await contractReverseResolve(currentAddress).catch(() => '');
    const isPrimary = currentPrimary === normalizedName;

    body.innerHTML = '<h1>' + normalizedName + TLD + '</h1>' +
      '<div class="panel-card"><h2>Text records</h2><p class="panel-sub">Shown on your public profile.</p>' +
      '<form id="recordsForm"><label class="field"><span>Website</span><input type="text" name="website" placeholder="https://example.com" value="' + (website || '') + '"></label><label class="field"><span>X / Twitter</span><input type="text" name="twitter" placeholder="@handle" value="' + (twitter || '') + '"></label><label class="field"><span>Bio</span><textarea name="bio" rows="3" placeholder="A short line about you">' + (bio || '') + '</textarea></label><button class="btn btn-primary btn-block" type="submit">Save records</button></form>' +
      '</div>' +
      '<div class="panel-card"><h2>Primary name</h2><p class="panel-sub">' + (isPrimary ? 'This is your primary name.' : 'Set this as the name shown when others look up your wallet.') + '</p><button class="btn ' + (isPrimary ? 'btn-ghost' : 'btn-primary') + ' btn-block" id="setPrimary" ' + (isPrimary ? 'disabled' : '') + '>' + (isPrimary ? 'Already primary' : 'Set as primary') + '</button></div>' +
      '<div class="panel-card"><h2>Subdomain</h2><p class="panel-sub">Create a subdomain under this name.</p><form id="subdomainForm" style="display:flex;gap:10px"><input type="text" id="subdomainLabel" placeholder="e.g. blog" style="flex:1;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;color:var(--text);font-size:14px"><button class="btn btn-primary" type="submit">Create</button></form></div>' +
      '<div class="panel-card"><h2>Renew</h2><p class="panel-sub">Extend your registration.</p>'
        + '<div class="year-stepper"><button class="stepper-btn" id="renewMinus" aria-label="Decrease years" disabled>\u2013</button><div class="stepper-value"><span class="mono" id="renewYearCount">1</span><span class="stepper-label" id="renewYearWord">year</span></div><button class="stepper-btn" id="renewPlus" aria-label="Increase years">+</button></div>'
        + '<div class="total-row"><span>Total</span><span class="total-num" id="renewPrice">Loading...</span></div>'
        + '<button class="btn btn-secondary btn-block" id="renewBtn">Renew</button></div>' +
      '<div class="panel-card panel-card--danger"><h2>Transfer</h2><p class="panel-sub">Transfer ownership to another address.</p><form id="transferForm" style="display:flex;gap:10px"><input type="text" id="transferAddr" placeholder="0x..." style="flex:1;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;color:var(--text);font-family:var(--font-mono);font-size:13px"><button class="btn btn-danger" type="submit">Transfer</button></form></div>';

    document.getElementById('recordsForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); toast('Saving records...');
      try { await Promise.all([contractSetText(normalizedName, 'website', fd.get('website') || ''), contractSetText(normalizedName, 'twitter', fd.get('twitter') || ''), contractSetText(normalizedName, 'bio', fd.get('bio') || '')]); toast('Records saved', 'success'); }
      catch (err) { toast('Save failed: ' + err.message, 'error'); }
    });
    document.getElementById('setPrimary').addEventListener('click', async () => {
      toast('Setting primary name...');
      try { await contractSetPrimaryName(normalizedName); toast(normalizedName + TLD + ' set as primary', 'success'); viewSettings(rawName); }
      catch (err) { toast('Failed: ' + err.message, 'error'); }
    });
    document.getElementById('subdomainForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const label = document.getElementById('subdomainLabel').value.trim();
      if (!label) { toast('Enter a subdomain label', 'error'); return; }
      toast('Creating ' + label + '.' + normalizedName + '...');
      try { await contractRegisterSubdomain(label, normalizedName); toast(label + '.' + normalizedName + TLD + ' created', 'success'); document.getElementById('subdomainLabel').value = ''; }
      catch (err) { toast('Failed: ' + err.message, 'error'); }
    });
    // Renew year stepper
    let renewYears = 1;
    const MAX_YEARS = 5;
    async function updateRenewPrice() {
      try {
        const fee = await contractGetFee(normalizedName.length);
        const premium = await contractGetPremium(normalizedName);
        const total = BigInt(fee) * BigInt(renewYears) + BigInt(premium);
        document.getElementById('renewPrice').textContent = fmtGEN(total) + ' GEN';
      } catch (_) { document.getElementById('renewPrice').textContent = '—'; }
      document.getElementById('renewYearCount').textContent = renewYears;
      document.getElementById('renewYearWord').textContent = renewYears === 1 ? 'year' : 'years';
      document.getElementById('renewMinus').disabled = renewYears <= 1;
      document.getElementById('renewPlus').disabled = renewYears >= MAX_YEARS;
    }
    updateRenewPrice();
    document.getElementById('renewMinus').addEventListener('click', () => { if (renewYears > 1) { renewYears--; updateRenewPrice(); } });
    document.getElementById('renewPlus').addEventListener('click', () => { if (renewYears < MAX_YEARS) { renewYears++; updateRenewPrice(); } });
    document.getElementById('renewBtn').addEventListener('click', async () => {
      toast('Renewing for ' + renewYears + ' year' + (renewYears > 1 ? 's' : '') + '...');
      try { await contractRenew(normalizedName, renewYears); toast(normalizedName + TLD + ' renewed for ' + renewYears + ' year' + (renewYears > 1 ? 's' : ''), 'success'); viewSettings(rawName); }
      catch (err) { toast('Renewal failed: ' + err.message, 'error'); }
    });
    document.getElementById('transferForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const toAddr = document.getElementById('transferAddr').value.trim();
      if (!toAddr) { toast('Enter a recipient address', 'error'); return; }
      toast('Transferring ' + normalizedName + '...');
      try { await contractTransfer(normalizedName, toAddr); toast(normalizedName + TLD + ' transferred', 'success'); navigate('#/names'); }
      catch (err) { toast('Transfer failed: ' + err.message, 'error'); }
    });
  } catch (e) { body.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>'; }
}

// --- LEARN / FAQ ---

function viewLearn() {
  useTemplate('tpl-learn');
  const list = document.getElementById('faqList');
  list.innerHTML = FAQ.map((item, i) => '<div class="faq-item"><button class="faq-q" data-i="' + i + '"><span>' + item.q + '</span><span class="faq-caret">+</span></button><div class="faq-a"><p>' + item.a + '</p></div></div>').join('');
  list.addEventListener('click', (e) => { const btn = e.target.closest('.faq-q'); if (!btn) return; btn.closest('.faq-item').classList.toggle('is-open'); });
}
