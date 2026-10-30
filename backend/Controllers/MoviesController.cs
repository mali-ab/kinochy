using Kinochy.Api.Services;
using Kinochy.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class MoviesController(MovieService movies,MovieCommunityService community,TokenService tokens,TranslationService translation,SubscriptionService subscriptions):ControllerBase
{
    [HttpGet("api/catalog")]
    public Task<MovieCatalogPage> Catalog([FromQuery]string? search,[FromQuery]int page=1,[FromQuery]int pageSize=24,
        [FromQuery]string? category=null,[FromQuery]bool? isSeries=null)=>movies.CatalogAsync(search,page,pageSize,category,isSeries);
    // Preserve the legacy array shape; all catalog queries are now bounded.
    [HttpGet("api/movies")]
    public async Task<List<MovieCard>> List([FromQuery]string? search,[FromQuery]int page=1,[FromQuery]int pageSize=100)=>(await movies.CatalogAsync(search,page,pageSize)).Items;
    [HttpGet("api/genres")] public Task<List<GenreView>> Genres()=>movies.GenresAsync();
    [HttpGet("api/countries")] public Task<List<CountryView>> Countries()=>movies.CountriesAsync();
    [HttpGet("api/movies/{slug}")] public async Task<IActionResult> Get(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(movie);}
    [HttpGet("api/movies/{slug}/subtitles/{language}")]
    public async Task<IActionResult> Subtitles(string slug,string language)
    {
        if(language is not ("en" or "ru"))return BadRequest(new{message="Subtitle language must be en or ru"});
        var movie=await movies.FindAsync(slug);
        if(movie is null)return NotFound(new{message="Movie not found"});
        var cues=await movies.SubtitlesAsync(movie.Id,language);
        if(!await subscriptions.HasFullAccessAsync(Request))cues=cues.Where(cue=>cue.Start<SubscriptionAccess.FreePreviewSeconds)
            .Select(cue=>cue with { End=Math.Min(cue.End,SubscriptionAccess.FreePreviewSeconds) }).ToList();
        return Ok(cues);
    }
    [HttpGet("api/movies/{slug}/recommendations")]
    public async Task<IActionResult> Recommendations(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok((await movies.RecommendationsAsync(movie)).Select(MovieCard.From));}
    [HttpGet("api/movies/{slug}/seasons")]
    public async Task<IActionResult> Seasons(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(await community.SeasonsAsync(movie.Episode?.SeriesId??movie.Id));}
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
