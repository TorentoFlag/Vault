import type {
  SupportCategory,
  SupportDraft,
  SupportDraftErrors,
  SupportDraftInput,
} from "@/types/support";

export const supportCategories: ReadonlyArray<{ value: SupportCategory; label: string }> = [
  { value: "payment", label: "Оплата" },
  { value: "steam", label: "Steam" },
  { value: "skins", label: "Игровые предметы" },
  { value: "refund", label: "Возврат" },
  { value: "other", label: "Другая проблема" },
];

const supportCategoryValues = new Set<SupportCategory>(supportCategories.map((category) => category.value));

export function getSupportDraftStorageKey(accountKey: string) {
  return `vault-support-draft-v2:${encodeURIComponent(accountKey)}`;
}

export function getSupportDraftStorageKeys(accountKeys: string[]) {
  return [...new Set(accountKeys.filter(Boolean))].map(getSupportDraftStorageKey);
}

export const SUPPORT_DRAFTS_STORAGE_KEY = "vault-support-drafts-v3";

type SupportDraftAggregate = {
  version: 3;
  revision: number;
  drafts: Record<string, SupportDraft>;
  tombstones: Record<string, SupportDraft>;
  draftVersions: Record<string, number>;
  tombstoneVersions: Record<string, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function validateSupportDraft(input: SupportDraftInput): SupportDraftErrors {
  const errors: SupportDraftErrors = {};
  if (input.subject.trim().length < 5) errors.subject = "Опишите тему минимум в 5 символах.";
  if (input.message.trim().length < 20) errors.message = "Добавьте детали обращения — минимум 20 символов.";
  return errors;
}

export function normalizeSupportDraft(value: unknown): SupportDraft | null {
  if (!isRecord(value)) return null;
  if (typeof value.category !== "string" || !supportCategoryValues.has(value.category as SupportCategory)) return null;
  if (typeof value.orderId !== "string" || typeof value.subject !== "string" || typeof value.message !== "string") return null;
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;

  const draft: SupportDraft = {
    category: value.category as SupportCategory,
    orderId: value.orderId.trim(),
    subject: value.subject.trim(),
    message: value.message.trim(),
    updatedAt: value.updatedAt,
  };
  return Object.keys(validateSupportDraft(draft)).length ? null : draft;
}

function loadAggregate(storage: Pick<Storage, "getItem">): SupportDraftAggregate {
  const empty: SupportDraftAggregate = { version: 3, revision: 0, drafts: {}, tombstones: {}, draftVersions: {}, tombstoneVersions: {} };
  try {
    const raw = storage.getItem(SUPPORT_DRAFTS_STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 3 || !isRecord(parsed.drafts) || !isRecord(parsed.tombstones)) return empty;
    const drafts: Record<string, SupportDraft> = {};
    const tombstones: Record<string, SupportDraft> = {};
    Object.entries(parsed.drafts).forEach(([key, value]) => { const draft = normalizeSupportDraft(value); if (draft) drafts[key] = draft; });
    Object.entries(parsed.tombstones).forEach(([key, value]) => { const draft = normalizeSupportDraft(value); if (draft) tombstones[key] = draft; });
    const revision = typeof parsed.revision === "number" && Number.isSafeInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0;
    const readVersions = (candidate: unknown) => isRecord(candidate) ? Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) as Record<string, number> : {};
    return { version: 3, revision, drafts, tombstones, draftVersions: readVersions(parsed.draftVersions), tombstoneVersions: readVersions(parsed.tombstoneVersions) };
  } catch {
    return empty;
  }
}

export function loadSupportDraft(
  storage: Pick<Storage, "getItem">,
  accountKeys: string[],
) {
  const keys = getSupportDraftStorageKeys(accountKeys);
  if (!keys.length) return null;

  const aggregate = loadAggregate(storage);
  const aggregateCandidates = accountKeys.flatMap((accountKey) => aggregate.drafts[accountKey] ? [{ key: accountKey, draft: aggregate.drafts[accountKey], logicalVersion: aggregate.draftVersions[accountKey] ?? 0 }] : []);

  const candidates = [...aggregateCandidates, ...keys.flatMap((key) => {
    const raw = storage.getItem(key);
    if (!raw) return [];
    let draft: SupportDraft | null = null;
    try { draft = normalizeSupportDraft(JSON.parse(raw)); } catch { /* Invalid records are ignored without mutating during reads. */ }
    if (!draft) return [];
    return [{ key, draft, logicalVersion: 0 }];
  })];
  const tombstone = loadSupportDraftTombstone(storage, accountKeys);
  const visibleCandidates = tombstone
    ? candidates.filter(({ logicalVersion }) => logicalVersion > tombstone.logicalVersion)
    : candidates;
  const newest = visibleCandidates.sort((left, right) => (
    right.logicalVersion - left.logicalVersion
    || Date.parse(right.draft.updatedAt) - Date.parse(left.draft.updatedAt)
    || JSON.stringify(right.draft).localeCompare(JSON.stringify(left.draft))
    || left.key.localeCompare(right.key)
  ))[0];
  return newest?.draft ?? null;
}

