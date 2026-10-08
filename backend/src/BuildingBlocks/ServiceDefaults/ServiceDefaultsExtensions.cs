using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace MicroFrontendPoC.ServiceDefaults;

/// <summary>
/// Cross-cutting concerns shared by every microservice: logging, telemetry,
/// health checks, problem details and running behind the NGINX gateway.
/// </summary>
public static class ServiceDefaultsExtensions
{
    public const string LivenessPath = "/health/live";
    public const string ReadinessPath = "/health/ready";
    private const string LiveTag = "live";
    private const string RequestIdHeader = "X-Request-ID";
    private const int MaxRequestIdLength = 128;
    private static readonly string[] PrivateNetworks = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"];

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder, string serviceName)
        where TBuilder : IHostApplicationBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.ConfigureLogging();
        builder.ConfigureOpenTelemetry(serviceName);

        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), [LiveTag]);

        // Problem details include the W3C traceId by default, so errors can be found in traces.
        builder.Services.AddProblemDetails();

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            // Client IP and scheme only. X-Forwarded-Host is deliberately NOT trusted:
            // the host is client-controlled, and responses use relative URLs instead.
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // Accept forwarded headers only from proxies on private networks (the gateway).
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var network in PrivateNetworks)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        // One structured log line per request (method, path, status, duration).
        builder.Services.AddHttpLogging(options =>
        {
            options.LoggingFields = HttpLoggingFields.RequestMethod | HttpLoggingFields.RequestPath
                | HttpLoggingFields.ResponseStatusCode | HttpLoggingFields.Duration;
            options.CombineLogs = true;
        });
        builder.Logging.AddFilter("Microsoft.AspNetCore.HttpLogging.HttpLoggingMiddleware", LogLevel.Information);

        return builder;
    }

    public static WebApplication UseServiceDefaults(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseForwardedHeaders();
        app.Use(RequestIdScope(app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("RequestId")));
        app.UseWhen(ctx => !ctx.Request.Path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase), b => b.UseHttpLogging());
        app.UseExceptionHandler();
        app.UseStatusCodePages();

        // Liveness: process is up. Readiness: all registered dependencies are healthy.
        app.MapHealthChecks(LivenessPath, new HealthCheckOptions { Predicate = r => r.Tags.Contains(LiveTag) });
        app.MapHealthChecks(ReadinessPath);

        return app;
    }

    /// <summary>
    /// Puts the gateway's X-Request-ID on every log line (as a scope) and on the trace,
    /// so one id follows a request from NGINX through every service it touches.
    /// </summary>
    private static Func<HttpContext, RequestDelegate, Task> RequestIdScope(ILogger logger) =>
        async (context, next) =>
        {
            var requestId = context.Request.Headers[RequestIdHeader].ToString();
            if (requestId.Length is 0 or > MaxRequestIdLength || !requestId.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            {
                // Missing or untrusted (avoid log injection): fall back to the local id.
                requestId = context.TraceIdentifier;
            }

            Activity.Current?.SetTag("http.request.id", requestId);
            using (logger.BeginScope(new Dictionary<string, object> { ["RequestId"] = requestId }))
            {
                await next(context);
            }
        };

    private static void ConfigureLogging(this IHostApplicationBuilder builder)
    {
        builder.Logging.ClearProviders();
        if (builder.Environment.IsDevelopment())
        {
            builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
        }
        else
        {
            builder.Logging.AddJsonConsole(o => o.IncludeScopes = true);
        }
    }

    private static void ConfigureOpenTelemetry(this IHostApplicationBuilder builder, string serviceName)
    {
        builder.Logging.AddOpenTelemetry(o =>
        {
            o.IncludeFormattedMessage = true;
            o.IncludeScopes = true;
        });

        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(serviceName))
            .WithMetrics(m => m
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation())
            .WithTracing(t => t
                .AddAspNetCoreInstrumentation(o =>
                    o.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase))
                .AddHttpClientInstrumentation());

        // Export only when a collector is configured (e.g. Jaeger, Grafana Alloy, Aspire dashboard).
        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            otel.UseOtlpExporter();
        }
    }
}
