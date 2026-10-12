using System.Globalization;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public static partial class SubtitleParser
{
    public static List<SubtitleCue> Parse(string source)
    {
        var result=new List<SubtitleCue>();foreach(var block in source.Replace("\r","").Split("\n\n",StringSplitOptions.RemoveEmptyEntries)){var lines=block.Split('\n');if(lines.Length<3)continue;var times=lines[1].Split(" --> ");if(times.Length!=2)continue;result.Add(new(int.TryParse(lines[0],out var id)?id:result.Count+1,Seconds(times[0]),Seconds(times[1]),string.Join("\n",lines.Skip(2)).Trim()));}return result;
    }
    private static double Seconds(string value)=>TimeSpan.TryParseExact(value.Trim().Replace(',', '.'),"hh\\:mm\\:ss\\.fff",CultureInfo.InvariantCulture,out var time)?time.TotalSeconds:0;
}
