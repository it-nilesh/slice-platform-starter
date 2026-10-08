using Microsoft.AspNetCore.Http.HttpResults;
using Orders.Api.Catalog;

namespace Orders.Api.Orders;

internal static class OrderEndpoints
{
    internal const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        // Routes keep the gateway prefix so NGINX can proxy without rewriting.
        var group = app.MapGroup("/api/orders").WithTags("Orders");

        group.MapGet("/", GetPage).WithName("GetOrders");
        group.MapGet("/{id:guid}", GetById).WithName("GetOrderById");
        group.MapPost("/", Create).WithName("CreateOrder");

        return app;
    }

    private static async Task<Results<Ok<PagedResult<Order>>, ValidationProblem>> GetPage(
        IOrderRepository repository,
        CancellationToken ct,
        int page = 1,
        int pageSize = 20)
    {
        if (page < 1 || pageSize is < 1 or > MaxPageSize)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["page"] = ["page must be >= 1."],
                ["pageSize"] = [$"pageSize must be between 1 and {MaxPageSize}."],
            });
        }
        return TypedResults.Ok(await repository.GetPageAsync(page, pageSize, ct));
    }

    private static async Task<Results<Ok<Order>, NotFound>> GetById(Guid id, IOrderRepository repository, CancellationToken ct) =>
        await repository.GetByIdAsync(id, ct) is { } order
            ? TypedResults.Ok(order)
            : TypedResults.NotFound();

    private static async Task<Results<Created<Order>, ValidationProblem, ProblemHttpResult>> Create(
        CreateOrderRequest request,
        IOrderRepository repository,
        ICatalogClient catalog,
        TimeProvider clock,
        CancellationToken ct)
    {
        var duplicates = request.Lines.GroupBy(l => l.ProductId).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        if (duplicates.Count > 0)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Lines"] = [$"Each product may appear only once (duplicates: {string.Join(", ", duplicates)})."],
            });
        }

        IReadOnlyDictionary<Guid, CatalogProduct> products;
        try
        {
            products = await catalog.GetProductsAsync([.. request.Lines.Select(l => l.ProductId)], ct);
        }
        catch (CatalogUnavailableException ex)
        {
            return TypedResults.Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var unknown = request.Lines
            .Select((line, index) => (line, index))
            .Where(x => !products.ContainsKey(x.line.ProductId))
            .ToDictionary(x => $"Lines[{x.index}].ProductId", x => new[] { $"Product {x.line.ProductId} does not exist." });
        if (unknown.Count > 0)
        {
            return TypedResults.ValidationProblem(unknown);
        }

        // Name and price come from the catalog, never from the client.
        var lines = request.Lines
            .Select(l => new OrderLine(l.ProductId, products[l.ProductId].Name, products[l.ProductId].Price, l.Quantity))
            .ToList();

        var order = new Order(Guid.CreateVersion7(), request.CustomerEmail.Trim(), lines, clock.GetUtcNow());
        await repository.AddAsync(order, ct);

        // Relative Location: correct behind any proxy, and never derived from the client's Host header.
        return TypedResults.Created($"/api/orders/{order.Id}", order);
    }
}
