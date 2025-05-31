const express = require('express');
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner'); // Corrected import path
const fileUpload = require('express-fileupload');
const cors = require('cors')

// --- Configuration ---
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'cftask2-5';
const S3_PREFIX_ORIGINAL = process.env.S3_PREFIX_ORIGINAL || 'original-images/';
const S3_PREFIX_RESIZED = process.env.S3_PREFIX_RESIZED || 'resized/';
const PORT = 3000;
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }); // Use env variable for region

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    createParentPath: true
}));

app.use((req, res, next) => {
    console.log(`[Backend] Incoming Request: ${req.method} ${req.url}`);
    next();
});

// --- API Endpoints ---

// Upload Endpoint: Uploads to original-images/
app.post('/api/s3/upload', async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ success: false, message: 'No files were uploaded.' });
    }

    const uploadedFile = req.files.file;
    if (!uploadedFile) {
        return res.status(400).json({ success: false, message: 'No file found in the "file" field.' });
    }

    const originalFileName = `${Date.now()}-${uploadedFile.name}`;
    const originalKey = `${S3_PREFIX_ORIGINAL}${originalFileName}`;

    try {
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: originalKey,
            Body: uploadedFile.data,
            ContentType: uploadedFile.mimetype // Corrected: .fileMimeType -> .mimetype
        });
        await s3Client.send(command);
        res.json({ success: true, message: 'File uploaded to original-images/ successfully. Resizing will occur shortly.' });
    } catch (error) {
        console.error('Failed to upload file to S3:', error);
        res.status(500).json({ success: false, message: 'Failed to upload file to S3', error: error.message });
    }
});

// List Images (original and resized, with pre-signed URLs)
// Renamed from list-objects to list-images to match frontend expectation
app.get('/api/s3/list-images', async (req, res) => {
    try {
        const resizedObjectsCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET_NAME,
            Prefix: S3_PREFIX_RESIZED,
        });
        const resizedData = await s3Client.send(resizedObjectsCommand);

        const images = [];

        if (resizedData.Contents && resizedData.Contents.length > 0) {
            for (const item of resizedData.Contents) {
                if (item.Size === 0) continue;

                const resizedKey = item.Key; // Corrected: item.key -> item.Key
                const fileName = item.Key.substring(S3_PREFIX_RESIZED.length);
                const originalKey = `${S3_PREFIX_ORIGINAL}${fileName}`;

                // Generate pre-signed URL for the thumbnail (resized image)
                const thumbnailUrl = await getSignedUrl(s3Client, new GetObjectCommand({
                    Bucket: S3_BUCKET_NAME,
                    Key: resizedKey // Corrected: Should be resizedKey for thumbnail
                }), { expiresIn: 3600 }); // URL valid for 1 hour

                // Generate pre-signed URL for the original image
                const originalImageUrl = await getSignedUrl(s3Client, new GetObjectCommand({
                    Bucket: S3_BUCKET_NAME,
                    Key: originalKey
                }), { expiresIn: 3600 }); // URL valid for 1 hour

                images.push({
                    fileName: fileName,
                    thumbnailUrl: thumbnailUrl,
                    originalUrl: originalImageUrl, // Corrected: originalImageUrl is now defined
                    lastModified: item.LastModified
                });
            }
        }
        res.json({ success: true, images });
    } catch (error) {
        console.error('Failed to list images:', error);
        res.status(500).json({ success: false, message: 'Failed to list images from S3', error: error.message });
    }
});

// Get Object Endpoint (downloads object directly through backend)
app.get('/api/s3/get-object/:key', async (req, res) => {
    const objectKey = req.params.key;

    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: objectKey
        });
        const data = await s3Client.send(command);

        if (data.Body) {
            res.setHeader('Content-Type', data.ContentType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${objectKey.split('/').pop()}"`); // Corrected spelling: Content-Dipsostion -> Content-Disposition
            data.Body.pipe(res);
        } else {
            res.status(404).json({ success: false, message: 'Object body not found.' });
        }
    } catch (error) {
        if (error.Code === 'NoSuchKey') {
            res.status(404).json({ success: false, message: `Object with key '${objectKey}' not found.` });
        } else {
            console.error('Failed to retrieve object:', error);
            res.status(500).json({ success: false, message: 'Failed to retrieve object', error: error.message });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});