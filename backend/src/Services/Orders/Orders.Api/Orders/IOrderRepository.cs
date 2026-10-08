namespace Orders.Api.Orders;

public interface IOrderRepository
{
    /// <summary>Newest first.</summary>
    Task<PagedResult<Order>> GetPageAsync(int page, int pageSize, CancellationToken cancellationToken);

    Task<Order?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    Task AddAsync(Order order, CancellationToken cancellationToken);
}
