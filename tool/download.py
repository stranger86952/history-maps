import os
import time
import requests
from datetime import datetime
from multiprocessing import Pool, cpu_count # cpu_count は使いますが、download_year_tiles 内では使わない

# キャッシュバスター用の日付（例：20250710）
today_str = datetime.now().strftime("%Y%m%d")

# ズームレベルとそれに対応する座標数
zoom_levels = {
    1: (2, 2),
    2: (4, 4),
    3: (8, 8),
    4: (16, 16),
    5: (32, 32),
    6: (64, 64),
}

# 保存フォルダ
base_dir = "../img"
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

def download_year_tiles(year):
    """
    指定された年のタイル画像をダウンロードする関数
    """
    padded_year = str(year).zfill(4)
    folder = os.path.join(base_dir, padded_year)
    os.makedirs(folder, exist_ok=True)

    # ここが変更点: download_year_tiles 内での Pool の作成を削除し、直列でダウンロード
    for z in range(1, 4):
        max_x, max_y = zoom_levels[z]
        for x in range(max_x):
            for y in range(max_y):
                filename = f"Z{z}_{x}_{y}.png"
                url = f"https://geacron.b-cdn.net/tiles/area_{year}_Z{z}_{x}_{y}.png?v={today_str}"
                path = os.path.join(folder, filename)
                download_tile(url, path) # 個々のタイルダウンロードは直列

    # レート制限対策
    time.sleep(2.5)

def main():
    start_time = time.time()

    # 背景マップのダウンロード（plain）
    print("Downloading background tiles...")
    # 背景マップのダウンロードは直列で実行
    for z in range(1, 4):
        max_x, max_y = zoom_levels[z]
        for x in range(max_x):
            for y in range(max_y):
                filename = f"Z{z}_{x}_{y}.png"
                url = f"https://geacron.b-cdn.net/plain_Z{z}_{x}_{y}.png?v={today_str}"
                path = os.path.join(back_dir, filename)
                download_tile(url, path)

    # 各年のマップ（1~2022）を並列処理
    print("\nDownloading year tiles...")
    years_to_download = range(1, 2023)

    # 年ごとにプロセスを割り当てて並列でダウンロード
    # ここは変更なし。この Pool がトップレベルの並列処理を行う。
    with Pool(processes=cpu_count()) as pool: # CPUコア数分のプロセスを生成
        pool.map(download_year_tiles, years_to_download)

    end_time = time.time()
    print(f"\nAll downloads completed in {end_time - start_time:.2f} seconds.")

if __name__ == "__main__":
    main()