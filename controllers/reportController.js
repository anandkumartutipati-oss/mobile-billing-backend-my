import Invoice from '../models/Invoice.js';
import Product from '../models/Product.js';

// @desc    Get Sales Report (Date Range)
// @route   GET /api/reports/sales
// @access  Private/Admin
export const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, groupBy } = req.query;

        // Validate date inputs
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Validate dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' });
        }

        if (start > end) {
            return res.status(400).json({ message: 'Start date cannot be after end date' });
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // Base match stage
        const matchStage = {
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'Cancelled' } // Exclude cancelled invoices
        };

        const invoices = await Invoice.find(matchStage).populate('customer', 'name').sort({ createdAt: -1 });

        // Calcluate Summary
        let totalSales = 0;
        let totalProfit = 0;
        let totalDiscount = 0;
        let totalGST = 0;

        const detailedData = (invoices || []).map(inv => {
            if (!inv) return null;

            let costPrice = 0;
            (inv.items || []).forEach(item => {
                if (item) {
                    costPrice += Math.max(0, Number(item.purchasePrice || 0)) * Math.max(0, Number(item.quantity || 0));
                }
            });

            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));
            const gstTotal = Math.max(0, Number(inv.gstTotal || 0));

            // Profit = Net Revenue (Tax Exclusive) - Cost
            // Net Revenue (Tax Exclusive) = GrandTotal - GSTTotal
            const netRevenue = grandTotal - gstTotal;
            const profit = netRevenue - costPrice;

            const discount = Math.max(0, Number(inv.discount || 0));

            totalSales += grandTotal;
            totalProfit += profit;
            totalDiscount += discount;
            totalGST += gstTotal;

            const customerName = inv.customer?.name || inv.customerName || 'Walk-in';

            return {
                _id: inv._id,
                invoiceNumber: inv.invoiceNumber || 'N/A',
                date: inv.createdAt || new Date(),
                customer: customerName,
                mobile: inv.customerMobile || (inv.customer?.mobile || 'N/A'),
                itemCount: (inv.items || []).length,
                amount: grandTotal,
                profit: profit,
                paymentMode: inv.paymentMode || 'Cash'
            };
        }).filter(Boolean);

        // Grouping logic (Day-wise / Month-wise) usually handled by frontend table or separate aggregation. 
        // Sending flat list + summary is often most flexible for React.

        res.json({
            summary: {
                totalSales,
                totalProfit,
                totalDiscount,
                totalGST,
                count: invoices.length
            },
            data: detailedData
        });

    } catch (error) {
        console.error("Sales Report Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Stock Report
// @route   GET /api/reports/stock
// @access  Private/Admin
export const getStockReport = async (req, res) => {
    try {
        const products = await Product.find({}).sort({ name: 1 });

        let totalStockValue = 0;
        let totalItems = 0;
        let lowStockCount = 0;

        const stockData = (products || []).map(p => {
            if (!p) return null;

            const stockQuantity = Math.max(0, Number(p.stockQuantity || 0));
            const purchasePrice = Math.max(0, Number(p.purchasePrice || 0));
            const sellingPrice = Math.max(0, Number(p.sellingPrice || 0));
            const lowStockThreshold = Math.max(0, Number(p.lowStockThreshold || 0));

            const stockValue = stockQuantity * purchasePrice;
            totalStockValue += stockValue;
            totalItems += stockQuantity;

            if (stockQuantity <= lowStockThreshold) {
                lowStockCount++;
            }

            return {
                _id: p._id,
                name: p.name || '',
                brand: p.brand || '',
                category: p.category || '',
                stock: stockQuantity,
                purchasePrice: purchasePrice,
                sellingPrice: sellingPrice,
                stockValue: stockValue, // Purchase Value
                potentialRevenue: stockQuantity * sellingPrice // Selling Value
            };
        }).filter(Boolean);

        res.json({
            summary: {
                totalStockValue,
                totalItems,
                lowStockCount,
                uniqueProducts: products.length
            },
            data: stockData
        });

    } catch (error) {
        console.error("Stock Report Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get GST Report
// @route   GET /api/reports/gst
// @access  Private/Admin
export const getGSTReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validate date inputs
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Validate dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' });
        }

        if (start > end) {
            return res.status(400).json({ message: 'Start date cannot be after end date' });
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        const invoices = await Invoice.find({
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'Cancelled' }
        });

        let totalTaxable = 0;
        let totalGST = 0;
        let totalAmount = 0;

        const gstData = (invoices || []).map(inv => {
            if (!inv) return null;

            const subTotal = Math.max(0, Number(inv.subTotal || 0));
            const gstTotal = Math.max(0, Number(inv.gstTotal || 0));
            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));

            totalTaxable += subTotal;
            totalGST += gstTotal;
            totalAmount += grandTotal;

            return {
                invoiceNumber: inv.invoiceNumber || 'N/A',
                date: inv.createdAt || new Date(),
                taxableAmount: subTotal,
                gstAmount: gstTotal,
                totalAmount: grandTotal
            };
        }).filter(Boolean);

        res.json({
            summary: {
                totalTaxable,
                totalGST,
                totalAmount
            },
            data: gstData
        });

    } catch (error) {
        console.error("GST Report Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Profit Breakdown (Item-wise)
// @route   GET /api/reports/profit-breakdown
// @access  Private
export const getProfitBreakdown = async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            const targetDate = date ? new Date(date) : new Date();
            start = new Date(targetDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(targetDate);
            end.setHours(23, 59, 59, 999);
        }

        const invoices = await Invoice.find({
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'Cancelled' }
        });

        const itemProfitMap = {};

        (invoices || []).forEach(inv => {
            if (!inv || !inv.items) return;

            const currentGrandTotal = Math.max(0, Number(inv.grandTotal || 0));
            const invoiceGrossTotal = (inv.items || []).reduce((sum, item) => {
                const qty = Math.max(0, Number(item.quantity || 0));
                const itemTotal = Number(item.total) || (Number(item.price || 0) * qty);
                return sum + itemTotal;
            }, 0);

            (inv.items || []).forEach(item => {
                if (!item || !item.name) return;
                const key = item.name;
                const quantity = Math.max(0, Number(item.quantity || 0));
                const purchasePrice = Math.max(0, Number(item.purchasePrice || 0));

                const itemGross = Number(item.total) || (Number(item.price || 0) * quantity);
                let itemNetRevenue = itemGross;
                if (invoiceGrossTotal > 1) {
                    itemNetRevenue = (itemGross / invoiceGrossTotal) * currentGrandTotal;
                }

                const cost = purchasePrice * quantity;
                const profit = itemNetRevenue - cost;

                if (!itemProfitMap[key]) {
                    itemProfitMap[key] = {
                        name: item.name,
                        quantity: 0,
                        revenue: 0,
                        profit: 0
                    };
                }
                itemProfitMap[key].quantity += quantity;
                itemProfitMap[key].revenue += itemNetRevenue;
                itemProfitMap[key].profit += profit;
            });
        });

        res.json(Object.values(itemProfitMap).sort((a, b) => b.profit - a.profit));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Sales Chart Data (Last 7 Days)
// @route   GET /api/reports/chart-data
// @access  Private
export const getSalesChartData = async (req, res) => {
    try {
        // Accept startDate and endDate from query params
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate)
            : new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 29);

        // Set time to start of day for startDate and end of day for endDate
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const salesData = await Invoice.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    totalSales: { $sum: "$grandTotal" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Calculate number of days between start and end
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // Fill in missing days
        const chartData = [];
        for (let i = 0; i < daysDiff; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const found = salesData.find(s => s._id === dateStr);
            chartData.push({
                date: new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                sales: found ? found.totalSales : 0,
                transactions: found ? found.count : 0
            });
        }

        res.json(chartData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Daily Sales Data (Last 7 Days)
// @route   GET /api/reports/weekly-sales
// @access  Private
export const getWeeklySalesData = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        // Calculate start date (6 days ago, so total 7 days including today)
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        // Get all invoices in the date range
        const invoices = await Invoice.find({
            createdAt: { $gte: startDate, $lte: today },
            status: { $ne: 'Cancelled' }
        });

        // Group by day and calculate revenue and profit
        const dailyMap = {};

        (invoices || []).forEach(inv => {
            if (!inv) return;

            const invDate = inv.createdAt ? new Date(inv.createdAt) : new Date();
            if (isNaN(invDate.getTime())) return;

            const dayStart = new Date(invDate);
            dayStart.setHours(0, 0, 0, 0);

            const dayKey = dayStart.toISOString().split('T')[0];

            if (!dailyMap[dayKey]) {
                dailyMap[dayKey] = {
                    date: dayStart,
                    revenue: 0,
                    profit: 0,
                    count: 0
                };
            }

            // Calculate cost price for this invoice
            let costPrice = 0;
            (inv.items || []).forEach(item => {
                if (item) {
                    costPrice += Math.max(0, Number(item.purchasePrice || 0)) * Math.max(0, Number(item.quantity || 0));
                }
            });

            const subTotal = Math.max(0, Number(inv.subTotal || 0));
            const discount = Math.max(0, Number(inv.discount || 0));
            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));

            // Profit = (SubTotal - Cost) - Discount
            const invoiceProfit = Math.max(0, (subTotal - costPrice) - discount);

            dailyMap[dayKey].revenue += grandTotal;
            dailyMap[dayKey].profit += invoiceProfit;
            dailyMap[dayKey].count += 1;
        });

        // Create daily labels and fill in missing days
        const dailyData = [];
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(startDate);
            currentDay.setDate(startDate.getDate() + i);
            currentDay.setHours(0, 0, 0, 0);

            const dayKey = currentDay.toISOString().split('T')[0];
            const found = dailyMap[dayKey];

            dailyData.push({
                day: currentDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                revenue: found ? Math.round(found.revenue) : 0,
                profit: found ? Math.round(found.profit) : 0,
                transactions: found ? found.count : 0
            });
        }

        res.json(dailyData);
    } catch (error) {
        console.error("Daily Sales Data Error:", error);
        res.status(500).json({ message: error.message });
    }
};
