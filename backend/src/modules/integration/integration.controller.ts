import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { AdminGuard } from "../admin/admin.guard";
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
