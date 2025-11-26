const fs = require('fs');
const path = require('path');

// Script để tạo file test lớn
console.log('🔧 Tạo file test lớn cho testing...');

const testDir = path.join(__dirname, 'test-large-files');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}

// Tạo file 100MB để test
const largeFilePath = path.join(testDir, 'large-test-file.bin');
const fileSize = 100 * 1024 * 1024; // 100MB

console.log(`📁 Tạo file test: ${largeFilePath}`);
console.log(`📊 Kích thước: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

const writeStream = fs.createWriteStream(largeFilePath);
let writtenBytes = 0;
const chunkSize = 1024 * 1024; // 1MB chunks

function writeChunk() {
    if (writtenBytes >= fileSize) {
        writeStream.end();
        console.log('✅ File test lớn đã được tạo thành công!');
        console.log('🎯 Bây giờ bạn có thể test với file này trong React app');
        return;
    }

    const remainingBytes = fileSize - writtenBytes;
    const currentChunkSize = Math.min(chunkSize, remainingBytes);
    
    // Tạo dữ liệu ngẫu nhiên
    const buffer = Buffer.alloc(currentChunkSize);
    for (let i = 0; i < currentChunkSize; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    
    writeStream.write(buffer);
    writtenBytes += currentChunkSize;
    
    // Progress
    const progress = ((writtenBytes / fileSize) * 100).toFixed(1);
    process.stdout.write(`\r📊 Progress: ${progress}% (${(writtenBytes / 1024 / 1024).toFixed(1)}MB)`);
    
    // Tiếp tục ghi chunk tiếp theo
    setImmediate(writeChunk);
}

writeChunk();

// Tạo file nhỏ để test
const smallFilePath = path.join(testDir, 'small-test.txt');
fs.writeFileSync(smallFilePath, 'This is a small test file for testing the upload system.');

console.log('\n📝 File test nhỏ cũng đã được tạo:', smallFilePath);
console.log('\n🎯 Hướng dẫn test:');
console.log('1. Mở React app');
console.log('2. Nhập đường dẫn: ./test-large-files');
console.log('3. Chọn file large-test-file.bin');
console.log('4. Bắt đầu nén và upload');
console.log('5. Theo dõi progress và memory usage'); 