using System.Globalization;
using System.Text.RegularExpressions;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed record HlsPreviewResult(string Playlist,HashSet<string> Assets,double Duration);

public static class HlsPreview
{
    // Media is only offered in complete segments. Never include a segment that crosses the limit.
    public static HlsPreviewResult Build(string source)
    {
        var lines=source.Split('\n');
        var assets=new HashSet<string>(StringComparer.Ordinal);
        if(lines.Any(line=>line.TrimStart().StartsWith("#EXT-X-STREAM-INF:",StringComparison.Ordinal)))
            return new(source,assets,0);
        var output=new List<string>();var elapsed=0d;var pending=false;var finished=false;
        foreach(var raw in lines)
        {
            var line=raw.Trim().TrimStart('\uFEFF');
            if(line.Length==0||line=="#EXT-X-ENDLIST")continue;
            if(line.StartsWith("#EXTINF:",StringComparison.Ordinal))
            {
                if(!double.TryParse(line[8..].Split(',')[0],NumberStyles.Float,CultureInfo.InvariantCulture,out var duration)||!double.IsFinite(duration)||duration<=0)
                    throw new InvalidDataException("Invalid HLS segment duration.");
                if(elapsed+duration>SubscriptionAccess.FreePreviewSeconds+0.000001){finished=true;break;}
                elapsed+=duration;pending=true;
            }
            else if(pending&&!line.StartsWith('#'))
            {
                assets.Add(line);pending=false;
            }
            output.Add(line);
        }
        // Dependencies are only needed when at least one segment can be watched.
        if(assets.Count>0)
            foreach(var line in output.Where(line=>line.StartsWith("#EXT-X-MAP:")||line.StartsWith("#EXT-X-KEY:")))
                foreach(Match match in Regex.Matches(line,"URI=\"([^\"]+)\""))assets.Add(match.Groups[1].Value);
        if(!finished&&pending)throw new InvalidDataException("HLS segment URI is missing.");
        output.Add("#EXT-X-ENDLIST");
        return new(string.Join("\n",output)+"\n",assets,elapsed);
    }
}
