import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What GTour collects, why it is collected, who can see it, and how long booking and payment records are kept.',
};

const SECTIONS = [
  {
    title: '1. What we collect',
    paragraphs: [
      'Account details: your name, email address, password hash and the role you registered with (traveller, hotel owner, photographer or vehicle provider).',
      'Booking details: the property, photography package or vehicle you booked, the dates, guest count and any special requests you write.',
      'Payment records: the reference, amount, currency and status of each payment the gateway reports. Card numbers are never sent to GTour.',
    ],
  },
  {
    title: '2. Why we collect it',
    paragraphs: [
      'To create your account, confirm your bookings, show your trip history and receipts, and let the provider you booked with prepare for your stay, shoot or rental.',
      'To keep the platform safe: preventing double bookings, fraudulent payments and unauthorized access to other people\u2019s data.',
    ],
  },
  {
    title: '3. Who can see it',
    paragraphs: [
      'You can see your own bookings, payments and profile.',
      'The provider you booked with can see the details needed to host you: your name, the dates, the guest count and your special requests. A provider can never see another provider\u2019s bookings.',
      'The platform administrators can see bookings and payments for support and dispute handling.',
    ],
  },
  {
    title: '4. Payments and the gateway',
    paragraphs: [
      'Checkout happens on the payment gateway\u2019s own secure page. Your card details go directly to the gateway and are never transmitted to or stored by GTour.',
      'GTour receives only the outcome: a transaction reference, the amount and whether the payment succeeded, failed or was cancelled.',
    ],
  },
  {
    title: '5. Passwords and security',
    paragraphs: [
      'Passwords are stored as a one-way hash and never in readable form. Nobody at GTour can read your password.',
      'Sessions use signed tokens. Passwords, tokens and payment credentials are never written to logs or returned by the API.',
    ],
  },
  {
    title: '6. How long we keep it',
    paragraphs: [
      'Booking and payment records are kept for as long as your account is active, and afterwards for as long as accounting and dispute requirements demand.',
      'You can ask for your account to be closed; records that must be retained for financial reasons are kept in restricted form.',
    ],
  },
  {
    title: '7. Your choices',
    paragraphs: [
      'You can update your name, contact details and profile photo at any time from your profile page.',
      'To ask for a copy of your data, or for a correction or deletion, contact the team from your dashboard.',
    ],
  },
  {
    title: '8. Changes to this policy',
    paragraphs: [
      'If this policy changes in a way that affects you, the change will be announced in the app before it takes effect.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:pt-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-400">
        <Link href="/" className="transition-colors hover:text-sea-700">
          Home
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span className="text-ink-600">Privacy</span>
      </nav>

      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sea-700">Legal</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink-900">Privacy policy</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
        What GTour collects, why it is collected, who is allowed to see it, and how bookings and
        payments are protected.
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
          <h2 className="font-display text-lg font-semibold text-ink-900">Contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Questions about your data? See also our{' '}
            <Link href="/terms" className="font-semibold text-sea-700 hover:underline">
              terms and conditions
            </Link>
            , or reach the team from your dashboard.
          </p>
        </section>
      </div>
    </main>
  );
}
