using Marten;
using Weasel.Core;
using Wolverine;
using Wolverine.Marten;

namespace api;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddMarten(options =>
        {
            options.Connection(builder.Configuration.GetConnectionString("Marten")!);

            options.UseSystemTextJsonForSerialization();

            if (builder.Environment.IsDevelopment())
            {
                options.AutoCreateSchemaObjects = AutoCreate.All;
            }
        }).IntegrateWithWolverine();

        builder.Host.UseWolverine();

        builder.Services.AddControllers();

        builder.Services.AddOpenApi();

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.UseHttpsRedirection();

        app.UseAuthorization();

        app.MapControllers();

        app.Run();
    }
}