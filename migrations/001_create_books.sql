CREATE TABLE books (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  author text NOT NULL,
  isbn text NOT NULL UNIQUE,
  publisher text,
  publication_year integer,
  category text,
  description text
);
