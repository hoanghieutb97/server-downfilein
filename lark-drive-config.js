const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const LARK_APP_ID = "cli_a9afc52a42389ed0";
const LARK_APP_SECRET = "9lZWV9HwJK0hdPellEuFzcFoaqwmruMG";
const DEFAULT_LARK_FOLDER_TOKEN = "YdsWfdIBBlxQhud79LHlqo9rgfc";
const LARK_BASE_URL = process.env.LARK_BASE_URL || 'https://open.feishu.cn';

let cachedTenantToken = {
    token: null,
    expiresAt: 0
};

function assertLarkEnv() {
    if (!LARK_APP_ID || !LARK_APP_SECRET) {
        throw new Error('Thiếu LARK_APP_ID hoặc LARK_APP_SECRET trong environment');
    }
}

async function getTenantAccessToken() {
    assertLarkEnv();

    if (cachedTenantToken.token && cachedTenantToken.expiresAt > Date.now()) {
        return cachedTenantToken.token;
    }

    const response = await axios.post(`${LARK_BASE_URL}/open-apis/auth/v3/tenant_access_token/internal/`, {
        app_id: LARK_APP_ID,
        app_secret: LARK_APP_SECRET
    });

    if (response.data.code !== 0) {
        throw new Error(`Không lấy được tenant_access_token: ${response.data.msg}`);
    }

    cachedTenantToken = {
        token: response.data.tenant_access_token,
        expiresAt: Date.now() + (response.data.expire - 60) * 1000
    };

    return cachedTenantToken.token;
}

async function createPublicLink(fileToken, authHeaders) {
    try {
        const response = await axios.post(
            `${LARK_BASE_URL}/open-apis/drive/v1/files/${fileToken}/public_link/create`,
            {
                share_to_external: true,
                need_short_url: true
            },
            { headers: authHeaders }
        );

        if (response.data.code !== 0) {
            throw new Error(response.data.msg);
        }

        return (
            response.data.data?.public_link?.url ||
            response.data.data?.public_link?.external_link_url ||
            response.data.data?.public_link?.link_url ||
            null
        );
    } catch (error) {
        console.warn('Không tạo được public link Lark:', error.message);
        return null;
    }
}

async function uploadToLark(filePath, fileName, folderToken = DEFAULT_LARK_FOLDER_TOKEN) {
    assertLarkEnv();

    const tenantAccessToken = await getTenantAccessToken();
    const authHeaders = {
        Authorization: `Bearer ${tenantAccessToken}`
    };

    const stat = fs.statSync(filePath);
    const formData = new FormData();
    formData.append('file_name', fileName);
    formData.append('parent_type', folderToken ? 'folder' : 'explorer');
    formData.append('parent_token', folderToken || '0');
    formData.append('size', stat.size);
    formData.append('file', fs.createReadStream(filePath));

    const uploadResponse = await axios.post(
        `${LARK_BASE_URL}/open-apis/drive/v1/files/upload_all`,
        formData,
        {
            headers: {
                ...authHeaders,
                ...formData.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        }
    );

    if (uploadResponse.data.code !== 0) {
        throw new Error(`Upload lên Lark thất bại: ${uploadResponse.data.msg}`);
    }

    const fileToken =
        uploadResponse.data.data?.file_token ||
        uploadResponse.data.data?.file?.token;
    const uploadedFileName =
        uploadResponse.data.data?.file_name ||
        uploadResponse.data.data?.file?.name ||
        fileName;

    const publicLink = await createPublicLink(fileToken, authHeaders);

    return {
        fileToken,
        fileName: uploadedFileName,
        webViewLink: publicLink,
        parentToken: folderToken
    };
}

async function createLarkFolder(folderName, parentToken = DEFAULT_LARK_FOLDER_TOKEN) {
    assertLarkEnv();
    const tenantAccessToken = await getTenantAccessToken();

    const response = await axios.post(
        `${LARK_BASE_URL}/open-apis/drive/v1/files/create_folder`,
        {
            name: folderName,
            parent_type: parentToken ? 'folder' : 'explorer',
            parent_token: parentToken || '0'
        },
        {
            headers: {
                Authorization: `Bearer ${tenantAccessToken}`
            }
        }
    );

    if (response.data.code !== 0) {
        throw new Error(`Không tạo được thư mục trên Lark: ${response.data.msg}`);
    }

    return {
        folderToken: response.data.data?.token,
        folderName: response.data.data?.name
    };
}

/**
 * Upload file vào group chat trong Lark
 * @param {string} filePath - Đường dẫn file cần upload
 * @param {string} fileName - Tên file
 * @param {string} chatId - Chat ID của group chat
 * @returns {Promise<Object>} Thông tin về message đã gửi
 */
async function uploadToLarkChat(filePath, fileName, chatId) {
    assertLarkEnv();

    const tenantAccessToken = await getTenantAccessToken();
    const authHeaders = {
        Authorization: `Bearer ${tenantAccessToken}`
    };

    // Bước 1: Upload file lên IM file storage để lấy file_key
    const formData = new FormData();
    formData.append('file_type', 'stream');
    formData.append('file_name', fileName);
    formData.append('duration', '0');
    formData.append('file', fs.createReadStream(filePath));

    console.log('Đang upload file lên IM storage...');
    let uploadResponse;
    try {
        uploadResponse = await axios.post(
            `${LARK_BASE_URL}/open-apis/im/v1/files`,
            formData,
            {
                headers: {
                    ...authHeaders,
                    ...formData.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );

        console.log('Response từ IM upload:', JSON.stringify(uploadResponse.data, null, 2));

        if (uploadResponse.data.code !== 0) {
            throw new Error(`Upload file lên IM storage thất bại: ${uploadResponse.data.msg} (code: ${uploadResponse.data.code})`);
        }
    } catch (error) {
        if (error.response) {
            console.error('Lỗi response từ IM upload:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
            throw new Error(`Upload file lên IM storage thất bại: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }

    const fileKey = uploadResponse.data.data?.file_key;
    if (!fileKey) {
        throw new Error('Không nhận được file_key từ phản hồi upload');
    }

    console.log('Đã upload file, file_key:', fileKey);

    // Bước 2: Gửi message với file vào group chat
    const messageResponse = await axios.post(
        `${LARK_BASE_URL}/open-apis/im/v1/messages?receive_id_type=chat_id`,
        {
            receive_id: chatId,
            msg_type: 'file',
            content: JSON.stringify({
                file_key: fileKey
            })
        },
        {
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        }
    );

    if (messageResponse.data.code !== 0) {
        throw new Error(`Gửi message vào chat thất bại: ${messageResponse.data.msg}`);
    }

    const messageId = messageResponse.data.data?.message_id;

    return {
        messageId,
        fileKey,
        fileName,
        chatId
    };
}

module.exports = {
    uploadToLark,
    uploadToLarkChat,
    createLarkFolder,
    getTenantAccessToken
};

