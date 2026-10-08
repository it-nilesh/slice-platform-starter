using MicroFrontendPoC.ServiceDefaults;
using Orders.Api.Catalog;
using Orders.Api.Orders;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults("orders-api");
builder.Services.AddOpenApi();
builder.Services.AddValidation();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();

builder.Services.AddHttpClient<ICatalogClient, HttpCatalogClient>(http =>
{
    http.BaseAddress = new Uri(builder.Configuration["Services:CatalogApi"] ?? "http://catalog-api:8080");
    http.Timeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();

app.UseServiceDefaults();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi("/api/orders/openapi/{documentName}.json");
}

app.MapOrderEndpoints();

await app.RunAsync();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
