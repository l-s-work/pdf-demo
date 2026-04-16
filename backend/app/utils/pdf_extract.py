from pathlib import Path
import unicodedata
import threading

import fitz
import numpy as np

from app.core.settings import OCR_DPI, OCR_LANGUAGE

MANUAL_HIT_LOOKAHEAD_PAGES = 2
MANUAL_HIT_LOOKBACK_PAGES = 2
MANUAL_FRAGMENT_MIN_LENGTH = 12
# 可疑扫描页判定阈值：少量文字且图片占比很高时，优先走 OCR。
SCANNED_PAGE_MAX_WORDS = 20
SCANNED_PAGE_MAX_TEXT_CHARS = 160
SCANNED_PAGE_STRONG_SUSPICION_WORDS = 5
SCANNED_PAGE_IMAGE_COVERAGE_THRESHOLD = 0.5
SCANNED_PAGE_LOW_WORD_IMAGE_THRESHOLD = 0.2
_OCR_ENGINE_LOCK = threading.Lock()
_OCR_ENGINE = None


# 从 OCR 识别框里提取边界坐标，兼容 list、tuple 和 numpy 数组。
def _extract_box_bounds(box) -> tuple[float, float, float, float] | None:
    try:
        points = np.asarray(box, dtype=float)
    except Exception:
        return None

    if points.ndim != 2 or points.shape[0] < 4 or points.shape[1] < 2:
        return None

    xs = points[:, 0]
    ys = points[:, 1]
    return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())


# 打开 PDF 文档对象。
def open_pdf_document(file_path: Path) -> fitz.Document:
    return fitz.open(file_path)


# 提取所有页尺寸与旋转信息。
def extract_page_meta(pdf_doc: fitz.Document) -> list[dict[str, float | int]]:
    items: list[dict[str, float | int]] = []
    for index in range(pdf_doc.page_count):
        page = pdf_doc[index]
        rect = page.rect
        items.append({
            'page_num': index + 1,
            'width': float(rect.width),
            'height': float(rect.height),
            'rotation': int(page.rotation)
        })
    return items


# 仅提取第一页尺寸信息，用于上传后的快速初始化。
def extract_first_page_meta(pdf_doc: fitz.Document) -> dict[str, float | int] | None:
    if pdf_doc.page_count <= 0:
        return None

    page = pdf_doc[0]
    rect = page.rect
    return {
        'page_num': 1,
        'width': float(rect.width),
        'height': float(rect.height),
        'rotation': int(page.rotation)
    }


# 估算页面中图片块对整页的覆盖比例，用于识别“图片为主”的扫描页。
def estimate_page_image_coverage(page: fitz.Page) -> float:
    try:
        page_dict = page.get_text('dict')
    except Exception:
        return 0.0

    page_rect = page.rect
    page_area = max(float(page_rect.width) * float(page_rect.height), 1.0)
    covered_area = 0.0

    for block in page_dict.get('blocks', []):
        if not isinstance(block, dict) or int(block.get('type', -1)) != 1:
            continue

        bbox = block.get('bbox')
        if not isinstance(bbox, (list, tuple)) or len(bbox) < 4:
            continue

        x0, y0, x1, y1 = [float(value) for value in bbox[:4]]
        block_area = max(0.0, x1 - x0) * max(0.0, y1 - y0)
        if block_area <= 0:
            continue

        covered_area += block_area
        if covered_area >= page_area:
            return 1.0

    return min(covered_area / page_area, 1.0)


# 判断页面是否疑似扫描件或隐藏文本页。
def should_use_ocr_for_page(page: fitz.Page, normal_words: list[dict[str, float | int | str]]) -> bool:
    word_count = len(normal_words)
    if word_count == 0:
        return True

    text_char_count = sum(len(str(word.get('normalized_text') or '')) for word in normal_words)
    if word_count <= SCANNED_PAGE_STRONG_SUSPICION_WORDS and text_char_count <= 40:
        return True

    if word_count <= SCANNED_PAGE_MAX_WORDS and text_char_count <= SCANNED_PAGE_MAX_TEXT_CHARS:
        image_coverage = estimate_page_image_coverage(page)
        if image_coverage >= SCANNED_PAGE_IMAGE_COVERAGE_THRESHOLD:
            return True

        if word_count <= 10 and text_char_count <= 80 and image_coverage >= SCANNED_PAGE_LOW_WORD_IMAGE_THRESHOLD:
            return True

    return False


