import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
    offerType: {
        type: String,
        enum: ['Product', 'Category', 'All'],
        default: 'Product'
    },
    targetId: {
        type: String, // Can be Product ID or Category Name
        required: true
    },
    discountType: {
        type: String,
        enum: ['Percentage', 'Fixed'],
        default: 'Percentage'
    },
    discountValue: {
        type: Number,
        required: true
    },
    minQuantity: {
        type: Number,
        default: 1
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: Date,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Offer = mongoose.model('Offer', offerSchema);

export default Offer;
