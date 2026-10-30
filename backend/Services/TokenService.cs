using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Kinochy.Api.Infrastructure;
using Microsoft.IdentityModel.Tokens;

namespace Kinochy.Api.Services;

public sealed class TokenService(IConfiguration configuration)
{
    private readonly byte[] _key = System.Security.Cryptography.SHA256.HashData(
        Encoding.UTF8.GetBytes(configuration["JWT_SECRET"] ?? "development-secret-change-me"));

    public string Create(Guid id, string email, string role, TimeSpan lifetime)
    {
        var descriptor = new SecurityTokenDescriptor {
            Subject = new ClaimsIdentity([new("id", id.ToString()), new(ClaimTypes.Email, email), new(ClaimTypes.Role, role)]),
            Expires = DateTime.UtcNow.Add(lifetime), SigningCredentials = new(new SymmetricSecurityKey(_key), SecurityAlgorithms.HmacSha256)
        };
        var handler = new JwtSecurityTokenHandler();
        return handler.WriteToken(handler.CreateToken(descriptor));
    }

    public ClaimsPrincipal? Read(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        try {
            return new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters {
                ValidateIssuer = false, ValidateAudience = false, ValidateLifetime = true, ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(_key), ClockSkew = TimeSpan.FromMinutes(1)
            }, out _);
        } catch { return null; }
    }

    public Guid RequireUser(HttpRequest request, string cookie = "kinochy_user")
    {
        var principal = Read(request.Cookies[cookie]);
        return Guid.TryParse(principal?.FindFirstValue("id"), out var id)
            ? id : throw new ApiException("Login required", 401);
    }

    public Guid? UserIdOrNull(HttpRequest request)
    {
        var principal=Read(request.Cookies["kinochy_user"])??Read(request.Cookies["filmglish_user"]);
        return Guid.TryParse(principal?.FindFirstValue("id"),out var id)?id:null;
    }
}
