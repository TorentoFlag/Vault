import { describe, expect, it } from "vitest";

import { createOpenApiJson } from "./openapi";

describe("OpenAPI contract", () => {
  it("documents checkout request body and idempotency header", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/checkout"?: {
          post?: {
            parameters?: Array<{ name: string; in: string; required?: boolean }>;
            requestBody?: {
              required?: boolean;
              content?: {
                "application/json"?: {
                  schema?: {
                    required?: string[];
                    properties?: Record<string, unknown>;
                  };
                };
              };
            };
          };
        };
      };
    };

    const checkout = document.paths["/checkout"]?.post;
    expect(checkout?.parameters).toContainEqual(expect.objectContaining({
      name: "idempotency-key",
      in: "header",
      required: true,
    }));
    expect(checkout?.requestBody?.required).toBe(true);
    expect(checkout?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
      required: ["items", "acceptedTotalCoinMinor"],
      properties: {
        acceptedTotalCoinMinor: {
          type: "integer",
          minimum: 1,
        },
        items: {
          type: "array",
          minItems: 1,
        },
      },
    });
  });

  it("documents server-side cart routes and item mutation body", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/cart"?: {
          get?: unknown;
          delete?: unknown;
        };
        "/cart/items/{productSlug}"?: {
          put?: {
            requestBody?: {
              required?: boolean;
              content?: {
                "application/json"?: {
                  schema?: {
                    required?: string[];
                    properties?: Record<string, unknown>;
                  };
                };
              };
            };
          };
          delete?: unknown;
        };
        "/checkout/cart"?: {
          post?: {
            parameters?: Array<{ name: string; in: string; required?: boolean }>;
            requestBody?: {
              required?: boolean;
              content?: {
                "application/json"?: {
                  schema?: {
                    required?: string[];
                    properties?: Record<string, unknown>;
                  };
                };
              };
            };
          };
        };
      };
    };

    expect(document.paths["/cart"]?.get).toBeDefined();
    expect(document.paths["/cart"]?.delete).toBeDefined();
    expect(document.paths["/cart/items/{productSlug}"]?.delete).toBeDefined();
    expect(document.paths["/cart/items/{productSlug}"]?.put?.requestBody?.required).toBe(true);
    expect(document.paths["/cart/items/{productSlug}"]?.put?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
      required: ["quantity"],
      properties: {
        quantity: {
          type: "integer",
          minimum: 1,
          maximum: 50,
        },
      },
    });
    expect(document.paths["/checkout/cart"]?.post?.parameters).toContainEqual(expect.objectContaining({
      name: "idempotency-key",
      in: "header",
      required: true,
    }));
    expect(document.paths["/checkout/cart"]?.post?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
      required: ["acceptedTotalCoinMinor"],
      properties: {
        acceptedTotalCoinMinor: {
          type: "integer",
          minimum: 1,
        },
      },
    });
  });

  it("documents all order history statuses emitted by fulfillment", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/orders/me"?: {
          get?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      properties?: {
                        orders?: {
                          items?: {
                            properties?: {
                              status?: {
                                enum?: string[];
                              };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const status = document.paths["/orders/me"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.orders?.items?.properties?.status;
    expect(status?.enum).toEqual(["held", "fulfilled", "partially_fulfilled", "failed", "manual_review"]);
  });

  it("documents manual-review top-up sessions for refunded or disputed Arc Pay payments", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/payments/top-up/sessions"?: {
          post?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      properties?: {
                        status?: {
                          enum?: string[];
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const status = document.paths["/payments/top-up/sessions"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.status;
    expect(status?.enum).toEqual(["provider_configuration_required", "provider_creation_pending", "checkout_pending", "paid", "failed", "manual_review"]);
  });

  it("documents read-only admin operations overview without mutation endpoints", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/admin/operations/overview"?: {
          get?: {
            parameters?: Array<{ name: string; in: string; required?: boolean }>;
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      required?: string[];
                      properties?: {
                        payments?: unknown;
                        orders?: unknown;
                        fulfillment?: unknown;
                        webhooks?: unknown;
                      };
                    };
                  };
                };
              };
            };
          };
          post?: unknown;
          put?: unknown;
          patch?: unknown;
          delete?: unknown;
        };
      };
    };

    const admin = document.paths["/admin/operations/overview"];
    expect(admin?.get?.parameters).toContainEqual(expect.objectContaining({
      name: "X-Admin-Token",
      in: "header",
      required: true,
    }));
    expect(admin?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.required).toEqual(["generatedAt", "payments", "orders", "fulfillment", "webhooks"]);
    expect(admin?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.payments).toBeDefined();
    expect(admin?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.orders).toBeDefined();
    expect(admin?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.fulfillment).toBeDefined();
    expect(admin?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.webhooks).toBeDefined();
    expect(admin?.post).toBeUndefined();
    expect(admin?.put).toBeUndefined();
    expect(admin?.patch).toBeUndefined();
    expect(admin?.delete).toBeUndefined();
  });

  it("documents backend-owned inventory projection", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/inventory/me"?: {
          get?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      properties?: {
                        items?: {
                          items?: {
                            required?: string[];
                            properties?: {
                              actions?: {
                                properties?: {
                                  withdrawToSteam?: {
                                    properties?: {
                                      enabled?: { type?: string };
                                      reason?: { enum?: string[] };
                                    };
                                  };
                                };
                              };
                              status?: { enum?: string[] };
                              unitPriceCoinMinor?: { type?: string };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const item = document.paths["/inventory/me"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.items?.items;
    expect(item?.required).toEqual(["id", "orderId", "productSlug", "title", "unitPriceCoinMinor", "acquiredAt", "status", "actions"]);
    expect(item?.properties?.status?.enum).toEqual(["owned"]);
    expect(item?.properties?.unitPriceCoinMinor?.type).toBe("integer");
    expect(item?.properties?.actions).toBeDefined();
    expect(item?.properties?.actions?.properties?.withdrawToSteam?.properties?.enabled?.type).toBe("boolean");
    expect(item?.properties?.actions?.properties?.withdrawToSteam?.properties?.reason?.enum).toEqual(["available", "not_supported", "steam_trade_url_required"]);
  });

  it("documents backend-owned inventory withdrawal requests", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/inventory/me/items/{itemId}/withdrawals"?: {
          post?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      required?: string[];
                      properties?: {
                        status?: { enum?: string[] };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const schema = document.paths["/inventory/me/items/{itemId}/withdrawals"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema;
    expect(schema?.required).toEqual(["createdAt", "id", "itemId", "orderId", "orderNumber", "status", "title"]);
    expect(schema?.properties?.status?.enum).toEqual(["pending"]);
  });

  it("documents backend-owned wallet transaction history", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/wallet/me/transactions"?: {
          get?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      properties?: {
                        transactions?: {
                          items?: {
                            required?: string[];
                            properties?: {
                              amountCoinMinor?: { type?: string };
                              balanceAfterCoinMinor?: { type?: string };
                              direction?: { enum?: string[] };
                              reason?: { enum?: string[] };
                              status?: { enum?: string[] };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const item = document.paths["/wallet/me/transactions"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.transactions?.items;
    expect(item?.required).toEqual(["amountCoinMinor", "balanceAfterCoinMinor", "createdAt", "direction", "id", "reason", "status"]);
    expect(item?.properties?.amountCoinMinor?.type).toBe("integer");
    expect(item?.properties?.balanceAfterCoinMinor?.type).toBe("integer");
    expect(item?.properties?.direction?.enum).toEqual(["credit", "debit"]);
    expect(item?.properties?.reason?.enum).toEqual(["top_up", "purchase"]);
    expect(item?.properties?.status?.enum).toEqual(["completed"]);
  });

  it("documents backend-owned fulfillment trade history", async () => {
    const document = JSON.parse(await createOpenApiJson()) as {
      paths: {
        "/fulfillment/me/trades"?: {
          get?: {
            responses?: {
              "200"?: {
                content?: {
                  "application/json"?: {
                    schema?: {
                      properties?: {
                        events?: {
                          items?: {
                            required?: string[];
                            properties?: {
                              direction?: { enum?: string[] };
                              status?: { enum?: string[] };
                            };
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const item = document.paths["/fulfillment/me/trades"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.events?.items;
    expect(item?.required).toEqual(["id", "createdAt", "direction", "title", "itemId", "orderNumber", "status"]);
    expect(item?.properties?.direction?.enum).toEqual(["purchase", "withdrawal"]);
    expect(item?.properties?.status?.enum).toEqual(["pending", "processing", "completed"]);
  });
});
