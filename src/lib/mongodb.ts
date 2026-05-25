import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

declare global {
  var _signalGenMongoClientPromise: Promise<MongoClient> | undefined;
}

const options = {};
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._signalGenMongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._signalGenMongoClientPromise = client.connect();
  }
  clientPromise = global._signalGenMongoClientPromise;
} else {
  const client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getSignalGenClient() {
  return clientPromise;
}

export async function getSignalGenDb() {
  const client = await clientPromise;
  return client.db("signalgen");
}
