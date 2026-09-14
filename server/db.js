import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_DB_PATH = path.join(DATA_DIR, "app.db");

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin', 'partner', 'manager')),
  partner_id INTEGER,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS leasing_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_products (
  program_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY (program_id, product_id),
  FOREIGN KEY (program_id) REFERENCES leasing_programs(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS program_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  term_months INTEGER NOT NULL,
  base_rate REAL NOT NULL,
  UNIQUE (program_id, term_months),
  FOREIGN KEY (program_id) REFERENCES leasing_programs(id)
);

CREATE TABLE IF NOT EXISTS program_assignments (
  program_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (program_id, partner_id),
  FOREIGN KEY (program_id) REFERENCES leasing_programs(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS individual_rates (
  program_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL,
  term_months INTEGER NOT NULL,
  rate REAL NOT NULL,
  PRIMARY KEY (program_id, partner_id, term_months),
  FOREIGN KEY (program_id) REFERENCES leasing_programs(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  program_id INTEGER NOT NULL,
  program_name TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  amount REAL NOT NULL,
  applied_rate REAL NOT NULL,
  rate_source TEXT NOT NULL,
  monthly_payment REAL NOT NULL,
  conditions_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (program_id) REFERENCES leasing_programs(id)
);

CREATE TABLE IF NOT EXISTS change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  program_id INTEGER,
  program_name TEXT,
  term_months INTEGER,
  old_value TEXT,
  new_value TEXT,
  apply_mode TEXT,
  partner_id INTEGER,
  partner_name TEXT,
  details TEXT
);
`;

const PARTNER_NAMES = [
  "ООО «АвтоМир»",
  "ООО «ТехноСклад»",
  "ИП Козлов А.В.",
  "ООО «МебельПро»",
  "ООО «ВостокЛизинг»",
  "ООО «СитиАвто»",
  "ООО «НордТрейд»",
  "ИП Савельева М.И.",
  "ООО «БелЭлектро»",
  "ООО «ГрандМоторс»",
  "ООО «Партнёр Плюс»",
  "ООО «АльфаТех»",
  "ООО «Дом и Офис»",
  "ООО «Максимум»",
  "ООО «АвтоЛига»",
  "ИП Петровский Н.С.",
  "ООО «Ритм»",
  "ООО «ЭкоТранс»",
  "ООО «Форвард»",
  "ООО «СмартЛизинг»",
  "ООО «Вектор»",
  "ООО «ЮнионАвто»",
  "ООО «ПрофиСнаб»",
  "ООО «Капитал ТС»",
  "ООО «Линия»",
  "ООО «Орион»",
  "ИП Григорьев Д.А.",
  "ООО «БизнесДрайв»",
  "ООО «Старт»",
  "ООО «Импульс»",
  "ООО «Авантаж»",
  "ООО «МоторХаус»",
  "ООО «ТехноПарк»",
  "ООО «Престиж»",
  "ООО «СервисГрупп»",
  "ООО «Навигатор»",
  "ООО «Континент»",
  "ООО «Атлант»",
  "ООО «Экспресс»",
  "ООО «ЛидерАвто»"
];

export function nowIso() {
  return new Date().toISOString();
}

export function createDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function seedDatabase(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM leasing_programs").get().n;
  if (count > 0) return;

  const password = bcrypt.hashSync("demo123", 8);
  const createdAt = "2026-08-01T09:00:00.000Z";

  const insertProduct = db.prepare("INSERT INTO products (code, name) VALUES (?, ?)");
  const vehicles = insertProduct.run("TS", "Транспортные средства").lastInsertRowid;
  const electronics = insertProduct.run("ELECTRO", "Электроника").lastInsertRowid;
  const furniture = insertProduct.run("FURNITURE", "Мебель").lastInsertRowid;

  const insertPartner = db.prepare("INSERT INTO partners (name) VALUES (?)");
  const partnerIds = PARTNER_NAMES.map((name) => insertPartner.run(name).lastInsertRowid);

  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash, name, role, partner_id) VALUES (?, ?, ?, ?, ?)"
  );
  insertUser.run("ivanova@fincode.local", password, "Иванова И.И.", "admin", null);
  insertUser.run("petrov@fincode.local", password, "Петров П.П.", "superadmin", null);
  insertUser.run("kozlov@fincode.local", password, "Козлов А.В.", "partner", partnerIds[2]);
  insertUser.run("manager@fincode.local", password, "Сидорова Е.Н.", "manager", null);

  const insertProgram = db.prepare(
    "INSERT INTO leasing_programs (name, status, created_at, updated_at) VALUES (?, ?, ?, ?)"
  );
  const baseProgramId = insertProgram.run("Лизинг_Базовый", "active", createdAt, createdAt).lastInsertRowid;
  const saleProgramId = insertProgram.run(
    "Лизинг_ТС_ЭЛЕКТРО/МЕБЕЛЬ_SALE",
    "active",
    createdAt,
    createdAt
  ).lastInsertRowid;
  const archiveProgramId = insertProgram.run(
    "Лизинг_Архив_2025",
    "inactive",
    createdAt,
    createdAt
  ).lastInsertRowid;

  const insertProgramProduct = db.prepare(
    "INSERT INTO program_products (program_id, product_id) VALUES (?, ?)"
  );
  insertProgramProduct.run(baseProgramId, vehicles);
  insertProgramProduct.run(saleProgramId, vehicles);
  insertProgramProduct.run(saleProgramId, electronics);
  insertProgramProduct.run(saleProgramId, furniture);
  insertProgramProduct.run(archiveProgramId, vehicles);

  const insertTerm = db.prepare(
    "INSERT INTO program_terms (program_id, term_months, base_rate) VALUES (?, ?, ?)"
  );
  const baseTerms = [
    [12, 1.99],
    [18, 2.49],
    [24, 2.99],
    [36, 2.99],
    [48, 2.99]
  ];
  for (const [term, rate] of baseTerms) insertTerm.run(baseProgramId, term, rate);
  for (const [term, rate] of [
    [12, 0.99],
    [18, 1.49],
    [24, 1.99],
    [36, 2.29]
  ]) {
    insertTerm.run(saleProgramId, term, rate);
  }
  insertTerm.run(archiveProgramId, 12, 3.49);
  insertTerm.run(archiveProgramId, 24, 3.99);

  const assign = db.prepare(
    "INSERT INTO program_assignments (program_id, partner_id, assigned_at) VALUES (?, ?, ?)"
  );
  for (const id of partnerIds) assign.run(baseProgramId, id, createdAt);
  for (const id of partnerIds.slice(0, 15)) assign.run(saleProgramId, id, createdAt);
  assign.run(archiveProgramId, partnerIds[0], createdAt);

  const insertIndividual = db.prepare(
    "INSERT INTO individual_rates (program_id, partner_id, term_months, rate) VALUES (?, ?, ?, ?)"
  );
  const individualPartners = partnerIds.slice(0, 8);
  for (const partnerId of individualPartners) {
    insertIndividual.run(baseProgramId, partnerId, 24, 2.49);
  }
  insertIndividual.run(baseProgramId, partnerIds[1], 36, 2.79);
  insertIndividual.run(baseProgramId, partnerIds[1], 48, 2.79);
  for (const partnerId of partnerIds.slice(0, 15)) {
    insertIndividual.run(saleProgramId, partnerId, 12, 0.79);
  }

  db.prepare(
    `INSERT INTO applications (
      partner_id, program_id, program_name, product_id, product_name,
      term_months, amount, applied_rate, rate_source, monthly_payment,
      conditions_snapshot, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    partnerIds[2],
    baseProgramId,
    "Лизинг_Базовый",
    vehicles,
    "Транспортные средства",
    24,
    45000,
    2.49,
    "individual",
    monthlyPayment(45000, 24, 2.49),
    JSON.stringify({
      programName: "Лизинг_Базовый",
      termMonths: 24,
      baseRate: 2.99,
      individualRate: 2.49,
      appliedRate: 2.49,
      frozenAt: "2026-08-15T11:20:00.000Z"
    }),
    "2026-08-15T11:20:00.000Z"
  );

  const insertHistory = db.prepare(
    `INSERT INTO change_history (
      created_at, user_id, user_name, user_role, action, program_id, program_name,
      term_months, old_value, new_value, apply_mode, partner_id, partner_name, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertHistory.run(
    "2026-08-01T09:05:00.000Z",
    1,
    "Иванова И.И.",
    "admin",
    "create_program",
    baseProgramId,
    "Лизинг_Базовый",
    null,
    null,
    null,
    null,
    null,
    null,
    "Программа перенесена из раздела «Условия финансирования»"
  );
  insertHistory.run(
    "2026-08-20T14:35:00.000Z",
    1,
    "Иванова И.И.",
    "admin",
    "set_individual_rate",
    baseProgramId,
    "Лизинг_Базовый",
    24,
    "2.99",
    "2.49",
    null,
    partnerIds[2],
    "ИП Козлов А.В.",
    "Индивидуальная ставка партнёра"
  );
}

export function monthlyPayment(amount, termMonths, monthlyRatePercent) {
  const body = amount / termMonths;
  const markup = amount * (monthlyRatePercent / 100);
  return Math.round((body + markup) * 100) / 100;
}

export function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  const db = createDatabase(dbPath);
  seedDatabase(db);
  return db;
}

export function resetDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:" && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = createDatabase(dbPath);
  seedDatabase(db);
  db.close();
}
