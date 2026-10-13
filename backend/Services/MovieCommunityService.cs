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
            SELECT e.id, e.movie_id, e.season_number, e.episode_number,
                   coalesce(nullif(e.title, ''), m.title), m.slug, m.cover_url, m.duration
            FROM series_episodes e JOIN movies m ON m.id=e.movie_id
            WHERE e.series_id=@series
            ORDER BY e.season_number, e.episode_number
            """, ("series", seriesId));
        await using var reader = await command.ExecuteReaderAsync();
        var seasons = new List<SeriesSeason>();
        while (await reader.ReadAsync())
        {
            var number = reader.GetInt32(2);
            if (seasons.Count == 0 || seasons[^1].Number != number) seasons.Add(new(number, []));
            seasons[^1].Episodes.Add(new(reader.GetGuid(0), reader.GetGuid(1), reader.GetInt32(3),
                reader.GetString(4), reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7)));
        }
        return seasons;
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
            INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number,title)
            SELECT s.id, e.id, @season, @episode, @title
            FROM movies s CROSS JOIN movies e
            WHERE s.id=@series AND s.type='Series' AND e.id=@movie
            ON CONFLICT DO NOTHING RETURNING id
            """, ("series", seriesId), ("movie", value.MovieId), ("season", value.SeasonNumber),
            ("episode", value.EpisodeNumber), ("title", title));
        if (await command.ExecuteScalarAsync() is null)
            throw new ApiException("Could not add episode. Check that both movies exist and the episode is not already assigned.", 409);
    }

    public async Task RemoveEpisodeAsync(Guid seriesId, Guid episodeId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("DELETE FROM series_episodes WHERE series_id=@series AND id=@id",
            ("series", seriesId), ("id", episodeId));
        if (await command.ExecuteNonQueryAsync() == 0) throw new ApiException("Episode not found", 404);
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
}
