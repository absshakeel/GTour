import { GatewayProvider } from '@gtour/shared-types';
import { ApiError } from '../../utils/ApiError';
import { activeProvider } from '../../config/sslcommerz';
import type { PaymentProvider } from './provider';
import { sslcommerzProvider } from './sslcommerz.provider';

/**
 * Marks a provider the platform has decided to support but not implement yet.
 * Calling it fails loudly instead of silently pretending a payment succeeded.
 */
class NotImplementedProvider implements PaymentProvider {
  constructor(readonly name: GatewayProvider) {}

  private refuse(): never {
    throw new ApiError(
      `${this.name} is not implemented yet`,
      501,
      'PROVIDER_NOT_IMPLEMENTED',
    );
  }

  async createCheckout(): Promise<never> {
    return this.refuse();
  }

  async validate(): Promise<never> {
    return this.refuse();
  }

  async refund(): Promise<never> {
    return this.refuse();
  }

  async queryRefund(): Promise<never> {
    return this.refuse();
  }
}

const providers = new Map<GatewayProvider, PaymentProvider>([
  [GatewayProvider.SSLCOMMERZ, sslcommerzProvider],
  // Declared for the roadmap. Interface stubs only — there is no Stripe or
  // PayPal account behind these, so they must not be selectable at runtime.
  [GatewayProvider.STRIPE, new NotImplementedProvider(GatewayProvider.STRIPE)],
  [GatewayProvider.PAYPAL, new NotImplementedProvider(GatewayProvider.PAYPAL)],
]);

/** Providers a customer may actually check out with. */
export const supportedProviders: GatewayProvider[] = [GatewayProvider.SSLCOMMERZ];

export function getProvider(name: GatewayProvider): PaymentProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new ApiError(`Unknown payment provider: ${name}`, 400, 'UNKNOWN_PROVIDER');
  }
  return provider;
}

/** The provider new checkouts should use, based on what is configured. */
export function defaultProvider(): PaymentProvider {
  return getProvider(activeProvider());
}
