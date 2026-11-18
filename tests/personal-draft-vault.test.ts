import { it, expect } from "vitest";
import { PersonalDraftVault } from "../src/lib/personal-draft-vault";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  pass = "isolated-bookforest-passphrase-2026";
class MemoryStore {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(n: number) {
    return [...this.values.keys()][n] ?? null;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
}
const locks = async <T>(_name: string, fn: () => Promise<T>) => fn();
it("persists ciphertext without passphrases or writing, and requires unlocking after reopening", async () => {
  const store = new MemoryStore(),
    v = new PersonalDraftVault(store, locks);
  await v.configure(owner, pass, pass);
  const p = await v.save(
    owner,
    "writing",
    { assignment: "one" },
    { title: "격리 제목", body: "저장된 암호문 안의 개인 시험 글" },
    null,
  );
  const raw = [...store.values.values()].join("");
  expect(raw).not.toContain(pass);
  expect(raw).not.toContain("개인 시험 글");
  expect(raw).not.toContain("격리 제목");
  const reopened = new PersonalDraftVault(store, locks);
  await expect(
    reopened.load(owner, "writing", { assignment: "one" }),
  ).rejects.toThrow("LOCAL_VAULT_LOCKED");
  await reopened.unlock(owner, pass);
  expect(
    await reopened.load(owner, "writing", { assignment: "one" }),
  ).toMatchObject({ id: p.id, payload: { title: "격리 제목" } });
  await expect(
    reopened.load(other, "writing", { assignment: "one" }),
  ).rejects.toThrow("LOCAL_VAULT_LOCKED");
});
it("rejects wrong passphrases and authenticated ciphertext copied into another context", async () => {
  const store = new MemoryStore(),
    v = new PersonalDraftVault(store, locks);
  await v.configure(owner, pass, pass);
  await v.save(
    owner,
    "writing",
    { assignment: "one" },
    { body: "개인 글" },
    null,
  );
  await v.save(
    owner,
    "writing",
    { assignment: "two" },
    { body: "다른 글" },
    null,
  );
  const keys = [...store.values.keys()].filter((x) => x.includes(":draft:"));
  store.setItem(keys[1], store.getItem(keys[0])!);
  await expect(v.load(owner, "writing", { assignment: "two" })).rejects.toThrow(
    "LOCAL_DRAFT_INVALID",
  );
  v.lock();
  await expect(v.unlock(owner, pass + "bad")).rejects.toThrow(
    "LOCAL_UNLOCK_FAILED",
  );
});
it("does not overwrite another tab and invalidates an old key when the owner forgets storage", async () => {
  const store = new MemoryStore(),
    a = new PersonalDraftVault(store, locks),
    b = new PersonalDraftVault(store, locks);
  await a.configure(owner, pass, pass);
  await b.unlock(owner, pass);
  const result = await Promise.allSettled([
    a.save(owner, "writing", {}, { body: "탭 A" }, null),
    b.save(owner, "writing", {}, { body: "탭 B" }, null),
  ]);
  expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((x) => x.status === "rejected")).toHaveLength(1);
  await b.forget(owner);
  await expect(
    a.save(owner, "writing", {}, { body: "뒤늦은 저장" }, null),
  ).rejects.toThrow("LOCAL_VAULT_LOCKED");
  expect(store.length).toBe(0);
});
it("expires records and blocks in-flight writes after locking", async () => {
  let now = Date.now();
  const store = new MemoryStore(),
    v = new PersonalDraftVault(store, locks, crypto, () => now);
  await v.configure(owner, pass, pass);
  await v.save(owner, "writing", {}, { body: "만료할 글" }, null);
  now += 8 * 86400000;
  await v.unlock(owner, pass);
  expect(await v.load(owner, "writing", {})).toBeNull();
  const pending = v.save(
    owner,
    "writing",
    {},
    { body: "로그아웃 뒤 저장 금지" },
    null,
  );
  v.lock();
  await expect(pending).rejects.toThrow("LOCAL_VAULT_LOCKED");
  expect(
    [...store.values.keys()].filter((k) => k.includes(":draft:")),
  ).toHaveLength(0);
});
