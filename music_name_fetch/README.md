# music_name_fetch

一个把“歌曲名”自动变成可用音频文件的本地脚本。

目标：  
用户输入歌曲关键词 → 脚本搜索可用来源 → 选择（自动或交互）→ 下载音频 → 转成 MP3/WAV → 输出到固定文件夹。

## 安装

```bash
python3 -m pip install -r /Users/helena/Cursor/jiesong_system/music_name_fetch/requirements.txt
```

系统还需要 `ffmpeg`：

```bash
brew install ffmpeg
```

## 使用

```bash
python3 /Users/helena/Cursor/jiesong_system/music_name_fetch/fetch_music.py "Bigger Story Music Travel Guide"
```

- 默认输出格式：`mp3`
- 默认输出目录：`/Users/helena/Cursor/jiesong_system/music_name_fetch/outputs`
- 默认搜索源：`youtube`, `soundcloud`

常用参数：

```bash
python3 /Users/helena/Cursor/jiesong_system/music_name_fetch/fetch_music.py "歌曲名" --format wav
python3 /Users/helena/Cursor/jiesong_system/music_name_fetch/fetch_music.py "歌曲名" --providers youtube --max-results 3 --no-interactive
python3 /Users/helena/Cursor/jiesong_system/music_name_fetch/fetch_music.py "歌曲名" --format mp3 --bitrate 2
```

也可以直接传播放链接（URL）：

```bash
python3 /Users/helena/Cursor/jiesong_system/music_name_fetch/fetch_music.py "https://www.youtube.com/...." --format wav
```

## 输出行为

- 每次运行会在输出目录下创建一个时间戳文件夹。
- 每次只保留最终音频文件（默认不保留下载源）。
- 若需要保留源文件加 `--keep-source`。

## 说明

本脚本通过 `yt-dlp` 做下载与检索，实际可得性依赖目标站点策略与版权限制。
脚本只是“标准化抓取流程”工具，建议用于你有权限或公开可访问的音频资源。
