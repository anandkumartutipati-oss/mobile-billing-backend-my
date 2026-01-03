import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Clean inputs to handle accidental whitespace
        const cleanEmail = email.trim();
        const cleanPassword = password.trim();

        // Check if JWT_SECRET is set
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET is not defined');
            return res.status(500).json({ message: 'Server configuration error: JWT_SECRET missing' });
        }

        // Check if mongoose is connected
        const mongoose = (await import('mongoose')).default;
        if (mongoose.connection.readyState !== 1) {
            console.error('❌ Database not connected. State:', mongoose.connection.readyState);
            return res.status(503).json({
                message: 'Database not connected',
                readyState: mongoose.connection.readyState
            });
        }

        console.log('🔍 Looking up user:', cleanEmail);
        const user = await User.findOne({ email: cleanEmail });

        if (!user) {
            console.log('❌ User not found:', cleanEmail);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check if user has a password (shouldn't happen but safety check)
        if (!user.password) {
            console.error('❌ User found but password is missing:', user.email);
            return res.status(500).json({ message: 'User account error' });
        }

        console.log('🔐 Verifying password for user:', cleanEmail);
        const isPasswordMatch = await user.matchPassword(cleanPassword);

        if (isPasswordMatch) {
            try {
                console.log('✅ Password match, generating token...');
                const token = generateToken(user._id);
                res.json({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    shopSettings: user.shopSettings,
                    token: token,
                });
            } catch (tokenError) {
                console.error('❌ Token generation error:', tokenError);
                res.status(500).json({
                    message: 'Token generation failed',
                    error: process.env.NODE_ENV === 'production' ? null : tokenError.message
                });
            }
        } else {
            console.log('❌ Password mismatch for user:', cleanEmail);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error("❌ Login error:", error);
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error code:", error.code);
        console.error("Error stack:", error.stack);

        // Check if it's a database error
        if (error.name === 'MongoServerError' || error.name === 'MongooseError') {
            return res.status(503).json({
                message: 'Database error',
                error: process.env.NODE_ENV === 'production' ? null : error.message,
                type: error.name
            });
        }

        // Provide more detailed error in development
        const errorMessage = process.env.NODE_ENV === 'production'
            ? 'Server error during login'
            : `Server error: ${error.message}`;

        res.status(500).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'production' ? null : error.message,
            type: error.name || 'Error'
        });
    }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (Should be restricted in production or require an invite)
export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            // role is removed from here so it defaults to 'Staff' as per User model
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: 'Server error during registration', error: error.message });
    }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                shopSettings: user.shopSettings,
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ message: 'Server error fetching profile' });
    }
};

// @desc    Update shop settings
// @route   PUT /api/auth/settings
// @access  Private/Owner
export const updateShopSettings = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update settings dynamically based on what's sent in the body
        // This ensures any field added to the schema in the future works automatically
        Object.keys(req.body).forEach((key) => {
            if (user.shopSettings[key] !== undefined || user.shopSettings.get?.(key) !== undefined) {
                user.shopSettings[key] = req.body[key];
            }
        });

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            shopSettings: updatedUser.shopSettings,
        });
    } catch (error) {
        console.error("Error updating shop settings:", error);
        res.status(500).json({ message: error.message });
    }
};
