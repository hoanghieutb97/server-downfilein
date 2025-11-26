const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RCLONE_CMD = process.env.RCLONE_CMD || 'rclone';
const RCLONE_REMOTE_BASE = process.env.RCLONE_REMOTE_BASE || 'drive_remote:uploads';
const DEFAULT_EXTRA = [
    '--progress',
    '--stats=10s',
    '--transfers=8',
    '--checkers=8',
    '--drive-chunk-size=256M'
];
const envExtra = (process.env.RCLONE_EXTRA_ARGS || '').split(/\s+/).filter(Boolean);
const RCLONE_EXTRA_ARGS = envExtra.length > 0 ? envExtra : DEFAULT_EXTRA;

function joinRemotePath(base, child = '') {
    if (!child || child === '.' || child === path.sep) {
        return base;
    }
    const sanitized = child.replace(/\\/g, '/');
    return `${base.replace(/\/+$/, '')}/${sanitized.replace(/^\/+/, '')}`;
}

function runRclone(args, label = 'rclone') {
    return new Promise((resolve, reject) => {
        const finalArgs = [...RCLONE_EXTRA_ARGS, ...args];
        console.log(`[rclone] ${RCLONE_CMD} ${finalArgs.join(' ')}`);
        const proc = spawn(RCLONE_CMD, finalArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stdout.on('data', data => process.stdout.write(data));
        proc.stderr.on('data', data => {
            stderr += data.toString();
            process.stderr.write(data);
        });

        proc.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${label} failed with exit code ${code}: ${stderr.trim()}`));
            }
        });
    });
}

async function uploadPathWithRclone(localPath, remoteRootPath, normalizedRoot = null) {
    const stats = await fs.promises.stat(localPath);
    let relative = normalizedRoot ? path.relative(normalizedRoot, localPath) : path.basename(localPath);

    if (!relative || relative === '.' || relative.startsWith('..')) {
        relative = stats.isDirectory() ? '' : path.basename(localPath);
    }

    let remoteTarget = relative
        ? joinRemotePath(remoteRootPath, relative)
        : remoteRootPath;

    if (stats.isDirectory()) {
        await runRclone(
            ['copy', '--create-empty-src-dirs', localPath, remoteTarget],
            `copy dir ${localPath}`
        );
    } else {
        if (!relative) {
            remoteTarget = joinRemotePath(remoteRootPath, path.basename(localPath));
        }

        await runRclone(
            ['copyto', localPath, remoteTarget],
            `copy file ${localPath}`
        );
    }
}

function buildRemoteFolderPath(folderName) {
    const safeName = folderName || `drive_upload_${Date.now()}`;
    return joinRemotePath(RCLONE_REMOTE_BASE, safeName);
}

module.exports = {
    uploadPathWithRclone,
    buildRemoteFolderPath,
    RCLONE_CMD,
    RCLONE_REMOTE_BASE
};

