import * as React from 'react'
import { useEffect, useState } from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Spinner } from '../../components/Spinner.js'
import { Box, Text } from '../../ink.js'
import {
  DEFAULT_CODEX_BASE_URL,
  resolveCodexApiCredentials,
} from '../../services/api/providerConfig.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'

const DEFAULT_MODEL = 'codexplan'
const FORCE_RELOGIN_ARGS = new Set([
  'force',
  '--force',
  'relogin',
  '--relogin',
  'reauth',
  '--reauth',
])

type Step = 'menu' | 'login-busy' | 'error'

type LoginResult =
  | { ok: true }
  | {
      ok: false
      detail: string
    }

export function shouldForceChatGPTRelogin(args?: string): boolean {
  const normalized = (args ?? '').trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return normalized.split(/\s+/).some(arg => FORCE_RELOGIN_ARGS.has(arg))
}

export function hasExistingChatGPTLogin(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const credentials = resolveCodexApiCredentials(env)
  return Boolean(credentials.apiKey && credentials.accountId)
}

export function buildChatGPTOnboardingSettingsEnv(
  model: string,
): Record<string, string | undefined> {
  const normalizedModel = model.trim() || DEFAULT_MODEL
  return {
    CLAUDE_CODE_USE_OPENAI: '1',
    OPENAI_BASE_URL: DEFAULT_CODEX_BASE_URL,
    OPENAI_MODEL: normalizedModel,
    OPENAI_API_KEY: undefined,
    OPENAI_API_BASE: undefined,
    OPENAI_ORG: undefined,
    OPENAI_PROJECT: undefined,
    OPENAI_ORGANIZATION: undefined,
    CODEX_API_KEY: undefined,
    CHATGPT_ACCOUNT_ID: undefined,
    CODEX_ACCOUNT_ID: undefined,
    CLAUDE_CODE_USE_GITHUB: undefined,
    CLAUDE_CODE_USE_GEMINI: undefined,
    CLAUDE_CODE_USE_BEDROCK: undefined,
    CLAUDE_CODE_USE_VERTEX: undefined,
    CLAUDE_CODE_USE_FOUNDRY: undefined,
  }
}

export function applyChatGPTOnboardingProcessEnv(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const normalizedModel = model.trim() || DEFAULT_MODEL

  env.CLAUDE_CODE_USE_OPENAI = '1'
  env.OPENAI_BASE_URL = DEFAULT_CODEX_BASE_URL
  env.OPENAI_MODEL = normalizedModel

  delete env.OPENAI_API_KEY
  delete env.OPENAI_API_BASE
  delete env.OPENAI_ORG
  delete env.OPENAI_PROJECT
  delete env.OPENAI_ORGANIZATION
  delete env.CODEX_API_KEY
  delete env.CHATGPT_ACCOUNT_ID
  delete env.CODEX_ACCOUNT_ID

  delete env.CLAUDE_CODE_USE_GITHUB
  delete env.CLAUDE_CODE_USE_GEMINI
  delete env.CLAUDE_CODE_USE_BEDROCK
  delete env.CLAUDE_CODE_USE_VERTEX
  delete env.CLAUDE_CODE_USE_FOUNDRY
  delete env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED
  delete env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID
}

function mergeUserSettingsEnv(model: string): { ok: boolean; detail?: string } {
  const { error } = updateSettingsForSource('userSettings', {
    env: buildChatGPTOnboardingSettingsEnv(model) as any,
  })
  if (error) {
    return { ok: false, detail: error.message }
  }
  return { ok: true }
}

export function activateChatGPTOnboardingMode(
  model: string = DEFAULT_MODEL,
  options?: {
    mergeSettingsEnv?: (model: string) => { ok: boolean; detail?: string }
    applyProcessEnv?: (model: string) => void
    onChangeAPIKey?: () => void
  },
): { ok: boolean; detail?: string } {
  const normalizedModel = model.trim() || DEFAULT_MODEL
  const mergeSettingsEnv = options?.mergeSettingsEnv ?? mergeUserSettingsEnv
  const applyProcessEnv =
    options?.applyProcessEnv ?? applyChatGPTOnboardingProcessEnv

  const merged = mergeSettingsEnv(normalizedModel)
  if (!merged.ok) {
    return merged
  }

  applyProcessEnv(normalizedModel)
  options?.onChangeAPIKey?.()
  return { ok: true }
}

function formatProcessFailure(stderr: string, stdout: string): string {
  const detail = stderr.trim() || stdout.trim()
  if (!detail) {
    return 'The Codex CLI exited before OpenClaude could confirm your login.'
  }
  return detail.split(/\r?\n/).slice(-4).join('\n')
}

