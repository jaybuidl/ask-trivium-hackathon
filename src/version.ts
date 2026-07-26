/**
 * The package version, in one place.
 *
 * It was in three — the CLI's `--version`, the MCP server's handshake, and the client the bridge
 * introduces itself to the backend with — and they had already drifted apart from each other and
 * from `package.json`. Version strings are exactly the kind of thing nobody notices is stale,
 * because nothing fails when it is.
 *
 * Not imported from `package.json`: that file sits outside `rootDir`, so a JSON import would either
 * pull it into the build output or need module settings this repo does not otherwise want.
 * `version.test.ts` asserts the two agree instead, which turns the copy into a checked one.
 */
export const VERSION = '0.1.2'
