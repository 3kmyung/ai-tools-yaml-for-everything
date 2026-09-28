import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const releaseName = path.basename(path.dirname(webDirectory));
const workspaceWebDirectory = path.resolve(webDirectory, "../../../workspaces", releaseName, "web");
const workspaceTestDirectory = path.join(workspaceWebDirectory, "test");

function isInside(directory: string, target: string): boolean {
  const relative = path.relative(directory, target);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveWorkspaceTests(): Plugin {
  return {
    name: "resolve-workspace-tests",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (importer === undefined || !isInside(workspaceTestDirectory, importer)) {
        return null;
      }

      const mirroredImporter = path.join(webDirectory, path.relative(workspaceWebDirectory, importer));

      if (source.startsWith(".")) {
        const target = path.resolve(path.dirname(importer), source);

        if (isInside(workspaceTestDirectory, target)) {
          return null;
        }
      }

      return this.resolve(source, mirroredImporter, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), resolveWorkspaceTests()],
  test: {
    environment: "node",
    dir: workspaceTestDirectory,
    include: ["**/*.test.ts"],
  },
});
