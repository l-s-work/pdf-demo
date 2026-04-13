# PDF 高亮定位后端

## 1. 安装依赖

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 2. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

## 3. 关键接口

- `GET /api/highlight-hits`
- `GET /api/pdf/{id}/meta`
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
2. 前端打开目标页时会优先请求当前页及附近页所需数据。
3. `/api/pdf/{id}/meta` 提供全部页尺寸信息，用于前端虚拟页面高度计算。
