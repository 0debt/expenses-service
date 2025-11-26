import { Expense } from "../models/expenses.ts";

interface GroupStats {
    totalSpent: number;
    count: number;
    lastExpenseDate: Date | null;
}

export const getGroupStats = async (groupId: string): Promise<GroupStats> => {
    // Usamos el Pipeline de Agregación de Mongo para calcular sumas rápido
    const stats = await Expense.aggregate([
        { 
            // 1. Filtramos: Solo gastos de este grupo
            $match: { groupId: groupId } 
        },
        { 
            // 2. Agrupamos: Sumamos el campo 'totalAmount'
            $group: {
                _id: "$groupId", // Agrupar por ID de grupo
                totalSpent: { $sum: "$totalAmount" }, // Suma total
                count: { $sum: 1 }, // Conteo de gastos
                lastExpenseDate: { $max: "$date" } // Fecha del último gasto
            }
        }
    ]);

    // Si no hay gastos, devolvemos 0
    if (stats.length === 0) {
        return {
            totalSpent: 0,
            count: 0,
            lastExpenseDate: null
        };
    }

    // Devolvemos el resultado formateado
    return {
        totalSpent: Math.round(stats[0].totalSpent * 100) / 100, // Redondeo a 2 decimales
        count: stats[0].count,
        lastExpenseDate: stats[0].lastExpenseDate
    };
};