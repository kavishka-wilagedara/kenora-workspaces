import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  action: { 
    type: String, 
    required: true 
  },
  entityType: { 
    type: String, 
    enum: ['USER', 'WORKSHOP'], 
    required: true 
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  entityLabel: { 
    type: String 
  },
  changes: { 
    type: mongoose.Schema.Types.Mixed 
  },
  at: { 
    type: Date, default: Date.now 
  },
});

auditLogSchema.index({ entityType: 1, at: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
