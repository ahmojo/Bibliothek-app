CREATE TABLE cd_dvd (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  media_type text NOT NULL,
  CONSTRAINT cd_dvd_media_type CHECK (media_type IN ('CD', 'DVD'))
);
