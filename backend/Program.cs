using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = null);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 8589934592L);

builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
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
app.UseCors();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    await next();
});

Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "storage", "uploads"));
await app.Services.GetRequiredService<Database>().InitializeAsync();
await app.Services.GetRequiredService<AccountSeeder>().SeedAsync();
await app.Services.GetRequiredService<CountrySeeder>().SeedAsync();
await app.Services.GetRequiredService<PreloadedMediaSeeder>().SeedAsync();

app.MapControllers();
app.UseStaticFiles(new StaticFileOptions {
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(Path.Combine(app.Environment.ContentRootPath,"storage","uploads")),
    RequestPath = "/media/uploads",
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "public,max-age=604800,immutable"
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
