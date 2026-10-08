using Microsoft.AspNetCore.Http.HttpResults;

namespace Profile.Api.Profiles;

internal static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        // Routes keep the gateway prefix so NGINX can proxy without rewriting.
        var group = app.MapGroup("/api/profile").WithTags("Profile");

        group.MapGet("/me", GetCurrent).WithName("GetCurrentProfile");
        group.MapPut("/me", UpdateCurrent).WithName("UpdateCurrentProfile");

        return app;
    }

    private static async Task<Ok<UserProfile>> GetCurrent(IProfileStore store, CancellationToken ct) =>
        TypedResults.Ok(await store.GetCurrentAsync(ct));

    private static async Task<Ok<UserProfile>> UpdateCurrent(UpdateProfileRequest request, IProfileStore store, CancellationToken ct) =>
        TypedResults.Ok(await store.UpdateCurrentAsync(request, ct));
}
