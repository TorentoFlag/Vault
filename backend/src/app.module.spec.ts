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
});
