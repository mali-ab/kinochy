using Npgsql;

namespace Kinochy.Api.Data;

public static class DbExtensions
{
    public static NpgsqlCommand Command(this NpgsqlConnection connection, string sql, params (string Name, object? Value)[] values)
    {
        var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in values) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }
}
