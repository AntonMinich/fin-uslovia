import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, seedDatabase } from "./db.js";
import {
  DomainError,
  createApplication,
  createProgram,
  getProgram,
  listPartnerPrograms,
  listProgramPartners,
  quoteForPartner,
  resolveAppliedRate,
  setIndividualRates,
  setProgramStatus,
  updateProgram,
  assignProgram
} from "./domain.js";

function setup() {
  const db = createDatabase(":memory:");
  seedDatabase(db);
  const admin = { id: 1, name: "Иванова И.И.", role: "admin" };
  return { db, admin };
}

test("индивидуальная ставка имеет приоритет над базовой", () => {
  assert.deepEqual(resolveAppliedRate(2.99, 2.49), {
    rate: 2.49,
    source: "individual",
    isIndividual: true
  });
  assert.deepEqual(resolveAppliedRate(2.99, null), {
    rate: 2.99,
    source: "base",
    isIndividual: false
  });
});

test("сид переносит условия финансирования в лизинговые программы", () => {
  const { db } = setup();
  const items = db.prepare("SELECT name, status FROM leasing_programs ORDER BY id").all();
  assert.equal(items[0].name, "Лизинг_Базовый");
  assert.equal(items[1].name, "Лизинг_ТС_ЭЛЕКТРО/МЕБЕЛЬ_SALE");
  const base = getProgram(db, 1);
  assert.equal(base.partnersTotal, 40);
  assert.equal(base.partnersIndividual, 8);
  assert.equal(base.partnersBase, 32);
  assert.deepEqual(
    base.products.map((item) => item.name),
    ["Транспортные средства"]
  );
});

test("создание программы требует уникальное имя и уникальные сроки", () => {
  const { db, admin } = setup();
  assert.throws(
    () =>
      createProgram(db, admin, {
        name: "Лизинг_Базовый",
        productIds: [1],
        terms: [{ termMonths: 12, baseRate: 1 }]
      }),
    (err) => err instanceof DomainError && err.code === "duplicate_name"
  );
  assert.throws(
    () =>
      createProgram(db, admin, {
        name: "Новая",
        productIds: [1],
        terms: [
          { termMonths: 12, baseRate: 1 },
          { termMonths: 12, baseRate: 2 }
        ]
      }),
    (err) => err instanceof DomainError && err.code === "duplicate_term"
  );
  const created = createProgram(db, admin, {
    name: "Лизинг_Экспресс",
    productIds: [2, 3],
    terms: [
      { termMonths: 12, baseRate: 1.1 },
      { termMonths: 24, baseRate: 1.9 }
    ]
  });
  assert.equal(created.status, "active");
  assert.equal(created.products.length, 2);
});

test("назначение всем партнёрам не копирует программу", () => {
  const { db, admin } = setup();
  const created = createProgram(db, admin, {
    name: "Лизинг_Новый",
    productIds: [1],
    terms: [{ termMonths: 12, baseRate: 2 }]
  });
  assignProgram(db, admin, created.id, { mode: "all" });
  const programCount = db.prepare("SELECT COUNT(*) AS n FROM leasing_programs WHERE name = 'Лизинг_Новый'").get().n;
  const assigned = db.prepare("SELECT COUNT(*) AS n FROM program_assignments WHERE program_id = ?").get(created.id).n;
  assert.equal(programCount, 1);
  assert.equal(assigned, 40);
});

test("применяемая ставка партнёра берётся из индивидуального условия", () => {
  const { db } = setup();
  const { programs } = listPartnerPrograms(db, 1);
  const base = programs.find((item) => item.name === "Лизинг_Базовый");
  const term24 = base.terms.find((item) => item.termMonths === 24);
  assert.equal(term24.baseRate, 2.99);
  assert.equal(term24.partnerRate, 2.49);
  assert.equal(term24.isIndividual, true);

  const without = listPartnerPrograms(db, 20);
  const other = without.programs.find((item) => item.name === "Лизинг_Базовый");
  const other24 = other.terms.find((item) => item.termMonths === 24);
  assert.equal(other24.partnerRate, 2.99);
  assert.equal(other24.isIndividual, false);
});

