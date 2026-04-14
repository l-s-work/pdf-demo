# PDF 高亮定位后端

## 1. 安装依赖

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 可选：启用阿里云 OSS（前端直连 + 后端签名）

推荐在 `backend` 目录新建 `.env`（可由 `.env.example` 复制）：

```powershell
Copy-Item .env.example .env
```

`.env` 示例：

```env
OSS_ENABLED=true
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET_NAME=your-bucket
OSS_ACCESS_KEY_ID=your-ak
OSS_ACCESS_KEY_SECRET=your-sk
OSS_OBJECT_PREFIX=pdf
OSS_SIGN_EXPIRES_SECONDS=1800
```

## 2. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

## 3. 关键接口

- `GET /api/highlight-hits`
- `GET /api/pdf/{id}/meta`
- `GET /api/pdf/{id}/preview-url`（优先 OSS 签名直链，失败自动回退）
- `GET /api/pdf/{id}/file`
- `POST /api/pdf/ingest`

## 4. 目录拆分说明

- `app/api/hits.py`：命中列表接口
- `app/api/pdf_meta.py`：轻量索引接口
- `app/api/pdf_file.py`：PDF 文件流式接口
- `app/api/pdf_ingest.py`：本地 PDF 入库接口
- `app/services/ingest_service.py`：入库编排
- `app/utils/pdf_extract.py`：PDF 页尺寸与关键词命中提取
- `app/utils/range_utils.py`：Range 解析与区间读取
- `app/utils/file_utils.py`：文件复制到存储目录

## 5. 大文件支持说明

1. `/api/pdf/{id}/file` 支持 `Range` 请求。
2. 开启 OSS 后，前端通过 `/api/pdf/{id}/preview-url` 获取签名直链直接预览。
3. 当签名直链不可用时，前端会自动回退到 `/api/pdf/{id}/file`。
