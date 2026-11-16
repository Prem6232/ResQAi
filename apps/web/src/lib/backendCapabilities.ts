import { apiConfig } from "@/config/api.config";

let cachedPathsPromise: Promise<Set<string>> | null = null;

async function loadOpenApiPaths(): Promise<Set<string>> {
  try {
    const res = await fetch(`${apiConfig.baseUrl}/openapi.json`);
    if (!res.ok) return new Set();
    const spec = (await res.json()) as { paths?: Record<string, unknown> };
    return new Set(Object.keys(spec.paths ?? {}));
  } catch {
    return new Set();
  }
}

export async function getBackendRoutePaths(): Promise<Set<string>> {
  if (!cachedPathsPromise) {
    cachedPathsPromise = loadOpenApiPaths();
  }
  return cachedPathsPromise;
}

export async function hasBackendRoute(subPath: string): Promise<boolean> {
  const normalized = subPath.startsWith("/") ? subPath : `/${subPath}`;
  const paths = await getBackendRoutePaths();
  return paths.has(`/api/v1${normalized}`) || paths.has(normalized);
}

export function resetBackendCapabilitiesCache(): void {
  cachedPathsPromise = null;
}
