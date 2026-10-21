CREATE TABLE ausleihe (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  exemplar_id bigint NOT NULL REFERENCES exemplar (id) ON DELETE RESTRICT,
  loan_date date NOT NULL,
  due_date date NOT NULL,
  return_date date,
  CONSTRAINT ausleihe_due_date_valid CHECK (due_date >= loan_date),
  CONSTRAINT ausleihe_return_date_valid CHECK (
    return_date IS NULL OR return_date >= loan_date
  )
);

CREATE UNIQUE INDEX ausleihe_one_active_per_exemplar
  ON ausleihe (exemplar_id)
  WHERE return_date IS NULL;
