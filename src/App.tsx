/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowRightLeft,
  BellRing,
  BarChart3,
  BookOpen,
  Boxes,
  Camera,
  Check,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  LayoutDashboard,
  Link2,
  ListFilter,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Package,
  Settings,
  Unlock,
  ShieldCheck,
  ShoppingCart,
  Upload,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { BoxScannerModal, ScannedBoxData } from './components/BoxScannerModal';
import { CustomerLedgerView } from './components/CustomerLedgerView';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { MedicineCompareView } from './components/MedicineCompareView';
import { PosAndDailyAccountsView } from './components/PosAndDailyAccountsView';
import { StaffAndShopView } from './components/StaffAndShopView';
import {
  BD_COMPANIES_DIRECTORY,
  BD_GENERICS_DIRECTORY,
  BD_MEDICINES_CATALOG,
  buildPurchaseCartFromTransaction,
  buildSaleCartFromTransaction,
  CATALOG_BY_BRAND_STRENGTH,
  CATALOG_BY_ID,
  findMatchingInventoryRecord,
  formatCartItemInvoiceLine,
  formatCleanMoney,
  formatPurchaseItemInvoiceLine,
  formatTransactionItemsText,
  getInventoryStockForMedicine,
  getInvoiceFormPrefix,
  getShortDosageForm,
  isCoreDatabaseMedicineId,
  parseTransactionItemsDetailed,
} from './data/bdMedicines';
import {
  DEFAULT_SHOP_PROFILE,
  getTodayDateStr,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_INVENTORY,
  INITIAL_DEMO_PRICE_ALERTS,
  INITIAL_DEMO_PRICE_WATCHES,
  INITIAL_DEMO_STAFF,
  INITIAL_DEMO_TRANSACTIONS,
} from './data/demoSeedData';
import {
  auth,
  db,
  EXPLICIT_LOGOUT_KEY,
  handleFirestoreError,
  loadSavedShopCloudSession,
  LOGGED_OUT_FLAG_KEY,
  logOutUser,
  OperationType,
  registerNewShopOwnerAccount,
  sanitizeNumber,
  sanitizeString,
  saveShopCloudSession,
  SHOP_CLOUD_SESSION_KEY,
  ShopCloudSession,
  signInShopCloudAccount,
  signInWithGoogle,
} from './firebase';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import {
  CartItem,
  Customer,
  CustomMedicine,
  InventoryItem,
  MedicineCatalogItem,
  PriceAlert,
  PriceWatch,
  PurchaseCartItem,
  PurchasePackUnit,
  ShopProfile,
  StaffMember,
  Transaction,
} from './types';
import {
  downloadPharmacyBackupJson,
  fetchServerPharmacyState,
  loadIndexedDbSnapshot,
  parsePharmacyBackupJson,
  PharmacyPersistentState,
  pushServerPharmacyState,
  saveIndexedDbSnapshot,
} from './utils/persistentStorage';

type ActiveSection =
  | 'dashboard'
  | 'compare'
  | 'pos_accounts'
  | 'inventory'
  | 'customer_ledger'
  | 'staff_shop';

const PUBLIC_APP_URL =
  'https://ais-pre-gftser6y7eip7eqqokrgd4-145385287677.asia-southeast1.run.app';

const SHARED_PHARMACY_OWNER_ID = 'iqbal-pharmacy';
const SHARED_SHOP_DOC_ID = 'shop_iqbal_pharmacy';

const STORAGE_KEYS = {
  SHOP: 'pharma_pos_bd_v3_shop',
  INVENTORY: 'pharma_pos_bd_v3_inventory',
  CUSTOMERS: 'pharma_pos_bd_v3_customers',
  TRANSACTIONS: 'pharma_pos_bd_v3_transactions',
  STAFF: 'pharma_pos_bd_v3_staff',
  CUSTOM_MEDS: 'pharma_pos_bd_v3_custom_meds',
  PRICE_WATCHES: 'pharma_pos_bd_v3_price_watches',
  PRICE_ALERTS: 'pharma_pos_bd_v3_price_alerts',
  DELETED_IDS: 'pharma_pos_bd_v3_deleted_ids',
  POS_CART: 'pharma_pos_bd_v3_pos_cart',
  PURCHASE_CART: 'pharma_pos_bd_v3_purchase_cart',
  SEED_MIGRATED: 'pharma_pos_bd_v3_seed_migrated_v3',
  HAS_USER_DATA: 'pharma_pos_bd_v3_has_user_data',
};

