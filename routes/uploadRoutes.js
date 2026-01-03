import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { protect } from '../middlewares/authMiddleware.js';
const router = express.Router();

// Use memory storage for multer
const storage = multer.memoryStorage();

function checkFileType(file, cb) {
    const filetypes = /jpg|jpeg|png|webp/;
    const extname = filetypes.test(file.originalname.toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Images only!'));
    }
}

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
});

router.post('/', protect, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Validate file size (additional check)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'mobile_billing' },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary Upload Error:', error);
                    return res.status(500).json({ message: 'Cloudinary upload failed', error: error.message });
                }
                if (!result || !result.secure_url) {
                    return res.status(500).json({ message: 'Upload succeeded but no URL returned' });
                }
                res.json({
                    message: 'Image uploaded successfully',
                    imagePath: result.secure_url,
                });
            }
        );

        uploadStream.end(req.file.buffer);
    } catch (error) {
        console.error('Upload route error:', error);
        res.status(500).json({ message: 'Upload failed', error: error.message });
    }
});

// @desc    Upload multiple images to Cloudinary
// @route   POST /api/upload/multiple
// @access  Private
router.post('/multiple', protect, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        // Validate file sizes
        const oversizedFiles = req.files.filter(file => file.size > 5 * 1024 * 1024);
        if (oversizedFiles.length > 0) {
            return res.status(400).json({ message: 'One or more files exceed 5MB limit' });
        }

        const uploadPromises = req.files.map((file) => {
            return new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'mobile_billing' },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else if (!result || !result.secure_url) {
                            reject(new Error('Upload succeeded but no URL returned'));
                        } else {
                            resolve(result.secure_url);
                        }
                    }
                );
                uploadStream.end(file.buffer);
            });
        });

        const imagePaths = await Promise.all(uploadPromises);

        // Filter out any null/undefined results
        const validPaths = imagePaths.filter(path => path);

        if (validPaths.length === 0) {
            return res.status(500).json({ message: 'No images were successfully uploaded' });
        }

        res.json({
            message: `${validPaths.length} image(s) uploaded successfully`,
            imagePaths: validPaths,
        });
    } catch (error) {
        console.error('Cloudinary Multi-Upload Error:', error);
        res.status(500).json({ message: 'Cloudinary upload failed', error: error.message });
    }
});

export default router;

