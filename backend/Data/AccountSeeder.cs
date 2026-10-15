namespace Kinochy.Api.Data;

public sealed class AccountSeeder(Database database, ILogger<AccountSeeder> logger)
{
    public const string AdminEmail = "admin@example.com";
    public const string AdminPassword = "Salam@123";
    public const string UserName = "Kinochy User";
    public const string UserEmail = "user@example.com";
    public const string UserPassword = "Salam@123";

    public async Task SeedAsync()
    {
        if (!database.IsConfigured) return;

        await using var connection = await database.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        const string adminSql = """
            INSERT INTO users (username, email, password_hash, role, language, verified, subscription_plan)
            VALUES ('Administrator', lower(@email), @hash, 'admin', 'tm', true, 'premium')
            ON CONFLICT (email) DO UPDATE SET
                username = EXCLUDED.username,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                verified = EXCLUDED.verified,
                subscription_plan = EXCLUDED.subscription_plan
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
