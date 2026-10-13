using Kinochy.Api.Services;
using Kinochy.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class MoviesController(MovieService movies,MovieCommunityService community,TokenService tokens,TranslationService translation,SubscriptionService subscriptions):ControllerBase
{
    [HttpGet("api/movies")] public Task<List<Models.MovieRow>> List([FromQuery]string? search)=>movies.ListAsync(search);
    [HttpGet("api/genres")] public Task<List<GenreView>> Genres()=>movies.GenresAsync();
    [HttpGet("api/movies/{slug}")] public async Task<IActionResult> Get(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(movie);}
    [HttpGet("api/movies/{slug}/subtitles/{language}")]
    public async Task<IActionResult> Subtitles(string slug,string language)
    {
        var movie=await movies.FindAsync(slug);
        if(movie is null)return NotFound(new{message="Movie not found"});
        var cues=await movies.SubtitlesAsync(movie.Id,language);
        if(!await subscriptions.HasFullAccessAsync(Request))cues=cues.Where(cue=>cue.Start<SubscriptionAccess.FreePreviewSeconds).ToList();
        return Ok(cues);
    }
    [HttpGet("api/movies/{slug}/recommendations")]
    public async Task<IActionResult> Recommendations(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(await movies.RecommendationsAsync(movie));}
    [HttpGet("api/movies/{slug}/seasons")]
    public async Task<IActionResult> Seasons(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(await community.SeasonsAsync(movie.Id));}
    [HttpGet("api/movies/{slug}/comments")]
    public async Task<IActionResult> Comments(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(await community.CommentsAsync(movie.Id));}
    [HttpPost("api/movies/{slug}/comments")]
    public async Task<IActionResult> AddComment(string slug,CommentRequest value)
    {
        var userId=tokens.RequireUser(Request);
        var movie=await movies.FindAsync(slug);
        return movie is null?NotFound(new{message="Movie not found"}):StatusCode(201,await community.AddCommentAsync(movie.Id,userId,value.Body));
    }
    [HttpDelete("api/movies/{slug}/comments/{id:guid}")]
    public async Task<IActionResult> RemoveComment(string slug,Guid id)
    {
        var userId=tokens.RequireUser(Request);
        var movie=await movies.FindAsync(slug);
        if(movie is null)return NotFound(new{message="Movie not found"});
        await community.RemoveCommentAsync(movie.Id,id,userId);
        return NoContent();
    }
    [HttpGet("api/translate")] public Task<object> Translate([FromQuery]string text,[FromQuery]string from="en",[FromQuery]string to="ru")=>translation.TranslateAsync(text,from,to);
}
