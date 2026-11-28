import type { Metadata } from 'next';
import NotificationsClient from './NotificationsClient';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Booking requests, payment receipts and account alerts on GTour.',
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
