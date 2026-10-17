import type { AgentAnswer, AgentStatus, VaultItem } from '../shared/types'
import { contextForItem } from './preview'
import { VaultService } from './vault'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const MAX_CONTEXT_CHARACTERS = 90_000
const ollama = createOpenAICompatible({ name: 'ollama-local', baseURL: `${OLLAMA_BASE}/v1` })

export async function getAgentStatus(service: VaultService): Promise<AgentStatus> {
  const settings = await service.getSettings()
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2_000) })
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
    const data = await response.json() as { models?: Array<{ name?: string; model?: string }> }
    const models = (data.models ?? []).map((model) => model.name ?? model.model ?? '').filter(Boolean)
    return {
      available: true,
      models,
      activeModel: settings.agentModel,
      message: models.includes(settings.agentModel) ? 'Local agent ready' : `Model “${settings.agentModel}” is not installed`
    }
  } catch {
    return { available: false, models: [], activeModel: settings.agentModel, message: 'Ollama is not running on this computer' }
  }
}

export async function askLocalAgent(service: VaultService, question: string, focusedIds: string[] = []): Promise<AgentAnswer> {
  const cleanQuestion = question.trim()
  if (!cleanQuestion) throw new Error('Ask a question first')
  const settings = await service.getSettings()
  const snapshot = await service.snapshot()
  const focus = new Set(focusedIds)
  const ordered = [...snapshot.items].sort((a, b) => Number(focus.has(b.id)) - Number(focus.has(a.id)))
  const contexts: string[] = []
  const sources: VaultItem[] = []
  let characters = 0
  for (const item of ordered) {
    const context = await contextForItem(service, item)
    if (characters + context.length > MAX_CONTEXT_CHARACTERS && contexts.length) break
    contexts.push(context)
    sources.push(item)
    characters += context.length
  }
  const instructions = [
    'You are TempVault Agent, a private file analyst running entirely on the user\'s computer.',
    'Answer only from the provided vault context. Say clearly when the files do not contain the answer.',
    'Cite supporting files inline using [filename]. Do not claim to have read binary content when only metadata is provided.',
    focusedIds.length ? 'The user has selected some files. Prioritize those files, but use the entire supplied vault context when useful.' : ''
  ].filter(Boolean).join(' ')
  const prompt = [
    `QUESTION:\n${cleanQuestion}`,
    `VAULT CONTEXT (${sources.length} files):\n${contexts.join('\n\n---\n\n')}`
  ].filter(Boolean).join('\n\n')

  try {
    const { text } = await generateText({
      model: ollama(settings.agentModel),
      instructions,
      prompt,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(120_000)
    })
    return {
      answer: text.trim() || 'The local model returned an empty answer.',
      sources: sources.map((item) => ({ id: item.id, name: item.name })),
      model: settings.agentModel
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`The Vercel AI SDK could not reach the local Ollama model. Start “ollama serve” and verify “${settings.agentModel}” is installed. ${detail}`)
  }
}
