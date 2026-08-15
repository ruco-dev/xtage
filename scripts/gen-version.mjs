/**
 * Generates src/version.ts from the `version` field in package.json.
 * Run automatically as the `prebuild` npm script so VERSION never drifts.
 */
import { readFileSync, writeFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
writeFileSync('src/version.ts', `export const VERSION = '${version}'\n`)
console.log(`gen-version: src/version.ts → '${version}'`)
