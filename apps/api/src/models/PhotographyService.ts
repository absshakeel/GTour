import mongoose, { Schema, Document } from 'mongoose';

export interface IPhotographyService extends Document {
  photographer_id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  price_per_session: number;
  duration_hours: number;
  /** Files the client receives after the shoot. */
  photo_count?: number;
  /** Turnaround time for the edited gallery, in days. */
  delivery_days?: number;
  /** Providers can hide a service without deleting its history. */
  is_active?: boolean;
  images: string[];
  created_at: Date;
  updated_at: Date;
}

const PhotographyServiceSchema = new Schema<IPhotographyService>(
  {
    photographer_id: {
      type: Schema.Types.ObjectId,
      ref: 'Photographer',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price_per_session: {
      type: Number,
      required: true,
      min: 0,
    },
    duration_hours: {
      type: Number,
      required: true,
      min: 0.5,
    },
    photo_count: {
      type: Number,
      min: 1,
    },
    delivery_days: {
      type: Number,
      min: 1,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    images: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

PhotographyServiceSchema.index({ photographer_id: 1 });
PhotographyServiceSchema.index({ price_per_session: 1 });

export default mongoose.model<IPhotographyService>('PhotographyService', PhotographyServiceSchema);
