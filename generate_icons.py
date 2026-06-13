import struct, zlib, os

def write_png(filename, size, rgb):
    r, g, b = rgb
    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            raw += bytes([r, g, b])
    compressed = zlib.compress(raw)

    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))

os.makedirs('static', exist_ok=True)
write_png('static/icon-192.png', 192, (33, 37, 41))
write_png('static/icon-512.png', 512, (33, 37, 41))
print("아이콘 생성 완료!")
