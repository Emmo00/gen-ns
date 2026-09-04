// ---------------------------------------------------------------
// GenNS — app shell, router, and view rendering
// ---------------------------------------------------------------

const state = {
  wallet: { connected: false, address: null },
  route: { path: "/", params: {}, query: {} },
};

const app = document.getElementById("app");
const walletBtn = document.getElementById("walletBtn");
const toastStack = document.getElementById("toastStack");
const modalBackdrop = document.getElementById("modalBackdrop");
const modal = document.getElementById("modal");

// ---------- helpers ----------

function fmtUSD(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(d) {
  return Math.max(0, Math.round((d - new Date()) / 86400000));
}

function toast(message, kind = "default") {
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function openModal(html, opts = {}) {
  modal.innerHTML = html;
  modalBackdrop.classList.add("is-open");
  document.body.style.overflow = "hidden";
  if (!opts.persist) {
    modal.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModal));
    modalBackdrop.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onEscClose);
  }
}
function onBackdropClick(e) {
  if (e.target === modalBackdrop) closeModal();
}
function onEscClose(e) {
  if (e.key === "Escape") closeModal();
}
function closeModal() {
  modalBackdrop.classList.remove("is-open");
  document.body.style.overflow = "";
  modalBackdrop.removeEventListener("click", onBackdropClick);
  document.removeEventListener("keydown", onEscClose);
}

function renderWalletBtn() {
  if (state.wallet.connected) {
    walletBtn.textContent = state.wallet.address;
    walletBtn.classList.add("is-connected");
  } else {
    walletBtn.textContent = "Connect wallet";
    walletBtn.classList.remove("is-connected");
  }
}

function fakeAddress() {
  const chars = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * 16)];
  s += "…";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function connectWallet() {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-wallet">
        <button class="modal-close" data-close-modal aria-label="Close">&times;</button>
        <div class="wallet-spinner"></div>
        <h3>Connecting wallet…</h3>
        <p>Simulating a connection request. No real wallet is involved.</p>
      </div>
    `);
    setTimeout(() => {
      state.wallet.connected = true;
      state.wallet.address = fakeAddress();
      renderWalletBtn();
      closeModal();
      toast("Wallet connected", "success");
      resolve(true);
    }, 1100);
  });
}

async function ensureWallet() {
  if (state.wallet.connected) return true;
  return connectWallet();
}

walletBtn.addEventListener("click", () => {
  if (state.wallet.connected) {
    openModal(`
      <div class="modal-simple">
        <button class="modal-close" data-close-modal aria-label="Close">&times;</button>
        <h3>${state.wallet.address}</h3>
        <p>Connected to the GenNS demo. Disconnecting clears your simulated session only.</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-close-modal>Cancel</button>
          <button class="btn btn-danger" id="disconnectBtn">Disconnect</button>
        </div>
      </div>
    `);
    document.getElementById("disconnectBtn").addEventListener("click", () => {
      state.wallet.connected = false;
      state.wallet.address = null;
      renderWalletBtn();
      closeModal();
      toast("Wallet disconnected");
      if (state.route.path === "/names") navigate("#/");
    });
  } else {
    connectWallet();
  }
});

// ---------- mobile nav ----------
const navToggle = document.getElementById("navMenuToggle");
const mainNav = document.getElementById("mainNav");
navToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-nav]")) {
    mainNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

// ---------- router ----------

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
  let hash = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = hash.split("?");
  const query = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => (query[k] = v));
  }
  return { path: pathPart || "/", query };
}

function navigate(hash) {
  location.hash = hash;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-nav]");
  if (a) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
});

function render() {
  const { path, query } = parseHash();
  const match = routes.find((r) => r.test.test(path));
  window.scrollTo(0, 0);
  if (!match) {
    app.innerHTML = `<section class="page-inner not-found"><h1>Name not found</h1><p>That page doesn't exist in this demo.</p><a class="btn btn-primary" href="#/" data-nav>Back to search</a></section>`;
    return;
  }
  const params = path.match(match.test).slice(1);
  state.route = { path, params, query };
  app.classList.remove("is-in");
  match.view(...params, query);
  requestAnimationFrame(() => app.classList.add("is-in"));
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  renderWalletBtn();
  render();
});

function useTemplate(id) {
  const tpl = document.getElementById(id);
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
}

// ---------- HOME ----------

