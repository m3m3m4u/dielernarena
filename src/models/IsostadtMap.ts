import mongoose, { Schema, Document, SchemaTypes } from 'mongoose';

export interface IIsostadtMap extends Document {
  key: string; // eindeutiger Schlüssel, z.B. "default" oder nutzerspezifisch
  n: number;   // Kantenlänge des Quadratrasters
  map: number[][][]; // 3D-Array: [i][j] => [ti, tj]
  lastModified?: number; // Epoch ms
  balance?: number; // Guthaben
  stars?: number;   // Sterne
  createdAt: Date;
  updatedAt: Date;
}

const IsostadtMapSchema = new Schema<IIsostadtMap>({
  key: { type: String, required: true, unique: true, index: true },
  n: { type: Number, required: true },
  map: { type: SchemaTypes.Mixed, required: true },
  lastModified: { type: Number },
  balance: { type: Number },
  stars: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

IsostadtMapSchema.pre('save', function(this: IIsostadtMap, next){ this.updatedAt = new Date(); next(); });
IsostadtMapSchema.pre('findOneAndUpdate', function(next){ (this as any).set({ updatedAt: new Date() }); next(); });

try {
  if (mongoose.modelNames().includes('IsostadtMap')) {
    mongoose.deleteModel('IsostadtMap');
  }
} catch {}

export default mongoose.model<IIsostadtMap>('IsostadtMap', IsostadtMapSchema);
