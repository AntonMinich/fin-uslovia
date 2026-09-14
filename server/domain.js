import { monthlyPayment, nowIso } from "./db.js";

export const ADMIN_ROLES = ["admin", "superadmin"];
export const APPLY_MODES = ["apply_to_base", "apply_to_all", "change_program_only"];

export class DomainError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function formatRate(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

export function resolveAppliedRate(baseRate, individualRate) {
  if (individualRate == null) {
    return { rate: baseRate, source: "base", isIndividual: false };
  }
  return { rate: individualRate, source: "individual", isIndividual: true };
}

function actor(user) {
  return {
    user_id: user?.id ?? null,
    user_name: user?.name ?? "Система",
    user_role: user?.role ?? "system"
  };
}

export function writeHistory(db, user, payload) {
  db.prepare(
    `INSERT INTO change_history (
      created_at, user_id, user_name, user_role, action, program_id, program_name,
      term_months, old_value, new_value, apply_mode, partner_id, partner_name, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.created_at || nowIso(),
    actor(user).user_id,
    actor(user).user_name,
    actor(user).user_role,
    payload.action,
    payload.program_id ?? null,
    payload.program_name ?? null,
    payload.term_months ?? null,
    payload.old_value ?? null,
    payload.new_value ?? null,
    payload.apply_mode ?? null,
    payload.partner_id ?? null,
    payload.partner_name ?? null,
    payload.details ?? null
  );
}

export function getProgramCounts(db, programId) {
  const total = db
    .prepare("SELECT COUNT(*) AS n FROM program_assignments WHERE program_id = ?")
    .get(programId).n;
  const individualPartners = db
    .prepare(
      `SELECT COUNT(DISTINCT partner_id) AS n
       FROM individual_rates
       WHERE program_id = ?`
    )
    .get(programId).n;
  return {
    partnersTotal: total,
    partnersBase: total - individualPartners,
    partnersIndividual: individualPartners
  };
}

function mapProducts(db, programId) {
  return db
    .prepare(
      `SELECT p.id, p.code, p.name
       FROM program_products pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.program_id = ?
       ORDER BY p.id`
    )
    .all(programId);
}

function mapTerms(db, programId) {
  return db
    .prepare(
      `SELECT term_months AS termMonths, base_rate AS baseRate
       FROM program_terms
       WHERE program_id = ?
       ORDER BY term_months`
    )
    .all(programId);
}

export function serializeProgram(db, row) {
  const counts = getProgramCounts(db, row.id);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    statusLabel: row.status === "active" ? "Активна" : "Неактивна",
    products: mapProducts(db, row.id),
    terms: mapTerms(db, row.id),
    ...counts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listPrograms(db) {
  const rows = db.prepare("SELECT * FROM leasing_programs ORDER BY id").all();
  return rows.map((row) => serializeProgram(db, row));
}

export function getProgram(db, id) {
  const row = db.prepare("SELECT * FROM leasing_programs WHERE id = ?").get(id);
  if (!row) throw new DomainError(404, "not_found", "Программа не найдена");
  return serializeProgram(db, row);
}

function assertUniqueName(db, name, exceptId = null) {
  const row = exceptId
    ? db.prepare("SELECT id FROM leasing_programs WHERE name = ? AND id != ?").get(name, exceptId)
    : db.prepare("SELECT id FROM leasing_programs WHERE name = ?").get(name);
  if (row) throw new DomainError(400, "duplicate_name", "Название программы должно быть уникальным");
}

function normalizeTerms(terms) {
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new DomainError(400, "invalid_terms", "Добавьте хотя бы один срок");
  }
  const seen = new Set();
  return terms.map((item) => {
    const termMonths = Number(item.termMonths);
    const baseRate = Number(item.baseRate);
    if (!Number.isInteger(termMonths) || termMonths <= 0) {
      throw new DomainError(400, "invalid_term", "Срок должен быть положительным целым числом месяцев");
    }
    if (!Number.isFinite(baseRate) || baseRate < 0) {
      throw new DomainError(400, "invalid_rate", "Ставка должна быть неотрицательным числом");
    }
    if (seen.has(termMonths)) {
      throw new DomainError(400, "duplicate_term", "Один и тот же срок нельзя добавить дважды");
    }
    seen.add(termMonths);
    return { termMonths, baseRate };
  });
}

function normalizeProductIds(db, productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new DomainError(400, "invalid_products", "Выберите хотя бы один продукт");
  }
  const unique = [...new Set(productIds.map(Number))];
  const found = db
    .prepare(`SELECT id FROM products WHERE id IN (${unique.map(() => "?").join(",")})`)
    .all(...unique);
  if (found.length !== unique.length) {
    throw new DomainError(400, "invalid_products", "Указан неизвестный продукт");
  }
  return unique;
}

export function createProgram(db, user, { name, productIds, terms }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new DomainError(400, "required_name", "Наименование обязательно");
  assertUniqueName(db, trimmed);
  const products = normalizeProductIds(db, productIds);
  const normalizedTerms = normalizeTerms(terms);
  const ts = nowIso();

  const result = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO leasing_programs (name, status, created_at, updated_at) VALUES (?, 'active', ?, ?)"
      )
      .run(trimmed, ts, ts);
    const id = info.lastInsertRowid;
    const insertProduct = db.prepare("INSERT INTO program_products (program_id, product_id) VALUES (?, ?)");
    for (const productId of products) insertProduct.run(id, productId);
    const insertTerm = db.prepare(
      "INSERT INTO program_terms (program_id, term_months, base_rate) VALUES (?, ?, ?)"
    );
    for (const term of normalizedTerms) insertTerm.run(id, term.termMonths, term.baseRate);
    writeHistory(db, user, {
      action: "create_program",
      program_id: id,
      program_name: trimmed,
      details: "Программа создана со статусом «Активна»"
    });
    return id;
  })();

  return getProgram(db, result);
}

export function previewTermChanges(db, programId, nextTerms) {
  const current = mapTerms(db, programId);
  const currentMap = new Map(current.map((item) => [item.termMonths, item.baseRate]));
  const next = normalizeTerms(nextTerms);
  const changes = [];
  for (const term of next) {
    if (currentMap.has(term.termMonths) && currentMap.get(term.termMonths) !== term.baseRate) {
      const individualForTerm = db
        .prepare(
          "SELECT COUNT(DISTINCT partner_id) AS n FROM individual_rates WHERE program_id = ? AND term_months = ?"
        )
        .get(programId, term.termMonths).n;
      const counts = getProgramCounts(db, programId);
      changes.push({
        termMonths: term.termMonths,
        oldRate: currentMap.get(term.termMonths),
        newRate: term.baseRate,
        partnersBase: counts.partnersTotal - individualForTerm,
        partnersIndividual: individualForTerm
      });
    }
  }
  return { changes, counts: getProgramCounts(db, programId) };
}

export function updateProgram(db, user, programId, payload) {
  const program = getProgram(db, programId);
  const name = payload.name != null ? String(payload.name).trim() : program.name;
  if (!name) throw new DomainError(400, "required_name", "Наименование обязательно");
  assertUniqueName(db, name, programId);

  const productIds = payload.productIds
    ? normalizeProductIds(db, payload.productIds)
    : program.products.map((item) => item.id);
  const nextTerms = payload.terms ? normalizeTerms(payload.terms) : program.terms;
  const preview = previewTermChanges(db, programId, nextTerms);
  const productsChanged =
    productIds.slice().sort().join(",") !==
    program.products
      .map((item) => item.id)
      .slice()
      .sort()
      .join(",");

  if (preview.changes.length > 0 && program.partnersTotal > 0 && !payload.applyMode) {
    throw new DomainError(409, "apply_mode_required", "Выберите способ применения новой ставки", preview);
  }
  if (preview.changes.length > 0 && payload.applyMode && !APPLY_MODES.includes(payload.applyMode)) {
    throw new DomainError(400, "invalid_apply_mode", "Неизвестный способ применения");
  }
  if (payload.applyMode === "apply_to_all" && !payload.confirmApplyToAll) {
    throw new DomainError(409, "confirm_apply_to_all", "Требуется дополнительное подтверждение", preview);
  }
  if (productsChanged && program.partnersTotal > 0 && !payload.confirmProductChange) {
    throw new DomainError(409, "confirm_product_change", "Программа уже назначена партнёрам. Подтвердите изменение продуктов", {
      partnersTotal: program.partnersTotal,
      currentProducts: program.products.map((item) => item.name),
      nextProductIds: productIds
    });
  }

  const applyMode = payload.applyMode || "change_program_only";

  db.transaction(() => {
    db.prepare("UPDATE leasing_programs SET name = ?, updated_at = ? WHERE id = ?").run(
      name,
      nowIso(),
      programId
    );
    db.prepare("DELETE FROM program_products WHERE program_id = ?").run(programId);
    const insertProduct = db.prepare("INSERT INTO program_products (program_id, product_id) VALUES (?, ?)");
    for (const productId of productIds) insertProduct.run(programId, productId);

    const currentMap = new Map(program.terms.map((item) => [item.termMonths, item.baseRate]));
    db.prepare("DELETE FROM program_terms WHERE program_id = ?").run(programId);
    const insertTerm = db.prepare(
      "INSERT INTO program_terms (program_id, term_months, base_rate) VALUES (?, ?, ?)"
    );
    for (const term of nextTerms) insertTerm.run(programId, term.termMonths, term.baseRate);

    for (const change of preview.changes) {
      if (applyMode === "apply_to_all") {
        db.prepare("DELETE FROM individual_rates WHERE program_id = ? AND term_months = ?").run(
          programId,
          change.termMonths
        );
      }
      writeHistory(db, user, {
        action: "change_base_rate",
        program_id: programId,
        program_name: name,
        term_months: change.termMonths,
        old_value: String(change.oldRate),
        new_value: String(change.newRate),
        apply_mode: applyMode,
        details:
          applyMode === "apply_to_all"
            ? "Новая базовая ставка применена ко всем партнёрам, индивидуальные ставки по сроку заменены"
            : applyMode === "apply_to_base"
              ? "Новая ставка применяется партнёрам с базовыми условиями; индивидуальные сохранены"
              : "Изменена только базовая программа; индивидуальные условия сохранены"
      });
    }

    const removedTerms = [...currentMap.keys()].filter(
      (term) => !nextTerms.some((item) => item.termMonths === term)
    );
    for (const term of removedTerms) {
      db.prepare("DELETE FROM individual_rates WHERE program_id = ? AND term_months = ?").run(
        programId,
        term
      );
    }

    if (name !== program.name) {
      writeHistory(db, user, {
        action: "rename_program",
        program_id: programId,
        program_name: name,
        old_value: program.name,
        new_value: name
      });
    }
    if (productsChanged) {
      writeHistory(db, user, {
        action: "change_products",
        program_id: programId,
        program_name: name,
        old_value: program.products.map((item) => item.name).join(", "),
        new_value: db
          .prepare(
            `SELECT name FROM products WHERE id IN (${productIds.map(() => "?").join(",")}) ORDER BY id`
          )
          .all(...productIds)
          .map((item) => item.name)
          .join(", "),
        details: `Программа назначена ${program.partnersTotal} партнёрам`
      });
    }
  })();

  return getProgram(db, programId);
}

export function setProgramStatus(db, user, programId, status) {
  const program = getProgram(db, programId);
  if (status !== "active" && status !== "inactive") {
    throw new DomainError(400, "invalid_status", "Некорректный статус");
  }
  if (program.status === status) return program;
  db.prepare("UPDATE leasing_programs SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    nowIso(),
    programId
  );
  writeHistory(db, user, {
    action: status === "inactive" ? "deactivate_program" : "activate_program",
    program_id: programId,
    program_name: program.name,
    old_value: program.status,
    new_value: status
  });
  return getProgram(db, programId);
}

export function assignProgram(db, user, programId, { mode, partnerIds }) {
  const program = getProgram(db, programId);
  let ids;
  if (mode === "all") {
    ids = db.prepare("SELECT id FROM partners").all().map((row) => row.id);
  } else if (mode === "selected") {
    if (!Array.isArray(partnerIds) || partnerIds.length === 0) {
      throw new DomainError(400, "partners_required", "Выберите хотя бы одного партнёра");
    }
    ids = [...new Set(partnerIds.map(Number))];
  } else {
    throw new DomainError(400, "invalid_assign_mode", "Выберите способ назначения");
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO program_assignments (program_id, partner_id, assigned_at) VALUES (?, ?, ?)"
  );
  const ts = nowIso();
  db.transaction(() => {
    for (const partnerId of ids) insert.run(programId, partnerId, ts);
    writeHistory(db, user, {
      action: mode === "all" ? "assign_all_partners" : "assign_selected_partners",
      program_id: programId,
      program_name: program.name,
      details: `Назначено партнёров: ${ids.length}. Копия программы не создавалась.`
    });
  })();
  return getProgram(db, programId);
}

export function searchPartners(db, { q = "", page = 1, limit = 10, excludeAssignedTo } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const query = `%${String(q).trim()}%`;
  let where = "WHERE name LIKE ?";
  const params = [query];
  if (excludeAssignedTo) {
    where +=
      " AND id NOT IN (SELECT partner_id FROM program_assignments WHERE program_id = ?)";
    params.push(Number(excludeAssignedTo));
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM partners ${where}`).get(...params).n;
  const items = db
    .prepare(`SELECT id, name FROM partners ${where} ORDER BY name LIMIT ? OFFSET ?`)
    .all(...params, safeLimit, offset);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) || 1 };
}

