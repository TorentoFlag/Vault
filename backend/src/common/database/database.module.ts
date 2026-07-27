import { Module } from "@nestjs/common";

import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { buildDatabaseConnectionOptions } from "./database.config";
import { DATABASE_CONNECTION_OPTIONS } from "./database.tokens";

@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION_OPTIONS,
      useFactory: (config: AppConfig) => buildDatabaseConnectionOptions(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [DATABASE_CONNECTION_OPTIONS],
})
export class DatabaseModule {}
