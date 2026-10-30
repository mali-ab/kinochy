using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public static class VideoPreview
{
    private static readonly ConcurrentDictionary<string,SemaphoreSlim> Locks=new();
    private static readonly SemaphoreSlim EncoderSlots=new(2,2);

    public static async Task<string> CreateAsync(string source,string previewRoot,CancellationToken cancellationToken=default,bool hls=false)
    {
        var file=new FileInfo(source);
        var fingerprint=$"v1|{file.FullName}|{file.Length}|{file.LastWriteTimeUtc.Ticks}|{hls}";
        var key=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fingerprint))).ToLowerInvariant();
        var directory=Path.Combine(previewRoot,key);
        var output=Path.Combine(directory,hls?"index.m3u8":"preview.mp4");
        var gate=Locks.GetOrAdd(output,_=>new SemaphoreSlim(1,1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if(File.Exists(output))return output;
            Directory.CreateDirectory(previewRoot);
            var staging=Path.Combine(previewRoot,$"{key}-{Guid.NewGuid():N}-building");
            Directory.CreateDirectory(staging);
            var encoding=false;
            try
            {
                await EncoderSlots.WaitAsync(cancellationToken);encoding=true;
                var start=new ProcessStartInfo("ffmpeg") { UseShellExecute=false,RedirectStandardError=true,RedirectStandardOutput=true,WorkingDirectory=staging };
                foreach(var argument in new[]{"-nostdin","-hide_banner","-loglevel","error","-i",file.FullName,"-t",SubscriptionAccess.FreePreviewSeconds.ToString(CultureInfo.InvariantCulture),
                    "-map","0:v:0?","-map","0:a:0?","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac"})start.ArgumentList.Add(argument);
                var arguments=hls
                    ?new[]{"-f","hls","-hls_time","6","-hls_list_size","0","-hls_segment_filename","segment%05d.ts","index.m3u8"}
                    :new[]{"-movflags","+faststart","preview.mp4"};
                foreach(var argument in arguments)start.ArgumentList.Add(argument);
                using var process=Process.Start(start)??throw new InvalidOperationException("Could not start the preview encoder.");
                var errors=process.StandardError.ReadToEndAsync(cancellationToken);
                var stdout=process.StandardOutput.ReadToEndAsync(cancellationToken);
                try { await process.WaitForExitAsync(cancellationToken); }
                catch { if(!process.HasExited)process.Kill(entireProcessTree:true);await process.WaitForExitAsync();throw; }
                await stdout;
                if(process.ExitCode!=0)throw new InvalidOperationException($"Preview encoding failed: {await errors}");
                await errors;
                Directory.Move(staging,directory);
                return output;
            }
            finally { if(encoding)EncoderSlots.Release();if(Directory.Exists(staging))Directory.Delete(staging,recursive:true); }
        }
        finally { gate.Release(); }
    }
}
