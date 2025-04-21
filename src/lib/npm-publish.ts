/**
 * Utility functions for publishing to npm
 */

type PackageInfo = {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
};

/**
 * Generates a package.json content for the client
 */
export function generatePackageJson(
  packageInfo: PackageInfo,
  includeMain: boolean = true
): string {
  const pkg: Record<string, string | string[]> = {
    name: packageInfo.name,
    version: packageInfo.version,
    description: packageInfo.description || `API client for ${packageInfo.name}`,
    author: packageInfo.author || "",
    license: packageInfo.license || "MIT",
    keywords: ["api", "client", "openapi", "swagger", "generated"],
  };

  if (includeMain) {
    pkg.main = packageInfo.main || "index.js";
  }

  return JSON.stringify(pkg, null, 2);
} 