import { describe, expect, test } from 'bun:test'

import {
  activateQwenOnboardingMode,
  applyQwenOnboardingProcessEnv,
  buildQwenOnboardingSettingsEnv,
  shouldOfferExistingQwenLoginChoice,
  shouldForceQwenRelogin,
} from './onboard-qwen.js'

describe('shouldForceQwenRelogin', () => {
  test.each(['force', '--force', 'relogin', '--relogin', 'reauth', '--reauth'])(
    'treats %s as force re-login',
    arg => {
      expect(shouldForceQwenRelogin(arg)).toBe(true)
    },
  )

  test('returns false for empty or unknown args', () => {
    expect(shouldForceQwenRelogin('')).toBe(false)
    expect(shouldForceQwenRelogin(undefined)).toBe(false)
    expect(shouldForceQwenRelogin('something-else')).toBe(false)
  })
})

describe('shouldOfferExistingQwenLoginChoice', () => {
  test('returns true only when credentials already exist and force is off', () => {
    expect(
      shouldOfferExistingQwenLoginChoice({
        hasExistingLogin: true,
        forceRelogin: false,
      }),
    ).toBe(true)

    expect(
      shouldOfferExistingQwenLoginChoice({
        hasExistingLogin: true,
        forceRelogin: true,
      }),
    ).toBe(false)

    expect(
      shouldOfferExistingQwenLoginChoice({
        hasExistingLogin: false,
        forceRelogin: false,
      }),
    ).toBe(false)
  })
})

describe('qwen onboarding auth precedence cleanup', () => {
  test('clears incompatible provider state when switching to Qwen', () => {
    const env: NodeJS.ProcessEnv = {
      CLAUDE_CODE_USE_GITHUB: '1',
      GITHUB_TOKEN: 'gh-token',
      OPENAI_MODEL: 'github:copilot',
      OPENAI_API_KEY: 'sk-stale-openai-key',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      CODEX_API_KEY: 'stale-codex-key',
      CHATGPT_ACCOUNT_ID: 'acct-old',
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED: '1',
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID: 'profile_old',
    }

    applyQwenOnboardingProcessEnv('coder-model', env)

    expect(env.CLAUDE_CODE_USE_QWEN).toBe('1')
    expect(env.OPENAI_MODEL).toBe('coder-model')
    expect(env.OPENAI_BASE_URL).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.CHATGPT_ACCOUNT_ID).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_GITHUB).toBeUndefined()
    expect(env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED).toBeUndefined()

    const settingsEnv = buildQwenOnboardingSettingsEnv('coder-model')
    expect(settingsEnv.CLAUDE_CODE_USE_QWEN).toBe('1')
    expect(settingsEnv.OPENAI_MODEL).toBe('coder-model')
    expect(settingsEnv.OPENAI_BASE_URL).toBeUndefined()
  })
})

describe('activateQwenOnboardingMode', () => {
  test('activates settings/env in order when merge succeeds', () => {
    const calls: string[] = []

    const result = activateQwenOnboardingMode('  coder-model  ', {
      mergeSettingsEnv: model => {
        calls.push(`merge:${model}`)
        return { ok: true }
      },
      applyProcessEnv: model => {
        calls.push(`apply:${model}`)
      },
      onChangeAPIKey: () => {
        calls.push('onChangeAPIKey')
      },
    })

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([
      'merge:coder-model',
      'apply:coder-model',
      'onChangeAPIKey',
    ])
  })

  test('stops activation when settings merge fails', () => {
    const calls: string[] = []

    const result = activateQwenOnboardingMode('coder-model', {
      mergeSettingsEnv: () => {
        calls.push('merge')
        return { ok: false, detail: 'settings write failed' }
      },
      applyProcessEnv: () => {
        calls.push('apply')
      },
      onChangeAPIKey: () => {
        calls.push('onChangeAPIKey')
      },
    })

    expect(result).toEqual({ ok: false, detail: 'settings write failed' })
    expect(calls).toEqual(['merge'])
  })
})
