#!/bin/bash
#
# 捷淞进销存系统 - 一键启动脚本
# 用法: ./start.sh [--stop] [--restart]
#
# 选项:
#   --stop    停止所有服务
#   --restart 重启所有服务
#   无参数    启动所有服务
#

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=3001

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 停止指定端口的进程
stop_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        print_info "停止端口 $port 上的进程..."
        echo $pids | xargs kill -9 2>/dev/null
        sleep 1
        print_success "端口 $port 已释放"
    fi
}

# 停止所有服务
stop_services() {
    print_info "停止所有服务..."
    stop_port $BACKEND_PORT
    stop_port $FRONTEND_PORT
    print_success "所有服务已停止"
}

# 启动后端服务
start_backend() {
    print_info "启动后端服务 (端口 $BACKEND_PORT)..."
    cd "$BACKEND_DIR"
    
    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        print_warning "未找到 node_modules，正在安装依赖..."
        npm install
    fi
    
    # 后台启动
    nohup npm run dev > /dev/null 2>&1 &
    
    # 等待启动
    sleep 3
    
    # 验证
    if curl -s "http://localhost:$BACKEND_PORT/api/v1/auth/login" -X POST -H 'Content-Type: application/json' -d '{}' > /dev/null 2>&1; then
        print_success "后端服务启动成功 ✓"
    else
        print_error "后端服务启动失败"
        return 1
    fi
}

# 启动前端服务
start_frontend() {
    print_info "启动前端服务 (端口 $FRONTEND_PORT)..."
    cd "$FRONTEND_DIR"
    
    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        print_warning "未找到 node_modules，正在安装依赖..."
        npm install
    fi
    
    # 后台启动
    nohup npm run dev > /dev/null 2>&1 &
    
    # 等待启动
    sleep 5
    
    # 验证
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -q "200"; then
        print_success "前端服务启动成功 ✓"
    else
        print_error "前端服务启动失败"
        return 1
    fi
}

# 显示服务状态
show_status() {
    echo ""
    echo "=========================================="
    echo -e "  ${GREEN}捷淞进销存系统${NC}"
    echo "=========================================="
    echo ""
    echo -e "  后端服务: ${GREEN}http://localhost:$BACKEND_PORT${NC}"
    echo -e "  前端服务: ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
    echo ""
    echo -e "  打开浏览器访问: ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
    echo ""
    echo "  管理员账号: admin / <DEFAULT_ADMIN_PASSWORD>"
    echo ""
    echo "=========================================="
    echo -e "  停止服务: ${YELLOW}./start.sh --stop${NC}"
    echo "=========================================="
    echo ""
}

# 主函数
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║      捷淞进销存系统 - 启动脚本         ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    case "$1" in
        --stop)
            stop_services
            ;;
        --restart)
            stop_services
            sleep 2
            start_backend && start_frontend && show_status
            ;;
        *)
            # 先清理可能存在的旧进程
            stop_port $BACKEND_PORT
            stop_port $FRONTEND_PORT
            sleep 1
            
            # 启动服务
            start_backend && start_frontend && show_status
            ;;
    esac
}

# 执行主函数
main "$@"
