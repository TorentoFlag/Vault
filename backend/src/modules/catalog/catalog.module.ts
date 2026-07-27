import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { CatalogController } from "./catalog.controller";
import { CatalogPricingService } from "./catalog-pricing.service";
import { CatalogSupplierSyncService } from "./catalog-supplier-sync.service";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogPricingService, CatalogSupplierSyncService],
  exports: [CatalogService, CatalogPricingService, CatalogSupplierSyncService],
})
export class CatalogModule {}
