import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'bun:test'

import { getProviderValidationError } from './providerValidation.ts'

const originalEnv = {
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_QWEN: process.env.CLAUDE_CODE_USE_QWEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_ACCESS_TOKEN: process.env.GEMINI_ACCESS_TOKEN,
  GEMINI_AUTH_MODE: process.env.GEMINI_AUTH_MODE,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  QWEN_HOME: process.env.QWEN_HOME,
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(() => {
  restoreEnv('CLAUDE_CODE_USE_GEMINI', originalEnv.CLAUDE_CODE_USE_GEMINI)
  restoreEnv('CLAUDE_CODE_USE_QWEN', originalEnv.CLAUDE_CODE_USE_QWEN)
  restoreEnv('GEMINI_API_KEY', originalEnv.GEMINI_API_KEY)
  restoreEnv('GOOGLE_API_KEY', originalEnv.GOOGLE_API_KEY)
  restoreEnv('GEMINI_ACCESS_TOKEN', originalEnv.GEMINI_ACCESS_TOKEN)
  restoreEnv('GEMINI_AUTH_MODE', originalEnv.GEMINI_AUTH_MODE)
  restoreEnv(
    'GOOGLE_APPLICATION_CREDENTIALS',
    originalEnv.GOOGLE_APPLICATION_CREDENTIALS,
  )
  restoreEnv('QWEN_HOME', originalEnv.QWEN_HOME)
})

test('accepts GEMINI_ACCESS_TOKEN as valid Gemini auth', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'access-token'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  process.env.GEMINI_ACCESS_TOKEN = 'token-123'

  await expect(getProviderValidationError(process.env)).resolves.toBeNull()
})

test('accepts ADC credentials for Gemini auth', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'adc'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.GEMINI_ACCESS_TOKEN

  await expect(
    getProviderValidationError(process.env, {
      resolveGeminiCredential: async () => ({
        kind: 'adc',
        credential: 'adc-token',
        projectId: 'adc-project',
      }),
    }),
  ).resolves.toBeNull()
})

test('still errors when no Gemini credential source is available', async () => {
  process.env.CLAUDE_CODE_USE_GEMINI = '1'
  process.env.GEMINI_AUTH_MODE = 'access-token'
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
  delete process.env.GEMINI_ACCESS_TOKEN
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS

  await expect(getProviderValidationError(process.env)).resolves.toBe(
    'GEMINI_API_KEY, GOOGLE_API_KEY, GEMINI_ACCESS_TOKEN, or Google ADC credentials are required when CLAUDE_CODE_USE_GEMINI=1.',
  )
})

test('accepts stored Qwen OAuth credentials', async () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'openclaude-qwen-'))
  mkdirSync(join(tempHome, '.qwen'))
  writeFileSync(
    join(tempHome, '.qwen', 'oauth_creds.json'),
    JSON.stringify({
      access_token: 'qwen-access-token',
      refresh_token: 'qwen-refresh-token',
      expiry_date: Date.now() + 60_000,
    }),
    'utf8',
  )

  process.env.CLAUDE_CODE_USE_QWEN = '1'
  process.env.QWEN_HOME = join(tempHome, '.qwen')

  await expect(getProviderValidationError(process.env)).resolves.toBeNull()

  rmSync(tempHome, { recursive: true, force: true })
})
