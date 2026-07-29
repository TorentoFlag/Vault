import { readFile } from "node:fs/promises";

const DEFAULT_ARC_PAY_BASE_URL = "https://api.arcpay.space/v1";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CreateHostedCheckoutCommand = {
  amountMinor: number;
  cancelUrl: string;
  description: string;
  externalId: string;
  failUrl: string;
  idempotencyKey: string;
  successUrl: string;
};

export type HostedCheckoutResult = {
  providerSessionId: string;
  checkoutUrl: string;
};

export type ArcPayPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  externalId: string | null;
  metadata: Record<string, string>;
};

export type ArcPayPaymentList = {
  nextCursor: string | null;
  pageSize: number;
  payments: ArcPayPayment[];
  total: number;
};

export type ArcPayClientOptions = {
  apiKeyFile: string;
  baseUrl?: string;
  fetch?: FetchLike;
};

function assertHttpsUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}_INVALID`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error(`${name}_INVALID`);
  }
}

function assertPositiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("ARC_PAY_AMOUNT_INVALID");
}

function assertNonBlank(name: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`${name}_REQUIRED`);
}

function assertUuid(name: string, value: string): void {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
}

function parseCheckoutResponse(value: unknown): HostedCheckoutResult {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { url?: unknown }).url === "string"
  ) {
    return {
      providerSessionId: (value as { id: string }).id,
      checkoutUrl: (value as { url: string }).url,
    };
  }
  throw new Error("ARC_PAY_RESPONSE_INVALID");
}

function parsePaymentResponse(value: unknown): ArcPayPayment {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { status?: unknown }).status === "string" &&
    Number.isSafeInteger((value as { amount?: unknown }).amount) &&
    typeof (value as { currency?: unknown }).currency === "string"
  ) {
    const metadata = (value as { metadata?: unknown }).metadata;
    const externalId = (value as { external_id?: unknown }).external_id;
    return {
      id: (value as { id: string }).id,
      status: (value as { status: string }).status,
      amount: (value as { amount: number }).amount,
      currency: (value as { currency: string }).currency.toUpperCase(),
      externalId: typeof externalId === "string" && externalId.trim().length > 0 ? externalId.trim() : null,
      metadata: metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
        ? Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {},
    };
  }
  throw new Error("ARC_PAY_RESPONSE_INVALID");
}

function parsePaymentListResponse(value: unknown): ArcPayPaymentList {
  if (
    value !== null &&
    typeof value === "object" &&
    Array.isArray((value as { payments?: unknown }).payments) &&
    Number.isSafeInteger((value as { total?: unknown }).total) &&
    Number.isSafeInteger((value as { page_size?: unknown }).page_size)
  ) {
    const nextCursor = (value as { next_cursor?: unknown }).next_cursor;
    return {
      nextCursor: typeof nextCursor === "string" && nextCursor.trim().length > 0 ? nextCursor.trim() : null,
      pageSize: (value as { page_size: number }).page_size,
      payments: (value as { payments: unknown[] }).payments.map(parsePaymentResponse),
      total: (value as { total: number }).total,
    };
  }
  throw new Error("ARC_PAY_RESPONSE_INVALID");
}

export class ArcPayClient {
  private readonly baseUrl: string;
  private readonly fetch: FetchLike;

  constructor(private readonly options: ArcPayClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_ARC_PAY_BASE_URL).replace(/\/$/, "");
    this.fetch = options.fetch ?? fetch;
  }

  async createHostedCheckout(command: CreateHostedCheckoutCommand): Promise<HostedCheckoutResult> {
    assertPositiveMinor(command.amountMinor);
    assertNonBlank("ARC_PAY_IDEMPOTENCY_KEY", command.idempotencyKey);
    assertUuid("ARC_PAY_IDEMPOTENCY_KEY", command.idempotencyKey);
    assertNonBlank("ARC_PAY_DESCRIPTION", command.description);
    assertNonBlank("ARC_PAY_EXTERNAL_ID", command.externalId);
    assertHttpsUrl("ARC_PAY_SUCCESS_URL", command.successUrl);
    assertHttpsUrl("ARC_PAY_FAIL_URL", command.failUrl);
    assertHttpsUrl("ARC_PAY_CANCEL_URL", command.cancelUrl);

    const apiKey = (await readFile(this.options.apiKeyFile, "utf8")).trim();
    if (!apiKey.startsWith("sk_test_")) throw new Error("ARC_PAY_SECRET_KEY_INVALID");

    const response = await this.fetch(`${this.baseUrl}/checkout/sessions`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": command.idempotencyKey,
      },
      body: JSON.stringify({
        amount: command.amountMinor,
        cancel_url: command.cancelUrl,
        capture_mode: "one_stage",
        currency: "RUB",
        description: command.description,
        external_id: command.externalId,
        fail_url: command.failUrl,
        locale: "ru",
        metadata: {
          vault_top_up_id: command.externalId,
        },
        payment_methods: [{
          method: "sbp",
          payment_mode: "h2h",
        }],
        success_url: command.successUrl,
      }),
    });

    const body = await response.json().catch(() => {
      throw new Error("ARC_PAY_RESPONSE_INVALID");
    });
    if (!response.ok) throw new Error("ARC_PAY_CHECKOUT_CREATE_FAILED");
    return parseCheckoutResponse(body);
  }

  async getPayment(paymentId: string): Promise<ArcPayPayment> {
    assertUuid("ARC_PAY_PAYMENT_ID", paymentId);
    const apiKey = (await readFile(this.options.apiKeyFile, "utf8")).trim();
    if (!apiKey.startsWith("sk_test_")) throw new Error("ARC_PAY_SECRET_KEY_INVALID");

    const response = await this.fetch(`${this.baseUrl}/payments/${paymentId}`, {
      method: "GET",
      headers: {
        "authorization": `Bearer ${apiKey}`,
      },
    });
    const body = await response.json().catch(() => {
      throw new Error("ARC_PAY_RESPONSE_INVALID");
    });
    if (!response.ok) throw new Error("ARC_PAY_PAYMENT_LOOKUP_FAILED");
    return parsePaymentResponse(body);
  }

  async listPayments(command: { pageSize?: number; search: string }): Promise<ArcPayPaymentList> {
    assertNonBlank("ARC_PAY_PAYMENT_SEARCH", command.search);
    const pageSize = command.pageSize ?? 5;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("ARC_PAY_PAGE_SIZE_INVALID");
    const apiKey = (await readFile(this.options.apiKeyFile, "utf8")).trim();
    if (!apiKey.startsWith("sk_test_")) throw new Error("ARC_PAY_SECRET_KEY_INVALID");

    const url = new URL(`${this.baseUrl}/payments`);
    url.searchParams.set("search", command.search);
    url.searchParams.set("page_size", String(pageSize));
    const response = await this.fetch(url.href, {
      method: "GET",
      headers: {
        "authorization": `Bearer ${apiKey}`,
      },
    });
    const body = await response.json().catch(() => {
      throw new Error("ARC_PAY_RESPONSE_INVALID");
    });
    if (!response.ok) throw new Error("ARC_PAY_PAYMENT_LIST_FAILED");
    return parsePaymentListResponse(body);
  }
}
