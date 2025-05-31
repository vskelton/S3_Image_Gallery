const express = require('express');
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fileUpload= require('express-fileupload');
const cors = require('cors')

const S3_BUCKET_NAME = 'cftask2-4';
const PORT = 3000;
const s3Client = new S3Client({ region: 'us-east-1' });
const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[Backend] Incoming Request: ${req.method} ${req.url}`);
  next();
});

app.use(fileUpload({
  createParentPath: true
}));

app.get('/api/s3/list-objects', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME });
    const data = await s3Client.send(command);
    const objects = data.Contents ? data.Contents.map(obj => ({
      Key: obj.Key,
      Size: obj.Size,
      LastModified: obj.LastModified
    })) : [];
    res.json({ success: true, objects });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list objects', error: error.message });
  }
});

app.post('/api/s3/upload', async (req, res) => {

  if(!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ success: false, message: 'No files were uploaded.' });
  }

  const uploadedFile = req.files.file;

  if (!uploadedFile) {
    return res.status(400).json({ success: false, message: 'No file found in the "file" field.' });
  }

  const fileName= uploadedFile.name;
  const fileData = uploadedFile.data;
  const fileMimeType = uploadedFile.mimetype;

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: fileName,
      Body: fileData,
      ContentType: fileMimeType
    });
    await s3Client.send(command);
    res.json({ success: true, message: 'File uploaded successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload file', error: error.message });
  }
});

app.get('/api/s3/get-object/:key', async (req, res) => {
  const objectKey = req.params.key;

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: objectKey
    });
    const data = await s3Client.send(command);
    res.setHeader('Content-Type', data.ContentType);
    data.Body.pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve object', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});