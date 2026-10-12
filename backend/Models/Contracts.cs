using System.Text.Json;

namespace Kinochy.Api.Models;

public sealed record LoginRequest(string Email, string Password);
public sealed record SignupRequest(string Username, string Email, string Password, string? Language);
public sealed record CodeRequest(string Email, string Code);
public sealed record EmailRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Code, string Password);
public sealed record LanguageRequest(string Language);
public sealed record VocabularyRequest(string Word, string Translation, string SourceLanguage, string TargetLanguage);
public sealed record DeleteUsersRequest(Guid[] Ids);
public sealed record AdminUserRequest(string Username, string Email, string? Password, string? Role, string? Language);
public sealed record UserView(Guid Id, string Username, string Email, string Role, string Language, bool Verified, DateTime CreatedAt);
public sealed record SessionUser(Guid Id, string Username, string Email, string Role, string Language);
public sealed record SubtitleCue(int Id, double Start, double End, string Text);
public sealed record MovieRow(Guid Id, string Slug, string Title, string? OriginalTitle, string Description,
    int? Year, string? Country, string? Genre, JsonElement Genres, string Type, string? Duration,
    decimal? Rating, string? Difficulty, string? Accent, string? AgeRating, string? CoverUrl,
    [property: System.Text.Json.Serialization.JsonIgnore] string VideoPath, DateTime CreatedAt, DateTime UpdatedAt)
{
    public object FileStatus => new { video=true, cover=!string.IsNullOrWhiteSpace(CoverUrl), subtitleEn=true, subtitleRu=true };
    public object FileNames => new { video=Path.GetFileName(VideoPath), cover=CoverUrl is null?null:Path.GetFileName(CoverUrl), subtitleEn="English subtitles", subtitleRu="Russian subtitles" };
}
