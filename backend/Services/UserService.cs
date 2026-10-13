using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class UserService(Database database)
{
    public async Task<SessionUser> LanguageAsync(Guid userId, string language)
    {
        if (language is not ("tm" or "ru" or "en")) throw new ApiException("Unsupported language");
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("UPDATE users SET language=@language WHERE id=@id RETURNING id,username,email,role,language,subscription_plan,subscription_expires_at", ("id", userId), ("language", language));
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) throw new ApiException("User not found", 404);
        return new(reader.GetGuid(0),reader.GetString(1),reader.GetString(2),reader.GetString(3),reader.GetString(4),reader.GetString(5),reader.IsDBNull(6)?null:reader.GetDateTime(6));
    }

    public async Task<List<object>> VocabularyAsync(Guid userId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT id,word,translation,source_language,target_language,created_at FROM vocabulary WHERE user_id=@id ORDER BY created_at DESC", ("id", userId));
        await using var reader = await command.ExecuteReaderAsync(); var rows = new List<object>();
        while(await reader.ReadAsync()) rows.Add(new { id=reader.GetGuid(0),word=reader.GetString(1),translation=reader.GetString(2),sourceLanguage=reader.GetString(3),targetLanguage=reader.GetString(4),createdAt=reader.GetDateTime(5)});
        return rows;
    }

    public async Task<object?> FindWordAsync(Guid userId, string word, string source, string target)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT id,word,translation,source_language,target_language,created_at FROM vocabulary WHERE user_id=@id AND lower(word)=lower(@word) AND source_language=@source AND target_language=@target", ("id",userId),("word",word),("source",source),("target",target));
        await using var r=await command.ExecuteReaderAsync(); return await r.ReadAsync()?new{id=r.GetGuid(0),word=r.GetString(1),translation=r.GetString(2),sourceLanguage=r.GetString(3),targetLanguage=r.GetString(4),createdAt=r.GetDateTime(5)}:null;
    }

    public async Task<object> AddWordAsync(Guid userId, VocabularyRequest value)
    {
        await using var connection=await database.OpenAsync();
        const string sql="INSERT INTO vocabulary(user_id,word,translation,source_language,target_language) VALUES(@id,@word,@translation,@source,@target) ON CONFLICT(user_id,word,source_language,target_language) DO UPDATE SET translation=excluded.translation RETURNING id,word,translation,source_language,target_language,created_at";
        await using var command=connection.Command(sql,("id",userId),("word",value.Word.Trim()),("translation",value.Translation.Trim()),("source",value.SourceLanguage),("target",value.TargetLanguage));
        await using var r=await command.ExecuteReaderAsync();await r.ReadAsync();return new{id=r.GetGuid(0),word=r.GetString(1),translation=r.GetString(2),sourceLanguage=r.GetString(3),targetLanguage=r.GetString(4),createdAt=r.GetDateTime(5)};
    }

    public async Task RemoveWordAsync(Guid userId,Guid id){await using var c=await database.OpenAsync();await using var q=c.Command("DELETE FROM vocabulary WHERE id=@word AND user_id=@user",("word",id),("user",userId));if(await q.ExecuteNonQueryAsync()==0)throw new ApiException("Word not found",404);}
    public async Task<Guid[]> FavoriteIdsAsync(Guid userId){await using var c=await database.OpenAsync();await using var q=c.Command("SELECT movie_id FROM favorite_movies WHERE user_id=@id",("id",userId));await using var r=await q.ExecuteReaderAsync();var x=new List<Guid>();while(await r.ReadAsync())x.Add(r.GetGuid(0));return x.ToArray();}
    public async Task<bool> IsFavoriteAsync(Guid userId,Guid movieId){await using var c=await database.OpenAsync();await using var q=c.Command("SELECT EXISTS(SELECT 1 FROM favorite_movies WHERE user_id=@u AND movie_id=@m)",("u",userId),("m",movieId));return (bool)(await q.ExecuteScalarAsync())!;}
    public async Task AddFavoriteAsync(Guid userId,Guid movieId){await using var c=await database.OpenAsync();await using var q=c.Command("INSERT INTO favorite_movies(user_id,movie_id) VALUES(@u,@m) ON CONFLICT DO NOTHING",("u",userId),("m",movieId));await q.ExecuteNonQueryAsync();}
    public async Task RemoveFavoriteAsync(Guid userId,Guid movieId){await using var c=await database.OpenAsync();await using var q=c.Command("DELETE FROM favorite_movies WHERE user_id=@u AND movie_id=@m",("u",userId),("m",movieId));await q.ExecuteNonQueryAsync();}
}
