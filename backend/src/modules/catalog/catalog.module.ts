import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { CatalogController } from "./catalog.controller";
import { CatalogSupplierSyncService } from "./catalog-supplier-sync.service";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogSupplierSyncService],
  exports: [CatalogService, CatalogSupplierSyncService],
})
export class CatalogModule {}
