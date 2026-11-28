import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and conditions',
  description:
    'The terms that govern your use of GTour: accounts, bookings, payments, cancellations and provider obligations.',
};

const SECTIONS = [
  {
    title: '1. Using GTour',
    paragraphs: [
      'GTour is a tourism platform for Bangladesh. It lets travellers discover destinations, stays, photographers and vehicles, and lets vetted providers list and manage what they offer.',
      'By creating an account or making a booking you accept these terms. If you do not agree with them, do not use the platform.',
    ],
  },
  {
    title: '2. Accounts',
    paragraphs: [
      'You must give accurate registration details and keep your password confidential. You are responsible for everything done through your account.',
      'Provider accounts are reviewed before a listing becomes visible. GTour may suspend an account that breaches these terms or publishes misleading information.',
    ],
  },
  {
    title: '3. Bookings and pricing',
    paragraphs: [
      'A booking is a request until the provider confirms it. Prices, availability and booking totals are calculated by GTour at the moment of booking and are stored with the booking, so the price you were quoted is the price you pay.',
      'Availability is re-checked on the server when a booking is placed. A provider cannot charge more than the confirmed total.',
    ],
  },
  {
    title: '4. Payments',
    paragraphs: [
      'Card payments are handled entirely on the payment gateway\u2019s own secure pages. GTour never receives or stores your card details.',
      'Depending on the property, payment is either collected online at checkout or taken directly by the provider. The payment policy that applies to your booking is always shown before you pay.',
      'GTour records a payment reference, amount and status for each booking so both you and the provider can see what has been settled.',
    ],
  },
  {
    title: '5. Cancellations and refunds',
    paragraphs: [
      'Cancellation conditions are set per listing and shown before you book. Where a refund is due, it is issued against the original payment and appears in your payment history.',
      'Refunds are issued by GTour support or by the provider that took the payment.',
    ],
  },
  {
    title: '6. Provider obligations',
    paragraphs: [
      'Providers must describe their property, service or vehicle accurately, keep availability and pricing up to date, and honour confirmed bookings.',
      'Providers may only manage the listings they own and may only see the booking details needed to host a guest.',
    ],
  },
  {
    title: '7. Acceptable use',
    paragraphs: [
      'Do not misuse the platform: no fraudulent bookings, no scraping, no attempts to bypass authentication, authorization or pricing, and no upload of content you do not have the right to share.',
      'Listings, photos and reviews you upload must be your own or properly licensed.',
    ],
  },
  {
    title: '8. Availability and liability',
    paragraphs: [
      'GTour works to keep the platform available and accurate but does not warrant uninterrupted service. GTour is not a party to the agreement between a traveller and a provider.',
      'To the extent permitted by law, GTour is not liable for indirect losses arising from a stay, shoot or rental arranged through the platform.',
    ],
  },
  {
    title: '9. Changes to these terms',
    paragraphs: [
      'These terms may be updated as the platform changes. Material changes will be announced in the app before they take effect.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:pt-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-400">
        <Link href="/" className="transition-colors hover:text-sea-700">
          Home
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span className="text-ink-600">Terms</span>
      </nav>

      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sea-700">Legal</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink-900">
        Terms and conditions
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
        These terms cover accounts, bookings, payments and cancellations on GTour, and the
        obligations that apply to travellers and providers alike.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-lg font-semibold text-ink-900">{section.title}</h2>
            <div className="mt-2 space-y-2.5">
              {section.paragraphs.map((text) => (
                <p key={text} className="text-sm leading-relaxed text-ink-600">
                  {text}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-panel border border-ink-100/70 bg-sand-50 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">10. Contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Questions about a booking, a refund or these terms? Reach the team from your dashboard,
            or read how we handle data in our{' '}
            <Link href="/privacy" className="font-semibold text-sea-700 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
