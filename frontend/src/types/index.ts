export enum Role {
  ADMIN = 'ADMIN',
  PURCHASE = 'PURCHASE',
  SALES = 'SALES',
  FINANCE = 'FINANCE',
  WAREHOUSE = 'WAREHOUSE',
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  email?: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  lastLoginAt?: string; // DateTime string
  createdAt: string;
  updatedAt: string;
}

interface AgentGrant {
  id?: string;
  agentAccountId?: string;
  agentCredentialId?: string | null;
  resource: string;
  action: string;
  scopeJson?: string | null;
  createdAt?: string;
}

interface AgentCredential {
  id: string;
  credentialKey: string;
  label?: string | null;
  status: string;
  secretPreview?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface AgentAccount {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  defaultMode: string;
  createdAt: string;
  updatedAt: string;
  grants?: AgentGrant[];
  credentials?: AgentCredential[];
}

export interface AgentCredentialIssueResult {
  credential: AgentCredential;
  token: string;
}

interface Port {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductCategory {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    products?: number;
    children?: number;
  };
}

interface CustomsBroker {
  id: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;           // 供应商全称（合同用）
  shortName?: string;     // 简称
  // 联系人信息
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  // 公司信息（合同用）
  address?: string;       // 公司地址
  phone?: string;         // 公司电话
  taxId?: string;         // 纳税人识别号/税号
  bankAccountName?: string; // 收款户名
  bankName?: string;      // 开户银行名称
  bankBranch?: string;    // 开户支行
  bankCode?: string;      // 联行号/银行编号
  bankAccount?: string;   // 银行账号
  // 状态
  hasQualityIssue: boolean;
  qualityNote?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  aliases?: SupplierAlias[];
}

interface SupplierAlias {
  id: string;
  alias: string;
  supplierId: string;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  portId: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  port?: Port;
}

export interface Product {
  id: string;
  customsName: string;
  description?: string;
  specification?: string;
  unit?: string;
  categoryId?: string;
  // 海关申报信息
  hsCode?: string;      // HS编码（10位海关编码）
  declaration?: string; // 申报要素（汇总）
  // 重量信息
  grossWeight?: number;  // 毛重 (kg/件)
  netWeight?: number;    // 净重 (kg/件)
  volume?: number;       // 体积 (CBM/件)
  packingSpec?: string;  // 包装规格 (如: 4片/箱)
  // 尺寸信息（用于3D可视化，单位毫米）
  length?: number;       // 长度 (mm)
  width?: number;        // 宽度 (mm)
  height?: number;       // 高度 (mm)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  suppliers?: ProductSupplier[];
}

export interface HsCodeRecord {
  id: string;
  hsCode: string;
  productName: string;
  taxRate: number;
  refundRate?: number | null;
  exportTaxRate?: number | null;
  vatRate?: number | null;
  unit?: string | null;
  note?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
  declarationElements?: string | null;
  supervisionConditions?: string | null;
  inspectionQuarantine?: string | null;
  chapterHierarchyJson?: string | null;
  ciqCodesJson?: string | null;
  agreementRatesJson?: string | null;
  rcepRatesJson?: string | null;
  basicInfoJson?: string | null;
  taxInfoJson?: string | null;
  rawPayloadJson?: string | null;
  fetchedAt?: string | null;
  effectiveDate: string;
  /** 模糊检索相似度 0–1（仅部分列表接口返回） */
  similarity?: number;
  /** 置信分 0–100（如 AI 推荐对照列表等扩展字段） */
  confidenceScore?: number;
}

interface ProductSupplier {
  id: string;
  productId: string;
  supplierId: string;
  price?: number;
  updatedAt: string;
  supplier?: Supplier;
}

export enum CustomsDeclarationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  INSPECTING = 'INSPECTING',
  RELEASED = 'RELEASED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface CustomsDeclarationItem {
  id: string;
  productName: string;
  hsCode: string;
  quantity: number;
  unit?: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
}

export interface CustomsDeclaration {
  id: string;
  declarationNo: string;
  salesContractId?: string;
  status: CustomsDeclarationStatus;
  // 实际 schema 字段（与旧前端类型存在命名差异，用可选字段兼容两种命名）
  exporter?: string | null;
  consignee?: string | null;
  destinationCountry?: string | null;
  portOfLoading?: string | null;
  portOfDestination?: string | null;
  transportMode?: string | null;
  declarationDate?: string | null;
  releaseDate?: string | null;
  declaredAt?: string | null;    // Prisma schema 实际字段名
  exportDate?: string | null;    // Prisma schema 实际字段名（对应放行日期）
  customsBroker?: string | null;
  currency: string;
  exchangeRate?: number | null;
  totalAmount: number;
  totalPackages?: number | null;  // 旧字段名（schema 中为 totalQuantity）
  totalQuantity?: number | null;  // Prisma schema 实际字段名
  grossWeight?: number | null;    // 旧字段名（schema 中为 totalGrossWeight）
  totalGrossWeight?: number | null; // Prisma schema 实际字段名
  netWeight?: number | null;      // 旧字段名（schema 中为 totalNetWeight）
  totalNetWeight?: number | null;   // Prisma schema 实际字段名
  remarks?: string | null;
  note?: string | null;           // Prisma schema 实际字段名
  items?: CustomsDeclarationItem[];
  createdAt: string;
  updatedAt: string;
}

export type TaxRefundStatus =
  | 'ALL'
  | 'DRAFT'
  | 'APPLIED'
  | 'APPROVED'
  | 'REFUNDED'
  | 'REJECTED';

