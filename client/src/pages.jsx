import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { APPLY_MODE_LABELS, ROLE_LABELS, api, formatDate, formatMoney, formatRate, setToken } from "./api.js";
import { Modal, Pager, StatusBadge } from "./ui.jsx";

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("ivanova@fincode.local");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            FIN<span>CODE</span>
          </div>
          <h1>Лизинговые программы вместо условий финансирования</h1>
          <p>
            Одна программа, базовые ставки для всех партнёров и индивидуальные исключения без копий карточки.
          </p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <h2>Вход в кабинет</h2>
          <p className="hint">Администратор и суперадминистратор управляют программами одинаково.</p>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn btn-primary" type="submit">
            Войти
          </button>
          <div className="demo-accounts">
            <div>
              <b>ivanova@fincode.local</b> — администратор
            </div>
            <div>
              <b>petrov@fincode.local</b> — суперадминистратор
            </div>
            <div>
              <b>kozlov@fincode.local</b> — партнёр с индивидуальной ставкой
            </div>
            <div>
              <b>manager@fincode.local</b> — менеджер без доступа
            </div>
            <div>Пароль для всех: <b>demo123</b></div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProgramsPage({ user }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function load() {
    const data = await api("/api/programs");
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="replaced-note">Раздел «Условия финансирования» заменён</span>
          <h1>Лизинговые программы</h1>
          <p>Список без выгрузки партнёров: только агрегаты по базовым и индивидуальным условиям.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Создать программу
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Программа</th>
              <th>Продукты</th>
              <th className="num">Партнёры</th>
              <th className="num">Базовые</th>
              <th className="num">Индивидуальные</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="row-link" onClick={() => navigate(`/programs/${item.id}`)}>
                <td>
                  <b>{item.name}</b>
                </td>
                <td>
                  <div className="chips">
                    {item.products.map((product) => (
                      <span className="chip" key={product.id}>
                        {product.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="num">{item.partnersTotal}</td>
                <td className="num">{item.partnersBase}</td>
                <td className="num">{item.partnersIndividual}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <ProgramFormModal
          title="Создать программу"
          onClose={() => setOpen(false)}
          onSave={async (payload) => {
            const created = await api("/api/programs", { method: "POST", body: payload });
            setOpen(false);
            navigate(`/programs/${created.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function emptyTerm() {
  return { termMonths: 12, baseRate: 1.99 };
}

function ProgramFormModal({ title, initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [productIds, setProductIds] = useState(initial?.products?.map((item) => item.id) || []);
  const [terms, setTerms] = useState(initial?.terms?.length ? initial.terms : [emptyTerm()]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/products").then((data) => setProducts(data.items));
  }, []);

  function toggleProduct(id) {
    setProductIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <Modal title={title} hint="После создания программа сразу получает статус «Активна»." onClose={onClose}>
      <label className="field">
        <span>Наименование</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="section-title">Продукты</div>
      <div className="product-list">
        {products.map((product) => (
          <label key={product.id}>
            <input
              type="checkbox"
              checked={productIds.includes(product.id)}
              onChange={() => toggleProduct(product.id)}
            />
            {product.name}
          </label>
        ))}
      </div>
      <div className="section-title">Сроки и базовые ставки</div>
      {terms.map((term, index) => (
        <div className="term-row" key={index}>
          <input
            type="number"
            min="1"
            value={term.termMonths}
            onChange={(e) =>
              setTerms((current) =>
                current.map((item, i) => (i === index ? { ...item, termMonths: Number(e.target.value) } : item))
              )
            }
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={term.baseRate}
            onChange={(e) =>
              setTerms((current) =>
                current.map((item, i) => (i === index ? { ...item, baseRate: Number(e.target.value) } : item))
              )
            }
          />
          <button className="btn" type="button" onClick={() => setTerms((current) => current.filter((_, i) => i !== index))}>
            ×
          </button>
        </div>
      ))}
      <button className="btn" type="button" onClick={() => setTerms((current) => [...current, emptyTerm()])}>
        + Добавить срок
      </button>
      {error ? <div className="error">{error}</div> : null}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await onSave({ name, productIds, terms });
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Сохранить
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Modal>
  );
}

export function ProgramCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [applyState, setApplyState] = useState(null);
  const [productConfirm, setProductConfirm] = useState(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  async function load() {
    const data = await api(`/api/programs/${id}`);
    const hist = await api(`/api/programs/${id}/history?limit=8`);
    setProgram(data);
    setHistory(hist.items);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [id]);

  async function saveProgram(payload, extra = {}) {
    try {
      await api(`/api/programs/${id}`, { method: "PATCH", body: { ...payload, ...extra } });
      setEditOpen(false);
      setApplyState(null);
      setProductConfirm(null);
      await load();
    } catch (err) {
      if (err.code === "apply_mode_required") {
        setApplyState({ payload, preview: err.payload });
        return;
      }
      if (err.code === "confirm_product_change") {
        setProductConfirm({ payload, preview: err.payload });
        return;
      }
      if (err.code === "confirm_apply_to_all") {
        setApplyState((current) => ({ ...current, needDangerConfirm: true, preview: err.payload }));
        return;
      }
      throw err;
    }
  }

  if (!program) return error ? <div className="error">{error}</div> : <div>Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/programs" className="muted">
            ← К списку
          </Link>
          <h1>{program.name}</h1>
          <p>
            <StatusBadge status={program.status} /> одна карточка программы, без копий на партнёра
          </p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setEditOpen(true)}>
            Редактировать
          </button>
          {program.status === "active" ? (
            <button className="btn btn-danger" onClick={() => setDeactivateOpen(true)}>
              Деактивировать
            </button>
          ) : (
            <button
              className="btn btn-teal"
              onClick={async () => {
                await api(`/api/programs/${id}/activate`, { method: "POST" });
                load();
              }}
            >
              Активировать
            </button>
          )}
        </div>
      </div>

      <div className="program-layout">
        <div className="card">
          <div className="section-title">Продукты</div>
          <div className="chips" style={{ marginBottom: 18 }}>
            {program.products.map((product) => (
              <span className="chip" key={product.id}>
                {product.name}
              </span>
            ))}
          </div>
          <div className="section-title">Условия</div>
          <table>
            <thead>
              <tr>
                <th>Срок</th>
                <th className="num">Базовая ставка</th>
              </tr>
            </thead>
            <tbody>
              {program.terms.map((term) => (
                <tr key={term.termMonths}>
                  <td>{term.termMonths} мес.</td>
                  <td className="num">{formatRate(term.baseRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Партнёры</div>
            <div>
              Всего <b>{program.partnersTotal.toLocaleString("ru-RU")}</b>
            </div>
            <div>
              Базовые условия <b>{program.partnersBase.toLocaleString("ru-RU")}</b>
            </div>
            <div>
              Индивидуальные условия <b>{program.partnersIndividual.toLocaleString("ru-RU")}</b>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => navigate(`/programs/${id}/partners`)}>
                Посмотреть партнёров
              </button>
              <button className="btn" onClick={() => setAssignOpen(true)}>
                Назначить партнёрам
              </button>
            </div>
          </div>
          <div className="card">
            <div className="section-title">История изменений</div>
            {history.map((item) => (
              <div className="history-item" key={item.id}>
                <b>
                  {formatDate(item.created_at)} · {item.user_name}
                </b>
                <div className="muted">
                  {ROLE_LABELS[item.user_role]} · {item.action}
                  {item.term_months ? ` · ${item.term_months} мес.` : ""}
                  {item.old_value && item.new_value ? ` · ${item.old_value} → ${item.new_value}` : ""}
                </div>
              </div>
            ))}
            <Link to={`/history?programId=${id}`}>Посмотреть историю</Link>
          </div>
        </div>
      </div>

      {editOpen ? (
        <ProgramFormModal
          title="Редактировать программу"
          initial={program}
          onClose={() => setEditOpen(false)}
          onSave={(payload) => saveProgram(payload)}
        />
      ) : null}
      {assignOpen ? <AssignModal program={program} onClose={() => setAssignOpen(false)} onDone={load} /> : null}
      {applyState ? (
        <ApplyModeModal
          preview={applyState.preview}
          danger={applyState.needDangerConfirm}
          onClose={() => setApplyState(null)}
          onChoose={(applyMode) => saveProgram(applyState.payload, { applyMode, confirmApplyToAll: applyMode === "apply_to_all" })}
        />
      ) : null}
      {productConfirm ? (
        <Modal
          title="Изменение продуктов"
          hint="Программа уже назначена партнёрам. Отдельные копии не создаются — изменятся условия самой программы."
          onClose={() => setProductConfirm(null)}
        >
          <p>Сейчас: {productConfirm.preview.currentProducts.join(", ")}</p>
          <p>Партнёров: {productConfirm.preview.partnersTotal}</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => saveProgram(productConfirm.payload, { confirmProductChange: true })}>
              Подтвердить
            </button>
            <button className="btn" onClick={() => setProductConfirm(null)}>
              Отмена
            </button>
          </div>
        </Modal>
      ) : null}
      {deactivateOpen ? (
        <Modal
          title="Деактивировать программу?"
          hint="Неактивная программа не используется для новых заявок. Уже оформленные заявки сохранят свои условия."
          onClose={() => setDeactivateOpen(false)}
        >
          <div className="btn-row">
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api(`/api/programs/${id}/deactivate`, { method: "POST" });
                setDeactivateOpen(false);
                load();
              }}
            >
              Деактивировать
            </button>
            <button className="btn" onClick={() => setDeactivateOpen(false)}>
              Отмена
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function ApplyModeModal({ preview, danger, onClose, onChoose }) {
  const [mode, setMode] = useState("apply_to_base");
  const change = preview.changes?.[0];
  return (
    <Modal title="Изменение базовой ставки" onClose={onClose}>
      {change ? (
        <p>
          Вы изменили базовую ставку:{" "}
          <b>
            {change.termMonths} месяца: {formatRate(change.oldRate)} → {formatRate(change.newRate)}
          </b>
        </p>
      ) : null}
      <p>
        По программе: {preview.counts?.partnersBase ?? change?.partnersBase} партнёров используют базовые условия,{" "}
        {preview.counts?.partnersIndividual ?? change?.partnersIndividual} имеют индивидуальные условия.
      </p>
      <div className="apply-options">
        <label>
          <input type="radio" checked={mode === "apply_to_base"} onChange={() => setMode("apply_to_base")} />
          <span>
            <b>Применить к партнёрам с базовыми условиями</b>
            <div className="muted">По умолчанию. Индивидуальные ставки не изменяются.</div>
          </span>
        </label>
        <label>
          <input type="radio" checked={mode === "apply_to_all"} onChange={() => setMode("apply_to_all")} />
          <span>
            <b>Применить ко всем партнёрам</b>
            <div className="muted">Опасное действие: индивидуальные ставки по сроку будут заменены.</div>
          </span>
        </label>
        <label>
          <input type="radio" checked={mode === "change_program_only"} onChange={() => setMode("change_program_only")} />
          <span>
            <b>Изменить только базовую программу</b>
            <div className="muted">Индивидуальные условия партнёров сохраняются.</div>
          </span>
        </label>
      </div>
      {danger || mode === "apply_to_all" ? (
        <div className="warn">
          Внимание. У партнёров установлены индивидуальные условия. При применении ко всем они будут заменены новой
          базовой ставкой.
        </div>
      ) : null}
      <div className="btn-row">
        <button className={mode === "apply_to_all" ? "btn btn-danger" : "btn btn-primary"} onClick={() => onChoose(mode)}>
          Подтвердить
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Modal>
  );
}

function AssignModal({ program, onClose, onDone }) {
  const [mode, setMode] = useState("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState([]);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "selected") return;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      api(`/api/partners?q=${encodeURIComponent(query)}&limit=8&excludeAssignedTo=${program.id}`)
        .then((data) => setResults(data.items))
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, mode, program.id]);

  return (
    <Modal title="Назначить партнёрам" hint="Копия программы не создаётся — партнёры ссылаются на эту же карточку." onClose={onClose}>
      <div className="apply-options">
        <label>
          <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
          Всем партнёрам
        </label>
        <label>
          <input type="radio" checked={mode === "selected"} onChange={() => setMode("selected")} />
          Выбранным партнёрам
        </label>
      </div>
      {mode === "all" ? (
        <div className="warn">Программа будет назначена всем партнёрам.</div>
      ) : (
        <>
          <label className="field">
            <span>Поиск партнёра</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить название" />
          </label>
          <div className="search-results">
            {results.map((item) => (
              <button
                key={item.id}
                className={picked.some((p) => p.id === item.id) ? "picked" : ""}
                onClick={() =>
                  setPicked((current) =>
                    current.some((p) => p.id === item.id) ? current.filter((p) => p.id !== item.id) : [...current, item]
                  )
                }
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="chips">
            {picked.map((item) => (
              <span className="chip" key={item.id}>
                {item.name}
              </span>
            ))}
          </div>
        </>
      )}
      {error ? <div className="error">{error}</div> : null}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              if (mode === "all" && !confirmAll) {
                setConfirmAll(true);
                return;
              }
              await api(`/api/programs/${program.id}/assign`, {
                method: "POST",
                body: { mode, partnerIds: picked.map((item) => item.id) }
              });
              onDone();
              onClose();
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          {mode === "all" && !confirmAll ? "Продолжить" : "Назначить"}
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Modal>
  );
}

export function ProgramPartnersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  async function load(next = {}) {
    const query = next.q ?? q;
    const currentFilter = next.filter ?? filter;
    const currentPage = next.page ?? page;
    const result = await api(
      `/api/programs/${id}/partners?q=${encodeURIComponent(query)}&filter=${currentFilter}&page=${currentPage}&limit=10`
    );
    setData(result);
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!data) return <div>Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/programs/${id}`} className="muted">
            ← Карточка программы
          </Link>
          <h1>Партнёры программы</h1>
          <p>
            Всего {data.counts.partnersTotal} · базовые {data.counts.partnersBase} · индивидуальные{" "}
            {data.counts.partnersIndividual}
          </p>
        </div>
      </div>
      <div className="toolbar">
        <input
          value={q}
          placeholder="Поиск по названию"
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
            load({ q: e.target.value, page: 1 });
          }}
        />
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
            load({ filter: e.target.value, page: 1 });
          }}
        >
          <option value="all">Все</option>
          <option value="base">Базовые условия</option>
          <option value="individual">Индивидуальные условия</option>
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Партнёр</th>
              <th>Тип условий</th>
              <th className="num">Индивидуальных изменений</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <span className={`badge ${item.conditionType === "individual" ? "badge-ind" : "badge-base"}`}>
                    {item.conditionLabel}
                  </span>
                </td>
                <td className="num">{item.individualChanges}</td>
                <td>
                  <button className="btn" onClick={() => navigate(`/partners/${item.id}`)}>
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        page={data.page}
        pages={data.pages}
        onChange={(next) => {
          setPage(next);
          load({ page: next });
        }}
      />
    </>
  );
}

export function PartnersPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], page: 1, pages: 1 });
  const navigate = useNavigate();

  async function load(query = q, page = 1) {
    setData(await api(`/api/partners?q=${encodeURIComponent(query)}&page=${page}&limit=12`));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Партнёры</h1>
          <p>Полный справочник не выгружается целиком — только поиск и постраничный список.</p>
        </div>
      </div>
      <div className="toolbar">
        <input
          value={q}
          placeholder="Название партнёра"
          onChange={(e) => {
            setQ(e.target.value);
            load(e.target.value, 1);
          }}
        />
      </div>
      <div className="card table-wrap">
        <table>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="row-link" onClick={() => navigate(`/partners/${item.id}`)}>
                <td>{item.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} onChange={(page) => load(q, page)} />
    </>
  );
}

