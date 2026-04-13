from collections.abc import Iterator
from pathlib import Path


# 解析 Range 头，返回开始和结束字节位置。
def parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    units, value = range_header.split('=', maxsplit=1)
    if units.strip().lower() != 'bytes':
        raise ValueError('仅支持 bytes Range')

    start_text, end_text = value.split('-', maxsplit=1)
    if start_text == '':
        suffix_length = int(end_text)
        return max(file_size - suffix_length, 0), file_size - 1

    start = int(start_text)
    end = int(end_text) if end_text else file_size - 1
    if start > end or start >= file_size:
        raise ValueError('Range 超出文件大小')

    return start, min(end, file_size - 1)


# 按区间流式读取文件内容。
def iter_file_range(file_path: Path, start: int, end: int, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    with file_path.open('rb') as file_obj:
        file_obj.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = file_obj.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data
