// ---------------------------------------------------------------
// GenNS — mock data layer
// Everything here is deterministic and local. No network calls.
// ---------------------------------------------------------------

const TLD = ".gen";

// Simple deterministic hash so the same name always resolves the same way.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// A fixed pool of names that are always "taken" so search feels real.
const TAKEN_NAMES = new Set([
  "jesse", "wallet", "ember", "base", "vitalik", "satoshi", "alex", "sam",
  "team", "admin", "support", "help", "official", "crypto", "web3", "defi",
  "nft", "dao", "app", "store", "shop", "market", "exchange", "coin",
  "token", "swap", "bridge", "vault", "labs", "studio", "build", "onchain"
]);

const TRENDING = ["fire", "torch", "glow", "orbit", "north", "atlas", "delta", "haven"];

function priceForName(name) {
  const len = name.length;
  if (len <= 3) return { perYear: 640, tier: "premium" };
  if (len === 4) return { perYear: 160, tier: "rare" };
  if (len === 5) return { perYear: 32, tier: "standard" };
  return { perYear: 5, tier: "standard" };
}

function isValidLabel(name) {
  return /^[a-z0-9-]{1,63}$/.test(name) && !name.startsWith("-") && !name.endsWith("-");
}

function normalize(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.gen$/i, "")
    .replace(/\s+/g, "-");
}

function getNameInfo(rawName) {
  const name = normalize(rawName);
  if (!name) return null;

  const valid = isValidLabel(name);
  const taken = valid && (TAKEN_NAMES.has(name) || hashString(name) % 7 === 0);
  const { perYear, tier } = priceForName(name || "x");

  let owner = null;
  let expires = null;
  if (taken) {
    const seed = hashString(name);
    owner = "0x" + seed.toString(16).padStart(6, "0").slice(0, 6) + "…" + (seed % 9973).toString(16).padStart(4, "0");
    const daysOut = 30 + (seed % 700);
    const d = new Date();
    d.setDate(d.getDate() + daysOut);
    expires = d;
  }

  return {
    name,
    full: name + TLD,
    valid,
    taken,
    available: valid && !taken,
    perYear,
    tier,
    owner,
    expires,
  };
}

function suggestAlternatives(name) {
  const base = normalize(name);
  if (!base) return [];
  const suffixes = ["hq", "onchain", "eth", "xyz", "labs", "dao"];
  const seen = new Set();
  const out = [];
  for (const s of suffixes) {
    const candidate = `${base}${s}`;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const info = getNameInfo(candidate);
    if (info && info.available) out.push(info);
    if (out.length >= 4) break;
  }
  return out;
}

// ---- "My names" mock portfolio (populated after first simulated connect) ----
const OWNED_NAMES_SEED = [
  { name: "founder", years: 2, daysLeft: 214, primary: true },
  { name: "studio7", years: 1, daysLeft: 41, primary: false },
  { name: "northlight", years: 3, daysLeft: 802, primary: false },
];

function getOwnedNames() {
  return OWNED_NAMES_SEED.map((n) => {
    const info = getNameInfo(n.name);
    const d = new Date();
    d.setDate(d.getDate() + n.daysLeft);
    return { ...info, years: n.years, expires: d, primary: n.primary };
  });
}

const FAQ = [
  {
    q: "What is GenNS?",
    a: "GenNS is a naming layer for onchain identity. A name you register points to your wallet address, so people can send you assets or find your profile without copying a long hex string.",
  },
  {
    q: "How is the price set?",
    a: "Price is based on length. Three-character names are the rarest and cost the most per year; five characters and longer settle at a flat, low yearly rate.",
  },
  {
    q: "What happens if I let a name expire?",
    a: "You get a grace period after expiry to renew before the name becomes available to anyone else. Renewal reminders show up on your dashboard as the date gets close.",
  },
  {
    q: "Can I hold more than one name?",
    a: "Yes. You can register as many as you'd like and choose one as your primary name — the one shown when other people look up your address.",
  },
  {
    q: "Is this connected to a real wallet or blockchain?",
    a: "No — this is a static demo. Wallet connection, transactions, and ownership are all simulated locally in your browser.",
  },
];
