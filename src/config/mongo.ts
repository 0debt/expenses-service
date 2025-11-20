import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const mongoURI = process.env.DATABASE_URL;

  if (!mongoURI) {
    throw new Error("DATABASE_URL is not defined in .env");
  }

  try {
    // Mongoose gestiona el pool de conexiones por ti
    await mongoose.connect(mongoURI);
    console.log("Successfully connected to MongoDB Atlas (via Mongoose).");
  } catch (error) {
    console.error(" Error connecting to MongoDB:", error);
    // Si falla la conexión inicial, es mejor detener el servicio
    process.exit(1); 
  }
};