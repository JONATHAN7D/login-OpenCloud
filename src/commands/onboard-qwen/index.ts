import type { Command } from '../../commands.js'

const onboardQwen: Command = {
  name: 'onboard-qwen',
  aliases: ['qwen-login', 'qwen-auth', 'onboarding-qwen', 'onboardqwen'],
  description:
    'Interactive setup for Qwen OAuth via browser using the official qwen CLI',
  type: 'local-jsx',
  load: () => import('./onboard-qwen.js'),
}

export default onboardQwen
