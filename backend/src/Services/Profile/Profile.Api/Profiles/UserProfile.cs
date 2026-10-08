using System.ComponentModel.DataAnnotations;

namespace Profile.Api.Profiles;

public sealed record UserProfile(string DisplayName, string Email, DateTimeOffset UpdatedAt);

public sealed record UpdateProfileRequest(
    [property: Required, StringLength(80, MinimumLength = 2)] string DisplayName,
    [property: Required, EmailAddress, StringLength(254)] string Email);
