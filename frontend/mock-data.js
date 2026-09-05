// ---------------------------------------------------------------
// GenNS — contract data layer
// Real GenLayerJS SDK integration with name_service.py contract
// ---------------------------------------------------------------

// GenLayerJS SDK — imported as ES module (not a window global)
import { createClient } from "https://esm.sh/genlayer-js@latest";
import { studionet } from "https://esm.sh/genlayer-js@latest/chains";

// ============================================================
// Configuration — edit these values for your deployment
// ============================================================
export const DEFAULT_CONTRACT_ADDRESS = "0x6F4744CEa4dCc0F4f196D214A7fA58eB0fde2173";
export const DEFAULT_NETWORK = "studionet";

// ---------- Constants ----------

export const TLD = ".gen";
export const REGISTRATION_PERIOD = 365 * 24 * 60 * 60; // 365 days in seconds
export const GRACE_PERIOD = 90 * 24 * 60 * 60; // 90 days in seconds
export const MIN_COMMITMENT_AGE = 60; // 60 seconds
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const GEN_DECIMALS = 18n;

// ---------- Wallet State ----------

export let readClient = null;
export let writeClient = null;
export let currentAddress = null;
export let contractAddress = localStorage.getItem("gns_contract") || DEFAULT_CONTRACT_ADDRESS;

// ---------- SDK Initialization ----------

export function initReadClient() {
  readClient = createClient({ chain: studionet, account: ZERO_ADDRESS });
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask.");

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  currentAddress = accounts[0];

  writeClient = createClient({
    chain: studionet,
    account: currentAddress,
    provider: window.ethereum,
  });

  try {
    await writeClient.connect('studionet');
  } catch (_) {
    /* may already be on correct chain */
  }

  return currentAddress;
}

export function disconnectWallet() {
  writeClient = null;
  currentAddress = null;
}

// ---------- Contract Address ----------

export function setContractAddress(addr) {
  contractAddress = addr;
  localStorage.setItem("gns_contract", addr);
}

export function getContractAddress() {
  return contractAddress;
}

export function shortenAddress(addr) {
  if (!addr) return "0x0000…0000";
  const s = String(addr);
  if (s.length <= 12) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

// ---------- Utilities ----------

export function isValidLabel(name) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && name.length <= 255;
}

export function normalize(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.gen$/i, "")
    .replace(/\s+/g, "-");
}

export async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hashStringSync(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function bigintToNumber(val) {
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") return Number(BigInt(val));
  return Number(val);
}

export function weiToEth(wei) {
  return Number(BigInt(wei) / 10n ** 14n) / 10000; // 4 decimal places
}

function ethToWeiFloat(ethStr) {
  const parts = ethStr.split(".");
  const whole = BigInt(parts[0] || "0");
  const frac = parts[1] || "";
  const padded = frac.padEnd(18, "0").slice(0, 18);
  return whole * 10n ** 18n + BigInt(padded);
}

export function formatEth(weiVal) {
  const num = weiToEth(weiVal);
  if (num === 0) return "0 GEN";
  if (num < 0.001) return "<0.001 GEN";
  return num.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + " GEN";
}

export function fmtGEN(weiVal) {
  const n = Number(BigInt(weiVal) / 10n ** 14n) / 10000;
  if (n === 0) return "0";
  return n.toFixed(n < 0.01 ? 4 : 2).replace(/0+$/, "").replace(/\.$/, "");
}

// ---------- Commitment Hashing ----------

export async function computeCommitment(label, ownerAddress, secretHex) {
  const normalized = label.toLowerCase();
  const addrHex = ownerAddress.toLowerCase().replace(/^0x/, "");
  const secretRaw = secretHex.toLowerCase().replace(/^0x/, "");

  const labelBytes = new TextEncoder().encode(normalized);
  const addrBytes = hexToBytes(addrHex);
  const secretBytes = hexToBytes(secretRaw);

  const payload = new Uint8Array(
    labelBytes.length + addrBytes.length + secretBytes.length
  );
  payload.set(labelBytes, 0);
  payload.set(addrBytes, labelBytes.length);
  payload.set(secretBytes, labelBytes.length + addrBytes.length);

  const hash = await crypto.subtle.digest("SHA-256", payload);
  return bytesToHex(new Uint8Array(hash));
}

export function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "0x" + bytesToHex(bytes);
}

