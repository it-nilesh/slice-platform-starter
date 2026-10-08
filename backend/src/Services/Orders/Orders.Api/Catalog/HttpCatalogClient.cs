using System.Net.Http.Json;

namespace Orders.Api.Catalog;

/// <summary>
/// Service-to-service call over the private network (not through the gateway).
/// Typed HttpClient: pooled connections, base address and timeout from configuration.
/// </summary>
internal sealed partial class HttpCatalogClient(HttpClient http, ILogger<HttpCatalogClient> logger) : ICatalogClient
{
    public async Task<IReadOnlyDictionary<Guid, CatalogProduct>> GetProductsAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken)
    {
        var query = string.Join('&', ids.Select(id => $"ids={id}"));
        try
        {
            var products = await http.GetFromJsonAsync<List<CatalogProduct>>($"/api/catalog/products?{query}", cancellationToken)
                ?? [];
            return products.ToDictionary(p => p.Id);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            LogCatalogUnavailable(logger, ex);
            throw new CatalogUnavailableException("The product catalog is unavailable.", ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "catalog-api is unavailable")]
    private static partial void LogCatalogUnavailable(ILogger logger, Exception exception);
}
