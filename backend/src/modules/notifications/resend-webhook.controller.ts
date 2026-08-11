import { BadRequestException, Controller, Headers, HttpCode, Inject, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { NotificationOutboxService } from "./notification-outbox.service";
import { ResendClient } from "./resend.client";

type RawBodyRequest = { rawBody?: Buffer };

function eventTypeFromVerifiedPayload(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { type?: unknown }).type !== "string") {
    throw new BadRequestException("Resend webhook payload is invalid");
  }
  return (value as { type: string }).type;
}

@ApiTags("Notifications")
@Controller("webhooks")
export class ResendWebhookController {
  constructor(
    @Inject(ResendClient) private readonly resend: Pick<ResendClient, "verifyWebhook">,
    @Inject(NotificationOutboxService) private readonly outbox: Pick<NotificationOutboxService, "recordWebhookEvent">,
  ) {}

  @ApiHeader({ name: "svix-id", required: true })
  @ApiHeader({ name: "svix-timestamp", required: true })
  @ApiHeader({ name: "svix-signature", required: true })
  @ApiOkResponse({ schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["processed", "duplicate"] } } } })
  @HttpCode(200)
  @Post("resend")
  async handle(
    @Req() request: RawBodyRequest,
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") timestamp: string | undefined,
    @Headers("svix-signature") signature: string | undefined,
  ): Promise<{ status: "duplicate" | "processed" }> {
    if (!request.rawBody || !id || !timestamp || !signature) throw new BadRequestException("Resend webhook headers are required");
    let verified: unknown;
    try {
      verified = this.resend.verifyWebhook({ payload: request.rawBody.toString("utf8"), headers: { id, timestamp, signature } });
    } catch {
      throw new UnauthorizedException("Resend webhook signature is invalid");
    }
    const eventType = eventTypeFromVerifiedPayload(verified);
    const emailId = verified && typeof verified === "object" && "data" in verified
      && (verified as { data?: { email_id?: unknown } }).data && typeof (verified as { data: { email_id?: unknown } }).data.email_id === "string"
      ? (verified as { data: { email_id: string } }).data.email_id
      : undefined;
    return {
      status: await this.outbox.recordWebhookEvent({
        providerEventId: id,
        eventType,
        payloadSnapshot: { ...(emailId ? { emailId } : {}) },
      }),
    };
  }
}
