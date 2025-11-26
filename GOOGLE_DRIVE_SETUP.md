# Hướng dẫn setup Google Drive API

## Bước 1: Tạo Google Cloud Project

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project có sẵn
3. Enable Google Drive API:
   - Vào "APIs & Services" > "Library"
   - Tìm "Google Drive API" và click "Enable"

## Bước 2: Tạo Credentials

1. Vào "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Chọn "Desktop application" (nếu chạy local) hoặc "Web application"
4. Đặt tên cho client
5. Download file JSON credentials

## Bước 3: Cấu hình trong project

1. Đổi tên file credentials đã download thành `credentials.json`
2. Đặt file `credentials.json` vào thư mục gốc của project (cùng cấp với `server.js`)

## Bước 4: Tạo file token (lần đầu chạy)

1. Chạy server: `npm run dev`
2. Truy cập URL được hiển thị trong console để authorize
3. Sau khi authorize, token sẽ được lưu vào file `token.json`

## Bước 5: Sử dụng API

### Request mẫu để upload lên Google Drive:

```javascript
fetch('/download-zip-tree', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        selected: ['/path/to/file1', '/path/to/file2'],
        rootPath: '/path/to/root',
        uploadToDrive: true,  // Bật tính năng upload lên Drive
        driveFolderName: 'My Files'  // Tên thư mục trên Drive (tùy chọn)
    })
})
.then(response => response.json())
.then(data => {
    console.log('Download URL:', data.downloadUrl);
    if (data.driveInfo) {
        console.log('Drive File ID:', data.driveInfo.fileId);
        console.log('Drive Web Link:', data.driveInfo.webViewLink);
    }
});
```

### Response mẫu:

```json
{
    "downloadUrl": "/downloads/selected_files.zip",
    "driveInfo": {
        "fileId": "1ABC...",
        "fileName": "selected_files.zip",
        "webViewLink": "https://drive.google.com/file/d/1ABC.../view",
        "folderId": "1XYZ..."
    }
}
```

## Lưu ý quan trọng:

1. **Bảo mật**: Không commit file `credentials.json` và `token.json` lên git
2. **Quota**: Google Drive API có giới hạn quota, kiểm tra trong Google Cloud Console
3. **Permissions**: Đảm bảo OAuth consent screen đã được cấu hình đúng
4. **Scopes**: Chỉ sử dụng scope cần thiết (`https://www.googleapis.com/auth/drive.file`)

## Troubleshooting:

- Nếu gặp lỗi "Invalid Credentials": Kiểm tra lại file `credentials.json`
- Nếu gặp lỗi "Token expired": Xóa file `token.json` và authorize lại
- Nếu gặp lỗi "Quota exceeded": Kiểm tra quota trong Google Cloud Console 