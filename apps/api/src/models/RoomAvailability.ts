import mongoose, { Schema, Document } from 'mongoose';
import { startOfUtcDay } from '../utils/dates';

export interface IRoomAvailability extends Document {
  room_id: mongoose.Types.ObjectId;
  date: Date;
  available_rooms: number;
  price_override?: number;
  status: 'available' | 'unavailable' | 'partial';
  created_at: Date;
  updated_at: Date;
}

const RoomAvailabilitySchema = new Schema<IRoomAvailability>(
  {
    room_id: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true
    },
    date: {
      type: Date,
      required: true,
      index: true,
      // Normalize to UTC midnight. Without this, two writes for the same
      // calendar night with different times would create duplicate documents
      // and defeat the composite unique index.
      set: (value: Date | string) => startOfUtcDay(value)
    },
    available_rooms: {
      type: Number,
      required: true,
      min: 0
    },
    price_override: {
      type: Number,
      min: 0
    },
    status: {
      type: String,
      enum: ['available', 'unavailable', 'partial'],
      default: 'available'
    }
  },
  {
    timestamps: true
  }
);

// One record per room per night — this is the ERD composite key and also what
// makes the atomic `$inc` reservation in the booking engine safe.
RoomAvailabilitySchema.index({ room_id: 1, date: 1 }, { unique: true });

export default mongoose.model<IRoomAvailability>('RoomAvailability', RoomAvailabilitySchema);