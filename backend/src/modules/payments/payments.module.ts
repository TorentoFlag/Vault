import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { SessionsModule } from "../sessions/sessions.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [DatabaseModule, SessionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
