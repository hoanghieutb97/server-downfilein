import axios from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:4001';

// Tạo axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Tạo socket connection
let socket = null;

export const connectSocket = () => {
    if (!socket) {
        socket = io(API_BASE_URL);
        
        socket.on('connect', () => {
            console.log('✅ Đã kết nối Socket.IO:', socket.id);
        });
        
        socket.on('disconnect', () => {
            console.log('❌ Mất kết nối Socket.IO');
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

// API functions
export const ApiService = {
    // Liệt kê thư mục
    listFolder: async (folderPath) => {
        try {
            const response = await apiClient.get('/list-folder', {
                params: { path: folderPath }
            });
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || 'Lỗi khi liệt kê thư mục');
        }
    },

    // Liệt kê file đã download
    listDownloads: async () => {
        try {
            const response = await apiClient.get('/list-downloads');
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || 'Lỗi khi lấy danh sách downloads');
        }
    },

    // Xóa file
    deleteFile: async (filename) => {
        try {
            const response = await apiClient.delete(`/delete-file/${encodeURIComponent(filename)}`);
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.error || 'Lỗi khi xóa file');
        }
    },

    // Nén và upload file
    downloadZipTree: async (selected, rootPath, onProgress) => {
        const socket = connectSocket();
        
        return new Promise((resolve, reject) => {
            // Lắng nghe progress updates
            const progressHandler = (data) => {
                if (onProgress) {
                    onProgress(data);
                }
            };
            
            socket.on('progress', progressHandler);

            // Gọi API
            apiClient.post('/download-zip-tree', {
                selected,
                rootPath,
                socketId: socket.id
            })
            .then(response => {
                socket.off('progress', progressHandler);
                resolve(response.data);
            })
            .catch(error => {
                socket.off('progress', progressHandler);
                reject(new Error(error.response?.data?.error || 'Lỗi khi nén và upload file'));
            });
        });
    }
};

export default ApiService; 