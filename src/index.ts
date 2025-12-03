import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui';
import expensesOpenAPI from "./controllers/expenses.openapi.ts";
import { connectDB } from "./config/mongo.ts"; 

//Inicializamos el servidor
const app = new OpenAPIHono();

//Conexión a la BD 
connectDB();
app.doc('/doc', {
    openapi: '3.0.0',
    info: {
        version: '1.0.0',
        title: '0debt Expenses API',
        description: 'API para la gestión de gastos en 0debt',
    },  

})

app.get('/ui', swaggerUI({ url: '/doc'}));

app.route("/", expensesOpenAPI);

//SERVER
const port = 3000
console.log(`Server is running on port ${port}`);
console.log(`API documentation available at http://localhost:${port}/ui`);
export default {
    port: port,
    fetch: app.fetch,
}


