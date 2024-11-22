namespace api.Models.Command;

public sealed record NewProduct(Guid ProductId, string Name);

public sealed record UpdateProductName(Guid ProductId, string Name);

public sealed record Product(Guid ProductId, string Name)
{
    public static Product Create(NewProduct newProduct) => new(newProduct.ProductId, newProduct.Name);

    public static Product Apply(UpdateProductName @event, Product product) => product with
    {
        Name = @event.Name
    };
}