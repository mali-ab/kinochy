using System.Text.Json;
using Kinochy.Api.Data;

namespace Kinochy.Api.Services;

public sealed class PreloadedMediaSeeder(Database database, IWebHostEnvironment environment, ILogger<PreloadedMediaSeeder> logger)
{
    private sealed record Manifest(string Title, string Playlist);

    public async Task SeedAsync()
    {
        if (!database.IsConfigured) return;
        var root = Path.Combine(environment.ContentRootPath, "storage", "preloaded");
        if (!Directory.Exists(root)) return;

        foreach (var manifestPath in Directory.EnumerateFiles(root, "movie.json", SearchOption.AllDirectories))
        {
            var directory = Path.GetDirectoryName(manifestPath)!;
            var manifest = JsonSerializer.Deserialize<Manifest>(await File.ReadAllTextAsync(manifestPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (manifest is null || string.IsNullOrWhiteSpace(manifest.Title) || string.IsNullOrWhiteSpace(manifest.Playlist)) continue;

            var playlist = Path.GetFullPath(Path.Combine(directory, manifest.Playlist));
            var directoryPrefix = Path.GetFullPath(directory) + Path.DirectorySeparatorChar;
            if (!playlist.StartsWith(directoryPrefix, StringComparison.Ordinal) || !File.Exists(playlist) ||
                !Path.GetExtension(playlist).Equals(".m3u8", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Invalid preloaded HLS playlist in {manifestPath}");

            await using var connection = await database.OpenAsync();
            await using var command = connection.Command(
                "UPDATE movies SET video_path=@playlist, updated_at=now() WHERE lower(title)=lower(@title)",
                ("playlist", playlist), ("title", manifest.Title));
            var updated = await command.ExecuteNonQueryAsync();
            logger.LogInformation("Preloaded HLS bundle {Title}: updated {Count} movie record(s)", manifest.Title, updated);
        }
    }
}
