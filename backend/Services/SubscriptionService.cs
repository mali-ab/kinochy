using Kinochy.Api.Data;
using Kinochy.Api.Models;

namespace Kinochy.Api.Services;

public sealed class SubscriptionService(Database database, TokenService tokens)
{
    public async Task<bool> HasFullAccessAsync(HttpRequest request)
    {
        var principal = tokens.Read(request.Cookies["kinochy_user"]);
        if (!Guid.TryParse(principal?.FindFirst("id")?.Value, out var userId)) return false;
        await using var connection = await database.OpenAsync();
        await using var command = connection.Command("SELECT subscription_plan,subscription_expires_at FROM users WHERE id=@id AND verified=true", ("id", userId));
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() && SubscriptionAccess.HasFullAccess(reader.GetString(0), reader.IsDBNull(1)?null:reader.GetDateTime(1));
    }
}
