// Test-only independent SQLite consumer. Input via stdin; never print code/password/token.
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL?.includes('jiesong-recovery-')) process.exit(2);
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  const prisma = require('../utils/prisma');
  try {
    await require('../services/passwordResetService').resetPassword(JSON.parse(input));
    process.stdout.write('200');
  } catch (error) { process.stdout.write(String(error.statusCode || 500)); }
  finally { await prisma.$disconnect(); }
});
