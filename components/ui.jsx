export function Button({ children, variant = "primary", className = "", type = "button", ...props }) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props}>{children}</button>;
}

export function FormField({ id, label, error, required, ...props }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function InlineAlert({ children }) {
  return <div className="inline-alert" role="alert">{children}</div>;
}

export function ActivityLine({ children = "Wird geladen …" }) {
  return <p className="activity-line" role="status">{children}</p>;
}

export function StatusText({ children, available = false }) {
  return <span className={`status-text${available ? " status-text--available" : ""}`}>{children}</span>;
}

export function Pagination({ page, pageSize, total, onChange, disabled = false, label = "Ergebnisseiten" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <Button variant="secondary" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Zurück</Button>
      <span>Seite {page} von {pages}</span>
      <Button variant="secondary" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>Weiter</Button>
    </nav>
  );
}
