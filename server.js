const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const archiver = require('archiver');
const { spawn } = require('child_process');
const { uploadPathWithRclone, buildRemoteFolderPath, RCLONE_REMOTE_BASE } = require('./rclone-helper');

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const sendQueue = [];
let isSending = false;

const app = express();
app.use(express.json({ limit: '50mb' })); // Tăng limit cho JSON
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
    res.header('Access-Control-Expose-Headers', 'Content-Disposition,content-disposition');
    next();
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

async function ensureDownloadDir() {
    await fs.promises.mkdir(DOWNLOAD_DIR, { recursive: true });
}

async function cleanupOldZips(maxAgeMs = ONE_DAY_MS) {
    await ensureDownloadDir();
    const now = Date.now();
    const entries = await fs.promises.readdir(DOWNLOAD_DIR);

    for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.zip')) continue;
        const fullPath = path.join(DOWNLOAD_DIR, entry);
        try {   
            const stats = await fs.promises.stat(fullPath);
            // console.log('📦', entry, '- modified:', stats.mtime);
            if (now - stats.mtimeMs > maxAgeMs) {
                await fs.promises.unlink(fullPath);
                console.log('🧹 Đã xóa ZIP cũ:', fullPath);
            }
        } catch (err) {
            console.warn('Không thể xóa file cũ:', fullPath, err.message);
        }
    }
}

function buildZipName(rootPath) {
    if (!rootPath) {
        return `selected_files_${Date.now()}.zip`;
    }
    const base = rootPath.split(/[/\\]/).filter(Boolean).pop() || 'selected_files';
    return `${base}.zip`;
}

async function createZipArchive(selectedPaths, rootPath) {
    await ensureDownloadDir();

    const normalizedRoot = rootPath ? path.resolve(rootPath) : null;
    const zipName = buildZipName(normalizedRoot);
    const zipPath = path.join(DOWNLOAD_DIR, zipName);

    return new Promise(async (resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
            zlib: { level: 3 },
            highWaterMark: 1024 * 1024
        });

        output.on('close', () => resolve({ zipPath, zipName }));
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);

        for (const fullPath of selectedPaths) {
            try {
                const absolute = path.resolve(fullPath);
                const info = getFileInfo(absolute);
                if (!info.exists) {
                    console.warn('Bỏ qua vì không tồn tại:', absolute);
                    continue;
                }

                let relative = normalizedRoot
                    ? absolute.replace(normalizedRoot, '').replace(/^[/\\]+/, '')
                    : '';

                if (!relative) {
                    relative = path.basename(absolute);
                }

                if (info.isDirectory) {
                    archive.directory(absolute, relative);
                } else {
                    archive.file(absolute, { name: relative });
                }
            } catch (err) {
                console.error('Lỗi khi thêm vào zip:', err);
            }
        }

        archive.finalize();
    });
}

function runSendLark(zipPath) {
    return new Promise((resolve, reject) => {
        sendQueue.push({ zipPath, resolve, reject });
        processSendQueue();
    });
}

function processSendQueue() {
    if (isSending || sendQueue.length === 0) {
        return;
    }

    const { zipPath, resolve, reject } = sendQueue.shift();
    isSending = true;

    console.log('Đang chạy script sendlark.py');
    console.log('zipPath:', zipPath);

    // const proc = spawn('python', ['sendlark.py', zipPath], {
    //     cwd: __dirname,
    //     stdio: 'inherit'
    // });

    const pythonPath = "C:/Users/Administrator/AppData/Local/Programs/Python/Python314/python.exe";

const proc=  spawn(pythonPath, [
  "sendlark.py",
  zipPath
]);


    const finish = (err) => {
        isSending = false;
        if (err) {
            reject(err);
        } else {
            resolve();
        }
        processSendQueue();
    };

    proc.on('close', code => {
        if (code === 0) {
            finish();
        } else {
            finish(new Error(`sendlark.py exited with code ${code}`));
        }
    });
    proc.on('error', err => finish(err));
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
    const { selected = [], rootPath } = req.body;

    if (!Array.isArray(selected) || selected.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách file/thư mục để upload' });
    }

    const normalizedRoot = rootPath ? path.resolve(rootPath) : null;
    const driveRootName = normalizedRoot
        ? path.basename(normalizedRoot)
        : `drive_upload_${Date.now()}`;
    const remoteRootPath = buildRemoteFolderPath(driveRootName);

    try {
        console.log(`Upload cây thư mục lên rclone remote: ${remoteRootPath}`);
        for (const itemPath of selected) {
            const absolutePath = path.resolve(itemPath);
            const fileInfo = getFileInfo(absolutePath);

            if (!fileInfo.exists) {
                console.warn('Bỏ qua vì không tồn tại:', absolutePath);
                continue;
            }

            await uploadPathWithRclone(absolutePath, remoteRootPath, normalizedRoot);

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        res.status(200).json({
            status: 'ok',
            remoteBase: RCLONE_REMOTE_BASE,
            remoteFolder: remoteRootPath
        });
    } catch (error) {
        console.error('Lỗi khi upload cây thư mục bằng rclone:', error);
        res.status(500).json({
            error: 'Lỗi khi upload lên Drive qua rclone',
            details: error.message
        });
    }
});

app.post('/zip-and-send-lark', async (req, res) => {
    const { selected = [], rootPath } = req.body;

    if (!Array.isArray(selected) || selected.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách file/thư mục để nén' });
    }

    try {
        const { zipPath, zipName } = await createZipArchive(selected, rootPath);
        console.log('ZIP đã tạo:', zipPath);

        await runSendLark(zipPath);
        console.log('Đã gọi script sendlark.py');

        res.status(200).json({
            status: 'ok',
            zipName,
            zipPath
        });
    } catch (error) {
        console.error('Lỗi zip/send Lark:', error);
        res.status(500).json({
            error: 'Không thể nén hoặc gửi file lên Lark',
            details: error.message
        });
    }
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

}, 2 * 60 * 1000);

app.listen(7001, () => {
    console.log('🚀 Server chạy port 7001');
    console.log('📁 Upload mode: rclone copy/copyto (giữ nguyên cấu trúc thư mục)');
    console.log(`   - Remote base: ${RCLONE_REMOTE_BASE}`);
    console.log('   - File cache: 30s TTL');
    console.log('   - Retry giới hạn do rclone đảm nhiệm');
    console.log('   - Memory management: 2min intervals');
    console.log('   - Sequential file processing (tránh nghẽn IO)');

    cleanupOldZips().catch(err => console.error('Cleanup đầu kỳ thất bại:', err));
    setInterval(() => {
        cleanupOldZips().catch(err => console.error('Cleanup theo lịch thất bại:', err));
    }, ONE_DAY_MS);
});

