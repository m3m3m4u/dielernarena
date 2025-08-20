import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  name: string;
  password: string;
  email?: string;
  completedLessons: string[];
  stars: number;
  role: 'learner' | 'author' | 'admin' | 'teacher' | 'pending-author' | 'pending-teacher';
  ownerTeacher?: mongoose.Types.ObjectId; // Lehrer, der diesen Lernenden angelegt hat
  class?: mongoose.Types.ObjectId; // Klasse (TeacherClass)
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, trim: true },
  completedLessons: [{ type: String }],
  stars: { type: Number, default: 0 },
  role: { type: String, enum: ['learner','author','admin','teacher','pending-author','pending-teacher'], default: 'learner', index: true },
  ownerTeacher: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  class: { type: Schema.Types.ObjectId, ref: 'TeacherClass', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
UserSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('User')) {
    mongoose.deleteModel('User');
  }
} catch { /* ignore */ }
export default mongoose.model<IUser>('User', UserSchema);
