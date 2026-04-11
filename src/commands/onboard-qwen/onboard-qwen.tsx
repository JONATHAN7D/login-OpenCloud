import * as React from 'react'
import { useEffect, useState } from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Spinner } from '../../components/Spinner.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import {
  clearAllQwenCredentials,
  DEFAULT_QWEN_MODEL,
  hasExistingQwenOAuthLogin,
  importQwenOAuthCredentialsFromCliCache,
} from '../../utils/qwenCredentials.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const DEFAULT_MODEL = DEFAULT_QWEN_MODEL
const FORCE_RELOGIN_ARGS = new Set([
  'force',
  '--force',
  'relogin',
  '--relogin',
  'reauth',
  '--reauth',
])

type Step = 'menu' | 'existing-login' | 'login-busy' | 'error'

type LoginResult =
  | { ok: true; warning?: string }
  | { ok: false; detail: string }

export function shouldForceQwenRelogin(args?: string): boolean {
  const normalized = (args ?? '').trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return normalized.split(/\s+/).some(arg => FORCE_RELOGIN_ARGS.has(arg))
}

export function shouldOfferExistingQwenLoginChoice(options: {
  hasExistingLogin: boolean
  forceRelogin: boolean
}): boolean {
  return options.hasExistingLogin && !options.forceRelogin
}

export function buildQwenOnboardingSettingsEnv(
  model: string,
): Record<string, string | undefined> {
  const normalizedModel = model.trim() || DEFAULT_MODEL
  return {
    CLAUDE_CODE_USE_QWEN: '1',
    OPENAI_MODEL: normalizedModel,
    OPENAI_BASE_URL: undefined,
    OPENAI_API_KEY: undefined,
    OPENAI_API_BASE: undefined,
    OPENAI_ORG: undefined,
    OPENAI_PROJECT: undefined,
    OPENAI_ORGANIZATION: undefined,
    CODEX_API_KEY: undefined,
    CHATGPT_ACCOUNT_ID: undefined,
    CODEX_ACCOUNT_ID: undefined,
    CLAUDE_CODE_USE_OPENAI: undefined,
    CLAUDE_CODE_USE_GITHUB: undefined,
    CLAUDE_CODE_USE_GEMINI: undefined,
    CLAUDE_CODE_USE_BEDROCK: undefined,
    CLAUDE_CODE_USE_VERTEX: undefined,
    CLAUDE_CODE_USE_FOUNDRY: undefined,
  }
}

export function applyQwenOnboardingProcessEnv(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const normalizedModel = model.trim() || DEFAULT_MODEL

  env.CLAUDE_CODE_USE_QWEN = '1'
  env.OPENAI_MODEL = normalizedModel

  delete env.OPENAI_BASE_URL
  delete env.OPENAI_API_KEY
  delete env.OPENAI_API_BASE
  delete env.OPENAI_ORG
  delete env.OPENAI_PROJECT
  delete env.OPENAI_ORGANIZATION
  delete env.CODEX_API_KEY
  delete env.CHATGPT_ACCOUNT_ID
  delete env.CODEX_ACCOUNT_ID

  delete env.CLAUDE_CODE_USE_OPENAI
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
    env: buildQwenOnboardingSettingsEnv(model) as any,
  })
  if (error) {
    return { ok: false, detail: error.message }
  }
  return { ok: true }
}

export function activateQwenOnboardingMode(
  model: string = DEFAULT_MODEL,
  options?: {
    mergeSettingsEnv?: (model: string) => { ok: boolean; detail?: string }
    applyProcessEnv?: (model: string) => void
    onChangeAPIKey?: () => void
  },
): { ok: boolean; detail?: string } {
  const normalizedModel = model.trim() || DEFAULT_MODEL
  const mergeSettingsEnv = options?.mergeSettingsEnv ?? mergeUserSettingsEnv
  const applyProcessEnv = options?.applyProcessEnv ?? applyQwenOnboardingProcessEnv

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
    return 'The qwen CLI exited before OpenClaude could confirm your login.'
  }
  return detail.split(/\r?\n/).slice(-4).join('\n')
}

