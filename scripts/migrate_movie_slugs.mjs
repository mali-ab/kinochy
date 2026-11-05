#!/usr/bin/env node
// One-off migration: normalize slugs to {title}-{year} and place each movie's
// storage under MOVIE_STORAGE_PATH/<database slug>/.
//
// Safe to run multiple times (idempotent). A dry-run plan is printed first unless
// you pass --apply.
//
// Usage:
//   node scripts/migrate_movie_slugs.mjs            # dry run, shows planned changes
//   node scripts/migrate_movie_slugs.mjs --apply    # actually move files and update DB
//
// Reads DATABASE_URL and MOVIE_STORAGE_PATH from the environment or the project .env file.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const apply = process.argv.includes('--apply');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
readEnvFile(path.join(projectRoot, '.env'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('error: DATABASE_URL is not set (environment or project .env)');
  process.exit(1);
}
const storageRoot = path.resolve(
  process.env.MOVIE_STORAGE_PATH || path.join(projectRoot, 'backend', 'storage', 'uploads')
);

let pg;
try {
  pg = require('pg');
} catch {
  console.error(
    'error: the "pg" package is not installed. Run "npm install" in the project root first.'
  );
  process.exit(1);
}

const slugify = (title, year) => {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'movie'}-${year}`;
};

const folderForSlug = (slug) => slug;
const safeSlug = (slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

// Absolute path for a /media/uploads/... URL, or null when it is not an upload.
const uploadPath = (coverUrl) => {
  if (!coverUrl || !coverUrl.startsWith('/media/uploads/')) return null;
  return path.join(storageRoot, ...coverUrl.slice('/media/uploads/'.length).split('/'));
};

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const rows = (
  await client.query(
    'SELECT id, slug, title, year, cover_url, video_path FROM movies ORDER BY created_at'
  )
).rows;

// Folders are matched through each movie's video_path, NOT by folder name, so
// GUID-named folders like "0a7d96ec...-hls" or "a3f551b3...-save" are fine.
const referencedFolders = new Set();
for (const row of rows) {
  if (row.video_path?.startsWith(storageRoot + path.sep)) {
    referencedFolders.add(row.video_path.slice(storageRoot.length + 1).split(path.sep)[0]);
  }
}
if (!apply) {
  console.log(`Storage root: ${storageRoot}`);
  console.log('Folder -> movie mapping (derived from video_path):');
  for (const row of rows) {
    const folder = row.video_path?.startsWith(storageRoot + path.sep)
      ? row.video_path.slice(storageRoot.length + 1).split(path.sep)[0]
      : '(outside storage root)';
    console.log(
      `  ${folder} -> ${row.title} (target: ${folderForSlug(row.slug || slugify(row.title, row.year))})`
    );
  }
  const orphans = fs.existsSync(storageRoot)
    ? fs
        .readdirSync(storageRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !referencedFolders.has(entry.name))
        .map((entry) => entry.name)
    : [];
  if (orphans.length > 0)
    console.log(`Unreferenced folders (left untouched): ${orphans.join(', ')}`);
  console.log(apply ? '' : '--- dry run, no changes below ---');
}

let updated = 0;
for (const row of rows) {
  const newSlug = slugify(row.title, row.year);
  // Keep already-valid slugs, including collision suffixes, to avoid changing
  // public URLs. Legacy suffix-only slugs become title-year.
  const normalizedSlug = safeSlug(row.slug) && !/^[a-z0-9]+-[0-9a-f]{8}$/.test(row.slug)
    ? row.slug
    : newSlug;
  const folderName = folderForSlug(normalizedSlug);
  const changes = [];
  if (row.slug !== normalizedSlug) changes.push(`slug: ${row.slug} -> ${normalizedSlug}`);

  // Move the video into the movie folder when it lives inside the storage root.
  // Handles both a quality folder ("abc-hls/playlist.m3u8") and a flat file
  // ("abc.mp4") sitting directly in the storage root.
  let newVideoPath = row.video_path;
  const videoRel = row.video_path?.startsWith(storageRoot + path.sep)
    ? path.relative(storageRoot, row.video_path)
    : null;
  if (videoRel) {
    const segments = videoRel.split(path.sep);
    const currentName = segments[0];
    const fromPath = path.join(storageRoot, videoRel);
    const toPath = path.join(storageRoot, folderName, ...segments.slice(1));
    const isFlatFile =
      segments.length === 1 && fs.existsSync(fromPath) && fs.statSync(fromPath).isFile();
    const isFolder = segments.length > 1;
    if ((isFlatFile || isFolder) && fromPath !== toPath) {
      if (isFolder && fs.existsSync(toPath)) {
        console.log(`SKIP ${row.title}: target already exists: ${toPath}`);
        continue;
      }
      if (apply) {
        if (fs.existsSync(fromPath)) {
          fs.mkdirSync(path.dirname(toPath), { recursive: true });
          fs.renameSync(fromPath, toPath);
        } else {
          console.log(`WARN ${row.title}: source missing: ${fromPath}`);
        }
      }
      newVideoPath = toPath;
      changes.push(
        isFlatFile
          ? `video file: ${currentName} -> ${folderName}/${currentName}`
          : `video folder: ${currentName} -> ${folderName}`
      );
    }
  }

  // Correct existing rows too: storage paths must live beneath the configured
  // external root, not in the app container's /app/storage or an old root.
  if (!videoRel && row.video_path) {
    const marker = '/storage/uploads/';
    const index = row.video_path.replaceAll('\\', '/').indexOf(marker);
    if (index >= 0) {
      const relative = row.video_path.replaceAll('\\', '/').slice(index + marker.length);
      const segments = relative.split('/').filter(Boolean);
      if (segments.length > 0) {
        const source = path.join(storageRoot, ...segments);
        const destination = path.join(storageRoot, folderName, ...segments.slice(1));
        if (fs.existsSync(source) && source !== destination) {
          if (apply) {
            if (fs.existsSync(destination)) {
              console.log(`SKIP ${row.title}: target already exists: ${destination}`);
              continue;
            }
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.renameSync(source, destination);
          }
          newVideoPath = destination;
          changes.push(`video: ${source} -> ${destination}`);
        } else if (!fs.existsSync(source)) {
          console.log(`WARN ${row.title}: missing at configured storage root: ${source}`);
        }
      }
    }
  }

  // Move the cover file into the movie folder under the canonical cover.jpg name.
  let newCoverUrl = row.cover_url;
  const coverAbs = uploadPath(row.cover_url);
  if (coverAbs) {
    const targetDir = path.join(storageRoot, folderName);
    const dest = path.join(targetDir, 'cover.jpg');
    const isInsideStorage = coverAbs.startsWith(storageRoot + path.sep);
    const source = isInsideStorage ? coverAbs : null;
    if (coverAbs !== dest) {
      if (source && (fs.existsSync(source) || !apply)) {
        if (apply) {
          fs.mkdirSync(targetDir, { recursive: true });
          if (fs.existsSync(dest)) {
            console.log(`SKIP ${row.title}: cover already exists: ${dest}`);
            continue;
          }
          fs.renameSync(source, dest);
        }
        newCoverUrl = `/media/uploads/${folderName}/cover.jpg`;
        changes.push(`cover: ${path.basename(coverAbs)} -> ${folderName}/cover.jpg`);
      } else {
        console.log(`WARN ${row.title}: cover is outside MOVIE_STORAGE_PATH or missing: ${coverAbs}`);
      }
    }
  }

  if (changes.length === 0) {
    console.log(`OK  ${row.title}: already up to date`);
    continue;
  }
  if (apply) {
    await client.query('UPDATE movies SET slug=$1, cover_url=$2, video_path=$3 WHERE id=$4', [
      normalizedSlug,
      newCoverUrl,
      newVideoPath,
      row.id
    ]);
  }
  console.log(`${apply ? 'UPD' : 'PLAN'} ${row.title}: ${changes.join('; ')}`);
  updated += 1;
}

console.log(
  apply
    ? `\nDone. ${updated} row(s) updated.`
    : `\nDry run. ${updated} row(s) would change. Re-run with --apply.`
);
await client.end();
