import React, { useState, useEffect } from 'react';
import ApiService, { connectSocket, disconnectSocket } from './ApiService';
import './FileUploader.css';

const FileUploader = () => {
    const [rootPath, setRootPath] = useState('.');
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [folderContent, setFolderContent] = useState([]);
    const [downloads, setDownloads] = useState([]);
    const [progress, setProgress] = useState({
        stage: 'idle',
        message: 'Sẵn sàng',
        percent: 0
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        // Kết nối socket khi component mount
        connectSocket();
        
        // Load danh sách downloads
        loadDownloads();
        
        // Cleanup khi unmount
        return () => {
            disconnectSocket();
        };
    }, []);

    const loadFolder = async () => {
        try {
            const data = await ApiService.listFolder(rootPath);
            setFolderContent(data);
        } catch (error) {
            alert('Lỗi: ' + error.message);
        }
    };

    const loadDownloads = async () => {
        try {
            const data = await ApiService.listDownloads();
            setDownloads(data.files || []);
        } catch (error) {
            console.error('Lỗi khi load downloads:', error);
        }
    };

    const handleFileSelect = (fileName) => {
        const fullPath = `${rootPath}/${fileName}`.replace(/\/+/g, '/');
        setSelectedFiles(prev => {
            if (prev.includes(fullPath)) {
                return prev.filter(f => f !== fullPath);
            } else {
                return [...prev, fullPath];
            }
        });
    };

    const handleStartProcess = async () => {
        if (selectedFiles.length === 0) {
            alert('Vui lòng chọn ít nhất một file!');
            return;
        }

        setIsProcessing(true);
        setProgress({
            stage: 'starting',
            message: 'Đang khởi tạo...',
            percent: 0
        });
        setResult(null);

        try {
            const result = await ApiService.downloadZipTree(
                selectedFiles,
                rootPath,
                (progressData) => {
                    setProgress({
                        stage: progressData.stage,
                        message: progressData.message,
                        percent: progressData.progress
                    });
                }
            );

            setResult(result);
            setProgress({
                stage: 'completed',
                message: 'Hoàn thành!',
                percent: 100
            });

            // Refresh downloads list
            await loadDownloads();

        } catch (error) {
            setProgress({
                stage: 'error',
                message: 'Lỗi: ' + error.message,
                percent: 0
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteFile = async (filename) => {
        if (window.confirm(`Bạn có chắc muốn xóa file "${filename}"?`)) {
            try {
                await ApiService.deleteFile(filename);
                await loadDownloads();
            } catch (error) {
                alert('Lỗi: ' + error.message);
            }
        }
    };

    const getProgressColor = () => {
        switch (progress.stage) {
            case 'start': return '#2196F3';
            case 'compressing': return '#FF9800';
            case 'uploading': return '#9C27B0';
            case 'completed': return '#4CAF50';
            case 'error': return '#f44336';
            default: return '#e0e0e0';
        }
    };

    return (
        <div className="file-uploader">
            <h1>📁 File Uploader với Progress Tracking</h1>

            {/* Progress Bar */}
            <div className="progress-container">
                <h3>Tiến trình xử lý</h3>
                <div className="progress-bar">
                    <div 
                        className="progress-fill"
                        style={{ 
                            width: `${progress.percent}%`,
                            backgroundColor: getProgressColor()
                        }}
                    />
                </div>
                <div className={`status ${progress.stage}`}>
                    {progress.stage.toUpperCase()}
                </div>
                <div className="message">{progress.message}</div>
            </div>

            {/* Folder Browser */}
            <div className="section">
                <h3>📂 Duyệt thư mục</h3>
                <div className="input-group">
                    <input
                        type="text"
                        value={rootPath}
                        onChange={(e) => setRootPath(e.target.value)}
                        placeholder="Đường dẫn thư mục"
                    />
                    <button onClick={loadFolder} disabled={isProcessing}>
                        Liệt kê
                    </button>
                </div>

                <div className="folder-content">
                    {folderContent.map((item, index) => (
                        <div 
                            key={index}
                            className={`folder-item ${item.isDir ? 'folder' : 'file'}`}
                            onClick={() => !item.isDir && handleFileSelect(item.name)}
                        >
                            <span className="icon">
                                {item.isDir ? '📁' : '📄'}
                            </span>
                            <span className="name">{item.name}</span>
                            {!item.isDir && selectedFiles.includes(`${rootPath}/${item.name}`.replace(/\/+/g, '/')) && (
                                <span className="selected">✓</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Selected Files */}
            <div className="section">
                <h3>📋 File đã chọn ({selectedFiles.length})</h3>
                <div className="selected-files">
                    {selectedFiles.map((file, index) => (
                        <div key={index} className="selected-file">
                            <span>{file}</span>
                            <button 
                                onClick={() => setSelectedFiles(prev => prev.filter(f => f !== file))}
                                className="remove-btn"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <button 
                    onClick={handleStartProcess}
                    disabled={isProcessing || selectedFiles.length === 0}
                    className="start-btn"
                >
                    {isProcessing ? 'Đang xử lý...' : 'Bắt đầu nén và upload'}
                </button>
            </div>

            {/* Downloads */}
            <div className="section">
                <h3>📥 File đã download</h3>
                <button onClick={loadDownloads} className="refresh-btn">
                    🔄 Làm mới
                </button>
                <div className="downloads-list">
                    {downloads.map((file, index) => (
                        <div key={index} className="download-item">
                            <div className="file-info">
                                <strong>{file.name}</strong>
                                <small>
                                    {(file.size / 1024 / 1024).toFixed(2)} MB | 
                                    {new Date(file.modified).toLocaleString('vi-VN')}
                                </small>
                            </div>
                            <div className="actions">
                                <a 
                                    href={`http://localhost:4001${file.downloadUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="download-link"
                                >
                                    Download
                                </a>
                                <button 
                                    onClick={() => handleDeleteFile(file.name)}
                                    className="delete-btn"
                                >
                                    Xóa
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Result */}
            {result && (
                <div className="result-section">
                    <h3>🎉 Kết quả</h3>
                    <div className="result-card">
                        <p><strong>File ID:</strong> {result.details?.fileId}</p>
                        <p><strong>File Name:</strong> {result.details?.fileName}</p>
                        <p><strong>Link:</strong> 
                            <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer">
                                {result.downloadUrl}
                            </a>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileUploader; 