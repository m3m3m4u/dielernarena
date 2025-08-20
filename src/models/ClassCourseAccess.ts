import mongoose, { Schema, Document } from 'mongoose';

export interface IClassCourseAccess extends Document {
  class: mongoose.Types.ObjectId; // TeacherClass
  course: mongoose.Types.ObjectId; // Course
  enabledBy: mongoose.Types.ObjectId; // User (teacher)
  mode: 'link' | 'copy';
  createdAt: Date;
  updatedAt: Date;
}

const ClassCourseAccessSchema = new Schema<IClassCourseAccess>({
  class: { type: Schema.Types.ObjectId, ref: 'TeacherClass', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  enabledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mode: { type: String, enum: ['link','copy'], default: 'link' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// pro Klasse-Kurs nur einmal zulassen
ClassCourseAccessSchema.index({ class: 1, course: 1 }, { unique: true });

ClassCourseAccessSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
ClassCourseAccessSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('ClassCourseAccess')) {
    mongoose.deleteModel('ClassCourseAccess');
  }
} catch {}

export default mongoose.model<IClassCourseAccess>('ClassCourseAccess', ClassCourseAccessSchema);