// ---------- Name Info (for search/results) ----------

export async function getNameInfo(rawName) {
  const name = normalize(rawName);
  if (!name) return null;

  const valid = isValidLabel(name);
  if (!valid)
    return {
      name,
      full: name + TLD,
      valid: false,
      taken: false,
      available: false,
      perYear: 0,
      tier: "invalid",
      owner: null,
      expires: null,
    };

  let available = true;
  let owner = null;
  let expires = null;

  if (contractAddress) {
    try {
      available = await contractIsAvailable(name, "");
      if (!available) {
        const resolvedAddr = await contractResolve(name);
        if (resolvedAddr && resolvedAddr !== ZERO_ADDRESS) {
          owner = resolvedAddr;
          // Try to get text record for expiry display
          // Expiry is stored in the NameRecord, not accessible directly via view
          // We'll estimate based on contract state
        }
      }
    } catch (e) {
      console.warn("Contract read failed:", e);
    }
  }

  // Base fee from contract or fallback
  let perYear = 0;
  if (contractAddress) {
    try {
      const fee = await contractGetFee(name.length);
      perYear = weiToEth(fee);
    } catch (_) {
      perYear = 0.0005;
    }
  } else {
    perYear = 0.0005;
  }

  const tier =
    name.length <= 3 ? "premium" : name.length === 4 ? "rare" : "standard";

  return {
    name,
    full: name + TLD,
    valid,
    taken: !available,
    available,
    perYear,
    tier,
    owner,
    expires,
  };
}

// ---------- Contract Wrappers ----------

export async function contractIsAvailable(label, parent) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "is_available",
    args: [label, parent || ""],
  });
}

export async function contractGetDefaultFee() {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_default_fee",
    args: [],
  });
}

export async function contractGetFee(length) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_fee",
    args: [length],
  });
}

export async function contractGetPremium(name) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_premium",
    args: [name],
  });
}

export async function contractResolve(name) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "resolve",
    args: [name],
  });
}

export async function contractReverseResolve(addr) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "reverse_resolve",
    args: [addr],
  });
}

export async function contractGetText(name, key) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_text",
    args: [name, key],
  });
}

export async function contractGetAddrForCoin(name, coinType) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_addr_for_coin",
    args: [name, coinType],
  });
}

export async function contractGetContenthash(name) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_contenthash",
    args: [name],
  });
}

export async function contractGetNamesByOwner(addr) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_names_by_owner",
    args: [addr],
  });
}

export async function contractIsNameOwner(addr, name) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "is_name_owner",
    args: [addr, name],
  });
}

export async function contractCheckNormalization(label) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "check_normalization",
    args: [label],
  });
}

export async function contractCommit(commitmentHash) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "commit",
    args: ["0x" + commitmentHash],
  });
}

export async function contractReveal(label, secretHex, years) {
  const fee = await contractGetFee(label.length);
  const premium = await contractGetPremium(label);
  const totalValue = BigInt(fee) * BigInt(years || 1) + BigInt(premium);

  return writeClient.writeContract({
    address: contractAddress,
    functionName: "reveal",
    args: [label, hexToBytes(secretHex.replace(/^0x/, "")), years || 1],
    value: totalValue,
  });
}

export async function contractRenew(name, years) {
  const fee = await contractGetFee(name.length);
  const premium = await contractGetPremium(name);
  const totalValue = BigInt(fee) * BigInt(years || 1) + BigInt(premium);

  return writeClient.writeContract({
    address: contractAddress,
    functionName: "renew",
    args: [name, years || 1],
    value: totalValue,
  });
}

