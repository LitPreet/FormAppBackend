import mongoose from "mongoose";
import { DB_NAME } from "../utils/constants";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    console.log(`\n MongoDb connected !! DB HOST: ${connectionInstance.connection.host}`);
  } catch (err) {
    console.log("MongoDb connectio  error", err);
    process.exit(1);
  }
};

export default connectDB