import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherClass extends Document {
  name: string;
  teacher: mongoose.Types.ObjectId; // User (role=teacher)
  courseAccess?: 'class' | 'all';
  createdAt: Date;
  updatedAt: Date;
}

const TeacherClassSchema = new Schema<ITeacherClass>({
  name: { type: String, required: true },
  teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseAccess: { type: String, enum: ['class','all'], default: 'class', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

TeacherClassSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
TeacherClassSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('TeacherClass')) {
    mongoose.deleteModel('TeacherClass');
  }
} catch {}

export default mongoose.model<ITeacherClass>('TeacherClass', TeacherClassSchema);
