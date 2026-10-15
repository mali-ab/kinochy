using System.Globalization;

namespace Kinochy.Api.Data;

public sealed class CountrySeeder(Database database, ILogger<CountrySeeder> logger)
{
    public async Task SeedAsync()
    {
        if(!database.IsConfigured)return;

        var countries=CultureInfo.GetCultures(CultureTypes.SpecificCultures)
            .Select(culture=>new RegionInfo(culture.Name))
            .Where(region=>region.TwoLetterISORegionName.Length==2)
            .GroupBy(region=>region.TwoLetterISORegionName,StringComparer.OrdinalIgnoreCase)
            .Select(group=>group.OrderBy(region=>region.EnglishName,StringComparer.Ordinal).First())
            .Select(region=>new{Code=region.TwoLetterISORegionName.ToUpperInvariant(),Name=FriendlyName(region)})
            .OrderBy(country=>country.Name,StringComparer.Ordinal)
            .ToArray();

        await using var connection=await database.OpenAsync();
        await using var transaction=await connection.BeginTransactionAsync();
        await using(var cleanup=connection.Command("DELETE FROM countries WHERE char_length(code)<>2"))
        {
            cleanup.Transaction=transaction;
            await cleanup.ExecuteNonQueryAsync();
        }
        const string sql="""
            INSERT INTO countries(code,name)
            SELECT code,name FROM unnest(@codes::text[],@names::text[]) AS country(code,name)
            ON CONFLICT(code) DO UPDATE SET name=excluded.name
            """;
        await using var command=connection.Command(sql,
            ("codes",countries.Select(country=>country.Code).ToArray()),
            ("names",countries.Select(country=>country.Name).ToArray()));
        command.Transaction=transaction;
        await command.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
        logger.LogInformation("Country catalog ready: {Count} countries",countries.Length);
    }

    private static string FriendlyName(RegionInfo region)=>region.TwoLetterISORegionName switch
    {
        "BO"=>"Bolivia", "BN"=>"Brunei", "CD"=>"Democratic Republic of the Congo",
        "CI"=>"Ivory Coast", "IR"=>"Iran", "KR"=>"South Korea", "KP"=>"North Korea",
        "LA"=>"Laos", "MD"=>"Moldova", "PS"=>"Palestine", "RU"=>"Russia",
        "SY"=>"Syria", "TZ"=>"Tanzania", "TR"=>"Turkey", "US"=>"United States",
        "VA"=>"Holy See", "VE"=>"Venezuela", "VN"=>"Vietnam",
        _=>region.EnglishName
    };
}
