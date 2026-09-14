import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createDatabase, seedDatabase } from "./db.js";
import { createApp } from "./index.js";

async function withServer(fn) {
  const db = createDatabase(":memory:");
  seedDatabase(db);
  const app = createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function login(base, email, password = "demo123") {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

test("менеджер не получает доступ к API лизинговых программ", async () => {
  await withServer(async (base) => {
    const { token } = await login(base, "manager@fincode.local");
    const denied = await fetch(`${base}/api/programs`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(denied.status, 403);
  });
});

test("администратор и суперадминистратор имеют доступ к разделу", async () => {
  await withServer(async (base) => {
    for (const email of ["ivanova@fincode.local", "petrov@fincode.local"]) {
      const { token } = await login(base, email);
      const res = await fetch(`${base}/api/programs`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.items.some((item) => item.name === "Лизинг_Базовый"));
    }
  });
});

test("партнёр не может менять ставку через API, калькулятор берёт применяемую", async () => {
  await withServer(async (base) => {
    const { token } = await login(base, "kozlov@fincode.local");
    const patch = await fetch(`${base}/api/partners/3/programs/1/rates`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ rates: [{ termMonths: 24, rate: 0.01 }] })
    });
    assert.equal(patch.status, 403);

    const quote = await fetch(`${base}/api/calculator/quote`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ programId: 1, productId: 1, termMonths: 24, amount: 20000 })
    });
    assert.equal(quote.status, 200);
    const body = await quote.json();
    assert.equal(body.appliedRate, 2.49);
    assert.equal(body.rateSource, "individual");
  });
});
