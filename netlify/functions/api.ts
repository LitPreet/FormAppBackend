import serverless from "serverless-http";
import { app } from "../../src/app"
import connectDB from "../../src/db/index"; 
let isConnected = false;

const handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }

  const serverlessHandler = serverless(app);
  return serverlessHandler(event, context);
};

export { handler };