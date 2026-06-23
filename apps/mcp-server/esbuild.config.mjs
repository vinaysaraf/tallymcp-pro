// apps/mcp-server/esbuild.config.mjs
// Bundles @tallymcp/mcp-server into a single self-contained JavaScript file
// for shipping in the Windows installer. Eliminates pnpm's symlink-based
// dependency layout entirely — the bundle has zero node_modules dependencies
// at runtime, so it can't hit ERR_MODULE_NOT_FOUND on Windows after NSIS
// extraction (the failure mode that broke v1.0.3 + v1.0.4).
//
// Design notes:
//  - format: "esm" keeps top-level await + `import.meta.url` working in our code
//  - banner injects `createRequire` so any CJS deps in the transitive graph
//    that internally call `require()` still work inside the ESM bundle
//  - platform: "node" enables Node.js built-in module resolution and globals
//  - external: empty → bundle EVERYTHING (the whole point)
//  - sourcemap: "linked" emits main.bundle.js.map alongside for debug stack traces
//  - target: "node20" matches the runtime/node.exe we ship in the installer

import esbuild from "esbuild";
import { mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "dist");

await mkdir(outdir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(__dirname, "src", "main.ts")],
  outfile: join(outdir, "main.bundle.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: [
      "// Shim for CommonJS deps that internally call require() inside an ESM bundle.",
      "import { createRequire as topLevelCreateRequire } from 'module';",
      "const require = topLevelCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  external: [],
  minify: false,
  sourcemap: "linked",
  metafile: true,
  logLevel: "info",
  legalComments: "linked",
});

await access(join(outdir, "main.bundle.js"));
console.log("[esbuild] main.bundle.js produced");

const bytes = Object.entries(result.metafile.outputs).reduce(
  (total, [path, info]) => (path.endsWith(".js") ? total + info.bytes : total),
  0,
);
console.log(`[esbuild] bundle size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
