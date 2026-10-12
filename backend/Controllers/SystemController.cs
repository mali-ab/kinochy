using Kinochy.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class SystemController(Database database) : ControllerBase
{
    [HttpGet("api/health")]
    public object Health()=>new{ok=true,database=database.IsConfigured?"postgres":"unavailable"};
}
