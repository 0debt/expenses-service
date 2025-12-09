import { GroupStats } from "../models/GroupStats";

export const getGroupStats = async (groupId: string) => {
    // LEEMOS LA VISTA MATERIALIZADA (Lectura directa, sin cálculos)
    const stats = await GroupStats.findOne({ groupId });

    if (!stats) {
        return {
            totalSpent: 0,
            count: 0,
            byCategory: {}
        };
    }

    // Convertimos el Map de Mongoose a objeto normal de JS
    const categoryObj = Object.fromEntries(stats.categoryBreakdown);

    return {
        totalSpent: Math.round(stats.totalSpent * 100) / 100,
        count: stats.expenseCount,
        byCategory: categoryObj,
        lastUpdated: stats.lastUpdated
    };
};