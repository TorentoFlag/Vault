import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";

import { AppModule } from "./app.module";

describe("AppModule", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it("mounts the public health boundary", async () => {
    await request(httpServer)
      .get("/health/live")
      .set("x-request-id", "vault:test_request")
      .expect(200, {
        status: "ok",
        service: "vault-api",
      })
      .expect("x-request-id", "vault:test_request");
  });

  it("generates a request id when the caller does not provide one", async () => {
    await request(httpServer)
      .get("/health/live")
      .expect(200)
      .expect("x-request-id", /^[0-9a-f-]{36}$/);
  });

  it("mounts the public VV Admin integration manifest", async () => {
    await request(httpServer)
      .get("/.well-known/vv-admin/manifest.json")
      .expect(200)
      .expect((response: { body: unknown }) => {
        const body = readManifestBody(response.body);
        if (typeof body.site.key !== "string" || !body.site.key.trim()) {
          throw new Error("manifest site key must be configured");
        }
        if (body.catalog.auth.scheme !== "vv_hmac") {
          throw new Error("manifest catalog auth must be vv_hmac");
        }
      });
  });
});

function readManifestBody(value: unknown): {
  readonly site: { readonly key: unknown };
  readonly catalog: { readonly auth: { readonly scheme: unknown } };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("manifest body must be an object");
  }
  const body = value as Record<string, unknown>;
  const site = body.site;
  if (!site || typeof site !== "object" || Array.isArray(site)) {
    throw new Error("manifest site must be an object");
  }
  const catalog = body.catalog;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("manifest catalog must be an object");
  }
  const auth = (catalog as Record<string, unknown>).auth;
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    throw new Error("manifest catalog auth must be an object");
  }
  return {
    site: { key: (site as Record<string, unknown>).key },
    catalog: { auth: { scheme: (auth as Record<string, unknown>).scheme } },
  };
}
