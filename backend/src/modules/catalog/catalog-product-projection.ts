import { createHash } from "node:crypto";

import type { CatalogProductDetails } from "./catalog.types";

export type SupplierCatalogProjection = {
  id: string;
  slug: string;
  category: string;
  game: string;
  productType: string;
  title: string;
  description: string;
  popularity: number;
  image: string | null;
  imageAlt: string | null;
  meta: string[];
  keywords: string[];
  details: CatalogProductDetails;
};

const weaponTypes: Array<[RegExp, string]> = [
  [/^(?:AK-47|AUG|FAMAS|Galil AR|M4A1-S|M4A4|SG 553)\b/i, "Автомат"],
  [/^(?:AWP|G3SG1|SCAR-20|SSG 08)\b/i, "Снайперская винтовка"],
  [/^(?:Desert Eagle|Dual Berettas|Five-SeveN|Glock-18|P2000|P250|R8 Revolver|Tec-9|USP-S|CZ75-Auto)\b/i, "Пистолет"],
  [/^(?:MAC-10|MP5-SD|MP7|MP9|P90|PP-Bizon|UMP-45)\b/i, "Пистолет-пулемет"],
  [/^(?:MAG-7|Nova|Sawed-Off|XM1014)\b/i, "Дробовик"],
  [/^(?:M249|Negev)\b/i, "Пулемет"],
  [/^★ .*Gloves\b|Gloves\b/i, "Перчатки"],
  [/^★ |Knife\b|Bayonet\b|Karambit\b|Daggers\b/i, "Нож"],
  [/^Sticker\b/i, "Наклейка"],
  [/^Music Kit\b/i, "Музыкальный набор"],
  [/^Agent\b|^Operator\b/i, "Агент"],
  [/^Patch\b/i, "Нашивка"],
  [/^Graffiti\b/i, "Граффити"],
  [/^Charm\b/i, "Брелок"],
  [/Case\b/i, "Кейс"],
  [/Key\b/i, "Ключ"],
];

function stableHash(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 88);
  return slug || "item";
}

function conditionFromMarketHashName(marketHashName: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(marketHashName);
  return match?.[1] ?? null;
}

function inferProductType(marketHashName: string): string {
  const match = weaponTypes.find(([pattern]) => pattern.test(marketHashName));
  return match?.[1] ?? "Предмет CS2";
}

function cs2Details(productType: string, condition: string | null): CatalogProductDetails {
  return {
    specifications: [
      { label: "Игра", value: "Counter-Strike 2" },
      { label: "Тип", value: productType },
      ...(condition === null ? [] : [{ label: "Состояние", value: condition }]),
    ],
    fulfillment: {
      title: "Данные Steam Trade",
      description: "Предмет покупается через SIH и передается по Steam Trade после оплаты внутренними Coins.",
      requirements: [
        "Для оформления игрового предмета требуется Steam-сессия.",
        "Перед покупкой укажите действующий Steam Trade URL.",
        "Цена и наличие проверяются по активному SIH listing перед оформлением.",
      ],
    },
  };
}

export function createSihCs2CatalogProjection(command: {
  availableQuantity: number;
  imageUrl: string | null;
  marketHashName: string;
}): SupplierCatalogProjection {
  const productType = inferProductType(command.marketHashName);
  const condition = conditionFromMarketHashName(command.marketHashName);
  const hash = stableHash(`sih:cs2:${command.marketHashName}`, 16);
  const title = command.marketHashName;
  const description = condition === null
    ? `${title} для Counter-Strike 2. Предмет доступен через SIH и передается покупателю по Steam Trade.`
    : `${title} для Counter-Strike 2, состояние: ${condition}. Предмет доступен через SIH и передается покупателю по Steam Trade.`;

  return {
    id: `sih-cs2-${hash}`,
    slug: `${slugify(command.marketHashName)}-${hash.slice(0, 8)}`,
    category: "Игровые предметы",
    game: "CS2",
    productType,
    title,
    description,
    popularity: Math.max(1, Math.min(100, 20 + command.availableQuantity)),
    image: command.imageUrl,
    imageAlt: `${title} из Counter-Strike 2`,
    meta: ["CS2", ...(condition === null ? [] : [condition]), productType],
    keywords: [
      "cs2",
      "counter-strike",
      "counter-strike 2",
      "steam trade",
      "sih",
      productType.toLocaleLowerCase("ru-RU"),
      ...command.marketHashName.toLocaleLowerCase("ru-RU").split(/[^a-zа-яё0-9-]+/iu).filter(Boolean),
    ],
    details: cs2Details(productType, condition),
  };
}