async function runCodexBrowserLogin(): Promise<LoginResult> {
  const versionCheck = await execFileNoThrow('codex', ['--version'], {
    timeout: 15_000,
    preserveOutputOnError: true,
    useCwd: false,
  })
  if (versionCheck.code !== 0) {
    return {
      ok: false,
      detail:
        'The `codex` CLI was not found in PATH. Install the official Codex CLI first, then run /onboard-chatgpt again.',
    }
  }

  const loginResult = await execFileNoThrow('codex', ['login'], {
    timeout: 10 * 60 * 1000,
    preserveOutputOnError: true,
    useCwd: false,
  })
  if (loginResult.code !== 0) {
    return {
      ok: false,
      detail: formatProcessFailure(loginResult.stderr, loginResult.stdout),
    }
  }

  const credentials = resolveCodexApiCredentials(process.env)
  if (!credentials.apiKey) {
    return {
      ok: false,
      detail:
        credentials.authPath
          ? `Codex login finished, but no auth token was found at ${credentials.authPath}.`
          : 'Codex login finished, but no auth token was found.',
    }
  }

  if (!credentials.accountId) {
    return {
      ok: false,
      detail:
        'Codex login finished, but chatgpt_account_id is still missing. Re-run `codex login` and make sure the browser flow completes fully.',
    }
  }

  return { ok: true }
}

function OnboardChatGPT(props: {
  onDone: Parameters<LocalJSXCommandCall>[0]
  onChangeAPIKey: () => void
}): React.ReactNode {
  const { onDone, onChangeAPIKey } = props
  const [step, setStep] = useState<Step>('menu')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (step !== 'login-busy') {
      return
    }

    let cancelled = false
    void (async () => {
      const result = await runCodexBrowserLogin()
      if (cancelled) {
        return
      }

      if (!result.ok) {
        setErrorMsg(result.detail)
        setStep('error')
        return
      }

      const activated = activateChatGPTOnboardingMode(DEFAULT_MODEL, {
        onChangeAPIKey,
      })
      if (!activated.ok) {
        setErrorMsg(
          `Login completed, but provider activation failed: ${activated.detail ?? 'unknown error'}. ` +
            'Configure CLAUDE_CODE_USE_OPENAI=1, OPENAI_BASE_URL, and OPENAI_MODEL manually if needed.',
        )
        setStep('error')
        return
      }

      onDone(
        'ChatGPT authentication completed. Codex mode is now active using official Codex CLI credentials.',
        { display: 'user' },
      )
    })()

    return () => {
      cancelled = true
    }
  }, [step, onChangeAPIKey, onDone])

  if (step === 'login-busy') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>ChatGPT setup</Text>
        <Box>
          <Spinner />
          <Text>Starting official login via the Codex CLI...</Text>
        </Box>
        <Text dimColor>
          Your browser should open to authenticate your ChatGPT account. When
          the login finishes, OpenClaude will activate the Codex provider for
          this session and future runs.
        </Text>
      </Box>
    )
  }

  if (step === 'error' && errorMsg) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">{errorMsg}</Text>
        <Select
          options={[
            { label: 'Retry', value: 'retry' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          onChange={(value: string) => {
            if (value === 'retry') {
              setErrorMsg(null)
              setStep('login-busy')
              return
            }
            onDone('ChatGPT onboarding cancelled.', { display: 'system' })
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>ChatGPT setup</Text>
      <Text dimColor>
        This flow uses the official Codex CLI login to open your browser,
        authenticate your ChatGPT account, and then activate the Codex provider
        in OpenClaude without relying on scraping or private endpoints.
      </Text>
      <Select
        options={[
          {
            label: 'Sign in with browser',
            value: 'login',
          },
          {
            label: 'Cancel',
            value: 'cancel',
          },
        ]}
        onChange={(value: string) => {
          if (value === 'cancel') {
            onDone('ChatGPT onboarding cancelled.', { display: 'system' })
            return
          }
          setStep('login-busy')
        }}
      />
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const forceRelogin = shouldForceChatGPTRelogin(args)

  if (hasExistingChatGPTLogin() && !forceRelogin) {
    const activated = activateChatGPTOnboardingMode(DEFAULT_MODEL, {
      onChangeAPIKey: context.onChangeAPIKey,
    })
    if (!activated.ok) {
      onDone(
        `ChatGPT/Codex credentials were detected, but activation failed: ${activated.detail ?? 'unknown error'}.`,
        { display: 'system' },
      )
      return null
    }

    onDone(
      'ChatGPT/Codex credentials already exist. Codex mode was activated. Use /onboard-chatgpt --force to authenticate again.',
      { display: 'user' },
    )
    return null
  }

  return (
    <OnboardChatGPT
      onDone={onDone}
      onChangeAPIKey={context.onChangeAPIKey}
    />
  )
}
