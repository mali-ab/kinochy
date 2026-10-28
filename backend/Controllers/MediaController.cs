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
            var file=await media.VideoAsync(id);
            if(await subscriptions.HasFullAccessAsync(Request))return PhysicalFile(file.Path,file.Type,enableRangeProcessing:true);
            return await FreePreviewVideo(file.Path,file.Type,file.Duration);
        }
        catch(FileNotFoundException){return NotFound();}
    }
    [HttpGet("media/movies/{id:guid}/playlist.m3u8")]
    public async Task<IActionResult> Playlist(Guid id)
    {
        try
        {
            DisablePlaylistCaching();
            return PhysicalFile(await media.HlsAsync(id),"application/vnd.apple.mpegurl");
        }
        catch(FileNotFoundException){return NotFound();}
    }
    [HttpGet("media/movies/{id:guid}/{**assetPath}")]
    public async Task<IActionResult> Segment(Guid id,string assetPath)
    {
        try
        {
            var hasFullAccess=await subscriptions.HasFullAccessAsync(Request);
            if(!hasFullAccess&&Path.GetExtension(assetPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))
            {
                DisablePlaylistCaching();
                return Content(await media.FreePreviewPlaylistAsync(id,assetPath),"application/vnd.apple.mpegurl");
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

    private void DisablePlaylistCaching()
    {
        Response.Headers.CacheControl="no-store, no-cache, must-revalidate";
        Response.Headers.Pragma="no-cache";
        Response.Headers.Expires="0";
    }

    private async Task<IActionResult> FreePreviewVideo(string path,string contentType,string? durationText)
    {
        var info=new FileInfo(path);var totalSeconds=DurationSeconds(durationText);
        var previewBytes=totalSeconds<=600?info.Length:Math.Max(1,(long)(info.Length*(600d/totalSeconds)));
        var range=Request.Headers.Range.ToString();var start=0L;
        if(range.StartsWith("bytes=",StringComparison.OrdinalIgnoreCase))long.TryParse(range[6..].Split('-')[0],out start);
        if(start>=previewBytes)return NoContent();
        var end=Math.Min(previewBytes-1,start+4*1024*1024-1);var length=end-start+1;
        Response.StatusCode=206;Response.ContentType=contentType;Response.ContentLength=length;
        Response.Headers["Accept-Ranges"]="bytes";Response.Headers["Content-Range"]=$"bytes {start}-{end}/{previewBytes}";
        await using var stream=System.IO.File.OpenRead(path);stream.Seek(start,SeekOrigin.Begin);
        var buffer=new byte[64*1024];var remaining=length;
        while(remaining>0){var read=await stream.ReadAsync(buffer.AsMemory(0,(int)Math.Min(buffer.Length,remaining)));if(read==0)break;await Response.Body.WriteAsync(buffer.AsMemory(0,read));remaining-=read;}
        return new EmptyResult();
    }

    private static double DurationSeconds(string? value)
    {
        if(string.IsNullOrWhiteSpace(value))return 600;
        var parts=value.Split(':');
        if(parts.Length==2&&double.TryParse(parts[0],out var hours)&&double.TryParse(parts[1],out var minutes))return hours*3600+minutes*60;
        return double.TryParse(value,out var totalMinutes)?totalMinutes*60:600;
    }
}
