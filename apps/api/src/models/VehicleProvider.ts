import mongoose, { Schema, Document } from 'mongoose';

export interface IVehicleProvider extends Document {
  user_id?: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  rating?: number;
  created_at: Date;
  updated_at: Date;
}

const VehicleProviderSchema = new Schema<IVehicleProvider>(
  {
    // Links the provider record to the account that owns it. Optional so
    // existing rows keep working.
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      maxlength: 500
    },
    rating: {
      type: Number,
      min: 0,
      max: 5
    }
  },
  {
    timestamps: true
  }
);

VehicleProviderSchema.index({ user_id: 1 });
VehicleProviderSchema.index({ rating: -1 });

export default mongoose.model<IVehicleProvider>('VehicleProvider', VehicleProviderSchema);