function viewHome() {
  useTemplate("tpl-home");

  const trendingList = document.getElementById("trendingList");
  trendingList.innerHTML = TRENDING.map(
    (n) => `<button class="trending-pill" data-name="${n}">${n}${TLD}</button>`
  ).join("");
  trendingList.addEventListener("click", (e) => {
    const btn = e.target.closest(".trending-pill");
    if (btn) navigate(`#/name/${btn.dataset.name}`);
  });

  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const live = document.getElementById("searchLive");

  input.addEventListener("input", () => {
    const val = input.value.trim();
    if (!val) {
      live.innerHTML = "";
      live.classList.remove("is-open");
      return;
    }
    const info = getNameInfo(val);
    live.classList.add("is-open");
    if (!info.valid) {
      live.innerHTML = `<div class="live-row live-row--error">Use lowercase letters, numbers, and hyphens only</div>`;
      return;
    }
    live.innerHTML = `
      <a class="live-row" href="#/name/${info.name}" data-nav>
        <span class="live-name">${info.full}</span>
        <span class="live-badge ${info.available ? "badge-available" : "badge-taken"}">${info.available ? "Available" : "Taken"}</span>
      </a>`;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val) navigate(`#/search?q=${encodeURIComponent(val)}`);
  });
}

// ---------- SEARCH RESULTS ----------

function viewSearch(query) {
  useTemplate("tpl-search");
  const q = query.q || "";
  const input = document.getElementById("searchInputPage");
  input.value = q;

  const form = document.getElementById("searchFormPage");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (v) navigate(`#/search?q=${encodeURIComponent(v)}`);
  });

  document.getElementById("resultsTitle").textContent = q ? `Results for “${q}”` : "Search for a name";

  const info = q ? getNameInfo(q) : null;
  const alts = q ? suggestAlternatives(q) : [];
  const list = document.getElementById("resultsList");

  let filter = "all";
  function draw() {
    const rows = [];
    if (info && info.valid) rows.push(info);
    rows.push(...alts);
    const filtered = rows.filter((r) => {
      if (filter === "available") return r.available;
      if (filter === "taken") return r.taken;
      return true;
    });
    if (!q) {
      list.innerHTML = `<div class="empty-state"><p>Type a name above to check availability.</p></div>`;
      return;
    }
    if (!info.valid) {
      list.innerHTML = `<div class="empty-state"><p>“${q}” isn't a valid name. Use lowercase letters, numbers, and hyphens.</p></div>`;
      return;
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state"><p>No results match this filter.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(resultRowHTML).join("");
  }
  draw();

  document.getElementById("filterRow").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#filterRow .chip").forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    filter = chip.dataset.filter;
    draw();
  });
}

function resultRowHTML(r) {
  return `
    <div class="result-row">
      <div class="result-main">
        <span class="result-name">${r.full}</span>
        <span class="badge ${r.available ? "badge-available" : "badge-taken"}">${r.available ? "Available" : "Taken"}</span>
      </div>
      <div class="result-side">
        ${r.available ? `<span class="result-price">${fmtUSD(r.perYear)}<span class="muted">/yr</span></span>` : `<span class="result-owner">${r.owner}</span>`}
        <a class="btn ${r.available ? "btn-primary" : "btn-ghost"} btn-sm" href="#/name/${r.name}" data-nav>${r.available ? "Register" : "View"}</a>
      </div>
    </div>`;
}

// ---------- NAME DETAIL ----------

