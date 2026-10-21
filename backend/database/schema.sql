CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  language TEXT NOT NULL DEFAULT 'tm',
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_code TEXT,
  verification_expires_at TIMESTAMPTZ,
  subscription_plan TEXT NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'tm';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

DO $migration$
BEGIN
  IF to_regclass('public.admins') IS NOT NULL THEN
    INSERT INTO users(username,email,password_hash,role,language,verified,subscription_plan,created_at)
    SELECT 'Administrator',lower(email),password_hash,'admin','tm',true,'premium',created_at
    FROM admins
    ON CONFLICT(email) DO UPDATE SET
      password_hash=excluded.password_hash,
      role='admin',
      verified=true,
      subscription_plan='premium';

    DROP TABLE admins;
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT NOT NULL,
  year INTEGER,
  country TEXT,
  genre TEXT,
  genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  type TEXT NOT NULL DEFAULT 'Movie',
  duration TEXT,
  rating NUMERIC(3, 1) DEFAULT 8.0,
  difficulty TEXT DEFAULT 'medium',
  accent TEXT DEFAULT 'american',
  age_rating TEXT DEFAULT '16+',
  cover_url TEXT,
  video_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE movies ADD COLUMN IF NOT EXISTS genres JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS title_tm TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS title_ru TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS description_tm TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS description_ru TEXT;
UPDATE movies SET
  title_tm=coalesce(nullif(title_tm,''),title),
  title_en=coalesce(nullif(title_en,''),title),
  title_ru=coalesce(nullif(title_ru,''),title),
  description_tm=coalesce(description_tm,description),
  description_en=coalesce(description_en,description),
  description_ru=coalesce(description_ru,description);
ALTER TABLE movies ALTER COLUMN title_tm SET NOT NULL;
ALTER TABLE movies ALTER COLUMN title_en SET NOT NULL;
ALTER TABLE movies ALTER COLUMN title_ru SET NOT NULL;
ALTER TABLE movies ALTER COLUMN description_tm SET NOT NULL;
ALTER TABLE movies ALTER COLUMN description_en SET NOT NULL;
ALTER TABLE movies ALTER COLUMN description_ru SET NOT NULL;
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_year_integer_range;
ALTER TABLE movies ADD CONSTRAINT movies_year_integer_range CHECK (year BETWEEN 1888 AND 9999);

CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  name_tm TEXT,
  name_en TEXT,
  name_ru TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE genres ADD COLUMN IF NOT EXISTS name_tm TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE genres ADD COLUMN IF NOT EXISTS name_ru TEXT;

INSERT INTO genres(name,name_tm,name_en,name_ru) VALUES
  ('Action','Aksiýon','Action','Боевик'),
  ('Adventure','Başdan geçirme','Adventure','Приключения'),
  ('Cartoon','Multfilm','Cartoon','Мультфильм'),
  ('Comedy','Komediýa','Comedy','Комедия'),
  ('Crime','Jenaýat','Crime','Криминал'),
  ('Documentary','Dokumental','Documentary','Документальный'),
  ('Drama','Drama','Drama','Драма'),
  ('Family','Maşgala','Family','Семейный'),
  ('Fantasy','Fantastika','Fantasy','Фэнтези'),
  ('History','Taryhy','History','Исторический'),
  ('Horror','Gorky','Horror','Ужасы'),
  ('Mystery','Syrly','Mystery','Детектив'),
  ('Romance','Söýgi','Romance','Романтика'),
  ('Sci-Fi','Ylmy-fantastika','Sci-Fi','Научная фантастика'),
  ('Thriller','Triller','Thriller','Триллер'),
  ('War','Uruş','War','Военный')
ON CONFLICT(name) DO UPDATE SET name_tm=excluded.name_tm,name_en=excluded.name_en,name_ru=excluded.name_ru;

UPDATE movies movie SET genres=normalized.value
FROM (
  SELECT source.id,COALESCE(jsonb_agg(to_jsonb(COALESCE(canonical.name,item.value))),'[]'::jsonb) AS value
  FROM movies source
  CROSS JOIN LATERAL jsonb_array_elements_text(source.genres) item(value)
  LEFT JOIN genres canonical ON lower(item.value) IN (lower(canonical.name),lower(canonical.name_tm),lower(canonical.name_en),lower(canonical.name_ru))
  GROUP BY source.id
) normalized
WHERE movie.id=normalized.id AND movie.genres IS DISTINCT FROM normalized.value;

UPDATE movies movie SET genre=canonical.name
FROM genres canonical
WHERE movie.genre IS NOT NULL
  AND lower(movie.genre) IN (lower(canonical.name),lower(canonical.name_tm),lower(canonical.name_en),lower(canonical.name_ru))
  AND movie.genre IS DISTINCT FROM canonical.name;

UPDATE movies SET type='Cartoon' WHERE lower(type) IN ('animation','animations','cartoon','cartoons');
UPDATE movies movie SET genres=normalized.value
FROM (
  SELECT source.id,jsonb_agg(to_jsonb(CASE WHEN lower(item.value) IN ('animation','анимация','animasiýa','cartoon','мультфильм','multfilm') THEN 'Cartoon' ELSE item.value END)) AS value
  FROM movies source CROSS JOIN LATERAL jsonb_array_elements_text(source.genres) item(value)
  GROUP BY source.id
) normalized
WHERE movie.id=normalized.id AND movie.genres IS DISTINCT FROM normalized.value;
UPDATE movies SET genre='Cartoon' WHERE lower(genre) IN ('animation','анимация','animasiýa','cartoon','мультфильм','multfilm');
DELETE FROM genres WHERE name='Animation';

CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);


UPDATE movies SET country='United States' WHERE country='USA';

CREATE TABLE IF NOT EXISTS subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'ru')),
  cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(movie_id, language)
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  source_language TEXT NOT NULL CHECK (source_language IN ('en', 'ru')),
  target_language TEXT NOT NULL CHECK (target_language IN ('en', 'ru')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, word, source_language, target_language)
);

CREATE TABLE IF NOT EXISTS favorite_movies (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS series_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number > 0),
  episode_number INTEGER NOT NULL CHECK (episode_number > 0),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (series_id <> movie_id),
  UNIQUE (series_id, season_number, episode_number),
  UNIQUE (series_id, movie_id)
);

CREATE INDEX IF NOT EXISTS series_episodes_series_idx ON series_episodes(series_id, season_number, episode_number);

CREATE TABLE IF NOT EXISTS series_seasons (
  series_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number BETWEEN 1 AND 100),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, season_number)
);

INSERT INTO series_seasons(series_id, season_number)
SELECT DISTINCT series_id, season_number FROM series_episodes
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS movie_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movie_comments_movie_idx ON movie_comments(movie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS movie_comments_created_idx ON movie_comments(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS movie_comments_user_idx ON movie_comments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS movies_title_idx ON movies USING gin (to_tsvector('english', title || ' ' || coalesce(description, '')));
