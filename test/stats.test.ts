import { describe, expect, test, mock } from "bun:test";
import { getGroupStats } from "../src/services/stats.service";

// Mockeamos el modelo de Mongoose para no necesitar BBDD real en el test unitario
mock.module("../src/models/GroupStats", () => ({
    GroupStats: {
        findOne: async ({ groupId }: any) => {
            if (groupId === 'grupo_vacio') return null;
            if (groupId === 'grupo_solo_food') {
                return {
                    groupId: 'grupo_solo_food',
                    totalSpent: 50,
                    expenseCount: 2,
                    categoryBreakdown: new Map([['FOOD', 50]]),
                    lastUpdated: new Date()
                };
            }
            if (groupId === 'grupo_todas_categorias') {
                return {
                    groupId: 'grupo_todas_categorias',
                    totalSpent: 500,
                    expenseCount: 10,
                    categoryBreakdown: new Map([
                        ['FOOD', 150],
                        ['TRANSPORT', 100],
                        ['ACCOMMODATION', 200],
                        ['ENTERTAINMENT', 50]
                    ]),
                    lastUpdated: new Date()
                };
            }
            
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
    
    // ========== ESCENARIOS POSITIVOS ==========
    
    test("Debe devolver estadísticas correctas para grupo con datos", async () => {
        const result = await getGroupStats('grupo_lleno');
        
        expect(result.totalSpent).toBe(150.5);
        expect(result.count).toBe(5);
    });

    test("Debe transformar el Map de Mongo a un objeto JSON limpio", async () => {
        const result = await getGroupStats('grupo_lleno');
        
        expect(result.byCategory).toEqual({
            'FOOD': 100,
            'TRANSPORT': 50.50
        });
    });

    test("Debe manejar grupo con una sola categoría", async () => {
        const result = await getGroupStats('grupo_solo_food');
        
        expect(result.totalSpent).toBe(50);
        expect(result.count).toBe(2);
        expect(result.byCategory).toEqual({ 'FOOD': 50 });
    });

    test("Debe manejar grupo con múltiples categorías", async () => {
        const result = await getGroupStats('grupo_todas_categorias');
        
        expect(result.totalSpent).toBe(500);
        expect(result.count).toBe(10);
        expect(Object.keys(result.byCategory)).toHaveLength(4);
        expect(result.byCategory['ACCOMMODATION']).toBe(200);
    });

    // ========== ESCENARIOS NEGATIVOS / EDGE CASES ==========

    test("Debe devolver ceros si no existe la vista materializada", async () => {
        const result = await getGroupStats('grupo_vacio');
        
        expect(result.totalSpent).toBe(0);
        expect(result.count).toBe(0);
        expect(result.byCategory).toEqual({});
    });

    test("La estructura de respuesta debe ser consistente", async () => {
        const result = await getGroupStats('grupo_lleno');
        
        expect(result).toHaveProperty('totalSpent');
        expect(result).toHaveProperty('count');
        expect(result).toHaveProperty('byCategory');
        expect(typeof result.totalSpent).toBe('number');
        expect(typeof result.count).toBe('number');
        expect(typeof result.byCategory).toBe('object');
    });
});