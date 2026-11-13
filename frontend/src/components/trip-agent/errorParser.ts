import { AgentErrorCategory, AgentErrorInfo } from './types/agent';

/**
 * Extracts a numeric HTTP status code from raw error strings or payloads.
 */
function extractStatusCode(text: string): number | undefined {
  const explicitMatch = text.match(/(?:status_code|status|code)[:=\s]+["']?(\d{3})["']?/i);
  if (explicitMatch) {
    const code = parseInt(explicitMatch[1], 10);
    if (!isNaN(code)) return code;
  }

  const standaloneMatch = text.match(/\b(401|403|404|408|413|422|429|500|502|503|504)\b/);
  if (standaloneMatch) {
    const code = parseInt(standaloneMatch[1], 10);
    if (!isNaN(code)) return code;
  }

  return undefined;
}

/**
 * Extracts model name from raw error strings or payloads.
 */
function extractModelName(text: string): string | undefined {
  const modelMatch = text.match(/(?:model_name|model)[:=\s]+["']?([a-zA-Z0-9_\-\.\/]+)["']?/i);
  if (modelMatch && modelMatch[1]) {
    return modelMatch[1].replace(/["',]/g, '').trim();
  }
  return undefined;
}

/**
 * Sanitizes and extracts the most relevant error message text.
 */
function extractCleanMessage(text: string): string {
  // Try extracting from {'message': '...'} or {"message": "..."}
  const bodyMatch = text.match(/['"]message['"]:\s*['"]([^'"]+)['"]/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim();
  }

  // Strip leading warning symbols or prefixes if any
  let cleaned = text.replace(/^[⚠️!❌🚨\s]+/, '').trim();
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 197) + '...';
  }
  return cleaned || 'Operation failed';
}

/**
 * Parses and classifies raw error messages or backend error codes into a structured AgentErrorInfo.
 */
export function parseAgentError(rawMessage?: string, code?: string): AgentErrorInfo {
  const raw = (rawMessage || '').trim();
  const rawLower = raw.toLowerCase();
  const statusCode = extractStatusCode(raw);
  const modelName = extractModelName(raw);
  const cleanMsg = extractCleanMessage(raw);

  // 1. Access Denied / VPN / WAF Block
  if (
    statusCode === 403 ||
    code === 'ACCESS_DENIED' ||
    rawLower.includes('access denied') ||
    rawLower.includes('network settings') ||
    rawLower.includes('cloudflare') ||
    rawLower.includes('forbidden')
  ) {
    return {
      category: 'access_denied',
      title: 'Provider Access Denied',
      description:
        'The model provider rejected this request. This is typically caused by an active VPN, proxy, or datacenter IP blocked by security firewalls.',
      statusCode: statusCode || 403,
      modelName,
      code: code || 'ACCESS_DENIED',
      rawMessage: raw || cleanMsg,
      suggestedFix: 'Disconnect from your VPN or switch to an alternate model provider.',
      canRetry: true,
      canSwitchModel: true,
    };
  }

  // 2. Authentication Failure
  if (
    statusCode === 401 ||
    code === 'AUTH_FAILED' ||
    rawLower.includes('unauthorized') ||
    rawLower.includes('invalid api key') ||
    rawLower.includes('incorrect api key') ||
    rawLower.includes('api key not found')
  ) {
    return {
      category: 'auth_failure',
      title: 'Authentication Failed',
      description:
        'The API key for the selected provider is invalid, expired, or missing.',
      statusCode: statusCode || 401,
      modelName,
      code: code || 'AUTH_FAILED',
      rawMessage: raw || cleanMsg,
      suggestedFix: 'Verify your API key in Configuration or switch to another provider.',
      canRetry: false,
      canSwitchModel: true,
    };
  }

  // 3. Rate Limit / Quota Exceeded
  if (
    statusCode === 429 ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    rawLower.includes('rate limit') ||
    rawLower.includes('ratelimit') ||
    rawLower.includes('tpm') ||
    rawLower.includes('rpm') ||
    rawLower.includes('quota') ||
    rawLower.includes('insufficient_quota') ||
    rawLower.includes('credits')
  ) {
    return {
      category: 'rate_limit',
      title: 'Rate Limit Exceeded',
      description:
        'The provider request limit or token quota has been temporarily reached.',
      statusCode: statusCode || 429,
      modelName,
      code: code || 'RATE_LIMIT_EXCEEDED',
      rawMessage: raw || cleanMsg,
      suggestedFix: 'Wait a few moments before retrying, or switch to a provider with higher limits.',
      canRetry: true,
      canSwitchModel: true,
    };
  }

  // 4. Context Window / Maximum Length Exceeded
  if (
    statusCode === 413 ||
    code === 'CONTEXT_OVERFLOW' ||
    rawLower.includes('context length') ||
    rawLower.includes('maximum context') ||
    rawLower.includes('too many tokens') ||
    rawLower.includes('prompt is too long')
  ) {
    return {
      category: 'context_overflow',
      title: 'Context Window Exceeded',
      description:
        'The conversation history and trip itinerary exceed the context window of this model.',
      statusCode: statusCode || 413,
      modelName,
      code: code || 'CONTEXT_OVERFLOW',
      rawMessage: raw || cleanMsg,
      suggestedFix: 'Clear chat history or switch to a model with a larger context window.',
      canRetry: false,
      canSwitchModel: true,
    };
  }

  // 5. Connection Error / Timeout
  if (
    statusCode === 504 ||
    statusCode === 502 ||
    rawLower.includes('timed out') ||
    rawLower.includes('timeout') ||
    rawLower.includes('connection refused') ||
    rawLower.includes('econnrefused') ||
    rawLower.includes('unreachable') ||
    rawLower.includes('network error')
  ) {
    return {
      category: 'connection_error',
      title: 'Connection Interrupted',
      description:
        'Unable to establish a connection to the model server or local runner endpoint.',
      statusCode: statusCode || 504,
      modelName,
      code: code || 'TIMEOUT',
      rawMessage: raw || cleanMsg,
      suggestedFix: 'Check your internet connection and retry.',
      canRetry: true,
      canSwitchModel: true,
    };
  }

  // 6. Generic Internal Fallback
  return {
    category: 'internal',
    title: 'Agent Execution Error',
    description: cleanMsg || 'An unexpected error occurred while executing the turn.',
    statusCode,
    modelName,
    code: code || 'INTERNAL_ERROR',
    rawMessage: raw || cleanMsg,
    suggestedFix: 'Inspect technical diagnostics below or retry your request.',
    canRetry: true,
    canSwitchModel: true,
  };
}
