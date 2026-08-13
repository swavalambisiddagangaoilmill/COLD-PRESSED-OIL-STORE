// Connects the API to MongoDB using Mongoose.
import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

export async function connectDB() {
  const connection = await mongoose.connect(env.mongoUri);

  console.log(
    `MongoDB connected: ${connection.connection.host}/${connection.connection.name}`,
  );
}
