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
});