# 获取 PaddleOCR 引擎实例，首次调用时再初始化。
def get_ocr_engine():
    global _OCR_ENGINE
    if _OCR_ENGINE is not None:
        return _OCR_ENGINE

    with _OCR_ENGINE_LOCK:
        if _OCR_ENGINE is not None:
            return _OCR_ENGINE

        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError('未安装 PaddleOCR，请先安装后端依赖') from exc

        # 扫描件命中只需要“原始页面图像上的检测/识别”，不要启用文档预处理，
        # 否则 PaddleOCR 可能先旋转/矫正页面，导致返回框与 PyMuPDF 坐标不一致。
        _OCR_ENGINE = PaddleOCR(
            lang=OCR_LANGUAGE,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False
        )
        return _OCR_ENGINE


# 预热 PaddleOCR 引擎，尽量在启动阶段完成模型加载。
def warmup_ocr_engine() -> None:
    ocr_engine = get_ocr_engine()
    warmup_image = np.zeros((32, 32, 3), dtype=np.uint8)
    ocr_engine.ocr(
        warmup_image,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False
    )


# 将 PDF 页面渲染成适合 OCR 的图像数组。
def render_page_for_ocr(page: fitz.Page) -> np.ndarray:
    scale = max(1.0, OCR_DPI / 72.0)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
    if image.ndim == 2:
        image = np.repeat(image[:, :, None], 3, axis=2)
    elif image.shape[2] >= 3:
        image = image[:, :, :3]

    image = image[:, :, ::-1].copy()
    return image


# 将 PaddleOCR 返回结果转换为统一的词元结构。
def normalize_ocr_result(page_result, scale: float = 1.0) -> list[dict[str, float | int | str]]:
    if not page_result:
        return []

    if isinstance(page_result, list) and len(page_result) == 1 and isinstance(page_result[0], dict):
        page_result = page_result[0]

    # 兼容 PaddleOCR 旧版列表结构：[[box, text_result], ...]
    if isinstance(page_result, list):
        if len(page_result) == 1 and isinstance(page_result[0], list):
            maybe_lines = page_result[0]
            if not maybe_lines:
                return []
            if isinstance(maybe_lines[0], (list, tuple)) and len(maybe_lines[0]) == 2:
                page_result = maybe_lines

        word_items: list[dict[str, float | int | str]] = []
        for line_index, line in enumerate(page_result):
            if not isinstance(line, (list, tuple)) or len(line) != 2:
                continue

            box, text_result = line
            if not isinstance(text_result, (list, tuple)) or not text_result:
                continue

            text = str(text_result[0] or '').strip()
            normalized_text = normalize_search_text(text)
            if not normalized_text:
                continue

            bounds = _extract_box_bounds(box)
            if bounds is None:
                continue
            x0, y0, x1, y1 = bounds

            word_items.append({
                'text': text,
                'normalized_text': normalized_text,
                'x0': x0 / scale,
                'y0': y0 / scale,
                'x1': x1 / scale,
                'y1': y1 / scale,
                'block_no': 0,
                'line_no': line_index,
                'word_no': 0
            })

        return word_items

    # 兼容 PaddleOCR 3.x 的字典结构。
    if isinstance(page_result, dict):
        rec_texts = list(page_result.get('rec_texts') or [])
        rec_boxes = list(page_result.get('dt_polys') or page_result.get('rec_boxes') or [])
        rec_scores = list(page_result.get('rec_scores') or [])
        word_items: list[dict[str, float | int | str]] = []

        for line_index, text in enumerate(rec_texts):
            text = str(text or '').strip()
            normalized_text = normalize_search_text(text)
            if not normalized_text:
                continue

            box = rec_boxes[line_index] if line_index < len(rec_boxes) else None
            if box is None:
                continue

            bounds = _extract_box_bounds(box)
            if bounds is None:
                continue
            x0, y0, x1, y1 = bounds

            # 这里直接把 OCR 像素坐标缩回 PDF point 坐标系，避免后续高亮偏移。
            word_items.append({
                'text': text,
                'normalized_text': normalized_text,
                'x0': x0 / scale,
                'y0': y0 / scale,
                'x1': x1 / scale,
                'y1': y1 / scale,
                'block_no': 0,
                'line_no': line_index,
                'word_no': 0
            })

        return word_items

    word_items: list[dict[str, float | int | str]] = []
    for line_index, line in enumerate(page_result):
        if not isinstance(line, (list, tuple)) or len(line) != 2:
            continue

        box, text_result = line
        if not isinstance(text_result, (list, tuple)) or not text_result:
            continue

        text = str(text_result[0] or '').strip()
        normalized_text = normalize_search_text(text)
        if not normalized_text:
            continue

        bounds = _extract_box_bounds(box)
        if bounds is None:
            continue
        x0, y0, x1, y1 = bounds

        word_items.append({
            'text': text,
            'normalized_text': normalized_text,
            'x0': x0 / scale,
            'y0': y0 / scale,
            'x1': x1 / scale,
            'y1': y1 / scale,
            'block_no': 0,
            'line_no': line_index,
            'word_no': 0
        })

    return word_items


