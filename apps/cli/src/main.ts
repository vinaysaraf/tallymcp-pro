#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("tallymcp-cli")
    .description("TallyMCP installer — terminal commands")
    .version("0.0.1");

  // Subsequent tasks register subcommands by mutating `program` inside
  // this function, OR by exporting helpers (registerWireCommand, etc.)
  // and calling them here. Either pattern is fine — keep the call inside
  // createProgram so the side-effect-free guarantee holds.

  return program;
}

// Only auto-run when this module IS the entry point. Importing it from a
// test or another module is a no-op.
const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  await createProgram().parseAsync(process.argv);
}
