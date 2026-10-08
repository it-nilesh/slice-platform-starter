namespace Profile.Api.Profiles;

/// <summary>
/// Single demo profile. Once authentication is added, key profiles by the
/// authenticated user's subject claim and back this with the service's own database.
/// </summary>
internal sealed class InMemoryProfileStore(TimeProvider clock) : IProfileStore
{
    private readonly Lock _gate = new();
    private UserProfile _current = new("Demo User", "demo@example.com", clock.GetUtcNow());

    public Task<UserProfile> GetCurrentAsync(CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            return Task.FromResult(_current);
        }
    }

    public Task<UserProfile> UpdateCurrentAsync(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            _current = new UserProfile(request.DisplayName.Trim(), request.Email.Trim(), clock.GetUtcNow());
            return Task.FromResult(_current);
        }
    }
}
