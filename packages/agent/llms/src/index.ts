import { OpenAIClient } from './OpenAIClient'
import { DEFAULT_TEMPERATURE, LLM_MAX_RETRIES } from './constants'
import { InvokeError, InvokeErrorType } from './errors'
import type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool } from './types'

export { InvokeError, InvokeErrorType }
export type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool }

export function parseLLMConfig(config: LLMConfig): Required<LLMConfig> {
	// Runtime validation as defensive programming (types already guarantee these)
	if (!config.baseURL || !config.model) {
		throw new Error(
			'[PropAI Agent] LLM configuration required. Please provide: baseURL, model. ' +
				'See: https://propai-sync.ai/docs/models'
		)
	}

	return {
		baseURL: config.baseURL,
		model: config.model,
		apiKey: config.apiKey || '',
		temperature: config.temperature ?? DEFAULT_TEMPERATURE,
		maxRetries: config.maxRetries ?? LLM_MAX_RETRIES,
		disableNamedToolChoice: config.disableNamedToolChoice ?? false,
		customFetch: (config.customFetch ?? fetch).bind(globalThis), // fetch will be illegal unless bound
	}
}

export class LLM extends EventTarget {
	config: Required<LLMConfig>
	client: LLMClient

	constructor(config: LLMConfig) {
		super()
		this.config = parseLLMConfig(config)

		// Default to OpenAI client
		this.client = new OpenAIClient(this.config)
	}

	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		return await withRetry(
			async () => {
				if (abortSignal.aborted) throw new Error('AbortError')

				try {
					// Try primary model (Local Ollama if configured)
					return await this.client.invoke(messages, tools, abortSignal, options)
				} catch (error) {
					// Fallback chain: Local -> Groq -> Claude
					console.error(`Primary model ${this.config.model} failed, trying fallback chain...`, error);
					
					const fallbacks = [
						{ baseURL: 'https://api.groq.com/openai/v1', model: 'llama3-8b-8192', apiKey: process.env.GROQ_API_KEY },
						{ baseURL: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet', apiKey: process.env.CLAUDE_API_KEY }
					];

					for (const fb of fallbacks) {
						try {
							const fallbackClient = new OpenAIClient({ 
								baseURL: fb.baseURL!, 
								model: fb.model!, 
								apiKey: fb.apiKey || '' 
							});
							return await fallbackClient.invoke(messages, tools, abortSignal, options);
						} catch (fbError) {
							console.error(`Fallback to ${fb.model} failed`, fbError);
						}
					}
					throw error;
				}
			},
			{
				maxRetries: this.config.maxRetries,
				onRetry: (attempt: number) => {
					this.dispatchEvent(
						new CustomEvent('retry', { detail: { attempt, maxAttempts: this.config.maxRetries } })
					)
				},
				onError: (error: Error) => {
					this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
				},
			}
		)
	}
}

async function withRetry<T>(
	fn: () => Promise<T>,
	settings: {
		maxRetries: number
		onRetry: (attempt: number) => void
		onError: (error: Error) => void
	}
): Promise<T> {
	let attempt = 0
	let lastError: Error | null = null
	while (attempt <= settings.maxRetries) {
		if (attempt > 0) {
			settings.onRetry(attempt)
			await new Promise((resolve) => setTimeout(resolve, 100))
		}

		try {
			return await fn()
		} catch (error: unknown) {
			if ((error as any)?.rawError?.name === 'AbortError') throw error
			console.error(error)
			settings.onError(error as Error)
			if (error instanceof InvokeError && !error.retryable) throw error
			lastError = error as Error
			attempt++
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	throw lastError!
}
