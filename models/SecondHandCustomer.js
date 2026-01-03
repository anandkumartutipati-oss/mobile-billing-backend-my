import mongoose from 'mongoose';

const secondHandCustomerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true,
        unique: true
    },
    address: String,
    purchaseHistory: [{
        purchaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SecondHandPurchase'
        },
        productName: String,
        salePrice: Number,
        purchaseDate: {
            type: Date,
            default: Date.now
        }
    }],
    totalSpent: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const SecondHandCustomer = mongoose.model('SecondHandCustomer', secondHandCustomerSchema);

export default SecondHandCustomer;
