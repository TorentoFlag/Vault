import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { DatabaseModule } from "./common/database/database.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { QueueModule } from "./common/queue/queue.module";
import { AppConfigModule } from "./config/app-config.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [AppConfigModule, DatabaseModule, QueueModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
