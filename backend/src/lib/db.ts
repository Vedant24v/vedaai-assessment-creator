import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/vedaai';
  
  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}
