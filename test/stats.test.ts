import { describe, expect, test, mock } from "bun:test";
import { getGroupStats } from "../src/services/stats.service";
// Mockeamos el modelo de Mongoose para no necesitar BBDD real en el test unitario
mock.module("../src/models/GroupStats", () => ({
    GroupStats: {
        findOne: async ({ groupId }: any) => {
            if (groupId === 'grupo_vacio') return null;
            
            // Simulamos lo que devolvería Mongo
            return {
                groupId: 'grupo_lleno',
                totalSpent: 150.50,
                expenseCount: 5,
                categoryBreakdown: new Map([['FOOD', 100], ['TRANSPORT', 50.50]]),
                lastUpdated: new Date()
            };
        }
    }
}));

describe("Servicio de Estadísticas (Materialized View)", () => {
    
    test("Debe devolver ceros si no existe la vista materializada", async () => {
        const result = await getGroupStats('grupo_vacio');
        
        expect(result.totalSpent).toBe(0);
        expect(result.count).toBe(0);
        expect(result.byCategory).toEqual({});
    });

    test("Debe transformar el Map de Mongo a un objeto JSON limpio", async () => {
        const result = await getGroupStats('grupo_lleno');
        
        expect(result.totalSpent).toBe(150.5);
        // Verificamos que transformó el Map a Objeto
        expect(result.byCategory).toEqual({
            'FOOD': 100,
            'TRANSPORT': 50.50
        });
    });
});