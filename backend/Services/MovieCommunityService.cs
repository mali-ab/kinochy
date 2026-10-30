using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class MovieCommunityService(Database database)
{
    public async Task<List<SeriesSeason>> SeasonsAsync(Guid seriesId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("""
            SELECT s.season_number, s.title, e.id, e.movie_id, e.episode_number,
                   coalesce(nullif(e.title, ''), m.title), m.slug, m.cover_url, m.duration
            FROM series_seasons s
            LEFT JOIN series_episodes e ON e.series_id=s.series_id AND e.season_number=s.season_number
            LEFT JOIN movies m ON m.id=e.movie_id
            WHERE s.series_id=@series
            ORDER BY s.season_number, e.episode_number
            """, ("series", seriesId));
        await using var reader = await command.ExecuteReaderAsync();
        var seasons = new List<SeriesSeason>();
        while (await reader.ReadAsync())
        {
            var number = reader.GetInt32(0);
            if (seasons.Count == 0 || seasons[^1].Number != number)
                seasons.Add(new(number, reader.IsDBNull(1) ? null : reader.GetString(1), []));
            if (!reader.IsDBNull(2))
                seasons[^1].Episodes.Add(new(reader.GetGuid(2), reader.GetGuid(3), reader.GetInt32(4),
                    reader.GetString(5), reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetString(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8)));
        }
        return seasons;
    }

    public async Task AddSeasonAsync(Guid seriesId, SeriesSeasonRequest value)
    {
        if (value.SeasonNumber is < 1 or > 100) throw new ApiException("Season must be between 1 and 100.");
        var title = value.Title?.Trim();
        if (title?.Length > 200) throw new ApiException("Season title is too long.");
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("""
            WITH parent AS (
              SELECT id FROM movies WHERE id=@series AND is_series FOR UPDATE
            )
            INSERT INTO series_seasons(series_id,season_number,title)
            SELECT id,@season,@title FROM parent
            ON CONFLICT DO NOTHING RETURNING season_number
            """, ("series", seriesId), ("season", value.SeasonNumber), ("title", title));
        if (await command.ExecuteScalarAsync() is null)
            throw new ApiException("Could not create season. Check that the series exists and the season number is unused.", 409);
    }

    public async Task RemoveSeasonAsync(Guid seriesId, int seasonNumber)
    {
        await using var connection = await database.OpenAsync();
        await using var hasEpisodes = connection.Command("SELECT EXISTS(SELECT 1 FROM series_episodes WHERE series_id=@series AND season_number=@season)", ("series", seriesId), ("season", seasonNumber));
        if ((bool)(await hasEpisodes.ExecuteScalarAsync())!)
            throw new ApiException("Remove all episodes from this season before deleting it.", 409);
        await using var command = connection.Command("DELETE FROM series_seasons WHERE series_id=@series AND season_number=@season", ("series", seriesId), ("season", seasonNumber));
        if (await command.ExecuteNonQueryAsync() == 0) throw new ApiException("Season not found", 404);
    }

    public async Task AddEpisodeAsync(Guid seriesId, SeriesEpisodeRequest value)
    {
        if (value.MovieId == seriesId) throw new ApiException("A series cannot be its own episode.");
        if (value.SeasonNumber is < 1 or > 100 || value.EpisodeNumber is < 1 or > 1000)
            throw new ApiException("Season must be 1–100 and episode must be 1–1000.");
        var title = value.Title?.Trim();
        if (title?.Length > 200) throw new ApiException("Episode title is too long.");
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("""
            WITH linked AS (
              INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number,title)
              SELECT s.id, e.id, @season, @episode, @title
              FROM movies s CROSS JOIN movies e
              WHERE s.id=@series AND s.is_series AND e.id=@movie AND NOT e.is_series
                AND EXISTS(SELECT 1 FROM series_seasons ss WHERE ss.series_id=s.id AND ss.season_number=@season)
                AND NOT EXISTS(SELECT 1 FROM series_episodes used WHERE used.movie_id=e.id)
              ON CONFLICT DO NOTHING RETURNING movie_id
            )
            UPDATE movies SET type='Episode',updated_at=now()
            WHERE id=(SELECT movie_id FROM linked) RETURNING id
            """, ("series", seriesId), ("movie", value.MovieId), ("season", value.SeasonNumber),
            ("episode", value.EpisodeNumber), ("title", title));
        if (await command.ExecuteScalarAsync() is null)
            throw new ApiException("Could not add episode. Check that both movies exist and the episode is not already assigned.", 409);
    }

    public async Task RemoveEpisodeAsync(Guid seriesId, Guid episodeId)
    {
        await using var connection = await database.OpenAsync();
        await using var transaction=await connection.BeginTransactionAsync();
        await using var command = connection.Command("DELETE FROM series_episodes WHERE series_id=@series AND id=@id RETURNING movie_id",
            ("series", seriesId), ("id", episodeId));
        var movieId = await command.ExecuteScalarAsync();
        if (movieId is null) throw new ApiException("Episode not found", 404);
        await using var restore = connection.Command("UPDATE movies SET type=(SELECT type FROM movies WHERE id=@series),updated_at=now() WHERE id=@movie AND NOT EXISTS(SELECT 1 FROM series_episodes WHERE movie_id=@movie)", ("movie", movieId), ("series",seriesId));
        await restore.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
    }

    public async Task<List<MovieComment>> CommentsAsync(Guid movieId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("""
            SELECT c.id,c.user_id,u.username,c.body,c.created_at
            FROM movie_comments c JOIN users u ON u.id=c.user_id
            WHERE c.movie_id=@movie ORDER BY c.created_at DESC LIMIT 50
            """, ("movie", movieId));
        await using var reader = await command.ExecuteReaderAsync();
        var comments = new List<MovieComment>();
        while (await reader.ReadAsync())
            comments.Add(new(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3), reader.GetDateTime(4)));
        return comments;
    }

    public async Task<MovieComment> AddCommentAsync(Guid movieId, Guid userId, string? body)
    {
        var text = body?.Trim() ?? "";
        if (text.Length is < 1 or > 1000) throw new ApiException("Comment must be between 1 and 1000 characters.");
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("""
            WITH inserted AS (
              INSERT INTO movie_comments(movie_id,user_id,body)
              VALUES(@movie,@user,@body) RETURNING id,user_id,body,created_at
            )
            SELECT c.id,c.user_id,u.username,c.body,c.created_at
            FROM inserted c JOIN users u ON u.id=c.user_id
            """, ("movie", movieId), ("user", userId), ("body", text));
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        return new(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3), reader.GetDateTime(4));
    }

    public async Task RemoveCommentAsync(Guid movieId, Guid commentId, Guid userId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("DELETE FROM movie_comments WHERE id=@id AND movie_id=@movie AND user_id=@user",
            ("id", commentId), ("movie", movieId), ("user", userId));
        if (await command.ExecuteNonQueryAsync() == 0) throw new ApiException("Comment not found", 404);
    }

    /// <summary>
    /// Returns a bounded page for the admin moderation queue. Filtering stays in
    /// PostgreSQL so large comment tables are never loaded into application memory.
    /// </summary>
    public async Task<AdminCommentPage> AdminCommentsAsync(int page, int pageSize, string? search, Guid? movieId)
    {
        page=Math.Max(1,page);
        pageSize=Math.Clamp(pageSize,1,100);
        var term=search?.Trim()??"";
        if(term.Length>100)throw new ApiException("Comment search is limited to 100 characters.");
        var selectedMovie=movieId??Guid.Empty;
        var filter="WHERE (@movie='00000000-0000-0000-0000-000000000000'::uuid OR c.movie_id=@movie) AND (@search='' OR c.body ILIKE @pattern OR u.username ILIKE @pattern OR u.email ILIKE @pattern OR m.title ILIKE @pattern)";

        await using var connection=await database.OpenAsync();
        await using var countCommand=connection.Command($"SELECT count(*) FROM movie_comments c JOIN users u ON u.id=c.user_id JOIN movies m ON m.id=c.movie_id {filter}",
            ("movie",selectedMovie),("search",term),("pattern",$"%{term}%"));
        var total=(long)(await countCommand.ExecuteScalarAsync())!;

        await using var command=connection.Command($"""
            SELECT c.id,c.movie_id,m.title,m.slug,c.user_id,u.username,u.email,c.body,c.created_at
            FROM movie_comments c
            JOIN users u ON u.id=c.user_id
            JOIN movies m ON m.id=c.movie_id
            {filter}
            ORDER BY c.created_at DESC,c.id DESC
            LIMIT @limit OFFSET @offset
            """,("movie",selectedMovie),("search",term),("pattern",$"%{term}%"),("limit",pageSize),("offset",(long)(page-1)*pageSize));
        await using var reader=await command.ExecuteReaderAsync();
        var items=new List<AdminComment>();
        while(await reader.ReadAsync())items.Add(new(reader.GetGuid(0),reader.GetGuid(1),reader.GetString(2),reader.GetString(3),
            reader.GetGuid(4),reader.GetString(5),reader.GetString(6),reader.GetString(7),reader.GetDateTime(8)));
        return new(items,page,pageSize,total);
    }

    public async Task RemoveCommentAsAdminAsync(Guid commentId)
    {
        await using var connection=await database.OpenAsync();
        await using var command=connection.Command("DELETE FROM movie_comments WHERE id=@id",("id",commentId));
        if(await command.ExecuteNonQueryAsync()==0)throw new ApiException("Comment not found",404);
    }
}
