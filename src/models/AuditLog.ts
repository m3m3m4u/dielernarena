import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  action: string;              // e.g. lesson.create, lesson.update, course.delete
  user?: string;               // username
  targetType?: string;         // 'lesson' | 'course' | 'progress' | etc.
  targetId?: string;           // ID string
  courseId?: string;           // optional Bezug
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  action: { type: String, required: true, index: true },
  user: { type: String, index: true },
  targetType: { type: String, index: true },
  targetId: { type: String, index: true },
  courseId: { type: String, index: true },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true }
});

try {
  if (mongoose.modelNames().includes('AuditLog')) {
    mongoose.deleteModel('AuditLog');
  }
} catch {}

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
