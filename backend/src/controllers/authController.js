/**
 * Input: 认证服务
 * Output: 认证相关的HTTP响应
 * Pos: 认证控制器，处理登录/注册/用户管理/找回密码请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const authService = require('../services/authService');
const { success, created, paginated } = require('../utils/response');

/**
 * 职责：处理用户登录请求
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    success(res, result, '登录成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：处理用户注册请求（管理员创建用户）
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const register = async (req, res, next) => {
  try {
    const userData = req.body;
    const user = await authService.register(userData);
    created(res, user, '用户创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：处理公开注册请求（新用户自助注册）
 * 思路：
 * 1. 新注册用户默认角色为SALES
 * 2. 新注册用户默认状态为未激活（需管理员审核）
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const publicRegister = async (req, res, next) => {
  try {
    const { username, password, name, phone } = req.body;
    const user = await authService.publicRegister({
      username,
      password,
      name,
      phone,
    });
    created(res, user, '注册成功，请等待管理员审核');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取当前登录用户信息
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.id);
    success(res, user, '获取成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：修改当前用户密码
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    success(res, null, '密码修改成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取用户列表（管理员）
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const parsedPage = parseInt(page, 10);
    const parsedPageSize = parseInt(pageSize, 10);

    // 验证分页参数
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ success: false, message: '页码必须是大于0的数字' });
    }
    if (Number.isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
      return res.status(400).json({ success: false, message: '每页数量必须是1-100之间的数字' });
    }

    const result = await authService.getUsers(parsedPage, parsedPageSize);
    paginated(res, result.users, result.total, parsedPage, parsedPageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新用户信息（管理员）
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userData = req.body;
    const user = await authService.updateUser(id, userData);
    success(res, user, '用户更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：找回密码（通过用户名+手机号验证身份后重置密码）
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const resetPassword = async (req, res, next) => {
  try {
    const { username, phone, newPassword } = req.body;
    const result = await authService.verifyAndResetPassword(username, phone, newPassword);
    success(res, result, '密码重置成功，请使用新密码登录');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  register,
  publicRegister,
  getCurrentUser,
  changePassword,
  getUsers,
  updateUser,
  resetPassword,
};
