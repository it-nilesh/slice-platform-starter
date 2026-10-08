namespace Orders.Api.Catalog;

public sealed record CatalogProduct(Guid Id, string Name, decimal Price);

/// <summary>Read-only view of catalog-api, the source of truth for product names and prices.</summary>
public interface ICatalogClient
{
    /// <summary>Returns the products that exist; unknown ids are simply absent.</summary>
    /// <exception cref="CatalogUnavailableException">catalog-api could not be reached.</exception>
    Task<IReadOnlyDictionary<Guid, CatalogProduct>> GetProductsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken);
}

public sealed class CatalogUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
