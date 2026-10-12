using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = null);

builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddHttpClient<TranslationService>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins((builder.Configuration["CLIENT_ORIGIN"] ?? "http://localhost:5173")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddSingleton<Database>();
builder.Services.AddSingleton<AccountSeeder>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<MovieService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<MediaService>();

var app = builder.Build();
app.UseMiddleware<ErrorMiddleware>();
app.UseCors();

var basePath = (app.Configuration["APP_BASE_PATH"] ?? "").Trim('/');
if (basePath.Length > 0) app.UsePathBase('/' + basePath);

Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "storage", "uploads"));
await app.Services.GetRequiredService<Database>().InitializeAsync();
await app.Services.GetRequiredService<AccountSeeder>().SeedAsync();

app.MapControllers();
app.UseStaticFiles(new StaticFileOptions {
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(Path.Combine(app.Environment.ContentRootPath,"storage","uploads")),
    RequestPath = "/media/uploads"
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
