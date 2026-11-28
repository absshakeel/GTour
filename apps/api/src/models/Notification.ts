import mongoose, { Schema, Document } from 'mongoose';
import { NotificationType } from '@gtour/shared-types';

/** Delivery state of the email half of a notification. */
export type NotificationEmailStatus = 'sent' | 'skipped' | 'failed';

/**
 * One notification for one recipient.
 *
 * Written on every notifiable event, whether or not email is configured, so the
 * in-app bell always has a complete history. `actionable` is stored rather than
 * derived because only the producing event knows whether the recipient is
 * expected to respond — that flag is what lets the browser chime on the events
 * that matter instead of on every marketing-ish row.
 */
export interface INotification extends Document {
  user_id: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  booking_id?: mongoose.Types.ObjectId;
  payment_id?: mongoose.Types.ObjectId;
  destination_id?: mongoose.Types.ObjectId;
  actionable: boolean;
  read_at?: Date;
  email_status?: NotificationEmailStatus;
  email_reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    // Relative path on the web app, never an absolute URL: the API does not know
    // which origin the recipient is browsing from.
    link: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    booking_id: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
    },
    payment_id: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },
    destination_id: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
    },
    actionable: {
      type: Boolean,
      default: false,
    },
    read_at: {
      type: Date,
    },
    email_status: {
      type: String,
      enum: ['sent', 'skipped', 'failed'],
    },
    email_reason: {
      type: String,
      maxlength: 300,
    },
  },
  {
    timestamps: true,
  },
);

// The bell's only hot query: this user's unread rows, newest first.
NotificationSchema.index({ user_id: 1, read_at: 1, createdAt: -1 });
NotificationSchema.index({ user_id: 1, createdAt: -1 });
NotificationSchema.index({ booking_id: 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
