using System.Text.Json;
using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class MovieService(Database database, IWebHostEnvironment environment, MediaLibraryService mediaLibrary)
{
    private const long UploadMaxBytes = 8589934592L;
    private const string Columns = "id,slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,created_at,updated_at,title_tm,title_en,title_ru,description_tm,description_en,description_ru";
    private static readonly JsonSerializerOptions SubtitleJson = new(JsonSerializerDefaults.Web);

    public async Task<List<MovieRow>> ListAsync(string? search)
    {
        await using var connection = await database.OpenAsync();
        var filter = string.IsNullOrWhiteSpace(search) ? "" : " WHERE title_tm ILIKE @search OR title_en ILIKE @search OR title_ru ILIKE @search OR description_tm ILIKE @search OR description_en ILIKE @search OR description_ru ILIKE @search";
        await using var command = connection.Command($"SELECT {Columns} FROM movies{filter} ORDER BY created_at DESC", ("search", $"%{search}%"));
        return await ReadMany(command);
    }

    public async Task<List<MovieRow>> FavoritesAsync(Guid userId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"SELECT {string.Join(',', Columns.Split(',').Select(x => "m." + x))} FROM movies m JOIN favorite_movies f ON f.movie_id=m.id WHERE f.user_id=@id ORDER BY f.created_at DESC", ("id", userId));
        return await ReadMany(command);
    }

    public async Task<List<MovieRow>> RecommendationsAsync(MovieRow movie)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"""
            SELECT {Columns} FROM movies
            WHERE id <> @id
            ORDER BY (CASE WHEN type=@type THEN 2 ELSE 0 END + CASE WHEN genre=@genre THEN 3 ELSE 0 END) DESC,
                     rating DESC NULLS LAST, created_at DESC
            LIMIT 6
            """, ("id", movie.Id), ("type", movie.Type), ("genre", movie.Genre));
        return await ReadMany(command);
    }

    public async Task<MovieRow?> FindAsync(string key, bool byId = false)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"SELECT {Columns} FROM movies WHERE {(byId ? "id::text" : "slug") }=@key", ("key", key));
        var rows = await ReadMany(command); return rows.FirstOrDefault();
    }

    public async Task<List<GenreView>> GenresAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT name,name_tm,name_en,name_ru FROM genres WHERE name_en IS NOT NULL ORDER BY name_en");
        await using var reader = await command.ExecuteReaderAsync(); var result = new List<GenreView>();
        while (await reader.ReadAsync()) result.Add(new(reader.GetString(0),reader.GetString(1),reader.GetString(2),reader.GetString(3))); return result;
    }

    public async Task<List<CountryView>> CountriesAsync()
    {
        await using var connection=await database.OpenAsync();
        await using var command=connection.Command("SELECT code,name FROM countries ORDER BY name");
        await using var reader=await command.ExecuteReaderAsync();var result=new List<CountryView>();
        while(await reader.ReadAsync())result.Add(new(reader.GetString(0),reader.GetString(1)));return result;
    }

    public async Task<List<SubtitleCue>> SubtitlesAsync(Guid movieId, string language)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT cues::text FROM subtitles WHERE movie_id=@id AND language=@language", ("id", movieId), ("language", language));
        var value = await command.ExecuteScalarAsync() as string ?? "[]"; return JsonSerializer.Deserialize<List<SubtitleCue>>(value, SubtitleJson) ?? [];
    }

    public async Task DeleteAsync(Guid id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("DELETE FROM movies WHERE id=@id", ("id", id));
        if (await command.ExecuteNonQueryAsync() == 0) throw new ApiException("Movie not found", 404);
    }

    public async Task<MovieRow> SaveAsync(Guid? id, IFormCollection form)
    {
        var existingMovie=id is null?null:await FindAsync(id.Value.ToString(),true);
        if(id is not null&&existingMovie is null)throw new ApiException("Movie not found",404);
        var titleTm=form["titleTm"].ToString().Trim();
        var titleEn=form["titleEn"].ToString().Trim();
        var titleRu=form["titleRu"].ToString().Trim();
        var descriptionTm=form["descriptionTm"].ToString().Trim();
        var descriptionEn=form["descriptionEn"].ToString().Trim();
        var descriptionRu=form["descriptionRu"].ToString().Trim();
        if(new[]{titleTm,titleEn,titleRu}.Any(string.IsNullOrWhiteSpace))throw new ApiException("Movie titles are required in Turkmen, English, and Russian.");
        if(new[]{descriptionTm,descriptionEn,descriptionRu}.Any(string.IsNullOrWhiteSpace))throw new ApiException("Movie descriptions are required in Turkmen, English, and Russian.");
        var title=titleEn;
        var movieType=NormalizeMovieType(form["type"].ToString());
        foreach(var file in form.Files)if(file.Length>UploadMaxBytes)throw new ApiException($"{file.FileName} exceeds the 8 GiB upload limit",413);
        var playlist=form.Files.GetFile("video");
        var subtitleZip=form.Files.GetFile("subtitleZip");
        var hlsFiles=form.Files.Where(file=>file.Name=="hlsFiles").ToList();
        var qualityZips=form.Files.Where(file=>file.Name.StartsWith("quality_",StringComparison.OrdinalIgnoreCase)).Select(file=>(Quality:file.Name[8..].ToLowerInvariant(),Zip:file)).ToList();
        var serverMediaPath=form["serverMediaPath"].ToString().Trim();
        var isHls=playlist is not null && Path.GetExtension(playlist.FileName).Equals(".m3u8",StringComparison.OrdinalIgnoreCase);
        var isHlsZip=playlist is not null && Path.GetExtension(playlist.FileName).Equals(".zip",StringComparison.OrdinalIgnoreCase);
        if(!isHls && !isHlsZip && hlsFiles.Count>0)throw new ApiException("HLS segments require an .m3u8 playlist.");
        if(isHlsZip && hlsFiles.Count>0)throw new ApiException("A ZIP bundle must contain all HLS playlists and media files.");
        if(serverMediaPath.Length>0&&(playlist is not null||hlsFiles.Count>0||qualityZips.Count>0))throw new ApiException("Choose either a server movie folder or uploaded files, not both.");
        if(qualityZips.Count>0&&(playlist is not null||hlsFiles.Count>0))throw new ApiException("Upload either separate quality ZIPs or one complete HLS bundle, not both.");
        if(id is null && !movieType.Equals("Series",StringComparison.Ordinal) && playlist is null && qualityZips.Count==0 && serverMediaPath.Length==0)throw new ApiException("Video, HLS quality ZIP, or server movie folder is required");
        if(playlist is not null && !isHls && !isHlsZip && !new[]{".mp4",".webm",".mkv"}.Contains(Path.GetExtension(playlist.FileName),StringComparer.OrdinalIgnoreCase))throw new ApiException("Upload an MP4, WebM, MKV, M3U8 playlist, or HLS ZIP bundle.");
        var uploadRoot=Path.Combine(environment.ContentRootPath,"storage","uploads");Directory.CreateDirectory(uploadRoot);
        async Task<string?> Save(string key){var file=form.Files.GetFile(key);if(file is null)return null;var name=$"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";var path=Path.Combine(uploadRoot,name);await using var output=File.Create(path);await file.CopyToAsync(output);return path;}
        MediaLibraryService.ImportResult? libraryImport=serverMediaPath.Length>0?await mediaLibrary.ImportAsync(serverMediaPath,uploadRoot):null;
        var video=serverMediaPath.Length>0?libraryImport!.Playlist:qualityZips.Count>0?await HlsUpload.SaveQualityBundleAsync(qualityZips,uploadRoot,existingMovie?.VideoPath):isHlsZip?await HlsUpload.SaveZipAsync(playlist!,uploadRoot):isHls?await HlsUpload.SaveAsync(playlist!,hlsFiles,uploadRoot):await Save("video");
        var cover=await Save("cover");var en=form.Files.GetFile("subtitleEn");var ru=form.Files.GetFile("subtitleRu");
        if(subtitleZip is not null&&(en is not null||ru is not null))throw new ApiException("Upload a subtitle ZIP or separate subtitle files, not both.");
        var subtitleSources=serverMediaPath.Length>0?libraryImport!.Subtitles:new Dictionary<string,string>();
        if(subtitleZip is not null)subtitleSources=await SubtitleBundle.ReadAsync(subtitleZip);
        else{if(en is not null)subtitleSources["en"]=await ReadTextAsync(en);if(ru is not null)subtitleSources["ru"]=await ReadTextAsync(ru);}
        var suffix=(id??Guid.NewGuid()).ToString("N")[..8];
        var slug=System.Text.RegularExpressions.Regex.Replace(title.ToLowerInvariant(),"[^a-z0-9]+","-").Trim('-')+"-"+suffix;
        var genreValues=(JsonSerializer.Deserialize<string[]>(form["genres"].ToString())??["Drama"]).Select(NormalizeGenre).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var genres=JsonSerializer.Serialize(genreValues.Length>0?genreValues:["Drama"]);
        if(libraryImport?.Episodes.Count>0&&id is not null)throw new ApiException("A complete series folder can only be imported when creating a new series.");
        if(libraryImport?.Episodes.Count>0&&!movieType.Equals("Series",StringComparison.Ordinal))throw new ApiException("A folder with seasons and episodes must use the Series type.");
        var difficulty=NormalizeDifficulty(form["difficulty"].ToString());
        var year=ParseYear(form["year"].ToString());
        var ratingValue=decimal.TryParse(form["rating"].ToString(),out var parsedRating)?parsedRating:8m;
        var countryRaw=form["country"].ToString();var country=countryRaw.StartsWith('[')?string.Join(", ",JsonSerializer.Deserialize<string[]>(countryRaw)??[]):countryRaw;
        await using var connection=await database.OpenAsync();await using var tx=await connection.BeginTransactionAsync();
        Guid movieId;
        if(id is null){if(video is null&&!movieType.Equals("Series",StringComparison.Ordinal))throw new ApiException("Video is required");const string sql="""INSERT INTO movies(slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,title_tm,title_en,title_ru,description_tm,description_en,description_ru) VALUES(@slug,@title,@original,@description,@year,@country,@genre,@genres::jsonb,@type,@duration,@rating,@difficulty,@accent,@age,@cover,@video,@titleTm,@titleEn,@titleRu,@descriptionTm,@descriptionEn,@descriptionRu) RETURNING id""";await using var q=connection.Command(sql,("slug",slug),("title",title),("original",form["originalTitle"].ToString()),("description",descriptionEn),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",movieType),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",cover is null?null:"/media/uploads/"+Path.GetFileName(cover)),("video",video??""),("titleTm",titleTm),("titleEn",titleEn),("titleRu",titleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu));movieId=(Guid)(await q.ExecuteScalarAsync())!;}
        else{movieId=id.Value;const string sql="""UPDATE movies SET title=@title,original_title=@original,description=@description,title_tm=@titleTm,title_en=@titleEn,title_ru=@titleRu,description_tm=@descriptionTm,description_en=@descriptionEn,description_ru=@descriptionRu,year=@year,country=@country,genre=@genre,genres=@genres::jsonb,type=@type,duration=@duration,rating=@rating,difficulty=@difficulty,accent=@accent,age_rating=@age,cover_url=coalesce(@cover,cover_url),video_path=coalesce(@video,video_path),updated_at=now() WHERE id=@id""";await using var q=connection.Command(sql,("id",movieId),("title",title),("original",form["originalTitle"].ToString()),("description",descriptionEn),("titleTm",titleTm),("titleEn",titleEn),("titleRu",titleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",movieType),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",cover is null?null:"/media/uploads/"+Path.GetFileName(cover)),("video",video));if(await q.ExecuteNonQueryAsync()==0)throw new ApiException("Movie not found",404);}
        async Task SaveSubtitles(Guid targetId,Dictionary<string,string> sources){foreach(var item in sources){var cues=SubtitleParser.Parse(item.Value);if(cues.Count==0)throw new ApiException($"{item.Key.ToUpperInvariant()} subtitle file has no valid cues.");await using var q=connection.Command("INSERT INTO subtitles(movie_id,language,cues) VALUES(@id,@language,@cues::jsonb) ON CONFLICT(movie_id,language) DO UPDATE SET cues=excluded.cues",("id",targetId),("language",item.Key),("cues",JsonSerializer.Serialize(cues,SubtitleJson)));await q.ExecuteNonQueryAsync();}}
        await SaveSubtitles(movieId,subtitleSources);
        if(libraryImport?.Episodes.Count>0)
        {
            foreach(var episode in libraryImport.Episodes)
            {
                var episodeTitle=$"{titleEn} — {episode.Title}";
                var episodeTitleTm=$"{titleTm} — {episode.Title}";
                var episodeTitleRu=$"{titleRu} — {episode.Title}";
                var episodeSlug=System.Text.RegularExpressions.Regex.Replace(episodeTitle.ToLowerInvariant(),"[^a-z0-9]+","-").Trim('-')+"-"+Guid.NewGuid().ToString("N")[..8];
                const string episodeSql="""INSERT INTO movies(slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,title_tm,title_en,title_ru,description_tm,description_en,description_ru) VALUES(@slug,@title,@title,@description,@year,@country,@genre,@genres::jsonb,'Episode',@duration,@rating,@difficulty,@accent,@age,@cover,@video,@titleTm,@titleEn,@titleRu,@descriptionTm,@descriptionEn,@descriptionRu) RETURNING id""";
                await using var episodeCommand=connection.Command(episodeSql,("slug",episodeSlug),("title",episodeTitle),("description",descriptionEn),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",cover is null?null:"/media/uploads/"+Path.GetFileName(cover)),("video",episode.Playlist),("titleTm",episodeTitleTm),("titleEn",episodeTitle),("titleRu",episodeTitleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu));
                var episodeId=(Guid)(await episodeCommand.ExecuteScalarAsync())!;
                await SaveSubtitles(episodeId,episode.Subtitles);
                await using var seasonCommand=connection.Command("INSERT INTO series_seasons(series_id,season_number) VALUES(@series,@season) ON CONFLICT DO NOTHING",("series",movieId),("season",episode.SeasonNumber));
                await seasonCommand.ExecuteNonQueryAsync();
                await using var link=connection.Command("INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number,title) VALUES(@series,@movie,@season,@episode,@title)",("series",movieId),("movie",episodeId),("season",episode.SeasonNumber),("episode",episode.EpisodeNumber),("title",episode.Title));
                await link.ExecuteNonQueryAsync();
            }
        }
        await tx.CommitAsync();return (await FindAsync(movieId.ToString(),true))!;
    }

    private static async Task<string> ReadTextAsync(IFormFile file){using var reader=new StreamReader(file.OpenReadStream());return await reader.ReadToEndAsync();}

    private static string NormalizeGenre(string value)
    {
        var normalized=value.Trim().ToLowerInvariant();
        return normalized switch
        {
            "боевик" or "aksiýon" => "Action", "приключения" or "başdan geçirme" or "sargytly" => "Adventure",
            "animation" or "анимация" or "мультфильм" or "cartoon" or "animasiýa" or "multfilm" => "Cartoon", "комедия" or "komediýa" => "Comedy",
            "криминал" or "jenaýat" => "Crime", "документальный" or "dokumental" => "Documentary",
            "драма" or "drama" => "Drama", "семейный" or "maşgala" => "Family",
            "фэнтези" or "fantastika" => "Fantasy", "исторический" or "taryhy" => "History",
            "ужасы" or "gorky" => "Horror", "детектив" or "syrly" => "Mystery",
            "романтика" or "söýgi" => "Romance", "научная фантастика" or "ylmy-fantastika" => "Sci-Fi",
            "триллер" or "triller" => "Thriller", "военный" or "uruş" => "War",
            _ => value.Trim()
        };
    }

    private static string NormalizeMovieType(string value) => value.Trim().ToLowerInvariant() switch
    {
        "animation" or "animations" or "cartoon" or "cartoons" => "Cartoon",
        "series" => "Series",
        _ => "Movie"
    };

    private static string NormalizeDifficulty(string value) => value.Trim().ToLowerInvariant() switch
    {
        "easy" => "easy", "hard" => "hard", _ => "medium"
    };

    private static int ParseYear(string value)
    {
        var maximum=DateTime.UtcNow.Year+5;
        if(!int.TryParse(value,System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out var year)||year<1888||year>maximum)
            throw new ApiException($"Year must be a whole number between 1888 and {maximum}.");
        return year;
    }

    private static async Task<List<MovieRow>> ReadMany(Npgsql.NpgsqlCommand command)
    {
        await using var reader = await command.ExecuteReaderAsync(); var rows = new List<MovieRow>();
        while (await reader.ReadAsync()) rows.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.IsDBNull(3)?null:reader.GetString(3),
            reader.GetString(4), reader.IsDBNull(5)?null:reader.GetInt32(5), reader.IsDBNull(6)?null:reader.GetString(6), reader.IsDBNull(7)?null:reader.GetString(7),
            JsonSerializer.Deserialize<JsonElement>(reader.GetString(8)), reader.GetString(9), reader.IsDBNull(10)?null:reader.GetString(10), reader.IsDBNull(11)?null:reader.GetDecimal(11),
            reader.IsDBNull(12)?null:reader.GetString(12), reader.IsDBNull(13)?null:reader.GetString(13), reader.IsDBNull(14)?null:reader.GetString(14), reader.IsDBNull(15)?null:reader.GetString(15),
            reader.GetString(16), reader.GetDateTime(17), reader.GetDateTime(18), reader.GetString(19), reader.GetString(20), reader.GetString(21),
            reader.GetString(22), reader.GetString(23), reader.GetString(24)));
        return rows;
    }
}
