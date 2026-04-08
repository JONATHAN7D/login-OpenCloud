import { describe, expect, test } from 'bun:test'

import {
  activateChatGPTOnboardingMode,
  applyChatGPTOnboardingProcessEnv,
  buildChatGPTOnboardingSettingsEnv,
  hasExistingChatGPTLogin,
  shouldForceChatGPTRelogin,
} from './onboard-chatgpt.js'

describe('shouldForceChatGPTRelogin', () => {
  test.each(['force', '--force', 'relogin', '--relogin', 'reauth', '--reauth'])(
    'treats %s as force re-login',
    arg => {
      expect(shouldForceChatGPTRelogin(arg)).toBe(true)
    },
  )

  test('returns false for empty or unknown args', () => {
    expect(shouldForceChatGPTRelogin('')).toBe(false)
    expect(shouldForceChatGPTRelogin(undefined)).toBe(false)
    expect(shouldForceChatGPTRelogin('something-else')).toBe(false)
  })
})

describe('hasExistingChatGPTLogin', () => {
  test('returns true when CODEX_API_KEY and account are present', () => {
    expect(
      hasExistingChatGPTLogin({
        CODEX_API_KEY: 'header.eyJjaGF0Z3B0X2FjY291bnRfaWQiOiJhY2N0LTEyMyJ9.sig',
      }),
    ).toBe(true)
  })

  test('returns false when account id is missing', () => {
    expect(hasExistingChatGPTLogin({ CODEX_API_KEY: 'token-without-account' })).toBe(false)
  })
})

describe('chatgpt onboarding auth precedence cleanup', () => {
  test('clears incompatible provider state when switching to Codex', () => {
    const env: NodeJS.ProcessEnv = {
      CLAUDE_CODE_USE_GITHUB: '1',
      GITHUB_TOKEN: 'gh-token',
      OPENAI_MODEL: 'github:copilot',
      OPENAI_API_KEY: 'sk-stale-openai-key',
      CODEX_API_KEY: 'stale-codex-key',
      CHATGPT_ACCOUNT_ID: 'acct-old',
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED: '1',
      CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID: 'profile_old',
    }

    applyChatGPTOnboardingProcessEnv('codexplan', env)

    expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(env.OPENAI_BASE_URL).toBe('https://chatgpt.com/backend-api/codex')
    expect(env.OPENAI_MODEL).toBe('codexplan')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.CHATGPT_ACCOUNT_ID).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_GITHUB).toBeUndefined()
    expect(env.CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED).toBeUndefined()

    const settingsEnv = buildChatGPTOnboardingSettingsEnv('codexplan')
    expect(settingsEnv.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(settingsEnv.OPENAI_BASE_URL).toBe('https://chatgpt.com/backend-api/codex')
    expect(settingsEnv.OPENAI_MODEL).toBe('codexplan')
    expect(settingsEnv.CODEX_API_KEY).toBeUndefined()
  })
})

describe('activateChatGPTOnboardingMode', () => {
  test('activates settings/env in order when merge succeeds', () => {
    const calls: string[] = []

    const result = activateChatGPTOnboardingMode('  codexplan  ', {
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
      'merge:codexplan',
      'apply:codexplan',
      'onChangeAPIKey',
    ])
  })

  test('stops activation when settings merge fails', () => {
    const calls: string[] = []

    const result = activateChatGPTOnboardingMode('codexplan', {
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
