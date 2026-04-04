import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 安全中间件 - 拦截敏感路径
 * 对敏感路径返回404，避免信息泄露
 */

// 定义敏感路径列表
const SENSITIVE_PATHS = [
  '/admin',
  '/api/internal',
  '/config',
  '/env',
  '/.env',
  '/.git',
  '/.svn',
  '/.htaccess',
  '/server-status',
  '/phpmyadmin',
  '/wp-admin',
  '/xmlrpc.php',
  '/.well-known/security.txt',
  '/api-docs',
  '/swagger',
  '/graphql',
  '/debug',
  '/trace',
  '/actuator',
];

// 定义敏感文件扩展名
const SENSITIVE_EXTENSIONS = ['.env', '.config', '.ini', '.log', '.sql', '.backup', '.bak', '.key', '.pem', '.p12', '.pfx'];

// 定义敏感文件模式
const SENSITIVE_PATTERNS = [
  /\.(env|config|ini|log|sql|backup|bak|key|pem|p12|pfx)$/i,
  /\.git/i,
  /\.svn/i,
  /\.hg/i,
  /docker-compose/i,
  /Dockerfile/i,
  /package\.json/i,
  /tsconfig/i,
  /vite\.config/i,
  /next\.config/i,
  /tailwind\.config/i,
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否是敏感路径
  const isSensitivePath = SENSITIVE_PATHS.some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );

  // 检查是否是敏感文件
  const isSensitiveFile = SENSITIVE_EXTENSIONS.some(ext =>
    pathname.toLowerCase().endsWith(ext)
  );

  // 检查是否包含敏感关键词
  const hasSensitiveKeyword = SENSITIVE_PATTERNS.some(pattern => pattern.test(pathname));

  if (isSensitivePath || isSensitiveFile || hasSensitiveKeyword) {
    // 返回404，不暴露任何服务器信息
    const response = new NextResponse(
      JSON.stringify({
        error: 'Not Found',
        message: 'The requested resource could not be found.',
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        },
      }
    );

    // 添加安全响应头到所有响应
    response.headers.set('X-Middleware-Cache', 'no-cache');

    return response;
  }

  // 为所有正常响应添加安全头部
  const response = NextResponse.next();

  // 添加安全头部
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

// 配置匹配路径
export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico (网站图标)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
