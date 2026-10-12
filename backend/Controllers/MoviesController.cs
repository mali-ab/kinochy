using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class MoviesController(MovieService movies,TranslationService translation):ControllerBase
{
    [HttpGet("api/movies")] public Task<List<Models.MovieRow>> List([FromQuery]string? search)=>movies.ListAsync(search);
    [HttpGet("api/genres")] public Task<string[]> Genres()=>movies.GenresAsync();
    [HttpGet("api/movies/{slug}")] public async Task<IActionResult> Get(string slug){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(movie);}
    [HttpGet("api/movies/{slug}/subtitles/{language}")] public async Task<IActionResult> Subtitles(string slug,string language){var movie=await movies.FindAsync(slug);return movie is null?NotFound(new{message="Movie not found"}):Ok(await movies.SubtitlesAsync(movie.Id,language));}
    [HttpGet("api/translate")] public Task<object> Translate([FromQuery]string text,[FromQuery]string from="en",[FromQuery]string to="ru")=>translation.TranslateAsync(text,from,to);
}