export async function contractSetAddr(name, addr) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "set_addr",
    args: [name, addr],
  });
}

export async function contractSetText(name, key, value) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "set_text",
    args: [name, key, value],
  });
}

export async function contractSetContenthash(name, hash) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "set_contenthash",
    args: [name, hexToBytes(hash.replace(/^0x/, ""))],
  });
}

export async function contractSetAddrForCoin(name, coinType, addr) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "set_addr_for_coin",
    args: [name, coinType, hexToBytes(addr.replace(/^0x/, ""))],
  });
}

export async function contractSetPrimaryName(name) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "set_primary_name",
    args: [name],
  });
}

export async function contractTransfer(name, toAddr) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "transfer",
    args: [name, toAddr],
  });
}

export async function contractRegisterSubdomain(label, parent) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "register_subdomain",
    args: [label, parent],
  });
}

export async function contractFileDispute(name, reason, evidenceUrl) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "file_dispute",
    args: [name, reason, evidenceUrl],
  });
}

export async function contractResolveDispute(disputeId) {
  return writeClient.writeContract({
    address: contractAddress,
    functionName: "resolve_dispute",
    args: [disputeId],
  });
}

export async function contractGetDispute(disputeId) {
  return readClient.readContract({
    address: contractAddress,
    functionName: "get_dispute",
    args: [disputeId],
  });
}

// ---------- Dashboard: Load Owned Names ----------

export async function loadOwnedNames() {
  if (!currentAddress || !contractAddress) return [];

  const names = await contractGetNamesByOwner(currentAddress);
  if (!names || names.length === 0) return [];

  const owned = [];
  for (const name of names) {
    try {
      const resolvedAddr = await contractResolve(name);
      // Name is active if resolve returns a non-zero address
      const isActive = resolvedAddr && resolvedAddr !== ZERO_ADDRESS;
      const isPrimary =
        resolvedAddr === currentAddress &&
        (await contractReverseResolve(currentAddress)) === name;

      // Get text records for the profile
      let website = "";
      let twitter = "";
      let bio = "";
      try {
        website = await contractGetText(name, "website");
        twitter = await contractGetText(name, "twitter");
        bio = await contractGetText(name, "bio");
      } catch (_) {}

      owned.push({
        name,
        full: name + TLD,
        isActive,
        owner: resolvedAddr,
        primary: isPrimary,
        perYear: 0.0005,
        website,
        twitter,
        bio,
      });
    } catch (e) {
      console.warn(`Failed to load data for ${name}:`, e);
    }
  }

  return owned;
}

// ---------- Trending (static for UI, no contract state) ----------

export const TRENDING = ["fire", "torch", "glow", "orbit", "north", "atlas", "delta", "haven"];

// ---------- FAQ ----------

export const FAQ = [
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
    a: "You get a 90-day grace period after expiry to renew before the name becomes available to anyone else. A premium surcharge applies during the first 21 days after the grace period.",
  },
  {
    q: "Can I hold more than one name?",
    a: "Yes. You can register as many as you'd like and choose one as your primary name — the one shown when other people look up your address.",
  },
  {
    q: "How does registration work?",
    a: "GenNS uses a commit/reveal scheme. You first commit a hash of your name and secret, wait at least 60 seconds, then reveal to complete registration. This prevents front-running.",
  },
  {
    q: "What are disputes?",
    a: "Anyone can file a dispute against a name that appears to be registered in bad faith (e.g. phishing impersonation). GenLayer validators independently evaluate the evidence and rule on whether to freeze the name.",
  },
  {
    q: "How do subdomains work?",
    a: "If you own a name, you can create subdomains like 'blog.alice.gen'. Subdomains don't expire independently — they're active as long as the parent name is active.",
  },
];