export function listProgramPartners(db, programId, { q = "", filter = "all", page = 1, limit = 10 } = {}) {
  getProgram(db, programId);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const query = `%${String(q).trim()}%`;

  let having = "";
  if (filter === "base") having = "HAVING COUNT(ir.term_months) = 0";
  if (filter === "individual") having = "HAVING COUNT(ir.term_months) > 0";

  const baseSelect = `
    FROM program_assignments pa
    JOIN partners p ON p.id = pa.partner_id
    LEFT JOIN individual_rates ir
      ON ir.program_id = pa.program_id AND ir.partner_id = pa.partner_id
    WHERE pa.program_id = ? AND p.name LIKE ?
    GROUP BY p.id, p.name
    ${having}
  `;
  const rows = db
    .prepare(
      `SELECT p.id, p.name,
              COUNT(ir.term_months) AS individual_changes
       ${baseSelect}
       ORDER BY p.name
       LIMIT ? OFFSET ?`
    )
    .all(programId, query, safeLimit, offset);
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM (SELECT p.id ${baseSelect})`)
    .get(programId, query).n;

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      conditionType: row.individual_changes > 0 ? "individual" : "base",
      conditionLabel: row.individual_changes > 0 ? "Индивидуальные" : "Базовые",
      individualChanges: row.individual_changes
    })),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit) || 1,
    counts: getProgramCounts(db, programId)
  };
}

export function getPartner(db, partnerId) {
  const row = db.prepare("SELECT id, name FROM partners WHERE id = ?").get(partnerId);
  if (!row) throw new DomainError(404, "not_found", "Партнёр не найден");
  return row;
}

export function listPartnerPrograms(db, partnerId) {
  const partner = getPartner(db, partnerId);
  const programs = db
    .prepare(
      `SELECT lp.*
       FROM program_assignments pa
       JOIN leasing_programs lp ON lp.id = pa.program_id
       WHERE pa.partner_id = ?
       ORDER BY lp.id`
    )
    .all(partnerId)
    .map((row) => {
      const terms = mapTerms(db, row.id).map((term) => {
        const individual = db
          .prepare(
            "SELECT rate FROM individual_rates WHERE program_id = ? AND partner_id = ? AND term_months = ?"
          )
          .get(row.id, partnerId, term.termMonths);
        const applied = resolveAppliedRate(term.baseRate, individual?.rate ?? null);
        return {
          termMonths: term.termMonths,
          baseRate: term.baseRate,
          partnerRate: applied.rate,
          individualRate: individual?.rate ?? null,
          isIndividual: applied.isIndividual,
          source: applied.source
        };
      });
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        statusLabel: row.status === "active" ? "Активна" : "Неактивна",
        products: mapProducts(db, row.id),
        terms
      };
    });
  return { partner, programs };
}

export function setIndividualRates(db, user, partnerId, programId, rates) {
  const { partner, programs } = listPartnerPrograms(db, partnerId);
  const program = programs.find((item) => item.id === Number(programId));
  if (!program) throw new DomainError(400, "not_assigned", "Программа не назначена партнёру");
  if (!Array.isArray(rates)) throw new DomainError(400, "invalid_rates", "Передайте ставки");

  db.transaction(() => {
    for (const item of rates) {
      const termMonths = Number(item.termMonths);
      const term = program.terms.find((entry) => entry.termMonths === termMonths);
      if (!term) throw new DomainError(400, "unknown_term", "Срок отсутствует в программе");
      if (item.rate == null || item.rate === "") {
        db.prepare(
          "DELETE FROM individual_rates WHERE program_id = ? AND partner_id = ? AND term_months = ?"
        ).run(programId, partnerId, termMonths);
        if (term.isIndividual) {
          writeHistory(db, user, {
            action: "reset_individual_rate",
            program_id: programId,
            program_name: program.name,
            term_months: termMonths,
            old_value: String(term.individualRate),
            new_value: String(term.baseRate),
            partner_id: partnerId,
            partner_name: partner.name
          });
        }
        continue;
      }
      const rate = Number(item.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new DomainError(400, "invalid_rate", "Ставка должна быть неотрицательным числом");
      }
      db.prepare(
        `INSERT INTO individual_rates (program_id, partner_id, term_months, rate)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(program_id, partner_id, term_months) DO UPDATE SET rate = excluded.rate`
      ).run(programId, partnerId, termMonths, rate);
      writeHistory(db, user, {
        action: "set_individual_rate",
        program_id: programId,
        program_name: program.name,
        term_months: termMonths,
        old_value: String(term.baseRate),
        new_value: String(rate),
        partner_id: partnerId,
        partner_name: partner.name
      });
    }
  })();

  return listPartnerPrograms(db, partnerId);
}

export function resetIndividualRate(db, user, partnerId, programId, termMonths, confirm) {
  if (!confirm) {
    throw new DomainError(409, "confirm_reset", "Подтвердите сброс индивидуального условия");
  }
  return setIndividualRates(db, user, partnerId, programId, [{ termMonths, rate: null }]);
}

export function quoteForPartner(db, partnerId, { programId, productId, termMonths, amount }) {
  const { programs } = listPartnerPrograms(db, partnerId);
  const program = programs.find((item) => item.id === Number(programId));
  if (!program) throw new DomainError(400, "not_assigned", "Программа не назначена партнёру");
  if (program.status !== "active") {
    throw new DomainError(400, "inactive_program", "Неактивная программа не используется для новых заявок");
  }
  if (!program.products.some((item) => item.id === Number(productId))) {
    throw new DomainError(400, "product_mismatch", "Продукт не входит в программу");
  }
  const term = program.terms.find((item) => item.termMonths === Number(termMonths));
  if (!term) throw new DomainError(400, "unknown_term", "Срок отсутствует в программе");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new DomainError(400, "invalid_amount", "Укажите стоимость предмета лизинга");
  }
  const product = program.products.find((item) => item.id === Number(productId));
  const payment = monthlyPayment(numericAmount, term.termMonths, term.partnerRate);
  return {
    programId: program.id,
    programName: program.name,
    productId: product.id,
    productName: product.name,
    termMonths: term.termMonths,
    amount: numericAmount,
    baseRate: term.baseRate,
    individualRate: term.individualRate,
    appliedRate: term.partnerRate,
    rateSource: term.source,
    isIndividual: term.isIndividual,
    monthlyPayment: payment
  };
}

export function createApplication(db, user, partnerId, payload) {
  const quote = quoteForPartner(db, partnerId, payload);
  const snapshot = {
    programName: quote.programName,
    productName: quote.productName,
    termMonths: quote.termMonths,
    baseRate: quote.baseRate,
    individualRate: quote.individualRate,
    appliedRate: quote.appliedRate,
    rateSource: quote.rateSource,
    frozenAt: nowIso()
  };
  const info = db
    .prepare(
      `INSERT INTO applications (
        partner_id, program_id, program_name, product_id, product_name,
        term_months, amount, applied_rate, rate_source, monthly_payment,
        conditions_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      partnerId,
      quote.programId,
      quote.programName,
      quote.productId,
      quote.productName,
      quote.termMonths,
      quote.amount,
      quote.appliedRate,
      quote.rateSource,
      quote.monthlyPayment,
      JSON.stringify(snapshot),
      snapshot.frozenAt
    );
  writeHistory(db, user, {
    action: "create_application",
    program_id: quote.programId,
    program_name: quote.programName,
    term_months: quote.termMonths,
    new_value: String(quote.appliedRate),
    partner_id: partnerId,
    partner_name: getPartner(db, partnerId).name,
    details: `Заявка #${info.lastInsertRowid}, ставка зафиксирована`
  });
  return getApplication(db, info.lastInsertRowid);
}

