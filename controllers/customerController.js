import Customer from '../models/Customer.js';

export const getCustomers = async (req, res) => {
    try {
        const customers = await Customer.find({});
        res.json(customers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: 'Error fetching customers', error: error.message });
    }
};

export const getCustomerById = async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id).populate('purchaseHistory');

        if (customer) {
            res.json(customer);
        } else {
            res.status(404).json({ message: 'Customer not found' });
        }
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ message: 'Error fetching customer', error: error.message });
    }
};

export const createCustomer = async (req, res) => {
    try {
        const { name, mobile, address, idProof } = req.body;

        // Validation
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Customer name is required' });
        }

        if (!mobile || !mobile.trim()) {
            return res.status(400).json({ message: 'Mobile number is required' });
        }

        const cleanedMobile = mobile.trim();
        const mobileRegex = /^[6-9]\d{9}$/;
        if (!mobileRegex.test(cleanedMobile)) {
            return res.status(400).json({ message: 'Mobile number must be 10 digits and start with 6, 7, 8, or 9' });
        }

        const customerExists = await Customer.findOne({ mobile: cleanedMobile });

        if (customerExists) {
            return res.status(400).json({ message: 'Customer with this mobile number already exists' });
        }

        const customer = await Customer.create({
            name: name.trim(),
            mobile: cleanedMobile,
            address: address ? address.trim() : '',
            idProof: idProof || ''
        });
        res.status(201).json(customer);
    } catch (error) {
        console.error("Error creating customer:", error);
        res.status(400).json({ message: 'Error creating customer', error: error.message });
    }
};

export const updateCustomer = async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Validate mobile if provided
        if (req.body.mobile) {
            const cleanedMobile = String(req.body.mobile).trim();
            const mobileRegex = /^[6-9]\d{9}$/;
            if (!mobileRegex.test(cleanedMobile)) {
                return res.status(400).json({ message: 'Mobile number must be 10 digits and start with 6, 7, 8, or 9' });
            }

            // Check if mobile is already taken by another customer
            const existingCustomer = await Customer.findOne({ mobile: cleanedMobile });
            if (existingCustomer && existingCustomer._id.toString() !== req.params.id) {
                return res.status(400).json({ message: 'Mobile number already belongs to another customer' });
            }

            customer.mobile = cleanedMobile;
        }

        if (req.body.name !== undefined) {
            customer.name = req.body.name ? req.body.name.trim() : customer.name;
        }
        if (req.body.address !== undefined) {
            customer.address = req.body.address ? req.body.address.trim() : customer.address;
        }
        if (req.body.idProof !== undefined) {
            customer.idProof = req.body.idProof || customer.idProof;
        }
        if (req.body.outstandingBalance !== undefined) {
            customer.outstandingBalance = Math.max(0, Number(req.body.outstandingBalance || 0));
        }

        const updatedCustomer = await customer.save();
        res.json(updatedCustomer);
    } catch (error) {
        console.error("Error updating customer:", error);
        res.status(400).json({ message: 'Error updating customer', error: error.message });
    }
};
