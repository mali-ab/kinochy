using System.Text;
using System.Text.RegularExpressions;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

/// <summary>
/// Imports already-converted HLS directories without uploading or duplicating
/// their media segments. Managed playlists link only to validated directories
/// below MEDIA_LIBRARY_ROOT.
/// </summary>
public sealed partial class MediaLibraryService(IConfiguration configuration)
{
    private readonly string _libraryRoot = Path.GetFullPath(configuration["MEDIA_LIBRARY_ROOT"]
        ?? "/media/user/Новый том/kinochy");

    private static readonly Dictionary<string, (int Width, int Height, int Bandwidth)> Profiles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["144p"]=(256,144,180_000), ["240p"]=(426,240,350_000), ["360p"]=(640,360,800_000),
        ["480p"]=(854,480,1_400_000), ["720p"]=(1280,720,2_800_000), ["1080p"]=(1920,1080,5_500_000),
        ["1440p"]=(2560,1440,9_000_000), ["2160p"]=(3840,2160,18_000_000)
    };

    [GeneratedRegex(@"^(144|240|360|480|720|1080|1440|2160)p$", RegexOptions.IgnoreCase)]
    private static partial Regex QualityName();

    public MediaLibraryScan Scan(string? requestedPath)
    {
        var path = ResolveAllowedPath(requestedPath);
        var direct = InspectTitle(path);
        List<MediaLibraryItem> items = direct is null
            ? Directory.EnumerateDirectories(path).Select(InspectTitle).Where(item => item is not null).Cast<MediaLibraryItem>().OrderBy(item => item.Title).ToList()
            : [direct];
        if (items.Count == 0) throw new ApiException("No movie folders with playable quality/stream.m3u8 files were found.", 404);
        return new(path, items);
    }

    public async Task<(string Playlist, Dictionary<string,string> Subtitles)> ImportAsync(string requestedPath, string uploadRoot)
    {
        var source = ResolveAllowedPath(requestedPath);
        var item = InspectTitle(source) ?? throw new ApiException("The selected folder has no playable quality/stream.m3u8 files.");
        var directory = Path.Combine(uploadRoot, $"{Guid.NewGuid():N}-library");
        Directory.CreateDirectory(directory);
        try
        {
            foreach (var quality in item.Qualities)
            {
                var sourceQuality = Path.Combine(source, quality);
                Directory.CreateSymbolicLink(Path.Combine(directory, quality.ToLowerInvariant()), sourceQuality);
            }
            var playlist = Path.Combine(directory, "playlist.m3u8");
            await File.WriteAllTextAsync(playlist, BuildMaster(item.Qualities), Encoding.UTF8);
            var subtitles = new Dictionary<string,string>();
            foreach (var file in Directory.EnumerateFiles(source).Where(IsSubtitle))
            {
                var language = SubtitleLanguage(file);
                if (language is not null && !subtitles.ContainsKey(language)) subtitles[language] = await File.ReadAllTextAsync(file);
            }
            return (playlist, subtitles);
        }
        catch
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
            throw;
        }
    }

    private MediaLibraryItem? InspectTitle(string path)
    {
        var qualities = Directory.EnumerateDirectories(path)
            .Select(directory => (Directory: directory, Quality: Path.GetFileName(directory).ToLowerInvariant()))
            .Where(item => QualityName().IsMatch(item.Quality) && IsPlayablePlaylist(Path.Combine(item.Directory, "stream.m3u8")))
            .OrderBy(item => Profiles[item.Quality].Height).Select(item => item.Quality).ToArray();
        if (qualities.Length == 0) return null;
        var subtitles = Directory.EnumerateFiles(path).Where(IsSubtitle).Select(SubtitleLanguage).Where(value => value is not null).Cast<string>().Distinct().Order().ToArray();
        var warnings = new List<string>();
        var ignored = Directory.EnumerateDirectories(path).Select(Path.GetFileName).Where(name => name is not null && QualityName().IsMatch(name) && !qualities.Contains(name, StringComparer.OrdinalIgnoreCase)).ToArray();
        if (ignored.Length > 0) warnings.Add($"Ignored incomplete qualities: {string.Join(", ", ignored)}");
        if (subtitles.Length == 0) warnings.Add("No EN or RU subtitle file found at the title root.");
        var folder = Path.GetFileName(path);
        return new(path, SuggestedTitle(folder), TypeFromPath(path), SuggestedYear(folder), qualities, subtitles, warnings.ToArray());
    }

    private string ResolveAllowedPath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ApiException("Movie folder path is required.");
        if (!Directory.Exists(_libraryRoot)) throw new ApiException($"Media library root is unavailable: {_libraryRoot}", 404);
        var path = Path.GetFullPath(value.Trim());
        var prefix = _libraryRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!path.Equals(_libraryRoot, StringComparison.Ordinal) && !path.StartsWith(prefix, StringComparison.Ordinal))
            throw new ApiException($"Movie folder must be inside {_libraryRoot}", 403);
        if (!Directory.Exists(path)) throw new ApiException("Movie folder was not found.", 404);
        return path;
    }

    private static bool IsPlayablePlaylist(string playlist)
    {
        if (!File.Exists(playlist) || new FileInfo(playlist).Length is 0 or > 2 * 1024 * 1024) return false;
        try
        {
            var directory = Path.GetDirectoryName(playlist)!;
            var references = File.ReadLines(playlist).Select(line => line.Trim()).Where(line => line.Length > 0 && !line.StartsWith('#')).ToArray();
            return references.Length > 0 && references.All(reference => SafeReferenceExists(directory, reference));
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    private static bool SafeReferenceExists(string directory, string reference)
    {
        if (Path.IsPathRooted(reference) || reference.Contains('\\') || reference.Split('/').Any(part => part is "" or "." or "..")) return false;
        var root = Path.GetFullPath(directory) + Path.DirectorySeparatorChar;
        var candidate = Path.GetFullPath(Path.Combine(directory, reference.Replace('/', Path.DirectorySeparatorChar)));
        return candidate.StartsWith(root, StringComparison.Ordinal) && File.Exists(candidate);
    }

    private static string BuildMaster(IEnumerable<string> qualities)
    {
        var lines = new List<string> { "#EXTM3U", "# KINOCHY-MEDIA-LIBRARY", "#EXT-X-VERSION:6" };
        foreach (var quality in qualities)
        {
            var profile = Profiles[quality];
            lines.Add($"#EXT-X-STREAM-INF:BANDWIDTH={profile.Bandwidth},RESOLUTION={profile.Width}x{profile.Height},NAME=\"{quality}\"");
            lines.Add($"{quality.ToLowerInvariant()}/stream.m3u8");
        }
        return string.Join('\n', lines) + "\n";
    }

    private static bool IsSubtitle(string path) => Path.GetExtension(path).Equals(".srt", StringComparison.OrdinalIgnoreCase)
        || Path.GetExtension(path).Equals(".vtt", StringComparison.OrdinalIgnoreCase);
    private static string? SubtitleLanguage(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
        return Regex.IsMatch(name, @"(^|[._-])en($|[._-])") ? "en" : Regex.IsMatch(name, @"(^|[._-])ru($|[._-])") ? "ru" : null;
    }
    private static string TypeFromPath(string path)
    {
        var parts = path.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
        return parts.Any(part => part.Equals("cartoons", StringComparison.OrdinalIgnoreCase)) ? "Cartoon"
            : parts.Any(part => part.Equals("serials", StringComparison.OrdinalIgnoreCase)) ? "Series" : "Movie";
    }
    private static string SuggestedTitle(string folder) => Regex.Replace(folder, @"[._](?=\d{4}\b).*", "").Replace('.', ' ').Trim();
    private static int? SuggestedYear(string folder) => int.TryParse(Regex.Match(folder, @"(?<!\d)(?<year>19\d{2}|20\d{2})(?!\d)").Groups["year"].Value, out var year) ? year : null;
}
