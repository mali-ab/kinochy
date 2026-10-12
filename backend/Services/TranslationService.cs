using Kinochy.Api.Infrastructure;

namespace Kinochy.Api.Services;

public sealed class TranslationService(HttpClient http, IConfiguration configuration)
{
    public async Task<object> TranslateAsync(string text,string from,string to)
    {
        if(string.IsNullOrWhiteSpace(text))throw new ApiException("Text is required");
        var url=configuration["LIBRETRANSLATE_URL"]??"https://translate.mstdn.social/translate";
        using var response=await http.PostAsJsonAsync(url,new{q=text,source=from,target=to,format="text",api_key=configuration["LIBRETRANSLATE_API_KEY"]??""});
        if(!response.IsSuccessStatusCode)throw new ApiException("Translation service unavailable",502);
        var result=await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        return new{text,translation=result.GetProperty("translatedText").GetString(),from,to};
    }
}
