const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Cấu hình Google Drive API
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Thông tin credentials - bạn cần tạo file credentials.json từ Google Cloud Console
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DEFAULT_GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1whUOyNSEHlMkAKqdkM5CrnRLCCL-dRn8';

// Hàm tạo Google Drive client
function createDriveClient() {
    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        // Đọc token từ file (nếu có)
        const tokenPath = path.join(__dirname, 'token.json');
        if (fs.existsSync(tokenPath)) {
            const token = JSON.parse(fs.readFileSync(tokenPath));
            oAuth2Client.setCredentials(token);
        }
        
        return google.drive({ version: 'v3', auth: oAuth2Client });
    } catch (error) {
        console.error('Lỗi khi tạo Google Drive client:', error.message);
        return null;
    }
}

// Hàm upload file lên Google Drive với progress tracking cho file lớn
async function uploadToDrive(filePath, fileName, folderId = null, onProgress = null) {
    const drive = createDriveClient();
    if (!drive) {
        throw new Error('Không thể tạo Google Drive client');
    }

    try {
        const fileSize = fs.statSync(filePath).size;
        const targetFolderId = folderId || DEFAULT_GOOGLE_DRIVE_FOLDER_ID || undefined;
        const fileMetadata = {
            name: fileName,
            parents: targetFolderId ? [targetFolderId] : undefined
        };

        // Tối ưu: Sử dụng resumable upload cho file lớn (> 10MB)
        if (fileSize > 10 * 1024 * 1024) {
            return await uploadLargeFileResumable(drive, filePath, fileMetadata, onProgress);
        } else if (fileSize > 5 * 1024 * 1024) {
            return await uploadLargeFile(drive, filePath, fileMetadata, onProgress);
        } else {
            return await uploadSmallFile(drive, filePath, fileMetadata, onProgress);
        }
    } catch (error) {
        console.error('Lỗi khi upload lên Google Drive:', error);
        throw error;
    }
}

// Upload file nhỏ (< 5MB)
async function uploadSmallFile(drive, filePath, fileMetadata, onProgress) {
    const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath)
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
    });

    if (onProgress) {
        onProgress(100);
    }

    return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink
    };
}

// Upload file lớn với chunked upload
async function uploadLargeFile(drive, filePath, fileMetadata, onProgress) {
    const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath)
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
        supportsTeamDrives: true
    });

    if (onProgress) {
        onProgress(100);
    }

    return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink
    };
}

// Upload file rất lớn với resumable upload và progress tracking
async function uploadLargeFileResumable(drive, filePath, fileMetadata, onProgress) {
    const fileSize = fs.statSync(filePath).size;
    const chunkSize = 256 * 1024; // 256KB chunks
    let uploadedBytes = 0;

    // Tạo resumable upload session
    const resumableSession = await drive.files.create({
        resource: fileMetadata,
        media: {
            mimeType: 'application/zip',
            body: fs.createReadStream(filePath, { highWaterMark: chunkSize })
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
        supportsTeamDrives: true,
        // Bật resumable upload
        resumable: true
    });

    // Theo dõi progress của resumable upload
    const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
    
    readStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        if (onProgress) {
            const progress = Math.round((uploadedBytes / fileSize) * 100);
            onProgress(progress);
        }
    });

    // Đợi upload hoàn thành
    await new Promise((resolve, reject) => {
        readStream.on('end', resolve);
        readStream.on('error', reject);
    });

    if (onProgress) {
        onProgress(100);
    }

    return {
        fileId: resumableSession.data.id,
        fileName: resumableSession.data.name,
        webViewLink: resumableSession.data.webViewLink
    };
}

// Hàm tạo thư mục trên Google Drive
async function createFolder(folderName, parentFolderId = null) {
    const drive = createDriveClient();
    if (!drive) {
        throw new Error('Không thể tạo Google Drive client');
    }

    try {
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentFolderId ? [parentFolderId] : undefined
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, name'
        });

        return {
            folderId: response.data.id,
            folderName: response.data.name
        };
    } catch (error) {
        console.error('Lỗi khi tạo thư mục trên Google Drive:', error);
        throw error;
    }
}

module.exports = {
    createDriveClient,
    uploadToDrive,
    createFolder,
    DEFAULT_GOOGLE_DRIVE_FOLDER_ID
}; 