function viewName(rawName) {
  useTemplate("tpl-name");
  const info = getNameInfo(rawName);
  const card = document.getElementById("nameCard");

  if (!info || !info.valid) {
    card.innerHTML = `<div class="empty-state"><p>That name isn't valid.</p></div>`;
    return;
  }

  if (info.available) {
    card.innerHTML = `
      <div class="name-card-head">
        <h1>${info.full}</h1>
        <span class="badge badge-available">Available</span>
      </div>
      <p class="name-tier">${info.tier === "premium" ? "Premium — 3 characters" : info.tier === "rare" ? "Rare — 4 characters" : `${info.name.length} characters`}</p>
      <div class="price-block">
        <span class="price-num">${fmtUSD(info.perYear)}</span>
        <span class="muted">per year</span>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="registerCta">Register this name</button>
      <div class="name-meta">
        <div class="meta-row"><span>Network</span><span>GenNS (demo)</span></div>
        <div class="meta-row"><span>Contract</span><span class="mono">0x8f2c…19ab</span></div>
        <div class="meta-row"><span>Renewable</span><span>Yes, any time</span></div>
      </div>
    `;
    document.getElementById("registerCta").addEventListener("click", () => navigate(`#/register/${info.name}`));
  } else {
    card.innerHTML = `
      <div class="name-card-head">
        <h1>${info.full}</h1>
        <span class="badge badge-taken">Taken</span>
      </div>
      <div class="owner-block">
        <span class="owner-label">Owned by</span>
        <span class="mono owner-address">${info.owner}</span>
      </div>
      <div class="name-meta">
        <div class="meta-row"><span>Expires</span><span>${fmtDate(info.expires)}</span></div>
        <div class="meta-row"><span>Days remaining</span><span>${daysUntil(info.expires)}</span></div>
      </div>
      <a class="btn btn-ghost btn-block" href="#/profile/${info.name}" data-nav>View public profile</a>
    `;
  }
}

// ---------- REGISTER FLOW ----------

const STEP_LABELS = ["Duration", "Wallet", "Confirm", "Done"];

function viewRegister(rawName) {
  useTemplate("tpl-register");
  const info = getNameInfo(rawName);
  const panel = document.getElementById("registerPanel");

  if (!info || !info.available) {
    panel.innerHTML = `<div class="empty-state"><p>This name isn't available to register.</p></div>`;
    document.getElementById("stepper").innerHTML = "";
    return;
  }

  let step = 0;
  let years = 1;

  function drawStepper() {
    document.getElementById("stepper").innerHTML = STEP_LABELS.map((label, i) => `
      <div class="step ${i < step ? "is-done" : i === step ? "is-active" : ""}">
        <span class="step-dot">${i < step ? "✓" : i + 1}</span>
        <span class="step-label">${label}</span>
      </div>
    `).join("");
  }

  function drawPanel() {
    drawStepper();
    if (step === 0) panel.innerHTML = stepDurationHTML(info, years);
    if (step === 1) panel.innerHTML = stepWalletHTML(info);
    if (step === 2) panel.innerHTML = stepConfirmHTML(info, years);
    if (step === 3) panel.innerHTML = stepDoneHTML(info, years);
    bindPanel();
  }

  function bindPanel() {
    if (step === 0) {
      panel.querySelectorAll("[data-years]").forEach((btn) => {
        btn.addEventListener("click", () => {
          years = parseInt(btn.dataset.years, 10);
          drawPanel();
        });
      });
      panel.querySelector("#toWallet").addEventListener("click", () => {
        step = 1;
        drawPanel();
      });
    }
    if (step === 1) {
      panel.querySelector("#doConnect").addEventListener("click", async () => {
        await ensureWallet();
        step = 2;
        drawPanel();
      });
    }
    if (step === 2) {
      panel.querySelector("#backStep").addEventListener("click", () => {
        step = 0;
        drawPanel();
      });
      panel.querySelector("#confirmTx").addEventListener("click", () => runTransaction());
    }
    if (step === 3) {
      panel.querySelector("#toDashboard").addEventListener("click", () => navigate("#/names"));
    }
  }

  function runTransaction() {
    panel.innerHTML = txPendingHTML();
    setTimeout(() => {
      OWNED_NAMES_SEED.unshift({ name: info.name, years, daysLeft: years * 365, primary: false });
      step = 3;
      drawPanel();
      toast(`${info.full} registered`, "success");
    }, 1600);
  }

  drawPanel();
}

function stepDurationHTML(info, years) {
  const options = [1, 2, 3, 5];
  const total = info.perYear * years;
  return `
    <div class="panel-card">
      <h2>Choose a duration</h2>
      <p class="panel-sub">${info.full} · ${fmtUSD(info.perYear)}/yr</p>
      <div class="years-grid">
        ${options.map((y) => `
          <button class="year-opt ${y === years ? "is-active" : ""}" data-years="${y}">
            <span class="year-num">${y}</span>
            <span class="year-label">${y === 1 ? "year" : "years"}</span>
          </button>
        `).join("")}
      </div>
      <div class="total-row">
        <span>Total</span>
        <span class="total-num">${fmtUSD(total)}</span>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="toWallet">Continue</button>
    </div>
  `;
}

