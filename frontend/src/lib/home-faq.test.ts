import assert from "node:assert/strict";
import test from "node:test";

import { categories, faqItems } from "../data/home.ts";

test("FAQ покрывает оплату, курс Coins, Steam Trade, доставку и возвраты", () => {
  const questions = faqItems.map((item) => item.question.toLocaleLowerCase("ru-RU"));
  for (const phrase of [
    "картой",
    "сбп",
    "чек",
    "списались",
    "конвертация",
    "трейд-боты",
    "сколько времени",
    "статус посылки",
    "trade url",
    "не подошёл",
    "срока",
    "вернутся",
    "повреждённый",
  ]) {
    assert.ok(questions.some((question) => question.includes(phrase)), phrase);
  }
});

test("FAQ explicitly says that physical merchandise has no shipping services", () => {
  const shipping = faqItems.find((item) => /служб.*достав/i.test(`${item.question} ${item.answer}`));
  assert.ok(shipping);
  assert.match(shipping.answer, /нет физического мерча/i);
  assert.match(shipping.answer, /служб.*доставк.*не использ/i);
});

test("карточки категорий открывают каталог с выбранным фильтром", () => {
  assert.equal(categories.find((category) => category.id === "skins")?.href, "/catalog?category=skins");
  assert.equal(categories.find((category) => category.id === "gpt")?.href, "/catalog?category=gpt");
});
