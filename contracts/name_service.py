# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
GNS (GenLayer Name Service) — a naming protocol for GenLayer.
"""

from genlayer import *
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_LABEL_LENGTH = 1
MAX_LABEL_LENGTH = 255
MIN_COMMITMENT_AGE = 60                    # seconds
MAX_COMMITMENT_AGE = 24 * 60 * 60          # 24h
REGISTRATION_PERIOD = 365 * 24 * 60 * 60   # 365 days
GRACE_PERIOD = 90 * 24 * 60 * 60           # 90 days
MAX_SUBDOMAIN_DEPTH = 10
DEFAULT_PREMIUM_DECAY_PERIOD = 21 * 24 * 60 * 60  # 21 days
SEP = "\x00"  # composite-key separator for flattened resolver maps

# Error classification (write-contract skill)
ERROR_EXPECTED = "[EXPECTED]"   # Business logic (deterministic) - exact match required
ERROR_EXTERNAL = "[EXTERNAL]"   # External API 4xx (deterministic) - exact match required
ERROR_TRANSIENT = "[TRANSIENT]"  # Network/5xx (non-deterministic) - agree if both transient
ERROR_LLM = "[LLM_ERROR]"  # LLM misbehavior - always disagree, force rotation

# Valid label characters: lowercase alphanumeric and hyphens (no leading/trailing hyphen)
VALID_LABEL_RE = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
RESERVED_NAMES = frozenset({'www', 'email', 'admin', 'root', 'null', 'undefined'})

# ---------------------------------------------------------------------------
# Storage-compatible records
# ---------------------------------------------------------------------------

@allow_storage
@dataclass
class NameRecord:
    label: str          # this node's own label, e.g. "alice"
    parent: str          # full parent name, "" for a top-level name
    owner: Address
    resolved_address: Address
    expires_at: u64      # 0 for subdomains (they never expire independently)
    epoch: u64
    parent_epoch: u64    # parent's epoch at the time this record was (re)created


@allow_storage
@dataclass
class Commitment:
    committer: Address
    timestamp: u64


@allow_storage
@dataclass
class Dispute:
    name: str
    filer: Address
    reason: str
    evidence_url: str
    resolved: bool
    upheld: bool
    ruling: str


class NameService(gl.Contract):
    records: TreeMap[str, NameRecord]
    commitments: TreeMap[str, Commitment]
    disputes: DynArray[Dispute]

    # Flattened resolver data: key is f"{name}{SEP}{recordKey}"
    text_records: TreeMap[str, str]
    coin_addresses: TreeMap[str, bytes]   # key: f"{name}{SEP}{coinType}"
    contenthashes: TreeMap[str, bytes]

    primary_name: TreeMap[Address, str]
    owned_names: TreeMap[str, str]   # key: str(addr), value: "name1\x00name2\x00..."

    length_fees: TreeMap[u32, u256]
    default_fee: u256
    max_premium: u256
    premium_decay_period: u64
    owner: Address                        # zero this out / remove admin fns for a GNS-style ownerless deploy

    def __init__(self):
        self.owner = gl.message.sender_address
        self.default_fee = u256(5 * 10**14)      # 0.0005 GEN, mirrors GNS's 5+ byte tier
        self.max_premium = u256(100 * 10**18)     # 100 GEN
        self.premium_decay_period = u64(DEFAULT_PREMIUM_DECAY_PERIOD)

    # ---- internal helpers -------------------------------------------------

    def _now(self) -> int:
        # Use transaction timestamp if available (deterministic across validators).
        # Fallback to datetime.now() for local testing.
        try:
            return int(gl.message.timestamp)
        except Exception:
            return int(datetime.now(timezone.utc).timestamp())

    def _full_name(self, label: str, parent: str) -> str:
        return label if parent == "" else f"{label}.{parent}"

    def _get_fee(self, length: int) -> u256:
        fee = self.length_fees.get(u32(length), None)
        return fee if fee is not None else self.default_fee

    def _is_active(self, name: str) -> bool:
        # Iterative parent-chain walk with depth limit to prevent circular references.
        current = name
        depth = 0
        while depth < MAX_SUBDOMAIN_DEPTH:
            rec = self.records.get(current, None)
            if rec is None:
                return False
            if rec.parent == "":
                return self._now() <= int(rec.expires_at)
            parent = self.records.get(rec.parent, None)
            if parent is None or rec.parent_epoch != parent.epoch:
                return False
            current = rec.parent
            depth += 1
        return False  # depth limit exceeded - treat as inactive

    def _require_active(self, name: str):
        if not self._is_active(name):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Expired")

    def _require_owner(self, name: str):
        rec = self.records.get(name, None)
        if rec is None or rec.owner != gl.message.sender_address:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized")

    def _index_add(self, addr: Address, name: str):
        addr_key = str(addr)
        existing = self.owned_names.get(addr_key, None)
        names = existing.split(SEP) if existing is not None and existing != "" else []
        if name not in names:
            names.append(name)
            self.owned_names[addr_key] = SEP.join(names)

    def _index_remove(self, addr: Address, name: str):
        addr_key = str(addr)
        existing = self.owned_names.get(addr_key, None)
        if existing is None or existing == "":
            return
        names = existing.split(SEP)
        if name in names:
            names.remove(name)
            if names:
                self.owned_names[addr_key] = SEP.join(names)
            else:
                del self.owned_names[addr_key]

    def _to_hex_key(self, val) -> str:
        """Normalize a commitment (str or bytes) to a lowercase hex string (no 0x prefix)."""
        if isinstance(val, bytes):
            return val.hex()
        s = str(val).lower()
        if s.startswith("0x"):
            s = s[2:]
        return s

    def _premium(self, name: str) -> u256:
        rec = self.records.get(name, None)
        if rec is None or rec.parent != "":
            return u256(0)
        grace_end = int(rec.expires_at) + GRACE_PERIOD
        now = self._now()
        if now <= grace_end:
            return u256(0)
        elapsed = now - grace_end
        decay = int(self.premium_decay_period)
        if elapsed >= decay:
            return u256(0)
        return u256(int(self.max_premium) * (decay - elapsed) // decay)

    # ---- read methods -------------------------------------------------

    @gl.public.view
    def is_available(self, label: str, parent: str) -> bool:
        name = self._full_name(label, parent)
        rec = self.records.get(name, None)
        if rec is None:
            return True
        return not self._is_active(name)

    @gl.public.view
    def get_fee(self, length: u32) -> u256:
        return self._get_fee(int(length))

    @gl.public.view
    def get_premium(self, name: str) -> u256:
        return self._premium(name)

    @gl.public.view
    def resolve(self, name: str) -> str:
        if not self._is_active(name):
            return str(Address("0x0000000000000000000000000000000000000000"))
        rec = self.records[name]
        zero = Address("0x0000000000000000000000000000000000000000")
        if rec.resolved_address != zero:
            return str(rec.resolved_address)
        return str(rec.owner)

    @gl.public.view
    def reverse_resolve(self, addr: str) -> str:
        addr_normalized = str(Address(addr))
        name = self.primary_name.get(Address(addr), None)
        if name is None or not self._is_active(name):
            return ""
        if self.resolve(name) != addr_normalized:
            return ""
        return name

    @gl.public.view
    def get_text(self, name: str, key: str) -> str:
        return self.text_records.get(f"{name}{SEP}{key}", "")

    @gl.public.view
    def get_addr_for_coin(self, name: str, coin_type: u256) -> bytes:
        return self.coin_addresses.get(f"{name}{SEP}{int(coin_type)}", b"")

    @gl.public.view
    def get_contenthash(self, name: str) -> bytes:
        return self.contenthashes.get(name, b"")

    @gl.public.view
    def is_name_owner(self, addr: Address, name: str) -> bool:
        existing = self.owned_names.get(str(addr), None)
        if existing is None or existing == "":
            return False
        return name in existing.split(SEP)

    @gl.public.view
    def get_names_by_owner(self, addr: Address) -> list:
        existing = self.owned_names.get(str(addr), None)
        if existing is None or existing == "":
            return []
        return existing.split(SEP)

    @gl.public.view
    def make_commitment(self, label: str, owner_hex: Address, secret) -> str:
        normalized = label.lower()  # ASCII-only stand-in
        addr_bytes = bytes.fromhex(str(owner_hex).removeprefix("0x"))
        if isinstance(secret, str):
            secret = bytes.fromhex(secret.removeprefix("0x"))
        payload = normalized.encode("utf-8") + addr_bytes + secret
        return hashlib.sha256(payload).digest().hex()

    # ---- write methods -------------------------------------------------

    @gl.public.write
    def commit(self, commitment):
        key = self._to_hex_key(commitment)
        existing = self.commitments.get(key, None)
        now = self._now()
        if existing is not None and (now - int(existing.timestamp)) <= MAX_COMMITMENT_AGE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} AlreadyCommitted")
        self.commitments[key] = Commitment(
            committer=gl.message.sender_address, timestamp=u64(now)
        )

    @gl.public.write.payable
    def reveal(self, label: str, secret: bytes) -> str:
        normalized = label.lower()
        if not (MIN_LABEL_LENGTH <= len(normalized.encode("utf-8")) <= MAX_LABEL_LENGTH):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} InvalidLength")

        commitment_key = self.make_commitment(
            normalized, gl.message.sender_address, secret
        )
        c = self.commitments.get(commitment_key, None)
        if c is None:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} CommitmentNotFound")
        now = self._now()
        age = now - int(c.timestamp)
        if age < MIN_COMMITMENT_AGE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} CommitmentTooNew")
        if age > MAX_COMMITMENT_AGE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} CommitmentTooOld")
        if c.committer != gl.message.sender_address:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized")

        if not self.is_available(normalized, ""):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} AlreadyRegistered")

        fee = self._get_fee(len(normalized.encode("utf-8")))
        premium = self._premium(normalized)
        required = int(fee) + int(premium)
        if int(gl.message.value) < required:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} InsufficientFee")

        prior = self.records.get(normalized, None)
        epoch = u64(int(prior.epoch) + 1) if prior is not None else u64(0)

        zero = Address("0x0000000000000000000000000000000000000000")
        self.records[normalized] = NameRecord(
            label=normalized,
            parent="",
            owner=gl.message.sender_address,
            resolved_address=zero,
            expires_at=u64(now + REGISTRATION_PERIOD),
            epoch=epoch,
            parent_epoch=u64(0),
        )

        del self.commitments[commitment_key]
        self._index_add(gl.message.sender_address, normalized)

        # Refund excess value
        excess = int(gl.message.value) - required
        if excess > 0:
            gl.vm.transfer(gl.message.sender_address, u256(excess))

        return normalized

    @gl.public.write
    def register_subdomain(self, label: str, parent: str) -> str:
        self._require_owner(parent)
        self._require_active(parent)

        depth = parent.count(".") + 1
        if depth >= MAX_SUBDOMAIN_DEPTH:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} TooDeep")

        normalized = label.lower()

        # Validate label format
        if not VALID_LABEL_RE.match(normalized):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} InvalidLabel")
        if normalized in RESERVED_NAMES:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} ReservedName")

        name = self._full_name(normalized, parent)
        parent_rec = self.records[parent]

        existing = self.records.get(name, None)
        epoch = u64(int(existing.epoch) + 1) if existing is not None else u64(0)

        zero = Address("0x0000000000000000000000000000000000000000")
        self.records[name] = NameRecord(
            label=normalized,
            parent=parent,
            owner=gl.message.sender_address,
            resolved_address=zero,
            expires_at=u64(0),
            epoch=epoch,
            parent_epoch=parent_rec.epoch,
        )
        self._index_add(gl.message.sender_address, name)
        return name

    @gl.public.write.payable
    def renew(self, name: str):
        rec = self.records.get(name, None)
        if rec is None or rec.parent != "":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} TokenDoesNotExist")
        fee = self._get_fee(len(rec.label.encode("utf-8")))
        premium = self._premium(name)
        required = int(fee) + int(premium)
        if int(gl.message.value) < required:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} InsufficientFee")
        rec.expires_at = u64(int(rec.expires_at) + REGISTRATION_PERIOD)
        self.records[name] = rec

        # Refund excess value
        excess = int(gl.message.value) - required
        if excess > 0:
            gl.vm.transfer(gl.message.sender_address, u256(excess))

    @gl.public.write
    def set_addr(self, name: str, addr: str):
        self._require_owner(name)
        self._require_active(name)
        rec = self.records[name]
        rec.resolved_address = Address(addr)
        self.records[name] = rec

    @gl.public.write
    def set_text(self, name: str, key: str, value: str):
        self._require_owner(name)
        self._require_active(name)
        self.text_records[f"{name}{SEP}{key}"] = value

    @gl.public.write
    def set_contenthash(self, name: str, hash_: bytes):
        self._require_owner(name)
        self._require_active(name)
        self.contenthashes[name] = hash_

    @gl.public.write
    def set_addr_for_coin(self, name: str, coin_type: u256, addr: bytes):
        self._require_owner(name)
        self._require_active(name)
        self.coin_addresses[f"{name}{SEP}{int(coin_type)}"] = addr

    @gl.public.write
    def set_primary_name(self, name: str):
        self._require_owner(name)
        self._require_active(name)
        self.primary_name[gl.message.sender_address] = name

    @gl.public.write
    def transfer(self, name: str, to: str):
        self._require_owner(name)
        self._require_active(name)
        rec = self.records[name]
        rec.owner = Address(to)
        self.records[name] = rec
        self._index_remove(gl.message.sender_address, name)
        self._index_add(Address(to), name)
        # Clear stale primary_name for the old owner
        old_primary = self.primary_name.get(gl.message.sender_address, None)
        if old_primary == name:
            del self.primary_name[gl.message.sender_address]
    
    # ---------------------------------------------------------------------------
    # Intelligent extensions
    # ---------------------------------------------------------------------------


    # ---- normalization / confusable judgment via LLM consensus --------
    #
    # GenLayer can have validators independently ask an LLM whether
    # a label is safe to register, and reach consensus on the verdict via
    # the comparative Equivalence Principle. This can evolve without a
    # contract upgrade, because the judgment lives in the prompt/consensus
    # process rather than in frozen bytecode.

    @gl.public.view
    def check_normalization(self, label: str) -> str:
        def judge():
            prompt = (
                "You are checking a proposed blockchain domain label for "
                "Unicode normalization and homoglyph/confusable risk, "
                "equivalent in spirit to ENSIP-15.\n"
                f"Label: {label!r}\n"
                "Respond with exactly one word: SAFE, SUSPICIOUS, or REJECT. "
                "REJECT if it contains invisible characters, mixed scripts "
                "designed to impersonate a well-known ASCII name (e.g. "
                "Cyrillic 'а' instead of Latin 'a'), or characters outside "
                "printable, non-control Unicode. SUSPICIOUS if it is "
                "unusual but not clearly malicious. SAFE otherwise."
            )
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            # Defensive parsing: LLM may return dict or string
            if isinstance(response, dict):
                verdict = str(response.get("verdict", response.get("result", ""))).strip().upper()
            else:
                verdict = str(response).strip().upper()
            # Extract first valid word from potentially verbose output
            for word in verdict.split():
                if word in ("SAFE", "SUSPICIOUS", "REJECT"):
                    return word
            raise gl.vm.UserError(f"{ERROR_LLM} MalformedVerdict: {verdict[:50]}")

        verdict = gl.eq_principle.prompt_comparative(
            judge,
            "Verdicts must match exactly (SAFE, SUSPICIOUS, or REJECT)."
        )
        return verdict

    # ---- dispute resolution (on-chain UDRP) ----------------------------
    #
    # A deterministic contract cannot decide "is this name impersonating a
    # trademark / a known identity in bad faith" — that's a judgment call.
    # GenLayer validators can fetch the evidence URL during a non-det block
    # and have an LLM rule on it; the ruling only takes effect after
    # consensus, and only the deterministic parts (freezing the record)
    # happen outside the non-det block, per the non-determinism rules.

    @gl.public.write
    def file_dispute(self, name: str, reason: str, evidence_url: str) -> u32:
        if self.records.get(name, None) is None:
            raise gl.vm.UserError("TokenDoesNotExist")
        self.disputes.append(Dispute(
            name=name,
            filer=gl.message.sender_address,
            reason=reason,
            evidence_url=evidence_url,
            resolved=False,
            upheld=False,
            ruling="",
        ))
        return u32(len(self.disputes) - 1)

    @gl.public.write
    def resolve_dispute(self, dispute_id: u32):
        dispute = self.disputes[int(dispute_id)]
        if dispute.resolved:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} AlreadyResolved")

        name = dispute.name
        reason = dispute.reason
        evidence_url = dispute.evidence_url

        def adjudicate():
            page = gl.nondet.web.get(evidence_url)
            prompt = (
                "You are adjudicating a domain-name dispute, similar to a "
                "UDRP panel.\n"
                f"Disputed name: {name!r}\n"
                f"Complainant's reason: {reason!r}\n"
                f"Evidence page content:\n{page}\n\n"
                "Rule on whether this name should be frozen for bad-faith "
                "registration / impersonation. Respond as JSON on one line: "
                '{"uphold": true|false, "ruling": "<one sentence reason>"}'
            )
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validate(leaders_res):
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            try:
                my_result = adjudicate()
            except Exception:
                return False  # validator failed - disagree to force rotation
            # Compare the boolean outcome, not the exact prose
            try:
                a = json.loads(leaders_res.calldata) if isinstance(leaders_res.calldata, str) else leaders_res.calldata
                b = json.loads(my_result) if isinstance(my_result, str) else my_result
                return bool(a.get("uphold")) == bool(b.get("uphold"))
            except (json.JSONDecodeError, KeyError, TypeError, AttributeError):
                return False

        raw = gl.vm.run_nondet_unsafe(adjudicate, validate)
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        upheld = bool(parsed.get("uphold", False))
        ruling = str(parsed.get("ruling", ""))

        dispute.resolved = True
        dispute.upheld = upheld
        dispute.ruling = ruling
        self.disputes[int(dispute_id)] = dispute

        if upheld:
            rec = self.records.get(name, None)
            if rec is not None:
                old_owner = rec.owner
                zero = Address("0x0000000000000000000000000000000000000000")
                rec.owner = zero          # freeze: no owner can act on it
                rec.resolved_address = zero
                self.records[name] = rec
                self._index_remove(old_owner, name)

    @gl.public.view
    def get_dispute(self, dispute_id: u32) -> Dispute:
        return self.disputes[int(dispute_id)]

    # ---- admin -----------

    @gl.public.write
    def set_default_fee(self, fee: u256):
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized")
        self.default_fee = fee

    @gl.public.write
    def set_length_fee(self, length: u32, fee: u256):
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized")
        self.length_fees[length] = fee

    @gl.public.write.payable
    def withdraw(self, receiver: str) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unauthorized")
        amount = self.balance
        if amount == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Balance is Zero")
        gl.vm.transfer(Address(receiver), amount)
