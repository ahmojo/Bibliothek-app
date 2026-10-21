CREATE TABLE exemplar (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_number text NOT NULL UNIQUE,
  location text NOT NULL,
  book_id bigint REFERENCES books (id),
  cd_dvd_id bigint REFERENCES cd_dvd (id),
  CONSTRAINT exemplar_exactly_one_medium CHECK (
    (book_id IS NOT NULL AND cd_dvd_id IS NULL)
    OR (book_id IS NULL AND cd_dvd_id IS NOT NULL)
  )
);
