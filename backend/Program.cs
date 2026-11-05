using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);
if(builder.Environment.IsDevelopment())
{
    var dotenvPath=FindProjectEnvFile(builder.Environment.ContentRootPath,Directory.GetCurrentDirectory());
    if(dotenvPath is not null)
    {
        builder.Configuration.AddInMemoryCollection(ReadDotEnv(dotenvPath));
        builder.Configuration.AddEnvironmentVariables();
        builder.Configuration.AddCommandLine(args);
    }
}
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = null);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 8589934592L);

builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddSwaggerGen(options =>
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Kinoçy API", Version = "v1" }));
builder.Services.AddHttpClient<TranslationService>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if(builder.Environment.IsDevelopment())
        policy.SetIsOriginAllowed(origin=>Uri.TryCreate(origin,UriKind.Absolute,out var uri)&&(uri.Scheme is "http" or "https")&&uri.Port==4000);
    else policy.WithOrigins("http://localhost:4000", "http://127.0.0.1:4000");
    policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
}));
builder.Services.AddSingleton<Database>();
builder.Services.AddSingleton<AccountSeeder>();
builder.Services.AddSingleton<CountrySeeder>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<MovieService>();
builder.Services.AddScoped<MovieCommunityService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<MediaService>();
builder.Services.AddScoped<MediaLibraryService>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddSingleton<PreloadedMediaSeeder>();

var app = builder.Build();
app.UseMiddleware<ErrorMiddleware>();
app.UseSwagger(options => options.RouteTemplate = "api/swagger/{documentName}/swagger.json");
app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "api/swagger";
    options.SwaggerEndpoint("v1/swagger.json", "Kinoçy API v1");
});
app.UseCors();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    // Uploaded media must pass through the subscription-aware controllers.
    if(context.Request.Path.StartsWithSegments("/media/uploads")&&
        Path.GetExtension(context.Request.Path.Value??"").ToLowerInvariant() is not (".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".avif" or ".svg" or ".ico"))
    {
        context.Response.StatusCode=404;
        return;
    }
    await next();
});

var movieStoragePath=Path.GetFullPath(app.Configuration["MOVIE_STORAGE_PATH"]
    ?? Path.Combine(app.Environment.ContentRootPath,"storage","uploads"));
Directory.CreateDirectory(movieStoragePath);
await app.Services.GetRequiredService<Database>().InitializeAsync();
await app.Services.GetRequiredService<AccountSeeder>().SeedAsync();
await app.Services.GetRequiredService<CountrySeeder>().SeedAsync();
await app.Services.GetRequiredService<PreloadedMediaSeeder>().SeedAsync();

app.MapControllers();
app.UseStaticFiles(new StaticFileOptions {
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(movieStoragePath),
    RequestPath = "/media/uploads",
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "public,max-age=604800,immutable"
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();

static string? FindProjectEnvFile(params string[] starts)
{
    foreach(var start in starts)
    {
        for(var directory=new DirectoryInfo(start);directory is not null;directory=directory.Parent)
        {
            var candidate=Path.Combine(directory.FullName,".env");
            if(File.Exists(candidate))return candidate;
        }
    }
    return null;
}

static Dictionary<string,string?> ReadDotEnv(string path)
{
    var values=new Dictionary<string,string?>();
    foreach(var original in File.ReadLines(path))
    {
        var line=original.Trim();
        if(line.Length==0||line.StartsWith('#'))continue;
        if(line.StartsWith("export ",StringComparison.Ordinal))line=line[7..].TrimStart();
        var separator=line.IndexOf('=');
        if(separator<=0)continue;
        var key=line[..separator].Trim();
        if(key.Length==0||key.Any(character=>!char.IsAsciiLetterOrDigit(character)&&character!='_'))continue;
        var value=line[(separator+1)..].Trim();
        if(value.Length>=2&&((value[0]=='"'&&value[^1]=='"')||(value[0]=='\''&&value[^1]=='\'')))
            value=value[1..^1];
        else
        {
            var comment=value.IndexOf(" #",StringComparison.Ordinal);
            if(comment>=0)value=value[..comment].TrimEnd();
        }
        values[key]=value;
    }
    return values;
}
