import type { Category, FAQ, Product } from "@/types/commerce";
import { catalogProducts } from "./products.ts";
import { siteConfig } from "../config/site.ts";

export const categories: Category[] = [
  {
    id: "steam",
    title: "Steam",
    description: "Номиналы Steam по фиксированному курсу.",
    action: "Посмотреть варианты",
    href: "/catalog?category=steam",
  },
  {
    id: "skins",
    title: "Игровые предметы",
    description: "Скины CS2, Dota 2 и Rust.",
    action: "Открыть каталог",
    href: "/catalog?category=skins",
  },
  {
    id: "gpt",
    title: "GPT",
    description: "Предложения GPT и API в Coins.",
    action: "Открыть каталог",
    href: "/catalog?category=gpt",
  },
];

const homeProductIds = [
  "ak-redline",
  "awp-asiimov",
  "m4-printstream",
  "deagle-printstream",
  "steam-top-up-1000",
  "gpt-plus",
  "gpt-api-balance",
];

function getCatalogProduct(id: string) {
  const product = catalogProducts.find((item) => item.id === id);

  if (!product) {
    throw new Error(`Home product not found: ${id}`);
  }

  return product;
}

export const popularProducts: Product[] = homeProductIds.map(getCatalogProduct);

const newProductIds = [
  "m4-printstream",
  "deagle-printstream",
  "steam-top-up-1000",
  "gpt-plus",
];

export const newProducts: Product[] = newProductIds.map(getCatalogProduct);

export const faqItems: FAQ[] = [
  {
    id: "safe-payment",
    group: "Безопасность",
    question: "Безопасно ли оплачивать заказ картой на сайте?",
    answer: "Оплата картой на сайте сейчас недоступна: платёжный провайдер не подключён. Форма пополнения показывает только расчёт и не принимает банковские данные.",
  },
  {
    id: "payment-methods",
    group: "Безопасность",
    question: "Какие способы оплаты доступны — карта или СБП?",
    answer: "Карты и СБП пока не подключены. Когда платёжный провайдер будет настроен, доступные способы появятся непосредственно перед подтверждением пополнения.",
  },
  {
    id: "receipt",
    group: "Безопасность",
    question: "Выдаёте ли вы официальный чек после покупки?",
    answer: "Сейчас платежи не проводятся, поэтому чек не формируется. Условия выдачи чека будут указаны вместе с подключённым платёжным способом.",
  },
  {
    id: "charged",
    group: "Безопасность",
    question: "Что делать, если деньги списались, а заказ не изменился?",
    answer: "Vault сейчас не списывает деньги с карты. Если вы видите внешнее списание, сохраните время и сумму и свяжитесь с банком; детали вопроса можно также отправить на почту поддержки.",
  },
  {
    id: "coins",
    group: "Безопасность",
    question: "Как работает конвертация рублей в Coins?",
    answer: `В Vault используется фиксированный расчётный курс: 1 ₽ = ${siteConfig.coin.rate.toLocaleString("ru-RU")} Coins. Он не равен 1:1 и одинаков во всех калькуляторах.`,
  },
  {
    id: "trade-bots",
    group: "Steam",
    question: "Как работают трейд-боты Steam?",
    answer: "Автоматическая отправка трейда пока не подключена. Интерфейс проверяет Steam-сессию и Trade URL, а действия вывода остаются недоступными до подключения обработки Steam Trade.",
  },
  {
    id: "trade-time",
    group: "Steam",
    question: "Сколько времени занимает отправка трейда?",
    answer: "Срок отправки не заявлен, пока обработка Steam Trade не подключена. Заказ помечается как локально сохранённый, без имитации отправленного предложения.",
  },
  {
    id: "trade-status",
    group: "Steam",
    question: "Как узнать статус посылки или трейда?",
    answer: "Локальный статус заказа доступен в истории покупок. Статус реального трейда появится только после подключения Steam Trade; физического мерча в текущем каталоге нет.",
  },
  {
    id: "shipping-services",
    group: "Steam",
    question: "Какими службами доставки отправляется физический мерч?",
    answer: "В текущем каталоге нет физического мерча, поэтому службы доставки не используются. Все позиции относятся к цифровым товарам и локальным заказам в Coins.",
  },
  {
    id: "trade-url",
    group: "Steam",
    question: "Можно ли изменить адрес или Steam Trade URL после оплаты?",
    answer: "Trade URL можно изменить в разделе Steam до оформления заказа. Адрес доставки не запрашивается, потому что в текущем каталоге нет физического мерча.",
  },
  {
    id: "error",
    group: "Возвраты",
    question: "Что делать, если предмет не подошёл или произошёл сбой бота?",
    answer: "Реальная передача предметов пока не выполняется. Если проблема относится к сохранённому заказу, укажите его номер и отправьте описание на почту поддержки.",
  },
  {
    id: "refund",
    group: "Возвраты",
    question: "В течение какого срока можно оформить возврат?",
    answer: "Срок возврата нельзя подтвердить до утверждения юридических условий и подключения платежей. Сохраните номер заказа и запросите актуальные условия у поддержки до совершения внешнего платежа.",
  },
  {
    id: "refund-time",
    group: "Возвраты",
    question: "Как быстро деньги вернутся на карту после одобрения возврата?",
    answer: "Возврат на карту сейчас не выполняется, потому что платёжный провайдер не подключён. Срок будет опубликован вместе с рабочим способом оплаты и утверждённой политикой возврата.",
  },
  {
    id: "wrong-product",
    group: "Возвраты",
    question: "Что делать, если пришёл повреждённый или другой товар?",
    answer: "Сохраните номер заказа и описание несоответствия. Черновик обращения можно подготовить в личном кабинете, а отправить — на почту поддержки.",
  },
];

export const orderSteps = [
  "Выберите товар",
  "Проверьте данные",
  "Оплатите заказ Coins",
  "Получите цифровой товар",
] as const;
