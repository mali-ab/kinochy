using System.Text.Json;
using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class MovieService(Database database, IWebHostEnvironment environment, MediaLibraryService mediaLibrary)
{
    private const long UploadMaxBytes = 8589934592L;
    private const string Columns = "id,slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,created_at,updated_at,title_tm,title_en,title_ru,description_tm,description_en,description_ru,is_series";
    private static readonly JsonSerializerOptions SubtitleJson = new(JsonSerializerDefaults.Web);

    public async Task<MovieCatalogPage> CatalogAsync(string? search,int page=1,int pageSize=24,string? category=null,bool? isSeries=null)
    {
        if(page<1||pageSize is < 1 or > 100)throw new ApiException("Page must be positive and pageSize must be between 1 and 100.");
        search=search?.Trim();
        if(search?.Length>200)throw new ApiException("Catalog search is limited to 200 characters.");
        if(category is not null&&category is not ("Movie" or "Cartoon"))throw new ApiException("Category must be Movie or Cartoon.");
        await using var connection = await database.OpenAsync();
        var filter=" WHERE type IN ('Movie','Cartoon') AND NOT EXISTS(SELECT 1 FROM series_episodes e WHERE e.movie_id=movies.id)";
        if(!string.IsNullOrWhiteSpace(search))filter+=" AND (title_tm ILIKE @search OR title_en ILIKE @search OR title_ru ILIKE @search OR description_tm ILIKE @search OR description_en ILIKE @search OR description_ru ILIKE @search)";
        if(category is not null)filter+=" AND type=@category";
        if(isSeries is not null)filter+=" AND is_series=@series";
        var parameters=new (string Name,object? Value)[]{("search",$"%{search}%"),("category",category??""),("series",isSeries??false)};
        await using var count=connection.Command($"SELECT count(*) FROM movies{filter}",parameters);
        var total=(long)(await count.ExecuteScalarAsync())!;
        await using var command=connection.Command($"SELECT {Columns} FROM movies{filter} ORDER BY created_at DESC,id DESC LIMIT @limit OFFSET @offset",
            [..parameters,("limit",pageSize),("offset",(long)(page-1)*pageSize)]);
        return new((await ReadMany(command)).Select(MovieCard.From).ToList(),page,pageSize,total);
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
            SELECT {string.Join(',', Columns.Split(',').Select(column => "m." + column))}
            FROM movies m
            WHERE m.id <> @id AND m.id <> @parent
              AND lower(m.type) <> 'episode'
              AND NOT EXISTS (
                  SELECT 1 FROM series_episodes episode
                  WHERE episode.movie_id = m.id
              )
            ORDER BY (CASE WHEN m.type=@type THEN 2 ELSE 0 END + CASE WHEN m.genre=@genre THEN 3 ELSE 0 END) DESC,
                     m.rating DESC NULLS LAST, m.created_at DESC
            LIMIT 6
            """, ("id", movie.Id), ("parent",movie.Episode?.SeriesId??Guid.Empty), ("type", movie.Category), ("genre", movie.Genre));
        return await ReadMany(command);
    }

    public async Task<MovieRow?> FindAsync(string key, bool byId = false)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command($"SELECT {Columns} FROM movies WHERE {(byId ? "id::text" : "slug") }=@key", ("key", key));
        var rows = await ReadMany(command,includeMediaDetails:true); return rows.FirstOrDefault();
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
        var movieType=existingMovie?.Type.Equals("Episode",StringComparison.OrdinalIgnoreCase)==true
            ? "Episode"
            : NormalizeMovieType(form["type"].ToString());
        if(form.ContainsKey("isSeries")&&!bool.TryParse(form["isSeries"].ToString(),out _))throw new ApiException("Choose standalone or series format.");
        var isSeries=movieType!="Episode" && (form.ContainsKey("isSeries")
            ? bool.Parse(form["isSeries"].ToString())
            : existingMovie?.IsSeries==true||form["type"]=="Series");
        if(existingMovie?.IsSeries==true&&!isSeries)
        {
            await using var checkConnection=await database.OpenAsync();
            await using var check=checkConnection.Command("SELECT EXISTS(SELECT 1 FROM series_seasons WHERE series_id=@id)",("id",id));
            if((bool)(await check.ExecuteScalarAsync())!)throw new ApiException("Remove the seasons and episodes before changing this title to a standalone video.",409);
        }
        var seriesIdText=form["seriesId"].ToString();
        var relationRequested=!string.IsNullOrWhiteSpace(seriesIdText)||!string.IsNullOrWhiteSpace(form["seasonNumber"].ToString())||!string.IsNullOrWhiteSpace(form["episodeNumber"].ToString());
        var hasSeriesRelation=Guid.TryParse(seriesIdText,out var seriesId);
        var relationSeason=int.TryParse(form["seasonNumber"].ToString(),out var parsedSeason)?parsedSeason:0;
        var relationEpisode=int.TryParse(form["episodeNumber"].ToString(),out var parsedEpisode)?parsedEpisode:0;
        if(relationRequested&&(!hasSeriesRelation||id is not null||relationSeason is < 1 or > 100||relationEpisode is < 1 or > 1000))
            throw new ApiException("An episode must be a new movie with a valid series, season, and episode number.");
        if(hasSeriesRelation&&isSeries)throw new ApiException("An episode must contain one video, not another series.");
        foreach(var file in form.Files)if(file.Length>UploadMaxBytes)throw new ApiException($"{file.FileName} exceeds the 8 GiB upload limit",413);
        var rejectedVideo=form.Files.GetFile("video");
        var subtitleZip=form.Files.GetFile("subtitleZip");
        var rejectedHlsFiles=form.Files.Where(file=>file.Name=="hlsFiles").ToList();
        var qualityZips=form.Files.Where(file=>file.Name.StartsWith("quality_",StringComparison.OrdinalIgnoreCase)).Select(file=>(Quality:file.Name[8..].ToLowerInvariant(),Zip:file)).ToList();
        string[] removeQualities;
        var removeQualitiesJson=form["removeQualities"].ToString();
        try{removeQualities=string.IsNullOrWhiteSpace(removeQualitiesJson)?[]:JsonSerializer.Deserialize<string[]>(removeQualitiesJson)??[];}
        catch(JsonException){throw new ApiException("Invalid movie quality removal list.");}
        var serverMediaPath=form["serverMediaPath"].ToString().Trim();
        if(isSeries&&(qualityZips.Count>0||removeQualities.Length>0))throw new ApiException("Upload video qualities to individual episodes, not the series title.");
        if(rejectedVideo is not null||rejectedHlsFiles.Count>0)throw new ApiException("Direct video and single HLS bundle uploads are disabled. Upload separate HLS quality ZIPs or select a quality-based server folder.");
        if(serverMediaPath.Length>0&&qualityZips.Count>0)throw new ApiException("Choose either HLS quality ZIPs or a server movie folder, not both.");
        if(id is null&&!isSeries&&qualityZips.Count==0&&serverMediaPath.Length==0)throw new ApiException("Add at least one HLS quality ZIP or select a quality-based server movie folder.");
        var storageRoot=Path.Combine(environment.ContentRootPath,"storage","uploads");
        var uploadRoot=Path.Combine(storageRoot,$"{Guid.NewGuid():N}-save");Directory.CreateDirectory(uploadRoot);
        var committed=false;
        try
        {
        async Task<string?> Save(string key){var file=form.Files.GetFile(key);if(file is null)return null;var name=$"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";var path=Path.Combine(uploadRoot,name);await using var output=File.Create(path);await file.CopyToAsync(output);return path;}
        MediaLibraryService.ImportResult? libraryImport=serverMediaPath.Length>0?await mediaLibrary.ImportAsync(serverMediaPath,uploadRoot):null;
        var video=serverMediaPath.Length>0?libraryImport!.Playlist:qualityZips.Count>0?await HlsUpload.SaveQualityBundleAsync(qualityZips,uploadRoot,existingMovie?.VideoPath):null;
        if(!isSeries&&string.IsNullOrWhiteSpace(video??existingMovie?.VideoPath))throw new ApiException("A standalone title requires a video with at least one quality.");
        if(isSeries&&libraryImport is not null&&libraryImport.Episodes.Count==0)throw new ApiException("Select a series folder containing episodes, or upload each episode after saving the title.");
        if(removeQualities.Length>0)
        {
            if(id is null||existingMovie?.VideoPath is null)throw new ApiException("Movie qualities can only be removed from an existing HLS movie.");
            var uploadedQualities=qualityZips.Select(item=>item.Quality).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var removals=removeQualities.Where(quality=>!uploadedQualities.Contains(quality)).ToArray();
            if(removals.Length>0)video=await HlsUpload.RemoveQualitiesAsync(video??existingMovie.VideoPath,removals,uploadRoot);
        }
        var cover=await Save("cover");var en=form.Files.GetFile("subtitleEn");var ru=form.Files.GetFile("subtitleRu");
        var subtitleFiles=form.Files.Where(file=>file.Name.StartsWith("subtitle_",StringComparison.OrdinalIgnoreCase)).ToList();
        var coverUrl=cover is null?null:"/media/uploads/"+Path.GetRelativePath(storageRoot,cover).Replace('\\','/');
        if(isSeries&&(subtitleZip is not null||en is not null||ru is not null||subtitleFiles.Count>0))throw new ApiException("Add subtitles to each episode, not the series title.");
        if(subtitleZip is not null&&(en is not null||ru is not null||subtitleFiles.Count>0))throw new ApiException("Upload a subtitle ZIP or separate subtitle files, not both.");
        var subtitleSources=!isSeries&&serverMediaPath.Length>0?libraryImport!.Subtitles:new Dictionary<string,string>();
        if(subtitleZip is not null)subtitleSources=await SubtitleBundle.ReadAsync(subtitleZip);
        else
        {
            if(en is not null)subtitleSources["en"]=await ReadTextAsync(en);if(ru is not null)subtitleSources["ru"]=await ReadTextAsync(ru);
            foreach(var file in subtitleFiles)
            {
                var language=file.Name[9..].Trim().ToLowerInvariant();
                if(language is not ("en" or "ru" or "tk"))throw new ApiException($"Subtitle language must be en, ru, or tk: {language}");
                if(subtitleSources.ContainsKey(language))throw new ApiException($"More than one {language.ToUpperInvariant()} subtitle was uploaded.");
                subtitleSources[language]=await ReadTextAsync(file);
            }
        }
        string[] removeSubtitleLanguages;
        try{removeSubtitleLanguages=string.IsNullOrWhiteSpace(form["removeSubtitleLanguages"].ToString())?[]:JsonSerializer.Deserialize<string[]>(form["removeSubtitleLanguages"].ToString())??[];}
        catch(JsonException){throw new ApiException("Invalid subtitle removal list.");}
        if(removeSubtitleLanguages.Any(language=>language is not ("en" or "ru" or "tk")))throw new ApiException("Subtitle language must be en, ru, or tk.");
        var suffix=(id??Guid.NewGuid()).ToString("N")[..8];
        var slug=System.Text.RegularExpressions.Regex.Replace(title.ToLowerInvariant(),"[^a-z0-9]+","-").Trim('-')+"-"+suffix;
        string[] submittedGenres;
        try { submittedGenres=JsonSerializer.Deserialize<string[]>(form["genres"].ToString())??["Drama"]; }
        catch(JsonException) { throw new ApiException("Genres must be a JSON array of names."); }
        if(submittedGenres.Any(string.IsNullOrWhiteSpace))throw new ApiException("Genre names cannot be empty.");
        var genreValues=submittedGenres.Select(NormalizeGenre).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var genres=JsonSerializer.Serialize(genreValues.Length>0?genreValues:["Drama"]);
        if(libraryImport?.Episodes.Count>0&&id is not null)throw new ApiException("A complete series folder can only be imported when creating a new series.");
        if(libraryImport?.Episodes.Count>0&&!isSeries)throw new ApiException("Choose series format to import a folder with seasons and episodes.");
        var difficulty=NormalizeDifficulty(form["difficulty"].ToString());
        var year=ParseYear(form["year"].ToString());
        if(!decimal.TryParse(form["rating"].ToString(),System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.InvariantCulture,out var ratingValue)||ratingValue is < 0 or > 10)throw new ApiException("Rating must be between 0 and 10.");
        var countryRaw=form["country"].ToString();string country;
        try { country=countryRaw.StartsWith('[')?string.Join(", ",JsonSerializer.Deserialize<string[]>(countryRaw)??[]):countryRaw; }
        catch(JsonException) { throw new ApiException("Countries must be a JSON array of names."); }
        await using var connection=await database.OpenAsync();await using var tx=await connection.BeginTransactionAsync();
        if(id is not null)
        {
            await using var rowLock=connection.Command("SELECT id FROM movies WHERE id=@id FOR UPDATE",("id",id));
            if(await rowLock.ExecuteScalarAsync() is null)throw new ApiException("Movie not found",404);
            if(!isSeries)
            {
                await using var seasons=connection.Command("SELECT EXISTS(SELECT 1 FROM series_seasons WHERE series_id=@id)",("id",id));
                if((bool)(await seasons.ExecuteScalarAsync())!)throw new ApiException("Remove the seasons and episodes before changing this title to a standalone video.",409);
            }
        }
        Guid movieId;
        if(id is null){if(video is null&&!isSeries)throw new ApiException("Video is required");const string sql="""INSERT INTO movies(slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,title_tm,title_en,title_ru,description_tm,description_en,description_ru) VALUES(@slug,@title,@original,@description,@year,@country,@genre,@genres::jsonb,@type,@duration,@rating,@difficulty,@accent,@age,@cover,@video,@titleTm,@titleEn,@titleRu,@descriptionTm,@descriptionEn,@descriptionRu) RETURNING id""";await using var q=connection.Command(sql,("slug",slug),("title",title),("original",form["originalTitle"].ToString()),("description",descriptionEn),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",movieType),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",coverUrl),("video",video??""),("titleTm",titleTm),("titleEn",titleEn),("titleRu",titleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu));movieId=(Guid)(await q.ExecuteScalarAsync())!;}
        else{movieId=id.Value;const string sql="""UPDATE movies SET title=@title,original_title=@original,description=@description,title_tm=@titleTm,title_en=@titleEn,title_ru=@titleRu,description_tm=@descriptionTm,description_en=@descriptionEn,description_ru=@descriptionRu,year=@year,country=@country,genre=@genre,genres=@genres::jsonb,type=@type,duration=@duration,rating=@rating,difficulty=@difficulty,accent=@accent,age_rating=@age,cover_url=coalesce(@cover,cover_url),video_path=coalesce(@video,video_path),updated_at=now() WHERE id=@id""";await using var q=connection.Command(sql,("id",movieId),("title",title),("original",form["originalTitle"].ToString()),("description",descriptionEn),("titleTm",titleTm),("titleEn",titleEn),("titleRu",titleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("type",movieType),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",coverUrl),("video",video));if(await q.ExecuteNonQueryAsync()==0)throw new ApiException("Movie not found",404);}
        await using(var formatCommand=connection.Command("UPDATE movies SET is_series=@series WHERE id=@id",("series",isSeries),("id",movieId)))
            await formatCommand.ExecuteNonQueryAsync();
        if(id is not null&&existingMovie?.Type.Equals("Episode",StringComparison.OrdinalIgnoreCase)==true)
        {
            await using var episodeTitleCommand=connection.Command("UPDATE series_episodes SET title=@title WHERE movie_id=@movie",("title",title),("movie",movieId));
            await episodeTitleCommand.ExecuteNonQueryAsync();
        }
        if(hasSeriesRelation)
        {
            const string relationSql="""
                WITH linked AS (
                  INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number,title)
                  SELECT s.id,@movie,@season,@episode,@title
                  FROM movies s
                  WHERE s.id=@series AND s.is_series
                    AND EXISTS(SELECT 1 FROM series_seasons ss WHERE ss.series_id=s.id AND ss.season_number=@season)
                  ON CONFLICT DO NOTHING RETURNING movie_id
                )
                UPDATE movies SET type='Episode',updated_at=now()
                WHERE id=(SELECT movie_id FROM linked) RETURNING id
                """;
            await using var relationCommand=connection.Command(relationSql,("series",seriesId),("movie",movieId),("season",relationSeason),("episode",relationEpisode),("title",title));
            if(await relationCommand.ExecuteScalarAsync() is null)throw new ApiException("Could not add the episode. Check that the series, season, and episode number are valid.",409);
        }
        async Task SaveSubtitles(Guid targetId,Dictionary<string,string> sources){foreach(var item in sources){var cues=SubtitleParser.Parse(item.Value);if(cues.Count==0)throw new ApiException($"{item.Key.ToUpperInvariant()} subtitle file has no valid cues.");await using var q=connection.Command("INSERT INTO subtitles(movie_id,language,cues) VALUES(@id,@language,@cues::jsonb) ON CONFLICT(movie_id,language) DO UPDATE SET cues=excluded.cues",("id",targetId),("language",item.Key),("cues",JsonSerializer.Serialize(cues,SubtitleJson)));await q.ExecuteNonQueryAsync();}}
        await SaveSubtitles(movieId,subtitleSources);
        if(removeSubtitleLanguages.Length>0){await using var removeSubtitles=connection.Command("DELETE FROM subtitles WHERE movie_id=@id AND language=ANY(@languages)",("id",movieId),("languages",removeSubtitleLanguages));await removeSubtitles.ExecuteNonQueryAsync();}
        if(libraryImport?.Episodes.Count>0)
        {
            foreach(var episode in libraryImport.Episodes)
            {
                var episodeTitle=$"{titleEn} — {episode.Title}";
                var episodeTitleTm=$"{titleTm} — {episode.Title}";
                var episodeTitleRu=$"{titleRu} — {episode.Title}";
                var episodeSlug=System.Text.RegularExpressions.Regex.Replace(episodeTitle.ToLowerInvariant(),"[^a-z0-9]+","-").Trim('-')+"-"+Guid.NewGuid().ToString("N")[..8];
                const string episodeSql="""INSERT INTO movies(slug,title,original_title,description,year,country,genre,genres,type,duration,rating,difficulty,accent,age_rating,cover_url,video_path,title_tm,title_en,title_ru,description_tm,description_en,description_ru) VALUES(@slug,@title,@title,@description,@year,@country,@genre,@genres::jsonb,'Episode',@duration,@rating,@difficulty,@accent,@age,@cover,@video,@titleTm,@titleEn,@titleRu,@descriptionTm,@descriptionEn,@descriptionRu) RETURNING id""";
                await using var episodeCommand=connection.Command(episodeSql,("slug",episodeSlug),("title",episodeTitle),("description",descriptionEn),("year",year),("country",country),("genre",JsonSerializer.Deserialize<string[]>(genres)?.FirstOrDefault()),("genres",genres),("duration",form["duration"].ToString()),("rating",ratingValue),("difficulty",difficulty),("accent",form["accent"].ToString()),("age",form["ageRating"].ToString()),("cover",coverUrl),("video",episode.Playlist),("titleTm",episodeTitleTm),("titleEn",episodeTitle),("titleRu",episodeTitleRu),("descriptionTm",descriptionTm),("descriptionEn",descriptionEn),("descriptionRu",descriptionRu));
                var episodeId=(Guid)(await episodeCommand.ExecuteScalarAsync())!;
                await SaveSubtitles(episodeId,episode.Subtitles);
                await using var seasonCommand=connection.Command("INSERT INTO series_seasons(series_id,season_number) VALUES(@series,@season) ON CONFLICT DO NOTHING",("series",movieId),("season",episode.SeasonNumber));
                await seasonCommand.ExecuteNonQueryAsync();
                await using var link=connection.Command("INSERT INTO series_episodes(series_id,movie_id,season_number,episode_number,title) VALUES(@series,@movie,@season,@episode,@title)",("series",movieId),("movie",episodeId),("season",episode.SeasonNumber),("episode",episode.EpisodeNumber),("title",episode.Title));
                await link.ExecuteNonQueryAsync();
            }
        }
        await tx.CommitAsync();committed=true;return (await FindAsync(movieId.ToString(),true))!;
        }
        finally
        {
            if(!committed&&Directory.Exists(uploadRoot))Directory.Delete(uploadRoot,recursive:true);
        }
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
        "series" or "movie" or "film" or "" => "Movie",
        _ => throw new ApiException("Category must be Movie or Cartoon.")
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

    private static async Task<List<MovieRow>> ReadMany(Npgsql.NpgsqlCommand command,bool includeMediaDetails=false)
    {
        await using var reader = await command.ExecuteReaderAsync(); var rows = new List<MovieRow>();
        while (await reader.ReadAsync()) rows.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.IsDBNull(3)?null:reader.GetString(3),
            reader.GetString(4), reader.IsDBNull(5)?null:reader.GetInt32(5), reader.IsDBNull(6)?null:reader.GetString(6), reader.IsDBNull(7)?null:reader.GetString(7),
            JsonSerializer.Deserialize<JsonElement>(reader.GetString(8)), reader.GetString(9), reader.IsDBNull(10)?null:reader.GetString(10), reader.IsDBNull(11)?null:reader.GetDecimal(11),
            reader.IsDBNull(12)?null:reader.GetString(12), reader.IsDBNull(13)?null:reader.GetString(13), reader.IsDBNull(14)?null:reader.GetString(14), reader.IsDBNull(15)?null:reader.GetString(15),
            reader.GetString(16), reader.GetDateTime(17), reader.GetDateTime(18), reader.GetString(19), reader.GetString(20), reader.GetString(21),
            reader.GetString(22), reader.GetString(23), reader.GetString(24), reader.GetBoolean(25)));
        await reader.DisposeAsync();
        if(rows.Count==0)return rows;
        await using var metadata=command.Connection!.Command("""
            SELECT m.id,
              EXISTS(SELECT 1 FROM subtitles s WHERE s.movie_id=m.id AND s.language='en' AND jsonb_array_length(s.cues)>0) AS subtitle_en,
              EXISTS(SELECT 1 FROM subtitles s WHERE s.movie_id=m.id AND s.language='ru' AND jsonb_array_length(s.cues)>0) AS subtitle_ru,
              COALESCE((SELECT array_agg(s.language ORDER BY s.language) FROM subtitles s WHERE s.movie_id=m.id AND jsonb_array_length(s.cues)>0),ARRAY[]::text[]) AS subtitle_languages,
              e.series_id,p.slug,p.title,p.type,e.season_number,e.episode_number
            FROM movies m LEFT JOIN series_episodes e ON e.movie_id=m.id
            LEFT JOIN movies p ON p.id=e.series_id WHERE m.id=ANY(@ids)
            """,("ids",rows.Select(row=>row.Id).ToArray()));
        await using var details=await metadata.ExecuteReaderAsync();
        var indices=rows.Select((row,index)=>(row.Id,index)).ToDictionary(item=>item.Id,item=>item.index);
        while(await details.ReadAsync())
        {
            var index=indices[details.GetGuid(0)];var row=rows[index];
            rows[index]=row with {
                HasEnglishSubtitles=details.GetBoolean(1),HasRussianSubtitles=details.GetBoolean(2),SubtitleLanguages=details.GetFieldValue<string[]>(3),
                Episode=details.IsDBNull(4)?null:new(details.GetGuid(4),details.GetString(5),details.GetString(6),details.GetString(7),details.GetInt32(8),details.GetInt32(9)),
                VideoQualities=includeMediaDetails&&!row.IsSeries?MovieRow.ReadHlsQualities(row.VideoPath):[]
            };
        }
        return rows;
    }
}
