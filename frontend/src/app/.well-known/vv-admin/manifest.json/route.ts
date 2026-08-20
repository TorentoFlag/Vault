import { fetchVvAdminManifest } from "@/lib/vv-admin-manifest.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const upstream = await fetchVvAdminManifest();
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") ?? "application/json; charset=utf-8");
  headers.set("cache-control", upstream.ok ? "public, max-age=60" : "no-store");
  return new Response(await upstream.text(), {
    headers,
    status: upstream.status,
  });
}
