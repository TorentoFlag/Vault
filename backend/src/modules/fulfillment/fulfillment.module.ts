import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { SihClient } from "../providers/sih/sih.client";
import { UsersModule } from "../users/users.module";
import { WalletModule } from "../wallet/wallet.module";
import { FulfillmentService } from "./fulfillment.service";

@Module({
  imports: [DatabaseModule, UsersModule, WalletModule],
  providers: [
    {
      provide: SihClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): SihClient => new SihClient({
        ...(config.sih.apiKeyFile ? { apiKeyFile: config.sih.apiKeyFile } : {}),
        marketBaseUrl: config.sih.marketBaseUrl,
        maximumBodyBytes: config.sih.maximumBodyBytes,
        requestTimeoutMs: config.sih.requestTimeoutMs,
        steamRefillBaseUrl: config.sih.steamRefillBaseUrl,
      }),
    },
    FulfillmentService,
  ],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
