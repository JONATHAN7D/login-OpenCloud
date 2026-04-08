import type { Command } from '../../commands.js'

const onboardChatGPT: Command = {
  name: 'onboard-chatgpt',
  aliases: [
    'chatgpt-login',
    'chatgpt-auth',
    'onboarding-chatgpt',
    'onboardchatgpt',
  ],
  description:
    'Interactive setup for ChatGPT Codex auth via browser using the Codex CLI',
  type: 'local-jsx',
  load: () => import('./onboard-chatgpt.js'),
}

export default onboardChatGPT