function stepWalletHTML(info) {
  if (state.wallet.connected) {
    return `
      <div class="panel-card">
        <h2>Wallet connected</h2>
        <p class="panel-sub">Continue to review and confirm your registration.</p>
        <div class="wallet-row">
          <span class="wallet-dot"></span>
          <span class="mono">${state.wallet.address}</span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="doConnect">Continue</button>
      </div>
    `;
  }
  return `
    <div class="panel-card">
      <h2>Connect a wallet</h2>
      <p class="panel-sub">Registering ${info.full} requires a connected wallet to sign the transaction.</p>
      <button class="btn btn-primary btn-lg btn-block" id="doConnect">Connect wallet</button>
    </div>
  `;
}

function stepConfirmHTML(info, years) {
  const total = info.perYear * years;
  return `
    <div class="panel-card">
      <h2>Confirm registration</h2>
      <div class="confirm-grid">
        <div class="confirm-row"><span>Name</span><span>${info.full}</span></div>
        <div class="confirm-row"><span>Duration</span><span>${years} ${years === 1 ? "year" : "years"}</span></div>
        <div class="confirm-row"><span>Rate</span><span>${fmtUSD(info.perYear)}/yr</span></div>
        <div class="confirm-row"><span>Wallet</span><span class="mono">${state.wallet.address}</span></div>
        <div class="confirm-row confirm-row--total"><span>Total</span><span>${fmtUSD(total)}</span></div>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="confirmTx">Confirm and register</button>
      <button class="btn btn-ghost btn-block" id="backStep">Back</button>
    </div>
  `;
}

function txPendingHTML() {
  return `
    <div class="panel-card panel-card--center">
      <div class="tx-spinner"></div>
      <h2>Confirming transaction…</h2>
      <p class="panel-sub">This is simulated — no real network confirmation is happening.</p>
    </div>
  `;
}

function stepDoneHTML(info, years) {
  return `
    <div class="panel-card panel-card--center">
      <div class="done-mark">✓</div>
      <h2>${info.full} is yours</h2>
      <p class="panel-sub">Registered for ${years} ${years === 1 ? "year" : "years"}. You can manage it from your dashboard.</p>
      <button class="btn btn-primary btn-lg btn-block" id="toDashboard">Go to my names</button>
    </div>
  `;
}

// ---------- MY NAMES / DASHBOARD ----------

function viewNames() {
  useTemplate("tpl-names");
  const body = document.getElementById("namesBody");

  if (!state.wallet.connected) {
    body.innerHTML = `
      <div class="empty-state empty-state--card">
        <p>Connect a wallet to see the names in your demo portfolio.</p>
        <button class="btn btn-primary" id="connectFromDash">Connect wallet</button>
      </div>`;
    document.getElementById("connectFromDash").addEventListener("click", async () => {
      await ensureWallet();
      viewNames();
    });
    return;
  }

  const owned = getOwnedNames();
  if (!owned.length) {
    body.innerHTML = `<div class="empty-state empty-state--card"><p>You don't own any names yet.</p><a class="btn btn-primary" href="#/" data-nav>Search names</a></div>`;
    return;
  }

  body.innerHTML = `<div class="names-grid">${owned.map(ownedCardHTML).join("")}</div>`;
}

function ownedCardHTML(n) {
  const days = daysUntil(n.expires);
  const soon = days <= 60;
  return `
    <div class="owned-card">
      <div class="owned-head">
        <span class="owned-name">${n.full}</span>
        ${n.primary ? `<span class="badge badge-primary">Primary</span>` : ""}
      </div>
      <div class="owned-meta">
        <span class="${soon ? "text-warn" : "muted"}">${soon ? "Expires soon · " : "Expires "}${fmtDate(n.expires)}</span>
      </div>
      <div class="owned-actions">
        <a class="btn btn-ghost btn-sm" href="#/profile/${n.name}" data-nav>View</a>
        <a class="btn btn-ghost btn-sm" href="#/settings/${n.name}" data-nav>Manage</a>
      </div>
    </div>
  `;
}

// ---------- PUBLIC PROFILE ----------

