-- Dieselben Leerzeichen wie JavaScript \s verwenden, unabhängig von der DB-Locale.
CREATE OR REPLACE FUNCTION normalize_isbn(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT upper(regexp_replace(value,
    U&'[-\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', '', 'g'));
$$;

-- Der bisherige Ausdrucksindex enthält noch die alten Normalisierungswerte.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_indexonlyscan = off;
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(problem, E'\n') INTO conflicts FROM (
    SELECT format('books id=%s: isbn ungueltig', id) AS problem
    FROM books WHERE NOT valid_isbn(isbn)
    UNION ALL
    SELECT format('books ids=%s: doppelte normalisierte ISBN %s',
      array_agg(id ORDER BY id)::text, normalize_isbn(isbn))
    FROM books GROUP BY normalize_isbn(isbn) HAVING count(*) > 1
  ) invalid;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Datenkonflikte: Migration abgebrochen.', DETAIL = conflicts;
  END IF;
END;
$$;
REINDEX INDEX books_isbn_normalized_unique;
