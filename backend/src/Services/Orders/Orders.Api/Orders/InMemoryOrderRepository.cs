using System.Collections.Concurrent;

namespace Orders.Api.Orders;

/// <summary>
/// Thread-safe in-memory store. Replace with the service's own database
/// (database-per-service) when moving beyond the PoC.
/// </summary>
internal sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly ConcurrentDictionary<Guid, Order> _orders = new();

    public Task<PagedResult<Order>> GetPageAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        var snapshot = _orders.Values.ToArray();
        IReadOnlyList<Order> items =
        [
            .. snapshot.OrderByDescending(o => o.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize),
        ];
        return Task.FromResult(new PagedResult<Order>(items, page, pageSize, snapshot.Length));
    }

    public Task<Order?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        Task.FromResult(_orders.GetValueOrDefault(id));

    public Task AddAsync(Order order, CancellationToken cancellationToken)
    {
        _orders[order.Id] = order;
        return Task.CompletedTask;
    }
}
