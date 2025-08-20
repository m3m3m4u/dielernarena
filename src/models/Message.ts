import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId; // User
  recipientUser?: mongoose.Types.ObjectId; // User (optional)
  recipientClass?: mongoose.Types.ObjectId; // TeacherClass (optional)
  parentMessage?: mongoose.Types.ObjectId; // Thread-Verknüpfung
  threadId?: mongoose.Types.ObjectId; // Root der Konversation
  subject: string;
  body: string;
  readBy?: mongoose.Types.ObjectId[]; // Nutzer, für die als gelesen markiert
  hiddenFor?: mongoose.Types.ObjectId[]; // Nutzer, für die ausgeblendet (soft delete)
  purgedFor?: mongoose.Types.ObjectId[]; // Nutzer, für die endgültig entfernt (nicht mehr sichtbar, auch nicht im Papierkorb)
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientUser: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  recipientClass: { type: Schema.Types.ObjectId, ref: 'TeacherClass', index: true },
  parentMessage: { type: Schema.Types.ObjectId, ref: 'Message', index: true },
  threadId: { type: Schema.Types.ObjectId, ref: 'Message', index: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
  hiddenFor: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
  purgedFor: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

MessageSchema.pre('save', function(next){ this.updatedAt = new Date(); next(); });
MessageSchema.pre('findOneAndUpdate', function(next){ this.set({ updatedAt: new Date() }); next(); });
// Häufige Sortierung: neueste Nachrichten zuerst
MessageSchema.index({ createdAt: -1 });

try { if (mongoose.modelNames().includes('Message')) { mongoose.deleteModel('Message'); } } catch {}
export default mongoose.model<IMessage>('Message', MessageSchema);
