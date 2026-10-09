import mongoose from 'mongoose';
import { REGISTRATION_STATUSES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

// Registrations are never deleted: cancelling flips the status and records who/when.
const registrationSchema = new mongoose.Schema(
  {
    workshop: { type: ObjectId, ref: 'Workshop', required: true },
    attendeeName: { type: String, required: true, trim: true, maxlength: 100 },
    attendeeEmail: { type: String, required: true, trim: true, lowercase: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'ACTIVE' },
    registeredBy: { type: ObjectId, ref: 'User', required: true },
    registeredAt: { type: Date, default: Date.now },
    promotedAt: { type: Date }, // set when moved from the waitlist into a seat
    cancelledBy: { type: ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

// One active seat per person per workshop; they can re-register after cancelling.
registrationSchema.index(
  { workshop: 1, attendeeEmail: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'uniq_active_attendee' },
);
// Likewise, a person can only be on a workshop's waitlist once.
registrationSchema.index(
  { workshop: 1, attendeeEmail: 1 },
  { unique: true, partialFilterExpression: { status: 'WAITLISTED' }, name: 'uniq_waitlisted_attendee' },
);
registrationSchema.index({ workshop: 1, status: 1, registeredAt: 1 });
registrationSchema.index({ attendeeEmail: 1 });
registrationSchema.index({ registeredAt: -1 });

export const Registration = mongoose.model('Registration', registrationSchema);
