using Kinochy.Api.Models;
using Kinochy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Kinochy.Api.Controllers;

[ApiController]
public sealed class AuthController(AuthService auth,TokenService tokens,IConfiguration configuration):ControllerBase
{
    private bool Secure=>configuration["COOKIE_SECURE"]?.Equals("true",StringComparison.OrdinalIgnoreCase)??false;
    private CookieOptions Cookie(TimeSpan age)=>new(){HttpOnly=true,SameSite=SameSiteMode.Lax,Secure=Secure,MaxAge=age};
    [HttpPost("api/auth/login")] public async Task<object> AdminLogin(LoginRequest request){var user=await auth.LoginAsync(request.Email,request.Password,true);Response.Cookies.Append("kinochy_admin",auth.AdminToken(user),Cookie(TimeSpan.FromHours(8)));return new{admin=new{id=user.Id,email=user.Email}};}
    [HttpPost("api/auth/logout")] public object AdminLogout(){Response.Cookies.Delete("kinochy_admin");Response.Cookies.Delete("filmglish_admin");return new{ok=true};}
    [HttpGet("api/auth/me")] public object AdminMe(){var p=tokens.Read(Request.Cookies["kinochy_admin"]??Request.Cookies["filmglish_admin"]);return new{admin=p is null?null:new{id=p.FindFirst("id")?.Value,email=p.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value}};}
    [HttpPost("api/users/signup")] public async Task<IActionResult> Signup(SignupRequest request){var(user,code)=await auth.SignupAsync(request);return StatusCode(201,new{pending=new{user.Email,user.Username,verificationCode=code}});}
    [HttpPost("api/users/verify-email")] public async Task<object> Verify(CodeRequest request){var user=await auth.VerifyAsync(request);SetUser(user);return new{user};}
    [HttpPost("api/users/resend-verification")] public async Task<object> Resend(EmailRequest request)=>new{pending=new{request.Email,verificationCode=await auth.IssueCodeAsync(request.Email)}};
    [HttpPost("api/users/forgot-password")] public async Task<object> Forgot(EmailRequest request)=>new{pending=new{request.Email,verificationCode=await auth.IssueCodeAsync(request.Email)}};
    [HttpPost("api/users/verify-password-reset")] public async Task<object> VerifyReset(CodeRequest request){await auth.VerifyCodeAsync(request);return new{ok=true};}
    [HttpPost("api/users/reset-password")] public async Task<object> Reset(ResetPasswordRequest request){await auth.ResetPasswordAsync(request);return new{ok=true};}
    [HttpPost("api/users/login")] public async Task<object> Login(LoginRequest request){var user=await auth.LoginAsync(request.Email,request.Password);SetUser(user);return new{user};}
    [HttpPost("api/users/logout")] public object Logout(){Response.Cookies.Delete("kinochy_user");Response.Cookies.Delete("filmglish_user");return new{ok=true};}
    [HttpGet("api/users/me")] public async Task<object> Me(){var p=tokens.Read(Request.Cookies["kinochy_user"]??Request.Cookies["filmglish_user"]);if(!Guid.TryParse(p?.FindFirst("id")?.Value,out var id))return new{user=(object?)null};try{var user=await auth.GetAsync(id);SetUser(user);return new{user};}catch{return new{user=(object?)null};}}
    private void SetUser(SessionUser user)=>Response.Cookies.Append("kinochy_user",auth.Token(user),Cookie(TimeSpan.FromDays(30)));
}