# 从单页提取文本词元，扫描件在文本层为空时自动走 PaddleOCR 兜底。
def extract_words_from_page(page: fitz.Page) -> list[dict[str, float | int | str]]:
    def normalize_words(word_rows: list[tuple[float, float, float, float, str, int, int, int]]) -> list[dict[str, float | int | str]]:
        word_items: list[dict[str, float | int | str]] = []
        for x0, y0, x1, y1, text, block_no, line_no, word_no in word_rows:
            normalized_text = normalize_search_text(str(text))
            if not normalized_text:
                continue

            word_items.append({
                'text': str(text),
                'normalized_text': normalized_text,
                'x0': float(x0),
                'y0': float(y0),
                'x1': float(x1),
                'y1': float(y1),
                'block_no': int(block_no),
                'line_no': int(line_no),
                'word_no': int(word_no)
            })
        return word_items

    normal_words = normalize_words(list(page.get_text('words', sort=True)))
    if normal_words and not should_use_ocr_for_page(page, normal_words):
        return normal_words

    try:
        ocr_engine = get_ocr_engine()
        scale = max(1.0, OCR_DPI / 72.0)
        ocr_image = render_page_for_ocr(page)
        ocr_result = ocr_engine.ocr(
            ocr_image,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False
        )
    except Exception as exc:
        raise RuntimeError('当前页面疑似扫描件，但 PaddleOCR 初始化或识别失败') from exc

    return normalize_ocr_result(ocr_result, scale=scale)


# 按关键词提取每个矩形命中，满足 per-hit 单位置设计。
def extract_keyword_hits(pdf_doc: fitz.Document, keywords: list[str]) -> list[dict[str, float | int | str | None]]:
    hit_items: list[dict[str, float | int | str | None]] = []
    for index in range(pdf_doc.page_count):
        page = pdf_doc[index]
        for keyword in keywords:
            for hit_rect in page.search_for(keyword):
                hit_items.append({
                    'page_num': index + 1,
                    'keyword': keyword,
                    'x': float(hit_rect.x0),
                    'y': float(hit_rect.y0),
                    'w': float(hit_rect.width),
                    'h': float(hit_rect.height),
                    'group_id': None
                })
    return hit_items


# 对搜索文本做归一化，忽略空白差异，便于处理跨行或跨页短语。
def normalize_search_text(text: str) -> str:
    normalized_text = unicodedata.normalize('NFKC', text)
    # 统一转小写，并去除空白和常见标点，提升英文半词、代码片段等输入的命中容错。
    normalized_chars: list[str] = []
    for char in normalized_text:
        if char.isspace():
            continue

        if char.isalnum() or char == '_':
            normalized_chars.append(char.lower())
            continue

        # 保留 CJK 字符，避免中文检索被标点清洗后丢词。
        if '\u4e00' <= char <= '\u9fff':
            normalized_chars.append(char)

    return ''.join(normalized_chars)


