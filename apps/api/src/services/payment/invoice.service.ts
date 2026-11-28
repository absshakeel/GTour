import fs from 'fs';
import Booking from '../../models/Booking';
import Hotel from '../../models/Hotel';
import Payment, { type IPayment } from '../../models/Payment';
import User from '../../models/User';
import { isCapturedPayment, PaymentStatus } from '@gtour/shared-types';
import { invoiceNumber } from '../../utils/reference';
import { formatMinorGrouped, fromMinor } from '../../utils/money';

/**
 * Where rendered invoices live.
 *
 * A plain directory rather than object storage: an invoice is a small,
 * immutable artefact that is read back rarely, and keeping it on disk means an
 * invoice remains downloadable even when object storage is unreachable.
 */
function invoiceDir(): string {
  return process.env.INVOICE_DIR || 'uploads/invoices';
}

export interface InvoiceLine {
  label: string;
  detail?: string;
  amount: string;
}

/** Everything the renderer needs, resolved before any drawing happens. */
export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  paymentStatus: string;
  paymentMethod: string;
  gateway: string;
  currency: string;
  total: string;
  bookingReference: string;
  bookingType: string;
  stayWindow: string;
  guestName: string;
  guestEmail?: string;
  propertyName?: string;
  lines: InvoiceLine[];
  refunded?: string;
  transactionReference?: string;
  cardMask?: string;
  bankTransactionId?: string;
}

export function invoicePathFor(number: string): string {
  return `${invoiceDir()}/${number}.pdf`;
}

/**
 * Whether a payment may have an invoice.
 *
 * Captured money always may; a refunded one still may, because the invoice is a
 * record of what was charged and the refund is a line on it. A payment that was
 * never captured has nothing to invoice.
 */
export function canIssueInvoice(status: string | undefined): boolean {
  return (
    isCapturedPayment(status) ||
    status === PaymentStatus.PARTIALLY_REFUNDED ||
    status === PaymentStatus.REFUNDED
  );
}

/** A readable amount for documents, e.g. `BDT 4,800.00`. */
function money(minor: number, currency: string): string {
  return `${currency} ${formatMinorGrouped(minor, currency)}`;
}

export function invoiceExists(number: string): boolean {
  return fs.existsSync(invoicePathFor(number));
}

/**
 * Gives a payment its invoice number and returns it.
 *
 * The number is what the file is named after, so it is derived from the payment
 * id: retrying generation for the same payment yields the same number instead of
 * leaving a trail of orphans. A collision on the unique index is retried with a
 * fresh sequence, which is why the loop exists rather than a single attempt.
 */
export async function ensureInvoiceNumber(payment: IPayment): Promise<string> {
  if (payment.invoice_number) return payment.invoice_number;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sequence = Number(
      // Last 6 hex digits of the ObjectId make a stable, unguessable seed.
      BigInt(`0x${String(payment._id).slice(-8)}`) % 1_000_000n,
    );
    const candidate = invoiceNumber(sequence + attempt, payment.createdAt ?? new Date());

    const clash = await Payment.exists({ invoice_number: candidate, _id: { $ne: payment._id } });

    if (clash) continue;

    payment.invoice_number = candidate;
    payment.invoice_generated_at = new Date();
    await payment.save();
    return candidate;
  }

  throw new Error('Could not allocate a unique invoice number');
}

function taxLines(_payment: IPayment): InvoiceLine[] {
  // Prices are inclusive of VAT in this deployment, so the breakdown is a single
  // line. Kept as a function so a future tax model only has to change here.
  return [];
}

/** Builds the printable invoice from the payment and its booking. */
export async function buildInvoiceData(payment: IPayment): Promise<InvoiceData> {
  const booking = await Booking.findById(payment.booking_id).lean();

  const guest = booking
    ? await User.findById(booking.user_id)
        .select('name email')
        .lean<{ name?: string; email?: string } | null>()
    : null;

  const hotel =
    booking?.hotel_id
      ? await Hotel.findById(booking.hotel_id)
          .select('name address')
          .lean<{ name?: string; address?: string } | null>()
      : null;

  const transaction = payment.transactions?.length
    ? [...payment.transactions].reverse().find((entry) => entry.status === 'successful') ??
      payment.transactions[payment.transactions.length - 1]
    : undefined;

  const refundedMinor = payment.refunded_minor ?? 0;

  return {
    invoiceNumber: payment.invoice_number ?? 'PENDING',
    issuedAt:
      payment.invoice_generated_at ?? payment.payment_date ?? payment.createdAt ?? new Date(),
    paymentStatus: payment.payment_status,
    paymentMethod: payment.payment_method,
    gateway: payment.gateway,
    currency: payment.currency,
    total: money(payment.amount_minor ?? 0, payment.currency),
    bookingReference: booking?.booking_reference ?? '—',
    bookingType: booking?.booking_type ?? 'booking',
    stayWindow: booking
      ? `${new Date(booking.start_date).toISOString().slice(0, 10)} → ${new Date(
          booking.end_date,
        )
          .toISOString()
          .slice(0, 10)}`
      : '—',
    guestName: guest?.name ?? 'Guest',
    guestEmail: guest?.email,
    propertyName: hotel?.name,
    lines: [
      {
        label: hotel?.name ? `${booking?.booking_type ?? 'booking'} — ${hotel.name}` : 'Booking',
        detail: `${booking?.room_count ?? 1} room(s), ${booking?.guest_count ?? 1} guest(s)`,
        amount: money(payment.amount_minor ?? 0, payment.currency),
      },
      ...taxLines(payment),
    ],
    refunded: refundedMinor > 0 ? money(refundedMinor, payment.currency) : undefined,
    transactionReference: payment.transaction_reference,
    cardMask: transaction?.card_mask,
    bankTransactionId: transaction?.bank_tran_id,
  };
}

