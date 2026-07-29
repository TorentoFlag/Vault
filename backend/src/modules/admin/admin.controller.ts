import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { AdminGuard } from "./admin.guard";
import { AdminService, type AdminOperationsOverviewDto } from "./admin.service";

const operationsOverviewSchema = {
  type: "object",
  required: ["generatedAt", "payments", "orders", "fulfillment", "webhooks"],
  properties: {
    generatedAt: { type: "string", format: "date-time" },
    payments: {
      type: "object",
      required: ["manualReview"],
      properties: {
        manualReview: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "userId", "status", "provider", "providerStatus", "coinAmountMinor", "fiatAmountMinor", "fiatCurrency", "manualReviewReason", "createdAt", "updatedAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              userId: { type: "string" },
              status: { type: "string" },
              provider: { type: "string" },
              providerStatus: { type: "string", nullable: true },
              coinAmountMinor: { type: "integer" },
              fiatAmountMinor: { type: "integer" },
              fiatCurrency: { type: "string" },
              manualReviewReason: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    orders: {
      type: "object",
      required: ["problem"],
      properties: {
        problem: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "userId", "status", "totalCoinMinor", "lineCount", "openLineCount", "createdAt", "updatedAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              userId: { type: "string" },
              status: { type: "string" },
              totalCoinMinor: { type: "integer" },
              lineCount: { type: "integer" },
              openLineCount: { type: "integer" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    fulfillment: {
      type: "object",
      required: ["commands"],
      properties: {
        commands: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "orderId", "orderLineId", "provider", "commandType", "status", "lastErrorCode", "lastAttemptOperation", "lastAttemptStatus", "createdAt", "updatedAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              orderId: { type: "string", format: "uuid" },
              orderLineId: { type: "string", format: "uuid" },
              provider: { type: "string" },
              commandType: { type: "string" },
              status: { type: "string" },
              lastErrorCode: { type: "string", nullable: true },
              lastAttemptOperation: { type: "string", nullable: true },
              lastAttemptStatus: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    webhooks: {
      type: "object",
      required: ["problem"],
      properties: {
        problem: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "provider", "providerEventId", "status", "signatureStatus", "receivedAt", "processedAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              provider: { type: "string" },
              providerEventId: { type: "string" },
              status: { type: "string" },
              signatureStatus: { type: "string" },
              receivedAt: { type: "string", format: "date-time" },
              processedAt: { type: "string", format: "date-time", nullable: true },
            },
          },
        },
      },
    },
  },
};

@ApiTags("Admin")
@UseGuards(AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @ApiOkResponse({ schema: operationsOverviewSchema })
  @ApiHeader({
    name: "X-Admin-Token",
    required: true,
    description: "Backend-only admin token loaded from ADMIN_API_TOKEN_FILE.",
  })
  @Get("operations/overview")
  overview(): Promise<AdminOperationsOverviewDto> {
    return this.admin.getOperationsOverview();
  }
}
