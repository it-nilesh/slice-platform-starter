using System.Net;
using System.Net.Http.Json;
using Catalog.Api.Products;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Catalog.Api.Tests;

public sealed class ProductEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task GetProducts_ReturnsSeededProducts()
    {
        var products = await _client.GetFromJsonAsync<List<Product>>("/api/catalog/products", TestContext.Current.CancellationToken);

        Assert.NotNull(products);
        Assert.NotEmpty(products);
    }

    [Fact]
    public async Task GetProductById_UnknownId_Returns404()
    {
        var response = await _client.GetAsync($"/api/catalog/products/{Guid.NewGuid()}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetProducts_ByIds_ReturnsOnlyKnownProducts()
    {
        var ct = TestContext.Current.CancellationToken;
        var all = await _client.GetFromJsonAsync<List<Product>>("/api/catalog/products", ct);
        var known = all![0].Id;

        var batch = await _client.GetFromJsonAsync<List<Product>>($"/api/catalog/products?ids={known}&ids={Guid.NewGuid()}", ct);

        Assert.Equal([known], batch!.Select(p => p.Id));
    }

    [Fact]
    public async Task GetProducts_TooManyIds_Returns400()
    {
        var query = string.Join('&', Enumerable.Range(0, 101).Select(_ => $"ids={Guid.NewGuid()}"));

        var response = await _client.GetAsync($"/api/catalog/products?{query}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task HealthEndpoints_ReturnHealthy(string path)
    {
        var response = await _client.GetAsync(path, TestContext.Current.CancellationToken);

        response.EnsureSuccessStatusCode();
    }
}
