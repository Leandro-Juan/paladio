import { test, expect } from '@playwright/experimental-ct-react';
import { ModelSelectorPopover } from '@/components/trip-agent/ModelSelectorPopover';
import { LLMConfigResponse } from '@/utils/api';

test.describe('ModelSelectorPopover Component', () => {
  const mockConfig: LLMConfigResponse = {
    provider: 'google_genai',
    model: 'gemini-3-flash-preview',
    base_url: null,
    has_api_key: true,
    masked_api_key: 'AIza...1234',
    supported_providers: {
      google_genai: {
        name: 'Google Gemini',
        default_base_url: null,
        requires_key: true,
        recommended_models: ['gemini-3-flash-preview', 'gemini-3.8-flash'],
        default_model: 'gemini-3-flash-preview',
      },
      anthropic: {
        name: 'Anthropic Claude',
        default_base_url: null,
        requires_key: true,
        recommended_models: ['claude-3-5-sonnet', 'claude-3-5-haiku'],
        default_model: 'claude-3-5-sonnet',
      },
      openai: {
        name: 'OpenAI',
        default_base_url: null,
        requires_key: true,
        recommended_models: ['gpt-4o', 'gpt-4o-mini'],
        default_model: 'gpt-4o',
      },
    },
    configured_providers: {
      google_genai: {
        provider: 'google_genai',
        name: 'Google Gemini',
        is_active: true,
        active_model: 'gemini-3-flash-preview',
        available_models: ['gemini-3-flash-preview', 'gemini-3.8-flash'],
        masked_key: 'AIza...1234',
        requires_key: true,
      },
      anthropic: {
        provider: 'anthropic',
        name: 'Anthropic Claude',
        is_active: false,
        active_model: 'claude-3-5-sonnet',
        available_models: ['claude-3-5-sonnet', 'claude-3-5-haiku'],
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
        currentProvider="google_genai"
        currentModel="gemini-3-flash-preview"
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
    await expect(component.getByText('Anthropic Claude')).toBeVisible();

    // Verify unconfigured providers (e.g. OpenAI) are not shown
    await expect(component.getByText('OpenAI')).not.toBeVisible();

    // Verify no Basic or Advanced section headings
    await expect(component.getByText(/^BASIC$/i)).not.toBeVisible();
    await expect(component.getByText(/^ADVANCED$/i)).not.toBeVisible();

    // Verify models are displayed
    await expect(component.getByText('gemini-3-flash-preview')).toBeVisible();
    await expect(component.getByText('gemini-3.8-flash')).toBeVisible();
    await expect(component.getByText('claude-3-5-sonnet')).toBeVisible();

    // Search for claude models
    await searchInput.fill('claude');
    await expect(component.getByText('claude-3-5-sonnet')).toBeVisible();
    await expect(component.getByText('gemini-3-flash-preview')).not.toBeVisible();

    // Click claude model
    await component.getByText('claude-3-5-sonnet').click();
    expect(selectedProvider).toBe('anthropic');
    expect(selectedModel).toBe('claude-3-5-sonnet');
  });
});
