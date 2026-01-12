<script lang="ts">
/**
 * Apple Sign-In Button Component
 *
 * A fully-styled, accessible button for initiating Apple Sign-In.
 * Follows Apple's Human Interface Guidelines for Sign in with Apple buttons.
 *
 * Basic usage:
 *   import AppleSignInButton from this package and use as <AppleSignInButton />
 *
 * Custom styling options:
 *   - variant: 'black' | 'white' | 'outline' (default: 'black')
 *   - size: 'small' | 'medium' | 'large' (default: 'medium')
 *   - fullWidth: boolean (default: false)
 *   - label: string (default: 'Sign in with Apple')
 */

import type { AppleSignInButtonProps } from '../types.js';
import { signInWithApple, getIsLoading } from '../stores.js';

// ============================================================================
// Props (Svelte 5 runes)
// ============================================================================

let {
  variant = 'black',
  size = 'medium',
  label = 'Sign in with Apple',
  showLogo = true,
  fullWidth = false,
  disabled = false,
  returnTo,
  onClick,
  class: className = ''
}: AppleSignInButtonProps = $props();

// ============================================================================
// Derived State
// ============================================================================

const isLoading = $derived(getIsLoading());
const isDisabled = $derived(disabled || isLoading);

// ============================================================================
// Size Classes
// ============================================================================

const sizeClasses = {
  small: 'apple-btn-small',
  medium: 'apple-btn-medium',
  large: 'apple-btn-large'
} as const;

const sizeClass = $derived(sizeClasses[size]);

// ============================================================================
// Variant Classes
// ============================================================================

const variantClasses = {
  black: 'apple-btn-black',
  white: 'apple-btn-white',
  outline: 'apple-btn-outline'
} as const;

const variantClass = $derived(variantClasses[variant]);

// ============================================================================
// Event Handlers
// ============================================================================

async function handleClick() {
  if (isDisabled) return;

  if (onClick) {
    await onClick();
  } else {
    signInWithApple(returnTo);
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleClick();
  }
}
</script>

<button
  type="button"
  class="apple-btn {sizeClass} {variantClass} {fullWidth ? 'apple-btn-full' : ''} {className}"
  disabled={isDisabled}
  aria-label={label}
  aria-busy={isLoading}
  onclick={handleClick}
  onkeydown={handleKeyDown}
>
  {#if isLoading}
    <span class="apple-btn-spinner" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </span>
  {:else if showLogo}
    <span class="apple-btn-logo" aria-hidden="true">
      <!-- Apple Logo SVG -->
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
    </span>
  {/if}
  <span class="apple-btn-text">{label}</span>
</button>

<style>
  /* ========================================================================
   * Base Button Styles
   * ======================================================================== */

  .apple-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .apple-btn:focus-visible {
    outline: 2px solid #0071e3;
    outline-offset: 2px;
  }

  .apple-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* ========================================================================
   * Size Variants
   * ======================================================================== */

  .apple-btn-small {
    height: 36px;
    padding: 0 12px;
    font-size: 14px;
  }

  .apple-btn-small .apple-btn-logo svg,
  .apple-btn-small .apple-btn-spinner svg {
    width: 16px;
    height: 16px;
  }

  .apple-btn-medium {
    height: 44px;
    padding: 0 16px;
    font-size: 16px;
  }

  .apple-btn-medium .apple-btn-logo svg,
  .apple-btn-medium .apple-btn-spinner svg {
    width: 20px;
    height: 20px;
  }

  .apple-btn-large {
    height: 52px;
    padding: 0 20px;
    font-size: 18px;
  }

  .apple-btn-large .apple-btn-logo svg,
  .apple-btn-large .apple-btn-spinner svg {
    width: 24px;
    height: 24px;
  }

  /* ========================================================================
   * Color Variants
   * ======================================================================== */

  .apple-btn-black {
    background-color: #000;
    color: #fff;
  }

  .apple-btn-black:hover:not(:disabled) {
    background-color: #1a1a1a;
  }

  .apple-btn-black:active:not(:disabled) {
    background-color: #333;
  }

  .apple-btn-white {
    background-color: #fff;
    color: #000;
    border: 1px solid #000;
  }

  .apple-btn-white:hover:not(:disabled) {
    background-color: #f5f5f5;
  }

  .apple-btn-white:active:not(:disabled) {
    background-color: #e5e5e5;
  }

  .apple-btn-outline {
    background-color: transparent;
    color: #000;
    border: 1px solid #000;
  }

  .apple-btn-outline:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .apple-btn-outline:active:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.1);
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .apple-btn-outline {
      color: #fff;
      border-color: #fff;
    }

    .apple-btn-outline:hover:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .apple-btn-outline:active:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  /* ========================================================================
   * Full Width
   * ======================================================================== */

  .apple-btn-full {
    width: 100%;
  }

  /* ========================================================================
   * Logo & Spinner
   * ======================================================================== */

  .apple-btn-logo,
  .apple-btn-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .apple-btn-spinner svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* ========================================================================
   * Text
   * ======================================================================== */

  .apple-btn-text {
    flex-shrink: 0;
  }
</style>