const DEFAULT_POS_CART: CartItem[] = [
  {
    medicineId: 'med-seclo-20',
    inventoryId: 'inv-seclo-20',
    brandName: 'Seclo',
    genericName: 'Omeprazole',
    companyName: 'Square Pharmaceuticals PLC',
    strength: '20 mg',
    dosageForm: 'Capsule',
    unitPrice: 6.0,
    originalUnitPrice: 6.0,
    purchasePrice: 5.28,
    originalPurchasePrice: 5.28,
    qty: 10,
    availableStock: 420,
  },
  {
    medicineId: 'med-napa-extend',
    inventoryId: 'inv-napa-extend',
    brandName: 'Napa Extend',
    genericName: 'Paracetamol',
    companyName: 'Beximco Pharmaceuticals Ltd.',
    strength: '665 mg',
    dosageForm: 'Tablet',
    unitPrice: 2.0,
    originalUnitPrice: 2.0,
    purchasePrice: 1.76,
    originalPurchasePrice: 1.76,
    qty: 12,
    availableStock: 240,
  },
  {
    medicineId: 'med-napa-500',
    inventoryId: 'inv-napa-500',
    brandName: 'Napa',
    genericName: 'Paracetamol',
    companyName: 'Beximco Pharmaceuticals Ltd.',
    strength: '500 mg',
    dosageForm: 'Tablet',
    unitPrice: 1.2,
    originalUnitPrice: 1.2,
    purchasePrice: 1.06,
    originalPurchasePrice: 1.06,
    qty: 10,
    availableStock: 850,
  },
];

const DEFAULT_PURCHASE_CART: PurchaseCartItem[] = [
  {
    medicineId: 'med-seclo-20',
    inventoryId: 'inv-seclo-20',
    brandName: 'Seclo',
    genericName: 'Omeprazole',
    companyName: 'Square Pharmaceuticals PLC',
    strength: '20 mg',
    dosageForm: 'Capsule',
    packSize: '10 × 10 (100 pcs)',
    purchasePrice: 5.28,
    unitPrice: 6.0,
    qty: 100,
    batchNo: 'SCL-2610',
    expiryDate: '2028-06-30',
    availableStock: 420,
  },
  {
    medicineId: 'med-napa-extend',
    inventoryId: 'inv-napa-extend',
    brandName: 'Napa Extend',
    genericName: 'Paracetamol',
    companyName: 'Beximco Pharmaceuticals Ltd.',
    strength: '665 mg',
    dosageForm: 'Tablet',
    packSize: '10 × 12 (120 pcs)',
    purchasePrice: 1.76,
    unitPrice: 2.0,
    qty: 120,
    batchNo: 'NPX-2610',
    expiryDate: '2028-08-31',
    availableStock: 240,
  },
  {
    medicineId: 'med-napa-500',
    inventoryId: 'inv-napa-500',
    brandName: 'Napa',
    genericName: 'Paracetamol',
    companyName: 'Beximco Pharmaceuticals Ltd.',
    strength: '500 mg',
    dosageForm: 'Tablet',
    packSize: '51 × 10 (510 pcs)',
    purchasePrice: 1.06,
    unitPrice: 1.2,
    qty: 100,
    batchNo: 'NPA-2610',
    expiryDate: '2028-09-30',
    availableStock: 850,
  },
];

function getCanonicalDocId(rawId: string): string {
  if (!rawId) return rawId;
  return rawId.replace(
    /^(inv-[a-z0-9-]+|cust-\d+|tx-(?:sale|pur|due)-\d+|staff-[a-z0-9-]+|watch-[a-z0-9-]+|alert-demo-\d+)(?:_[a-zA-Z0-9_-]{6})+$/,
    '$1'
  );
}

function getDocTimestampMs(data: Record<string, unknown>): number {
  const u = data.updatedAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (u && typeof u.toMillis === 'function') return u.toMillis();
  if (u && typeof u.seconds === 'number') return u.seconds * 1000;
  const c = data.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c && typeof c.seconds === 'number') return c.seconds * 1000;
  if (typeof data.updatedAtMs === 'number') return data.updatedAtMs;
  return 0;
}

