// const { execSync } = require("node:child_process");

const { execa } = require("execa");
// const { stderr, stdout } = require("node:process");

/**
 * Run the speedtest module using npx.
 *
 * This function executes the speedtest module using npx.
 */
async function speedtest() {
  // child_process("npx @involvex/speed-test");

  const { stdout } = await execa({ stdout: ["pipe", "inherit"] })`speed-test`;
  console.log(stdout);
}

speedtest();
