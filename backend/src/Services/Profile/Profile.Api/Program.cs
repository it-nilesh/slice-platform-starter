using MicroFrontendPoC.ServiceDefaults;
using Profile.Api.Profiles;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults("profile-api");
builder.Services.AddOpenApi();
builder.Services.AddValidation();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IProfileStore, InMemoryProfileStore>();

var app = builder.Build();

app.UseServiceDefaults();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi("/api/profile/openapi/{documentName}.json");
}

app.MapProfileEndpoints();

await app.RunAsync();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
