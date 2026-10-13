using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class AuthService(Database database, TokenService tokens)
{
    public async Task<SessionUser> LoginAsync(string email, string password, bool adminOnly = false)
    {
        await using var connection = await database.OpenAsync();
        var sql = adminOnly
            ? "SELECT id, '' username, email, 'admin' role, 'tm' language, password_hash, 'premium' subscription_plan, NULL::timestamptz subscription_expires_at FROM admins WHERE lower(email)=lower(@email)"
            : "SELECT id, username, email, role, language, password_hash, subscription_plan, subscription_expires_at FROM users WHERE lower(email)=lower(@email) AND verified=true";
        await using var command = connection.Command(sql, ("email", email.Trim()));
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync() || !BCrypt.Net.BCrypt.Verify(password, reader.GetString(5)))
            throw new ApiException("Invalid credentials", 401);
        return new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(6), reader.IsDBNull(7)?null:reader.GetDateTime(7));
    }

    public async Task<SessionUser> GetAsync(Guid id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT id,username,email,role,language,subscription_plan,subscription_expires_at FROM users WHERE id=@id AND verified=true", ("id", id));
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) throw new ApiException("Login required", 401);
        return ReadUser(reader);
    }

    public async Task<(SessionUser User, string Code)> SignupAsync(SignupRequest request)
    {
        if (request.Password.Length < 8) throw new ApiException("Password must be at least 8 characters");
        var code = Random.Shared.Next(100000, 999999).ToString();
        await using var connection = await database.OpenAsync();
        const string sql = """
            INSERT INTO users(username,email,password_hash,role,language,verified,verification_code,verification_expires_at)
            VALUES(@username,lower(@email),@hash,'user',@language,false,@code,now()+interval '15 minutes')
            ON CONFLICT(email) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,
              verification_code=excluded.verification_code,verification_expires_at=excluded.verification_expires_at
            RETURNING id,username,email,role,language,subscription_plan,subscription_expires_at
            """;
        await using var command = connection.Command(sql, ("username", request.Username.Trim()), ("email", request.Email.Trim()),
            ("hash", BCrypt.Net.BCrypt.HashPassword(request.Password)), ("language", request.Language ?? "tm"), ("code", code));
        await using var reader = await command.ExecuteReaderAsync(); await reader.ReadAsync();
        return (ReadUser(reader), code);
    }

    public async Task<SessionUser> VerifyAsync(CodeRequest request)
    {
        await using var connection = await database.OpenAsync();
        const string sql = """
            UPDATE users SET verified=true,verification_code=null,verification_expires_at=null
            WHERE lower(email)=lower(@email) AND verification_code=@code AND verification_expires_at>now()
            RETURNING id,username,email,role,language,subscription_plan,subscription_expires_at
            """;
        await using var command = connection.Command(sql, ("email", request.Email), ("code", request.Code));
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) throw new ApiException("Invalid or expired verification code");
        return ReadUser(reader);
    }

    public async Task<string> IssueCodeAsync(string email)
    {
        var code=Random.Shared.Next(100000,999999).ToString();await using var connection=await database.OpenAsync();await using var command=connection.Command("UPDATE users SET verification_code=@code,verification_expires_at=now()+interval '15 minutes' WHERE lower(email)=lower(@email) RETURNING id",("code",code),("email",email));if(await command.ExecuteScalarAsync() is null)throw new ApiException("User not found",404);return code;
    }

    public async Task VerifyCodeAsync(CodeRequest request)
    {
        await using var connection=await database.OpenAsync();await using var command=connection.Command("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=lower(@email) AND verification_code=@code AND verification_expires_at>now())",("email",request.Email),("code",request.Code));if((bool)(await command.ExecuteScalarAsync())!!=true)throw new ApiException("Invalid or expired verification code");
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request)
    {
        await VerifyCodeAsync(new(request.Email,request.Code));if(request.Password.Length<8)throw new ApiException("Password must be at least 8 characters");await using var connection=await database.OpenAsync();await using var command=connection.Command("UPDATE users SET password_hash=@hash,verification_code=null,verification_expires_at=null WHERE lower(email)=lower(@email)",( "hash",BCrypt.Net.BCrypt.HashPassword(request.Password)),("email",request.Email));await command.ExecuteNonQueryAsync();
    }

    public string Token(SessionUser user) => tokens.Create(user.Id, user.Email, user.Role, TimeSpan.FromDays(30));
    public string AdminToken(SessionUser user) => tokens.Create(user.Id, user.Email, "admin", TimeSpan.FromHours(8));
    private static SessionUser ReadUser(Npgsql.NpgsqlDataReader reader) => new(reader.GetGuid(0),reader.GetString(1),reader.GetString(2),reader.GetString(3),reader.GetString(4),reader.GetString(5),reader.IsDBNull(6)?null:reader.GetDateTime(6));
}
