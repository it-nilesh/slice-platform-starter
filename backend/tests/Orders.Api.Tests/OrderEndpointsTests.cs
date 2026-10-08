using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Orders.Api.Catalog;
using Orders.Api.Orders;

namespace Orders.Api.Tests;

public sealed class OrderEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly CatalogProduct Keyboard = new(Guid.NewGuid(), "Mechanical Keyboard", 129.00m);
    private static readonly CatalogProduct Mouse = new(Guid.NewGuid(), "Wireless Mouse", 59.50m);

    private HttpClient CreateClient(ICatalogClient catalog) =>
        factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton(catalog))).CreateClient();

    private HttpClient CreateClient() => CreateClient(new FakeCatalog(Keyboard, Mouse));

    private static CreateOrderRequest Request(params CreateOrderLine[] lines) => new("jane@example.com", lines);

    [Fact]
    public async Task CreateOrder_PricesAndNamesComeFromCatalog()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/orders", Request(new CreateOrderLine(Keyboard.Id, 2), new CreateOrderLine(Mouse.Id, 1)), ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var order = await response.Content.ReadFromJsonAsync<Order>(ct);
        Assert.NotNull(order);
        Assert.Equal(129.00m * 2 + 59.50m, order.Total);
        Assert.Equal("Mechanical Keyboard", order.Lines[0].ProductName);
    }

    [Fact]
    public async Task CreateOrder_IgnoresClientSuppliedPrice()
    {
        var ct = TestContext.Current.CancellationToken;
        // A tampered payload: extra fields such as unitPrice are not part of the contract.
        var payload = new { customerEmail = "jane@example.com", lines = new[] { new { productId = Keyboard.Id, quantity = 1, unitPrice = 0.01m } } };

        var response = await CreateClient().PostAsJsonAsync("/api/orders", payload, ct);

        var order = await response.Content.ReadFromJsonAsync<Order>(ct);
        Assert.Equal(129.00m, order?.Total);
    }

    [Fact]
    public async Task CreateOrder_ReturnsRelativeLocation_ThatResolves()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/orders") { Content = JsonContent.Create(Request(new CreateOrderLine(Keyboard.Id, 1))) };
        request.Headers.Host = "evil.example";

        var response = await client.SendAsync(request, ct);

        Assert.NotNull(response.Headers.Location);
        Assert.False(response.Headers.Location.IsAbsoluteUri);
        Assert.StartsWith("/api/orders/", response.Headers.Location.OriginalString, StringComparison.Ordinal);
        var fetched = await client.GetFromJsonAsync<Order>(response.Headers.Location, ct);
        Assert.NotNull(fetched);
    }

    [Fact]
    public async Task CreateOrder_UnknownProduct_Returns400()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/orders", Request(new CreateOrderLine(Guid.NewGuid(), 1)), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("does not exist", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
    }

    [Fact]
    public async Task CreateOrder_DuplicateProduct_Returns400()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/orders", Request(new CreateOrderLine(Keyboard.Id, 1), new CreateOrderLine(Keyboard.Id, 2)), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("not-an-email", 1, 1)]
    [InlineData("jane@example.com", 0, 1)]   // no lines
    [InlineData("jane@example.com", 51, 1)]  // too many lines
    [InlineData("jane@example.com", 1, 0)]   // quantity too low
    [InlineData("jane@example.com", 1, 101)] // quantity too high
    public async Task CreateOrder_InvalidRequest_Returns400(string email, int lineCount, int quantity)
    {
        var lines = Enumerable.Range(0, lineCount).Select(_ => new CreateOrderLine(Guid.NewGuid(), quantity)).ToList();

        var response = await CreateClient().PostAsJsonAsync("/api/orders", new CreateOrderRequest(email, lines), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateOrder_CatalogUnavailable_Returns503()
    {
        var response = await CreateClient(new UnavailableCatalog()).PostAsJsonAsync("/api/orders", Request(new CreateOrderLine(Keyboard.Id, 1)), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task GetOrders_IsPaged()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = CreateClient();
        for (var i = 0; i < 3; i++)
        {
            await client.PostAsJsonAsync("/api/orders", Request(new CreateOrderLine(Mouse.Id, 1)), ct);
        }

        var page = await client.GetFromJsonAsync<PagedResult<Order>>("/api/orders?page=1&pageSize=2", ct);

        Assert.NotNull(page);
        Assert.Equal(2, page.Items.Count);
        Assert.True(page.TotalCount >= 3);
    }

    [Theory]
    [InlineData("/api/orders?page=0")]
    [InlineData("/api/orders?pageSize=101")]
    public async Task GetOrders_InvalidPaging_Returns400(string url)
    {
        var response = await CreateClient().GetAsync(url, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private sealed class FakeCatalog(params CatalogProduct[] products) : ICatalogClient
    {
        public Task<IReadOnlyDictionary<Guid, CatalogProduct>> GetProductsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyDictionary<Guid, CatalogProduct>>(products.Where(p => ids.Contains(p.Id)).ToDictionary(p => p.Id));
    }

    private sealed class UnavailableCatalog : ICatalogClient
    {
        public Task<IReadOnlyDictionary<Guid, CatalogProduct>> GetProductsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken) =>
            throw new CatalogUnavailableException("The product catalog is unavailable.");
    }
}
