import assert from "node:assert/strict";
import test from "node:test";

import {
  getSupportDraftStorageKeys,
  getSupportDraftStorageKey,
  loadSupportDraft,
  normalizeSupportDraft,
  clearSupportDraft,
  saveSupportDraft,
  validateSupportDraft,
} from "./support.ts";

test("черновик поддержки нормализует поля и сохраняет допустимую категорию", () => {
  assert.deepEqual(normalizeSupportDraft({
    category: "steam",
    orderId: " order-1 ",
    subject: "  Не приходит предложение обмена  ",
    message: "  Проверил Trade URL, но предложение пока не появилось.  ",
    updatedAt: "2026-07-16T08:00:00.000Z",
  }), {
    category: "steam",
    orderId: "order-1",
    subject: "Не приходит предложение обмена",
    message: "Проверил Trade URL, но предложение пока не появилось.",
    updatedAt: "2026-07-16T08:00:00.000Z",
  });
});

test("draft reads never delete aliases and atomic save/clear preserve a newer linked-tab draft", async () => {
  const accountKeys = ["email:linked@example.com", "steam:7656119982144821"];
  const older = { category: "steam", orderId: "", subject: "Older draft", message: "Older draft message with enough details.", updatedAt: "2026-07-16T08:00:00.000Z" } as const;
  const newer = { ...older, subject: "Newer draft", message: "Newer draft message with enough details.", updatedAt: "2026-07-17T08:00:00.000Z" } as const;
  const values = new Map(accountKeys.map((key, index) => [getSupportDraftStorageKey(key), JSON.stringify(index ? newer : older)]));
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  assert.deepEqual(loadSupportDraft(storage, accountKeys), newer);
  assert.equal(values.size, 2);
  const locks = { request: async <T>(_name: string, callback: () => Promise<T> | T) => callback() };
  assert.equal((await saveSupportDraft({ locks, storage, accountKeys, draft: older })).status, "newer-exists");
  assert.equal((await clearSupportDraft({ locks, storage, accountKeys, expectedDraft: older })).status, "newer-exists");
  assert.deepEqual(loadSupportDraft(storage, accountKeys), newer);
});

test("same-millisecond saves and clears are serialized without losing the later draft", async () => {
  let chain = Promise.resolve();
  const locks = { request<T>(_name: string, callback: () => Promise<T> | T) { const result = chain.then(callback); chain = result.then(() => undefined, () => undefined); return result; } };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const accountKeys = ["email:atomic@example.com"];
  const first = { category: "payment", orderId: "", subject: "First draft", message: "First draft has enough details to be valid.", updatedAt: "2026-07-17T08:00:00.000Z" } as const;
  const second = { ...first, subject: "Second draft", message: "Second draft has newer details and must survive." } as const;
  const firstResult = await saveSupportDraft({ locks, storage, accountKeys, draft: first });
  assert.equal(firstResult.status, "saved");
  const clearPromise = clearSupportDraft({ locks, storage, accountKeys, expectedDraft: firstResult.draft });
  const savePromise = saveSupportDraft({ locks, storage, accountKeys, draft: second });
  await clearPromise;
  const secondResult = await savePromise;
  assert.equal(secondResult.status, "saved");
  assert.equal(loadSupportDraft(storage, accountKeys)?.subject, "Second draft");
  assert.notEqual(secondResult.draft.updatedAt, firstResult.draft.updatedAt);
});

test("draft mutations fail closed when Web Locks are unavailable", async () => {
  const storage = { getItem: () => null, setItem() { throw new Error("must not write"); }, removeItem() { throw new Error("must not remove"); } };
  const draft = { category: "payment", orderId: "", subject: "Valid draft", message: "Valid draft message with enough details.", updatedAt: "2026-07-17T08:00:00.000Z" } as const;
  await assert.rejects(saveSupportDraft({ storage, accountKeys: ["email:a@example.com"], draft }), /lock/i);
  await assert.rejects(clearSupportDraft({ storage, accountKeys: ["email:a@example.com"], expectedDraft: draft }), /lock/i);
});

test("повреждённый локальный черновик поддержки отклоняется", () => {
  assert.equal(normalizeSupportDraft({ category: "telegram", message: 42 }), null);
  assert.equal(normalizeSupportDraft("broken"), null);
  assert.equal(normalizeSupportDraft({
    category: "payment",
    orderId: "",
    subject: "",
    message: "",
    updatedAt: "2026-07-16T08:00:00.000Z",
  }), null);
});

test("форма требует тему и содержательное описание", () => {
  assert.deepEqual(validateSupportDraft({
    category: "payment",
    orderId: "",
    subject: "Сбой",
    message: "Коротко",
  }), {
    subject: "Опишите тему минимум в 5 символах.",
    message: "Добавьте детали обращения — минимум 20 символов.",
  });
});

