import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { openDatabase } from "./db.js";
import {
  ADMIN_ROLES,
  DomainError,
  assignProgram,
  createApplication,
  createProgram,
  getProgram,
  listApplications,
  listHistory,
  listPartnerPrograms,
  listProgramPartners,
  listProducts,
  listPrograms,
  previewTermChanges,
  quoteForPartner,
  resetIndividualRate,
  searchPartners,
  setIndividualRates,
  setProgramStatus,
  updateProgram
} from "./domain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "fin-uslovia-dev-secret";
const PORT = Number(process.env.PORT || 3001);

export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Сессия истекла", code: "invalid_token" });
    }
    next();
  });

  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Требуется авторизация", code: "unauthorized" });
    next();
  }

  function requireRoles(roles) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "Требуется авторизация", code: "unauthorized" });
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Недостаточно прав", code: "forbidden" });
      }
      next();
    };
  }

  const requireAdmin = requireRoles(ADMIN_ROLES);
  const wrap = (fn) => (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, section: "Лизинговые программы" });
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль", code: "invalid_credentials" });
    }
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      partnerId: user.partner_id
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user: payload });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.get("/api/products", requireAuth, (_req, res) => {
    res.json({ items: listProducts(db) });
  });

  app.get("/api/partners", requireAuth, (req, res) => {
    res.json(
      searchPartners(db, {
        q: req.query.q,
        page: req.query.page,
        limit: req.query.limit,
        excludeAssignedTo: req.query.excludeAssignedTo
      })
    );
  });

  app.get("/api/partners/:id", requireAdmin, wrap((req, res) => {
    res.json(listPartnerPrograms(db, Number(req.params.id)));
  }));

  app.patch("/api/partners/:id/programs/:programId/rates", requireAdmin, wrap((req, res) => {
    res.json(
      setIndividualRates(db, req.user, Number(req.params.id), Number(req.params.programId), req.body?.rates)
    );
  }));

  app.post("/api/partners/:id/programs/:programId/rates/reset", requireAdmin, wrap((req, res) => {
    res.json(
      resetIndividualRate(
        db,
        req.user,
        Number(req.params.id),
        Number(req.params.programId),
        req.body?.termMonths,
        Boolean(req.body?.confirm)
      )
    );
  }));

  app.get("/api/programs", requireAdmin, wrap((_req, res) => {
    res.json({ items: listPrograms(db) });
  }));

  app.post("/api/programs", requireAdmin, wrap((req, res) => {
    res.status(201).json(createProgram(db, req.user, req.body || {}));
  }));

  app.get("/api/programs/:id", requireAdmin, wrap((req, res) => {
    res.json(getProgram(db, Number(req.params.id)));
  }));

  app.post("/api/programs/:id/preview-terms", requireAdmin, wrap((req, res) => {
    const program = getProgram(db, Number(req.params.id));
    res.json({ program, ...previewTermChanges(db, program.id, req.body?.terms || program.terms) });
  }));

  app.patch("/api/programs/:id", requireAdmin, wrap((req, res) => {
    res.json(updateProgram(db, req.user, Number(req.params.id), req.body || {}));
  }));

  app.post("/api/programs/:id/deactivate", requireAdmin, wrap((req, res) => {
    res.json(setProgramStatus(db, req.user, Number(req.params.id), "inactive"));
  }));

  app.post("/api/programs/:id/activate", requireAdmin, wrap((req, res) => {
    res.json(setProgramStatus(db, req.user, Number(req.params.id), "active"));
  }));

  app.post("/api/programs/:id/assign", requireAdmin, wrap((req, res) => {
    res.json(assignProgram(db, req.user, Number(req.params.id), req.body || {}));
  }));

  app.get("/api/programs/:id/partners", requireAdmin, wrap((req, res) => {
    res.json(
      listProgramPartners(db, Number(req.params.id), {
        q: req.query.q,
        filter: req.query.filter,
        page: req.query.page,
        limit: req.query.limit
      })
    );
  }));

  app.get("/api/programs/:id/history", requireAdmin, (req, res) => {
    res.json(listHistory(db, { programId: Number(req.params.id), page: req.query.page, limit: req.query.limit }));
  });

  app.get("/api/history", requireAdmin, (req, res) => {
    res.json(
      listHistory(db, {
        programId: req.query.programId,
        partnerId: req.query.partnerId,
        page: req.query.page,
        limit: req.query.limit
      })
    );
  });

  app.get("/api/partner/programs", requireAuth, wrap((req, res) => {
    if (req.user.role !== "partner" || !req.user.partnerId) {
      return res.status(403).json({ error: "Доступно только кабинету партнёра", code: "forbidden" });
    }
    res.json(listPartnerPrograms(db, req.user.partnerId));
  }));

  app.post("/api/calculator/quote", requireAuth, wrap((req, res) => {
    if (req.user.role !== "partner" || !req.user.partnerId) {
      return res.status(403).json({ error: "Партнёр не может менять ставку, калькулятор доступен в кабинете партнёра", code: "forbidden" });
    }
    res.json(quoteForPartner(db, req.user.partnerId, req.body || {}));
  }));

  app.post("/api/applications", requireAuth, wrap((req, res) => {
    if (req.user.role !== "partner" || !req.user.partnerId) {
      return res.status(403).json({ error: "Создавать заявки может только партнёр", code: "forbidden" });
    }
    res.status(201).json(createApplication(db, req.user, req.user.partnerId, req.body || {}));
  }));

  app.get("/api/applications", requireAuth, (req, res) => {
    if (ADMIN_ROLES.includes(req.user.role)) {
      return res.json({ items: listApplications(db) });
    }
    if (req.user.role === "partner" && req.user.partnerId) {
      return res.json({ items: listApplications(db, { partnerId: req.user.partnerId }) });
    }
    return res.status(403).json({ error: "Недостаточно прав", code: "forbidden" });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Маршрут не найден", code: "not_found" });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof DomainError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    console.error(err);
    res.status(500).json({ error: "Внутренняя ошибка сервера", code: "internal" });
  });

  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  const app = createApp(db);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FINCODE API http://localhost:${PORT}`);
  });
}
