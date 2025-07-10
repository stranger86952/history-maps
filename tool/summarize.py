import os
import json

def find_png_files_and_save_locations(base_img_dir="../img", num_img_folders=2022, output_json_file="./list.json"):
    target_png_files = []
    for z in range(1, 4):
        max_xy = 2**z
        for x in range(max_xy):
            for y in range(max_xy):
                target_png_files.append(f"Z{z}_{x}_{y}.png")
    found_locations = {filename: [] for filename in target_png_files}
    print(f"{len(target_png_files)}個のPNGファイルを{num_img_folders}個のフォルダから検索しています...")
    for i in range(1, num_img_folders + 1):
        folder_name = f"{i:04d}"
        current_folder_path = os.path.join(base_img_dir, folder_name)
        if os.path.isdir(current_folder_path):
            for filename in os.listdir(current_folder_path):
                if filename in found_locations:
                    found_locations[filename].append(i)
        if i % 100 == 0 or i == num_img_folders:
            print(f"進行状況: {i}/{num_img_folders}個のフォルダを確認済み...")
    try:
        with open(output_json_file, 'w', encoding='utf-8') as f:
            json.dump(found_locations, f, indent=4, ensure_ascii=False)
        print(f"\nファイルの位置情報を'{output_json_file}'に正常に保存しました。")
    except IOError as e:
        print(f"JSONファイルの保存中にエラーが発生しました: {e}")

if __name__ == "__main__":
    find_png_files_and_save_locations(
        base_img_dir="../img",
        num_img_folders=2022,
        output_json_file="./list.json"
    )
