namespace Kinochy.Api.Services;

public sealed class MediaService(MovieService movies, IWebHostEnvironment environment)
{
    public async Task<(string Path,string Type,string? Duration)> VideoAsync(Guid id)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null||Path.GetExtension(movie.VideoPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException();
        var path=ResolveStoredPath(movie.VideoPath);
        if(!File.Exists(path))throw new FileNotFoundException("Movie video file was not found.",path);
        var type=Path.GetExtension(path).ToLowerInvariant() switch{".webm"=>"video/webm",".mkv"=>"video/x-matroska",_=>"video/mp4"};return(path,type,movie.Duration);
    }
    public async Task<string> HlsAsync(Guid id,string? segment=null)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null)throw new FileNotFoundException();
        var videoPath=ResolveStoredPath(movie.VideoPath);
        var isUploadedHls=Path.GetExtension(videoPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase);
        var directory=isUploadedHls?Path.GetDirectoryName(videoPath)!:Path.Combine(Path.GetDirectoryName(videoPath)!,Path.GetFileNameWithoutExtension(videoPath)+"-hls");
        if(segment is null)
        {
            if(!isUploadedHls||!File.Exists(videoPath))throw new FileNotFoundException("Movie HLS playlist was not found.",videoPath);
            return videoPath;
        }
        if(string.IsNullOrWhiteSpace(segment)||Path.IsPathRooted(segment)||segment.Contains('\\')||segment.IndexOfAny([':', '?', '#', '%'])>=0||segment.Split('/').Any(part=>part is "" or "." or ".."))throw new FileNotFoundException();
        var root=Path.GetFullPath(directory)+Path.DirectorySeparatorChar;
        var path=Path.GetFullPath(Path.Combine(directory,segment.Replace('/',Path.DirectorySeparatorChar)));
        if(!path.StartsWith(root,StringComparison.Ordinal)||!File.Exists(path))throw new FileNotFoundException();return path;
    }

    public async Task<bool> IsFreePreviewAssetAsync(Guid id,string assetPath)
    {
        var path=await HlsAsync(id,assetPath);
        if(Path.GetExtension(path).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))return true;
        if(Path.GetExtension(path).Equals(".key",StringComparison.OrdinalIgnoreCase))return true;
        var playlist=Path.Combine(Path.GetDirectoryName(path)!,"stream.m3u8");
        if(!File.Exists(playlist))return false;
        var target=Path.GetFileName(path);var elapsed=0d;var duration=0d;
        foreach(var raw in await File.ReadAllLinesAsync(playlist))
        {
            var line=raw.Trim();
            if(line.StartsWith("#EXTINF:",StringComparison.OrdinalIgnoreCase))double.TryParse(line[8..].Split(',')[0],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out duration);
            else if(line.Length>0&&!line.StartsWith('#'))
            {
                if(line==target)return elapsed<Kinochy.Api.Models.SubscriptionAccess.FreePreviewSeconds;
                elapsed+=duration;duration=0;
            }
        }
        return false;
    }

    public async Task<string> FreePreviewPlaylistAsync(Guid id,string assetPath)
    {
        var path=await HlsAsync(id,assetPath);
        if(!Path.GetExtension(path).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException();
        var lines=await File.ReadAllLinesAsync(path);var result=new List<string>();var elapsed=0d;var duration=0d;var segmentPending=false;
        foreach(var raw in lines)
        {
            var line=raw.Trim();
            if(line.Equals("#EXT-X-ENDLIST",StringComparison.OrdinalIgnoreCase))continue;
            if(line.StartsWith("#EXTINF:",StringComparison.OrdinalIgnoreCase))
            {
                if(!double.TryParse(line[8..].Split(',')[0],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out duration))duration=0;
                if(elapsed>=Kinochy.Api.Models.SubscriptionAccess.FreePreviewSeconds)break;
                result.Add(raw);segmentPending=true;continue;
            }
            if(segmentPending&&line.Length>0&&!line.StartsWith('#'))
            {
                result.Add(raw);elapsed+=duration;duration=0;segmentPending=false;continue;
            }
            result.Add(raw);
        }
        result.Add("#EXT-X-ENDLIST");
        return string.Join("\n",result)+"\n";
    }

    private string ResolveStoredPath(string storedPath)
    {
        if(File.Exists(storedPath))return storedPath;

        var normalized=storedPath.Replace('\\','/');
        foreach(var storageArea in new[]{"preloaded","uploads"})
        {
            var marker=$"/storage/{storageArea}/";
            var markerIndex=normalized.IndexOf(marker,StringComparison.OrdinalIgnoreCase);
            if(markerIndex<0)continue;
            var relative=normalized[(markerIndex+marker.Length)..];
            if(relative.Split('/').Any(part=>part is "" or "." or ".."))continue;
            var candidate=Path.GetFullPath(Path.Combine(environment.ContentRootPath,"storage",storageArea,relative.Replace('/',Path.DirectorySeparatorChar)));
            var root=Path.GetFullPath(Path.Combine(environment.ContentRootPath,"storage",storageArea))+Path.DirectorySeparatorChar;
            if(candidate.StartsWith(root,StringComparison.Ordinal)&&File.Exists(candidate))return candidate;
        }
        return storedPath;
    }
}