test("изменение базовой ставки по умолчанию не трогает индивидуальные", () => {
  const { db, admin } = setup();
  updateProgram(db, admin, 1, {
    terms: [
      { termMonths: 12, baseRate: 1.99 },
      { termMonths: 18, baseRate: 2.49 },
      { termMonths: 24, baseRate: 2.79 },
      { termMonths: 36, baseRate: 2.99 },
      { termMonths: 48, baseRate: 2.99 }
    ],
    applyMode: "apply_to_base"
  });
  const program = getProgram(db, 1);
  assert.equal(program.terms.find((item) => item.termMonths === 24).baseRate, 2.79);
  const partnerA = listPartnerPrograms(db, 1).programs[0].terms.find((item) => item.termMonths === 24);
  assert.equal(partnerA.partnerRate, 2.49);
  const partnerBase = listPartnerPrograms(db, 20).programs[0].terms.find((item) => item.termMonths === 24);
  assert.equal(partnerBase.partnerRate, 2.79);
});

test("применение ко всем заменяет индивидуальные ставки по сроку", () => {
  const { db, admin } = setup();
  assert.throws(
    () =>
      updateProgram(db, admin, 1, {
        terms: [
          { termMonths: 12, baseRate: 1.99 },
          { termMonths: 18, baseRate: 2.49 },
          { termMonths: 24, baseRate: 2.79 },
          { termMonths: 36, baseRate: 2.99 },
          { termMonths: 48, baseRate: 2.99 }
        ],
        applyMode: "apply_to_all"
      }),
    (err) => err instanceof DomainError && err.code === "confirm_apply_to_all"
  );

  updateProgram(db, admin, 1, {
    terms: [
      { termMonths: 12, baseRate: 1.99 },
      { termMonths: 18, baseRate: 2.49 },
      { termMonths: 24, baseRate: 2.79 },
      { termMonths: 36, baseRate: 2.99 },
      { termMonths: 48, baseRate: 2.99 }
    ],
    applyMode: "apply_to_all",
    confirmApplyToAll: true
  });
  const partnerA = listPartnerPrograms(db, 1).programs[0].terms.find((item) => item.termMonths === 24);
  assert.equal(partnerA.partnerRate, 2.79);
  assert.equal(partnerA.isIndividual, false);
});

test("сброс индивидуального условия возвращает базовую ставку", () => {
  const { db, admin } = setup();
  setIndividualRates(db, admin, 1, 1, [{ termMonths: 24, rate: null }]);
  const term = listPartnerPrograms(db, 1).programs[0].terms.find((item) => item.termMonths === 24);
  assert.equal(term.partnerRate, 2.99);
  assert.equal(term.isIndividual, false);
});

test("неактивная программа не используется в калькуляторе, а заявка хранит снимок", () => {
  const { db, admin } = setup();
  const application = createApplication(db, { id: 3, name: "Козлов А.В.", role: "partner" }, 3, {
    programId: 1,
    productId: 1,
    termMonths: 24,
    amount: 10000
  });
  assert.equal(application.appliedRate, 2.49);
  const frozen = application.conditionsSnapshot.appliedRate;

  updateProgram(db, admin, 1, {
    terms: [
      { termMonths: 12, baseRate: 1.99 },
      { termMonths: 18, baseRate: 2.49 },
      { termMonths: 24, baseRate: 5.55 },
      { termMonths: 36, baseRate: 2.99 },
      { termMonths: 48, baseRate: 2.99 }
    ],
    applyMode: "apply_to_all",
    confirmApplyToAll: true
  });
  const stored = db.prepare("SELECT conditions_snapshot FROM applications WHERE id = ?").get(application.id);
  assert.equal(JSON.parse(stored.conditions_snapshot).appliedRate, frozen);

  setProgramStatus(db, admin, 1, "inactive");
  assert.throws(
    () =>
      quoteForPartner(db, 20, {
        programId: 1,
        productId: 1,
        termMonths: 12,
        amount: 10000
      }),
    (err) => err instanceof DomainError && err.code === "inactive_program"
  );
});

test("список партнёров программы фильтруется и не выгружает всех сразу", () => {
  const { db } = setup();
  const page = listProgramPartners(db, 1, { filter: "individual", page: 1, limit: 5 });
  assert.equal(page.items.length, 5);
  assert.equal(page.total, 8);
  assert.ok(page.items.every((item) => item.conditionType === "individual"));
});
