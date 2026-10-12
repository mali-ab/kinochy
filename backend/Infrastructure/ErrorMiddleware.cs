namespace Kinochy.Api.Infrastructure;

public sealed class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (ApiException error)
        {
            context.Response.StatusCode = error.StatusCode;
            await context.Response.WriteAsJsonAsync(new { message = error.Message, code = error.Code });
        }
        catch (Exception error)
        {
            logger.LogError(error, "Unhandled request failure");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { message = "Internal server error" });
        }
    }
}

public sealed class ApiException(string message, int statusCode = 400, string? code = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string? Code { get; } = code;
}
