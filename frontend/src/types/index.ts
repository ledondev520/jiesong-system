export enum Role {
  ADMIN = 'ADMIN',
  PURCHASE = 'PURCHASE',
  SALES = 'SALES',
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

export interface Port {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  shortName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  bankAccount?: string;
  hasQualityIssue: boolean;
  qualityNote?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  aliases?: SupplierAlias[];
}

export interface SupplierAlias {
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  suppliers?: ProductSupplier[];
}

export interface ProductSupplier {
  id: string;
  productId: string;
  supplierId: string;
  price?: number;
  updatedAt: string;
  supplier?: Supplier;
}

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  SIGNED = 'SIGNED',
  PRODUCING = 'PRODUCING',
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
  status: PurchaseStatus;
  signedAt?: string;
  expectedDate?: string;
  invoiceNo?: string;
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
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface SalesContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  exchangeRate: number;
  status: SalesStatus;
  signedAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  items?: SalesItem[];
  payments?: Payment[];
}

export interface SalesItem {
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
}

export enum ContainerStatus {
  PENDING = 'PENDING',
  LOADING = 'LOADING',
  SHIPPED = 'SHIPPED',
  ARRIVED = 'ARRIVED',
}

export interface Container {
  id: string;
  containerNo: string;
  portId: string;
  status: ContainerStatus;
  totalBoxes: number;
  grossWeight: number;
  netWeight: number;
  volume: number;
  shippedAt?: string;
  estimatedArrival?: string;
  note?: string;
  customsBroker?: string;
  isFumigated?: boolean;
  hasTaxRefund?: boolean;
  createdAt: string;
  updatedAt: string;
  port?: Port;
  items?: ContainerItem[];
}

export interface ContainerItem {
  id: string;
  containerId: string;
  productId: string;
  storeId?: string;
  quantity: number;
  unit?: string;
  boxes?: number;
  grossWeight?: number;
  netWeight?: number;
  volume?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
}

export enum PaymentType {
  PAYABLE = 'PAYABLE',
  RECEIVABLE = 'RECEIVABLE',
}

export interface Payment {
  id: string;
  type: PaymentType;
  purchaseContractId?: string;
  salesContractId?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  paymentDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// API Response Wrappers
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
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
