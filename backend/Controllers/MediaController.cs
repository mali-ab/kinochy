using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class MediaController(MediaService media,SubscriptionService subscriptions):ControllerBase
{
    [HttpGet("media/movies/{id:guid}/video")]
    public async Task<IActionResult> Video(Guid id)
    {
        try
        {
            DisablePlaylistCaching();
            var file=await media.VideoAsync(id);
            if(await subscriptions.HasFullAccessAsync(Request))return PhysicalFile(file.Path,file.Type,enableRangeProcessing:true);
            return PhysicalFile(await media.PreviewVideoAsync(id,Request.HttpContext.RequestAborted),"video/mp4",enableRangeProcessing:true);
        }
        catch(FileNotFoundException){return NotFound();}
    }
    [HttpGet("media/movies/{id:guid}/playlist.m3u8")]
    public async Task<IActionResult> Playlist(Guid id)
    {
        try
        {
            DisablePlaylistCaching();
            if(!await subscriptions.HasFullAccessAsync(Request))
                return Content(await media.FreePreviewPlaylistAsync(id,cancellationToken:HttpContext.RequestAborted),"application/vnd.apple.mpegurl");
            return PhysicalFile(await media.HlsAsync(id),"application/vnd.apple.mpegurl");
        }
        catch(FileNotFoundException){return NotFound();}
    }
    [HttpGet("media/movies/{id:guid}/{**assetPath}")]
    public async Task<IActionResult> Segment(Guid id,string assetPath)
    {
        try
        {
            DisablePlaylistCaching();
            var hasFullAccess=await subscriptions.HasFullAccessAsync(Request);
            if(!hasFullAccess&&Path.GetExtension(assetPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))
            {
                DisablePlaylistCaching();
                return Content(await media.FreePreviewPlaylistAsync(id,assetPath,HttpContext.RequestAborted),"application/vnd.apple.mpegurl");
            }
            if(!hasFullAccess&&!await media.IsFreePreviewAssetAsync(id,assetPath))
                return NoContent();
            var path=await media.HlsAsync(id,assetPath);
            var type=Path.GetExtension(path).ToLowerInvariant() switch
            {
                ".m3u8"=>"application/vnd.apple.mpegurl", ".ts"=>"video/mp2t", ".m4s"=>"video/iso.segment",
                ".mp4"=>"video/mp4", ".aac"=>"audio/aac", ".mp3"=>"audio/mpeg", ".vtt"=>"text/vtt",
                _=>"application/octet-stream"
            };
            if(Path.GetExtension(path).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))DisablePlaylistCaching();
            return PhysicalFile(path,type,enableRangeProcessing:true);
        }
        catch(FileNotFoundException){return NotFound();}
    }

    [HttpGet("media/movies/{id:guid}/preview/{key}/{asset}")]
    public IActionResult PreviewSegment(Guid id,string key,string asset)
    {
        try { DisablePlaylistCaching();return PhysicalFile(media.PreviewAsset(id,key,asset),"video/mp2t",enableRangeProcessing:true); }
        catch(FileNotFoundException){return NotFound();}
    }

    private void DisablePlaylistCaching()
    {
        Response.Headers.CacheControl="no-store, no-cache, must-revalidate";
        Response.Headers.Pragma="no-cache";
        Response.Headers.Expires="0";
    }

}
