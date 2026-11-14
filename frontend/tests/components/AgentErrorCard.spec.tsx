import { test, expect } from '@playwright/experimental-ct-react';
import { AgentErrorCard } from '@/components/trip-agent/AgentErrorCard';
import { parseAgentError } from '@/components/trip-agent/errorParser';

test.describe('AgentErrorCard and errorParser', () => {
  const groq403Raw =
    "status_code: 403, model_name: openai/gpt-oss-120b, body: {'message': 'Access denied. Please check your network settings.'}";

  test('parses Groq 403 error correctly', () => {
    const parsed = parseAgentError(groq403Raw);
    expect(parsed.category).toBe('access_denied');
    expect(parsed.statusCode).toBe(403);
    expect(parsed.modelName).toBe('openai/gpt-oss-120b');
    expect(parsed.title).toBe('Provider Access Denied');
    expect(parsed.canRetry).toBe(true);
    expect(parsed.canSwitchModel).toBe(true);
    expect(parsed.suggestedFix).toContain('VPN');
  });

  test('parses rate limit and auth errors correctly', () => {
    const rateLimit = parseAgentError('Rate limit reached: 429 TPM quota exhausted', 'RATE_LIMIT_EXCEEDED');
    expect(rateLimit.category).toBe('rate_limit');
    expect(rateLimit.statusCode).toBe(429);
    expect(rateLimit.title).toBe('Rate Limit Exceeded');

    const authErr = parseAgentError('Error: 401 Unauthorized - invalid api key');
    expect(authErr.category).toBe('auth_failure');
    expect(authErr.statusCode).toBe(401);
    expect(authErr.title).toBe('Authentication Failed');
  });

  test('parses error with nested quotes without truncating message', () => {
    const raw =
      'status_code: 400, model_name: openai/gpt-oss-120b, body: {\'message\': "property \'keep_alive\' is unsupported", \'type\': \'invalid_request_error\'}';
    const parsed = parseAgentError(raw);
    expect(parsed.statusCode).toBe(400);
    expect(parsed.modelName).toBe('openai/gpt-oss-120b');
    expect(parsed.description).toBe("property 'keep_alive' is unsupported");
  });

  test('renders AgentErrorCard without any emojis and triggers actions', async ({ mount }) => {
    let switched = false;
    let retried = false;

    const error = parseAgentError(groq403Raw);
    const component = await mount(
      <AgentErrorCard
        error={error}
        onSwitchModel={() => {
          switched = true;
        }}
        onRetry={() => {
          retried = true;
        }}
      />
    );

    // Verify title and badges
    await expect(component.getByText('Provider Access Denied')).toBeVisible();
    await expect(component.getByText('HTTP 403')).toBeVisible();
    await expect(component.getByText('openai/gpt-oss-120b', { exact: true })).toBeVisible();

    // Verify strictly NO emojis in rendered text
    const allText = await component.innerText();
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(allText).not.toMatch(emojiRegex);

    // Verify switch model action
    const switchBtn = component.getByTestId('error-switch-model-btn');
    await expect(switchBtn).toBeVisible();
    await switchBtn.click();
    expect(switched).toBe(true);

    // Verify retry action
    const retryBtn = component.getByTestId('error-retry-btn');
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();
    expect(retried).toBe(true);
  });
});
