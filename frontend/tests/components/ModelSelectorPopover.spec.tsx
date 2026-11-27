import { test, expect } from '@playwright/experimental-ct-react';
import { ModelSelectorPopover } from '@/components/trip-agent/ModelSelectorPopover';
import { LLMConfigResponse } from '@/utils/api';

test.describe('ModelSelectorPopover Component', () => {
  const mockConfig: LLMConfigResponse = {
    provider: 'google',
    model: 'gemini-3.8-flash',
    base_url: null,
    has_api_key: true,
    masked_api_key: 'AIza...1234',
    supported_providers: {
      google: {
        name: 'Google Gemini',
        default_base_url: 'https://generativelanguage.googleapis.com',
        requires_key: true,
        recommended_models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
        default_model: 'gemini-3.8-flash',
      },
      anthropic: {
        name: 'Anthropic (Claude)',
        default_base_url: 'https://api.anthropic.com',
        requires_key: true,
        recommended_models: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
        default_model: 'claude-sonnet-5-5',
      },
      openai: {
        name: 'OpenAI',
        default_base_url: 'https://api.openai.com/v1',
        requires_key: true,
        recommended_models: ['gpt-6.2-sol', 'gpt-6-luna'],
        default_model: 'gpt-6.2-sol',
      },
    },
    configured_providers: {
      google: {
        provider: 'google',
        name: 'Google Gemini',
        is_active: true,
        active_model: 'gemini-3.8-flash',
        available_models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
        masked_key: 'AIza...1234',
        requires_key: true,
      },
      anthropic: {
        provider: 'anthropic',
        name: 'Anthropic (Claude)',
        is_active: false,
        active_model: 'claude-sonnet-5-5',
        available_models: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
        masked_key: 'sk-ant...5678',
        requires_key: true,
      },
    },
  };

  test('renders families, brand icons, and filters via search without basic/advanced tiers', async ({ mount }) => {
    let selectedProvider = '';
    let selectedModel = '';

    const component = await mount(
      <ModelSelectorPopover
        isOpen={true}
        onClose={() => {}}
        llmConfig={mockConfig}
        currentProvider="google"
        currentModel="gemini-3.8-flash"
        onSelectModel={(prov, model) => {
          selectedProvider = prov;
          selectedModel = model;
        }}
      />
    );

    // Verify search input is present
    const searchInput = component.getByPlaceholder('Search models...');
    await expect(searchInput).toBeVisible();

    // Verify family headers for available providers
    await expect(component.getByText('Google Gemini')).toBeVisible();
    await expect(component.getByText('Anthropic (Claude)')).toBeVisible();

    // Verify unconfigured providers (e.g. OpenAI) are not shown
    await expect(component.getByText('OpenAI')).not.toBeVisible();

    // Verify no Basic or Advanced section headings
    await expect(component.getByText(/^BASIC$/i)).not.toBeVisible();
    await expect(component.getByText(/^ADVANCED$/i)).not.toBeVisible();

    // Verify models are displayed
    await expect(component.getByText('gemini-3.8-flash')).toBeVisible();
    await expect(component.getByText('gemini-3.5-flash-lite')).toBeVisible();
    await expect(component.getByText('claude-sonnet-5-5')).toBeVisible();

    // Search for claude models
    await searchInput.fill('claude');
    await expect(component.getByText('claude-sonnet-5-5')).toBeVisible();
    await expect(component.getByText('gemini-3.8-flash')).not.toBeVisible();

    // Click claude model
    await component.getByText('claude-sonnet-5-5').click();
    expect(selectedProvider).toBe('anthropic');
    expect(selectedModel).toBe('claude-sonnet-5-5');
  });
});