test("корректное обращение не содержит ошибок", () => {
  assert.deepEqual(validateSupportDraft({
    category: "refund",
    orderId: "order-1",
    subject: "Вопрос по возврату",
    message: "Укажите, пожалуйста, какие данные нужны для проверки заказа.",
  }), {});
});

test("черновики поддержки изолированы по аккаунтам", () => {
  assert.equal(getSupportDraftStorageKey("email:first@example.com"), "vault-support-draft-v2:email%3Afirst%40example.com");
  assert.notEqual(getSupportDraftStorageKey("email:first@example.com"), getSupportDraftStorageKey("email:second@example.com"));
});

test("черновик поддержки доступен по каждому связанному алиасу", () => {
  assert.deepEqual(getSupportDraftStorageKeys([
    "email:linked@example.com",
    "steam:7656119982144821",
    "email:linked@example.com",
  ]), [
    "vault-support-draft-v2:email%3Alinked%40example.com",
    "vault-support-draft-v2:steam%3A7656119982144821",
  ]);
});

test("загрузка черновика читает Steam-алиас без мутации хранилища", () => {
  const draft = {
    category: "steam",
    orderId: "order-1",
    subject: "Проверка предложения Steam",
    message: "Нужно проверить сохранённые параметры локального заказа Steam.",
    updatedAt: "2026-07-17T08:00:00.000Z",
  } as const;
  const values = new Map<string, string>([[
    getSupportDraftStorageKey("steam:7656119982144821"),
    JSON.stringify(draft),
  ]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };

  assert.deepEqual(loadSupportDraft(storage, ["email:linked@example.com", "steam:7656119982144821"]), draft);
  assert.equal(values.has(getSupportDraftStorageKey("email:linked@example.com")), false);
  assert.equal(values.get(getSupportDraftStorageKey("steam:7656119982144821")), JSON.stringify(draft));
});

test("загружает новейший валидный черновик связанного аккаунта независимо от порядка алиасов", () => {
  const accountKeys = ["email:linked@example.com", "steam:7656119982144821"];
  const older = { category: "steam", orderId: "", subject: "Older draft", message: "Older draft message with enough details.", updatedAt: "2026-07-16T08:00:00.000Z" } as const;
  const newer = { category: "payment", orderId: "VLT-NEW", subject: "Newest draft", message: "Newest draft message with enough details.", updatedAt: "2026-07-17T08:00:00.000Z" } as const;
  const values = new Map([
    [getSupportDraftStorageKey(accountKeys[0]), JSON.stringify(older)],
    [getSupportDraftStorageKey(accountKeys[1]), JSON.stringify(newer)],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };

  assert.deepEqual(loadSupportDraft(storage, accountKeys), newer);
  assert.equal(values.get(getSupportDraftStorageKey(accountKeys[0])), JSON.stringify(older));
  assert.equal(values.get(getSupportDraftStorageKey(accountKeys[1])), JSON.stringify(newer));
});

test("linked support draft commits through one atomic aggregate write", async () => {
  const values = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes += 1; if (writes > 1) throw new Error("partial failure"); values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const locks = { request: async <T>(_name: string, callback: () => Promise<T> | T) => callback() };
  const accountKeys = ["email:atomic-linked@example.com", "steam:76561190000000001"];
  const draft = { category: "steam", orderId: "", subject: "Atomic linked draft", message: "This linked draft must commit with one storage write.", updatedAt: "2026-07-17T08:00:00.000Z" } as const;
  const result = await saveSupportDraft({ locks, storage, accountKeys, draft });
  assert.equal(result.status, "saved");
  assert.equal(writes, 1);
  assert.deepEqual(loadSupportDraft(storage, [accountKeys[1]]), draft);
  assert.deepEqual(loadSupportDraft(storage, [accountKeys[0]]), draft);
});

test("logical draft revisions make a save after clear win despite a future wall clock", async () => {
  const accountKeys = ["email:clock@example.com"];
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const locks = { request: async <T>(_name: string, callback: () => Promise<T> | T) => callback() };
  const future = { category: "payment", orderId: "", subject: "Future clock draft", message: "This draft has a deliberately future wall clock.", updatedAt: "2099-01-01T00:00:00.000Z" } as const;
  const saved = await saveSupportDraft({ locks, storage, accountKeys, draft: future });
  assert.equal(saved.status, "saved");
  await clearSupportDraft({ locks, storage, accountKeys, expectedDraft: saved.draft });
  assert.equal(loadSupportDraft(storage, accountKeys), null);
  const later = { ...future, subject: "Saved after clear", message: "This later logical mutation must remain visible.", updatedAt: "2026-07-17T00:00:00.000Z" };
  const result = await saveSupportDraft({ locks, storage, accountKeys, draft: later });
  assert.equal(result.status, "saved");
  assert.equal(loadSupportDraft(storage, accountKeys)?.subject, "Saved after clear");
});
