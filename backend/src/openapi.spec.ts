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
      required: ["items"],
      properties: {
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
                              actions?: unknown;
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
    expect(item?.properties?.direction?.enum).toEqual(["purchase"]);
    expect(item?.properties?.status?.enum).toEqual(["pending", "processing", "completed"]);
  });
});
