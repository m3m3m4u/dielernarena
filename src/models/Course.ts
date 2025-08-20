import mongoose, { Schema, Document } from 'mongoose';

export interface ICourse extends Document {
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  lessons: string[];
  isPublished: boolean;
  progressionMode: 'linear' | 'free'; // linear = Lektion für Lektion, free = beliebige Reihenfolge
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: String,
    required: true
  },
  lessons: [{
    type: Schema.Types.ObjectId,
    ref: "Lesson"
  }],
  isPublished: {
    type: Boolean,
    default: false
  },
  progressionMode: {
    type: String,
    enum: ['linear', 'free'],
    default: 'free',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Häufige Filter: isPublished, category, author
CourseSchema.index({ isPublished: 1, createdAt: -1 });
CourseSchema.index({ category: 1 });
CourseSchema.index({ author: 1 });

// Update updatedAt before saving
CourseSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// HMR/Dev: altes Modell verwerfen, damit Schema-Änderungen greifen
try {
  const m = mongoose as unknown as { deleteModel?: (name: string) => void; models?: Record<string, unknown> };
  if (typeof m.deleteModel === 'function') {
    m.deleteModel('Course');
  } else if (m.models && m.models.Course) {
    delete (m.models as Record<string, unknown>).Course;
  }
} catch {
  // ignore
}

export default mongoose.model<ICourse>('Course', CourseSchema);
