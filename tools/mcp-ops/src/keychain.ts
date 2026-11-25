import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseToken } from './core.ts'

const run = promisify(execFile)

/** The Keychain item holding the ops token. See the Setup section of docs/MCP-OPS.md. */
export const KEYCHAIN_SERVICE = 'techx-ops'

/**
 * Reads the token from the login Keychain. `execFile`, not a shell: nothing
 * here is interpolated into a command line. The token never touches a config
 * file or an environment variable.
 */
export async function readToken(): Promise<string> {
  let stdout: string
  try {
    // Absolute path: Claude starts servers with a minimal PATH, and a
    // `security` earlier in it would be handed the Keychain read.
    ;({ stdout } = await run('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']))
  } catch {
    throw new Error(
      `No readable Keychain item "${KEYCHAIN_SERVICE}" on this Mac. Create it as in docs/MCP-OPS.md (Setup), ` +
        'and choose "Always Allow" if macOS asks.',
    )
  }
  return parseToken(stdout)
}