/**
 * Renders the invoice to a PDF on disk and returns its path.
 *
 * Drawn with PDFKit's primitives rather than an HTML-to-PDF engine: the layout is
 * fixed, so a headless browser would be a large dependency for no gain.
 */
export async function renderInvoicePdf(data: InvoiceData): Promise<string> {
  const PDFDocument = (await import('pdfkit')).default;

  fs.mkdirSync(invoiceDir(), { recursive: true });
  const target = invoicePathFor(data.invoiceNumber);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(target);
  doc.pipe(stream);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.fontSize(22).fillColor('#0f766e').text('GTour', left);
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#6b7280').text('Global Tourism Platform', left);
  doc.moveDown(1.5);

  doc.fontSize(18).fillColor('#111827').text('Invoice', left);
  doc.moveDown(0.4);
  doc
    .fontSize(10)
    .fillColor('#374151')
    .text(`Invoice number: ${data.invoiceNumber}`)
    .text(`Issued: ${data.issuedAt.toISOString().slice(0, 10)}`)
    .text(`Status: ${data.paymentStatus}`)
    .text(`Method: ${data.paymentMethod}${data.gateway ? ` (${data.gateway})` : ''}`);
  doc.moveDown(1);

  doc.fillColor('#111827').fontSize(11).text('Billed to', left, undefined, { continued: false });
  doc.fontSize(10).fillColor('#374151').text(data.guestName);
  if (data.guestEmail) doc.text(data.guestEmail);
  doc.moveDown(0.8);

  doc.fontSize(11).fillColor('#111827').text('Booking');
  doc.fontSize(10).fillColor('#374151');
  doc.text(`Reference: ${data.bookingReference}`);
  if (data.propertyName) doc.text(`Property: ${data.propertyName}`);
  doc.text(`Dates: ${data.stayWindow}`);
  doc.moveDown(1);

  // Header row
  const tableTop = doc.y;
  doc.fontSize(10).fillColor('#6b7280').text('Description', left, tableTop);
  doc.text('Amount', left, tableTop, { width: right - left, align: 'right' });
  doc
    .moveTo(left, tableTop + 16)
    .lineTo(right, tableTop + 16)
    .strokeColor('#e5e7eb')
    .stroke();
  doc.moveDown(1);

  for (const line of data.lines) {
    const y = doc.y;
    doc.fontSize(10).fillColor('#111827').text(line.label, left, y, { width: right - left - 110 });
    doc.fontSize(10).fillColor('#111827').text(line.amount, left, y, {
      width: right - left,
      align: 'right',
    });
    if (line.detail) {
      doc.fontSize(9).fillColor('#6b7280').text(line.detail, left, doc.y, {
        width: right - left - 110,
      });
    }
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  const totalY = doc.y;
  doc
    .moveTo(left, totalY)
    .lineTo(right, totalY)
    .strokeColor('#e5e7eb')
    .stroke();
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#111827').text('Total paid', left, doc.y);
  doc.fontSize(12).text(data.total, left, doc.y - 15, { width: right - left, align: 'right' });

  if (data.refunded) {
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#b91c1c').text(`Refunded: ${data.refunded}`, left);
  }

  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#6b7280');
  if (data.transactionReference) doc.text(`Transaction reference: ${data.transactionReference}`);
  if (data.bankTransactionId) doc.text(`Bank transaction id: ${data.bankTransactionId}`);
  if (data.cardMask) doc.text(`Card: ${data.cardMask}`);
  doc.moveDown(1);
  doc.text('This invoice was generated automatically by GTour.', left);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return target;
}

/**
 * Makes sure a captured payment has both an invoice number and a rendered PDF,
 * then returns the number. Idempotent: a second call is a no-op when the file is
 * already on disk.
 */
export async function ensureInvoice(payment: IPayment): Promise<string> {
  const number = await ensureInvoiceNumber(payment);

  if (!invoiceExists(number)) {
    await renderInvoicePdf(await buildInvoiceData(payment));
  }

  return number;
}

/** Total the invoice states, for callers that need it without a PDF. */
export function invoiceTotal(payment: IPayment): number {
  return fromMinor(payment.amount_minor ?? 0, payment.currency);
}
