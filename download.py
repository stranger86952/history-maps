import os
import time
import requests
from datetime import datetime

# キャッシュバスター用の日付（例：20250710）
today_str = datetime.now().strftime("%Y%m%d")

# ズームレベルとそれに対応する座標数
zoom_levels = {
    1: (2, 2),  # Z1: x=0~1, y=0~1
    2: (4, 4),  # Z2: x=0~3, y=0~3
    3: (8, 8),  # Z3: x=0~7, y=0~7
    4: (16, 16),  # Z4: x=0~15, y=0~15
    5: (32, 32),  # Z5: x=0~31, y=0~31
    6: (64, 64),  # Z6: x=0~63, y=0~63
}

# 保存フォルダ
base_dir = "./img"
back_dir = os.path.join(base_dir, "back")
os.makedirs(back_dir, exist_ok=True)

def download_tile(url, path):
    if os.path.exists(path):
        return  # 既に存在する場合はスキップ
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(path, 'wb') as f:
                f.write(response.content)
            print(f"Downloaded: {path}")
        else:
            print(f"Failed to fetch {url}: {response.status_code}")
    except Exception as e:
        print(f"Error fetching {url}: {e}")

# 背景マップのダウンロード（plain）
for z in range(1, 4):
    max_x, max_y = zoom_levels[z]
    for x in range(max_x):
        for y in range(max_y):
            filename = f"Z{z}_{x}_{y}.png"
            url = f"https://geacron.b-cdn.net/plain_Z{z}_{x}_{y}.png?v={today_str}"
            path = os.path.join(back_dir, filename)
            download_tile(url, path)

# 各年のマップ（1~2022）
for year in range(50, 500):
    padded_year = str(year).zfill(4)
    folder = os.path.join(base_dir, padded_year)
    os.makedirs(folder, exist_ok=True)
    for z in range(1, 4):
        max_x, max_y = zoom_levels[z]
        for x in range(max_x):
            for y in range(max_y):
                filename = f"Z{z}_{x}_{y}.png"
                url = f"https://geacron.b-cdn.net/tiles/area_{year}_Z{z}_{x}_{y}.png?v={today_str}"
                path = os.path.join(folder, filename)
                download_tile(url, path)
    time.sleep(2.5)  # レート制限対策
