namespace Kinochy.Api.Services;

public sealed class MediaService(MovieService movies, IWebHostEnvironment environment)
{
    public async Task<(string Path,string Type,string? Duration)> VideoAsync(Guid id)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null||movie.IsSeries||Path.GetExtension(movie.VideoPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException();
        var path=ResolveStoredPath(movie.VideoPath);
        if(!File.Exists(path))throw new FileNotFoundException("Movie video file was not found.",path);
        var type=Path.GetExtension(path).ToLowerInvariant() switch{".webm"=>"video/webm",".mkv"=>"video/x-matroska",_=>"video/mp4"};return(path,type,movie.Duration);
    }
    public async Task<string> HlsAsync(Guid id,string? segment=null)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null||movie.IsSeries)throw new FileNotFoundException();
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
        var master=await HlsAsync(id);
        return await IsPreviewAssetInBundleAsync(master,path);
    }

    public static async Task<bool> IsPreviewAssetInBundleAsync(string master,string path)
    {
        var root=Path.GetDirectoryName(Path.GetFullPath(master))!;
        for(var directory=Path.GetDirectoryName(path);directory is not null;directory=Path.GetDirectoryName(directory))
        {
            foreach(var playlist in Directory.EnumerateFiles(directory).Where(file=>Path.GetExtension(file).Equals(".m3u8",StringComparison.OrdinalIgnoreCase)))
            {
                var source=await File.ReadAllTextAsync(playlist);
                if(source.Contains("BYTERANGE",StringComparison.OrdinalIgnoreCase))continue;
                var preview=HlsPreview.Build(source);
                if(preview.Assets.Any(asset=>Path.GetFullPath(Path.Combine(directory,asset))==path))return true;
            }
            if(directory==root)break;
        }
        return false;
    }

    public async Task<string> FreePreviewPlaylistAsync(Guid id,string? assetPath=null,CancellationToken cancellationToken=default)
    {
        var path=await HlsAsync(id,assetPath);
        if(!Path.GetExtension(path).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException();
        var source=await File.ReadAllTextAsync(path);
        if(source.Contains("BYTERANGE",StringComparison.OrdinalIgnoreCase))
        {
            var generated=await VideoPreview.CreateAsync(path,PreviewRoot(id),cancellationToken,hls:true);
            var key=Path.GetFileName(Path.GetDirectoryName(generated));
            source=await File.ReadAllTextAsync(generated);
            source=string.Join("\n",source.Split('\n').Select(line=>line.Length>0&&!line.StartsWith('#')?$"/media/movies/{id}/preview/{key}/{line}":line));
        }
        return HlsPreview.Build(source).Playlist;
    }

    public async Task<string> PreviewVideoAsync(Guid id,CancellationToken cancellationToken)
    {
        var video=await VideoAsync(id);
        return await VideoPreview.CreateAsync(video.Path,PreviewRoot(id),cancellationToken);
    }

    private string PreviewRoot(Guid id)=>Path.Combine(environment.ContentRootPath,"storage","previews",id.ToString("N"));

    public string PreviewAsset(Guid id,string key,string asset)
    {
        if(key.Length!=64||key.Any(character=>!Uri.IsHexDigit(character))||!System.Text.RegularExpressions.Regex.IsMatch(asset,@"^segment\d+\.ts$"))throw new FileNotFoundException();
        var path=Path.Combine(PreviewRoot(id),key,asset);
        if(!File.Exists(path))throw new FileNotFoundException();
        return path;
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