export function PartnerCardPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);

  async function load() {
    setData(await api(`/api/partners/${id}`));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!data) return <div>Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/partners" className="muted">
            ← Партнёры
          </Link>
          <h1>{data.partner.name}</h1>
          <p>Раздел «Лизинговые программы» в карточке партнёра. Партнёр сам ставку не меняет.</p>
        </div>
      </div>
      {data.programs.map((program) => (
        <div className="card" key={program.id} style={{ marginBottom: 16 }}>
          <div className="page-head">
            <div>
              <h2>{program.name}</h2>
              <StatusBadge status={program.status} />
            </div>
            <button className="btn btn-primary" onClick={() => setEdit(program)}>
              Настроить индивидуальные условия
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Срок</th>
                <th className="num">Базовая ставка</th>
                <th className="num">Ставка партнёра</th>
              </tr>
            </thead>
            <tbody>
              {program.terms.map((term) => (
                <tr key={term.termMonths}>
                  <td>{term.termMonths}</td>
                  <td className="num">{formatRate(term.baseRate)}</td>
                  <td className={`num ${term.isIndividual ? "rate-individual" : ""}`}>
                    {formatRate(term.partnerRate)}
                    {term.isIndividual ? <span className="badge badge-ind mark">Индивидуальная</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {edit ? (
        <IndividualRatesModal
          partnerId={id}
          program={edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function IndividualRatesModal({ partnerId, program, onClose, onSaved }) {
  const [rates, setRates] = useState(
    Object.fromEntries(program.terms.map((term) => [term.termMonths, term.individualRate ?? ""]))
  );
  const [resetTerm, setResetTerm] = useState(null);
  const [error, setError] = useState("");

  return (
    <Modal title="Индивидуальные условия" hint="Пустое значение означает базовую ставку программы." onClose={onClose}>
      {program.terms.map((term) => (
        <div className="term-row" key={term.termMonths}>
          <div>
            {term.termMonths} мес. · база {formatRate(term.baseRate)}
          </div>
          <input
            type="number"
            step="0.01"
            value={rates[term.termMonths]}
            onChange={(e) => setRates((current) => ({ ...current, [term.termMonths]: e.target.value }))}
          />
          {term.isIndividual ? (
            <button className="btn btn-amber" onClick={() => setResetTerm(term.termMonths)}>
              Сбросить
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {error ? <div className="error">{error}</div> : null}
      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await api(`/api/partners/${partnerId}/programs/${program.id}/rates`, {
                method: "PATCH",
                body: {
                  rates: Object.entries(rates).map(([termMonths, rate]) => ({
                    termMonths: Number(termMonths),
                    rate: rate === "" ? null : Number(rate)
                  }))
                }
              });
              onSaved();
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Сохранить
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
      {resetTerm ? (
        <div className="warn">
          Сбросить индивидуальное условие на {resetTerm} мес.? Снова будет применяться базовая ставка.
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api(`/api/partners/${partnerId}/programs/${program.id}/rates/reset`, {
                  method: "POST",
                  body: { termMonths: resetTerm, confirm: true }
                });
                onSaved();
              }}
            >
              Сбросить индивидуальное условие
            </button>
            <button className="btn" onClick={() => setResetTerm(null)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function HistoryPage() {
  const location = useLocation();
  const programId = new URLSearchParams(location.search).get("programId") || "";
  const [data, setData] = useState({ items: [], page: 1, pages: 1 });

  async function load(page = 1) {
    const qs = new URLSearchParams({ page, limit: 20 });
    if (programId) qs.set("programId", programId);
    setData(await api(`/api/history?${qs}`));
  }

  useEffect(() => {
    load();
  }, [programId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>История изменений</h1>
          <p>Дата, пользователь, роль, действие, срок, старое и новое значение, способ применения.</p>
        </div>
      </div>
      <div className="card">
        {data.items.map((item) => (
          <div className="history-item" key={item.id}>
            <b>
              {formatDate(item.created_at)} · {item.user_name}
            </b>
            <div>
              {ROLE_LABELS[item.user_role]} · {item.program_name || "—"} · {item.action}
            </div>
            <div className="muted">
              {item.term_months ? `${item.term_months} месяца · ` : ""}
              {item.old_value && item.new_value ? `${item.old_value} → ${item.new_value}` : item.details}
              {item.apply_mode ? ` · Применение: ${APPLY_MODE_LABELS[item.apply_mode] || item.apply_mode}` : ""}
              {item.partner_name ? ` · Партнёр: ${item.partner_name}` : ""}
            </div>
          </div>
        ))}
      </div>
      <Pager page={data.page} pages={data.pages} onChange={load} />
    </>
  );
}

export function ApplicationsPage({ user }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api("/api/applications").then((data) => setItems(data.items));
  }, []);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Заявки</h1>
          <p>Ставка фиксируется в снимке условий на момент оформления и больше не меняется.</p>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              {user.role !== "partner" ? <th>Партнёр</th> : null}
              <th>Программа</th>
              <th>Продукт</th>
              <th className="num">Срок</th>
              <th className="num">Ставка</th>
              <th className="num">Платёж</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {user.role !== "partner" ? <td>{item.partner.name}</td> : null}
                <td>{item.programName}</td>
                <td>{item.productName}</td>
                <td className="num">{item.termMonths}</td>
                <td className="num">
                  {formatRate(item.appliedRate)}
                  {item.rateSource === "individual" ? <span className="badge badge-ind mark">Индивидуальная</span> : null}
                </td>
                <td className="num">{formatMoney(item.monthlyPayment)}</td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CabinetPage({ user }) {
  const [bundle, setBundle] = useState(null);
  const [programId, setProgramId] = useState("");
  const [productId, setProductId] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [amount, setAmount] = useState(25000);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/partner/programs").then((data) => {
      setBundle(data);
      const first = data.programs.find((item) => item.status === "active") || data.programs[0];
      if (first) {
        setProgramId(String(first.id));
        setProductId(String(first.products[0]?.id || ""));
        setTermMonths(String(first.terms[0]?.termMonths || ""));
      }
    });
  }, []);

  const program = useMemo(
    () => bundle?.programs.find((item) => String(item.id) === String(programId)),
    [bundle, programId]
  );

  async function calc() {
    setError("");
    try {
      setQuote(
        await api("/api/calculator/quote", {
          method: "POST",
          body: { programId: Number(programId), productId: Number(productId), termMonths: Number(termMonths), amount }
        })
      );
    } catch (err) {
      setQuote(null);
      setError(err.message);
    }
  }

  if (!bundle) return <div>Загрузка…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Калькулятор партнёра</h1>
          <p>
            {user.name}. Ставка определяется автоматически: индивидуальная → базовая. Изменить её нельзя.
          </p>
        </div>
      </div>
      <div className="calc-grid">
        <div className="card">
          <label className="field">
            <span>Программа</span>
            <select
              value={programId}
              onChange={(e) => {
                setProgramId(e.target.value);
                const next = bundle.programs.find((item) => String(item.id) === e.target.value);
                setProductId(String(next?.products[0]?.id || ""));
                setTermMonths(String(next?.terms[0]?.termMonths || ""));
              }}
            >
              {bundle.programs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.status === "inactive" ? "(неактивна)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Продукт</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {program?.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Срок, мес.</span>
            <select value={termMonths} onChange={(e) => setTermMonths(e.target.value)}>
              {program?.terms.map((item) => (
                <option key={item.termMonths} value={item.termMonths}>
                  {item.termMonths}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Стоимость предмета лизинга</span>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={calc}>
              Рассчитать
            </button>
            {quote ? (
              <button
                className="btn btn-teal"
                onClick={async () => {
                  await api("/api/applications", {
                    method: "POST",
                    body: { programId: quote.programId, productId: quote.productId, termMonths: quote.termMonths, amount: quote.amount }
                  });
                  alert("Заявка создана. Условия зафиксированы.");
                }}
              >
                Создать заявку
              </button>
            ) : null}
          </div>
        </div>
        <div className="card quote">
          <div className="section-title">Применяемая ставка</div>
          {quote ? (
            <>
              <div className="big">{formatRate(quote.appliedRate)}</div>
              <p>
                База {formatRate(quote.baseRate)}
                {quote.isIndividual ? " · индивидуальное условие" : " · базовое условие программы"}
              </p>
              <p>Ежемесячный платёж</p>
              <h2>{formatMoney(quote.monthlyPayment)}</h2>
            </>
          ) : (
            <p className="muted">Ставка подставится автоматически после расчёта.</p>
          )}
          {program ? (
            <table>
              <tbody>
                {program.terms.map((term) => (
                  <tr key={term.termMonths}>
                    <td>{term.termMonths} мес.</td>
                    <td className={term.isIndividual ? "rate-individual" : ""}>
                      {formatRate(term.partnerRate)}
                      {term.isIndividual ? " · индивидуальная" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function ForbiddenPage({ user, onLogout }) {
  return (
    <div className="card">
      <h1>Нет доступа</h1>
      <p>
        Роль «{ROLE_LABELS[user.role]}» не управляет лизинговыми программами. Раздел доступен только администратору и
        суперадминистратору.
      </p>
      <button
        className="btn"
        onClick={() => {
          setToken(null);
          onLogout();
        }}
      >
        Сменить пользователя
      </button>
    </div>
  );
}

export { Layout };
