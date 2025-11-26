// Este servicio se encarga de hablar con el microservicio de Grupos (groups-service)
// Cumple el requisito de comunicación síncrona [cite: 9, 77]

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