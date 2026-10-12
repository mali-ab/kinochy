using System.Text.Json;
using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class MovieService(Database database, IWebHostEnvironment environment)
{
    private const string Columns = "id,slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,created_at,updated_at";

    public async Task<List<MovieRow>> ListAsync(string? search)
    {
        await using var connection = await database.OpenAsync();
        var filter = string.IsNullOrWhiteSpace(search) ? "" : " WHERE title ILIKE @search OR description ILIKE @search";
        await using var command = connection.Command($"SELECT {Columns} FROM movies{filter} ORDER BY created_at DESC", ("search", $"%{search}%"));
        return await ReadMany(command);
    }

    public async Task<List<MovieRow>> FavoritesAsync(Guid userId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"SELECT {string.Join(',', Columns.Split(',').Select(x => "m." + x))} FROM movies m JOIN favorite_movies f ON f.movie_id=m.id WHERE f.user_id=@id ORDER BY f.created_at DESC", ("id", userId));
        return await ReadMany(command);
    }

    public async Task<MovieRow?> FindAsync(string key, bool byId = false)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"SELECT {Columns} FROM movies WHERE {(byId ? "id::text" : "slug") }=@key", ("key", key));
        var rows = await ReadMany(command); return rows.FirstOrDefault();
    }

    public async Task<string[]> GenresAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT name FROM genres ORDER BY name");
        await using var reader = await command.ExecuteReaderAsync(); var result = new List<string>();
        while (await reader.ReadAsync()) result.Add(reader.GetString(0)); return result.ToArray();
    }

    public async Task<JsonElement> SubtitlesAsync(Guid movieId, string language)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT cues::text FROM subtitles WHERE movie_id=@id AND language=@language", ("id", movieId), ("language", language));
        var value = await command.ExecuteScalarAsync() as string ?? "[]"; return JsonSerializer.Deserialize<JsonElement>(value);
    }

    public async Task DeleteAsync(Guid id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("DELETE FROM movies WHERE id=@id", ("id", id));
        if (await command.ExecuteNonQueryAsync() == 0) throw new ApiException("Movie not found", 404);
    }

    public async Task<MovieRow> SaveAsync(Guid? id, IFormCollection form)
    {
        var uploadRoot=Path.Combine(environment.ContentRootPath,"storage","uploads");Directory.CreateDirectory(uploadRoot);
        async Task<string?> Save(string key){var file=form.Files.GetFile(key);if(file is null)return null;var name=$"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";var path=Path.Combine(uploadRoot,name);await using var output=File.Create(path);await file.CopyToAsync(output);return path;}
        var video=await Save("video");var cover=await Save("cover");var en=await Save("subtitleEn");var ru=await Save("subtitleRu");
        var title=form["title"].ToString().Trim();if(title.Length==0)throw new ApiException("Title is required");
        var suffix=(id??Guid.NewGuid()).ToString("N")[..8];
        var slug=System.Text.RegularExpressions.Regex.Replace(title.ToLowerInvariant(),"[^a-z0-9]+","-").Trim('-')+"-"+suffix;
        var genres=JsonSerializer.Serialize(JsonSerializer.Deserialize<string[]>(form["genres"].ToString())??["Drama"]);
        var countryRaw=form["country"].ToString();var country=countryRaw.StartsWith('[')?string.Join(", ",JsonSerializer.Deserialize<string[]>(countryRaw)??[]):countryRaw;
        await using var connection=await database.OpenAsync();await using var tx=await connection.BeginTransactionAsync();
        Guid movieId;
        if(id is null){if(video is null)throw new ApiException("Video is required");const string sql="""INSERT INTO movies(slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path) VALUES(@slug,@title,@original,@description,@year,@country,@genre,@genres::jsonb,@type,@duration,@rating,@difficulty,@accent,@age,@cover,@video) RETURNING id""";await using var q=connection.Command(sql,("slug",slug),("title",title),("original",form["originalTitle"].ToString()),("description",form["description"].ToString()),("year",int.TryParse(form["year"].ToString(),out var year)?year:null),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",form["type"].ToString()),("duration",form["duration"].ToString()),("rating",decimal.TryParse(form["rating"].ToString(),out var rating)?rating:8m),("difficulty",form["difficulty"].ToString()),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",cover is null?null:"/media/uploads/"+Path.GetFileName(cover)),("video",video));movieId=(Guid)(await q.ExecuteScalarAsync())!;}
        else{movieId=id.Value;const string sql="""UPDATE movies SET title=@title,original_title=@original,description=@description,year=@year,country=@country,genre=@genre,genres=@genres::jsonb,type=@type,duration=@duration,rating=@rating,difficulty=@difficulty,accent=@accent,age_rating=@age,cover_url=coalesce(@cover,cover_url),video_path=coalesce(@video,video_path),updated_at=now() WHERE id=@id""";await using var q=connection.Command(sql,("id",movieId),("title",title),("original",form["originalTitle"].ToString()),("description",form["description"].ToString()),("year",int.TryParse(form["year"].ToString(),out var year)?year:null),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",form["type"].ToString()),("duration",form["duration"].ToString()),("rating",decimal.TryParse(form["rating"].ToString(),out var rating)?rating:8m),("difficulty",form["difficulty"].ToString()),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",cover is null?null:"/media/uploads/"+Path.GetFileName(cover)),("video",video));if(await q.ExecuteNonQueryAsync()==0)throw new ApiException("Movie not found",404);}
        foreach(var item in new[]{("en",en),("ru",ru)})if(item.Item2 is not null){var cues=SubtitleParser.Parse(await File.ReadAllTextAsync(item.Item2));await using var q=connection.Command("INSERT INTO subtitles(movie_id,language,cues) VALUES(@id,@language,@cues::jsonb) ON CONFLICT(movie_id,language) DO UPDATE SET cues=excluded.cues",("id",movieId),("language",item.Item1),("cues",JsonSerializer.Serialize(cues)));await q.ExecuteNonQueryAsync();}
        await tx.CommitAsync();return (await FindAsync(movieId.ToString(),true))!;
    }

    private static async Task<List<MovieRow>> ReadMany(Npgsql.NpgsqlCommand command)
    {
        await using var reader = await command.ExecuteReaderAsync(); var rows = new List<MovieRow>();
        while (await reader.ReadAsync()) rows.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.IsDBNull(3)?null:reader.GetString(3),
            reader.GetString(4), reader.IsDBNull(5)?null:reader.GetInt32(5), reader.IsDBNull(6)?null:reader.GetString(6), reader.IsDBNull(7)?null:reader.GetString(7),
            JsonSerializer.Deserialize<JsonElement>(reader.GetString(8)), reader.GetString(9), reader.IsDBNull(10)?null:reader.GetString(10), reader.IsDBNull(11)?null:reader.GetDecimal(11),
            reader.IsDBNull(12)?null:reader.GetString(12), reader.IsDBNull(13)?null:reader.GetString(13), reader.IsDBNull(14)?null:reader.GetString(14), reader.IsDBNull(15)?null:reader.GetString(15),
            reader.GetString(16), reader.GetDateTime(17), reader.GetDateTime(18)));
        return rows;
    }
}
