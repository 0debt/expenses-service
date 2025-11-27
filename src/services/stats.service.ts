import { Expense } from "../models/expenses.ts";

interface GroupStats {
    totalSpent: number;
    byCategory: Record<string, number>; // Ej: { FOOD: 50, TRANSPORT: 20 }
}

export const getGroupStats = async (groupId: string): Promise<GroupStats> => {
    const stats = await Expense.aggregate([
        { $match: { groupId: groupId } },
        { 
            $group: {
                _id: "$category", // Agrupamos por categoría
                total: { $sum: "$totalAmount" }
            }
        }
    ]);

    
    // { totalSpent: 150, byCategory: { FOOD: 100, OTHER: 50 } }
    
    let totalSpent = 0;
    const byCategory: Record<string, number> = {};

    stats.forEach(item => {
        byCategory[item._id] = Math.round(item.total * 100) / 100;
        totalSpent += item.total;
    });

    return {
        totalSpent: Math.round(totalSpent * 100) / 100,
        byCategory
    };
};