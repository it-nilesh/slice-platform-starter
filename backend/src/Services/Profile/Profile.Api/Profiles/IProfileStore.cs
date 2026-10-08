namespace Profile.Api.Profiles;

public interface IProfileStore
{
    Task<UserProfile> GetCurrentAsync(CancellationToken cancellationToken);

    Task<UserProfile> UpdateCurrentAsync(UpdateProfileRequest request, CancellationToken cancellationToken);
}
