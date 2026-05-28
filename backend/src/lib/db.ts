import mongoose from 'mongoose';

type CachedConnection = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseConnection?: CachedConnection;
};

const cached: CachedConnection = globalWithMongoose.mongooseConnection || {
  conn: null,
  promise: null,
};

if (!globalWithMongoose.mongooseConnection) {
  globalWithMongoose.mongooseConnection = cached;
}

export async function connectDB(): Promise<void> {
  if (cached.conn) return;

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vedaai';

  try {
    if (!cached.promise) {
      cached.promise = mongoose.connect(uri, {
        bufferCommands: false,
        maxPoolSize: process.env.VERCEL ? 5 : 10,
      });
    }

    cached.conn = await cached.promise;
    console.log('MongoDB connected');
  } catch (err) {
    cached.promise = null;
    console.error('MongoDB connection error:', err);
    throw err;
  }

  if (mongoose.connection.listenerCount('error') === 0) {
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err);
    });
  }

  if (mongoose.connection.listenerCount('disconnected') === 0) {
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      cached.conn = null;
      cached.promise = null;
    });
  }
}
