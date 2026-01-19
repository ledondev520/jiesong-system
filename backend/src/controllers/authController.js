/**
 * Input: 认证服务
 * Output: 认证相关的HTTP响应
 * Pos: 认证控制器，处理登录/注册/用户管理请求
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
    const result = await authService.getUsers(parseInt(page), parseInt(pageSize));
    paginated(res, result.users, result.total, parseInt(page), parseInt(pageSize));
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

module.exports = {
  login,
  register,
  publicRegister,
  getCurrentUser,
  changePassword,
  getUsers,
  updateUser,
};