type SupportDraftLockManager = { request<T>(name: string, callback: () => Promise<T> | T): Promise<T> };
type SupportDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSupportDraftTombstoneKey(accountKey: string) {
  return `vault-support-draft-v2:tombstone:${encodeURIComponent(accountKey)}`;
}

function loadSupportDraftTombstone(storage: Pick<Storage, "getItem">, accountKeys: string[]) {
  const aggregate = loadAggregate(storage);
  return [...accountKeys.flatMap((accountKey) => aggregate.tombstones[accountKey] ? [{ draft: aggregate.tombstones[accountKey], logicalVersion: aggregate.tombstoneVersions[accountKey] ?? 0 }] : []), ...accountKeys.flatMap((accountKey) => {
    try {
      const raw = storage.getItem(getSupportDraftTombstoneKey(accountKey));
      const draft = raw ? normalizeSupportDraft(JSON.parse(raw)) : null;
      return draft ? [{ draft, logicalVersion: 0 }] : [];
    } catch { return []; }
  })].sort((left, right) => right.logicalVersion - left.logicalVersion || Date.parse(right.draft.updatedAt) - Date.parse(left.draft.updatedAt))[0] ?? null;
}

function requireSupportDraftLock(locks?: SupportDraftLockManager) {
  if (!locks) throw new Error("support-draft-lock-unavailable");
  return locks;
}

export async function saveSupportDraft({ locks, storage, accountKeys, draft }: {
  locks?: SupportDraftLockManager;
  storage: SupportDraftStorage;
  accountKeys: string[];
  draft: SupportDraft;
}): Promise<{ status: "saved"; draft: SupportDraft } | { status: "newer-exists"; draft: SupportDraft }> {
  const normalized = normalizeSupportDraft(draft);
  if (!normalized) throw new Error("Invalid support draft");
  return requireSupportDraftLock(locks).request("vault-support-draft-v2", () => {
    const existing = loadSupportDraft(storage, accountKeys);
    const tombstone = loadSupportDraftTombstone(storage, accountKeys);
    if (existing && Date.parse(existing.updatedAt) > Date.parse(normalized.updatedAt)) return { status: "newer-exists" as const, draft: existing };
    if (existing && JSON.stringify(existing) === JSON.stringify(normalized)) return { status: "saved" as const, draft: existing };
    const aggregate = loadAggregate(storage);
    const nextRevision = aggregate.revision + 1;
    if (!Number.isSafeInteger(nextRevision)) throw new Error("support-draft-revision-overflow");
    const predecessorTime = Math.max(
      existing ? Date.parse(existing.updatedAt) : 0,
      tombstone ? Date.parse(tombstone.draft.updatedAt) : 0,
    );
    const committedDraft = predecessorTime >= Date.parse(normalized.updatedAt)
      ? { ...normalized, updatedAt: new Date(predecessorTime + 1).toISOString() }
      : normalized;
    aggregate.revision = nextRevision;
    accountKeys.forEach((accountKey) => {
      aggregate.drafts[accountKey] = committedDraft;
      aggregate.draftVersions[accountKey] = nextRevision;
      delete aggregate.tombstones[accountKey];
      delete aggregate.tombstoneVersions[accountKey];
    });
    storage.setItem(SUPPORT_DRAFTS_STORAGE_KEY, JSON.stringify(aggregate));
    const serialized = JSON.stringify(committedDraft);
    const committed = loadSupportDraft(storage, accountKeys);
    if (!committed || JSON.stringify(committed) !== serialized) throw new Error("support-draft-write-failed");
    return { status: "saved" as const, draft: committedDraft };
  });
}

export async function clearSupportDraft({ locks, storage, accountKeys, expectedDraft }: {
  locks?: SupportDraftLockManager;
  storage: SupportDraftStorage;
  accountKeys: string[];
  expectedDraft: SupportDraft;
}): Promise<{ status: "cleared" } | { status: "newer-exists"; draft: SupportDraft }> {
  const expected = normalizeSupportDraft(expectedDraft);
  if (!expected) throw new Error("Invalid support draft");
  return requireSupportDraftLock(locks).request("vault-support-draft-v2", () => {
    const existing = loadSupportDraft(storage, accountKeys);
    if (!existing) return { status: "cleared" as const };
    if (JSON.stringify(existing) !== JSON.stringify(expected)) return { status: "newer-exists" as const, draft: existing };
    const aggregate = loadAggregate(storage);
    const nextRevision = aggregate.revision + 1;
    if (!Number.isSafeInteger(nextRevision)) throw new Error("support-draft-revision-overflow");
    aggregate.revision = nextRevision;
    accountKeys.forEach((accountKey) => {
      delete aggregate.drafts[accountKey];
      delete aggregate.draftVersions[accountKey];
      aggregate.tombstones[accountKey] = existing;
      aggregate.tombstoneVersions[accountKey] = nextRevision;
    });
    storage.setItem(SUPPORT_DRAFTS_STORAGE_KEY, JSON.stringify(aggregate));
    const remaining = loadSupportDraft(storage, accountKeys);
    return remaining ? { status: "newer-exists" as const, draft: remaining } : { status: "cleared" as const };
  });
}
