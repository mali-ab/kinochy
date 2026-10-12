using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class MediaController(MediaService media):ControllerBase
{
    [HttpGet("media/movies/{id:guid}/video")]
    public async Task<IActionResult> Video(Guid id){try{var file=await media.VideoAsync(id);return PhysicalFile(file.Path,file.Type,enableRangeProcessing:true);}catch(FileNotFoundException){return NotFound();}}
    [HttpGet("media/movies/{id:guid}/playlist.m3u8")]
    public async Task<IActionResult> Playlist(Guid id){try{return PhysicalFile(await media.HlsAsync(id),"application/vnd.apple.mpegurl");}catch(FileNotFoundException){return NotFound();}}
    [HttpGet("media/movies/{id:guid}/hls/{segment}")]
    public async Task<IActionResult> Segment(Guid id,string segment){try{return PhysicalFile(await media.HlsAsync(id,segment),"video/mp2t",enableRangeProcessing:true);}catch(FileNotFoundException){return NotFound();}}
}
