import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import bcrypt from 'bcryptjs';

const testLogin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB...");

        const email = 'admin@shop.com';
        const password = 'password123';

        console.log(`\n🔍 Looking up user: ${email}`);
        const user = await User.findOne({ email });

        if (!user) {
            console.log("❌ User not found!");
            process.exit(1);
        }

        console.log(`✅ User found: ${user._id}`);
        console.log(`📂 Stored Password Hash: ${user.password}`);

        console.log(`\n🔐 Testing bcrypt directly...`);
        const isBcryptMatch = await bcrypt.compare(password, user.password);
        console.log(`Bcrypt Compare Result: ${isBcryptMatch}`);

        console.log(`\n🔐 Testing user.matchPassword()...`);
        const isMethodMatch = await user.matchPassword(password);
        console.log(`Method Match Result: ${isMethodMatch}`);

        if (isBcryptMatch && isMethodMatch) {
            console.log("\n✅ Login verification SUCCESSFUL");
        } else {
            console.log("\n❌ Login verification FAILED");
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testLogin();
