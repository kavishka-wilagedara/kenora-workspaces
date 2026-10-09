import mongoose from 'mongoose';
import { LOCATIONS, WORKSHOP_STATUSES } from '../constants.js';

const workshopSchema = new mongoose.Schema(
  {
    code: { 
      type: String, 
      required: true, 
      unique: true, 
      uppercase: true, 
      trim: true 
    },
    title: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 200 
    },
    instructor: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 100 
    },
    location: { 
      type: String, 
      enum: LOCATIONS, 
      required: true 
    },
    startsAt: { 
      type: Date, 
      required: true 
    },
    endsAt: { 
      type: Date, 
      required: true 
    },
    capacity: { 
      type: Number, 
      required: true, 
      min: 1, 
      validate: Number.isInteger 
    },
    status: { 
      type: String, 
      enum: WORKSHOP_STATUSES, 
      default: 'SCHEDULED' 
    },
    description: { 
      type: String, 
      trim: true, 
      maxlength: 2000, 
      default: '' 
    },
    activeCount: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    updatedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
  },
  { timestamps: true },
);

workshopSchema.index({ startsAt: 1, status: 1 });

workshopSchema.pre('validate', function checkDates(next) {
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate('endsAt', 'End time must be after the start time');
  }
  next();
});

export const Workshop = mongoose.model('Workshop', workshopSchema);
