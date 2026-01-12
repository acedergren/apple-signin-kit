/**
 * SvelteKit app type definitions
 *
 * These augment the SvelteKit types to include auth locals.
 * Consuming applications should extend these in their own app.d.ts.
 */

import type { AuthUser, ApiClient } from './lib/types.js';

declare global {
  namespace App {
    interface Locals {
      /** Current authenticated user or null */
      user: AuthUser | null;
      /** API client instance for making authenticated requests */
      api: ApiClient;
    }

    interface PageData {
      /** Current user passed from layout */
      user?: AuthUser | null;
    }

    // interface Error {}
    // interface Platform {}
  }
}

export {};
