import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { AdminGuard } from "../admin/admin.guard";
import { IntegrationService } from "./integration.service";

@ApiTags("Integration")
@Controller()
export class IntegrationController {
  constructor(
    @Inject(IntegrationService)
    private readonly integration: IntegrationService,
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
}
