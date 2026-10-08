using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Profile.Api.Profiles;

namespace Profile.Api.Tests;

public sealed class ProfileEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task UpdateProfile_ValidRequest_PersistsChanges()
    {
        var ct = TestContext.Current.CancellationToken;

        var response = await _client.PutAsJsonAsync("/api/profile/me", new UpdateProfileRequest("Jane Doe", "jane@example.com"), ct);
        response.EnsureSuccessStatusCode();

        var profile = await _client.GetFromJsonAsync<UserProfile>("/api/profile/me", ct);
        Assert.Equal("Jane Doe", profile?.DisplayName);
    }

    [Theory]
    [InlineData("J", "jane@example.com")]
    [InlineData("Jane", "not-an-email")]
    public async Task UpdateProfile_InvalidRequest_Returns400(string displayName, string email)
    {
        var response = await _client.PutAsJsonAsync("/api/profile/me", new UpdateProfileRequest(displayName, email), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
