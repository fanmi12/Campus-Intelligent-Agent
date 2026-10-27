# Nginx 与 systemd 部署示例

这里仅保存通用配置，不包含维护者的服务器地址、生产域名或登录信息。Docker Compose 的完整入口见 [`../../README.md`](../../README.md)。

1. 用 Node.js 24 和项目指定的 pnpm 安装依赖并执行 `pnpm build`。
2. 将 standalone 构建产物、`.next/static`、`public` 和 `knowledge` 放到服务器的 `/opt/campus-agent/current`，把模型与后台配置放在 `/opt/campus-agent/shared/.env`，数据库目录放在 `/opt/campus-agent/shared/data`。
3. 创建服务账号 `campus-agent`，确保它能读取应用及环境文件、写入数据库目录，然后按目标机器调整 `campus-agent.service`。
4. 将 `campus-agent.nginx.conf` 中的 `agent.example.com` 改成自己的域名，配置该域名的证书路径。应用只监听 `127.0.0.1:3100`，由 Nginx 对外提供访问。
5. 在服务器上安装服务与 Nginx 配置，验证配置后启动。证书续期重载示例见 `certbot-reload-nginx.sh`。

这些示例假设站点证书已经准备好；也可先用 HTTP 站点完成证书申请，再启用 HTTPS。实际生产配置及 SSH 地址放在 Git 忽略的本地文件中。
