const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cors = require('cors');
const { uploadToLark } = require('./lark-drive-config');

const app = express();
app.use(express.json({ limit: '50mb' })); // Tăng limit cho JSON
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
    res.header('Access-Control-Expose-Headers', 'Content-Disposition,content-disposition');
    next();
});

// ---- Thêm cho socket.io ----
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { 
    cors: { origin: '*' },
    // Tối ưu Socket.IO performance
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
});

// Tối ưu: Cache cho file system operations
const fileCache = new Map();
const CACHE_TTL = 30000; // 30 giây

// Hàm helper để lấy file info với cache
function getFileInfo(filePath) {
    const cacheKey = filePath;
    const cached = fileCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    try {
        const stats = fs.statSync(filePath);
        const data = {
            exists: true,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime
        };
        
        fileCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        return data;
    } catch (error) {
        const data = { exists: false };
        fileCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        return data;
    }
}

app.get('/list-folder', (req, res) => {
    const folderPath = req.query.path;
    
    // Tối ưu: Sử dụng async/await thay vì callback
    (async () => {
        try {
            const files = await fs.promises.readdir(folderPath, { withFileTypes: true });
            const result = files.map(f => ({
                name: f.name,
                isDir: f.isDirectory()
            }));
            res.json(result);
        } catch (err) {
            if (err.code === "ENOENT") {
                return res.status(404).json({ error: "Không tồn tại thư mục" });
            }
            if (err.code === "EACCES" || err.code === "EPERM") {
                return res.status(403).json({ error: "Không có quyền truy cập thư mục" });
            }
            return res.status(400).json({ error: "Không đọc được thư mục" });
        }
    })();
});
app.post('/download-zip-tree', async (req, res) => {
    console.log("Bắt đầu nén file...");
    
    const { selected, rootPath, socketId } = req.body;
    const zipName = `${rootPath ? rootPath.split(/[/\\]/).filter(Boolean).pop() : 'selected_files'}.zip`;
    const zipPath = path.join(__dirname, 'downloads', zipName);
    const output = fs.createWriteStream(zipPath);
    
    // Tối ưu cho file lớn: Giảm compression level để tăng tốc độ
    const archive = archiver('zip', { 
        zlib: { 
            level: 3  // Giảm từ 6 xuống 3 cho file lớn (tốc độ > kích thước)
        },
        store: false,
        // Tối ưu memory cho file lớn
        highWaterMark: 1024 * 1024, // 1MB buffer
        maxListeners: 0
    });
    
    // Gửi thông báo bắt đầu
    if (socketId) {
        io.to(socketId).emit('progress', {
            stage: 'start',
            message: 'Bắt đầu nén file lớn...',
            progress: 0
        });
    }

    archive.on('error', err => {
        console.log('ARCHIVE ERROR', err);
        if (socketId) {
            io.to(socketId).emit('progress', {
                stage: 'error',
                message: 'Lỗi khi nén file: ' + err.message,
                progress: 0
            });
        }
        return res.status(500).json({ error: 'Không thể nén file' });
    });

    // Theo dõi tiến trình nén với cập nhật thường xuyên hơn cho file lớn
    let lastProgressUpdate = 0;
    let lastTimeUpdate = Date.now();
    
    archive.on('progress', (progress) => {
        if (socketId) {
            const percent = Math.round((progress.fs.processedBytes / progress.fs.totalBytes) * 100);
            const currentTime = Date.now();
            
            // Cập nhật thường xuyên hơn cho file lớn (mỗi 1% hoặc 2 giây)
            if (percent > lastProgressUpdate + 1 || currentTime - lastTimeUpdate > 2000 || percent === 100) {
                lastProgressUpdate = percent;
                lastTimeUpdate = currentTime;
                
                const processedMB = (progress.fs.processedBytes / 1024 / 1024).toFixed(1);
                const totalMB = (progress.fs.totalBytes / 1024 / 1024).toFixed(1);
                const speedMBps = progress.fs.processedBytes > 0 ? 
                    ((progress.fs.processedBytes / 1024 / 1024) / ((currentTime - lastTimeUpdate) / 1000)).toFixed(1) : 0;
                
                io.to(socketId).emit('progress', {
                    stage: 'compressing',
                    message: `Đang nén file lớn... ${percent}% (${processedMB}MB / ${totalMB}MB) - ${speedMBps}MB/s`,
                    progress: percent
                });
            }
        }
    });

    output.on('close', async () => {
        try {
            let result = { downloadUrl: `/downloads/${zipName}` };

            console.log('Đang upload file lớn lên Lark...');
            
            if (socketId) {
                io.to(socketId).emit('progress', {
                    stage: 'uploading',
                    message: 'Đang upload file lớn lên Lark...',
                    progress: 50
                });
            }

            let uploadResult;
            let retryCount = 0;
            const maxRetries = 5;
            
            while (retryCount < maxRetries) {
                try {
                    uploadResult = await uploadToLark(zipPath, zipName, process.env.LARK_FOLDER_TOKEN);
                    break;
                } catch (error) {
                    retryCount++;
                    console.error(`Upload lần ${retryCount} lên Lark thất bại:`, error.message);
                    
                    if (socketId) {
                        io.to(socketId).emit('progress', {
                            stage: 'uploading',
                            message: `Upload lần ${retryCount} thất bại, đang thử lại... (${retryCount}/${maxRetries})`,
                            progress: 50 + (retryCount * 8)
                        });
                    }
                    
                    if (retryCount >= maxRetries) {
                        throw new Error(`Upload Lark thất bại sau ${maxRetries} lần thử: ${error.message}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            result.larkInfo = uploadResult;
            console.log('Upload file lớn lên Lark thành công!', uploadResult.webViewLink || uploadResult.fileToken);

            if (socketId) {
                io.to(socketId).emit('progress', {
                    stage: 'completed',
                    message: 'Upload file lớn thành công!',
                    progress: 100,
                    result: uploadResult
                });
            }

            fs.unlink(zipPath, (err) => {
                if (err) {
                    console.error('Lỗi khi xóa file local:', err);
                } else {
                    console.log('Đã xóa file local lớn:', zipPath);
                }
            });
            res.status(200).json({
                status: 'ok',
                details: uploadResult,
                downloadUrl: uploadResult.webViewLink || result.downloadUrl
            });
        } catch (error) {
            console.error('Lỗi khi upload file lớn lên Lark:', error);
            
            // Thông báo lỗi
            if (socketId) {
                io.to(socketId).emit('progress', {
                    stage: 'error',
                    message: 'Lỗi khi upload file lớn lên Lark: ' + error.message,
                    progress: 0
                });
            }
            
            res.status(500).json({
                error: 'Lỗi khi upload file lớn lên Lark',
                details: error.message,
                downloadUrl: `/downloads/${zipName}`
            });
        }
    });

    archive.pipe(output);
    
    // Tối ưu cho file lớn: Xử lý từng file một thay vì parallel
    for (const fullPath of selected) {
        const fileInfo = getFileInfo(fullPath);
        let relative = fullPath.replace(rootPath, "").replace(/^[/\\]+/, "");
        
        if (fileInfo.exists) {
            if (fileInfo.isDirectory) {
                archive.directory(fullPath, relative);
            } else {
                archive.file(fullPath, { name: relative });
            }
        }
        
        // Thêm delay nhỏ để tránh memory overflow
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    archive.finalize();
});



// Tối ưu: Memory management cho file lớn
setInterval(() => {
    // Clear cache cũ mỗi 2 phút (thường xuyên hơn cho file lớn)
    const now = Date.now();
    for (const [key, value] of fileCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            fileCache.delete(key);
        }
    }
    
    // Force garbage collection nếu có thể
    if (global.gc) {
        global.gc();
    }
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    console.log('📊 Memory Usage:', {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`
    });
}, 2 * 60 * 1000);

server.listen(4001, () => {
    console.log('🚀 Server chạy port 4001');
    console.log('📊 Performance optimizations for LARGE FILES (1-2GB):');
    console.log('   - Compression level: 3 (tối ưu tốc độ)');
    console.log('   - File cache: 30s TTL');
    console.log('   - Retry mechanism: 5 attempts');
    console.log('   - Resumable upload for files > 10MB');
    console.log('   - Memory management: 2min intervals');
    console.log('   - Progress tracking with speed calculation');
    console.log('   - Sequential file processing (tránh memory overflow)');
});

