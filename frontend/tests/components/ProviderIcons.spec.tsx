import { test, expect } from '@playwright/experimental-ct-react';
import { getProviderBrandColor } from '../../src/components/ProviderIcons';

test.describe('ProviderBrandIcon Component', () => {
  test('resolves signature brand colors for all 13 providers accurately', () => {
    expect(getProviderBrandColor('openai')).toBe('#10A37F');
    expect(getProviderBrandColor('anthropic')).toBe('#D97706');
    expect(getProviderBrandColor('google')).toBe('#5185EC');
    expect(getProviderBrandColor('groq')).toBe('#F55036');
    expect(getProviderBrandColor('deepseek')).toBe('#1E60F6');
    expect(getProviderBrandColor('mistral')).toBe('#FD5A24');
    expect(getProviderBrandColor('openrouter')).toBe('#6366F1');
    expect(getProviderBrandColor('xai')).toBe('#111827');
    expect(getProviderBrandColor('perplexity')).toBe('#20B8CD');
    expect(getProviderBrandColor('together')).toBe('#0F6FFF');
    expect(getProviderBrandColor('cerebras')).toBe('#FF6B4A');
    expect(getProviderBrandColor('ollama')).toBe('#0F4C5C');
    expect(getProviderBrandColor('custom_openai')).toBe('#0D9488');
    expect(getProviderBrandColor('unknown')).toBe('#0D9488');
  });
});

