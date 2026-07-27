import assert from "node:assert/strict";
import test from "node:test";

import { validateFulfillmentInput } from "./fulfillment.ts";

test("Steam top-up requires a recipient login and GPT requires a recipient email", () => {
  assert.deepEqual(validateFulfillmentInput(["steam"], { steamLogin: "", gptEmail: "" }), { steamLogin: "Укажите логин Steam." });
  assert.deepEqual(validateFulfillmentInput(["gpt"], { steamLogin: "", gptEmail: "bad" }), { gptEmail: "Введите email в формате name@example.com." });
  assert.deepEqual(validateFulfillmentInput(["steam", "gpt"], { steamLogin: "vault_player", gptEmail: "user@example.com" }), {});
});
