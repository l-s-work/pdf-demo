# PDF 高亮定位后端

## 1. 安装依赖

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

如果你之前已经装过较新的 Paddle 版本，建议先重建虚拟环境或卸载后重装，避免旧缓存和新依赖混在一起。

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
OCR_LANGUAGE=ch
OCR_DPI=150
# PADDLE_PDX_CACHE_HOME=C:\path\to\paddlex-cache
# PADDLE_OCR_BASE_DIR=C:\path\to\paddlex-cache
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
```

### OCR 说明

扫描件命中会在文本层为空时自动走 PaddleOCR 兜底。`OCR_LANGUAGE` 默认是 `ch`，适合中文为主并兼顾数字和英文；模型会自动缓存到 `backend/storage/paddlex-cache`，首次运行可能会自动下载模型。
如果启动时不希望检查模型源，可保持 `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True`。
当前项目建议使用 `paddleocr==3.2.0` 和 `paddlepaddle==3.2.0`，更稳一些。
真正生效的缓存目录是 `PADDLE_PDX_CACHE_HOME`，旧的 `PADDLE_OCR_BASE_DIR` 只是兼容写法。
如果写的是相对路径，会按 `backend` 目录解析。

## 2. 启动服务

API 进程：

```bash
uvicorn app.main:app --reload --port 8000
```

worker 进程：

```bash
python -m app.worker
```

本地开发时如果希望 worker 自动重启，直接在 `backend/.env` 里加：

```env
WORKER_RELOAD=true
WORKER_RELOAD_PATHS=app
```

然后正常运行：

```bash
python -m app.worker
```

上传后会先写入 OSS，再由 worker 轮询 `pending` 任务并下载 OSS 源文件完成转换、OCR 和命中计算。

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
