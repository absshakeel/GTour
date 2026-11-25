import mongoose, { Schema, Document } from 'mongoose';
import { startOfUtcDay } from '../utils/dates';

export interface IVehicleAvailability extends Document {
  vehicle_id: mongoose.Types.ObjectId;
  date: Date;
  available_units: number;
  status: 'available' | 'unavailable' | 'partial';
  created_at: Date;
  updated_at: Date;
}

const VehicleAvailabilitySchema = new Schema<IVehicleAvailability>(
  {
    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
      // Normalize to UTC midnight. Without this, two writes for the same rental
      // day with different times would create duplicate documents and defeat
      // the composite unique index below.
      set: (value: Date | string) => startOfUtcDay(value),
    },
    available_units: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['available', 'unavailable', 'partial'],
      default: 'available',
    },
  },
  {
    timestamps: true,
  },
);

// Composite index for availability queries. This is the ERD identifying key for
// `VehicleAvailability` and, combined with the UTC-midnight date setter above,
// guarantees a single row per vehicle per rental day.
VehicleAvailabilitySchema.index({ vehicle_id: 1, date: 1 }, { unique: true });

export default mongoose.model<IVehicleAvailability>(
  'VehicleAvailability',
  VehicleAvailabilitySchema,
);
