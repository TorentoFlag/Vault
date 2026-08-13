import { Module } from "@nestjs/common";

import { AppConfigModule } from "../../config/app-config.module";
import { AdminModule } from "../admin/admin.module";
import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";
import { VvAdminDispatcher } from "./vv-admin-dispatcher";
import { VvAdminOutboxService } from "./vv-admin-outbox.service";

@Module({
  imports: [AppConfigModule, AdminModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, VvAdminOutboxService, VvAdminDispatcher],
  exports: [VvAdminOutboxService, VvAdminDispatcher],
})
export class IntegrationModule {}
