import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isBareMode, isEnvTruthy } from './envUtils.js'
import { getSecureStorage } from './secureStorage/index.js'

export const QWEN_STORAGE_KEY = 'qwenOAuth' as const
export const DEFAULT_QWEN_MODEL = 'coder-model'
export const DEFAULT_QWEN_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const QWEN_CREDENTIAL_FILENAME = 'oauth_creds.json'
export const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
export const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai'
export const QWEN_OAUTH_TOKEN_ENDPOINT =
  `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`

type RawQwenCredentialRecord = Partial<{
  access_token: string
  refresh_token: string
  expiry_date: number
  resource_url: string
  token_type: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  resourceUrl: string
  tokenType: string
}>

export type QwenStoredCredentialBlob = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  resourceUrl?: string
  tokenType?: string
}

export type QwenCredentialSource = 'stored' | 'cli-cache' | 'none'

export type QwenAccessContext = {
  accessToken: string
  baseUrl: string
  model: string
  resourceUrl?: string
  expiresAt?: number
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  return undefined
}

function normalizeCredentials(
  value: RawQwenCredentialRecord | null | undefined,
): QwenStoredCredentialBlob | undefined {
  if (!value || typeof value !== 'object') return undefined

  const accessToken = trimString(value.accessToken ?? value.access_token)
  if (!accessToken) return undefined

  return {
    accessToken,
    refreshToken: trimString(value.refreshToken ?? value.refresh_token),
    expiresAt: parseTimestamp(value.expiresAt ?? value.expiry_date),
    resourceUrl: trimString(value.resourceUrl ?? value.resource_url),
    tokenType: trimString(value.tokenType ?? value.token_type),
  }
}

function toStorageBlob(
  credentials: QwenStoredCredentialBlob,
): QwenStoredCredentialBlob {
  return {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    resourceUrl: credentials.resourceUrl,
    tokenType: credentials.tokenType,
  }
}

function toUrlEncoded(body: Record<string, string>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value)
  }
  return params.toString()
}

function isTokenFresh(expiresAt: number | undefined): boolean {
  if (!expiresAt) return true
  return expiresAt - Date.now() > 60_000
}

export function normalizeQwenBaseUrl(resourceUrl?: string): string {
  const raw = trimString(resourceUrl) || DEFAULT_QWEN_BASE_URL
  const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '').endsWith('/v1')
    ? withProtocol.replace(/\/+$/, '')
    : `${withProtocol.replace(/\/+$/, '')}/v1`
}

export function resolveQwenCliCredentialPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const qwenHome = trimString(env.QWEN_HOME)
  if (qwenHome) {
    return join(qwenHome, QWEN_CREDENTIAL_FILENAME)
  }
  return join(homedir(), '.qwen', QWEN_CREDENTIAL_FILENAME)
}

export function readQwenCliCredentials(
  env: NodeJS.ProcessEnv = process.env,
): QwenStoredCredentialBlob | undefined {
  const filePath = resolveQwenCliCredentialPath(env)
  if (!existsSync(filePath)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as RawQwenCredentialRecord
    return normalizeCredentials(parsed)
  } catch {
    return undefined
  }
}

export async function readQwenCliCredentialsAsync(
  env: NodeJS.ProcessEnv = process.env,
): Promise<QwenStoredCredentialBlob | undefined> {
  return readQwenCliCredentials(env)
}

export function readQwenStoredCredentials(): QwenStoredCredentialBlob | undefined {
  if (isBareMode()) return undefined
  try {
    const data = getSecureStorage().read()
    return normalizeCredentials(data?.qwenOAuth as RawQwenCredentialRecord | undefined)
  } catch {
    return undefined
  }
}

export async function readQwenStoredCredentialsAsync(): Promise<
  QwenStoredCredentialBlob | undefined
> {
  if (isBareMode()) return undefined
  try {
    const data = await getSecureStorage().readAsync()
    return normalizeCredentials(data?.qwenOAuth as RawQwenCredentialRecord | undefined)
  } catch {
    return undefined
  }
}

export function saveQwenStoredCredentials(
  credentials: QwenStoredCredentialBlob,
): { success: boolean; warning?: string } {
  if (isBareMode()) {
    return { success: false, warning: 'Bare mode: secure storage is disabled.' }
  }

  const normalized = normalizeCredentials(credentials)
  if (!normalized) {
    return { success: false, warning: 'Qwen credentials are empty or invalid.' }
  }

  const secureStorage = getSecureStorage()
  const previous = secureStorage.read() || {}
  const next = {
    ...(previous as Record<string, unknown>),
    [QWEN_STORAGE_KEY]: toStorageBlob(normalized),
  }

  return secureStorage.update(next as typeof previous)
}

export function clearQwenStoredCredentials(): {
  success: boolean
  warning?: string
} {
  if (isBareMode()) {
    return { success: true }
  }

  const secureStorage = getSecureStorage()
  const previous = secureStorage.read() || {}
  const next = { ...(previous as Record<string, unknown>) }
  delete next[QWEN_STORAGE_KEY]
  return secureStorage.update(next as typeof previous)
}

export function clearQwenCliCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { success: boolean; warning?: string } {
  const filePath = resolveQwenCliCredentialPath(env)
  try {
    rmSync(filePath, { force: true })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      warning:
        error instanceof Error
          ? `Could not clear Qwen CLI credentials at ${filePath}: ${error.message}`
          : `Could not clear Qwen CLI credentials at ${filePath}`,
    }
  }
}

export function clearAllQwenCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { success: boolean; warning?: string } {
  const stored = clearQwenStoredCredentials()
  if (!stored.success) {
    return stored
  }

  const cli = clearQwenCliCredentials(env)
  if (!cli.success) {
    return cli
  }

  return { success: true }
}

