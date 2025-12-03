import { Schema, model, Document } from 'mongoose';

export interface IGroupStats extends Document {
  groupId: string;
  totalSpent: number;
  expenseCount: number;
  categoryBreakdown: Map<string, number>; // Ej: { FOOD: 100, TRANSPORT: 50 }
  lastUpdated: Date;
}

const GroupStatsSchema = new Schema<IGroupStats>(
  {
    groupId: { type: String, required: true, unique: true },
    totalSpent: { type: Number, default: 0 },
    expenseCount: { type: Number, default: 0 },
    // Map permite claves dinámicas (FOOD, OTHER, etc.)
    categoryBreakdown: { 
        type: Map,
        of: Number,
        default: {}
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export const GroupStats = model<IGroupStats>('GroupStats', GroupStatsSchema);