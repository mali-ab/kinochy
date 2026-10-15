using Kinochy.Api.Data;
using Kinochy.Api.Infrastructure;
using Kinochy.Api.Models;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class AdminController(Database database,MovieService movies,MovieCommunityService community,TokenService tokens):ControllerBase
{
    private void RequireAdmin()
    {
        var principal=tokens.Read(Request.Cookies["kinochy_admin"]??Request.Cookies["filmglish_admin"]);
        if(principal?.IsInRole("admin")!=true)throw new ApiException("Admin login required",401);
    }

    [HttpGet("api/admin/users")]
    public async Task<List<UserView>> Users(){RequireAdmin();await using var c=await database.OpenAsync();await using var q=c.Command("SELECT id,username,email,role,language,verified,created_at,subscription_plan,subscription_expires_at FROM users WHERE verified=true ORDER BY created_at DESC");await using var r=await q.ExecuteReaderAsync();var result=new List<UserView>();while(await r.ReadAsync())result.Add(ReadUser(r));return result;}

    [HttpGet("api/admin/users/{id:guid}")]
    public async Task<IActionResult> UserDetails(Guid id){RequireAdmin();await using var c=await database.OpenAsync();await using var q=c.Command("SELECT id,username,email,role,language,verified,created_at,subscription_plan,subscription_expires_at FROM users WHERE id=@id",("id",id));await using var r=await q.ExecuteReaderAsync();return await r.ReadAsync()?Ok(ReadUser(r)):NotFound(new{message="User not found"});}

    [HttpPost("api/admin/users")]
    public async Task<IActionResult> CreateUser(AdminUserRequest value){RequireAdmin();if(string.IsNullOrWhiteSpace(value.Password))throw new ApiException("Password is required");var plan=Plan(value.SubscriptionPlan);await using var c=await database.OpenAsync();const string sql="INSERT INTO users(username,email,password_hash,role,language,verified,subscription_plan,subscription_expires_at) VALUES(@name,lower(@email),@hash,@role,@language,true,@plan,@expires) RETURNING id,username,email,role,language,verified,created_at,subscription_plan,subscription_expires_at";await using var q=c.Command(sql,("name",value.Username),("email",value.Email),("hash",BCrypt.Net.BCrypt.HashPassword(value.Password)),("role",value.Role??"user"),("language",value.Language??"tm"),("plan",plan),("expires",value.SubscriptionExpiresAt));await using var r=await q.ExecuteReaderAsync();await r.ReadAsync();return StatusCode(201,ReadUser(r));}

    [HttpPatch("api/admin/users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id,AdminUserRequest value){RequireAdmin();var plan=Plan(value.SubscriptionPlan);await using var c=await database.OpenAsync();var hash=string.IsNullOrWhiteSpace(value.Password)?null:BCrypt.Net.BCrypt.HashPassword(value.Password);const string sql="UPDATE users SET username=@name,email=lower(@email),role=@role,language=coalesce(@language,language),password_hash=coalesce(@hash,password_hash),subscription_plan=@plan,subscription_expires_at=@expires WHERE id=@id RETURNING id,username,email,role,language,verified,created_at,subscription_plan,subscription_expires_at";await using var q=c.Command(sql,("id",id),("name",value.Username),("email",value.Email),("role",value.Role??"user"),("language",value.Language),("hash",hash),("plan",plan),("expires",value.SubscriptionExpiresAt));await using var r=await q.ExecuteReaderAsync();return await r.ReadAsync()?Ok(ReadUser(r)):NotFound(new{message="User not found"});}

    private static string Plan(string? value)=>value?.Equals("premium",StringComparison.OrdinalIgnoreCase)==true?"premium":"free";
    private static UserView ReadUser(Npgsql.NpgsqlDataReader r)=>new(r.GetGuid(0),r.GetString(1),r.GetString(2),r.GetString(3),r.GetString(4),r.GetBoolean(5),r.GetDateTime(6),r.GetString(7),r.IsDBNull(8)?null:r.GetDateTime(8));

    [HttpDelete("api/admin/users")]
    public async Task<object> DeleteUsers(DeleteUsersRequest value){RequireAdmin();await using var c=await database.OpenAsync();await using var q=c.Command("DELETE FROM users WHERE id=ANY(@ids)",( "ids",value.Ids));var count=await q.ExecuteNonQueryAsync();return new{ok=true,deleted=count};}

    [HttpDelete("api/admin/users/{id:guid}")]
    public Task<object> DeleteUser(Guid id)=>DeleteUsers(new([id]));

    [HttpGet("api/admin/movies/{id:guid}")]
    public async Task<IActionResult> Movie(Guid id){RequireAdmin();var movie=await movies.FindAsync(id.ToString(),true);return movie is null?NotFound(new{message="Movie not found"}):Ok(movie);}

    [HttpDelete("api/admin/movies/{id:guid}")]
    public async Task<object> DeleteMovie(Guid id){RequireAdmin();await movies.DeleteAsync(id);return new{ok=true};}

    [HttpPost("api/admin/series/{id:guid}/episodes")]
    public async Task<IActionResult> AddSeriesEpisode(Guid id,SeriesEpisodeRequest value)
    {
        RequireAdmin();
        await community.AddEpisodeAsync(id,value);
        return StatusCode(201,await community.SeasonsAsync(id));
    }

    [HttpDelete("api/admin/series/{id:guid}/episodes/{episodeId:guid}")]
    public async Task<IActionResult> RemoveSeriesEpisode(Guid id,Guid episodeId)
    {
        RequireAdmin();
        await community.RemoveEpisodeAsync(id,episodeId);
        return NoContent();
    }

    [HttpPost("api/admin/movies")][RequestSizeLimit(long.MaxValue)]
    public async Task<IActionResult> CreateMovie(){RequireAdmin();return StatusCode(201,await movies.SaveAsync(null,await ReadMovieFormAsync()));}

    [HttpPatch("api/admin/movies/{id:guid}")][RequestSizeLimit(long.MaxValue)]
    public async Task<object> UpdateMovie(Guid id){RequireAdmin();return await movies.SaveAsync(id,await ReadMovieFormAsync());}

    private async Task<IFormCollection> ReadMovieFormAsync()
    {
        try { return await Request.ReadFormAsync(); }
        catch (InvalidDataException error) when (error.Message.Contains("length limit", StringComparison.OrdinalIgnoreCase))
        {
            throw new ApiException("Movie upload exceeds the 8 GiB limit. Check any reverse proxy upload limit.",413);
        }
        catch (InvalidDataException)
        {
            throw new ApiException("Invalid movie upload form. Please choose the files again and retry.",400);
        }
    }
}