export function getQwenCredentialSource(
  env: NodeJS.ProcessEnv = process.env,
): QwenCredentialSource {
  if (readQwenStoredCredentials()) {
    return 'stored'
  }
  if (readQwenCliCredentials(env)) {
    return 'cli-cache'
  }
  return 'none'
}

export async function getQwenCredentialSourceAsync(
  env: NodeJS.ProcessEnv = process.env,
): Promise<QwenCredentialSource> {
  if (await readQwenStoredCredentialsAsync()) {
    return 'stored'
  }
  if (await readQwenCliCredentialsAsync(env)) {
    return 'cli-cache'
  }
  return 'none'
}

export function hasExistingQwenOAuthLogin(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getQwenCredentialSource(env) !== 'none'
}

export function primeQwenStoredCredentialsFromCliCache(
  env: NodeJS.ProcessEnv = process.env,
): { imported: boolean; warning?: string } {
  if (!isEnvTruthy(env.CLAUDE_CODE_USE_QWEN)) {
    return { imported: false }
  }

  if (readQwenStoredCredentials()) {
    return { imported: false }
  }

  const cliCredentials = readQwenCliCredentials(env)
  if (!cliCredentials) {
    return { imported: false }
  }

  const saved = saveQwenStoredCredentials(cliCredentials)
  if (!saved.success) {
    return { imported: false, warning: saved.warning }
  }

  return { imported: true }
}

export function importQwenOAuthCredentialsFromCliCache(
  env: NodeJS.ProcessEnv = process.env,
):
  | {
      ok: true
      credentials: QwenStoredCredentialBlob
      warning?: string
    }
  | {
      ok: false
      detail: string
    } {
  const cliCredentials = readQwenCliCredentials(env)
  if (!cliCredentials) {
    return {
      ok: false,
      detail: `Qwen login finished, but no OAuth credentials were found at ${resolveQwenCliCredentialPath(env)}.`,
    }
  }

  const saved = saveQwenStoredCredentials(cliCredentials)
  if (!saved.success) {
    if (saved.warning === 'Bare mode: secure storage is disabled.') {
      return { ok: true, credentials: cliCredentials, warning: saved.warning }
    }
    return {
      ok: false,
      detail: saved.warning ?? 'Could not save Qwen credentials to secure storage.',
    }
  }

  return { ok: true, credentials: cliCredentials }
}

type RefreshResponse = Partial<{
  access_token: string
  refresh_token: string
  expires_in: number
  resource_url: string
  token_type: string
  error: string
  error_description: string
}>

export async function refreshQwenStoredCredentials(
  credentials: QwenStoredCredentialBlob,
): Promise<QwenStoredCredentialBlob> {
  const refreshToken = trimString(credentials.refreshToken)
  if (!refreshToken) {
    throw new Error('Qwen OAuth refresh token is missing. Run /onboard-qwen again.')
  }

  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: toUrlEncoded({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: QWEN_OAUTH_CLIENT_ID,
    }),
  })

  const responseText = await response.text()
  let parsed: RefreshResponse | undefined
  try {
    parsed = JSON.parse(responseText) as RefreshResponse
  } catch {
    parsed = undefined
  }

  if (!response.ok) {
    if (response.status === 400) {
      clearQwenStoredCredentials()
    }
    const detail =
      trimString(parsed?.error_description) ||
      trimString(parsed?.error) ||
      responseText ||
      `${response.status} ${response.statusText}`
    throw new Error(
      `Qwen OAuth refresh failed. ${detail}. Run /onboard-qwen again.`,
    )
  }

  const accessToken = trimString(parsed?.access_token)
  if (!accessToken) {
    throw new Error('Qwen OAuth refresh succeeded but no access token was returned.')
  }

  const next: QwenStoredCredentialBlob = {
    accessToken,
    refreshToken: trimString(parsed?.refresh_token) || refreshToken,
    resourceUrl: trimString(parsed?.resource_url) || credentials.resourceUrl,
    tokenType: trimString(parsed?.token_type) || credentials.tokenType,
    expiresAt:
      typeof parsed?.expires_in === 'number' && Number.isFinite(parsed.expires_in)
        ? Date.now() + parsed.expires_in * 1000
        : credentials.expiresAt,
  }

  const saved = saveQwenStoredCredentials(next)
  if (!saved.success && saved.warning !== 'Bare mode: secure storage is disabled.') {
    throw new Error(saved.warning ?? 'Could not persist refreshed Qwen credentials.')
  }

  return next
}

export async function getValidQwenAccessContext(options?: {
  env?: NodeJS.ProcessEnv
  model?: string
}): Promise<QwenAccessContext> {
  const env = options?.env ?? process.env
  let credentials = readQwenStoredCredentials() ?? readQwenCliCredentials(env)
  if (!credentials) {
    throw new Error(
      'Qwen OAuth credentials were not found. Run /onboard-qwen or complete `qwen auth qwen-oauth` first.',
    )
  }

  if (!isTokenFresh(credentials.expiresAt)) {
    credentials = await refreshQwenStoredCredentials(credentials)
  }

  if (!credentials.accessToken) {
    throw new Error('Qwen OAuth credentials are missing an access token.')
  }

  return {
    accessToken: credentials.accessToken,
    baseUrl: normalizeQwenBaseUrl(credentials.resourceUrl),
    model:
      trimString(options?.model) || trimString(env.OPENAI_MODEL) || DEFAULT_QWEN_MODEL,
    resourceUrl: credentials.resourceUrl,
    expiresAt: credentials.expiresAt,
  }
}
