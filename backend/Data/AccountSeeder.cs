namespace Kinochy.Api.Data;

public sealed class AccountSeeder(Database database, IConfiguration configuration, ILogger<AccountSeeder> logger)
{
    public async Task SeedAsync()
    {
        if (!database.IsConfigured || configuration.GetValue("SEED_ACCOUNTS", true) == false)
            return;

        var adminEmail = Required("ADMIN_EMAIL", "admin@kinochy.local");
        var adminPassword = Required("ADMIN_PASSWORD", "KinochyAdmin@4321!");
        var userName = Required("DEFAULT_USER_NAME", "Allberdov");
        var userEmail = Required("DEFAULT_USER_EMAIL", "allberdov@gmail.com");
        var userPassword = Required("DEFAULT_USER_PASSWORD", "Kinochy@4321!");
        var syncPasswords = configuration.GetValue("SEED_SYNC_PASSWORDS", false);

        await using var connection = await database.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        var adminSql = syncPasswords
            ? """
              INSERT INTO admins (email, password_hash)
              VALUES (lower(@email), @hash)
              ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
              """
            : """
              INSERT INTO admins (email, password_hash)
              VALUES (lower(@email), @hash)
              ON CONFLICT (email) DO NOTHING
              """;
        await using (var command = connection.Command(adminSql,
            ("email", adminEmail),
            ("hash", BCrypt.Net.BCrypt.HashPassword(adminPassword))))
        {
            command.Transaction = transaction;
            await command.ExecuteNonQueryAsync();
        }

        var userSql = syncPasswords
            ? """
              INSERT INTO users (username, email, password_hash, role, language, verified)
              VALUES (@name, lower(@email), @hash, 'user', 'tm', true)
              ON CONFLICT (email) DO UPDATE SET
                  username = EXCLUDED.username,
                  password_hash = EXCLUDED.password_hash,
                  verified = true
              """
            : """
              INSERT INTO users (username, email, password_hash, role, language, verified)
              VALUES (@name, lower(@email), @hash, 'user', 'tm', true)
              ON CONFLICT (email) DO NOTHING
              """;
        await using (var command = connection.Command(userSql,
            ("name", userName),
            ("email", userEmail),
            ("hash", BCrypt.Net.BCrypt.HashPassword(userPassword))))
        {
            command.Transaction = transaction;
            await command.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
        logger.LogInformation("Seed accounts ready: admin {AdminEmail}, user {UserEmail}", adminEmail, userEmail);
    }

    private string Required(string name, string fallback)
    {
        var value = configuration[name] ?? fallback;
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"{name} must be set to seed accounts.");
        return value.Trim();
    }
}
