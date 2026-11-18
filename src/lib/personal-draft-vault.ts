type Store = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
type Cipher = { iv: string; data: string };
type Envelope = { version: 1; id: string; expiresAt: number; cipher: Cipher };
export type PersonalDraft = {
  id: string;
  payload: Record<string, unknown>;
  savedAt: number;
};
const prefix = "bookforest.personal.v1:",
  encoder = new TextEncoder(),
  day = 86400000;
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b: Uint8Array) => {
  let s = "";
  for (const n of b) s += String.fromCharCode(n);
  return btoa(s);
};
function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => JSON.stringify(k) + ":" + stable(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v) ?? "null";
}
export class PersonalDraftVault {
  private session: {
    owner: string;
    key: CryptoKey;
    epoch: number;
    config: string;
  } | null = null;
  private epoch = 0;
  private expires = 0;
  constructor(
    private store: Store,
    private locks: <T>(name: string, job: () => Promise<T>) => Promise<T>,
    private cryptoApi: Crypto = globalThis.crypto,
    private now = () => Date.now(),
  ) {}
  private owner(owner: string) {
    if (!/^[a-f0-9-]{36}$/i.test(owner)) throw Error("LOCAL_OWNER_INVALID");
    return prefix + owner + ":";
  }
  configured(owner: string) {
    return !!this.store.getItem(this.owner(owner) + "config");
  }
  isUnlocked(owner: string) {
    if (this.session && this.now() > this.expires) {
      this.lock();
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event(personalDraftEvent));
    }
    return this.session?.owner === owner;
  }
  lock() {
    this.epoch++;
    this.session = null;
    this.expires = 0;
  }
  private active(owner: string) {
    if (!this.isUnlocked(owner) || !this.session)
      throw Error("LOCAL_VAULT_LOCKED");
    if (
      this.store.getItem(this.owner(owner) + "config") !== this.session.config
    ) {
      this.lock();
      throw Error("LOCAL_VAULT_LOCKED");
    }
    this.expires = this.now() + 15 * 60000;
    return this.session;
  }
  private async derive(pass: string, salt: Uint8Array) {
    const material = await this.cryptoApi.subtle.importKey(
      "raw",
      encoder.encode(pass),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    return this.cryptoApi.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt as BufferSource,
        iterations: 600000,
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  private async encrypt(
    key: CryptoKey,
    value: unknown,
    aad: string,
  ): Promise<Cipher> {
    const iv = this.cryptoApi.getRandomValues(new Uint8Array(12)),
      raw = encoder.encode(JSON.stringify(value));
    if (raw.length > 131072) throw Error("LOCAL_DRAFT_TOO_LARGE");
    const data = await this.cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
      key,
      raw,
    );
    return { iv: b64(iv), data: b64(new Uint8Array(data)) };
  }
  private async decrypt(key: CryptoKey, value: Cipher, aad: string) {
    if (
      !value ||
      typeof value.iv !== "string" ||
      typeof value.data !== "string" ||
      value.data.length > 180000 ||
      bytes(value.iv).length !== 12
    )
      throw Error("LOCAL_DRAFT_INVALID");
    const raw = await this.cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(value.iv),
        additionalData: encoder.encode(aad),
      },
      key,
      bytes(value.data),
    );
    return JSON.parse(new TextDecoder().decode(raw));
  }
  async configure(owner: string, pass: string, repeat: string) {
    const root = this.owner(owner);
    if (pass.length < 20 || pass.length > 256 || pass !== repeat)
      throw Error("LOCAL_PASSPHRASE_INVALID");
    const epoch = ++this.epoch;
    this.session = null;
    const salt = this.cryptoApi.getRandomValues(new Uint8Array(16)),
      key = await this.derive(pass, salt),
      check = await this.encrypt(
        key,
        { format: "bookforest-personal-vault", owner },
        root + "config",
      );
    await this.locks(root, async () => {
      if (epoch !== this.epoch) throw Error("LOCAL_VAULT_LOCKED");
      if (this.configured(owner)) throw Error("LOCAL_VAULT_EXISTS");
      const config = JSON.stringify({ version: 1, salt: b64(salt), check });
      this.store.setItem(root + "config", config);
      this.session = { owner, key, epoch, config };
      this.expires = this.now() + 15 * 60000;
    });
  }
  async unlock(owner: string, pass: string) {
    const root = this.owner(owner);
    const epoch = ++this.epoch;
    this.session = null;
    try {
      const raw = this.store.getItem(root + "config");
      if (!raw || raw.length > 3000) throw Error();
      const c = JSON.parse(raw);
      if (
        c.version !== 1 ||
        typeof c.salt !== "string" ||
        bytes(c.salt).length !== 16
      )
        throw Error();
      const key = await this.derive(pass, bytes(c.salt)),
        p = await this.decrypt(key, c.check, root + "config");
      if (
        epoch !== this.epoch ||
        this.store.getItem(root + "config") !== raw ||
        p.owner !== owner ||
        p.format !== "bookforest-personal-vault"
      )
        throw Error();
      this.session = { owner, key, epoch, config: raw };
      this.expires = this.now() + 15 * 60000;
    } catch {
      throw Error("LOCAL_UNLOCK_FAILED");
    }
  }
  private async name(owner: string, scope: string, context: unknown) {
    if (!/^[a-z][a-z0-9:-]{0,79}$/.test(scope))
      throw Error("LOCAL_SCOPE_INVALID");
    const hash = await this.cryptoApi.subtle.digest(
      "SHA-256",
      encoder.encode(stable({ scope, context })),
    );
    return (
      this.owner(owner) +
      "draft:" +
      Array.from(new Uint8Array(hash), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("")
    );
  }
  async load(
    owner: string,
    scope: string,
    context: unknown,
  ): Promise<PersonalDraft | null> {
    const s = this.active(owner),
      name = await this.name(owner, scope, context),
      raw = this.store.getItem(name);
    if (!raw) return null;
    try {
      if (raw.length > 182000) throw Error();
      const e: Envelope = JSON.parse(raw);
      if (e.version !== 1 || typeof e.id !== "string") throw Error();
      const p = await this.decrypt(s.key, e.cipher, name);
      if (this.session?.epoch !== s.epoch) throw Error("LOCAL_VAULT_LOCKED");
      if (
        p.owner !== owner ||
        p.scope !== scope ||
        stable(p.context) !== stable(context) ||
        !p.payload ||
        typeof p.payload !== "object" ||
        Array.isArray(p.payload) ||
        !Number.isFinite(p.savedAt) ||
        p.savedAt > this.now() + 60000 ||
        p.expiresAt !== p.savedAt + 7 * day
      )
        throw Error();
      if (p.expiresAt <= this.now()) {
        await this.remove(owner, scope, context, e.id);
        return null;
      }
      return { id: e.id, payload: p.payload, savedAt: p.savedAt };
    } catch (e) {
      if (e instanceof Error && e.message === "LOCAL_VAULT_LOCKED") throw e;
      throw Error("LOCAL_DRAFT_INVALID");
    }
  }
  async save(
    owner: string,
    scope: string,
    context: unknown,
    payload: Record<string, unknown>,
    expected: string | null,
  ) {
    const s = this.active(owner),
      name = await this.name(owner, scope, context),
      savedAt = this.now(),
      id = this.cryptoApi.randomUUID();
    const cipher = await this.encrypt(
      s.key,
      { owner, scope, context, payload, savedAt, expiresAt: savedAt + 7 * day },
      name,
    );
    await this.locks(this.owner(owner), async () => {
      if (
        this.session?.epoch !== s.epoch ||
        this.store.getItem(this.owner(owner) + "config") !== s.config
      )
        throw Error("LOCAL_VAULT_LOCKED");
      const raw = this.store.getItem(name),
        current = raw ? JSON.parse(raw) : null;
      if ((current?.id ?? null) !== expected)
        throw Error("LOCAL_DRAFT_CONFLICT");
      let size = 0,
        count = 0;
      const stale: string[] = [];
      for (let i = 0; i < this.store.length; i++) {
        const k = this.store.key(i);
        if (!k?.startsWith(this.owner(owner) + "draft:") || k === name)
          continue;
        const r = this.store.getItem(k);
        if (!r) continue;
        let e;
        try {
          e = JSON.parse(r);
        } catch {}
        if (e?.expiresAt <= this.now()) {
          stale.push(k);
          continue;
        }
        size += r.length;
        count++;
      }
      const value = JSON.stringify({
        version: 1,
        id,
        expiresAt: savedAt + 7 * day,
        cipher,
      });
      if (count >= 10 || size + value.length > 2 * 1024 * 1024)
        throw Error("LOCAL_STORAGE_FULL");
      for (const k of stale) this.store.removeItem(k);
      this.store.setItem(name, value);
    });
    return { id, payload, savedAt };
  }
  async remove(
    owner: string,
    scope: string,
    context: unknown,
    expected: string | null,
  ) {
    const s = this.active(owner),
      name = await this.name(owner, scope, context);
    await this.locks(this.owner(owner), async () => {
      if (this.session?.epoch !== s.epoch) throw Error("LOCAL_VAULT_LOCKED");
      const raw = this.store.getItem(name);
      if ((raw ? JSON.parse(raw).id : null) !== expected)
        throw Error("LOCAL_DRAFT_CONFLICT");
      this.store.removeItem(name);
    });
  }
  async forget(owner: string) {
    await this.locks(this.owner(owner), async () => {
      this.lock();
      const root = this.owner(owner);
      for (let i = this.store.length - 1; i >= 0; i--) {
        const key = this.store.key(i);
        if (key?.startsWith(root)) this.store.removeItem(key);
      }
    });
  }
}
let browserVault: PersonalDraftVault | null = null;
export const personalDraftEvent = "bookforest:personal-draft";
export function getPersonalDraftVault() {
  if (
    typeof window === "undefined" ||
    !window.crypto?.subtle ||
    !navigator.locks
  )
    throw Error("LOCAL_VAULT_UNAVAILABLE");
  return (browserVault ??= new PersonalDraftVault(
    window.localStorage,
    (name, job) => navigator.locks.request(name, job),
  ));
}
export function lockPersonalDrafts() {
  browserVault?.lock();
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(personalDraftEvent));
}
