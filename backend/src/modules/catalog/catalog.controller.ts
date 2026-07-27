import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { CatalogService } from "./catalog.service";
import type { CatalogListDto, CatalogListQuery, CatalogProductDto } from "./catalog.types";

const priceSchema = {
  type: "object",
  required: ["currency", "amountMinor", "scale", "display"],
  properties: {
    currency: { type: "string", enum: ["COINS"] },
    amountMinor: { type: "integer", minimum: 1 },
    scale: { type: "integer", enum: [2] },
    display: { type: "string" },
  },
};

const productSchema = {
  type: "object",
  required: [
    "id",
    "slug",
    "kind",
    "category",
    "productType",
    "title",
    "description",
    "price",
    "availability",
    "fulfillmentMode",
    "createdAt",
    "popularity",
    "meta",
    "keywords",
    "details",
  ],
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    kind: { type: "string", enum: ["steam", "skins"] },
    category: { type: "string" },
    game: { type: "string" },
    productType: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    price: priceSchema,
    availability: { type: "string", enum: ["available", "on-request"] },
    fulfillmentMode: { type: "string", enum: ["automatic", "steam-trade", "manual"] },
    createdAt: { type: "string", format: "date-time" },
    popularity: { type: "integer" },
    image: { type: "string" },
    imageAlt: { type: "string" },
    meta: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    details: { type: "object" },
  },
};

@ApiTags("Catalog")
@Controller("catalog")
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["items", "facets", "pricing"],
      properties: {
        items: { type: "array", items: productSchema },
        facets: { type: "object" },
        pricing: { type: "object" },
      },
    },
  })
  @Get()
  list(@Query() query: CatalogListQuery): Promise<CatalogListDto> {
    return this.catalog.list(query);
  }

  @ApiOkResponse({ schema: productSchema })
  @Get(":slug")
  getBySlug(@Param("slug") slug: string): Promise<CatalogProductDto> {
    return this.catalog.getBySlug(slug);
  }
}
