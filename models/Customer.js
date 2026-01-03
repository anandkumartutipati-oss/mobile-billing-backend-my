import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
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
    idProof: String,
    purchaseHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    }],
    outstandingBalance: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
