using Npgsql;

namespace Kinochy.Api.Data;

public sealed class Database(IConfiguration configuration, IWebHostEnvironment environment, ILogger<Database> logger)
{
    private readonly string? _connectionString = Normalize(configuration["DATABASE_URL"]);
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_connectionString);

    public async Task<NpgsqlConnection> OpenAsync()
    {
        if (!IsConfigured) throw new InvalidOperationException("DATABASE_URL is required by the ASP.NET backend.");
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task InitializeAsync()
    {
        if (!IsConfigured)
        {
            logger.LogWarning("DATABASE_URL is not configured; database routes will be unavailable");
            return;
        }
        await using var connection = await OpenAsync();
        var schemaPath = Path.Combine(environment.ContentRootPath, "database", "schema.sql");
        await using var command = new NpgsqlCommand(await File.ReadAllTextAsync(schemaPath), connection);
        await command.ExecuteNonQueryAsync();
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("postgres" or "postgresql")) return value;
        var credentials = uri.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder { Host=uri.Host, Port=uri.IsDefaultPort?5432:uri.Port,
            Database=uri.AbsolutePath.Trim('/'), Username=Uri.UnescapeDataString(credentials[0]),
            Password=credentials.Length>1?Uri.UnescapeDataString(credentials[1]):"" }.ConnectionString;
    }
}