function buildShopCloudPayload(shop: ShopProfile, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    shopName: sanitizeString(shop.shopName, 120, DEFAULT_SHOP_PROFILE.shopName),
    licenseNo: sanitizeString(shop.licenseNo, 60, DEFAULT_SHOP_PROFILE.licenseNo),
    phone: sanitizeString(shop.phone, 30, DEFAULT_SHOP_PROFILE.phone),
    address: sanitizeString(shop.address, 250, DEFAULT_SHOP_PROFILE.address),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildInventoryCloudPayload(inv: InventoryItem, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    medicineId: sanitizeString(inv.medicineId, 100, 'custom-item'),
    brandName: sanitizeString(inv.brandName, 120, 'Custom Product'),
    genericName: sanitizeString(inv.genericName, 150, inv.brandName || 'Custom Product'),
    companyName: sanitizeString(inv.companyName, 120, 'Custom / General'),
    strength: sanitizeString(inv.strength, 60, 'Standard'),
    dosageForm: sanitizeString(inv.dosageForm, 60, 'Tablet'),
    packSize: sanitizeString(inv.packSize, 60, '10 × 10'),
    purchasePrice: sanitizeNumber(inv.purchasePrice, 0, 1000000),
    unitPrice: sanitizeNumber(inv.unitPrice, 0, 1000000),
    stripPrice: sanitizeNumber(inv.stripPrice, 0, 1000000),
    stockQty: sanitizeNumber(inv.stockQty, 0, 10000000),
    minStockLevel: sanitizeNumber(inv.minStockLevel, 0, 100000),
    batchNo: sanitizeString(inv.batchNo, 60, 'B-101'),
    expiryDate: sanitizeString(inv.expiryDate, 30, '2028-06-30'),
    shelfLocation: sanitizeString(inv.shelfLocation, 60, 'Rack A-1'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildCustomerCloudPayload(cust: Customer, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    name: sanitizeString(cust.name, 120),
    phone: sanitizeString(cust.phone, 30),
    address: sanitizeString(cust.address, 250),
    totalPurchased: sanitizeNumber(cust.totalPurchased),
    totalPaid: sanitizeNumber(cust.totalPaid),
    totalDue: sanitizeNumber(cust.totalDue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildTransactionCloudPayload(tx: Transaction, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    txType: tx.txType,
    invoiceNo: sanitizeString(tx.invoiceNo, 60, 'INV-01'),
    dateStr: sanitizeString(tx.dateStr, 20, getTodayDateStr()),
    partyId: sanitizeString(tx.partyId, 128, 'walk-in'),
    partyName: sanitizeString(tx.partyName, 120, 'সাধারণ ক্রেতা'),
    partyPhone: sanitizeString(tx.partyPhone, 30, 'N/A'),
    itemsSummary: sanitizeString(tx.itemsSummary, 10000, 'ঔষধ বিক্রয়'),
    totalCount: sanitizeNumber(tx.totalCount, 0, 1000000),
    subTotal: sanitizeNumber(tx.subTotal),
    discount: sanitizeNumber(tx.discount),
    grandTotal: sanitizeNumber(tx.grandTotal),
    paidAmount: sanitizeNumber(tx.paidAmount),
    dueAmount: sanitizeNumber(tx.dueAmount),
    paymentMethod: tx.paymentMethod,
    staffName: sanitizeString(tx.staffRole === 'owner' ? 'Owner' : tx.staffName, 100, 'Owner'),
    staffRole: tx.staffRole,
    counterName: sanitizeString(tx.counterName, 60, 'কাউন্টার ১'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildStaffCloudPayload(st: StaffMember, ownerId = SHARED_PHARMACY_OWNER_ID) {
  const payload: Record<string, unknown> = {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    name: sanitizeString(st.roleTitle === 'owner' ? 'Owner' : st.name, 100, 'Owner'),
    roleTitle: st.roleTitle,
    phone: sanitizeString(st.phone, 30),
    shift: sanitizeString(st.shift, 60),
    counterName: sanitizeString(st.counterName, 60),
    active: Boolean(st.active),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (st.email && st.email.trim()) {
    payload.email = sanitizeString(st.email.trim(), 120);
  }
  if (st.password && st.password.trim()) {
    payload.password = sanitizeString(st.password.trim(), 100);
  }
  return payload;
}

function buildCustomMedCloudPayload(cm: CustomMedicine, ownerId = SHARED_PHARMACY_OWNER_ID) {
  const unitPrice = sanitizeNumber(cm.unitPrice, 0, 1000000);
  const purchasePrice = sanitizeNumber(
    typeof cm.purchasePrice === 'number' && cm.purchasePrice > 0
      ? cm.purchasePrice
      : Number((unitPrice * 0.88).toFixed(2)),
    0,
    1000000
  );
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    brandName: sanitizeString(cm.brandName, 120, 'Custom Product'),
    genericName: sanitizeString(cm.genericName, 150, cm.brandName || 'Custom Product'),
    companyName: sanitizeString(cm.companyName, 120, 'Custom / General'),
    strength: sanitizeString(cm.strength, 60, 'Standard'),
    dosageForm: sanitizeString(cm.dosageForm, 60, 'Tablet'),
    packSize: sanitizeString(cm.packSize, 60, '10 × 10'),
    purchasePrice,
    unitPrice,
    stripPrice: sanitizeNumber(cm.stripPrice, 0, 1000000),
    therapeuticClass: sanitizeString(cm.therapeuticClass, 100, 'General Medicine'),
    indication: sanitizeString(cm.indication, 300, 'চিকিৎসকের পরামর্শ অনুযায়ী সেব্য'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildPriceWatchCloudPayload(w: PriceWatch, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    medicineId: sanitizeString(w.medicineId, 100),
    brandName: sanitizeString(w.brandName, 120),
    genericName: sanitizeString(w.genericName, 150),
    companyName: sanitizeString(w.companyName, 120),
    strength: sanitizeString(w.strength, 60),
    baselineUnitPrice: sanitizeNumber(w.baselineUnitPrice, 0, 1000000),
    currentUnitPrice: sanitizeNumber(w.currentUnitPrice, 0, 1000000),
    targetAlertPrice: sanitizeNumber(w.targetAlertPrice, 0, 1000000),
    notifyOnAnyChange: Boolean(w.notifyOnAnyChange),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildPriceAlertCloudPayload(a: PriceAlert, ownerId = SHARED_PHARMACY_OWNER_ID) {
  return {
    ownerId: sanitizeString(ownerId, 128, SHARED_PHARMACY_OWNER_ID),
    medicineId: sanitizeString(a.medicineId, 100),
    brandName: sanitizeString(a.brandName, 120),
    genericName: sanitizeString(a.genericName, 150),
    companyName: sanitizeString(a.companyName, 120),
    strength: sanitizeString(a.strength, 60),
    oldUnitPrice: sanitizeNumber(a.oldUnitPrice, 0, 1000000),
    newUnitPrice: sanitizeNumber(a.newUnitPrice, 0, 1000000),
    oldStripPrice: sanitizeNumber(a.oldStripPrice, 0, 1000000),
    newStripPrice: sanitizeNumber(a.newStripPrice, 0, 1000000),
    changedBy: sanitizeString(a.changedBy, 100, 'Owner'),
    dateStr: sanitizeString(a.dateStr, 30, getTodayDateStr()),
    isRead: Boolean(a.isRead),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export default function App() {
  const hadLocalDataOnBootRef = useRef<boolean>(
    typeof window !== 'undefined' &&
      (localStorage.getItem(STORAGE_KEYS.HAS_USER_DATA) === '1' ||
        localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) !== null ||
        localStorage.getItem(STORAGE_KEYS.CUSTOM_MEDS) !== null)
  );
  const serverHydratedRef = useRef<boolean>(false);
  const [serverHydrated, setServerHydrated] = useState<boolean>(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [cloudSession, setCloudSession] = useState<ShopCloudSession | null>(() =>
    loadSavedShopCloudSession()
  );
  const [authReady, setAuthReady] = useState(false);
  const [showCloudLoginModal, setShowCloudLoginModal] = useState(false);
  const [cloudAuthTab, setCloudAuthTab] = useState<'login' | 'register_owner'>('login');
  const [cloudLoginEmail, setCloudLoginEmail] = useState('01812-358839');
  const [cloudLoginPhone, setCloudLoginPhone] = useState('01812-358839');
  const [cloudLoginPassword, setCloudLoginPassword] = useState('IqbalPharmacy#2026');
  const [cloudLoginRole, setCloudLoginRole] = useState<'owner' | 'staff'>('owner');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [cloudLoginLoading, setCloudLoginLoading] = useState(false);
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null);

  const [registerShopName, setRegisterShopName] = useState('ইকবাল ফার্মেসী');
  const [registerOwnerName, setRegisterOwnerName] = useState('ইকবাল মাহমুদ');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('01812-358839');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [seedingCloud, setSeedingCloud] = useState(false);
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);

  const isLoggedOutExplicitly =
    typeof window !== 'undefined' &&
    (localStorage.getItem(LOGGED_OUT_FLAG_KEY) === '1' ||
      sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1');

  const isCloudLoggedIn = Boolean(cloudSession && !isLoggedOutExplicitly);
  const activeCloudUid = isCloudLoggedIn ? (cloudSession?.uid || user?.uid || null) : null;

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [deletedIds, setDeletedIds] = useState<string[]>(() => {
    const raw = loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []);
    const filtered = raw.filter(
      (id) => !isCoreDatabaseMedicineId(id) && !id.startsWith('inv-seed-')
    );
    if (filtered.length !== raw.length) {
      saveLocal(STORAGE_KEYS.DELETED_IDS
