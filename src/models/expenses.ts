import { Schema, model, Document } from 'mongoose';

//Definición interfaz ts

interface IExpenseShare {
  userId: string;      
  amount: number;      
}

//1. variables de nuestra base de datos

export interface IExpense extends Document {
  description: string;
  totalAmount: number;
  originalAmount: number; // Monto original antes de cualquier conversión
  currency: string;    // Moneda en la que se registró el gasto
  exchangeRate: number; // Equivalencia a moneda base (ej: USD) 
  date: Date;
  payerId: string;     
  groupId: string;     
  splitType: 'EQUAL' | 'EXACT' | 'PERCENTAGE'; // Para saber cómo se dividió
  shares: IExpenseShare[]; // El desglose de quién debe cuánto
  createdAt: Date;
  updatedAt: Date;
  category: 'FOOD' | 'TRANSPORT' | 'ACCOMMODATION' | 'ENTERTAINAMENT' | 'OTHER'; // Nueva categoría
}

// 2. Definión de las variables de nuestra BD
const ExpenseSchema = new Schema<IExpense>(
  {
    description: { 
      type: String, 
      required: true, 
      trim: true 
    },
    totalAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    originalAmount: { 
      type: Number, 
      required: true},
    currency: { 
      type: String, 
      required: true,
      default: 'EUR' 
    },
    exchangeRate: { 
      type: Number,
      default: 1 
    },
    date: { 
      type: Date, 
      default: Date.now 
    },
    payerId: { 
      type: String, 
      required: true,
      index: true // Indexado para búsquedas rápidas
    },
    groupId: { 
      type: String, 
      required: true,
      index: true // Indexado para filtrar gastos por grupo constantemente
    },
    splitType: {
      type: String,
      enum: ['EQUAL', 'EXACT', 'PERCENTAGE'],
      default: 'EQUAL'
    },
    category: {
      type: String,
      enum: ['FOOD', 'TRANSPORT', 'ACCOMMODATION', 'ENTERTAINAMENT', 'OTHER'],
      default: 'OTHER',
      index: true // Para filtrar gastos por categoría
  
    },
    // Aquí está la clave del algoritmo:
    // Guardamos cuánto le corresponde a cada participante
    shares: [
      {
        userId: { type: String, required: true },
        amount: { type: Number, required: true }
      }
    ]
  },
  {
    timestamps: true, // Crea automáticamente createdAt y updatedAt
    versionKey: false
  }
);

// 3. Exportamos el Modelo
export const Expense = model<IExpense>('Expense', ExpenseSchema);