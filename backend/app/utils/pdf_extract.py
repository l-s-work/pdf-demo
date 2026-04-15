from pathlib import Path
import unicodedata

import fitz

MANUAL_HIT_LOOKAHEAD_PAGES = 2
MANUAL_HIT_LOOKBACK_PAGES = 2
MANUAL_FRAGMENT_MIN_LENGTH = 12


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
    end_page_num: int
) -> list[dict[str, float | int | str]]:
    word_items: list[dict[str, float | int | str]] = []

    for page_num in range(start_page_num, end_page_num + 1):
        page = pdf_doc[page_num - 1]
        for x0, y0, x1, y1, text, block_no, line_no, word_no in page.get_text('words', sort=True):
            normalized_text = normalize_search_text(str(text))
            if not normalized_text:
                continue

            word_items.append({
                'page_num': page_num,
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
    start_page_num: int
) -> list[dict[str, float | int]]:
    if start_page_num < 1 or start_page_num > pdf_doc.page_count:
        return []

    normalized_keyword = normalize_search_text(keyword)
    if not normalized_keyword:
        return []

    range_start_page_num = max(1, start_page_num - MANUAL_HIT_LOOKBACK_PAGES)
    end_page_num = min(pdf_doc.page_count, start_page_num + MANUAL_HIT_LOOKAHEAD_PAGES)
    word_items = extract_words_in_page_range(pdf_doc, range_start_page_num, end_page_num)
    return _locate_keyword_from_word_items(word_items, normalized_keyword, start_page_num)


# 不限制页码，直接在整份文档中查找关键词，作为页码偏移过大时的兜底。
def locate_keyword_anywhere(
    pdf_doc: fitz.Document,
    keyword: str
) -> list[dict[str, float | int]]:
    normalized_keyword = normalize_search_text(keyword)
    if not normalized_keyword:
        return []

    word_items = extract_words_in_page_range(pdf_doc, 1, pdf_doc.page_count)
    return _locate_keyword_from_word_items(word_items, normalized_keyword, None)
