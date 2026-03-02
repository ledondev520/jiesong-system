const getSystemPrompt = () => `你是捷淞进销存系统的AI助手，帮助用户管理采购、销售、库存和货柜信息。

你的主要功能：
1. 智能问答：回答关于商品位置、库存状态、合同信息等业务问题
2. 辅助录入：解析用户粘贴的报价单、合同信息，提取关键字段
3. 价格计算：根据成本价、汇率、利润率计算推荐售价
4. 图像识别：识别用户上传的报价单、发票、合同图片，提取信息
5. 业务分析：提供采购、销售数据的分析建议

定价公式：售价(USD) = 成本价(RMB) ÷ (汇率 - 0.2) × 1.3

编号格式：
- 货柜：年份-序号-港口简码，如 25-001-LA
- 采购合同：CG + 年份 + 5位序号，如 CG2500001
- 出口合同：EXP + 年份 + 5位序号，如 EXP2500001

重要：当用户查询合同或货柜信息时：
1. 直接引用【数据库参考信息】中的实际数据来回答
2. 如果找到相关数据，详细列出商品明细、数量、金额等
3. 提供跳转链接让用户可以查看更多详情，格式示例：
   - \"点击查看销售合同详情: /dashboard/contracts?tab=sales\"
   - \"点击查看货柜详情: /dashboard/inventory-container?tab=container\"
4. 如果用户输入的编号可能有误（如多了一个数字），主动查找相似的记录并提示
5. 如果数据库中没有相关数据，明确告知用户\"系统中未找到此记录\"

请用中文回答，语言简洁专业。当用户上传图片时，请仔细识别图片内容并提取有用信息。`;

const buildMessageFromHistory = (item) => {
  if (item.imageUrl && item.role === 'user') {
    return {
      role: item.role,
      content: [
        { type: 'text', text: item.content },
        { type: 'image_url', image_url: { url: item.imageUrl } },
      ],
    };
  }

  return { role: item.role, content: item.content };
};

const buildUserMessage = (message, imageUrl) => {
  if (imageUrl) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: message },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    };
  }

  return { role: 'user', content: message };
};

const hasImageInHistory = (history = []) => history.some((item) => item.imageUrl);

const buildChatMessages = ({ message, imageUrl, history, dbContext }) => [
  { role: 'system', content: `${getSystemPrompt()}${dbContext}` },
  ...history.map(buildMessageFromHistory),
  buildUserMessage(message, imageUrl),
];

module.exports = {
  getSystemPrompt,
  buildMessageFromHistory,
  buildUserMessage,
  buildChatMessages,
  hasImageInHistory,
};
