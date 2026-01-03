import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            const error = new Error('MONGODB_URI is not defined in environment variables');
            console.error('❌', error.message);
            throw error;
        }

        // Check if already connected
        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB already connected');
            return mongoose.connection;
        }

        console.log('🔄 Attempting MongoDB connection...');
        console.log('Connection URI starts with:', process.env.MONGODB_URI?.substring(0, 20) + '...');
        
        // Parse connection string to ensure it's valid
        const mongoUri = process.env.MONGODB_URI.trim();
        
        // Connection options optimized for Vercel serverless
        // Only use options supported by MongoDB driver
        const options = {
            // Connection pool settings
            maxPoolSize: 10,
            minPoolSize: 0,
            
            // Timeout settings (increased for serverless cold starts)
            serverSelectionTimeoutMS: 20000, // 20 seconds
            socketTimeoutMS: 45000,
            connectTimeoutMS: 20000,
            
            // Heartbeat to keep connection alive
            heartbeatFrequencyMS: 10000,
            
            // Write concern
            retryWrites: true,
            w: 'majority',
            
            // Disable mongoose buffering for serverless (mongoose-specific options)
            bufferCommands: false,
            
            // Additional serverless optimizations
            maxIdleTimeMS: 30000
        };
        
        console.log('📋 Connection options:', {
            serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
            connectTimeoutMS: options.connectTimeoutMS,
            maxPoolSize: options.maxPoolSize
        });
        
        const conn = await mongoose.connect(mongoUri, options);
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error('Error name:', error.name);
        console.error('Error code:', error.code);
        console.error('Full error:', error);
        
        // Don't exit in serverless functions (Vercel) - throw error instead
        if (process.env.VERCEL || process.env.VERCEL_URL) {
            throw error; // Let the serverless function handle it
        } else if (process.env.NODE_ENV === 'production') {
            // In traditional production server, exit if DB connection fails
            process.exit(1);
        } else {
            // In development, log but don't exit immediately
            console.error('Please check your MongoDB connection and try again.');
            throw error;
        }
    }
};

export default connectDB;
