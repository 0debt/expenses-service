// Este servicio se encarga de hablar con el microservicio de Grupos (groups-service)
import CircuitBreaker from 'opossum';

// Configuración del Cortacircuitos
const breakerOptions = {
    timeout: 3000, // Si tarda más de 3s, falla
    errorThresholdPercentage: 50, // Si el 50% de las llamadas fallan, abrimos circuito
    resetTimeout: 10000 // Esperamos 10s antes de volver a intentar conectar
};

// La función que realmente hace la llamada
const _checkGroupMembership = async (params: { groupId: string, userId: string }): Promise<boolean> => {
    const serviceUrl = process.env.GROUPS_SERVICE_URL ;
    
    // Lanzamos la petición real
    const response = await fetch(`${serviceUrl}/api/v1/groups/${params.groupId}/members/${params.userId}`);
    
    if (response.status === 200) {
        const data: any = await response.json();
        return data.isMember === true;
    } else if (response.status === 404) {
        return false; // El servicio responde, pero no existe (es válido, no un error de red)
    }
    
    throw new Error(`Servicio respondió con status ${response.status}`);
};

// Creamos el Breaker
const breaker = new CircuitBreaker(_checkGroupMembership, breakerOptions);

// Manejo de eventos (para logs)
breaker.fallback(() => {
    console.warn("Circuit Breaker ABIERTO o Fallo: Usando modo simulacro (Fallback)");
    return true; // En caso de fallo total, dejamos pasar o bloqueamos 
});
breaker.on('open', () => console.log('Circuito Abierto: groups-service parece caído'));
breaker.on('close', () => console.log('Circuito Cerrado: groups-service recuperado'));

// Exportamos la función envuelta
export const validateUserInGroup = async (groupId: string, userId: string): Promise<boolean> => {
    return breaker.fire({ groupId, userId });
};





/*
export const validateUserInGroup = async (groupId: string, userId: string): Promise<boolean> => {
    const serviceUrl = process.env.GROUPS_SERVICE_URL;

    console.log(`Verificando si ${userId} pertenece a ${groupId}...`);

    try {
        // 1. Intentamos llamar al servicio real
        // Asumimos que groups-service tiene un endpoint GET /groups/:id/members/:userId
        const response = await fetch(`${serviceUrl}/api/v1/groups/${groupId}/members/${userId}`);

        if (response.status === 200) {
            // El servicio confirmó que existe
            const data: any = await response.json();
            return data.isMember === true; 
        } else if (response.status === 404) {
            // El grupo o usuario no existen
            return false;
        }

        // Si devuelve otro código, asumimos fallo
        return false;

    } catch (error) {
        // MODO DESARROLLO
        
        console.warn(`⚠️ No se pudo conectar con groups-service. Modo simulacro activado: Asumiendo que el usuario es válido.`);
        return true; 
    }
};
*/
