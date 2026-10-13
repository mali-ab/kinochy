using System.IO.Compression;
using Kinochy.Api.Infrastructure;

namespace Kinochy.Api.Services;

public static class SubtitleBundle
{
    private const int MaxFiles = 10;
    private const long MaxBytes = 20 * 1024 * 1024;

    public static async Task<Dictionary<string,string>> ReadAsync(IFormFile zipFile)
    {
        try
        {
            await using var source=zipFile.OpenReadStream();
            using var archive=new ZipArchive(source,ZipArchiveMode.Read,leaveOpen:false);
            var entries=archive.Entries.Where(entry=>!string.IsNullOrEmpty(entry.Name)&&!entry.FullName.Replace('\\','/').StartsWith("__MACOSX/",StringComparison.Ordinal)&&entry.Name!=".DS_Store").ToList();
            if(entries.Count is 0 or >MaxFiles)throw new ApiException("Subtitle ZIP must contain between 1 and 10 files.");
            var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);long total=0;
            foreach(var entry in entries)
            {
                var name=entry.FullName.Replace('\\','/');
                if(Path.IsPathRooted(name)||name.IndexOfAny([':', '?', '#', '%'])>=0||name.Split('/').Any(part=>part is "" or "." or ".."))throw new ApiException("Subtitle ZIP contains an unsafe path.");
                var extension=Path.GetExtension(entry.Name).ToLowerInvariant();
                if(extension is not ".srt" and not ".vtt")throw new ApiException($"Unsupported subtitle file: {entry.Name}");
                total=checked(total+entry.Length);if(total>MaxBytes)throw new ApiException("Extracted subtitles exceed 20 MiB.");
                var language=Language(entry.Name)??throw new ApiException($"Add en/english or ru/russian to the subtitle filename: {entry.Name}");
                if(result.ContainsKey(language))throw new ApiException($"Subtitle ZIP contains more than one {language.ToUpperInvariant()} file.");
                using var reader=new StreamReader(entry.Open());result[language]=await reader.ReadToEndAsync();
            }
            return result;
        }
        catch(InvalidDataException){throw new ApiException("The subtitle file is not a valid ZIP archive.");}
        catch(OverflowException){throw new ApiException("Extracted subtitles exceed 20 MiB.");}
    }

    private static string? Language(string name)
    {
        var value=Path.GetFileNameWithoutExtension(name).ToLowerInvariant();
        var tokens=value.Split(['.','_','-',' '],StringSplitOptions.RemoveEmptyEntries);
        if(tokens.Any(token=>token is "en" or "eng" or "english"))return "en";
        if(tokens.Any(token=>token is "ru" or "rus" or "russian"))return "ru";
        return null;
    }
}
