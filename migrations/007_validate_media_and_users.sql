CREATE FUNCTION normalize_isbn(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT upper(regexp_replace(value, '[-[:space:]]', '', 'g'));
$$;

CREATE FUNCTION valid_isbn(value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE
  isbn text := normalize_isbn(value);
  total integer := 0;
  digit integer;
  position integer;
BEGIN
  IF isbn ~ '^[0-9]{9}[0-9X]$' THEN
    FOR position IN 1..10 LOOP
      digit := CASE WHEN substr(isbn, position, 1) = 'X' THEN 10
                    ELSE substr(isbn, position, 1)::integer END;
      total := total + digit * (11 - position);
    END LOOP;
    RETURN total % 11 = 0;
  ELSIF isbn ~ '^(978|979)[0-9]{10}$' THEN
    FOR position IN 1..13 LOOP
      digit := substr(isbn, position, 1)::integer;
      total := total + digit * CASE WHEN position % 2 = 0 THEN 3 ELSE 1 END;
    END LOOP;
    RETURN total % 10 = 0;
  END IF;
  RETURN false;
END;
$$;

-- Konflikte melden, bevor Constraints oder Indizes angelegt werden.
-- Keine Bestandsdaten normalisieren, überschreiben oder löschen.
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(problem, E'\n') INTO conflicts FROM (
    SELECT format('books id=%s: %s', id, concat_ws(', ',
      CASE WHEN title !~ '[^[:space:]]' THEN 'title leer' END,
      CASE WHEN author !~ '[^[:space:]]' THEN 'author leer' END,
      CASE WHEN NOT valid_isbn(isbn) THEN 'isbn ungueltig' END,
      CASE WHEN publication_year NOT BETWEEN 1 AND extract(year FROM CURRENT_DATE)::integer + 1
           THEN 'publication_year ungueltig' END)) AS problem
    FROM books WHERE title !~ '[^[:space:]]' OR author !~ '[^[:space:]]'
      OR NOT valid_isbn(isbn)
      OR publication_year NOT BETWEEN 1 AND extract(year FROM CURRENT_DATE)::integer + 1
    UNION ALL
    SELECT format('books ids=%s: doppelte normalisierte ISBN %s',
      array_agg(id ORDER BY id)::text, normalize_isbn(isbn))
    FROM books GROUP BY normalize_isbn(isbn) HAVING count(*) > 1
    UNION ALL
    SELECT format('cd_dvd id=%s: title leer', id) FROM cd_dvd WHERE title !~ '[^[:space:]]'
    UNION ALL
    SELECT format('exemplar id=%s: inventory_number oder location leer', id)
    FROM exemplar WHERE inventory_number !~ '[^[:space:]]' OR location !~ '[^[:space:]]'
    UNION ALL
    SELECT format('users id=%s: %s', id, concat_ws(', ',
      CASE WHEN name !~ '[^[:space:]]' THEN 'name leer' END,
      CASE WHEN email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 'email ungueltig' END,
      CASE WHEN password_hash !~ '[^[:space:]]' THEN 'password_hash leer' END))
    FROM users WHERE name !~ '[^[:space:]]' OR password_hash !~ '[^[:space:]]'
      OR email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) invalid;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Datenkonflikte: Migration abgebrochen.',
      DETAIL = conflicts, HINT = 'Bestandsdaten fachlich pruefen; es wurde nichts geaendert.';
  END IF;
END;
$$;

ALTER TABLE books
  ADD CONSTRAINT books_title_not_blank CHECK (title ~ '[^[:space:]]'),
  ADD CONSTRAINT books_author_not_blank CHECK (author ~ '[^[:space:]]'),
  ADD CONSTRAINT books_isbn_valid CHECK (valid_isbn(isbn)),
  ADD CONSTRAINT books_publication_year_valid CHECK (
    publication_year BETWEEN 1 AND extract(year FROM CURRENT_DATE)::integer + 1
  );
CREATE UNIQUE INDEX books_isbn_normalized_unique ON books (normalize_isbn(isbn));

ALTER TABLE cd_dvd
  ADD CONSTRAINT cd_dvd_title_not_blank CHECK (title ~ '[^[:space:]]');
ALTER TABLE exemplar
  ADD CONSTRAINT exemplar_inventory_not_blank CHECK (inventory_number ~ '[^[:space:]]'),
  ADD CONSTRAINT exemplar_location_not_blank CHECK (location ~ '[^[:space:]]');
ALTER TABLE users
  ADD CONSTRAINT users_name_not_blank CHECK (name ~ '[^[:space:]]'),
  ADD CONSTRAINT users_email_valid CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  ADD CONSTRAINT users_password_hash_not_blank CHECK (password_hash ~ '[^[:space:]]');

CREATE INDEX exemplar_book_id_idx ON exemplar (book_id);
CREATE INDEX exemplar_cd_dvd_id_idx ON exemplar (cd_dvd_id);
CREATE INDEX ausleihe_user_id_idx ON ausleihe (user_id);
CREATE INDEX ausleihe_exemplar_id_idx ON ausleihe (exemplar_id);
