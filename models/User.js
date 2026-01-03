import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Owner', 'Staff'],
        default: 'Staff'
    },
    shopSettings: {
        companyName: { type: String, default: '' },
        address: { type: String, default: '' },
        gstNumber: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' },
        logo: { type: String, default: '' },
        upiId: { type: String, default: '' },
        bankDetails: { type: String, default: '' }
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
