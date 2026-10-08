namespace Catalog.Api.Products;

/// <summary>
/// Seeded in-memory store. Images are served by mfe-catalog (same origin, so the CSP stays 'self'). Swap for an EF Core / Dapper implementation backed by
/// the service's own database (database-per-service) when moving beyond the PoC.
/// </summary>
internal sealed class InMemoryProductRepository : IProductRepository
{
    private static readonly IReadOnlyList<Product> Products =
    [
        new(Guid.Parse("0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0001"), "Mechanical Keyboard", "75% layout, hot-swappable switches.", 129.00m, "/mfe/catalog/images/keyboard.svg"),
        new(Guid.Parse("0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0002"), "Wireless Mouse", "Ergonomic, 70 hour battery life.", 59.50m, "/mfe/catalog/images/mouse.svg"),
        new(Guid.Parse("0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0003"), "4K Monitor", "27 inch IPS panel, USB-C 90W.", 449.99m, "/mfe/catalog/images/monitor.svg"),
        new(Guid.Parse("0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0004"), "USB-C Dock", "Dual display, 2.5GbE, SD card reader.", 189.00m, "/mfe/catalog/images/dock.svg"),
    ];

    public Task<IReadOnlyList<Product>> GetAllAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Products);

    public Task<Product?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        Task.FromResult(Products.FirstOrDefault(p => p.Id == id));

    public Task<IReadOnlyList<Product>> GetByIdsAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Product>>([.. Products.Where(p => ids.Contains(p.Id))]);
}
