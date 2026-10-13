# Puzzle Movies public-page exporter

Exports movie metadata and any English/Russian subtitle cues embedded in a **public film page**. It does not download video, access subscriber-only content, or produce complete subtitles when the site exposes only a preview.

Requires Python 3.9+; no packages or Docker installation are needed.

```bash
python3 scripts/puzzle_movies/export.py \
  https://puzzle-movies.com/films/total-recall-2012 \
  --output ./puzzle_movies_output
```

You can pass several `/films/` URLs. Each film gets its own directory with `movie.json` and, when public cues exist, `subtitles.en.srt` and `subtitles.ru.srt`. Check the content rights and the site's terms before importing or redistributing anything. For complete films and subtitles, use a source that explicitly grants download rights.

If your account is allowed to access additional page content, set `PUZZLE_MOVIES_COOKIE` to the `Cookie` request header from your own signed-in browser session. You can set it in your shell or in the repository-root `.env` file (which is Git-ignored):

```dotenv
PUZZLE_MOVIES_COOKIE="PHPSESSID=your-session-value; other_cookie=your-value"
```

The exporter sends this cookie only to `puzzle-movies.com` and does not print it. Do not commit or share your session cookie. Email/password login is not implemented. Authentication only changes which page content your account can access; it does not add video downloading or guarantee complete subtitles.
