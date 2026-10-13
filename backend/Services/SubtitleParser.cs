using System.Globalization;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public static partial class SubtitleParser
{
    public static List<SubtitleCue> Parse(string source)
    {
        var result=new List<SubtitleCue>();foreach(var block in source.Replace("\r","").Split("\n\n",StringSplitOptions.RemoveEmptyEntries)){var lines=block.Split('\n').Where(line=>!line.Equals("WEBVTT",StringComparison.OrdinalIgnoreCase)).ToArray();if(lines.Length<2)continue;var timeIndex=Array.FindIndex(lines,line=>line.Contains(" --> "));if(timeIndex<0||timeIndex>=lines.Length-1)continue;var times=lines[timeIndex].Split(" --> ");if(times.Length!=2)continue;result.Add(new(int.TryParse(lines.ElementAtOrDefault(timeIndex-1),out var id)?id:result.Count+1,Seconds(times[0]),Seconds(times[1].Split(' ')[0]),string.Join("\n",lines.Skip(timeIndex+1)).Trim()));}return result;
    }
    private static double Seconds(string value)=>TimeSpan.TryParseExact(value.Trim().Replace(',', '.'),"hh\\:mm\\:ss\\.fff",CultureInfo.InvariantCulture,out var time)?time.TotalSeconds:0;
}
