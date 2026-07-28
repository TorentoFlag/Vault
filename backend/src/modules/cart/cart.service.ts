import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { CatalogService } from "../catalog/catalog.service";
import type { CatalogProductDto } from "../catalog/catalog.types";
import type { CheckoutCartItem } from "../checkout/checkout.service";

type CartItemRow = {
  product_slug: string;
  quantity: number;
  recipient: Record<string, unknown>;
};

export type CartRecipient = {
  steamLogin?: string;
};

export type CartItemDto = {
  productId: string;
  productSlug: string;
  kind: CatalogProductDto["kind"];
  title: string;
  quantity: number;
  unitPriceCoinMinor: number;
  lineTotalCoinMinor: number;
  recipient: CartRecipient;
};

export type CartDto = {
  items: CartItemDto[];
  totalCoinMinor: number;
};

export type SetCartItemCommand = {
  userId: string;
  productSlug: string;
  quantity: number;
  recipient?: CartRecipient;
};

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 50) {
    throw new BadRequestException("Cart item quantity is invalid");
  }
}

function normalizeRecipient(value: CartRecipient | undefined): CartRecipient {
  const steamLogin = value?.steamLogin?.trim();
  return steamLogin ? { steamLogin } : {};
}

function isCartRecipient(value: unknown): value is CartRecipient {
  return typeof value === "object" && value !== null && (
    !("steamLogin" in value) || typeof (value as { steamLogin?: unknown }).steamLogin === "string"
  );
}

@Injectable()
export class CartService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  async getCart(userId: string): Promise<CartDto> {
    const cartId = await this.ensureActiveCart(userId);
    return this.loadCart(cartId);
  }

  async setItem(command: SetCartItemCommand): Promise<CartDto> {
    assertQuantity(command.quantity);
    await this.catalog.getBySlug(command.productSlug);
    const cartId = await this.ensureActiveCart(command.userId);
    await this.database.query(
      `
        INSERT INTO cart_items (cart_id, product_slug, quantity, recipient)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (cart_id, product_slug) DO UPDATE
        SET quantity = EXCLUDED.quantity,
            recipient = EXCLUDED.recipient,
            updated_at = clock_timestamp()
      `,
      [cartId, command.productSlug, command.quantity, JSON.stringify(normalizeRecipient(command.recipient))],
    );
    await this.touchCart(cartId);
    return this.loadCart(cartId);
  }

  async removeItem(userId: string, productSlug: string): Promise<CartDto> {
    const cartId = await this.ensureActiveCart(userId);
    await this.database.query("DELETE FROM cart_items WHERE cart_id = $1 AND product_slug = $2", [cartId, productSlug]);
    await this.touchCart(cartId);
    return this.loadCart(cartId);
  }

  async clearCart(userId: string): Promise<CartDto> {
    const cartId = await this.ensureActiveCart(userId);
    await this.database.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    await this.touchCart(cartId);
    return this.loadCart(cartId);
  }

  async getCheckoutItems(userId: string): Promise<CheckoutCartItem[]> {
    const cartId = await this.ensureActiveCart(userId);
    const result = await this.database.query<CartItemRow>(
      `
        SELECT product_slug, quantity, recipient
        FROM cart_items
        WHERE cart_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [cartId],
    );
    return result.rows.map((row) => ({
      productSlug: row.product_slug,
      quantity: row.quantity,
      recipient: isCartRecipient(row.recipient) ? row.recipient : {},
    }));
  }

  private async ensureActiveCart(userId: string): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO carts (user_id, status)
        VALUES ($1, 'active')
        ON CONFLICT (user_id, status) DO UPDATE
        SET updated_at = carts.updated_at
        RETURNING id
      `,
      [userId],
    );
    const cartId = result.rows[0]?.id;
    if (cartId === undefined) throw new Error("CART_NOT_CREATED");
    return cartId;
  }

  private async touchCart(cartId: string): Promise<void> {
    await this.database.query("UPDATE carts SET updated_at = clock_timestamp() WHERE id = $1", [cartId]);
  }

  private async loadCart(cartId: string): Promise<CartDto> {
    const result = await this.database.query<CartItemRow>(
      `
        SELECT product_slug, quantity, recipient
        FROM cart_items
        WHERE cart_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [cartId],
    );
    const items = await Promise.all(result.rows.map(async (row): Promise<CartItemDto> => {
      const product = await this.catalog.getBySlug(row.product_slug);
      const lineTotalCoinMinor = product.price.amountMinor * row.quantity;
      return {
        productId: product.id,
        productSlug: product.slug,
        kind: product.kind,
        title: product.title,
        quantity: row.quantity,
        unitPriceCoinMinor: product.price.amountMinor,
        lineTotalCoinMinor,
        recipient: isCartRecipient(row.recipient) ? row.recipient : {},
      };
    }));
    return {
      items,
      totalCoinMinor: items.reduce((total, item) => total + item.lineTotalCoinMinor, 0),
    };
  }
}
