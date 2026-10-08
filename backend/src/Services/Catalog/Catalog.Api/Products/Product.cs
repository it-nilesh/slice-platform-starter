namespace Catalog.Api.Products;

public sealed record Product(Guid Id, string Name, string Description, decimal Price, string ImageUrl);
