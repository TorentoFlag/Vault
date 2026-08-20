type ManifestEnv = Record<string, string | undefined>;

type FetchManifestOptions = {
  env?: ManifestEnv;
  fetch?: typeof fetch;
};

const manifestPath = "/.well-known/vv-admin/manifest.json";

export function buildVvAdminManifestUrl(env: ManifestEnv = process.env): URL {
  const baseUrl = env.VAULT_API_BASE_URL
    ?? env.NEXT_PUBLIC_API_BASE_URL
    ?? "http://localhost:3000";
  const base = new URL(baseUrl);
  return new URL(manifestPath, base.origin);
}

export async function fetchVvAdminManifest(options: FetchManifestOptions = {}): Promise<Response> {
  const apiFetch = options.fetch ?? fetch;
  return apiFetch(buildVvAdminManifestUrl(options.env), {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
}
