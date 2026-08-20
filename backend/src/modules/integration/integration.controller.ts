import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AdminGuard } from "../admin/admin.guard";
import { optionalStringFromFile } from "../../config/secret-file";
import type { AppConfig } from "../../config/app-config";
import { APP_CONFIG } from "../../config/app-config.module";
import { CatalogProtocolService } from "./catalog-protocol.service";
import { authenticateCatalogProtocolRequest } from "./catalog-protocol.auth";
import { IntegrationHealthService, type IntegrationHealthResult } from "./integration-health.service";
import { IntegrationSyntheticScenarioService } from "./integration-synthetic-scenario.service";
import { IntegrationService } from "./integration.service";
import { VvAdminScenarioAuthVerifier } from "./vv-admin-scenario-auth";

const CHECKOUT_PAYMENT_REACHED_PATH =
  "/admin/integration/scenarios/checkout-payment-reached/run";

@ApiTags("Integration")
@Controller()
export class IntegrationController {
  constructor(
    @Inject(IntegrationService)
    private readonly integration: IntegrationService,
    @Inject(IntegrationSyntheticScenarioService)
    private readonly syntheticScenarios: IntegrationSyntheticScenarioService,
    @Inject(VvAdminScenarioAuthVerifier)
    private readonly scenarioAuth: VvAdminScenarioAuthVerifier,
    @Inject(CatalogProtocolService)
    private readonly catalogProtocol: CatalogProtocolService,
    @Inject(IntegrationHealthService)
    private readonly integrationHealth: IntegrationHealthService,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  @ApiOkResponse({ description: "VV Admin Integration Protocol v1 manifest." })
  @Get(".well-known/vv-admin/manifest.json")
  manifest() {
    return this.integration.manifest();
  }

  @ApiHeader({
    name: "X-Admin-Token",
    required: true,
    description: "Backend-only admin token loaded from ADMIN_API_TOKEN_FILE.",
  })
  @ApiOkResponse({ description: "Vault integration readiness for VV Admin." })
  @UseGuards(AdminGuard)
  @Get("admin/integration/readiness")
  readiness() {
    return this.integration.readiness();
  }

  @Get("admin/integration/health/redis")
  async redisHealth(@Res({ passthrough: true }) response: Response): Promise<IntegrationHealthResult> {
    return respondHealth(response, await this.integrationHealth.redis());
  }

  @Get("admin/integration/health/top-up")
  topUpHealth(@Res({ passthrough: true }) response: Response): IntegrationHealthResult {
    return respondHealth(response, this.integrationHealth.topUp());
  }

  @Get("admin/integration/health/checkout")
  checkoutHealth(@Res({ passthrough: true }) response: Response): IntegrationHealthResult {
    return respondHealth(response, this.integrationHealth.checkout());
  }

  @Get("admin/integration/health/quote-storage")
  async quoteStorageHealth(@Res({ passthrough: true }) response: Response): Promise<IntegrationHealthResult> {
    return respondHealth(response, await this.integrationHealth.quoteStorage());
  }

  @Get("admin/integration/health/steam-refill")
  steamRefillHealth(@Res({ passthrough: true }) response: Response): IntegrationHealthResult {
    return respondHealth(response, this.integrationHealth.steamRefill());
  }

  @Get("admin/integration/health/catalog-visible")
  async visibleCatalogHealth(@Res({ passthrough: true }) response: Response): Promise<IntegrationHealthResult> {
    return respondHealth(response, await this.integrationHealth.visibleCatalog());
  }

  @Get("admin/integration/health/catalog/:game")
  async catalogGameHealth(
    @Param("game") game: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<IntegrationHealthResult> {
    return respondHealth(response, await this.integrationHealth.catalogGame(readCatalogGame(game)));
  }

  @Get("admin/integration/health/apple-gift-cards")
  async appleGiftCardsHealth(@Res({ passthrough: true }) response: Response): Promise<IntegrationHealthResult> {
    return respondHealth(response, await this.integrationHealth.appleGiftCards());
  }

  @HttpCode(200)
  @Post("admin/integration/scenarios/checkout-payment-reached/run")
  async runCheckoutPaymentReached(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    requireSignedScenarioRequest(
      this.scenarioAuth,
      headers,
      CHECKOUT_PAYMENT_REACHED_PATH,
      body,
    );
    const input = readScenarioRunBody(body);
    return this.syntheticScenarios.runCheckoutPaymentReached(input);
  }

  @Get("admin/integration/catalog/categories")
  listCatalogCategories(@Req() request: Request) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.listCategories();
  }

  @Get("admin/integration/catalog/products")
  listCatalogProducts(@Req() request: Request) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.listProducts();
  }

  @Post("admin/integration/catalog/products")
  createCatalogProduct(@Req() request: Request, @Body() body: unknown) {
    this.requireCatalogAuth(request, body);
    return mutationEnvelope(request, this.catalogProtocol.createProduct(body as never));
  }

