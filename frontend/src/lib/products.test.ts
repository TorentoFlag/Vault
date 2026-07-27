import assert from "node:assert/strict";
import test from "node:test";

import { catalogProducts } from "../data/products.ts";
import { getProductBySlug, getRelatedProducts } from "./products.ts";

test("каждый товар содержит структурированные характеристики и условия получения", () => {
  assert.ok(catalogProducts.length > 0);

  for (const product of catalogProducts) {
    assert.ok(product.details.specifications.length >= 3, product.id);
    assert.ok(product.details.specifications.every(({ label, value }) => (
      label.trim().length > 0 && value.trim().length > 0
    )), product.id);
    assert.ok(product.details.fulfillment.title.trim().length > 0, product.id);
    assert.ok(product.details.fulfillment.description.trim().length > 0, product.id);
    assert.ok(product.details.fulfillment.requirements.length > 0, product.id);
    assert.ok(product.details.fulfillment.requirements.every((requirement) => (
      requirement.trim().length > 0
    )), product.id);
  }
});

test("каждый товар содержит развёрнутое описание для страницы товара", () => {
  for (const product of catalogProducts) {
    assert.ok(product.description.trim().length >= 80, product.id);
  }
});

test("slug всех товаров уникальны", () => {
  const slugs = catalogProducts.map((product) => product.slug);

  assert.equal(new Set(slugs).size, slugs.length);
});

test("условия получения согласованы со способом выдачи товара", () => {
  const skin = catalogProducts.find((product) => product.id === "ak-redline");
  const steam = catalogProducts.find((product) => product.id === "steam-top-up-500");
  const gpt = catalogProducts.find((product) => product.id === "gpt-plus");

  assert.ok(skin && steam && gpt);
  assert.equal(skin.details.fulfillment.title, "Данные Steam Trade");
  assert.ok(skin.details.fulfillment.requirements.some((item) => item.includes("Trade URL")));
  assert.equal(steam.details.fulfillment.title, "Данные пополнения Steam");
  assert.ok(steam.details.fulfillment.requirements.some((item) => item.includes("Steam")));
  assert.equal(gpt.details.fulfillment.title, "Данные цифрового заказа");
  assert.ok(gpt.details.fulfillment.requirements.some((item) => item.includes("Email")));
});

test("товар находится по точному slug", () => {
  const product = getProductBySlug(catalogProducts, "ak-47-redline");

  assert.equal(product?.id, "ak-redline");
});

test("неизвестный и пустой slug не возвращают товар", () => {
  assert.equal(getProductBySlug(catalogProducts, "unknown-product"), undefined);
  assert.equal(getProductBySlug(catalogProducts, ""), undefined);
});

test("похожие товары имеют тот же вид, исключают текущий и соблюдают лимит", () => {
  const current = catalogProducts.find((product) => product.id === "ak-redline");
  assert.ok(current);

  const related = getRelatedProducts(catalogProducts, current, 2);

  assert.equal(related.length, 2);
  assert.ok(related.every((product) => product.kind === current.kind));
  assert.ok(related.every((product) => product.id !== current.id));
});

test("похожие товары сортируются детерминированно и не меняют исходный массив", () => {
  const current = catalogProducts.find((product) => product.id === "ak-redline");
  assert.ok(current);
  const products = [...catalogProducts].reverse();
  const originalOrder = products.map((product) => product.id);

  const related = getRelatedProducts(products, current, 4);
  const canonicalRelated = getRelatedProducts(catalogProducts, current, 4);

  assert.deepEqual(
    related.map((product) => product.id),
    canonicalRelated.map((product) => product.id),
  );
  assert.deepEqual(products.map((product) => product.id), originalOrder);
});

test("нулевой или отрицательный лимит возвращает пустой список похожих товаров", () => {
  const current = catalogProducts[0];

  assert.deepEqual(getRelatedProducts(catalogProducts, current, 0), []);
  assert.deepEqual(getRelatedProducts(catalogProducts, current, -1), []);
});