export interface TaxRefund {
  id: string;
  refundNo: string;
  status: Exclude<TaxRefundStatus, 'ALL'>;
  salesContractId: string;
  customsDeclarationId: string;
  forexVerificationId?: string | null;
  relation_no?: string | null;
  invoice_no?: string | null;
  vat_rate_type?: 1 | 13 | null;
  match_status?: 'pending' | 'passed' | 'blocked';
  declaredAmount: number;
  refundableAmount: number;
  refundedAmount: number;
  appliedAt: string;
  refundedAt?: string | null;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  SIGNED = 'SIGNED',
  PRODUCING = 'PRODUCING',
  READY = 'READY',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface PurchaseContract {
  id: string;
  contractNo: string;
  supplierId: string;
  totalAmount: number;
  paidAmount: number;
  taxRate: number;  // 税率（%），通常为 1 或 13
  status: PurchaseStatus;
  signedAt?: string;
  expectedDate?: string;
  invoiceNo?: string;
  storeName?: string;  // 发货店铺名称
  note?: string;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  items?: PurchaseItem[];
  payments?: Payment[];
}

export interface PurchaseItem {
  id: string;
  purchaseContractId: string;
  productId: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  specification?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
}

export enum SalesStatus {
  DRAFT = 'DRAFT',        // 草稿
  CONFIRMED = 'CONFIRMED', // 已确认
  PACKING = 'PACKING',    // 装箱中
  SHIPPED = 'SHIPPED',    // 已发运
  ARRIVED = 'ARRIVED',    // 已到达
  COMPLETED = 'COMPLETED', // 已完成
  CANCELLED = 'CANCELLED', // 已取消
}

export interface SalesContract {
  id: string;
  contractNo: string;  // EXP 编号，同时作为货柜标识
  // 销售信息
  totalAmount: number;
  receivedAmount: number;
  exchangeRate: number;
  status: SalesStatus;  // DRAFT/CONFIRMED/PACKING/SHIPPED/ARRIVED/COMPLETED
  signedAt?: string;
  note?: string;
  // 货柜信息（由出口合同承载）
  portId?: string;
  totalBoxes: number;
  grossWeight: number;
  netWeight: number;
  volume: number;
  shippedAt?: string;
  estimatedArrival?: string;
  customsBroker?: string;
  isFumigated?: boolean;
  hasTaxRefund?: boolean;
  // 时间戳
  createdAt: string;
  updatedAt: string;
  // 关联
  port?: Port;
  items?: SalesItem[];
  packingItems?: PackingItem[];  // 装箱明细
  payments?: Payment[];
  stores?: string[];  // 关联门店名称列表（由后端聚合自 packingItems）
  hasThirdPartyCargo?: boolean;
  sourceParties?: string[];
}

interface SalesItem {
  id: string;
  salesContractId: string;
  productId: string;
  storeId: string;
  quantity: number;
  unit?: string;
  costPrice: number;
  sellingPrice: number;
  specification?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
  store?: Store;
}

export enum InventoryStatus {
  PRODUCING = 'PRODUCING',
  PACKING = 'PACKING',
  SHIPPING = 'SHIPPING',
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export interface Inventory {
  id: string;
  productId: string;
  purchaseItemId?: string;
  salesItemId?: string;
  salesContractId?: string;
  containerId?: string;
  quantity: number;
  unit?: string;
  status: InventoryStatus;
  inboundAt?: string;
  outboundAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
  purchaseItem?: PurchaseItem & {
    purchaseContract?: PurchaseContract;
  };
}

// 装箱明细（关联 SalesContract）
export interface PackingItem {
  id: string;
  salesContractId: string;  // 关联出口合同（即货柜）
  productId: string;
  storeId?: string;
  quantity: number;
  unit?: string;
  boxes?: number;
  grossWeight?: number;
  netWeight?: number;
  volume?: number;
  // 价格信息（USD）
  unitPrice?: number;   // 单价（USD）
  totalPrice?: number;  // 总价（USD）= 单价 * 数量
  // 商品规格尺寸（用于3D可视化，单位 mm）
  length?: number;  // 长度 (mm)
  width?: number;   // 宽度 (mm)
  height?: number;  // 高度 (mm)
  // 3D 装箱位置（由装箱算法计算）
  posX?: number;  // 在货柜中的 X 位置 (mm)
  posY?: number;  // 在货柜中的 Y 位置 (mm)
  posZ?: number;  // 在货柜中的 Z 位置 (mm)
  note?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
  store?: Store;
}

export enum PaymentType {
  PAYABLE = 'PAYABLE',
  RECEIVABLE = 'RECEIVABLE',
  RECEIVABLE_RECEIPT = 'RECEIVABLE_RECEIPT',
  RECEIVABLE_COLLECTION = 'RECEIVABLE_COLLECTION',
}

export interface Payment {
  id: string;
  type: PaymentType;
  purchaseContractId?: string;
  salesContractId?: string;
  sourcePaymentId?: string;
  customerName?: string;
  amount: number;
  allocatedAmount?: number;
  remainingAmount?: number;
  currency: string;
  paymentMethod?: string;
  paymentDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// API Response Wrappers (匹配后端响应格式)
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type NotificationType =
  | 'PURCHASE_DRAFT'
  | 'SALES_DRAFT'
  | 'OVERDUE_RECEIVABLE'
  | 'LOW_STOCK'
  | 'TAX_REFUND_MONTHLY'
  | 'INVOICE_MISSING';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  type: 'PURCHASE' | 'SALES';
  supplierId?: string | null;
  taxRate?: number | null;
  note?: string | null;
  items: ContractTemplateItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ContractTemplateItem {
  productId: string;
  quantity: number;
  unitPrice?: number;
  unit?: string;
  note?: string;
  // sales-specific
  storeId?: string;
  costPrice?: number;
  sellingPrice?: number;
  exchangeRate?: number;
}