  @Patch("admin/integration/catalog/products/:id")
  @HttpCode(200)
  updateCatalogProduct(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch?: string,
  ) {
    this.requireCatalogAuth(request, body);
    return mutationEnvelope(request, this.catalogProtocol.updateProduct(id, body as never, ifMatch));
  }

  @Delete("admin/integration/catalog/products/:id")
  @HttpCode(200)
  deleteCatalogProduct(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("dryRun") dryRun?: string,
    @Headers("if-match") ifMatch?: string,
  ) {
    this.requireCatalogAuth(request);
    return mutationEnvelope(request, this.catalogProtocol.deleteProduct(id, dryRun !== "false", ifMatch));
  }

  @Get("admin/integration/catalog/offers")
  listCatalogOffers(@Req() request: Request, @Query("productId") productId?: string) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.listOffers(productId);
  }

  @Post("admin/integration/catalog/offers")
  createCatalogOffer(@Req() request: Request, @Body() body: unknown) {
    this.requireCatalogAuth(request, body);
    return mutationEnvelope(request, this.catalogProtocol.createOffer(body as never));
  }

  @Patch("admin/integration/catalog/offers/:id")
  @HttpCode(200)
  updateCatalogOffer(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("if-match") ifMatch?: string,
  ) {
    this.requireCatalogAuth(request, body);
    return mutationEnvelope(request, this.catalogProtocol.updateOffer(id, body as never, ifMatch));
  }

  @Delete("admin/integration/catalog/offers/:id")
  @HttpCode(200)
  deleteCatalogOffer(
    @Req() request: Request,
    @Param("id") id: string,
    @Query("dryRun") dryRun?: string,
    @Headers("if-match") ifMatch?: string,
  ) {
    this.requireCatalogAuth(request);
    return mutationEnvelope(request, this.catalogProtocol.deleteOffer(id, dryRun !== "false", ifMatch));
  }

  @Get("admin/integration/catalog/sellers")
  listCatalogSellers(@Req() request: Request) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.listDisabledResource();
  }

  @Get("admin/integration/catalog/destinations")
  listCatalogDestinations(@Req() request: Request) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.listDisabledResource();
  }

  @Get("admin/integration/catalog/operations/by-request/:requestId")
  catalogOperationByRequest(@Req() request: Request, @Param("requestId") requestId: string) {
    this.requireCatalogAuth(request);
    return this.catalogProtocol.operationByRequest(requestId);
  }

  private requireCatalogAuth(request: Request, body?: unknown): void {
    const secret = optionalStringFromFile(this.config.integration.protocolAuthSecretFile);
    const siteKey = this.config.integration.vvAdminSiteKey ?? "vault";
    if (!secret) throw new UnauthorizedException();
    try {
      authenticateCatalogProtocolRequest(
        {
          body: body === undefined ? "" : JSON.stringify(body),
          headers: request.headers,
          method: request.method,
          path: catalogRelativePath(request),
        },
        secret,
        siteKey,
      );
    } catch {
      throw new UnauthorizedException();
    }
  }
}

function respondHealth(response: Response, result: IntegrationHealthResult): IntegrationHealthResult {
  if (result.status !== "ok") response.status(503);
  return result;
}

function readCatalogGame(game: string): "cs2" | "rust" | "tf2" {
  if (game === "cs2" || game === "rust" || game === "tf2") return game;
  throw new BadRequestException("Catalog game is invalid");
}

function catalogRelativePath(request: Request): string {
  const originalUrl = request.originalUrl || request.url;
  const [, suffix = ""] = originalUrl.split("/admin/integration/catalog");
  return suffix.startsWith("/") ? suffix : `/${suffix}`;
}

async function mutationEnvelope(request: Request, resource: Promise<unknown>) {
  return {
    operationId: request.headers["x-vv-request-id"] ?? "operation",
    resource: await resource,
  };
}

function requireSignedScenarioRequest(
  verifier: VvAdminScenarioAuthVerifier,
  headers: Record<string, string | string[] | undefined>,
  path: string,
  body: unknown,
): void {
  const signature = singleHeader(headers["x-vv-admin-signature"]);
  const timestamp = singleHeader(headers["x-vv-admin-timestamp"]);
  if (!signature || !timestamp) throw new UnauthorizedException();
  if (
    !verifier.verify({
      body: JSON.stringify(body ?? {}),
      path,
      signature,
      timestamp,
    })
  ) {
    throw new UnauthorizedException();
  }
}

function readScenarioRunBody(body: unknown): { readonly runId: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Scenario run body is invalid");
  }
  const runId = (body as { runId?: unknown }).runId;
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new BadRequestException("runId is required");
  }
  return { runId: runId.trim() };
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
