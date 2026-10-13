namespace Kinochy.Api.Data;

public sealed class AccountSeeder(Database database, ILogger<AccountSeeder> logger)
{
    public const string AdminEmail = "admin@kinochy.local";
    public const string AdminPassword = "KinochyAdmin@4321!";
    public const string UserName = "Kinochy User";
    public const string UserEmail = "user@kinochy.local";
    public const string UserPassword = "Kinochy@4321!";

    public async Task SeedAsync()
    {
        if (!database.IsConfigured) return;

        await using var connection = await database.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        const string adminSql = """
            INSERT INTO admins (email, password_hash)
            VALUES (lower(@email), @hash)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """;
        await using (var command = connection.Command(adminSql,
            ("email", AdminEmail),
            ("hash", BCrypt.Net.BCrypt.HashPassword(AdminPassword))))
        {
            command.Transaction = transaction;
            await command.ExecuteNonQueryAsync();
        }

        const string userSql = """
            INSERT INTO users (username, email, password_hash, role, language, verified)
            VALUES (@name, lower(@email), @hash, 'user', 'tm', true)
            ON CONFLICT (email) DO UPDATE SET
                username = EXCLUDED.username,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                verified = EXCLUDED.verified
            """;
        await using (var command = connection.Command(userSql,
            ("name", UserName),
            ("email", UserEmail),
            ("hash", BCrypt.Net.BCrypt.HashPassword(UserPassword))))
        {
            command.Transaction = transaction;
            await command.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
        logger.LogInformation("Seed accounts ready: admin {AdminEmail}, user {UserEmail}", AdminEmail, UserEmail);
    }
}
