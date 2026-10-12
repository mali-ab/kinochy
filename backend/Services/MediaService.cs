namespace Kinochy.Api.Services;

public sealed class MediaService(MovieService movies)
{
    public async Task<(string Path,string Type)> VideoAsync(Guid id)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null||!File.Exists(movie.VideoPath))throw new FileNotFoundException();
        var type=Path.GetExtension(movie.VideoPath).ToLowerInvariant() switch{".webm"=>"video/webm",".mkv"=>"video/x-matroska",_=>"video/mp4"};return(movie.VideoPath,type);
    }
    public async Task<string> HlsAsync(Guid id,string? segment=null)
    {
        var movie=await movies.FindAsync(id.ToString(),true);if(movie is null)throw new FileNotFoundException();
        var directory=Path.Combine(Path.GetDirectoryName(movie.VideoPath)!,Path.GetFileNameWithoutExtension(movie.VideoPath)+"-hls");
        var name=segment??"playlist.m3u8";if(Path.GetFileName(name)!=name)throw new FileNotFoundException();var path=Path.Combine(directory,name);if(!File.Exists(path))throw new FileNotFoundException();return path;
    }
}
