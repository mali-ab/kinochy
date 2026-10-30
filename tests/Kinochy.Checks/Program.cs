using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Http;
using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Primitives;
using Kinochy.Api.Controllers;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.Swagger;

var swaggerServices=new ServiceCollection();
swaggerServices.AddLogging();
swaggerServices.AddSingleton<IWebHostEnvironment>(new TestEnvironment(Path.GetTempPath()));
swaggerServices.AddControllers().AddApplicationPart(typeof(MoviesController).Assembly);
swaggerServices.AddSwaggerGen(options=>options.SwaggerDoc("v1",new OpenApiInfo { Title="Kinochy API",Version="v1" }));
using(var swaggerProvider=swaggerServices.BuildServiceProvider())
{
    var document=swaggerProvider.GetRequiredService<ISwaggerProvider>().GetSwagger("v1");
    if(!document.Paths.ContainsKey("/api/catalog")||!document.Paths.ContainsKey("/media/movies/{id}/playlist.m3u8"))
        throw new Exception("Swagger must include catalog and HLS playback endpoints.");
}
Console.WriteLine("PASS: Swagger document includes catalog and HLS playback endpoints");

static void Check(bool condition,string message)
{
    if(!condition)throw new Exception(message);
}

static FormFile QualityZip(string content,bool valid=true)
{
    var memory=new MemoryStream();
    using(var archive=new ZipArchive(memory,ZipArchiveMode.Create,true))
    {
        using(var writer=new StreamWriter(archive.CreateEntry("stream.m3u8").Open()))
            writer.Write(valid?"#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n":"invalid playlist");
        using var segment=new StreamWriter(archive.CreateEntry("segment.ts").Open());
        segment.Write(content);
    }
    memory.Position=0;
    return new FormFile(memory,0,memory.Length,"quality","quality.zip");
}

static async Task<string> Run(string executable,params string[] arguments)
{
    var start=new ProcessStartInfo(executable) { RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false };
    foreach(var argument in arguments)start.ArgumentList.Add(argument);
    using var process=Process.Start(start)!;
    var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    if(process.ExitCode!=0)throw new Exception(await errors);
    return await output;
}

var fixture="#EXTM3U\n#EXT-X-TARGETDURATION:7\n"+string.Concat(Enumerable.Range(0,87).Select(index=>$"#EXTINF:7,\nsegment{index}.ts\n"))+"#EXT-X-ENDLIST\n";
var preview=HlsPreview.Build(fixture);
Check(preview.Duration==595,"The crossing segment must be omitted.");
Check(preview.Assets.Contains("segment84.ts")&&!preview.Assets.Contains("segment85.ts"),"Preview asset permissions must match the bounded playlist.");
Check(preview.Playlist.EndsWith("#EXT-X-ENDLIST\n"),"Preview must end normally.");
var exact=HlsPreview.Build("#EXTM3U\n"+string.Concat(Enumerable.Range(0,60).Select(index=>$"#EXTINF:10,\n{index}.ts\n")));
Check(exact.Duration==600&&exact.Assets.Count==60,"An exact ten-minute preview must be preserved.");
var initialization=HlsPreview.Build("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:6,\nsegment.m4s\n");
Check(initialization.Assets.SetEquals(new[]{"init.mp4","key.bin","segment.m4s"}),"Initialization and encryption assets must be allowed only when referenced.");
Console.WriteLine("PASS: HLS preview boundaries, normal ending, and referenced asset permissions");