# 针对长关键词构建片段，用于全文本未精确命中时的分段兜底匹配。
def build_keyword_fragments(normalized_keyword: str) -> list[str]:
    keyword_length = len(normalized_keyword)
    if keyword_length < 24:
        return []

    candidate_lengths = sorted(
        {
            min(keyword_length, 72),
            min(keyword_length, 56),
            min(keyword_length, 40),
            min(keyword_length, 28)
        },
        reverse=True
    )
    fragments: list[str] = []
    for fragment_length in candidate_lengths:
        if fragment_length < MANUAL_FRAGMENT_MIN_LENGTH or fragment_length >= keyword_length:
            continue

        offset_candidates = [0, max((keyword_length - fragment_length) // 2, 0), keyword_length - fragment_length]
        for offset in offset_candidates:
            fragment = normalized_keyword[offset:offset + fragment_length]
            if len(fragment) < MANUAL_FRAGMENT_MIN_LENGTH:
                continue
            if fragment in fragments:
                continue
            fragments.append(fragment)

    return fragments


# 提取指定页范围内的单词信息，供定向命中定位使用。
def extract_words_in_page_range(
    pdf_doc: fitz.Document,
    start_page_num: int,
    end_page_num: int,
    page_words_cache: dict[int, list[dict[str, float | int | str]]] | None = None
) -> list[dict[str, float | int | str]]:
    word_items: list[dict[str, float | int | str]] = []
    cache = page_words_cache if page_words_cache is not None else {}

    for page_num in range(start_page_num, end_page_num + 1):
        cached_words = cache.get(page_num)
        if cached_words is None:
            cached_words = extract_words_from_page(pdf_doc[page_num - 1])
            cache[page_num] = cached_words

        for word in cached_words:
            word_items.append({
                'page_num': page_num,
                **word
            })

    return word_items


# 将匹配到的单词矩形按页码和行合并为较少的高亮段，便于前端连续显示。
def merge_words_to_rect_segments(word_items: list[dict[str, float | int | str]]) -> list[dict[str, float | int]]:
    segments: list[dict[str, float | int]] = []
    current_segment: dict[str, float | int] | None = None

    for word in word_items:
        page_num = int(word['page_num'])
        block_no = int(word['block_no'])
        line_no = int(word['line_no'])

        if (
            current_segment is None
            or int(current_segment['page_num']) != page_num
            or int(current_segment['block_no']) != block_no
            or int(current_segment['line_no']) != line_no
        ):
            current_segment = {
                'page_num': page_num,
                'x': float(word['x0']),
                'y': float(word['y0']),
                'w': float(word['x1']) - float(word['x0']),
                'h': float(word['y1']) - float(word['y0']),
                'block_no': block_no,
                'line_no': line_no
            }
            segments.append(current_segment)
            continue

        next_x1 = float(word['x1'])
        next_y1 = float(word['y1'])
        current_x = float(current_segment['x'])
        current_y = float(current_segment['y'])
        current_x1 = current_x + float(current_segment['w'])
        current_y1 = current_y + float(current_segment['h'])

        current_segment['x'] = min(current_x, float(word['x0']))
        current_segment['y'] = min(current_y, float(word['y0']))
        current_segment['w'] = max(current_x1, next_x1) - float(current_segment['x'])
        current_segment['h'] = max(current_y1, next_y1) - float(current_segment['y'])

    return [
        {
            'page_num': int(segment['page_num']),
            'x': float(segment['x']),
            'y': float(segment['y']),
            'w': float(segment['w']),
            'h': float(segment['h'])
        }
        for segment in segments
    ]


# 按关键词在拼接文本中的匹配区间，裁剪出“仅关键词子串”的矩形段。
def build_rect_segments_from_match(
    token_positions: list[dict[str, int | dict[str, float | int | str]]],
    match_start: int,
    match_end: int
) -> list[dict[str, float | int]]:
    matched_word_items: list[dict[str, float | int | str]] = []

    for position in token_positions:
        token_start = int(position['start'])
        token_end = int(position['end'])
        if token_end <= match_start or token_start >= match_end:
            continue

        word = dict(position['word'])
        normalized_text = str(word['normalized_text'])
        if not normalized_text:
            continue

        overlap_start = max(match_start, token_start)
        overlap_end = min(match_end, token_end)
        if overlap_end <= overlap_start:
            continue

        word_match_start = overlap_start - token_start
        word_match_end = overlap_end - token_start
        word_length = len(normalized_text)
        if word_length <= 0:
            continue

        x0 = float(word['x0'])
        x1 = float(word['x1'])
        y0 = float(word['y0'])
        y1 = float(word['y1'])

        # 近似按字符比例裁剪单词矩形，保证只高亮关键词覆盖的子串区间。
        left_x = min(x0, x1)
        right_x = max(x0, x1)
        width = right_x - left_x
        if width <= 0:
            continue

        ratio_start = word_match_start / word_length
        ratio_end = word_match_end / word_length
        clipped_x0 = left_x + width * ratio_start
        clipped_x1 = left_x + width * ratio_end

        matched_word_items.append({
            **word,
            'x0': clipped_x0,
            'x1': clipped_x1,
            'y0': y0,
            'y1': y1
        })

    return merge_words_to_rect_segments(matched_word_items)


# 复用同一套匹配逻辑，在指定页附近或整份文档中查找关键词。
def _locate_keyword_from_word_items(
    word_items: list[dict[str, float | int | str]],
    normalized_keyword: str,
    start_page_num: int | None = None
) -> list[dict[str, float | int]]:
    if not word_items or not normalized_keyword:
        return []

    searchable_text = ''
    token_positions: list[dict[str, int | dict[str, float | int | str]]] = []
    for word in word_items:
        start_index = len(searchable_text)
        searchable_text += str(word['normalized_text'])
        token_positions.append({
            'start': start_index,
            'end': len(searchable_text),
            'word': word
        })

    first_fallback_range: tuple[int, int] | None = None
    search_from = 0
    while True:
        match_index = searchable_text.find(normalized_keyword, search_from)
        if match_index < 0:
            break

        match_end = match_index + len(normalized_keyword)
        matched_words = [
            dict(position['word'])
            for position in token_positions
            if int(position['start']) < match_end and int(position['end']) > match_index
        ]
        if matched_words:
            if start_page_num is None:
                return build_rect_segments_from_match(token_positions, match_index, match_end)

            if any(int(word['page_num']) == start_page_num for word in matched_words):
                return build_rect_segments_from_match(token_positions, match_index, match_end)

            if first_fallback_range is None:
                first_fallback_range = (match_index, match_end)

        search_from = match_index + 1

    if first_fallback_range is not None:
        return build_rect_segments_from_match(token_positions, first_fallback_range[0], first_fallback_range[1])

    # 第二层兜底：长关键词拆分片段后匹配，减少复制长句时因细微差异导致的全量失败。
    first_fragment_range: tuple[int, int] | None = None
    for fragment in build_keyword_fragments(normalized_keyword):
        search_from = 0
        while True:
            fragment_index = searchable_text.find(fragment, search_from)
            if fragment_index < 0:
                break

            fragment_end = fragment_index + len(fragment)
            matched_words = [
                dict(position['word'])
                for position in token_positions
                if int(position['start']) < fragment_end and int(position['end']) > fragment_index
            ]
            if matched_words:
                if start_page_num is None:
                    return build_rect_segments_from_match(token_positions, fragment_index, fragment_end)

                if any(int(word['page_num']) == start_page_num for word in matched_words):
                    return build_rect_segments_from_match(token_positions, fragment_index, fragment_end)

                if first_fragment_range is None:
                    first_fragment_range = (fragment_index, fragment_end)

            search_from = fragment_index + 1

    if first_fragment_range is not None:
        return build_rect_segments_from_match(token_positions, first_fragment_range[0], first_fragment_range[1])

    # 兜底：支持英文不完整单词输入，按“单词内包含”返回矩形。
    # 例如输入 "symlin" 也可命中 "symlinkat"。
    if start_page_num is None:
        preferred_positions = token_positions
    else:
        preferred_positions = [
            position
            for position in token_positions
            if int(dict(position['word'])['page_num']) == start_page_num
        ]

    for position in preferred_positions:
        word = dict(position['word'])
        word_text = str(word['normalized_text'])
        token_start = int(position['start'])
        local_index = word_text.find(normalized_keyword)
        if local_index >= 0:
            match_start = token_start + local_index
            match_end = match_start + len(normalized_keyword)
            return build_rect_segments_from_match(token_positions, match_start, match_end)

    for position in token_positions:
        word = dict(position['word'])
        word_text = str(word['normalized_text'])
        token_start = int(position['start'])
        local_index = word_text.find(normalized_keyword)
        if local_index >= 0:
            match_start = token_start + local_index
            match_end = match_start + len(normalized_keyword)
            return build_rect_segments_from_match(token_positions, match_start, match_end)

    return []


# 在指定起始页附近定向定位关键词，并自动补齐跨行或跨页矩形。
def locate_keyword_near_page(
    pdf_doc: fitz.Document,
    keyword: str,
    start_page_num: int,
    page_words_cache: dict[int, list[dict[str, float | int | str]]] | None = None
) -> list[dict[str, float | int]]:
    if start_page_num < 1 or start_page_num > pdf_doc.page_count:
        return []

    normalized_keyword = normalize_search_text(keyword)
    if not normalized_keyword:
        return []

    range_start_page_num = max(1, start_page_num - MANUAL_HIT_LOOKBACK_PAGES)
    end_page_num = min(pdf_doc.page_count, start_page_num + MANUAL_HIT_LOOKAHEAD_PAGES)
    word_items = extract_words_in_page_range(pdf_doc, range_start_page_num, end_page_num, page_words_cache)
    return _locate_keyword_from_word_items(word_items, normalized_keyword, start_page_num)


# 不限制页码，直接在整份文档中查找关键词，作为页码偏移过大时的兜底。
def locate_keyword_anywhere(
    pdf_doc: fitz.Document,
    keyword: str,
    page_words_cache: dict[int, list[dict[str, float | int | str]]] | None = None
) -> list[dict[str, float | int]]:
    normalized_keyword = normalize_search_text(keyword)
    if not normalized_keyword:
        return []

    word_items = extract_words_in_page_range(pdf_doc, 1, pdf_doc.page_count, page_words_cache)
    return _locate_keyword_from_word_items(word_items, normalized_keyword, None)