function viewProfile(rawName) {
  useTemplate("tpl-profile");
  const info = getNameInfo(rawName);
  const owned = getOwnedNames().find((o) => o.name === info.name);
  const body = document.getElementById("profileBody");

  const address = owned ? state.wallet.address || "0x0000…0000" : info.owner;

  body.innerHTML = `
    <a href="#/" class="back-link" data-nav>&larr; Back to search</a>
    <div class="profile-card">
      <div class="profile-avatar" style="background:${avatarGradient(info.name)}"></div>
      <h1>${info.full}</h1>
      <p class="mono profile-address">${address}</p>
      <div class="profile-records">
        <div class="record-row"><span>Address</span><span class="mono">${address}</span></div>
        <div class="record-row"><span>Website</span><span class="muted">Not set</span></div>
        <div class="record-row"><span>X / Twitter</span><span class="muted">Not set</span></div>
        ${owned ? `<div class="record-row"><span>Expires</span><span>${fmtDate(owned.expires)}</span></div>` : ""}
      </div>
      ${owned ? `<a class="btn btn-primary btn-block" href="#/settings/${info.name}" data-nav>Edit records</a>` : ""}
    </div>
  `;
}

function avatarGradient(name) {
  const h = hashString(name) % 360;
  return `linear-gradient(135deg, hsl(${h},85%,58%), hsl(${(h + 40) % 360},90%,45%))`;
}

// ---------- SETTINGS ----------

function viewSettings(rawName) {
  useTemplate("tpl-settings");
  const info = getNameInfo(rawName);
  const owned = getOwnedNames().find((o) => o.name === info.name);
  const body = document.getElementById("settingsBody");

  if (!owned) {
    body.innerHTML = `<div class="empty-state"><p>You don't manage this name.</p></div>`;
    return;
  }

  body.innerHTML = `
    <h1>${owned.full}</h1>
    <div class="panel-card">
      <h2>Text records</h2>
      <p class="panel-sub">Shown on your public profile. Changes save locally for this demo.</p>
      <form id="recordsForm">
        <label class="field">
          <span>Website</span>
          <input type="text" name="website" placeholder="https://example.com">
        </label>
        <label class="field">
          <span>X / Twitter</span>
          <input type="text" name="twitter" placeholder="@handle">
        </label>
        <label class="field">
          <span>Bio</span>
          <textarea name="bio" rows="3" placeholder="A short line about you"></textarea>
        </label>
        <button class="btn btn-primary btn-block" type="submit">Save records</button>
      </form>
    </div>
    <div class="panel-card">
      <h2>Primary name</h2>
      <p class="panel-sub">${owned.primary ? "This is your primary name — shown when others look up your wallet." : "Set this as the name shown when others look up your wallet."}</p>
      <button class="btn ${owned.primary ? "btn-ghost" : "btn-primary"} btn-block" id="setPrimary" ${owned.primary ? "disabled" : ""}>
        ${owned.primary ? "Already primary" : "Set as primary"}
      </button>
    </div>
    <div class="panel-card panel-card--danger">
      <h2>Renew</h2>
      <p class="panel-sub">Extend before it expires on ${fmtDate(owned.expires)}.</p>
      <button class="btn btn-secondary btn-block" id="renewBtn">Renew for 1 year — ${fmtUSD(owned.perYear)}</button>
    </div>
  `;

  document.getElementById("recordsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Records saved", "success");
  });
  document.getElementById("setPrimary").addEventListener("click", () => {
    OWNED_NAMES_SEED.forEach((n) => (n.primary = n.name === owned.name));
    toast(`${owned.full} set as primary`, "success");
    viewSettings(rawName);
  });
  document.getElementById("renewBtn").addEventListener("click", () => {
    toast("Renewing…");
    setTimeout(() => {
      const seed = OWNED_NAMES_SEED.find((n) => n.name === owned.name);
      if (seed) seed.daysLeft += 365;
      toast(`${owned.full} renewed for 1 year`, "success");
      viewSettings(rawName);
    }, 1000);
  });
}

// ---------- LEARN / FAQ ----------

function viewLearn() {
  useTemplate("tpl-learn");
  const list = document.getElementById("faqList");
  list.innerHTML = FAQ.map((item, i) => `
    <div class="faq-item">
      <button class="faq-q" data-i="${i}">
        <span>${item.q}</span>
        <span class="faq-caret">+</span>
      </button>
      <div class="faq-a"><p>${item.a}</p></div>
    </div>
  `).join("");
  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".faq-q");
    if (!btn) return;
    btn.closest(".faq-item").classList.toggle("is-open");
  });
}