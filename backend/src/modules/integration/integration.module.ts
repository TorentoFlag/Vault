import { Module } from "@nestjs/common";

import { AppConfigModule } from "../../config/app-config.module";
import { AdminModule } from "../admin/admin.module";
import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";

@Module({
  imports: [AppConfigModule, AdminModule],
  controllers: [IntegrationController],
  providers: [IntegrationService],
})
export class IntegrationModule {}
