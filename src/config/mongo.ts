import { Db, MongoClient, ServerApiVersion } from "mongodb";

//Conexion a mongoDB
const mongoDB = process.env.DATABASE_URL
if (!mongoDB) {
  throw new Error("DATABASE_URL is not defined");
}

//Cliente de mongoDB
const client = new MongoClient(mongoDB, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

//Instancia de la base de datos
let dbInstance: Db;

//Obtener la base de datos
export async function getDatabase(): Promise<Db> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    //solo te conectas una vez
    await client.connect(); 
    dbInstance = client.db('expenses'); 
    console.log("Successfully connected to MongoDB Atlas.");
    return dbInstance;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

//Cerrar conexion
export async function closeDatabase(): Promise<void> {
    if (client) {
        await client.close();
        console.log("MongoDB connection closed.");
    }
}