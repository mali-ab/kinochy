namespace Kinochy.Api.Services;

public sealed class MediaService(MovieService movies)
{
    public async Task<(string Path,string Type,string? Duration)> VideoAsync(Guid id)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null||!File.Exists(movie.VideoPath)||Path.GetExtension(movie.VideoPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException();
        var type=Path.GetExtension(movie.VideoPath).ToLowerInvariant() switch{".webm"=>"video/webm",".mkv"=>"video/x-matroska",_=>"video/mp4"};return(movie.VideoPath,type,movie.Duration);
    }
    public async Task<string> HlsAsync(Guid id,string? segment=null)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null)throw new FileNotFoundException();
        var isUploadedHls=Path.GetExtension(movie.VideoPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase);
        var directory=isUploadedHls?Path.GetDirectoryName(movie.VideoPath)!:Path.Combine(Path.GetDirectoryName(movie.VideoPath)!,Path.GetFileNameWithoutExtension(movie.VideoPath)+"-hls");
        if(segment is null)return movie.VideoPath;
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
}
