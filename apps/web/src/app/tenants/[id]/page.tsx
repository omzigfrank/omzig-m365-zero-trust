/**
 * Tenant detail page (server component shell).
 *
 * Re-exports the client component as default and provides
 * `generateStaticParams` for Next.js static export builds. Tenant IDs
 * are not known at build time (they live in customer databases), so
 * the static export emits an empty params list and the page is rendered
 * client-side at runtime. Tests import the default export and render
 * the client component directly.
 */
import TenantDetailClient from "./TenantDetailClient";

export const dynamicParams = true;

export function generateStaticParams(): { id: string }[] {
  // Tenant IDs are runtime-only; no params known at build time.
  return [];
}

export default function TenantDetailPage() {
  return <TenantDetailClient />;
}