var directory=Path.Combine(Path.GetTempPath(),$"kinochy-checks-{Guid.NewGuid():N}");
Directory.CreateDirectory(directory);
try
{
    var original=await HlsUpload.SaveQualityBundleAsync(new[]{("720p",(IFormFile)QualityZip("original720")),("1080p",(IFormFile)QualityZip("original1080"))},directory);
    var originalText=await File.ReadAllTextAsync(original);
    var changed=await HlsUpload.SaveQualityBundleAsync(new[]{("720p",(IFormFile)QualityZip("new720"))},directory,original);
    Check(changed!=original,"Quality edits must create a new master playlist.");
    Check(await File.ReadAllTextAsync(Path.Combine(Path.GetDirectoryName(original)!,"720p","segment.ts"))=="original720","Replacing a quality must not touch the live video.");
    Check(await File.ReadAllTextAsync(Path.Combine(Path.GetDirectoryName(changed)!,"720p","segment.ts"))=="new720","New quality must be published in the staged version.");
    Check(File.Exists(Path.Combine(Path.GetDirectoryName(changed)!,"1080p","segment.ts")),"Unchanged quality must remain playable.");
    var failed=false;
    try { await HlsUpload.SaveQualityBundleAsync(new[]{("720p",(IFormFile)QualityZip("must-not-publish")),("1080p",(IFormFile)QualityZip("bad",false))},directory,original); }
    catch { failed=true; }
    Check(failed,"Invalid second quality must reject the entire upload.");
    Check(await File.ReadAllTextAsync(original)==originalText,"Rejected upload must preserve the original master.");
    Check(await File.ReadAllTextAsync(Path.Combine(Path.GetDirectoryName(original)!,"720p","segment.ts"))=="original720","Rejected upload must preserve original segments.");
    var removed=await HlsUpload.RemoveQualitiesAsync(original,new[]{"720p"},directory);
    Check(!(await File.ReadAllTextAsync(removed)).Contains("720p/"),"Removed quality must be absent from the new version.");
    Check(await File.ReadAllTextAsync(original)==originalText,"Removing quality must not change the live version before database commit.");
    Console.WriteLine("PASS: immutable quality replacement/removal and rejected-upload preservation");

    var hlsRoot=Path.Combine(directory,"index-playlist-fixture");
    var variant=Path.Combine(hlsRoot,"480p");
    Directory.CreateDirectory(variant);
    var master=Path.Combine(hlsRoot,"playlist.m3u8");
    await File.WriteAllTextAsync(master,"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1400000\n480p/index.m3u8\n");
    await File.WriteAllTextAsync(Path.Combine(variant,"index.m3u8"),"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment000.ts\n#EXTINF:10,\nsegment001.ts\n#EXT-X-ENDLIST\n");
    var firstSegment=Path.Combine(variant,"segment000.ts");
    await File.WriteAllBytesAsync(firstSegment,[0x47]);
    Check(await MediaService.IsPreviewAssetInBundleAsync(master,firstSegment),"A free preview must serve segments listed by index.m3u8.");
    Check(!await MediaService.IsPreviewAssetInBundleAsync(master,Path.Combine(variant,"not-listed.ts")),"A free preview must deny unlisted segments.");
    File.Move(Path.Combine(variant,"index.m3u8"),Path.Combine(variant,"playlist.m3u8"));
    Check(await MediaService.IsPreviewAssetInBundleAsync(master,firstSegment),"A free preview must serve segments listed by playlist.m3u8.");
    Console.WriteLine("PASS: free-preview segments in index.m3u8 and playlist.m3u8 quality playlists");

    var environment=new TestEnvironment(Path.Combine(directory,"application"));
    var config=new ConfigurationBuilder().Build();
    var database=new Database(config,environment,NullLogger<Database>.Instance);
    var movies=new MovieService(database,environment,new MediaLibraryService(config));
    var tokens=new TokenService(config);
    var context=new DefaultHttpContext();
    var account=new UsersController(new UserService(database),movies,new AuthService(database,tokens),tokens) {
        ControllerContext=new ControllerContext { HttpContext=context }
    };
    foreach(var cookie in new[]{"","kinochy_user=expired-or-invalid"})
    {
        context.Request.Headers.Cookie=cookie;
        Check((await account.FavoriteIds()).Length==0,"Anonymous/invalid sessions must receive empty favorites without 401.");
        Check(JsonSerializer.Serialize(await account.Favorite(Guid.NewGuid()))=="{\"favorite\":false}","Anonymous favorite status must be false.");
        Check(JsonSerializer.Serialize(await account.Check("movie","en","ru"))=="{\"entry\":null}","Optional saved-word lookup must not block guest playback.");
        Check(!await new SubscriptionService(database,tokens).HasFullAccessAsync(context.Request),"Anonymous/invalid sessions must use the free preview, never full access.");
        var writeProtected=false;
        try { await account.AddFavorite(Guid.NewGuid()); }
        catch(ApiException error) { writeProtected=error.StatusCode==401; }
        Check(writeProtected,"Saving favorites must still require login.");
    }
    Console.WriteLine("PASS: guest favorites/word reads, free preview access, and protected writes");
    var values=new Dictionary<string,StringValues>();
    foreach(var language in new[]{"Tm","En","Ru"}) { values[$"title{language}"]="Title";values[$"description{language}"]="Description"; }
    values["type"]="Movie";values["isSeries"]="false";values["genres"]="[\"Drama\"]";values["year"]="2026";values["rating"]="bad-rating";
    var upload=QualityZip("staged-only");
    var files=new FormFileCollection { new FormFile(upload.OpenReadStream(),0,upload.Length,"quality_720p","quality.zip") };
    var rejected=false;
    try { await movies.SaveAsync(null,new FormCollection(values,files)); }
    catch(ApiException error) { rejected=error.Message.Contains("Rating"); }
    Check(rejected,"Invalid metadata must reject the save before accessing the database.");
    Check(!Directory.EnumerateFileSystemEntries(Path.Combine(environment.ContentRootPath,"storage","uploads")).Any(),"Rejected save must remove all staged media.");
    Console.WriteLine("PASS: rejected movie save cleans staged uploads");

    var source=Path.Combine(directory,"source.mp4");
    await Run("ffmpeg","-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i","color=black:s=16x16:r=1:d=605","-c:v","libx264",source);
    var clip=await VideoPreview.CreateAsync(source,Path.Combine(directory,"previews"));
    var seconds=double.Parse((await Run("ffprobe","-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",clip)).Trim(),System.Globalization.CultureInfo.InvariantCulture);
    Check(seconds<=600&&seconds>=599,"Direct-video preview must be a valid ten-minute media file.");
    var modified=File.GetLastWriteTimeUtc(clip);
    Check(await VideoPreview.CreateAsync(source,Path.Combine(directory,"previews"))==clip&&File.GetLastWriteTimeUtc(clip)==modified,"Replay must reuse the valid preview, with no consumed-time restriction.");
    var hls=await VideoPreview.CreateAsync(source,Path.Combine(directory,"previews"),hls:true);
    Check(HlsPreview.Build(await File.ReadAllTextAsync(hls)).Duration<=600,"Generated byte-range fallback must also be bounded.");
    Console.WriteLine("PASS: playable direct-video preview, replay cache, and generated HLS fallback");
}
finally { Directory.Delete(directory,recursive:true); }

sealed class TestEnvironment(string root) : IWebHostEnvironment
{
    public string ApplicationName { get; set; }="Kinochy.Checks";
    public string EnvironmentName { get; set; }="Testing";
    public string ContentRootPath { get; set; }=root;
    public string WebRootPath { get; set; }=root;
    public IFileProvider ContentRootFileProvider { get; set; }=new NullFileProvider();
    public IFileProvider WebRootFileProvider { get; set; }=new NullFileProvider();
}
