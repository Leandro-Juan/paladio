import { test, expect } from '@playwright/test';
import { capitalizeText } from '../../src/utils';

test.describe('capitalizeText', () => {
  test('capitalizes the first letter of a word', () => {
    expect(capitalizeText('paladio')).toBe('Paladio');
  });

  test('handles empty strings', () => {
    expect(capitalizeText('')).toBe('');
  });

  test('handles already capitalized strings', () => {
    expect(capitalizeText('Hello')).toBe('Hello');
  });
});
