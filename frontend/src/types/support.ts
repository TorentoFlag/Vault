export type SupportCategory = "payment" | "steam" | "skins" | "refund" | "other";

export type SupportDraftInput = {
  category: SupportCategory;
  orderId: string;
  subject: string;
  message: string;
};

export type SupportDraft = SupportDraftInput & {
  updatedAt: string;
};

export type SupportDraftErrors = Partial<Record<"subject" | "message", string>>;