export function getApplication(db, id) {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  if (!row) throw new DomainError(404, "not_found", "Заявка не найдена");
  return serializeApplication(db, row);
}

export function serializeApplication(db, row) {
  const partner = getPartner(db, row.partner_id);
  return {
    id: row.id,
    partner,
    programId: row.program_id,
    programName: row.program_name,
    productId: row.product_id,
    productName: row.product_name,
    termMonths: row.term_months,
    amount: row.amount,
    appliedRate: row.applied_rate,
    rateSource: row.rate_source,
    monthlyPayment: row.monthly_payment,
    conditionsSnapshot: JSON.parse(row.conditions_snapshot),
    createdAt: row.created_at
  };
}

export function listApplications(db, { partnerId } = {}) {
  const rows = partnerId
    ? db.prepare("SELECT * FROM applications WHERE partner_id = ? ORDER BY id DESC").all(partnerId)
    : db.prepare("SELECT * FROM applications ORDER BY id DESC").all();
  return rows.map((row) => serializeApplication(db, row));
}

export function listHistory(db, { programId, partnerId, page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const clauses = [];
  const params = [];
  if (programId) {
    clauses.push("program_id = ?");
    params.push(Number(programId));
  }
  if (partnerId) {
    clauses.push("partner_id = ?");
    params.push(Number(partnerId));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM change_history ${where}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT * FROM change_history ${where} ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, safeLimit, offset);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) || 1 };
}

export function listProducts(db) {
  return db.prepare("SELECT id, code, name FROM products ORDER BY id").all();
}
