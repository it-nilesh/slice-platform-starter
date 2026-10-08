/**
 * Single choke point for client-side errors. Swap the body for your RUM/APM SDK
 * (OpenTelemetry Web, Sentry, Application Insights...) without touching call sites.
 */
export function reportError(event: string, details: Record<string, unknown> = {}): void {
  console.error(`[shell] ${event}`, details);
}
