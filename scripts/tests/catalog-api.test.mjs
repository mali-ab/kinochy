import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync(new URL('../../backend/database/schema.sql', import.meta.url), 'utf8')
  .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
const community = readFileSync(new URL('../../backend/Services/MovieCommunityService.cs', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../backend/Services/MovieService.cs', import.meta.url), 'utf8');

async function insertTitle(db, slug, type, genre = 'Drama') {
  const result = await db.query(`INSERT INTO movies(slug,title,description,type,genre,genres,video_path,
    title_tm,title_en,title_ru,description_tm,description_en,description_ru)
    VALUES($1,$1,'Description',$2,$3,jsonb_build_array($3::text),'video.m3u8',$1,$1,$1,'Description','Description','Description') RETURNING id`, [slug, type, genre]);
  return result.rows[0].id;
}

async function named(db, sql, params) {
  const names = [];
  const bound = sql.replace(/@(\w+)/g, (_, name) => {
    if (!names.includes(name)) names.push(name);
    return `$${names.indexOf(name) + 1}`;
  });
  return db.query(bound, names.map((name) => params[name]));
}

test('migration preserves legacy movie/cartoon series and episode links across repeated startup', async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec('ALTER TABLE movies DROP COLUMN is_series');
    const movie = await insertTitle(db, 'film', 'Movie');
    const serial = await insertTitle(db, 'serial', 'Series');
    const animated = await insertTitle(db, 'animated', 'Series', 'Animation');
    const episode = await insertTitle(db, 'episode', 'Episode');
    await db.query('INSERT INTO series_seasons(series_id,season_number) VALUES($1,1)', [animated]);
    await db.query('INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number) VALUES($1,$2,1,1)', [animated, episode]);
    await db.exec(schema);
    await db.exec(schema);
    const rows = (await db.query('SELECT id,type,is_series FROM movies')).rows;
    assert.deepEqual(rows.find((row) => row.id === movie), { id: movie, type: 'Movie', is_series: false });
    assert.deepEqual(rows.find((row) => row.id === serial), { id: serial, type: 'Movie', is_series: true });
    assert.deepEqual(rows.find((row) => row.id === animated), { id: animated, type: 'Cartoon', is_series: true });
    assert.equal((await db.query('SELECT movie_id FROM series_episodes')).rows[0].movie_id, episode);
  } finally { await db.close(); }
});

test('database enforces one parent, existing seasons, safe deletion, and parent cascade', async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    const first = await insertTitle(db, 'first', 'Movie');
    const second = await insertTitle(db, 'second', 'Cartoon');
    const episode = await insertTitle(db, 'episode', 'Episode');
    await db.query('INSERT INTO series_seasons(series_id,season_number) VALUES($1,1),($2,1)', [first, second]);
    await assert.rejects(db.query('INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number) VALUES($1,$2,2,1)', [first, episode]), { code: '23503' });
    await db.query('INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number) VALUES($1,$2,1,1)', [first, episode]);
    await assert.rejects(db.query('INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number) VALUES($1,$2,1,1)', [second, episode]), { code: '23505' });
    await assert.rejects(db.query('DELETE FROM series_seasons WHERE series_id=$1', [first]), { code: '23503' });
    await db.query('DELETE FROM movies WHERE id=$1', [first]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM series_episodes')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('real service SQL supports both categories, rejects nested series, and omits episodes from recommendations', async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    const movie = await insertTitle(db, 'movie', 'Movie');
    const cartoon = await insertTitle(db, 'cartoon', 'Cartoon');
    const episode = await insertTitle(db, 'episode', 'Cartoon');
    await db.query('UPDATE movies SET is_series=true WHERE id IN ($1,$2)', [movie, cartoon]);
    const seasonSql = community.match(/"""\s*(WITH parent AS[\s\S]*?)"""/)[1];
    for (const parent of [movie, cartoon]) assert.equal((await named(db, seasonSql, { series: parent, season: 1, title: 'Season one' })).rows.length, 1);
    const episodeSql = community.match(/"""\s*(WITH linked AS[\s\S]*?)"""/)[1];
    assert.equal((await named(db, episodeSql, { series: cartoon, movie: episode, season: 1, episode: 1, title: 'Episode one' })).rows.length, 1);
    assert.equal((await named(db, episodeSql, { series: cartoon, movie, season: 1, episode: 2, title: 'Nested series' })).rows.length, 0);
    const recommendationSql = service.match(/FROM movies m\s+WHERE m.id <> @id[\s\S]*?LIMIT 6/)[0];
    const result = await named(db, `SELECT m.id ${recommendationSql}`, { id: movie, parent: movie, type: 'Movie', genre: 'Drama' });
    assert(result.rows.some((row) => row.id === cartoon));
    assert(!result.rows.some((row) => row.id === episode));
  } finally { await db.close(); }
});

test('detail metadata returns actual subtitles and episode parent/category context', async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    const parent = await insertTitle(db, 'parent-cartoon', 'Cartoon');
    const episode = await insertTitle(db, 'episode', 'Episode');
    await db.query('INSERT INTO series_seasons(series_id,season_number) VALUES($1,2)', [parent]);
    await db.query('INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number) VALUES($1,$2,2,3)', [parent, episode]);
    await db.query(`INSERT INTO subtitles(movie_id,language,cues) VALUES($1,'en','[]'),($1,'ru','[{"start":0,"end":2,"text":"Hello"}]')`, [episode]);
    const sql = service.match(/"""\s*(SELECT m.id,\s+EXISTS[\s\S]*?)"""/)[1];
    const row = (await named(db, sql, { ids: [episode] })).rows[0];
    assert.equal(row.subtitle_en, false);
    assert.equal(row.subtitle_ru, true);
    assert.equal(row.series_id, parent);
    assert.equal(row.type, 'Cartoon');
    assert.equal(row.season_number, 2);
    assert.equal(row.episode_number, 3);
  } finally { await db.close(); }
});
