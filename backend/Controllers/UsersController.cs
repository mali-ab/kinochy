using Kinochy.Api.Models;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class UsersController(UserService users,MovieService movies,AuthService auth,TokenService tokens):ControllerBase
{
    private Guid UserId()=>tokens.RequireUser(Request);
    [HttpPatch("api/users/language")]public async Task<object> Language(LanguageRequest value){var user=await users.LanguageAsync(UserId(),value.Language);Response.Cookies.Append("kinochy_user",auth.Token(user),new(){HttpOnly=true,SameSite=SameSiteMode.Lax,Secure=Request.IsHttps,MaxAge=TimeSpan.FromDays(30)});return new{user};}
    [HttpGet("api/users/vocabulary")]public Task<List<object>> Vocabulary()=>users.VocabularyAsync(UserId());
    [HttpGet("api/users/vocabulary/check")]
    public async Task<object> Check([FromQuery]string word,[FromQuery]string sourceLanguage,[FromQuery]string targetLanguage)
    {
        var userId=tokens.UserIdOrNull(Request);
        return new{entry=userId is null?null:await users.FindWordAsync(userId.Value,word,sourceLanguage,targetLanguage)};
    }
    [HttpPost("api/users/vocabulary")]public async Task<IActionResult> AddWord(VocabularyRequest value)=>StatusCode(201,await users.AddWordAsync(UserId(),value));
    [HttpDelete("api/users/vocabulary/{id:guid}")]public async Task<object> RemoveWord(Guid id){await users.RemoveWordAsync(UserId(),id);return new{ok=true};}
    [HttpGet("api/users/favorites/ids")]
    public Task<Guid[]> FavoriteIds()
    {
        var userId=tokens.UserIdOrNull(Request);
        return userId is null?Task.FromResult(Array.Empty<Guid>()):users.FavoriteIdsAsync(userId.Value);
    }
    [HttpGet("api/users/favorites")]public Task<List<MovieRow>> Favorites()=>movies.FavoritesAsync(UserId());
    [HttpGet("api/users/favorites/{movieId:guid}")]
    public async Task<object> Favorite(Guid movieId)
    {
        var userId=tokens.UserIdOrNull(Request);
        return new{favorite=userId is not null&&await users.IsFavoriteAsync(userId.Value,movieId)};
    }
    [HttpPost("api/users/favorites/{movieId:guid}")]public async Task<IActionResult> AddFavorite(Guid movieId){await users.AddFavoriteAsync(UserId(),movieId);return StatusCode(201,new{favorite=true});}
    [HttpDelete("api/users/favorites/{movieId:guid}")]public async Task<object> RemoveFavorite(Guid movieId){await users.RemoveFavoriteAsync(UserId(),movieId);return new{favorite=false};}
}
