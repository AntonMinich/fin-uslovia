import { NavLink, useNavigate } from "react-router-dom";
import { ROLE_LABELS } from "./api.js";

export function Modal({ title, hint, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {hint ? <p className="hint">{hint}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function Layout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const isPartner = user.role === "partner";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          FIN<span>CODE</span>
        </div>
        {isAdmin ? (
          <>
            <NavLink className="nav-link" to="/programs">
              Лизинговые программы
            </NavLink>
            <NavLink className="nav-link" to="/partners">
              Партнёры
            </NavLink>
            <NavLink className="nav-link" to="/applications">
              Заявки
            </NavLink>
            <NavLink className="nav-link" to="/history">
              История изменений
            </NavLink>
          </>
        ) : null}
        {isPartner ? (
          <>
            <NavLink className="nav-link" to="/cabinet">
              Калькулятор
            </NavLink>
            <NavLink className="nav-link" to="/applications">
              Заявки
            </NavLink>
          </>
        ) : null}
        {!isAdmin && !isPartner ? (
          <NavLink className="nav-link" to="/forbidden">
            Нет доступа
          </NavLink>
        ) : null}
        <div className="userbox">
          <div>{user.name}</div>
          <small>{ROLE_LABELS[user.role]}</small>
          <button
            className="btn ghost"
            onClick={() => {
              onLogout();
              navigate("/login");
            }}
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function StatusBadge({ status }) {
  return status === "active" ? (
    <span className="badge badge-on">Активна</span>
  ) : (
    <span className="badge badge-off">Неактивна</span>
  );
}

export function Pager({ page, pages, onChange }) {
  return (
    <div className="pager">
      <button className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Назад
      </button>
      <span>
        {page} / {pages}
      </span>
      <button className="btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Вперёд
      </button>
    </div>
  );
}
