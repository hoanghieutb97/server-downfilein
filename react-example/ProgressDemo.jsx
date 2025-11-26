import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './ProgressDemo.css';

const ProgressDemo = () => {
    const [progress, setProgress] = useState({
        stage: 'idle',
        message: 'Sẵn sàng để test',
        percent: 0
    });
    const [rootPath, setRootPath] = useState('.');
    const [selectedFiles, setSelectedFiles] = useState('test.txt');
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [logs, setLogs] = useState([]);
    const [socket, setSocket] = useState(null);
    const [currentSocketId, setCurrentSocketId] = useState(null);
    const logRef = useRef(null);

    useEffect(() => {
        // Kết nối Socket.IO
        const newSocket = io('http://localhost:4001');
        
        newSocket.on('connect', () => {
            setCurrentSocketId(newSocket.id);
            addLog('✅ Đã kết nối Socket.IO', 'success');
            addLog(`Socket ID: ${newSocket.id}`, 'info');
        });

        newSocket.on('disconnect', () => {
            addLog('❌ Mất kết nối Socket.IO', 'error');
        });

        newSocket.on('progress', (data) => {
            updateProgress(data);
            addLog(`📊 ${data.message}`, 'progress');
        });

        setSocket(newSocket);

        // Cleanup khi unmount
        return () => {
            newSocket.disconnect();
        };
    }, []);

    // Auto-scroll log
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { message, type, timestamp }]);
    };

    const updateProgress = (data) => {
        setProgress({
            stage: data.stage,
            message: data.message,
            percent: data.progress
        });

        // Xử lý khi hoàn thành
        if (data.stage === 'completed') {
            setIsProcessing(false);
            showResult(data.result);
        }

        // Xử lý khi có lỗi
        if (data.stage === 'error') {
            setIsProcessing(false);
        }
    };

    const startProcess = async () => {
        const files = selectedFiles
            .split('\n')
            .map(f => f.trim())
            .filter(f => f);

        if (!rootPath || files.length === 0) {
            alert('Vui lòng nhập đường dẫn gốc và danh sách file!');
            return;
        }

        setIsProcessing(true);
        setProgress({
            stage: 'starting',
            message: 'Đang khởi tạo...',
            percent: 0
        });
        setResult(null);

        addLog('🚀 Bắt đầu quá trình nén và upload...', 'start');

        try {
            const response = await fetch('http://localhost:4001/download-zip-tree', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selected: files,
                    rootPath: rootPath,
                    socketId: currentSocketId
                })
            });

            const data = await response.json();
            
            if (data.error) {
                addLog(`❌ Lỗi: ${data.error}`, 'error');
                setIsProcessing(false);
            } else {
                addLog('✅ API call thành công', 'success');
            }
        } catch (error) {
            addLog(`❌ Lỗi network: ${error.message}`, 'error');
            setIsProcessing(false);
        }
    };

    const showResult = (resultData) => {
        setResult(resultData);
    };

    const clearLog = () => {
        setLogs([]);
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

    const getLogColor = (type) => {
        switch (type) {
            case 'info': return '#fff';
            case 'success': return '#4CAF50';
            case 'error': return '#f44336';
            case 'progress': return '#FF9800';
            case 'start': return '#2196F3';
            default: return '#fff';
        }
    };

    return (
        <div className="progress-demo">
            <h1>🔄 Progress Tracking Demo</h1>
            
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

            <div className="test-section">
                <h3>Test API</h3>
                <div className="input-group">
                    <input
                        type="text"
                        value={rootPath}
                        onChange={(e) => setRootPath(e.target.value)}
                        placeholder="Đường dẫn gốc"
                        disabled={isProcessing}
                    />
                </div>
                <div className="input-group">
                    <textarea
                        value={selectedFiles}
                        onChange={(e) => setSelectedFiles(e.target.value)}
                        placeholder="Danh sách file (mỗi file một dòng)"
                        disabled={isProcessing}
                    />
                </div>
                <div className="button-group">
                    <button 
                        onClick={startProcess} 
                        disabled={isProcessing}
                        className="start-btn"
                    >
                        {isProcessing ? 'Đang xử lý...' : 'Bắt đầu nén và upload'}
                    </button>
                    <button onClick={clearLog} className="clear-btn">
                        Xóa log
                    </button>
                </div>
            </div>

            <div className="log" ref={logRef}>
                {logs.map((log, index) => (
                    <div 
                        key={index} 
                        className="log-entry"
                        style={{ color: getLogColor(log.type) }}
                    >
                        [{log.timestamp}] {log.message}
                    </div>
                ))}
            </div>

            {result && (
                <div className="result">
                    <h4>🎉 Upload thành công!</h4>
                    <p><strong>File ID:</strong> {result.fileId}</p>
                    <p><strong>File Name:</strong> {result.fileName}</p>
                    <p><strong>Link:</strong> 
                        <a href={result.webViewLink} target="_blank" rel="noopener noreferrer">
                            {result.webViewLink}
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
};

export default ProgressDemo; 