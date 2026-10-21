using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using Kinochy.Api.Infrastructure;

namespace Kinochy.Api.Services;

public static partial class HlsUpload
{
    private static readonly Dictionary<string, (int Width, int Height, int Bandwidth)> QualityProfiles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["144p"] = (256, 144, 180_000),
        ["240p"] = (426, 240, 350_000),
        ["360p"] = (640, 360, 800_000),
        ["480p"] = (854, 480, 1_400_000),
        ["720p"] = (1280, 720, 2_800_000),
        ["1080p"] = (1920, 1080, 5_500_000),
        ["1440p"] = (2560, 1440, 9_000_000),
        ["2160p"] = (3840, 2160, 18_000_000)
    };
    private const int MaxFiles = 10_000;
    private const long MaxExtractedBytes = 8L * 1024 * 1024 * 1024;
    private const long MaxPlaylistBytes = 2 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".m3u8", ".ts", ".m4s", ".mp4", ".aac", ".mp3", ".vtt", ".key"
    };

    [GeneratedRegex("URI=\"([^\"]+)\"", RegexOptions.IgnoreCase)]
    private static partial Regex UriAttribute();

    public static async Task<string> SaveAsync(IFormFile playlist, IReadOnlyList<IFormFile> assets, string uploadRoot)
    {
        if (assets.Count == 0) throw new ApiException("Select the HLS segment files along with the .m3u8 playlist.");
        if (assets.Count + 1 > MaxFiles) throw new ApiException("Too many HLS files in one upload.");

        var names = new HashSet<string>(StringComparer.Ordinal) { "playlist.m3u8" };
        foreach (var asset in assets)
        {
            ValidateFlatName(asset.FileName);
            ValidateExtension(asset.FileName);
            if (!names.Add(asset.FileName)) throw new ApiException($"Duplicate HLS file: {asset.FileName}");
        }

        await ValidatePlaylistAsync(playlist, "playlist.m3u8", names);
        foreach (var asset in assets.Where(IsPlaylist))
            await ValidatePlaylistAsync(asset, asset.FileName, names);

        var directory = CreateBundleDirectory(uploadRoot);
        try
        {
            await CopyAsync(playlist, Path.Combine(directory, "playlist.m3u8"));
            foreach (var asset in assets) await CopyAsync(asset, Path.Combine(directory, asset.FileName));
            return Path.Combine(directory, "playlist.m3u8");
        }
        catch
        {
            Directory.Delete(directory, recursive: true);
            throw;
        }
    }

    public static async Task<string> SaveZipAsync(IFormFile zipFile, string uploadRoot)
    {
        var directory = CreateBundleDirectory(uploadRoot);
        try
        {
            await using var source = zipFile.OpenReadStream();
            using var archive = new ZipArchive(source, ZipArchiveMode.Read, leaveOpen: false);
            var entries = archive.Entries.Where(entry => !string.IsNullOrEmpty(entry.Name)).ToList();
            if (entries.Count == 0) throw new ApiException("The HLS ZIP archive is empty.");
            if (entries.Count > MaxFiles) throw new ApiException("The HLS ZIP archive contains too many files.");
            foreach (var entry in entries) ValidateRelativePath(entry.FullName.Replace('\\', '/'));

            var prefix = CommonTopDirectory(entries.Select(entry => entry.FullName));
            var files = new Dictionary<string, ZipArchiveEntry>(StringComparer.Ordinal);
            long totalBytes = 0;
            foreach (var entry in entries)
            {
                var relative = NormalizeArchivePath(entry.FullName, prefix);
                ValidateExtension(relative);
                totalBytes = checked(totalBytes + entry.Length);
                if (totalBytes > MaxExtractedBytes) throw new ApiException("The extracted HLS bundle exceeds the 8 GiB limit.");
                if (!files.TryAdd(relative, entry)) throw new ApiException($"Duplicate HLS file in ZIP: {relative}");
            }

            var names = files.Keys.ToHashSet(StringComparer.Ordinal);
            var playlists = files.Keys.Where(name => Path.GetExtension(name).Equals(".m3u8", StringComparison.OrdinalIgnoreCase)).ToList();
            string? generatedPlaylist = null;
            if (playlists.Count == 0)
            {
                var segments = files.Where(item => Path.GetExtension(item.Key).Equals(".ts", StringComparison.OrdinalIgnoreCase)).ToList();
                if (segments.Count == 0 || segments.Count != files.Count)
                    throw new ApiException("The HLS ZIP needs an M3U8 playlist. A playlist can only be generated automatically when the ZIP contains only .ts segment files.");
                generatedPlaylist = await BuildTsPlaylistAsync(segments);
                playlists.Add("stream.m3u8");
            }
            if (generatedPlaylist is null)
                foreach (var name in playlists) await ValidatePlaylistAsync(files[name], name, names);

            var mainPlaylist = generatedPlaylist is null ? SelectMainPlaylist(playlists) : "stream.m3u8";
            foreach (var (relative, entry) in files)
            {
                var destination = Path.Combine(directory, relative.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                await using var input = entry.Open();
                await using var output = File.Create(destination);
                await input.CopyToAsync(output);
            }
            if (generatedPlaylist is not null)
                await File.WriteAllTextAsync(Path.Combine(directory, "stream.m3u8"), generatedPlaylist);
            return Path.Combine(directory, mainPlaylist.Replace('/', Path.DirectorySeparatorChar));
        }
        catch (InvalidDataException)
        {
            Directory.Delete(directory, recursive: true);
            throw new ApiException("The uploaded file is not a valid ZIP archive.");
        }
        catch (OverflowException)
        {
            Directory.Delete(directory, recursive: true);
            throw new ApiException("The extracted HLS bundle exceeds the 8 GiB limit.");
        }
        catch
        {
            Directory.Delete(directory, recursive: true);
            throw;
        }
    }

    public static async Task<string> SaveQualityBundleAsync(IReadOnlyList<(string Quality, IFormFile Zip)> renditions, string uploadRoot, string? existingPlaylist = null)
    {
        if (renditions.Count == 0) throw new ApiException("Add at least one quality ZIP.");
        if (renditions.Select(item => item.Quality).Distinct(StringComparer.OrdinalIgnoreCase).Count() != renditions.Count)
            throw new ApiException("Each movie quality can only be uploaded once.");

        var existingVariants = existingPlaylist is not null && Path.GetExtension(existingPlaylist).Equals(".m3u8", StringComparison.OrdinalIgnoreCase) && File.Exists(existingPlaylist)
            ? ReadMasterVariants(existingPlaylist)
            : [];
        var canExtend = existingVariants.Count > 0;
        var bundleDirectory = canExtend ? Path.GetDirectoryName(existingPlaylist!)! : CreateBundleDirectory(uploadRoot);
        var variants = canExtend ? existingVariants : new List<(string Quality, string Playlist)>();
        var createdBundle = !canExtend;
        try
        {
            foreach (var (quality, zip) in renditions)
            {
                if (!QualityProfiles.ContainsKey(quality)) throw new ApiException($"Unsupported movie quality: {quality}");
                if (!Path.GetExtension(zip.FileName).Equals(".zip", StringComparison.OrdinalIgnoreCase))
                    throw new ApiException($"{quality} must be uploaded as a ZIP containing an M3U8 playlist and its segments.");

                var savedPlaylist = await SaveZipAsync(zip, uploadRoot);
                var temporaryDirectory = FindBundleDirectory(savedPlaylist, uploadRoot);
                var relativePlaylist = Path.GetRelativePath(temporaryDirectory, savedPlaylist);
                var qualityDirectory = Path.Combine(bundleDirectory, quality.ToLowerInvariant());
                if (Directory.Exists(qualityDirectory)) Directory.Delete(qualityDirectory, recursive: true);
                Directory.Move(temporaryDirectory, qualityDirectory);
                variants.RemoveAll(item => item.Quality.Equals(quality, StringComparison.OrdinalIgnoreCase));
                variants.Add((quality.ToLowerInvariant(), $"{quality.ToLowerInvariant()}/{relativePlaylist.Replace('\\', '/')}"));
            }

            var masterPath = Path.Combine(bundleDirectory, "playlist.m3u8");
            await File.WriteAllTextAsync(masterPath, BuildMasterPlaylist(variants));
            return masterPath;
        }
        catch
        {
            if (createdBundle && Directory.Exists(bundleDirectory)) Directory.Delete(bundleDirectory, recursive: true);
            throw;
        }
    }

    public static async Task<string> RemoveQualitiesAsync(string masterPath, IEnumerable<string> requestedQualities)
    {
        var removals=requestedQualities.Select(quality=>quality.Trim().ToLowerInvariant()).Where(quality=>quality.Length>0).Distinct(StringComparer.OrdinalIgnoreCase).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if(removals.Count==0)return masterPath;
        if(removals.Any(quality=>!QualityProfiles.ContainsKey(quality)))throw new ApiException("Unsupported movie quality removal request.");
        if(!File.Exists(masterPath)||!Path.GetExtension(masterPath).Equals(".m3u8",StringComparison.OrdinalIgnoreCase))throw new ApiException("The movie does not have an editable HLS quality playlist.");

        var variants=ReadMasterVariants(masterPath);
        var remaining=variants.Where(item=>!removals.Contains(item.Quality)).ToList();
        if(remaining.Count==0)throw new ApiException("A movie must keep at least one HLS quality.");

        var masterDirectory=Path.GetFullPath(Path.GetDirectoryName(masterPath)!);
        var directoryPrefix=masterDirectory.TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
        foreach(var variant in variants.Where(item=>removals.Contains(item.Quality)))
        {
            var relative=variant.Playlist.Replace('/',Path.DirectorySeparatorChar);
            var firstPart=relative.Split(Path.DirectorySeparatorChar,StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if(firstPart is null||!firstPart.Equals(variant.Quality,StringComparison.OrdinalIgnoreCase))continue;
            var qualityDirectory=Path.GetFullPath(Path.Combine(masterDirectory,firstPart));
            if(!qualityDirectory.StartsWith(directoryPrefix,StringComparison.Ordinal)||!Directory.Exists(qualityDirectory))continue;
            var attributes=File.GetAttributes(qualityDirectory);
            Directory.Delete(qualityDirectory,recursive:(attributes&FileAttributes.ReparsePoint)==0);
        }
        await File.WriteAllTextAsync(masterPath,BuildMasterPlaylist(remaining));
        return masterPath;
    }

    private static List<(string Quality, string Playlist)> ReadMasterVariants(string masterPath)
    {
        var variants = new List<(string Quality, string Playlist)>();
        var lines = File.ReadAllLines(masterPath);
        for (var index = 0; index < lines.Length - 1; index++)
        {
            if (!lines[index].StartsWith("#EXT-X-STREAM-INF:", StringComparison.Ordinal)) continue;
            var match = Regex.Match(lines[index], @"RESOLUTION=\d+x(?<height>\d+)", RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            var quality = $"{match.Groups["height"].Value}p";
            if (!QualityProfiles.ContainsKey(quality)) continue;
            var playlist = lines.Skip(index + 1).FirstOrDefault(line => line.Length > 0 && !line.StartsWith('#'));
            if (playlist is not null) variants.Add((quality.ToLowerInvariant(), playlist));
        }
        return variants;
    }

    private static string FindBundleDirectory(string playlistPath, string uploadRoot)
    {
        var relative = Path.GetRelativePath(uploadRoot, playlistPath);
        var firstPart = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];
        var directory = Path.Combine(uploadRoot, firstPart);
        if (!directory.StartsWith(Path.GetFullPath(uploadRoot) + Path.DirectorySeparatorChar, StringComparison.Ordinal) || !Directory.Exists(directory))
            throw new ApiException("Could not prepare the HLS quality bundle.");
        return directory;
    }

    private static string BuildMasterPlaylist(IEnumerable<(string Quality, string Playlist)> variants)
    {
        var lines = new List<string> { "#EXTM3U", "# KINOCHY-QUALITY-BUNDLE", "#EXT-X-VERSION:3" };
        foreach (var variant in variants.OrderBy(item => QualityProfiles[item.Quality].Height))
        {
            var profile = QualityProfiles[variant.Quality];
            lines.Add($"#EXT-X-STREAM-INF:BANDWIDTH={profile.Bandwidth},RESOLUTION={profile.Width}x{profile.Height},NAME=\"{variant.Quality}\"");
            lines.Add(variant.Playlist);
        }
        return string.Join("\n", lines) + "\n";
    }

    private static async Task<string> BuildTsPlaylistAsync(List<KeyValuePair<string, ZipArchiveEntry>> segmentFiles)
    {
        var segments = segmentFiles
            .OrderBy(item => NaturalSortKey(item.Key), StringComparer.OrdinalIgnoreCase)
            .ToList();
        var timestamps = new List<long?>(segments.Count);
        foreach (var (_, entry) in segments) timestamps.Add(await ReadFirstPtsAsync(entry));

        var durations = new double?[segments.Count];
        for (var index = 0; index < segments.Count; index++)
        {
            if (index + 1 < segments.Count && timestamps[index] is long first && timestamps[index + 1] is long next)
                durations[index] = ValidDuration(PtsSeconds(first, next));
        }

        var measured = durations.Where(value => value.HasValue).Select(value => value!.Value).Order().ToList();
        var fallback = measured.Count == 0 ? 6d : measured[measured.Count / 2];
        for (var index = 0; index < durations.Length; index++) durations[index] ??= fallback;

        var targetDuration = Math.Max(1, (int)Math.Ceiling(durations.Max(value => value!.Value)));
        var playlist = new StringBuilder()
            .AppendLine("#EXTM3U")
            .AppendLine("#EXT-X-VERSION:3")
            .AppendLine($"#EXT-X-TARGETDURATION:{targetDuration}")
            .AppendLine("#EXT-X-MEDIA-SEQUENCE:0")
            .AppendLine("#EXT-X-PLAYLIST-TYPE:VOD")
            .AppendLine("#EXT-X-INDEPENDENT-SEGMENTS");
        for (var index = 0; index < segments.Count; index++)
        {
            playlist.Append("#EXTINF:").Append(durations[index]!.Value.ToString("0.######", CultureInfo.InvariantCulture)).AppendLine(",");
            playlist.AppendLine(segments[index].Key);
        }
        return playlist.AppendLine("#EXT-X-ENDLIST").ToString();
    }

    private static string NaturalSortKey(string name) => Regex.Replace(
        name,
        @"\d+",
        match => match.Value.TrimStart('0').PadLeft(20, '0'));

    private static async Task<long?> ReadFirstPtsAsync(ZipArchiveEntry entry)
    {
        await using var stream = entry.Open();
        var packet = new byte[188];
        var packetsRead = 0;
        while (packetsRead++ < 10_000 && await ReadPacketAsync(stream, packet))
        {
            if (packet[0] != 0x47 || (packet[1] & 0x40) == 0) continue;
            var adaptationControl = (packet[3] >> 4) & 0x03;
            if (adaptationControl is 0 or 2) continue;
            var payload = 4;
            if (adaptationControl == 3) payload += packet[4] + 1;
            if (payload + 14 > packet.Length || packet[payload] != 0 || packet[payload + 1] != 0 || packet[payload + 2] != 1) continue;
            if ((packet[payload + 7] & 0x80) == 0 || packet[payload + 8] < 5) continue;

            var offset = payload + 9;
            return ((long)((packet[offset] >> 1) & 0x07) << 30)
                   | ((long)packet[offset + 1] << 22)
                   | ((long)((packet[offset + 2] >> 1) & 0x7F) << 15)
                   | ((long)packet[offset + 3] << 7)
                   | (long)((packet[offset + 4] >> 1) & 0x7F);
        }
        return null;
    }

    private static async Task<bool> ReadPacketAsync(Stream stream, byte[] packet)
    {
        var offset = 0;
        while (offset < packet.Length)
        {
            var read = await stream.ReadAsync(packet.AsMemory(offset, packet.Length - offset));
            if (read == 0) return false;
            offset += read;
        }
        return true;
    }

    private static double PtsSeconds(long first, long last)
    {
        var ticks = last - first;
        if (ticks < 0) ticks += 1L << 33;
        return ticks / 90_000d;
    }

    private static double? ValidDuration(double seconds) => seconds is >= 0.1 and <= 120 ? seconds : null;

    private static string CreateBundleDirectory(string uploadRoot)
    {
        var directory = Path.Combine(uploadRoot, $"{Guid.NewGuid():N}-hls");
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static string SelectMainPlaylist(List<string> playlists)
    {
        var master = playlists.FirstOrDefault(name => name.Equals("master.m3u8", StringComparison.OrdinalIgnoreCase));
        if (master is not null) return master;
        var rootPlaylists = playlists.Where(name => !name.Contains('/')).ToList();
        if (rootPlaylists.Count == 1) return rootPlaylists[0];
        if (playlists.Count == 1) return playlists[0];
        throw new ApiException("The HLS ZIP archive needs a root master.m3u8 playlist.");
    }

    private static string CommonTopDirectory(IEnumerable<string> entryNames)
    {
        var names = entryNames.Select(name => name.Replace('\\', '/').TrimStart('/')).ToList();
        var firstSegments = names.Select(name => name.Split('/', 2)[0]).Distinct(StringComparer.Ordinal).ToList();
        return firstSegments.Count == 1 && names.All(name => name.Contains('/')) ? firstSegments[0] + "/" : "";
    }

    private static string NormalizeArchivePath(string name, string prefix)
    {
        var normalized = name.Replace('\\', '/');
        if (prefix.Length > 0 && normalized.StartsWith(prefix, StringComparison.Ordinal)) normalized = normalized[prefix.Length..];
        ValidateRelativePath(normalized);
        return normalized;
    }

    private static async Task ValidatePlaylistAsync(IFormFile file, string playlistName, HashSet<string> names)
    {
        if (file.Length == 0 || file.Length > MaxPlaylistBytes)
            throw new ApiException("HLS playlists must be between 1 byte and 2 MiB.");
        using var reader = new StreamReader(file.OpenReadStream());
        ValidatePlaylistText(await reader.ReadToEndAsync(), playlistName, names);
    }

    private static async Task ValidatePlaylistAsync(ZipArchiveEntry entry, string playlistName, HashSet<string> names)
    {
        if (entry.Length == 0 || entry.Length > MaxPlaylistBytes)
            throw new ApiException("HLS playlists must be between 1 byte and 2 MiB.");
        using var reader = new StreamReader(entry.Open());
        ValidatePlaylistText(await reader.ReadToEndAsync(), playlistName, names);
    }

    private static void ValidatePlaylistText(string text, string playlistName, HashSet<string> names)
    {
        if (!text.TrimStart('\uFEFF', ' ', '\r', '\n').StartsWith("#EXTM3U", StringComparison.Ordinal))
            throw new ApiException($"Invalid HLS playlist: {playlistName}");
        var references = 0;
        foreach (var line in text.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (!line.StartsWith('#')) { ValidateReference(line, playlistName, names); references++; }
            foreach (Match match in UriAttribute().Matches(line)) { ValidateReference(match.Groups[1].Value, playlistName, names); references++; }
        }
        if (references == 0) throw new ApiException($"HLS playlist has no media references: {playlistName}");
    }

    private static void ValidateReference(string reference, string playlistName, HashSet<string> names)
    {
        ValidateRelativePath(reference);
        var playlistDirectory = Path.GetDirectoryName(playlistName.Replace('/', Path.DirectorySeparatorChar)) ?? "";
        var bundleRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "kinochy-hls-validation"));
        var combined = Path.GetFullPath(Path.Combine(bundleRoot, playlistDirectory, reference.Replace('/', Path.DirectorySeparatorChar)));
        var rootPrefix = bundleRoot + Path.DirectorySeparatorChar;
        if (!combined.StartsWith(rootPrefix, StringComparison.Ordinal)) throw new ApiException($"Unsafe HLS reference: {reference}");
        var resolved = Path.GetRelativePath(bundleRoot, combined).Replace('\\', '/');
        if (!names.Contains(resolved)) throw new ApiException($"HLS playlist references missing file: {reference}");
    }

    private static void ValidateRelativePath(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || Path.IsPathRooted(name) || name.Contains('\\') ||
            name.IndexOfAny([':', '?', '#', '%']) >= 0 ||
            name.Split('/').Any(part => part is "" or "." or ".."))
            throw new ApiException($"Unsafe or remote HLS path: {name}");
    }

    private static void ValidateFlatName(string name)
    {
        ValidateRelativePath(name);
        if (name.Contains('/')) throw new ApiException("Use a ZIP archive to upload HLS bundles with nested folders.");
    }

    private static void ValidateExtension(string name)
    {
        if (!AllowedExtensions.Contains(Path.GetExtension(name))) throw new ApiException($"Unsupported HLS file: {name}");
    }

    private static bool IsPlaylist(IFormFile file) => Path.GetExtension(file.FileName).Equals(".m3u8", StringComparison.OrdinalIgnoreCase);

    private static async Task CopyAsync(IFormFile source, string destination)
    {
        await using var output = File.Create(destination);
        await source.CopyToAsync(output);
    }
}