export async function runQwenBrowserLogin(options?: {
  forceReauthenticate?: boolean
}): Promise<LoginResult> {
  const versionCheck = await execFileNoThrow('qwen', ['--version'], {
    timeout: 15_000,
    preserveOutputOnError: true,
    useCwd: false,
  })
  if (versionCheck.code !== 0) {
    return {
      ok: false,
      detail:
        'The `qwen` CLI was not found in PATH. Install the official Qwen Code CLI first, then run /onboard-qwen again.',
    }
  }

  if (options?.forceReauthenticate) {
    const cleared = clearAllQwenCredentials(process.env)
    if (!cleared.success) {
      return {
        ok: false,
        detail: cleared.warning ?? 'Could not clear existing Qwen credentials.',
      }
    }
  }

  const loginResult = await execFileNoThrow('qwen', ['auth', 'qwen-oauth'], {
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

  const imported = importQwenOAuthCredentialsFromCliCache(process.env)
  if (!imported.ok) {
    return {
      ok: false,
      detail: imported.detail,
    }
  }

  return { ok: true, warning: imported.warning }
}

function OnboardQwen(props: {
  onDone: Parameters<LocalJSXCommandCall>[0]
  onChangeAPIKey: () => void
  initialStep?: Step
  forceReauthenticate?: boolean
}): React.ReactNode {
  const { onDone, onChangeAPIKey } = props
  const [step, setStep] = useState<Step>(props.initialStep ?? 'menu')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [forceReauthenticate, setForceReauthenticate] = useState(
    props.forceReauthenticate ?? false,
  )

  function activateExistingLogin(): void {
    const activated = activateQwenOnboardingMode(DEFAULT_MODEL, {
      onChangeAPIKey,
    })
    if (!activated.ok) {
      setErrorMsg(
        `Stored Qwen credentials were found, but provider activation failed: ${activated.detail ?? 'unknown error'}.`,
      )
      setStep('error')
      return
    }

    onDone(
      'Qwen credentials already exist. Qwen mode was activated. Choose browser reauthentication here any time if you want to refresh the login.',
      { display: 'user' },
    )
  }

  useEffect(() => {
    if (step !== 'login-busy') {
      return
    }

    let cancelled = false
    void (async () => {
      const result = await runQwenBrowserLogin({
        forceReauthenticate,
      })
      if (cancelled) {
        return
      }

      if (!result.ok) {
        setErrorMsg(result.detail)
        setStep('error')
        return
      }

      const activated = activateQwenOnboardingMode(DEFAULT_MODEL, {
        onChangeAPIKey,
      })
      if (!activated.ok) {
        setErrorMsg(
          `Login completed, but provider activation failed: ${activated.detail ?? 'unknown error'}. ` +
            'Configure CLAUDE_CODE_USE_QWEN=1 and OPENAI_MODEL manually if needed.',
        )
        setStep('error')
        return
      }

      onDone(
        result.warning
          ? `Qwen authentication completed. ${result.warning} Qwen mode is now active for this session and future runs.`
          : 'Qwen authentication completed. Qwen mode is now active for this session and future runs.',
        { display: 'user' },
      )
    })()

    return () => {
      cancelled = true
    }
  }, [step, onChangeAPIKey, onDone, forceReauthenticate])

  if (step === 'login-busy') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Qwen setup</Text>
        <Box>
          <Spinner />
          <Text>Starting official Qwen browser login...</Text>
        </Box>
        <Text dimColor>
          Your browser should open for the official qwen CLI OAuth flow. When
          the login finishes, OpenClaude will activate the Qwen provider for
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
              setForceReauthenticate(true)
              setStep('login-busy')
              return
            }
            onDone('Qwen onboarding cancelled.', { display: 'system' })
          }}
        />
      </Box>
    )
  }

  if (step === 'existing-login') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Qwen setup</Text>
        <Text dimColor>
          Existing Qwen OAuth credentials were found. You can keep using them or
          start a fresh browser login now.
        </Text>
        <Select
          options={[
            {
              label: 'Use existing credentials',
              value: 'existing',
            },
            {
              label: 'Reauthenticate in browser',
              value: 'relogin',
            },
            {
              label: 'Cancel',
              value: 'cancel',
            },
          ]}
          onChange={(value: string) => {
            if (value === 'existing') {
              activateExistingLogin()
              return
            }
            if (value === 'relogin') {
              setErrorMsg(null)
              setForceReauthenticate(true)
              setStep('login-busy')
              return
            }
            onDone('Qwen onboarding cancelled.', { display: 'system' })
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Qwen setup</Text>
      <Text dimColor>
        This flow uses the official qwen CLI login to open your browser,
        authenticate your qwen.ai account, import the OAuth credentials into
        OpenClaude secure storage, and activate the Qwen provider.
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
            onDone('Qwen onboarding cancelled.', { display: 'system' })
            return
          }
          setForceReauthenticate(false)
          setStep('login-busy')
        }}
      />
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const forceRelogin = shouldForceQwenRelogin(args)
  const hasExistingLogin = hasExistingQwenOAuthLogin()

  if (forceRelogin) {
    return (
      <OnboardQwen
        onDone={onDone}
        onChangeAPIKey={context.onChangeAPIKey}
        initialStep="login-busy"
        forceReauthenticate
      />
    )
  }

  return (
    <OnboardQwen
      onDone={onDone}
      onChangeAPIKey={context.onChangeAPIKey}
      forceReauthenticate={false}
      initialStep={
        shouldOfferExistingQwenLoginChoice({
          hasExistingLogin,
          forceRelogin,
        })
          ? 'existing-login'
          : 'menu'
      }
    />
  )
}
