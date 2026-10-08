using Microsoft.AspNetCore.Http.HttpResults;

namespace Catalog.Api.Products;

internal static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        // Routes keep the gateway prefix so NGINX can proxy without rewriting.
        var group = app.MapGroup("/api/catalog/products").WithTags("Products");

        group.MapGet("/", GetAll).WithName("GetProducts");
        group.MapGet("/{id:guid}", GetById).WithName("GetProductById");

        return app;
    }

    internal const int MaxIdsPerRequest = 100;

    /// <summary>Lists products; <c>?ids=a&amp;ids=b</c> fetches a batch (used by orders-api to price orders).</summary>
    private static async Task<Results<Ok<IReadOnlyList<Product>>, ValidationProblem>> GetAll(
        IProductRepository repository,
        CancellationToken ct,
        Guid[]? ids = null)
    {
        if (ids is not { Length: > 0 })
        {
            return TypedResults.Ok(await repository.GetAllAsync(ct));
        }

        if (ids.Length > MaxIdsPerRequest)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["ids"] = [$"At most {MaxIdsPerRequest} ids per request."],
            });
        }

        return TypedResults.Ok(await repository.GetByIdsAsync([.. ids.Distinct()], ct));
    }

    private static async Task<Results<Ok<Product>, NotFound>> GetById(Guid id, IProductRepository repository, CancellationToken ct) =>
        await repository.GetByIdAsync(id, ct) is { } product
            ? TypedResults.Ok(product)
            : TypedResults.NotFound();
}
