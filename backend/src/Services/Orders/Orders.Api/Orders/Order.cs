using System.ComponentModel.DataAnnotations;

namespace Orders.Api.Orders;

/// <summary>An order with prices snapshotted from the catalog at the time it was placed.</summary>
public sealed record Order(Guid Id, string CustomerEmail, IReadOnlyList<OrderLine> Lines, DateTimeOffset CreatedAt)
{
    public decimal Total => Lines.Sum(l => l.UnitPrice * l.Quantity);
}

public sealed record OrderLine(Guid ProductId, string ProductName, decimal UnitPrice, int Quantity);

/// <summary>
/// What the client may send: product ids and quantities only. Names and prices are
/// never trusted from the client; orders-api looks them up in catalog-api.
/// </summary>
public sealed record CreateOrderRequest(
    [property: Required, EmailAddress, StringLength(254)] string CustomerEmail,
    [property: Required, MinLength(1), MaxLength(CreateOrderRequest.MaxLines)] IReadOnlyList<CreateOrderLine> Lines)
{
    public const int MaxLines = 50;
}

public sealed record CreateOrderLine(
    [property: Required] Guid ProductId,
    [property: Range(1, 100)] int Quantity);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);
