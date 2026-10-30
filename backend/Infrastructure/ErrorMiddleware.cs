namespace Kinochy.Api.Infrastructure;

public sealed class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> logger, IWebHostEnvironment environment)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (ApiException error)
        {
            context.Response.StatusCode = error.StatusCode;
            await context.Response.WriteAsJsonAsync(new { message = error.Message, code = error.Code });
        }
        catch (Npgsql.PostgresException error) when (error.SqlState is "23503" or "23505")
        {
            context.Response.StatusCode=StatusCodes.Status409Conflict;
            await context.Response.WriteAsJsonAsync(new { message="This title, season, or episode changed. Refresh and try again.",code="CONTENT_CONFLICT" });
        }
        catch (Exception error)
        {
            logger.LogError(error, "Unhandled request failure");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new {
                message = environment.IsDevelopment() ? error.Message : "Internal server error",
                code = "SERVER_ERROR"
            });
        }
    }
}

public sealed class ApiException(string message, int statusCode = 400, string? code = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string? Code { get; } = code;
}
