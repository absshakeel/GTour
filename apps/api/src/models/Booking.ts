import mongoose, { Schema, Document } from 'mongoose';
import { BookingStatus } from '@gtour/shared-types';
import { currencyCode } from '../config/currency';

/** Immutable record of what the server charged and why. */
export interface IPriceSnapshot {
  currency: string;
  nights: number;
  rooms: number;
  price_per_night: number;
  subtotal: number;
  total: number;
  nightly: { date: string; price_per_night: number }[];
  captured_at: Date;
}

export interface IBooking extends Document {
  booking_reference: string;
  booking_type: 'hotel' | 'photography' | 'vehicle';
  start_date: Date;
  end_date: Date;
  guest_count: number;
  room_count: number;
  total_amount: number;
  price_snapshot?: IPriceSnapshot;
  status: BookingStatus;
  special_requests?: string;
  cancellation_reason?: string;
  cancelled_at?: Date;
  user_id: mongoose.Types.ObjectId;
  hotel_id?: mongoose.Types.ObjectId;
  hotel_room_id?: mongoose.Types.ObjectId;
  photography_service_id?: mongoose.Types.ObjectId;
  vehicle_id?: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const PriceSnapshotSchema = new Schema<IPriceSnapshot>(
  {
    currency: { type: String, required: true, default: () => currencyCode() },
    nights: { type: Number, required: true, min: 1 },
    rooms: { type: Number, required: true, min: 1 },
    price_per_night: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    nightly: [
      {
        _id: false,
        date: { type: String, required: true },
        price_per_night: { type: Number, required: true, min: 0 }
      }
    ],
    captured_at: { type: Date, required: true, default: Date.now }
  },
  { _id: false }
);

const BookingSchema = new Schema<IBooking>(
  {
    booking_reference: {
      type: String,
      required: true,
      unique: true
    },
    booking_type: {
      type: String,
      enum: ['hotel', 'photography', 'vehicle'],
      required: true
    },
    start_date: {
      type: Date,
      required: true
    },
    end_date: {
      type: Date,
      required: true
    },
    guest_count: {
      type: Number,
      required: true,
      min: 1
    },
    // Hotel bookings can hold more than one room per night.
    room_count: {
      type: Number,
      min: 1,
      default: 1
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0
    },
    // Server-computed price at booking time. Never overwritten afterwards, so a
    // later room price change cannot alter what the guest was charged.
    price_snapshot: {
      type: PriceSnapshotSchema
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING
    },
    special_requests: {
      type: String,
      maxlength: 500
    },
    cancellation_reason: {
      type: String,
      maxlength: 300
    },
    cancelled_at: {
      type: Date
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Denormalised so provider booking queues can filter without joining rooms.
    hotel_id: {
      type: Schema.Types.ObjectId,
      ref: 'Hotel'
    },
    hotel_room_id: {
      type: Schema.Types.ObjectId,
      ref: 'Room'
    },
    photography_service_id: {
      type: Schema.Types.ObjectId,
      ref: 'PhotographyService'
    },
    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
BookingSchema.index({ user_id: 1 });
// `booking_reference` is already indexed by the path-level `unique: true` above.
BookingSchema.index({ status: 1 });
BookingSchema.index({ start_date: 1, end_date: 1 });
BookingSchema.index({ hotel_id: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);