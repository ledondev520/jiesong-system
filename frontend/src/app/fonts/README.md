# 自托管字体

`Montserrat-latin-variable.woff2`：Montserrat（拉丁子集，400–700 可变字重），来源 Google Fonts 公开发布的文件（fonts.gstatic.com，v31），开发时下载一次提交入库，运行时不访问任何外部字体服务。授权 SIL Open Font License 1.1，版权见同目录 `OFL.txt`（上游 Montserrat 仓库原文，OFL §2 要求随字体附带）。sha256 `06b16db7a969135d48d38c49183be7fb88d4452e2a3011957c7851941f4e4879`。

仅用于公开页与认证页的拉丁字母/数字（`font-brand` 类，见 `globals.css`）；中文回落系统字体；宽度较大，不在表格里使用。`montserrat.ts` 是唯一入口。
