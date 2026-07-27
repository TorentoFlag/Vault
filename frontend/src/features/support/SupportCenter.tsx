"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useMarketplace } from "@/components/marketplace/MarketplaceProvider";
import { Button, StatusBadge } from "@/components/ui/UI";
import { siteConfig } from "@/config/site";
import { faqItems } from "@/data/home";
import { sortOrdersNewestFirst } from "@/lib/account";
import {
  clearSupportDraft,
  getSupportDraftStorageKeys,
  loadSupportDraft,
  saveSupportDraft,
  SUPPORT_DRAFTS_STORAGE_KEY,
  supportCategories,
  validateSupportDraft,
} from "@/lib/support";
import { getSessionAccountKeys } from "@/lib/marketplace-state";
import type { FAQ } from "@/types/commerce";
import type {
  SupportCategory,
  SupportDraft,
  SupportDraftErrors,
  SupportDraftInput,
} from "@/types/support";

import styles from "./support.module.css";

const emptyForm: SupportDraftInput = {
  category: "payment",
  orderId: "",
  subject: "",
  message: "",
};

const faqGroupByCategory: Record<SupportCategory, FAQ["group"] | null> = {
  payment: "Безопасность",
  steam: "Steam",
  skins: "Steam",
  refund: "Возвраты",
  other: null,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatSavedTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function SupportCenter() {
  const { orders, session, accountKey, notify } = useMarketplace();
  const [form, setForm] = useState<SupportDraftInput>(emptyForm);
  const [errors, setErrors] = useState<SupportDraftErrors>({});
  const [savedDraft, setSavedDraft] = useState<SupportDraft | null>(null);
  const [storageError, setStorageError] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const savedDraftRef = useRef<SupportDraft | null>(null);
  const accountKeys = useMemo(() => getSessionAccountKeys(session), [session]);
  const accountSignature = useMemo(() => [...accountKeys].sort().join("|"), [accountKeys]);
  const storageKeys = useMemo(() => getSupportDraftStorageKeys(accountKeys), [accountKeys]);
  const storageKey = accountKey ? storageKeys[0] ?? null : null;
  const sortedOrders = useMemo(() => sortOrdersNewestFirst(orders), [orders]);
  const mutationOriginRef = useRef({ accountSignature, generation: 0 });
  const activeFaq = useMemo(() => {
    const group = faqGroupByCategory[form.category];
    return (group ? faqItems.filter((item) => item.group === group) : faqItems).slice(0, 4);
  }, [form.category]);

  useEffect(() => {
    mutationOriginRef.current = { accountSignature, generation: mutationOriginRef.current.generation + 1 };
  }, [accountSignature]);

  useEffect(() => {
    let storedDraft: SupportDraft | null = null;
    let nextStorageError = "";
    try {
      storedDraft = storageKey ? loadSupportDraft(window.localStorage, accountKeys) : null;
    } catch {
      nextStorageError = "Локальное сохранение недоступно. Скопируйте текст обращения и отправьте его на почту поддержки.";
    }

    const hydrationTask = window.setTimeout(() => {
      setForm(storedDraft ? {
        category: storedDraft.category,
        orderId: storedDraft.orderId,
        subject: storedDraft.subject,
        message: storedDraft.message,
      } : emptyForm);
      setSavedDraft(storedDraft);
      savedDraftRef.current = storedDraft;
      setErrors({});
      setStorageError(nextStorageError);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, [accountKeys, storageKey]);

  useEffect(() => {
    if (!storageKeys.length) return;
    const relevantKeys = new Set([...storageKeys, SUPPORT_DRAFTS_STORAGE_KEY]);
    function synchronizeDraft(event: StorageEvent) {
      if (!event.key || !relevantKeys.has(event.key)) return;
      try {
        const newest = loadSupportDraft(window.localStorage, accountKeys);
        const current = savedDraftRef.current;
        if (newest && (!current || Date.parse(newest.updatedAt) >= Date.parse(current.updatedAt))) {
          savedDraftRef.current = newest;
          setSavedDraft(newest);
          setForm({ category: newest.category, orderId: newest.orderId, subject: newest.subject, message: newest.message });
          setStorageError("");
        } else if (!newest && current) {
          savedDraftRef.current = null;
          setSavedDraft(null);
          setForm(emptyForm);
        }
      } catch {
        setStorageError("Не удалось синхронизировать черновик между вкладками.");
      }
    }
    window.addEventListener("storage", synchronizeDraft);
    return () => window.removeEventListener("storage", synchronizeDraft);
  }, [accountKeys, storageKeys]);

  function updateField<Key extends keyof SupportDraftInput>(key: Key, value: SupportDraftInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "subject" || key === "message") setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSupportDraft(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      window.requestAnimationFrame(() => (nextErrors.subject ? subjectRef.current : messageRef.current)?.focus());
      return;
    }

    const draft: SupportDraft = {
      category: form.category,
      orderId: form.orderId.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (!storageKey) return;
    const origin = mutationOriginRef.current;
    try {
      const result = await saveSupportDraft({ locks: navigator.locks, storage: window.localStorage, accountKeys, draft });
      if (mutationOriginRef.current !== origin) return;
      if (result.status === "newer-exists") {
        savedDraftRef.current = result.draft;
        setSavedDraft(result.draft);
        setForm({ category: result.draft.category, orderId: result.draft.orderId, subject: result.draft.subject, message: result.draft.message });
        notify("В другой вкладке сохранён более новый черновик.");
        return;
      }
      if (result.status === "saved") {
        setStorageError("");
        setForm({ category: result.draft.category, orderId: result.draft.orderId, subject: result.draft.subject, message: result.draft.message });
        setSavedDraft(result.draft);
        savedDraftRef.current = result.draft;
        notify("Черновик обращения сохранён.");
        return;
      }
    } catch {
      if (mutationOriginRef.current !== origin) return;
      setStorageError("Не удалось сохранить черновик в этом браузере. Скопируйте текст и отправьте его на почту поддержки.");
      notify("Не удалось сохранить черновик в этом браузере.");
      return;
    }
  }

  async function clearDraft() {
    const origin = mutationOriginRef.current;
    if (storageKeys.length && savedDraft) {
      try {
        const result = await clearSupportDraft({ locks: navigator.locks, storage: window.localStorage, accountKeys, expectedDraft: savedDraft });
        if (mutationOriginRef.current !== origin) return;
        if (result.status === "newer-exists") {
          savedDraftRef.current = result.draft;
          setSavedDraft(result.draft);
          setForm({ category: result.draft.category, orderId: result.draft.orderId, subject: result.draft.subject, message: result.draft.message });
          notify("Новый черновик из другой вкладки сохранён.");
          return;
        }
      } catch {
        if (mutationOriginRef.current !== origin) return;
        setStorageError("Не удалось очистить черновик в этом браузере. Текст оставлен в форме — проверьте доступ к локальному хранилищу.");
        notify("Не удалось очистить черновик. Данные сохранены в форме.");
        return;
      }
    }
    if (mutationOriginRef.current !== origin) return;
    setForm(emptyForm);
    setSavedDraft(null);
    savedDraftRef.current = null;
    setErrors({});
    setStorageError("");
    notify("Форма обращения очищена.");
  }

  return (
    <div className={styles.stack}>
      <section className={styles.lead}>
        <div>
          <span>Центр помощи</span>
          <h2>Связаться с поддержкой</h2>
          <p>Сохраните детали обращения в черновике или напишите в поддержку по электронной почте.</p>
        </div>
        <div className={styles.channelState}>
          <span>Канал поддержки</span>
          <StatusBadge>Email</StatusBadge>
          <small><a href={`mailto:${siteConfig.support.email}`}>{siteConfig.support.email}</a></small>
        </div>
      </section>

      <div className={styles.supportLayout}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span>Новое обращение</span><h2>Расскажите, что случилось</h2><p>Обязательные поля отмечены звёздочкой.</p></div>
            {savedDraft ? <StatusBadge>Черновик сохранён</StatusBadge> : null}
          </div>

          <form className={styles.form} noValidate onSubmit={saveDraft}>
            {storageError ? <p className={styles.storageAlert} role="alert">{storageError}</p> : null}
            <fieldset className={styles.categoryFieldset}>
              <legend>Категория *</legend>
              <div className={styles.categoryGrid}>
                {supportCategories.map((category) => (
                  <button key={category.value} type="button" aria-pressed={form.category === category.value} onClick={() => updateField("category", category.value)}>
                    <span aria-hidden="true">{category.value === "payment" ? "₽" : category.value === "steam" ? "ST" : category.value === "skins" ? "AK" : category.value === "refund" ? "↩" : "?"}</span>
                    {category.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.field}>
              <label htmlFor="support-order">Заказ</label>
              <select id="support-order" value={form.orderId} onChange={(event) => updateField("orderId", event.target.value)}>
                <option value="">Без привязки к заказу</option>
                {sortedOrders.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.items[0].title} · {formatDate(order.createdAt)}</option>)}
              </select>
              <p>Выберите заказ, если вопрос связан с оплатой, предметом или возвратом.</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="support-subject">Тема *</label>
              <input ref={subjectRef} id="support-subject" value={form.subject} maxLength={90} aria-invalid={!!errors.subject} aria-describedby={errors.subject ? "support-subject-error" : undefined} placeholder="Например: не приходит предложение обмена" onChange={(event) => updateField("subject", event.target.value)} />
              <div className={styles.fieldMeta}><span>{errors.subject ? <span id="support-subject-error" className={styles.error} role="alert">{errors.subject}</span> : "Коротко опишите проблему."}</span><small>{form.subject.length}/90</small></div>
            </div>

            <div className={styles.field}>
              <label htmlFor="support-message">Описание *</label>
              <textarea ref={messageRef} id="support-message" value={form.message} maxLength={1500} rows={7} aria-invalid={!!errors.message} aria-describedby={errors.message ? "support-message-error" : undefined} placeholder="Что произошло, когда и какой результат вы ожидали?" onChange={(event) => updateField("message", event.target.value)} />
              <div className={styles.fieldMeta}><span>{errors.message ? <span id="support-message-error" className={styles.error} role="alert">{errors.message}</span> : "Не добавляйте пароли, платёжные реквизиты и коды Steam Guard."}</span><small>{form.message.length}/1500</small></div>
            </div>

            <div className={styles.formFooter}>
              <div>
                <Button type="submit">Сохранить черновик</Button>
                {savedDraft ? <Button type="button" tone="quiet" onClick={clearDraft}>Очистить черновик</Button> : null}
              </div>
              <p>{savedDraft ? `Черновик сохранён ${formatSavedTime(savedDraft.updatedAt)}.` : <>Для отправки используйте <a href={`mailto:${siteConfig.support.email}`}>{siteConfig.support.email}</a>.</>}</p>
            </div>
          </form>
        </section>

        <aside className={styles.sideColumn} aria-label="Подсказки поддержки">
          <section className={styles.sidePanel}>
            <span>Перед обращением</span>
            <h2>Что подготовить</h2>
            <ol><li>Номер заказа или операции</li><li>Точное описание проблемы</li><li>Время возникновения ошибки</li></ol>
            <p>Профиль: <strong>{session?.emailAccount?.email ?? session?.steamAccount?.displayName ?? "Vault Player"}</strong></p>
          </section>

          <section className={styles.sidePanel}>
            <div className={styles.faqHeading}><div><span>FAQ по теме</span><h2>{supportCategories.find((category) => category.value === form.category)?.label}</h2></div><Link href="/#faq">Все вопросы</Link></div>
            <div className={styles.faqList}>{activeFaq.map((item) => <details key={item.id}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
          </section>

          {sortedOrders.length ? <section className={styles.sidePanel}><span>Последние покупки</span><h2>Быстрый переход</h2><div className={styles.orderLinks}>{sortedOrders.slice(0, 3).map((order) => <Link key={order.id} href="/account/purchases"><strong>{order.number}</strong><small>{order.items[0].title}</small></Link>)}</div></section> : null}
        </aside>
      </div>
    </div>
  );
}
