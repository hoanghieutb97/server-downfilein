# React File Uploader với Progress Tracking

Ứng dụng React kết nối với Node.js server để nén file và upload lên Google Drive với real-time progress tracking.

## 🚀 Cài đặt

### 1. Cài đặt dependencies:
```bash
npm install socket.io-client axios
```

### 2. Đảm bảo Node.js server đang chạy:
```bash
# Trong thư mục gốc của project
npm run dev
```

### 3. Chạy React app:
```bash
npm start
```

## 📁 Cấu trúc files:

```
react-example/
├── ApiService.js          # Service để kết nối với server
├── FileUploader.jsx       # Component chính
├── FileUploader.css       # Styles cho component
├── App.js                 # App component
└── README.md              # Hướng dẫn này
```

## 🔧 Tính năng:

### ✅ **Progress Tracking Real-time:**
- Hiển thị tiến trình nén file (0-50%)
- Hiển thị tiến trình upload lên Drive (50-100%)
- Thông báo lỗi chi tiết nếu có

### ✅ **File Browser:**
- Duyệt thư mục trên server
- Chọn nhiều file để nén
- Hiển thị danh sách file đã chọn

### ✅ **Downloads Management:**
- Xem danh sách file đã download
- Download file từ server
- Xóa file không cần thiết

### ✅ **Google Drive Integration:**
- Tự động upload lên Google Drive
- Hiển thị link file trên Drive
- Xóa file local sau khi upload

## 🎯 Cách sử dụng:

1. **Kết nối Socket.IO** - Tự động khi component mount
2. **Duyệt thư mục** - Nhập đường dẫn và click "Liệt kê"
3. **Chọn file** - Click vào file để chọn/bỏ chọn
4. **Bắt đầu xử lý** - Click "Bắt đầu nén và upload"
5. **Theo dõi progress** - Xem progress bar và thông báo real-time
6. **Xem kết quả** - Link file trên Google Drive

## 🔌 API Endpoints:

- `GET /list-folder` - Liệt kê thư mục
- `GET /list-downloads` - Liệt kê file đã download
- `DELETE /delete-file/:filename` - Xóa file
- `POST /download-zip-tree` - Nén và upload file

## 📡 Socket.IO Events:

- `progress` - Cập nhật tiến trình xử lý
- `connect` - Kết nối thành công
- `disconnect` - Mất kết nối

## 🎨 UI Features:

- **Responsive design** - Hoạt động trên mobile
- **Progress bar** với màu sắc theo giai đoạn
- **Real-time updates** qua Socket.IO
- **Error handling** với thông báo rõ ràng
- **Modern UI** với animations và transitions

## 🛠️ Troubleshooting:

### Lỗi kết nối Socket.IO:
- Kiểm tra server có đang chạy trên port 4001
- Kiểm tra CORS settings trong server

### Lỗi upload Google Drive:
- Đảm bảo đã setup Google Drive API
- Kiểm tra file credentials.json và token.json

### Lỗi liệt kê thư mục:
- Kiểm tra quyền truy cập thư mục
- Đảm bảo đường dẫn chính xác 