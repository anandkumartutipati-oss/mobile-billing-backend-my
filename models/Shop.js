import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        default: 'My Mobile Shop'
    },
    address: {
        type: String,
        required: true,
        default: 'Shop Address, City - 123456'
    },
    mobile: {
        type: String,
        required: true,
        default: '9876543210'
    },
    email: {
        type: String,
        default: ''
    },
    gstin: {
        type: String,
        default: ''
    },
    logo: {
        type: String,
        default: '' // Path to uploaded logo
    },
    terms: {
        type: String,
        default: 'Goods once sold will not be taken back.\nWarranty as per manufacturer terms.'
    }
}, {
    timestamps: true
});

const Shop = mongoose.model('Shop', shopSchema);

export default Shop;
