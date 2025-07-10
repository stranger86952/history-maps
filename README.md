### 画像について
- 全部 : 256x256(.png) x ((2^1)^2+...+(2^6)^2) x (1+3000+2022)
  - 概算 : 5KB x 5460 x 5023 ≒ 130GB
- 一部 : 256x256(.png) x ((2^1)^2+...+(2^3)^2) x (1+2022)
  - 概算 : 5KB x 84 x 2023 ≒ 830MB

### ファイル
- beta : 非公開
- [img](./img/) : 地図の画像
- [tool](./tool/) : 地図画像管理用のスクリプト
  - [download.py](./tool/download.py)
  - [summarize.py](./tool/summarize.py)
  - [list.json](./tool/list.json) : 存在した画像のまとめ
- [index.html](./index.html)
- [style.css](./style.css)
- [map.js](./map.js)
- [script.js](./script.js)
