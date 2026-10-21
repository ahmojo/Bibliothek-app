CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar NOT NULL,
  email varchar NOT NULL,
  password_hash varchar NOT NULL,
  role varchar NOT NULL,
  CONSTRAINT users_role_valid CHECK (role IN ('USER', 'ADMIN'))
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));
