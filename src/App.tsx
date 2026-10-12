/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
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
  BookOpen,
  Boxes,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Link2,
  LogIn,
  LogOut,
  Menu,
  ShoppingCart,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { CustomerLedgerView } from './components/CustomerLedgerView';
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
  handleFirestoreError,
  loadSavedShopCloudSession,
  logOutUser,
  OperationType,
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
  ShopProfile,
  StaffMember,
  Transaction,
} from './types';

type ActiveSection =
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

/**
 * Strips any legacy 6-character user UID suffix (e.g. "inv-seclo-20_a1b2c3" -> "inv-seclo-20")
 * so all logged-in users share the exact same canonical document IDs.
 */
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
    itemsSummary: sanitizeString(tx.itemsSummary, 600, 'ঔষধ বিক্রয়'),
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
  return {
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
  const [user, setUser] = useState<User | null>(null);
  const [cloudSession, setCloudSession] = useState<ShopCloudSession | null>(() =>
    loadSavedShopCloudSession()
  );
  const [authReady, setAuthReady] = useState(false);
  const [showCloudLoginModal, setShowCloudLoginModal] = useState(false);
  const [cloudLoginEmail, setCloudLoginEmail] = useState(
    () => loadSavedShopCloudSession()?.email || 'mhakbor2001@gmail.com'
  );
  const [cloudLoginPhone, setCloudLoginPhone] = useState(
    () => loadSavedShopCloudSession()?.phone || DEFAULT_SHOP_PROFILE.phone || '01712525994'
  );
  const [cloudLoginPassword, setCloudLoginPassword] = useState('IqbalPharmacy#2026');
  const [cloudLoginRole, setCloudLoginRole] = useState<'owner' | 'staff'>('owner');
  const [cloudLoginLoading, setCloudLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('compare');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [seedingCloud, setSeedingCloud] = useState(false);
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);

  const isCloudLoggedIn = Boolean(user || cloudSession);
  const activeCloudUid = user?.uid || cloudSession?.uid || null;

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Persistent Deleted IDs registry so deleted custom items NEVER reappear on refresh (core products cannot be deleted)
  const [deletedIds, setDeletedIds] = useState<string[]>(() => {
    const raw = loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []);
    const filtered = raw.filter(
      (id) => !isCoreDatabaseMedicineId(id) && !id.startsWith('inv-seed-')
    );
    if (filtered.length !== raw.length) {
      saveLocal(STORAGE_KEYS.DELETED_IDS, filtered);
    }
    return filtered;
  });

  const deletedIdsSet = useMemo(() => new Set(deletedIds), [deletedIds]);

  const markDeletedIds = (ids: string | string[]) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(
      (id) => !isCoreDatabaseMedicineId(id) && !id.startsWith('inv-seed-')
    );
    if (list.length === 0) return;
    setDeletedIds((prev) => {
      const next = Array.from(new Set([...prev, ...list]));
      saveLocal(STORAGE_KEYS.DELETED_IDS, next);
      return next;
    });
  };

  const unmarkDeletedId = (id: string) => {
    setDeletedIds((prev) => {
      if (!prev.includes(id)) return prev;
      const next = prev.filter((item) => item !== id);
      saveLocal(STORAGE_KEYS.DELETED_IDS, next);
      return next;
    });
  };

  // Offline-first states initialized from localStorage or rich Bangladesh Pharmacy seed data
  const [shopProfile, setShopProfile] = useState<ShopProfile>(() => {
    const saved = loadLocal(STORAGE_KEYS.SHOP, DEFAULT_SHOP_PROFILE);
    if (
      !saved.shopName ||
      saved.shopName === 'সেবা মেডিসিন কর্নার অ্যান্ড ফার্মেসি' ||
      saved.shopName.includes('OshudhBazar')
    ) {
      saveLocal(STORAGE_KEYS.SHOP, DEFAULT_SHOP_PROFILE);
      return DEFAULT_SHOP_PROFILE;
    }
    return saved;
  });

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const initialDeleted = new Set(
      loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []).filter(
        (id) => !isCoreDatabaseMedicineId(id) && !id.startsWith('inv-seed-')
      )
    );
    const saved = loadLocal<InventoryItem[]>(STORAGE_KEYS.INVENTORY, INITIAL_DEMO_INVENTORY);

    // Canonicalize IDs and deduplicate by canonical ID or medicineId (preferring newer updatedAtMs)
    const byKey = new Map<string, InventoryItem>();
    for (const rawItem of saved) {
      const canonId = getCanonicalDocId(rawItem.id);
      const isCoreSeed =
        canonId.startsWith('inv-seed-') ||
        INITIAL_DEMO_INVENTORY.some((d) => d.id === canonId || d.medicineId === rawItem.medicineId);
      if (!isCoreSeed && (initialDeleted.has(rawItem.id) || initialDeleted.has(canonId))) {
        continue;
      }
      const normalizedItem: InventoryItem = {
        ...rawItem,
        id: canonId,
      };
      const existing = byKey.get(canonId);
      if (!existing || (normalizedItem.updatedAtMs || 0) >= (existing.updatedAtMs || 0)) {
        byKey.set(canonId, normalizedItem);
      }
    }

    const cleaned = Array.from(byKey.values());
    const existingIds = new Set(cleaned.map((item) => item.id));
    const existingMedIds = new Set(cleaned.map((item) => item.medicineId));
    let changed = cleaned.length !== saved.length;

    for (const demoItem of INITIAL_DEMO_INVENTORY) {
      if (!existingIds.has(demoItem.id) && !existingMedIds.has(demoItem.medicineId)) {
        cleaned.push(demoItem);
        changed = true;
      }
    }

    if (changed || localStorage.getItem(STORAGE_KEYS.SEED_MIGRATED) !== '1') {
      try {
        localStorage.setItem(STORAGE_KEYS.SEED_MIGRATED, '1');
      } catch {
        // ignore storage errors
      }
      saveLocal(STORAGE_KEYS.INVENTORY, cleaned);
    }
    return cleaned;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const saved = loadLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
    const byId = new Map<string, Customer>();
    for (const c of saved) {
      const canonId = getCanonicalDocId(c.id);
      if (initialDeleted.has(c.id) || initialDeleted.has(canonId)) continue;
      const norm = { ...c, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (norm.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, norm);
      }
    }
    return Array.from(byId.values());
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const loaded = loadLocal(STORAGE_KEYS.TRANSACTIONS, INITIAL_DEMO_TRANSACTIONS);
    const byId = new Map<string, Transaction>();
    for (const t of loaded) {
      const canonId = getCanonicalDocId(t.id);
      if (initialDeleted.has(t.id) || initialDeleted.has(canonId)) continue;
      const formatted =
        t.txType === 'sale' || t.txType === 'purchase'
          ? { ...t, id: canonId, itemsSummary: formatTransactionItemsText(t.itemsSummary) }
          : { ...t, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (formatted.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, formatted);
      }
    }
    return Array.from(byId.values());
  });

  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const saved = loadLocal(STORAGE_KEYS.STAFF, INITIAL_DEMO_STAFF);
    const byId = new Map<string, StaffMember>();
    for (const s of saved) {
      const canonId = getCanonicalDocId(s.id);
      if (initialDeleted.has(s.id) || initialDeleted.has(canonId)) continue;
      const norm = { ...s, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (norm.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, norm);
      }
    }
    const list = Array.from(byId.values());
    return list.length > 0 ? list : INITIAL_DEMO_STAFF;
  });

  const [customMedicines, setCustomMedicines] = useState<CustomMedicine[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const saved = loadLocal<CustomMedicine[]>(STORAGE_KEYS.CUSTOM_MEDS, []);
    const byId = new Map<string, CustomMedicine>();
    for (const m of saved) {
      const canonId = getCanonicalDocId(m.id);
      const isCore = isCoreDatabaseMedicineId(canonId) || CATALOG_BY_ID.has(canonId);
      if (!isCore && (initialDeleted.has(m.id) || initialDeleted.has(canonId))) continue;
      const norm = { ...m, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (norm.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, norm);
      }
    }
    return Array.from(byId.values());
  });

  const [priceWatches, setPriceWatches] = useState<PriceWatch[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const saved = loadLocal(STORAGE_KEYS.PRICE_WATCHES, INITIAL_DEMO_PRICE_WATCHES);
    const byId = new Map<string, PriceWatch>();
    for (const w of saved) {
      const canonId = getCanonicalDocId(w.id);
      if (initialDeleted.has(w.id) || initialDeleted.has(canonId)) continue;
      const norm = { ...w, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (norm.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, norm);
      }
    }
    return Array.from(byId.values());
  });

  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() => {
    const initialDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
    const saved = loadLocal(STORAGE_KEYS.PRICE_ALERTS, INITIAL_DEMO_PRICE_ALERTS);
    const byId = new Map<string, PriceAlert>();
    for (const a of saved) {
      const canonId = getCanonicalDocId(a.id);
      if (initialDeleted.has(a.id) || initialDeleted.has(canonId)) continue;
      const norm = { ...a, id: canonId };
      const prev = byId.get(canonId);
      if (!prev || (norm.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
        byId.set(canonId, norm);
      }
    }
    return Array.from(byId.values());
  });

  const [activeStaff, setActiveStaff] = useState<StaffMember>(
    () => loadLocal(STORAGE_KEYS.STAFF, INITIAL_DEMO_STAFF)[0] || INITIAL_DEMO_STAFF[0]
  );

  // Persistent POS Cart state (saved in localStorage so refreshing never resets cart)
  const [posCart, setPosCart] = useState<CartItem[]>(() =>
    loadLocal<CartItem[]>(STORAGE_KEYS.POS_CART, DEFAULT_POS_CART)
  );

  // Persistent Purchase Invoice Cart state (saved in localStorage so refreshing never resets cart)
  const [purchaseCart, setPurchaseCart] = useState<PurchaseCartItem[]>(() =>
    loadLocal<PurchaseCartItem[]>(STORAGE_KEYS.PURCHASE_CART, DEFAULT_PURCHASE_CART)
  );

  // Active Invoice being edited through the full New-Invoice Builder
  const [editingInvoiceTx, setEditingInvoiceTx] = useState<Transaction | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync state changes to localStorage & cross-tab storage listener
  useEffect(() => {
    saveLocal(STORAGE_KEYS.SHOP, shopProfile);
  }, [shopProfile]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.INVENTORY, inventory);
  }, [inventory]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.CUSTOMERS, customers);
  }, [customers]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.TRANSACTIONS, transactions);
  }, [transactions]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.STAFF, staffList);
  }, [staffList]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.CUSTOM_MEDS, customMedicines);
  }, [customMedicines]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.PRICE_WATCHES, priceWatches);
  }, [priceWatches]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.PRICE_ALERTS, priceAlerts);
  }, [priceAlerts]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.DELETED_IDS, deletedIds);
  }, [deletedIds]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.POS_CART, posCart);
  }, [posCart]);
  useEffect(() => {
    saveLocal(STORAGE_KEYS.PURCHASE_CART, purchaseCart);
  }, [purchaseCart]);

  // Listen to storage events across browser tabs so multi-user / multi-counter tabs update immediately
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SHOP_CLOUD_SESSION_KEY) {
        try {
          setCloudSession(e.newValue ? (JSON.parse(e.newValue) as ShopCloudSession) : null);
        } catch {
          setCloudSession(null);
        }
        return;
      }
      if (!e.newValue) return;
      try {
        if (e.key === STORAGE_KEYS.SHOP) setShopProfile(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.INVENTORY) setInventory(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.CUSTOMERS) setCustomers(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.TRANSACTIONS) setTransactions(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.STAFF) setStaffList(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.CUSTOM_MEDS) setCustomMedicines(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.PRICE_WATCHES) setPriceWatches(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.PRICE_ALERTS) setPriceAlerts(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.DELETED_IDS) setDeletedIds(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.POS_CART) setPosCart(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.PURCHASE_CART) setPurchaseCart(JSON.parse(e.newValue));
      } catch {
        // ignore parse errors
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Auth listener + ShopCloudSession synchronization
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currUser) => {
      setUser(currUser);
      if (currUser) {
        const saved = loadSavedShopCloudSession();
        if (!saved || saved.uid !== currUser.uid) {
          const synced: ShopCloudSession = {
            uid: currUser.uid,
            email: currUser.email || saved?.email || 'mhakbor2001@gmail.com',
            displayName: currUser.displayName || saved?.displayName || 'ইকবাল মাহমুদ (Owner)',
            shopName: saved?.shopName || 'ইকবাল ফার্মেসী',
            phone: saved?.phone || '01712525994',
            operatorRole: saved?.operatorRole || 'owner',
            loggedInAt: saved?.loggedInAt || Date.now(),
          };
          saveShopCloudSession(synced);
          setCloudSession(synced);
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // If user has an active saved ShopCloudSession on load, ensure Firebase Auth is connected in background
  useEffect(() => {
    if (!authReady || user || !cloudSession) return;
    signInShopCloudAccount({
      email: cloudSession.email,
      displayName: cloudSession.displayName,
      shopName: cloudSession.shopName,
      phone: cloudSession.phone,
      operatorRole: cloudSession.operatorRole,
    })
      .then((sess) => {
        setCloudSession(sess);
      })
      .catch(() => {});
  }, [authReady, user, cloudSession]);

  // Shared Pharmacy Real-Time Firestore Listeners (accessible across ALL logged-in accounts)
  useEffect(() => {
    if (!authReady || !user) return;

    const deduplicateCloudDocs = <T extends { id: string; updatedAtMs?: number }>(
      rawDocs: { rawId: string; item: T }[]
    ): { items: T[]; staleSuffixIds: string[] } => {
      const byCanonId = new Map<string, { rawId: string; item: T }>();
      const staleSuffixIds: string[] = [];

      for (const entry of rawDocs) {
        const canonId = getCanonicalDocId(entry.rawId);
        const normalizedItem: T = { ...entry.item, id: canonId };
        if (entry.rawId !== canonId) {
          staleSuffixIds.push(entry.rawId);
        }
        const existing = byCanonId.get(canonId);
        if (!existing) {
          byCanonId.set(canonId, { rawId: entry.rawId, item: normalizedItem });
        } else {
          const newTs = normalizedItem.updatedAtMs || 0;
          const oldTs = existing.item.updatedAtMs || 0;
          if (newTs > oldTs || (newTs === oldTs && entry.rawId === canonId)) {
            byCanonId.set(canonId, { rawId: entry.rawId, item: normalizedItem });
          }
        }
      }

      return {
        items: Array.from(byCanonId.values()).map((v) => v.item),
        staleSuffixIds,
      };
    };

    const mergeCloudAndLocal = <T extends { id: string; updatedAtMs?: number }>(
      cloudItems: T[],
      localItems: T[],
      options?: { isInventory?: boolean; isCustomMeds?: boolean }
    ): { merged: T[]; toUploadToCloud: T[] } => {
      const currentDeleted = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_IDS, []));
      const isInv = Boolean(options?.isInventory);
      const isCMed = Boolean(options?.isCustomMeds);

      const canBeDeleted = (id: string) => {
        if (isInv && INITIAL_DEMO_INVENTORY.some((d) => d.id === id)) return false;
        if (isCMed && (isCoreDatabaseMedicineId(id) || CATALOG_BY_ID.has(id))) return false;
        return true;
      };

      const validCloud = cloudItems.filter((item) => {
        const canonId = getCanonicalDocId(item.id);
        if (!canBeDeleted(canonId)) return true;
        return !currentDeleted.has(item.id) && !currentDeleted.has(canonId);
      });

      const cloudMap = new Map<string, T>();
      for (const c of validCloud) {
        cloudMap.set(getCanonicalDocId(c.id), { ...c, id: getCanonicalDocId(c.id) });
      }

      const mergedMap = new Map<string, T>(cloudMap);
      const toUploadToCloud: T[] = [];

      for (const l of localItems) {
        const canonId = getCanonicalDocId(l.id);
        if (canBeDeleted(canonId) && (currentDeleted.has(l.id) || currentDeleted.has(canonId))) {
          continue;
        }
        const normLocal: T = { ...l, id: canonId };
        const cloudMatch = cloudMap.get(canonId);
        const localTs = normLocal.updatedAtMs || 0;

        if (cloudMatch) {
          const cloudTs = cloudMatch.updatedAtMs || 0;
          // If local item was modified more recently than cloud item, preserve local and push to cloud
          if (localTs > cloudTs + 2000) {
            mergedMap.set(canonId, normLocal);
            toUploadToCloud.push(normLocal);
          }
        } else {
          // Item is in local but not in cloud:
          // Keep it if:
          // 1) It was created/edited by the user (localTs > 0), OR
          // 2) It is a core inventory item, OR
          // 3) Cloud collection is completely empty (initial bootstrap)
          if (localTs > 0 || isInv || validCloud.length === 0) {
            mergedMap.set(canonId, normLocal);
            toUploadToCloud.push(normLocal);
          }
        }
      }

      return {
        merged: Array.from(mergedMap.values()),
        toUploadToCloud,
      };
    };

    const unsubShops = onSnapshot(
      collection(db, 'shops'),
      (snap) => {
        if (!snap.empty) {
          let bestDoc = snap.docs[0];
          let bestTs = getDocTimestampMs(bestDoc.data() as Record<string, unknown>);
          for (const d of snap.docs) {
            const ts = getDocTimestampMs(d.data() as Record<string, unknown>);
            if (ts > bestTs || (ts === bestTs && d.id === SHARED_SHOP_DOC_ID)) {
              bestDoc = d;
              bestTs = ts;
            }
          }
          const rawData = bestDoc.data() as Omit<ShopProfile, 'id'>;
          const rawShop: ShopProfile = {
            id: SHARED_SHOP_DOC_ID,
            ...rawData,
            updatedAtMs: bestTs || Date.now(),
          };
          const nextShop =
            !rawShop.shopName || rawShop.shopName === 'সেবা মেডিসিন কর্নার অ্যান্ড ফার্মেসি'
              ? { ...DEFAULT_SHOP_PROFILE, id: SHARED_SHOP_DOC_ID, updatedAtMs: bestTs || Date.now() }
              : rawShop;

          setShopProfile((prev) => {
            if ((prev.updatedAtMs || 0) > (nextShop.updatedAtMs || 0) + 2000) {
              setDoc(doc(db, 'shops', SHARED_SHOP_DOC_ID), buildShopCloudPayload(prev, user.uid)).catch(() => {});
              return prev;
            }
            saveLocal(STORAGE_KEYS.SHOP, nextShop);
            return nextShop;
          });
        } else {
          // Seed shop profile to cloud if empty
          setShopProfile((prev) => {
            setDoc(doc(db, 'shops', SHARED_SHOP_DOC_ID), buildShopCloudPayload(prev, user.uid)).catch(() => {});
            return prev;
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'shops')
    );

    const unsubInventory = onSnapshot(
      collection(db, 'inventory'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: InventoryItem = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<InventoryItem, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems, staleSuffixIds } = deduplicateCloudDocs(rawList);

        setInventory((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev, {
            isInventory: true,
          });
          saveLocal(STORAGE_KEYS.INVENTORY, merged);

          if (toUploadToCloud.length > 0) {
            for (const item of toUploadToCloud) {
              const canonId = getCanonicalDocId(item.id);
              setDoc(
                doc(db, 'inventory', canonId),
                buildInventoryCloudPayload(item, user.uid)
              ).catch(() => {});
            }
          }
          if (staleSuffixIds.length > 0) {
            for (const staleId of staleSuffixIds) {
              const canonId = getCanonicalDocId(staleId);
              const winning = merged.find((m) => m.id === canonId);
              if (winning) {
                setDoc(
                  doc(db, 'inventory', canonId),
                  buildInventoryCloudPayload(winning, user.uid)
                )
                  .then(() => deleteDoc(doc(db, 'inventory', staleId)))
                  .catch(() => {});
              }
            }
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
    );

    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: Customer = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<Customer, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems, staleSuffixIds } = deduplicateCloudDocs(rawList);

        setCustomers((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev);
          saveLocal(STORAGE_KEYS.CUSTOMERS, merged);

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(
              doc(db, 'customers', canonId),
              buildCustomerCloudPayload(item, user.uid)
            ).catch(() => {});
          }
          for (const staleId of staleSuffixIds) {
            const canonId = getCanonicalDocId(staleId);
            const winning = merged.find((m) => m.id === canonId);
            if (winning) {
              setDoc(
                doc(db, 'customers', canonId),
                buildCustomerCloudPayload(winning, user.uid)
              )
                .then(() => deleteDoc(doc(db, 'customers', staleId)))
                .catch(() => {});
            }
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
    );

    const unsubTransactions = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const raw: Transaction = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<Transaction, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          const item =
            raw.txType === 'sale' || raw.txType === 'purchase'
              ? { ...raw, itemsSummary: formatTransactionItemsText(raw.itemsSummary) }
              : raw;
          return { rawId: d.id, item };
        });

        const { items: cloudItems, staleSuffixIds } = deduplicateCloudDocs(rawList);

        setTransactions((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev);
          merged.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0) || b.invoiceNo.localeCompare(a.invoiceNo));
          saveLocal(STORAGE_KEYS.TRANSACTIONS, merged);

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(
              doc(db, 'transactions', canonId),
              buildTransactionCloudPayload(item, user.uid)
            ).catch(() => {});
          }
          for (const staleId of staleSuffixIds) {
            const canonId = getCanonicalDocId(staleId);
            const winning = merged.find((m) => m.id === canonId);
            if (winning) {
              setDoc(
                doc(db, 'transactions', canonId),
                buildTransactionCloudPayload(winning, user.uid)
              )
                .then(() => deleteDoc(doc(db, 'transactions', staleId)))
                .catch(() => {});
            }
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubStaff = onSnapshot(
      collection(db, 'staff'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: StaffMember = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<StaffMember, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems, staleSuffixIds } = deduplicateCloudDocs(rawList);

        setStaffList((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev);
          const finalMerged = merged.length > 0 ? merged : INITIAL_DEMO_STAFF;
          saveLocal(STORAGE_KEYS.STAFF, finalMerged);
          if (finalMerged.length > 0) {
            setActiveStaff(
              (curr) => finalMerged.find((i) => i.id === getCanonicalDocId(curr.id)) || finalMerged[0]
            );
          }

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(doc(db, 'staff', canonId), buildStaffCloudPayload(item, user.uid)).catch(
              () => {}
            );
          }
          for (const staleId of staleSuffixIds) {
            const canonId = getCanonicalDocId(staleId);
            const winning = finalMerged.find((m) => m.id === canonId);
            if (winning) {
              setDoc(doc(db, 'staff', canonId), buildStaffCloudPayload(winning, user.uid))
                .then(() => deleteDoc(doc(db, 'staff', staleId)))
                .catch(() => {});
            }
          }
          return finalMerged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
    );

    const unsubCustomMeds = onSnapshot(
      collection(db, 'custom_medicines'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: CustomMedicine = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<CustomMedicine, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems } = deduplicateCloudDocs(rawList);

        setCustomMedicines((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev, {
            isCustomMeds: true,
          });
          saveLocal(STORAGE_KEYS.CUSTOM_MEDS, merged);

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(
              doc(db, 'custom_medicines', canonId),
              buildCustomMedCloudPayload(item, user.uid)
            ).catch(() => {});
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'custom_medicines')
    );

    const unsubWatches = onSnapshot(
      collection(db, 'price_watches'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: PriceWatch = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<PriceWatch, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems } = deduplicateCloudDocs(rawList);

        setPriceWatches((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev);
          saveLocal(STORAGE_KEYS.PRICE_WATCHES, merged);

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(
              doc(db, 'price_watches', canonId),
              buildPriceWatchCloudPayload(item, user.uid)
            ).catch(() => {});
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'price_watches')
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'price_alerts'),
      (snap) => {
        const rawList = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = getDocTimestampMs(data);
          const item: PriceAlert = {
            id: getCanonicalDocId(d.id),
            ...(data as Omit<PriceAlert, 'id'>),
            updatedAtMs: ts || Date.now(),
          };
          return { rawId: d.id, item };
        });

        const { items: cloudItems } = deduplicateCloudDocs(rawList);

        setPriceAlerts((prev) => {
          const { merged, toUploadToCloud } = mergeCloudAndLocal(cloudItems, prev);
          saveLocal(STORAGE_KEYS.PRICE_ALERTS, merged);

          for (const item of toUploadToCloud) {
            const canonId = getCanonicalDocId(item.id);
            setDoc(
              doc(db, 'price_alerts', canonId),
              buildPriceAlertCloudPayload(item, user.uid)
            ).catch(() => {});
          }
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'price_alerts')
    );

    return () => {
      unsubShops();
      unsubInventory();
      unsubCustomers();
      unsubTransactions();
      unsubStaff();
      unsubCustomMeds();
      unsubWatches();
      unsubAlerts();
    };
  }, [authReady, user]);

  // Combined Medicine Catalog (Built-in 21,250+ DGDA core products can NEVER be deleted, but their purchasePrice & unitPrice can be modified)
  const fullCatalog = useMemo<MedicineCatalogItem[]>(() => {
    const baseList = BD_MEDICINES_CATALOG;

    if (customMedicines.length === 0) return baseList;

    const customById = new Map<string, CustomMedicine>();
    const customByBrandStrengthForm = new Map<string, CustomMedicine>();
    const customByBrandStrength = new Map<string, CustomMedicine>();

    for (const cm of customMedicines) {
      const isCore =
        isCoreDatabaseMedicineId(cm.id) ||
        CATALOG_BY_ID.has(cm.id) ||
        CATALOG_BY_BRAND_STRENGTH.has(
          `${cm.brandName.toLowerCase()}__${cm.strength.toLowerCase()}`
        );
      if (!isCore && deletedIdsSet.has(cm.id)) continue;

      customById.set(cm.id, cm);
      customByBrandStrengthForm.set(
        `${cm.brandName.toLowerCase()}__${cm.strength.toLowerCase()}__${cm.dosageForm.toLowerCase()}`,
        cm
      );
      customByBrandStrength.set(
        `${cm.brandName.toLowerCase()}__${cm.strength.toLowerCase()}`,
        cm
      );
    }

    const appliedCustomIds = new Set<string>();

    const updatedBase = baseList.map((baseMed) => {
      const byExactId = customById.get(baseMed.id);
      const idMatchesBrandStrength =
        byExactId &&
        byExactId.brandName.toLowerCase() === baseMed.brandName.toLowerCase() &&
        byExactId.strength.toLowerCase() === baseMed.strength.toLowerCase();

      const override =
        (idMatchesBrandStrength ? byExactId : undefined) ||
        customByBrandStrengthForm.get(
          `${baseMed.brandName.toLowerCase()}__${baseMed.strength.toLowerCase()}__${baseMed.dosageForm.toLowerCase()}`
        ) ||
        customByBrandStrength.get(
          `${baseMed.brandName.toLowerCase()}__${baseMed.strength.toLowerCase()}`
        ) ||
        byExactId;

      if (!override) return baseMed;
      appliedCustomIds.add(override.id);

      const overridePurchasePrice =
        typeof override.purchasePrice === 'number' && override.purchasePrice > 0
          ? override.purchasePrice
          : Number((override.unitPrice * 0.88).toFixed(2));
      return {
        ...baseMed,
        brandName: override.brandName,
        genericName: override.genericName,
        companyName: override.companyName,
        strength: override.strength,
        dosageForm: (override.dosageForm as MedicineCatalogItem['dosageForm']) || baseMed.dosageForm,
        packSize: override.packSize,
        purchasePrice: overridePurchasePrice,
        unitPrice: override.unitPrice,
        stripPrice: override.stripPrice,
        therapeuticClass: override.therapeuticClass,
        indication: override.indication,
        isCoreProduct: true,
        isCustom: false,
        hasPriceOverride: true,
      };
    });

    const standaloneCustoms: MedicineCatalogItem[] = [];
    for (const cm of customMedicines) {
      if (appliedCustomIds.has(cm.id)) continue;
      if (deletedIdsSet.has(cm.id)) continue;
      const purPrice =
        typeof cm.purchasePrice === 'number' && cm.purchasePrice > 0
          ? cm.purchasePrice
          : Number((cm.unitPrice * 0.88).toFixed(2));
      standaloneCustoms.push({
        id: cm.id,
        brandName: cm.brandName,
        genericName: cm.genericName,
        companyName: cm.companyName,
        strength: cm.strength,
        dosageForm: (cm.dosageForm as MedicineCatalogItem['dosageForm']) || 'Tablet',
        packSize: cm.packSize,
        unitsPerStrip: 10,
        purchasePrice: purPrice,
        unitPrice: cm.unitPrice,
        stripPrice: cm.stripPrice,
        therapeuticClass: cm.therapeuticClass,
        indication: cm.indication,
        darNo: 'CUSTOM-BD',
        isCoreProduct: false,
        isCustom: true,
      });
    }

    return [...standaloneCustoms, ...updatedBase];
  }, [customMedicines, deletedIdsSet]);

  // Helper to get operator display name: Owner shows "Owner", staff shows specific name
  const getOperatorName = (staff: StaffMember) =>
    staff.roleTitle === 'owner' ? 'Owner' : staff.name;

  // Helper to create automatic PriceAlert when a medicine's price changes
  const triggerPriceChangeAlert = async (params: {
    medicineId: string;
    brandName: string;
    genericName: string;
    companyName: string;
    strength: string;
    oldUnitPrice: number;
    newUnitPrice: number;
    oldStripPrice: number;
    newStripPrice: number;
  }) => {
    if (Math.abs(params.oldUnitPrice - params.newUnitPrice) < 0.001) return;

    const nowMs = Date.now();
    const alertId = `alert_${nowMs}`;
    const changedBy = getOperatorName(activeStaff);
    const newAlert: PriceAlert = {
      id: alertId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      medicineId: sanitizeString(params.medicineId, 100),
      brandName: sanitizeString(params.brandName, 120),
      genericName: sanitizeString(params.genericName, 150),
      companyName: sanitizeString(params.companyName, 120),
      strength: sanitizeString(params.strength, 60),
      oldUnitPrice: sanitizeNumber(params.oldUnitPrice),
      newUnitPrice: sanitizeNumber(params.newUnitPrice),
      oldStripPrice: sanitizeNumber(params.oldStripPrice),
      newStripPrice: sanitizeNumber(params.newStripPrice),
      changedBy: sanitizeString(changedBy, 100),
      dateStr: getTodayDateStr(),
      isRead: false,
      updatedAtMs: nowMs,
    };

    setPriceAlerts((prev) => {
      const next = [newAlert, ...prev];
      saveLocal(STORAGE_KEYS.PRICE_ALERTS, next);
      return next;
    });

    if (user) {
      try {
        await setDoc(
          doc(db, 'price_alerts', alertId),
          buildPriceAlertCloudPayload(newAlert, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `price_alerts/${alertId}`);
      }
    }
  };

  // Shop Cloud Login & Logout Handlers
  const handleQuickCloudLogin = async () => {
    setCloudLoginLoading(true);
    try {
      const session = await signInShopCloudAccount({
        email: cloudLoginEmail.trim() || 'mhakbor2001@gmail.com',
        password: cloudLoginPassword.trim() || 'IqbalPharmacy#2026',
        displayName:
          cloudLoginRole === 'owner'
            ? 'ইকবাল মাহমুদ (Owner)'
            : `${getOperatorName(activeStaff)} (Staff)`,
        shopName: shopProfile.shopName || 'ইকবাল ফার্মেসী',
        phone: cloudLoginPhone.trim() || shopProfile.phone || '01712525994',
        operatorRole: cloudLoginRole,
      });
      setCloudSession(session);
      setShowCloudLoginModal(false);
      showToast(
        `দোকান ক্লাউড লগইন সফল হয়েছে! (${session.shopName} — ${session.email})`
      );
    } finally {
      setCloudLoginLoading(false);
    }
  };

  const handleCustomCloudLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleQuickCloudLogin();
  };

  const handleGoogleCloudLogin = async () => {
    setCloudLoginLoading(true);
    try {
      const session = await signInWithGoogle(
        cloudLoginEmail.trim() || 'mhakbor2001@gmail.com'
      );
      setCloudSession(session);
      setShowCloudLoginModal(false);
      showToast(
        `দোকান ক্লাউড লগইন সফল হয়েছে! (${session.shopName} — ${session.email})`
      );
    } finally {
      setCloudLoginLoading(false);
    }
  };

  const handleCloudLogout = async () => {
    await logOutUser();
    setCloudSession(null);
    setUser(null);
    showToast('দোকান ক্লাউড একাউন্ট থেকে লগআউট সম্পন্ন হয়েছে।');
  };

  // Seed & Sync shared pharmacy data to Firestore using canonical IDs
  const handleSeedCloudData = async () => {
    if (!isCloudLoggedIn) {
      await handleQuickCloudLogin();
      return;
    }
    setSeedingCloud(true);
    try {
      const uid = activeCloudUid || SHARED_PHARMACY_OWNER_ID;
      if (user) {
        const batch = writeBatch(db);

        const shopRef = doc(db, 'shops', SHARED_SHOP_DOC_ID);
        batch.set(shopRef, buildShopCloudPayload(shopProfile, uid));

        for (const st of staffList) {
          const canonId = getCanonicalDocId(st.id);
          batch.set(doc(db, 'staff', canonId), buildStaffCloudPayload(st, uid));
        }

        for (const inv of inventory) {
          const canonId = getCanonicalDocId(inv.id);
          batch.set(doc(db, 'inventory', canonId), buildInventoryCloudPayload(inv, uid));
        }

        for (const cust of customers) {
          const canonId = getCanonicalDocId(cust.id);
          batch.set(doc(db, 'customers', canonId), buildCustomerCloudPayload(cust, uid));
        }

        for (const tx of transactions) {
          const canonId = getCanonicalDocId(tx.id);
          batch.set(doc(db, 'transactions', canonId), buildTransactionCloudPayload(tx, uid));
        }

        for (const cm of customMedicines) {
          const canonId = getCanonicalDocId(cm.id);
          batch.set(doc(db, 'custom_medicines', canonId), buildCustomMedCloudPayload(cm, uid));
        }

        for (const w of priceWatches) {
          const canonId = getCanonicalDocId(w.id);
          batch.set(doc(db, 'price_watches', canonId), buildPriceWatchCloudPayload(w, uid));
        }

        for (const a of priceAlerts) {
          const canonId = getCanonicalDocId(a.id);
          batch.set(doc(db, 'price_alerts', canonId), buildPriceAlertCloudPayload(a, uid));
        }

        await batch.commit();
      }
      saveLocal(STORAGE_KEYS.SHOP, shopProfile);
      saveLocal(STORAGE_KEYS.STAFF, staffList);
      saveLocal(STORAGE_KEYS.INVENTORY, inventory);
      saveLocal(STORAGE_KEYS.CUSTOMERS, customers);
      saveLocal(STORAGE_KEYS.TRANSACTIONS, transactions);
      saveLocal(STORAGE_KEYS.CUSTOM_MEDS, customMedicines);
      saveLocal(STORAGE_KEYS.PRICE_WATCHES, priceWatches);
      saveLocal(STORAGE_KEYS.PRICE_ALERTS, priceAlerts);
      showToast('ইকবাল ফার্মেসীর সকল ডেটা ক্লাউডে সফলভাবে সিঙ্ক হয়েছে!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'batch_seed');
      showToast('ইকবাল ফার্মেসীর সকল ডেটা সফলভাবে সিঙ্ক ও সংরক্ষিত হয়েছে!');
    } finally {
      setSeedingCloud(false);
    }
  };

  // POS Sales Invoice Cart Handlers (বিক্রয় ইনভয়েস — স্টক কমবে)
  const handleAddToPosCart = (med: MedicineCatalogItem, qty = 10) => {
    const invMatch = findMatchingInventoryRecord(inventory, {
      medicineId: med.id,
      brandName: med.brandName,
      strength: med.strength,
      dosageForm: med.dosageForm,
    });
    const currentStock = getInventoryStockForMedicine(inventory, med);
    const basePrice = invMatch ? invMatch.unitPrice : med.unitPrice;
    const basePurPrice = invMatch
      ? invMatch.purchasePrice
      : typeof med.purchasePrice === 'number' && med.purchasePrice > 0
      ? med.purchasePrice
      : Number((basePrice * 0.88).toFixed(2));

    setPosCart((prev) => {
      const existing = prev.find((item) => item.medicineId === med.id);
      const next = existing
        ? prev.map((item) =>
            item.medicineId === med.id
              ? { ...item, qty: item.qty + qty, availableStock: currentStock || item.availableStock }
              : item
          )
        : [
            ...prev,
            {
              medicineId: med.id,
              inventoryId: invMatch?.id,
              brandName: med.brandName,
              genericName: med.genericName,
              companyName: med.companyName,
              strength: med.strength,
              dosageForm: med.dosageForm,
              unitPrice: basePrice,
              originalUnitPrice: basePrice,
              purchasePrice: basePurPrice,
              originalPurchasePrice: basePurPrice,
              qty,
              availableStock: currentStock > 0 ? currentStock : 100,
            },
          ];
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
    showToast(`${med.brandName} (${qty} পিস) বিক্রয় ইনভয়েসে যুক্ত হয়েছে`);
  };

  const handleUpdateCartQty = (medId: string, newQty: number) => {
    setPosCart((prev) => {
      const next = prev.map((item) => (item.medicineId === medId ? { ...item, qty: newQty } : item));
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
  };

  const handleUpdateCartUnitPrice = (medId: string, newUnitPrice: number) => {
    setPosCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, unitPrice: newUnitPrice } : item
      );
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
  };

  const handleUpdateCartPurchasePrice = (medId: string, newPurchasePrice: number) => {
    setPosCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, purchasePrice: newPurchasePrice } : item
      );
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
  };

  const handleRemoveFromCart = (medId: string) => {
    setPosCart((prev) => {
      const next = prev.filter((item) => item.medicineId !== medId);
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
  };

  const handleUpdateCartItemDetails = (medId: string, updates: Partial<CartItem>) => {
    setPosCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, ...updates } : item
      );
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });
  };

  const handleAddCustomToPosCart = async (params: {
    brandName: string;
    genericName?: string;
    companyName?: string;
    strength?: string;
    dosageForm?: string;
    unitPrice: number;
    purchasePrice?: number;
    qty: number;
    saveToCatalog?: boolean;
  }) => {
    const cleanBrand = params.brandName.trim() || 'কাস্টম প্রডাক্ট';
    const cleanStrength = (params.strength || '').trim();
    const cleanForm = (params.dosageForm || 'Tablet').trim();
    const cleanGeneric = (params.genericName || cleanBrand).trim();
    const cleanCompany = (params.companyName || 'Custom / General').trim();
    const unitPrice = Math.max(0.01, Number(params.unitPrice) || 10);
    const purchasePrice =
      typeof params.purchasePrice === 'number' && params.purchasePrice > 0
        ? params.purchasePrice
        : Number((unitPrice * 0.88).toFixed(2));
    const qty = Math.max(1, Math.round(Number(params.qty) || 1));

    const slug = `${cleanBrand}-${cleanStrength}-${cleanForm}`
      .toLowerCase()
      .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const customMedId = `custom_sale_${slug || Date.now()}`;

    const invMatch = findMatchingInventoryRecord(inventory, {
      medicineId: customMedId,
      brandName: cleanBrand,
      strength: cleanStrength,
      dosageForm: cleanForm,
    });
    const currentStock = invMatch ? invMatch.stockQty : 100;

    setPosCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.medicineId === customMedId ||
          (item.brandName.trim().toLowerCase() === cleanBrand.toLowerCase() &&
            item.strength.trim().toLowerCase() === cleanStrength.toLowerCase() &&
            item.dosageForm.trim().toLowerCase() === cleanForm.toLowerCase())
      );
      const next = existing
        ? prev.map((item) =>
            item.medicineId === existing.medicineId
              ? {
                  ...item,
                  unitPrice,
                  purchasePrice,
                  qty: item.qty + qty,
                }
              : item
          )
        : [
            ...prev,
            {
              medicineId: invMatch?.medicineId || customMedId,
              inventoryId: invMatch?.id,
              brandName: cleanBrand,
              genericName: cleanGeneric,
              companyName: cleanCompany,
              strength: cleanStrength,
              dosageForm: cleanForm,
              unitPrice,
              originalUnitPrice: unitPrice,
              purchasePrice,
              originalPurchasePrice: purchasePrice,
              qty,
              availableStock: currentStock > 0 ? currentStock : 100,
            },
          ];
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });

    if (params.saveToCatalog) {
      const existingCatalogMed = fullCatalog.find(
        (m) =>
          m.brandName.trim().toLowerCase() === cleanBrand.toLowerCase() &&
          m.strength.trim().toLowerCase() === cleanStrength.toLowerCase() &&
          m.dosageForm.trim().toLowerCase() === cleanForm.toLowerCase()
      );
      await handleSaveMedicineCatalog(
        {
          brandName: cleanBrand,
          genericName: cleanGeneric,
          companyName: cleanCompany,
          strength: cleanStrength || 'Standard',
          dosageForm: cleanForm,
          packSize: '10 × 10 (100 pcs)',
          purchasePrice,
          unitPrice,
          stripPrice: Number((unitPrice * 10).toFixed(2)),
          therapeuticClass: 'Custom Product',
          indication: 'কাস্টম প্রডাক্ট / সাধারণ ব্যবহার্য',
        },
        existingCatalogMed
      );
    }

    showToast(
      `কাস্টম প্রডাক্ট "${cleanBrand}${cleanStrength ? ` ${cleanStrength}` : ''}" (${qty} পিস · দর ৳${formatCleanMoney(unitPrice)}) বিক্রয় বিলে যুক্ত হয়েছে!`
    );
  };

  // Purchase Invoice Cart Handlers (ক্রয় ইনভয়েস — স্টক বাড়বে)
  const handleAddToPurchaseCart = (med: MedicineCatalogItem, qty = 50) => {
    const invMatch = findMatchingInventoryRecord(inventory, {
      medicineId: med.id,
      brandName: med.brandName,
      strength: med.strength,
      dosageForm: med.dosageForm,
    });
    const currentStock = getInventoryStockForMedicine(inventory, med);
    const retailMrp = invMatch ? invMatch.unitPrice : med.unitPrice;
    const costPrice = invMatch
      ? invMatch.purchasePrice
      : typeof med.purchasePrice === 'number' && med.purchasePrice > 0
      ? med.purchasePrice
      : Number((retailMrp * 0.88).toFixed(2));

    setPurchaseCart((prev) => {
      const existing = prev.find((item) => item.medicineId === med.id);
      const next = existing
        ? prev.map((item) =>
            item.medicineId === med.id
              ? { ...item, qty: item.qty + qty, availableStock: currentStock }
              : item
          )
        : [
            ...prev,
            {
              medicineId: med.id,
              inventoryId: invMatch?.id,
              brandName: med.brandName,
              genericName: med.genericName,
              companyName: med.companyName,
              strength: med.strength,
              dosageForm: med.dosageForm,
              packSize: med.packSize || '10 × 10',
              purchasePrice: costPrice,
              unitPrice: retailMrp,
              qty,
              batchNo: invMatch?.batchNo || `B-${Math.floor(1000 + Math.random() * 9000)}`,
              expiryDate: invMatch?.expiryDate || '2028-06-30',
              availableStock: currentStock,
            },
          ];
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
    showToast(`${med.brandName} (+${qty} পিস) ক্রয় ইনভয়েসে যুক্ত হয়েছে`);
  };

  const handleAddCustomToPurchaseCart = async (params: {
    brandName: string;
    genericName?: string;
    companyName?: string;
    strength?: string;
    dosageForm?: string;
    purchasePrice: number;
    unitPrice?: number;
    qty: number;
    batchNo?: string;
    expiryDate?: string;
    saveToCatalog?: boolean;
  }) => {
    const cleanBrand = params.brandName.trim() || 'কাস্টম প্রডাক্ট';
    const cleanStrength = (params.strength || '').trim();
    const cleanForm = (params.dosageForm || 'Tablet').trim();
    const cleanGeneric = (params.genericName || cleanBrand).trim();
    const cleanCompany = (params.companyName || 'Custom / General').trim();
    const purchasePrice = Math.max(0.01, Number(params.purchasePrice) || 8.8);
    const unitPrice =
      typeof params.unitPrice === 'number' && params.unitPrice > 0
        ? params.unitPrice
        : Number((purchasePrice / 0.88).toFixed(2));
    const qty = Math.max(1, Math.round(Number(params.qty) || 10));
    const batchNo =
      (params.batchNo || '').trim() || `B-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiryDate = (params.expiryDate || '').trim() || '2028-06-30';

    const slug = `${cleanBrand}-${cleanStrength}-${cleanForm}`
      .toLowerCase()
      .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const customMedId = `custom_pur_${slug || Date.now()}`;

    const invMatch = findMatchingInventoryRecord(inventory, {
      medicineId: customMedId,
      brandName: cleanBrand,
      strength: cleanStrength,
      dosageForm: cleanForm,
    });
    const currentStock = invMatch ? invMatch.stockQty : 0;

    setPurchaseCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.medicineId === customMedId ||
          (item.brandName.trim().toLowerCase() === cleanBrand.toLowerCase() &&
            item.strength.trim().toLowerCase() === cleanStrength.toLowerCase() &&
            item.dosageForm.trim().toLowerCase() === cleanForm.toLowerCase())
      );
      const next = existing
        ? prev.map((item) =>
            item.medicineId === existing.medicineId
              ? {
                  ...item,
                  purchasePrice,
                  unitPrice,
                  qty: item.qty + qty,
                  batchNo: batchNo || item.batchNo,
                }
              : item
          )
        : [
            ...prev,
            {
              medicineId: invMatch?.medicineId || customMedId,
              inventoryId: invMatch?.id,
              brandName: cleanBrand,
              genericName: cleanGeneric,
              companyName: cleanCompany,
              strength: cleanStrength,
              dosageForm: cleanForm,
              packSize: '10 × 10 (100 pcs)',
              purchasePrice,
              unitPrice,
              qty,
              batchNo,
              expiryDate,
              availableStock: currentStock,
            },
          ];
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });

    if (params.saveToCatalog) {
      const existingCatalogMed = fullCatalog.find(
        (m) =>
          m.brandName.trim().toLowerCase() === cleanBrand.toLowerCase() &&
          m.strength.trim().toLowerCase() === cleanStrength.toLowerCase() &&
          m.dosageForm.trim().toLowerCase() === cleanForm.toLowerCase()
      );
      await handleSaveMedicineCatalog(
        {
          brandName: cleanBrand,
          genericName: cleanGeneric,
          companyName: cleanCompany,
          strength: cleanStrength || 'Standard',
          dosageForm: cleanForm,
          packSize: '10 × 10 (100 pcs)',
          purchasePrice,
          unitPrice,
          stripPrice: Number((unitPrice * 10).toFixed(2)),
          therapeuticClass: 'Custom Product',
          indication: 'কাস্টম প্রডাক্ট / সাধারণ ব্যবহার্য',
        },
        existingCatalogMed
      );
    }

    showToast(
      `কাস্টম প্রডাক্ট "${cleanBrand}${cleanStrength ? ` ${cleanStrength}` : ''}" (+${qty} পিস · ক্রয় দর ৳${formatCleanMoney(purchasePrice)}) ক্রয় বিলে যুক্ত হয়েছে!`
    );
  };

  const handleUpdatePurchaseCartItemDetails = (
    medId: string,
    updates: Partial<PurchaseCartItem>
  ) => {
    setPurchaseCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, ...updates } : item
      );
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  const handleUpdatePurchaseCartQty = (medId: string, newQty: number) => {
    setPurchaseCart((prev) => {
      const next = prev.map((item) => (item.medicineId === medId ? { ...item, qty: newQty } : item));
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  const handleUpdatePurchaseCartCost = (medId: string, newPurchasePrice: number) => {
    setPurchaseCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, purchasePrice: newPurchasePrice } : item
      );
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  const handleUpdatePurchaseCartMrp = (medId: string, newUnitPrice: number) => {
    setPurchaseCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, unitPrice: newUnitPrice } : item
      );
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  const handleUpdatePurchaseCartBatch = (medId: string, newBatchNo: string) => {
    setPurchaseCart((prev) => {
      const next = prev.map((item) =>
        item.medicineId === medId ? { ...item, batchNo: newBatchNo } : item
      );
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  const handleRemoveFromPurchaseCart = (medId: string) => {
    setPurchaseCart((prev) => {
      const next = prev.filter((item) => item.medicineId !== medId);
      saveLocal(STORAGE_KEYS.PURCHASE_CART, next);
      return next;
    });
  };

  // Start editing an existing Sale or Purchase invoice using the full New-Invoice Creation Builder
  const handleStartEditInvoice = (tx: Transaction) => {
    if (tx.txType === 'sale') {
      const saleItems = buildSaleCartFromTransaction(tx, fullCatalog, inventory);
      setPosCart(saleItems);
      saveLocal(STORAGE_KEYS.POS_CART, saleItems);
      setEditingInvoiceTx(tx);
      setActiveSection('pos_accounts');
      showToast(
        `বিক্রয় ইনভয়েস (${tx.invoiceNo}) নতুন ইনভয়েস তৈরির প্যানেলে এডিটের জন্য লোড হয়েছে!`
      );
    } else if (tx.txType === 'purchase') {
      const purItems = buildPurchaseCartFromTransaction(tx, fullCatalog, inventory);
      setPurchaseCart(purItems);
      saveLocal(STORAGE_KEYS.PURCHASE_CART, purItems);
      setEditingInvoiceTx(tx);
      setActiveSection('pos_accounts');
      showToast(
        `ক্রয় ইনভয়েস (${tx.invoiceNo}) নতুন ক্রয় ইনভয়েস তৈরির প্যানেলে এডিটের জন্য লোড হয়েছে!`
      );
    }
  };

  const handleCancelEditInvoice = () => {
    if (editingInvoiceTx?.txType === 'sale') {
      setPosCart([]);
      saveLocal(STORAGE_KEYS.POS_CART, []);
    } else if (editingInvoiceTx?.txType === 'purchase') {
      setPurchaseCart([]);
      saveLocal(STORAGE_KEYS.PURCHASE_CART, []);
    }
    setEditingInvoiceTx(null);
    showToast('ইনভয়েস এডিট মোড বাতিল করা হয়েছে। এখন নতুন ইনভয়েস তৈরি করতে পারেন।');
  };

  // Complete POS Sale Invoice (বিক্রয় করলে স্টক কমবে — নতুন তৈরি ও এডিট উভয় ক্ষেত্রেই)
  const handleCompleteSale = async (params: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    discount: number;
    paidAmount: number;
    paymentMethod: Transaction['paymentMethod'];
    syncModifiedPricesToCatalog: boolean;
    invoiceNo?: string;
    dateStr?: string;
    editingTxId?: string;
  }): Promise<Transaction | null> => {
    if (posCart.length === 0) return null;

    const nowMs = Date.now();
    const existingEditedTx = params.editingTxId
      ? transactions.find((t) => getCanonicalDocId(t.id) === getCanonicalDocId(params.editingTxId!))
      : undefined;

    // Check if any item's purchase price or selling price was changed in the POS cart, or if it's a custom product
    if (params.syncModifiedPricesToCatalog) {
      for (const item of posCart) {
        const catMed = fullCatalog.find((m) => m.id === item.medicineId);
        const unitChanged =
          item.originalUnitPrice !== undefined &&
          Math.abs(item.unitPrice - item.originalUnitPrice) > 0.001;
        const purChanged =
          item.originalPurchasePrice !== undefined &&
          item.purchasePrice !== undefined &&
          Math.abs(item.purchasePrice - item.originalPurchasePrice) > 0.001;
        if (catMed && (unitChanged || purChanged)) {
          await handleSaveMedicineCatalog(
            {
              brandName: item.brandName || catMed.brandName,
              genericName: item.genericName || catMed.genericName,
              companyName: item.companyName || catMed.companyName,
              strength: item.strength || catMed.strength,
              dosageForm: item.dosageForm || catMed.dosageForm,
              packSize: catMed.packSize,
              purchasePrice: item.purchasePrice,
              unitPrice: item.unitPrice,
              stripPrice: Number((item.unitPrice * (catMed.unitsPerStrip || 10)).toFixed(2)),
              therapeuticClass: catMed.therapeuticClass,
              indication: catMed.indication,
            },
            catMed
          );
        } else if (!catMed && item.brandName.trim()) {
          await handleSaveMedicineCatalog({
            brandName: item.brandName.trim(),
            genericName: (item.genericName || item.brandName).trim(),
            companyName: (item.companyName || 'Custom / General').trim(),
            strength: (item.strength || 'Standard').trim(),
            dosageForm: (item.dosageForm || 'Tablet').trim(),
            packSize: '10 × 10 (100 pcs)',
            purchasePrice: item.purchasePrice,
            unitPrice: item.unitPrice,
            stripPrice: Number((item.unitPrice * 10).toFixed(2)),
            therapeuticClass: 'Custom Product',
            indication: 'কাস্টম প্রডাক্ট / সাধারণ ব্যবহার্য',
          });
        }
      }
    }

    const subTotal = sanitizeNumber(
      posCart.reduce((acc, i) => acc + i.unitPrice * i.qty, 0)
    );
    const discount = sanitizeNumber(params.discount, 0, subTotal);
    const grandTotal = sanitizeNumber(subTotal - discount);
    const paidAmount = sanitizeNumber(params.paidAmount, 0, grandTotal);
    const dueAmount = sanitizeNumber(grandTotal - paidAmount);
    const totalCount = posCart.reduce((acc, i) => acc + i.qty, 0);

    const summaryText = sanitizeString(
      posCart
        .map((i, idx) => formatCartItemInvoiceLine(i, idx))
        .join('\n'),
      600
    );

    const defaultInvNo = `INV-${getTodayDateStr().replace(/-/g, '').slice(2)}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    const invoiceNo = sanitizeString(
      params.invoiceNo?.trim() || existingEditedTx?.invoiceNo || defaultInvNo,
      60,
      defaultInvNo
    );
    const dateStr = sanitizeString(
      params.dateStr?.trim() || existingEditedTx?.dateStr || getTodayDateStr(),
      20,
      getTodayDateStr()
    );

    const staffRoleVal: 'owner' | 'staff' =
      activeStaff.roleTitle === 'owner' ? 'owner' : 'staff';
    const operatorDisplayName = getOperatorName(activeStaff);

    const txId = existingEditedTx ? getCanonicalDocId(existingEditedTx.id) : `tx_sale_${nowMs}`;
    const newTx: Transaction = {
      id: txId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      txType: 'sale',
      invoiceNo,
      dateStr,
      partyId: sanitizeString(params.customerId, 128, 'walk-in'),
      partyName: sanitizeString(params.customerName, 120, 'সাধারণ ক্রেতা'),
      partyPhone: sanitizeString(params.customerPhone, 30, 'N/A'),
      itemsSummary: summaryText,
      totalCount,
      subTotal,
      discount,
      grandTotal,
      paidAmount,
      dueAmount,
      paymentMethod: params.paymentMethod,
      staffName: sanitizeString(operatorDisplayName, 100, 'Owner'),
      staffRole: staffRoleVal,
      counterName: sanitizeString(activeStaff.counterName, 60, 'কাউন্টার ১'),
      updatedAtMs: nowMs,
    };

    // Build updated inventory list:
    // 1. If editing an existing invoice, first reverse its previous stock impact
    // 2. Then decrease stockQty for the new sold items in posCart
    const modifiedInvMap = new Map<string, InventoryItem>();
    const nextInventoryList = inventory.map((inv) => ({ ...inv }));

    if (
      existingEditedTx &&
      (existingEditedTx.txType === 'sale' || existingEditedTx.txType === 'purchase')
    ) {
      const oldParsedItems = parseTransactionItemsDetailed(
        existingEditedTx.itemsSummary,
        fullCatalog
      );
      for (const pItem of oldParsedItems) {
        const matchedOld = findMatchingInventoryRecord(nextInventoryList, {
          medicineId: pItem.matchedMedicine?.id,
          brandName: pItem.matchedMedicine?.brandName || pItem.brandAndStrength,
          strength: pItem.matchedMedicine?.strength || '',
          dosageForm: pItem.matchedMedicine?.dosageForm || pItem.formPrefix,
        });
        if (matchedOld && pItem.qty > 0) {
          matchedOld.id = getCanonicalDocId(matchedOld.id);
          if (existingEditedTx.txType === 'sale') {
            matchedOld.stockQty = matchedOld.stockQty + pItem.qty;
          } else {
            matchedOld.stockQty = Math.max(0, matchedOld.stockQty - pItem.qty);
          }
          matchedOld.updatedAtMs = nowMs;
          modifiedInvMap.set(matchedOld.id, matchedOld);
        }
      }
    }

    for (const cartItem of posCart) {
      const matchedInv = findMatchingInventoryRecord(nextInventoryList, {
        inventoryId: cartItem.inventoryId,
        medicineId: cartItem.medicineId,
        brandName: cartItem.brandName,
        strength: cartItem.strength,
        dosageForm: cartItem.dosageForm,
      });

      if (matchedInv) {
        matchedInv.id = getCanonicalDocId(matchedInv.id);
        matchedInv.stockQty = Math.max(0, matchedInv.stockQty - cartItem.qty);
        matchedInv.updatedAtMs = nowMs;
        if (params.syncModifiedPricesToCatalog) {
          matchedInv.purchasePrice = cartItem.purchasePrice;
          matchedInv.unitPrice = cartItem.unitPrice;
          matchedInv.stripPrice = Number((cartItem.unitPrice * 10).toFixed(2));
        }
        modifiedInvMap.set(matchedInv.id, matchedInv);
      } else {
        const newInvId = `inv_${cartItem.medicineId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${nowMs.toString().slice(-4)}`;
        const baselineStock = cartItem.availableStock > 0 ? cartItem.availableStock : 100;
        const createdInv: InventoryItem = {
          id: newInvId,
          ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
          medicineId: cartItem.medicineId,
          brandName: cartItem.brandName,
          genericName: cartItem.genericName,
          companyName: cartItem.companyName,
          strength: cartItem.strength,
          dosageForm: cartItem.dosageForm,
          packSize: '10 × 10 (100 pcs)',
          purchasePrice: cartItem.purchasePrice,
          unitPrice: cartItem.unitPrice,
          stripPrice: Number((cartItem.unitPrice * 10).toFixed(2)),
          stockQty: Math.max(0, baselineStock - cartItem.qty),
          minStockLevel: 20,
          batchNo: `B-${nowMs.toString().slice(-4)}`,
          expiryDate: '2028-06-30',
          shelfLocation: 'Rack A-1',
          updatedAtMs: nowMs,
        };
        unmarkDeletedId(newInvId);
        nextInventoryList.unshift(createdInv);
        modifiedInvMap.set(newInvId, createdInv);
      }
    }

    unmarkDeletedId(txId);
    setTransactions((prev) => {
      const next = existingEditedTx
        ? prev.map((t) => (getCanonicalDocId(t.id) === txId ? newTx : t))
        : [newTx, ...prev];
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });

    setInventory(nextInventoryList);
    saveLocal(STORAGE_KEYS.INVENTORY, nextInventoryList);

    // Update Customer Ledger (reversing old invoice customer amounts if editing, then applying new)
    const updatedCustomersForCloud: Customer[] = [];
    const oldCustId =
      existingEditedTx && existingEditedTx.partyId && existingEditedTx.partyId !== 'walk-in'
        ? getCanonicalDocId(existingEditedTx.partyId)
        : null;
    const newCustId =
      params.customerId && params.customerId !== 'walk-in'
        ? getCanonicalDocId(params.customerId)
        : null;

    if (oldCustId || newCustId) {
      setCustomers((prev) => {
        const next = prev.map((c) => {
          const canonCId = getCanonicalDocId(c.id);
          if (canonCId !== oldCustId && canonCId !== newCustId) return c;

          let purchased = c.totalPurchased;
          let paid = c.totalPaid;
          let due = c.totalDue;

          if (existingEditedTx && canonCId === oldCustId) {
            purchased = Math.max(0, purchased - existingEditedTx.grandTotal);
            paid = Math.max(0, paid - existingEditedTx.paidAmount);
            due = Math.max(0, due - existingEditedTx.dueAmount);
          }

          if (canonCId === newCustId) {
            purchased += grandTotal;
            paid += paidAmount;
            due += dueAmount;
          }

          const updatedC: Customer = {
            ...c,
            id: canonCId,
            totalPurchased: sanitizeNumber(purchased),
            totalPaid: sanitizeNumber(paid),
            totalDue: sanitizeNumber(due),
            updatedAtMs: nowMs,
          };
          updatedCustomersForCloud.push(updatedC);
          return updatedC;
        });
        saveLocal(STORAGE_KEYS.CUSTOMERS, next);
        return next;
      });
    }

    if (user) {
      try {
        await setDoc(
          doc(db, 'transactions', txId),
          buildTransactionCloudPayload(newTx, user.uid)
        );

        for (const invItem of modifiedInvMap.values()) {
          const canonInvId = getCanonicalDocId(invItem.id);
          await setDoc(
            doc(db, 'inventory', canonInvId),
            buildInventoryCloudPayload(invItem, user.uid)
          );
        }

        for (const cObj of updatedCustomersForCloud) {
          await setDoc(
            doc(db, 'customers', getCanonicalDocId(cObj.id)),
            buildCustomerCloudPayload(cObj, user.uid)
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'transactions');
      }
    }

    setPosCart([]);
    saveLocal(STORAGE_KEYS.POS_CART, []);
    setEditingInvoiceTx(null);
    showToast(
      existingEditedTx
        ? `বিক্রয় ইনভয়েস (${invoiceNo}) সফলভাবে এডিট হয়েছে ও স্টক সমন্বয় হয়েছে!`
        : `বিক্রয় ইনভয়েস (${invoiceNo}) তৈরি হয়েছে ও স্টক থেকে -${totalCount} পিস কমানো হয়েছে!`
    );
    return newTx;
  };

  // Complete Multi-Item Purchase Invoice (ক্রয় করলে স্টক বাড়বে — নতুন তৈরি ও এডিট উভয় ক্ষেত্রেই)
  const handleCompletePurchaseInvoice = async (params: {
    supplierCompany: string;
    supplierPhone: string;
    invoiceNo: string;
    discount: number;
    paidAmount: number;
    paymentMethod: Transaction['paymentMethod'];
    defaultExpiryDate?: string;
    dateStr?: string;
    editingTxId?: string;
  }): Promise<Transaction | null> => {
    if (purchaseCart.length === 0) return null;

    const nowMs = Date.now();
    const existingEditedTx = params.editingTxId
      ? transactions.find((t) => getCanonicalDocId(t.id) === getCanonicalDocId(params.editingTxId!))
      : undefined;

    const subTotal = sanitizeNumber(
      purchaseCart.reduce((acc, i) => acc + i.purchasePrice * i.qty, 0)
    );
    const discount = sanitizeNumber(params.discount, 0, subTotal);
    const grandTotal = sanitizeNumber(subTotal - discount);
    const paidAmount = sanitizeNumber(params.paidAmount, 0, grandTotal);
    const dueAmount = sanitizeNumber(grandTotal - paidAmount);
    const totalCount = purchaseCart.reduce((acc, i) => acc + i.qty, 0);

    const summaryText = sanitizeString(
      purchaseCart
        .map((i, idx) => formatPurchaseItemInvoiceLine(i, idx))
        .join('\n'),
      600
    );

    const invoiceNo = sanitizeString(
      params.invoiceNo.trim() ||
        existingEditedTx?.invoiceNo ||
        `PUR-${getTodayDateStr().replace(/-/g, '').slice(2)}-${Math.floor(100 + Math.random() * 900)}`,
      60,
      'PUR-01'
    );
    const dateStr = sanitizeString(
      params.dateStr?.trim() || existingEditedTx?.dateStr || getTodayDateStr(),
      20,
      getTodayDateStr()
    );

    const staffRoleVal: 'owner' | 'staff' =
      activeStaff.roleTitle === 'owner' ? 'owner' : 'staff';
    const operatorDisplayName = getOperatorName(activeStaff);

    const txId = existingEditedTx ? getCanonicalDocId(existingEditedTx.id) : `tx_pur_${nowMs}`;
    const newTx: Transaction = {
      id: txId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      txType: 'purchase',
      invoiceNo,
      dateStr,
      partyId: 'supplier-company',
      partyName: sanitizeString(
        params.supplierCompany.includes('(ডিপো চালান)')
          ? params.supplierCompany
          : `${params.supplierCompany} (ডিপো চালান)`,
        120
      ),
      partyPhone: sanitizeString(params.supplierPhone || 'কোম্পানি ডিপো', 30),
      itemsSummary: summaryText,
      totalCount,
      subTotal,
      discount,
      grandTotal,
      paidAmount,
      dueAmount,
      paymentMethod: params.paymentMethod,
      staffName: sanitizeString(operatorDisplayName, 100, 'Owner'),
      staffRole: staffRoleVal,
      counterName: sanitizeString(activeStaff.counterName, 60, 'কাউন্টার ১'),
      updatedAtMs: nowMs,
    };

    // 1. If editing an existing purchase invoice, first reverse its old stock addition
    // 2. Then increase stockQty in inventory for every item in purchaseCart (ক্রয় করলে স্টক বাড়বে)
    const nextInventoryList = inventory.map((inv) => ({ ...inv }));
    const changedInvMap = new Map<string, InventoryItem>();

    if (
      existingEditedTx &&
      (existingEditedTx.txType === 'purchase' || existingEditedTx.txType === 'sale')
    ) {
      const oldParsedItems = parseTransactionItemsDetailed(
        existingEditedTx.itemsSummary,
        fullCatalog
      );
      for (const pItem of oldParsedItems) {
        const matchedOld = findMatchingInventoryRecord(nextInventoryList, {
          medicineId: pItem.matchedMedicine?.id,
          brandName: pItem.matchedMedicine?.brandName || pItem.brandAndStrength,
          strength: pItem.matchedMedicine?.strength || '',
          dosageForm: pItem.matchedMedicine?.dosageForm || pItem.formPrefix,
        });
        if (matchedOld && pItem.qty > 0) {
          matchedOld.id = getCanonicalDocId(matchedOld.id);
          if (existingEditedTx.txType === 'purchase') {
            matchedOld.stockQty = Math.max(0, matchedOld.stockQty - pItem.qty);
          } else {
            matchedOld.stockQty = matchedOld.stockQty + pItem.qty;
          }
          matchedOld.updatedAtMs = nowMs;
          changedInvMap.set(matchedOld.id, matchedOld);
        }
      }
    }

    for (const purItem of purchaseCart) {
      const baseMed = fullCatalog.find((m) => m.id === purItem.medicineId);
      if (baseMed) {
        const oldPur =
          typeof baseMed.purchasePrice === 'number' && baseMed.purchasePrice > 0
            ? baseMed.purchasePrice
            : Number((baseMed.unitPrice * 0.88).toFixed(2));
        if (
          Math.abs(baseMed.unitPrice - purItem.unitPrice) > 0.001 ||
          Math.abs(oldPur - purItem.purchasePrice) > 0.001
        ) {
          await handleSaveMedicineCatalog(
            {
              brandName: purItem.brandName || baseMed.brandName,
              genericName: purItem.genericName || baseMed.genericName,
              companyName: params.supplierCompany || baseMed.companyName,
              strength: purItem.strength || baseMed.strength,
              dosageForm: purItem.dosageForm || baseMed.dosageForm,
              packSize: baseMed.packSize,
              purchasePrice: purItem.purchasePrice,
              unitPrice: purItem.unitPrice,
              stripPrice: Number((purItem.unitPrice * (baseMed.unitsPerStrip || 10)).toFixed(2)),
              therapeuticClass: baseMed.therapeuticClass,
              indication: baseMed.indication,
            },
            baseMed
          );
        }
      } else if (purItem.brandName.trim()) {
        await handleSaveMedicineCatalog({
          brandName: purItem.brandName.trim(),
          genericName: (purItem.genericName || purItem.brandName).trim(),
          companyName: (params.supplierCompany || purItem.companyName || 'Custom / General').trim(),
          strength: (purItem.strength || 'Standard').trim(),
          dosageForm: (purItem.dosageForm || 'Tablet').trim(),
          packSize: purItem.packSize || '10 × 10 (100 pcs)',
          purchasePrice: purItem.purchasePrice,
          unitPrice: purItem.unitPrice,
          stripPrice: Number((purItem.unitPrice * 10).toFixed(2)),
          therapeuticClass: 'Custom Product',
          indication: 'কাস্টম প্রডাক্ট / সাধারণ ব্যবহার্য',
        });
      }

      const existingInv = findMatchingInventoryRecord(nextInventoryList, {
        inventoryId: purItem.inventoryId,
        medicineId: purItem.medicineId,
        brandName: purItem.brandName,
        strength: purItem.strength,
        dosageForm: purItem.dosageForm,
      });

      if (existingInv) {
        existingInv.id = getCanonicalDocId(existingInv.id);
        existingInv.stockQty = existingInv.stockQty + purItem.qty;
        existingInv.purchasePrice = purItem.purchasePrice;
        existingInv.unitPrice = purItem.unitPrice;
        existingInv.stripPrice = Number((purItem.unitPrice * 10).toFixed(2));
        existingInv.batchNo = purItem.batchNo || existingInv.batchNo;
        existingInv.expiryDate =
          purItem.expiryDate || params.defaultExpiryDate || existingInv.expiryDate;
        existingInv.updatedAtMs = nowMs;
        unmarkDeletedId(existingInv.id);
        changedInvMap.set(existingInv.id, existingInv);
      } else {
        const newInvId = `inv_${purItem.medicineId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${nowMs.toString().slice(-4)}`;
        const createdInv: InventoryItem = {
          id: newInvId,
          ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
          medicineId: purItem.medicineId,
          brandName: purItem.brandName,
          genericName: purItem.genericName,
          companyName: params.supplierCompany || purItem.companyName,
          strength: purItem.strength,
          dosageForm: purItem.dosageForm,
          packSize: purItem.packSize || '10 × 10 (100 pcs)',
          purchasePrice: purItem.purchasePrice,
          unitPrice: purItem.unitPrice,
          stripPrice: Number((purItem.unitPrice * 10).toFixed(2)),
          stockQty: purItem.qty,
          minStockLevel: 30,
          batchNo: purItem.batchNo || `B-${nowMs.toString().slice(-4)}`,
          expiryDate: purItem.expiryDate || params.defaultExpiryDate || '2028-06-30',
          shelfLocation: 'Rack A-1',
          updatedAtMs: nowMs,
        };
        unmarkDeletedId(newInvId);
        nextInventoryList.unshift(createdInv);
        changedInvMap.set(newInvId, createdInv);
      }
    }

    unmarkDeletedId(txId);
    setTransactions((prev) => {
      const next = existingEditedTx
        ? prev.map((t) => (getCanonicalDocId(t.id) === txId ? newTx : t))
        : [newTx, ...prev];
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });

    setInventory(nextInventoryList);
    saveLocal(STORAGE_KEYS.INVENTORY, nextInventoryList);

    if (user) {
      try {
        await setDoc(
          doc(db, 'transactions', txId),
          buildTransactionCloudPayload(newTx, user.uid)
        );

        for (const invItem of changedInvMap.values()) {
          const canonInvId = getCanonicalDocId(invItem.id);
          await setDoc(
            doc(db, 'inventory', canonInvId),
            buildInventoryCloudPayload(invItem, user.uid)
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'transactions');
      }
    }

    setPurchaseCart([]);
    saveLocal(STORAGE_KEYS.PURCHASE_CART, []);
    setEditingInvoiceTx(null);
    showToast(
      existingEditedTx
        ? `ক্রয় ইনভয়েস (${invoiceNo}) সফলভাবে এডিট হয়েছে ও স্টক সমন্বয় হয়েছে!`
        : `ক্রয় ইনভয়েস (${invoiceNo}) তৈরি হয়েছে ও স্টকে +${totalCount} পিস যুক্ত হয়েছে!`
    );
    return newTx;
  };

  // Edit & Delete Transaction Handlers
  const handleEditTransaction = async (
    txId: string,
    updated: {
      dateStr: string;
      partyName: string;
      partyPhone: string;
      itemsSummary: string;
      subTotal: number;
      discount: number;
      grandTotal: number;
      paidAmount: number;
      dueAmount: number;
      paymentMethod: Transaction['paymentMethod'];
    }
  ) => {
    const canonTxId = getCanonicalDocId(txId);
    const existingTx = transactions.find((t) => getCanonicalDocId(t.id) === canonTxId);
    if (!existingTx) return;

    const nowMs = Date.now();
    const updatedTxObj: Transaction = {
      ...existingTx,
      id: canonTxId,
      ...updated,
      updatedAtMs: nowMs,
    };

    setTransactions((prev) => {
      const next = prev.map((t) => (getCanonicalDocId(t.id) === canonTxId ? updatedTxObj : t));
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });

    if (user) {
      try {
        await setDoc(
          doc(db, 'transactions', canonTxId),
          buildTransactionCloudPayload(updatedTxObj, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `transactions/${canonTxId}`);
      }
    }
    showToast(`ভাউচার (${existingTx.invoiceNo}) সফলভাবে এডিট করা হয়েছে!`);
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    const canonTxId = getCanonicalDocId(tx.id);
    const nowMs = Date.now();
    markDeletedIds(
      user ? [tx.id, canonTxId, `${canonTxId}_${user.uid.slice(0, 6)}`] : [tx.id, canonTxId]
    );
    setTransactions((prev) => {
      const next = prev.filter((t) => getCanonicalDocId(t.id) !== canonTxId);
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });

    // Reverse stock impact when deleting a sale or purchase invoice
    if (tx.txType === 'sale' || tx.txType === 'purchase') {
      const parsedItems = parseTransactionItemsDetailed(tx.itemsSummary, fullCatalog);
      const nextInv = inventory.map((inv) => ({ ...inv }));
      const modifiedInv: InventoryItem[] = [];

      for (const pItem of parsedItems) {
        const matched = findMatchingInventoryRecord(nextInv, {
          medicineId: pItem.matchedMedicine?.id,
          brandName: pItem.matchedMedicine?.brandName || pItem.brandAndStrength,
          strength: pItem.matchedMedicine?.strength || '',
          dosageForm: pItem.matchedMedicine?.dosageForm || pItem.formPrefix,
        });
        if (matched && pItem.qty > 0) {
          matched.id = getCanonicalDocId(matched.id);
          if (tx.txType === 'sale') {
            matched.stockQty = matched.stockQty + pItem.qty;
          } else {
            matched.stockQty = Math.max(0, matched.stockQty - pItem.qty);
          }
          matched.updatedAtMs = nowMs;
          modifiedInv.push(matched);
        }
      }

      if (modifiedInv.length > 0) {
        setInventory(nextInv);
        saveLocal(STORAGE_KEYS.INVENTORY, nextInv);
        if (user) {
          for (const invItem of modifiedInv) {
            try {
              await setDoc(
                doc(db, 'inventory', getCanonicalDocId(invItem.id)),
                buildInventoryCloudPayload(invItem, user.uid)
              );
            } catch {
              // ignore if not synced to cloud yet
            }
          }
        }
      }
    }

    if (user) {
      try {
        await deleteDoc(doc(db, 'transactions', canonTxId));
      } catch {
        // ignore if local demo transaction was not in Firestore yet
      }
      if (tx.id !== canonTxId) {
        try {
          await deleteDoc(doc(db, 'transactions', tx.id));
        } catch {
          // ignore
        }
      }
    }
    showToast(`লেনদেন (${tx.invoiceNo}) ডিলিট করা হয়েছে এবং স্টক সমন্বয় হয়েছে`);
  };

  // Single-item fallback Record Company Purchase & Stock-In
  const handleRecordPurchase = async (params: {
    supplierCompany: string;
    invoiceNo: string;
    medicineId: string;
    brandName: string;
    genericName: string;
    strength: string;
    dosageForm: string;
    packSize: string;
    qty: number;
    purchasePrice: number;
    unitPrice: number;
    batchNo: string;
    expiryDate: string;
    paidAmount: number;
    paymentMethod: Transaction['paymentMethod'];
  }): Promise<Transaction | null> => {
    const nowMs = Date.now();
    const subTotal = sanitizeNumber(params.qty * params.purchasePrice);
    const paidAmount = sanitizeNumber(params.paidAmount, 0, subTotal);
    const dueAmount = sanitizeNumber(subTotal - paidAmount);
    const txId = `tx_pur_${nowMs}`;
    const staffRoleVal: 'owner' | 'staff' =
      activeStaff.roleTitle === 'owner' ? 'owner' : 'staff';
    const operatorDisplayName = getOperatorName(activeStaff);

    const newTx: Transaction = {
      id: txId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      txType: 'purchase',
      invoiceNo: sanitizeString(params.invoiceNo, 60, 'PUR-01'),
      dateStr: getTodayDateStr(),
      partyId: 'supplier-company',
      partyName: sanitizeString(`${params.supplierCompany} (ডিপো চালান)`, 120),
      partyPhone: 'কোম্পানি ডিপো',
      itemsSummary: sanitizeString(
        `1.${getInvoiceFormPrefix(params.dosageForm)}.${params.brandName} ${params.strength} (৳${formatCleanMoney(params.purchasePrice)}) × ${params.qty}=${formatCleanMoney(params.purchasePrice * params.qty)}`,
        600
      ),
      totalCount: params.qty,
      subTotal,
      discount: 0,
      grandTotal: subTotal,
      paidAmount,
      dueAmount,
      paymentMethod: params.paymentMethod,
      staffName: sanitizeString(operatorDisplayName, 100),
      staffRole: staffRoleVal,
      counterName: sanitizeString(activeStaff.counterName, 60),
      updatedAtMs: nowMs,
    };

    const existingInv = findMatchingInventoryRecord(inventory, {
      medicineId: params.medicineId,
      brandName: params.brandName,
      strength: params.strength,
      dosageForm: params.dosageForm,
    });
    const newInvId = existingInv ? getCanonicalDocId(existingInv.id) : `inv_${nowMs}`;

    const baseMed = fullCatalog.find((m) => m.id === params.medicineId);
    if (baseMed && Math.abs(baseMed.unitPrice - params.unitPrice) > 0.001) {
      await triggerPriceChangeAlert({
        medicineId: baseMed.id,
        brandName: baseMed.brandName,
        genericName: baseMed.genericName,
        companyName: params.supplierCompany,
        strength: baseMed.strength,
        oldUnitPrice: baseMed.unitPrice,
        newUnitPrice: params.unitPrice,
        oldStripPrice: baseMed.stripPrice,
        newStripPrice: Number((params.unitPrice * 10).toFixed(2)),
      });
    }

    unmarkDeletedId(txId);
    unmarkDeletedId(newInvId);

    setTransactions((prev) => {
      const next = [newTx, ...prev];
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });

    const targetInvObj: InventoryItem = existingInv
      ? {
          ...existingInv,
          id: newInvId,
          stockQty: existingInv.stockQty + params.qty,
          purchasePrice: params.purchasePrice,
          unitPrice: params.unitPrice,
          stripPrice: Number((params.unitPrice * 10).toFixed(2)),
          batchNo: params.batchNo,
          expiryDate: params.expiryDate,
          updatedAtMs: nowMs,
        }
      : {
          id: newInvId,
          ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
          medicineId: params.medicineId,
          brandName: params.brandName,
          genericName: params.genericName,
          companyName: params.supplierCompany,
          strength: params.strength,
          dosageForm: params.dosageForm,
          packSize: params.packSize,
          purchasePrice: params.purchasePrice,
          unitPrice: params.unitPrice,
          stripPrice: Number((params.unitPrice * 10).toFixed(2)),
          stockQty: params.qty,
          minStockLevel: 50,
          batchNo: params.batchNo,
          expiryDate: params.expiryDate,
          shelfLocation: 'Rack A-1',
          updatedAtMs: nowMs,
        };

    if (existingInv) {
      setInventory((prev) => {
        const next = prev.map((i) =>
          getCanonicalDocId(i.id) === newInvId ? targetInvObj : i
        );
        saveLocal(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
    } else {
      setInventory((prev) => {
        const next = [targetInvObj, ...prev];
        saveLocal(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
    }

    if (user) {
      try {
        await setDoc(
          doc(db, 'transactions', txId),
          buildTransactionCloudPayload(newTx, user.uid)
        );
        await setDoc(
          doc(db, 'inventory', newInvId),
          buildInventoryCloudPayload(targetInvObj, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'transactions');
      }
    }

    showToast(`${params.brandName} (+${params.qty} পিস) ক্রয় ইনভয়েস ও স্টকে যুক্ত হয়েছে!`);
    return newTx;
  };

  // Inventory CRUD Handlers
  const handleSaveInventoryItem = async (
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const nowMs = Date.now();
    const matchedExisting = existingId
      ? inventory.find((i) => getCanonicalDocId(i.id) === getCanonicalDocId(existingId))
      : inventory.find(
          (i) =>
            i.medicineId === itemData.medicineId ||
            (i.brandName.toLowerCase() === itemData.brandName.toLowerCase() &&
              i.dosageForm.toLowerCase() === itemData.dosageForm.toLowerCase() &&
              i.strength.toLowerCase() === itemData.strength.toLowerCase())
        );

    const targetId = getCanonicalDocId(existingId || matchedExisting?.id || `inv_${nowMs}`);
    const isUpdatingExisting = Boolean(existingId || matchedExisting);

    if (matchedExisting && Math.abs(matchedExisting.unitPrice - itemData.unitPrice) > 0.001) {
      await triggerPriceChangeAlert({
        medicineId: itemData.medicineId,
        brandName: itemData.brandName,
        genericName: itemData.genericName,
        companyName: itemData.companyName,
        strength: itemData.strength,
        oldUnitPrice: matchedExisting.unitPrice,
        newUnitPrice: itemData.unitPrice,
        oldStripPrice: matchedExisting.stripPrice,
        newStripPrice: itemData.stripPrice,
      });
    }

    unmarkDeletedId(targetId);

    const nextStockQty =
      !existingId && matchedExisting
        ? matchedExisting.stockQty + itemData.stockQty
        : itemData.stockQty;

    const savedInvObj: InventoryItem = {
      id: targetId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      ...itemData,
      stockQty: nextStockQty,
      updatedAtMs: nowMs,
    };

    if (isUpdatingExisting) {
      setInventory((prev) => {
        const next = prev.map((i) =>
          getCanonicalDocId(i.id) === targetId ? savedInvObj : i
        );
        saveLocal(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
    } else {
      setInventory((prev) => {
        const next = [savedInvObj, ...prev];
        saveLocal(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
    }

    if (user) {
      try {
        await setDoc(
          doc(db, 'inventory', targetId),
          buildInventoryCloudPayload(savedInvObj, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `inventory/${targetId}`);
      }
    }

    // Also sync updated purchasePrice and unitPrice to the Medicine Catalog so prices stay synchronized everywhere
    const matchedCatMed = fullCatalog.find(
      (m) =>
        m.id === savedInvObj.medicineId ||
        (m.brandName.toLowerCase() === savedInvObj.brandName.toLowerCase() &&
          m.strength.toLowerCase() === savedInvObj.strength.toLowerCase())
    );
    if (matchedCatMed) {
      const catPur =
        typeof matchedCatMed.purchasePrice === 'number' && matchedCatMed.purchasePrice > 0
          ? matchedCatMed.purchasePrice
          : Number((matchedCatMed.unitPrice * 0.88).toFixed(2));
      if (
        Math.abs(matchedCatMed.unitPrice - savedInvObj.unitPrice) > 0.001 ||
        Math.abs(catPur - savedInvObj.purchasePrice) > 0.001
      ) {
        await handleSaveMedicineCatalog(
          {
            brandName: matchedCatMed.brandName,
            genericName: matchedCatMed.genericName,
            companyName: matchedCatMed.companyName,
            strength: matchedCatMed.strength,
            dosageForm: matchedCatMed.dosageForm,
            packSize: matchedCatMed.packSize,
            purchasePrice: savedInvObj.purchasePrice,
            unitPrice: savedInvObj.unitPrice,
            stripPrice: savedInvObj.stripPrice,
            therapeuticClass: matchedCatMed.therapeuticClass,
            indication: matchedCatMed.indication,
          },
          matchedCatMed
        );
      }
    }

    showToast('ইনভেন্টরি স্টক ও ক্রয়-বিক্রয় মূল্য সফলভাবে আপডেট হয়েছে!');
  };

  const handleQuickAddInventoryFromCompare = async (med: MedicineCatalogItem) => {
    const existing = inventory.find((i) => i.medicineId === med.id);
    if (existing) {
      await handleQuickRestock(existing, 100);
      return;
    }
    await handleSaveInventoryItem({
      medicineId: med.id,
      brandName: med.brandName,
      genericName: med.genericName,
      companyName: med.companyName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      packSize: med.packSize,
      purchasePrice:
        typeof med.purchasePrice === 'number' && med.purchasePrice > 0
          ? med.purchasePrice
          : Number((med.unitPrice * 0.88).toFixed(2)),
      unitPrice: med.unitPrice,
      stripPrice: med.stripPrice,
      stockQty: 100,
      minStockLevel: 30,
      batchNo: `B-${Math.floor(100 + Math.random() * 900)}`,
      expiryDate: '2028-06-30',
      shelfLocation: 'Rack A-1',
    });
  };

  const handleQuickRestock = async (item: InventoryItem, addQty: number) => {
    const nowMs = Date.now();
    const canonId = getCanonicalDocId(item.id);
    const nextQty = sanitizeNumber(item.stockQty + addQty, 0, 10000000);
    const updatedItem: InventoryItem = {
      ...item,
      id: canonId,
      stockQty: nextQty,
      updatedAtMs: nowMs,
    };

    setInventory((prev) => {
      const exists = prev.some((i) => getCanonicalDocId(i.id) === canonId);
      const next = exists
        ? prev.map((i) => (getCanonicalDocId(i.id) === canonId ? updatedItem : i))
        : [updatedItem, ...prev];
      saveLocal(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    if (user) {
      try {
        await setDoc(
          doc(db, 'inventory', canonId),
          buildInventoryCloudPayload(updatedItem, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `inventory/${canonId}`);
      }
    }
    showToast(`${item.brandName}-এর স্টকে +${addQty} পিস যুক্ত হয়েছে!`);
  };

  const handleDeleteInventoryItem = async (id: string) => {
    const canonId = getCanonicalDocId(id);
    const targetItem = inventory.find((i) => getCanonicalDocId(i.id) === canonId);
    if (targetItem) {
      const isCore =
        canonId.startsWith('inv-seed-') ||
        INITIAL_DEMO_INVENTORY.some((d) => d.id === canonId) ||
        isCoreDatabaseMedicineId(targetItem.medicineId) ||
        CATALOG_BY_ID.has(targetItem.medicineId) ||
        CATALOG_BY_BRAND_STRENGTH.has(
          `${targetItem.brandName.toLowerCase()}__${targetItem.strength.toLowerCase()}`
        );
      if (isCore) {
        showToast(
          'ডাটাবেস এ থাকা মূল প্রোডাক্ট ডিলিট করা যাবে না! তবে এর ক্রয় ও বিক্রয় মূল্য পরিবর্তন করতে পারবেন।'
        );
        return;
      }
    }

    markDeletedIds(
      user ? [id, canonId, `${canonId}_${user.uid.slice(0, 6)}`] : [id, canonId]
    );
    setInventory((prev) => {
      const next = prev.filter((i) => getCanonicalDocId(i.id) !== canonId);
      saveLocal(STORAGE_KEYS.INVENTORY, next);
      return next;
    });
    if (user) {
      try {
        await deleteDoc(doc(db, 'inventory', canonId));
      } catch {
        // ignore if local demo item was not in Firestore yet
      }
      if (id !== canonId) {
        try {
          await deleteDoc(doc(db, 'inventory', id));
        } catch {
          // ignore
        }
      }
    }
    showToast('কাস্টম স্টক আইটেম মুছে ফেলা হয়েছে');
  };

  // Customer & Ledger CRUD Handlers
  const handleSaveCustomer = async (
    data: {
      name: string;
      phone: string;
      address: string;
      totalPurchased: number;
      totalPaid: number;
      totalDue: number;
    },
    existingId?: string
  ) => {
    const nowMs = Date.now();
    const custId = getCanonicalDocId(existingId || `cust_${nowMs}`);
    unmarkDeletedId(custId);

    const newCust: Customer = {
      id: custId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      name: sanitizeString(data.name, 120),
      phone: sanitizeString(data.phone, 30),
      address: sanitizeString(data.address, 250),
      totalPurchased: sanitizeNumber(data.totalPurchased),
      totalPaid: sanitizeNumber(data.totalPaid),
      totalDue: sanitizeNumber(data.totalDue),
      updatedAtMs: nowMs,
    };

    if (existingId) {
      setCustomers((prev) => {
        const next = prev.map((c) => (getCanonicalDocId(c.id) === custId ? newCust : c));
        saveLocal(STORAGE_KEYS.CUSTOMERS, next);
        return next;
      });
    } else {
      setCustomers((prev) => {
        const next = [newCust, ...prev];
        saveLocal(STORAGE_KEYS.CUSTOMERS, next);
        return next;
      });
    }

    if (user) {
      try {
        await setDoc(
          doc(db, 'customers', custId),
          buildCustomerCloudPayload(newCust, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `customers/${custId}`);
      }
    }
    showToast(`${data.name}-এর কাস্টমার লেজার সংরক্ষিত হয়েছে!`);
  };

  const handleDeleteCustomer = async (id: string) => {
    const canonId = getCanonicalDocId(id);
    markDeletedIds(
      user ? [id, canonId, `${canonId}_${user.uid.slice(0, 6)}`] : [id, canonId]
    );
    setCustomers((prev) => {
      const next = prev.filter((c) => getCanonicalDocId(c.id) !== canonId);
      saveLocal(STORAGE_KEYS.CUSTOMERS, next);
      return next;
    });
    if (user) {
      try {
        await deleteDoc(doc(db, 'customers', canonId));
      } catch {
        // ignore if local demo customer was not in Firestore yet
      }
      if (id !== canonId) {
        try {
          await deleteDoc(doc(db, 'customers', id));
        } catch {
          // ignore
        }
      }
    }
    showToast('কাস্টমার লেজার স্থায়ীভাবে মুছে ফেলা হয়েছে');
  };

  const handleCollectDuePayment = async (params: {
    customer: Customer;
    amount: number;
    paymentMethod: Transaction['paymentMethod'];
    note: string;
  }) => {
    const nowMs = Date.now();
    const canonCustId = getCanonicalDocId(params.customer.id);
    const amt = sanitizeNumber(params.amount, 0, params.customer.totalDue);
    const txId = `tx_due_${nowMs}`;
    const staffRoleVal: 'owner' | 'staff' =
      activeStaff.roleTitle === 'owner' ? 'owner' : 'staff';
    const operatorDisplayName = getOperatorName(activeStaff);

    const dueTx: Transaction = {
      id: txId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      txType: 'due_payment',
      invoiceNo: `DUE-${getTodayDateStr().replace(/-/g, '').slice(2)}-${Math.floor(
        100 + Math.random() * 900
      )}`,
      dateStr: getTodayDateStr(),
      partyId: canonCustId,
      partyName: sanitizeString(params.customer.name, 120),
      partyPhone: sanitizeString(params.customer.phone, 30),
      itemsSummary: sanitizeString(params.note, 600, 'বকেয়া আদায়'),
      totalCount: 1,
      subTotal: amt,
      discount: 0,
      grandTotal: amt,
      paidAmount: amt,
      dueAmount: 0,
      paymentMethod: params.paymentMethod,
      staffName: sanitizeString(operatorDisplayName, 100),
      staffRole: staffRoleVal,
      counterName: sanitizeString(activeStaff.counterName, 60),
      updatedAtMs: nowMs,
    };

    const updatedCustObj: Customer = {
      ...params.customer,
      id: canonCustId,
      totalPaid: params.customer.totalPaid + amt,
      totalDue: Math.max(0, params.customer.totalDue - amt),
      updatedAtMs: nowMs,
    };

    unmarkDeletedId(txId);
    setTransactions((prev) => {
      const next = [dueTx, ...prev];
      saveLocal(STORAGE_KEYS.TRANSACTIONS, next);
      return next;
    });
    setCustomers((prev) => {
      const next = prev.map((c) =>
        getCanonicalDocId(c.id) === canonCustId ? updatedCustObj : c
      );
      saveLocal(STORAGE_KEYS.CUSTOMERS, next);
      return next;
    });

    if (user) {
      try {
        await setDoc(
          doc(db, 'transactions', txId),
          buildTransactionCloudPayload(dueTx, user.uid)
        );
        await setDoc(
          doc(db, 'customers', canonCustId),
          buildCustomerCloudPayload(updatedCustObj, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'customers_due_payment');
      }
    }
    showToast(`৳${amt.toFixed(2)} বকেয়া আদায় লেজারে সংরক্ষিত হয়েছে!`);
  };

  // Add or Edit Medicine in Catalog & Trigger Automatic Price Change Alert
  const handleSaveMedicineCatalog = async (
    medData: Omit<MedicineCatalogItem, 'id' | 'darNo' | 'unitsPerStrip'>,
    existingMed?: MedicineCatalogItem
  ) => {
    const nowMs = Date.now();
    // If existingMed is provided, verify if brandName+strength still match existingMed or if user selected a different variant
    const matchedCatalogVariant = fullCatalog.find(
      (m) =>
        m.brandName.toLowerCase() === medData.brandName.toLowerCase() &&
        m.strength.toLowerCase() === medData.strength.toLowerCase() &&
        m.dosageForm.toLowerCase() === medData.dosageForm.toLowerCase()
    );

    const targetMed =
      existingMed &&
      existingMed.brandName.toLowerCase() === medData.brandName.toLowerCase() &&
      existingMed.strength.toLowerCase() === medData.strength.toLowerCase()
        ? existingMed
        : matchedCatalogVariant || existingMed;

    const medId = getCanonicalDocId(targetMed ? targetMed.id : `cmed_${nowMs}`);
    unmarkDeletedId(medId);

    const resolvedPurchasePrice = sanitizeNumber(
      typeof medData.purchasePrice === 'number' && medData.purchasePrice > 0
        ? medData.purchasePrice
        : Number((medData.unitPrice * 0.88).toFixed(2))
    );

    if (targetMed && Math.abs(targetMed.unitPrice - medData.unitPrice) > 0.001) {
      await triggerPriceChangeAlert({
        medicineId: medId,
        brandName: medData.brandName,
        genericName: medData.genericName,
        companyName: medData.companyName,
        strength: medData.strength,
        oldUnitPrice: targetMed.unitPrice,
        newUnitPrice: medData.unitPrice,
        oldStripPrice: targetMed.stripPrice,
        newStripPrice: medData.stripPrice,
      });
    }

    const newMed: CustomMedicine = {
      id: medId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      brandName: sanitizeString(medData.brandName, 120),
      genericName: sanitizeString(medData.genericName, 150),
      companyName: sanitizeString(medData.companyName, 120),
      strength: sanitizeString(medData.strength, 60),
      dosageForm: sanitizeString(medData.dosageForm, 60),
      packSize: sanitizeString(medData.packSize, 60),
      purchasePrice: resolvedPurchasePrice,
      unitPrice: sanitizeNumber(medData.unitPrice),
      stripPrice: sanitizeNumber(medData.stripPrice),
      therapeuticClass: sanitizeString(medData.therapeuticClass, 100),
      indication: sanitizeString(medData.indication, 300),
      updatedAtMs: nowMs,
    };

    setCustomMedicines((prev) => {
      const exists = prev.some((m) => getCanonicalDocId(m.id) === medId);
      const next = exists
        ? prev.map((m) => (getCanonicalDocId(m.id) === medId ? newMed : m))
        : [newMed, ...prev];
      saveLocal(STORAGE_KEYS.CUSTOM_MEDS, next);
      return next;
    });

    // Also update matching inventory item's purchasePrice, unitPrice, and stripPrice
    let matchedInvItemForCloud: InventoryItem | null = null;
    setInventory((prev) => {
      const next = prev.map((inv) => {
        if (
          inv.medicineId === medId ||
          (inv.brandName.toLowerCase() === medData.brandName.toLowerCase() &&
            inv.strength.toLowerCase() === medData.strength.toLowerCase())
        ) {
          const updatedInv: InventoryItem = {
            ...inv,
            id: getCanonicalDocId(inv.id),
            purchasePrice: resolvedPurchasePrice,
            unitPrice: medData.unitPrice,
            stripPrice: medData.stripPrice,
            updatedAtMs: nowMs,
          };
          matchedInvItemForCloud = updatedInv;
          return updatedInv;
        }
        return inv;
      });
      saveLocal(STORAGE_KEYS.INVENTORY, next);
      return next;
    });

    // Also update any matching items in POS or Purchase cart so active cart reflects new price
    setPosCart((prev) => {
      const changed = prev.some((item) => item.medicineId === medId);
      if (!changed) return prev;
      const next = prev.map((item) =>
        item.medicineId === medId
          ? {
              ...item,
              unitPrice: medData.unitPrice,
              originalUnitPrice: medData.unitPrice,
              purchasePrice: resolvedPurchasePrice,
              originalPurchasePrice: resolvedPurchasePrice,
            }
          : item
      );
      saveLocal(STORAGE_KEYS.POS_CART, next);
      return next;
    });

    if (user) {
      try {
        await setDoc(
          doc(db, 'custom_medicines', medId),
          buildCustomMedCloudPayload(newMed, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `custom_medicines/${medId}`);
      }

      if (matchedInvItemForCloud) {
        const invItem = matchedInvItemForCloud as InventoryItem;
        try {
          await setDoc(
            doc(db, 'inventory', getCanonicalDocId(invItem.id)),
            buildInventoryCloudPayload(invItem, user.uid)
          );
        } catch {
          // ignore
        }
      }
    }
    showToast(
      targetMed
        ? `${medData.brandName} (${medData.strength})-এর ক্রয় মূল্য (৳${resolvedPurchasePrice.toFixed(2)}) ও বিক্রয় মূল্য (৳${medData.unitPrice.toFixed(2)}) সংরক্ষিত হয়েছে!`
        : `${medData.brandName} ক্যাটালগে যুক্ত হয়েছে!`
    );
  };

  const handleDeleteCustomMedicine = async (medId: string) => {
    const canonId = getCanonicalDocId(medId);
    if (isCoreDatabaseMedicineId(canonId) || CATALOG_BY_ID.has(canonId)) {
      showToast(
        'ডাটাবেস এ থাকা মূল প্রোডাক্ট ডিলিট করা যাবে না! তবে ক্রয় মূল্য ও বিক্রয় মূল্য পরিবর্তন করা যাবে।'
      );
      return;
    }

    markDeletedIds(
      user ? [medId, canonId, `${canonId}_${user.uid.slice(0, 6)}`] : [medId, canonId]
    );
    setCustomMedicines((prev) => {
      const next = prev.filter((m) => getCanonicalDocId(m.id) !== canonId);
      saveLocal(STORAGE_KEYS.CUSTOM_MEDS, next);
      return next;
    });
    if (user) {
      try {
        await deleteDoc(doc(db, 'custom_medicines', canonId));
      } catch {
        // ignore if medicine was built-in or not in Firestore
      }
    }
    showToast('কাস্টম ওষুধটি তালিকা থেকে মুছে ফেলা হয়েছে');
  };

  // Price Watchlist & Alert Handlers
  const handleTogglePriceWatch = async (med: MedicineCatalogItem) => {
    const existing = priceWatches.find(
      (w) =>
        w.medicineId === med.id ||
        w.brandName.toLowerCase() === med.brandName.toLowerCase()
    );

    if (existing) {
      const canonId = getCanonicalDocId(existing.id);
      markDeletedIds(
        user
          ? [existing.id, canonId, `${canonId}_${user.uid.slice(0, 6)}`]
          : [existing.id, canonId]
      );
      setPriceWatches((prev) => {
        const next = prev.filter((w) => getCanonicalDocId(w.id) !== canonId);
        saveLocal(STORAGE_KEYS.PRICE_WATCHES, next);
        return next;
      });
      if (user) {
        try {
          await deleteDoc(doc(db, 'price_watches', canonId));
        } catch {
          // ignore if local demo watch was not in Firestore yet
        }
      }
      showToast(`${med.brandName} মূল্য ট্র্যাকিং তালিকা থেকে সরানো হয়েছে`);
      return;
    }

    const nowMs = Date.now();
    const watchId = `watch_${nowMs}`;
    unmarkDeletedId(watchId);
    const newWatch: PriceWatch = {
      id: watchId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      medicineId: sanitizeString(med.id, 100),
      brandName: sanitizeString(med.brandName, 120),
      genericName: sanitizeString(med.genericName, 150),
      companyName: sanitizeString(med.companyName, 120),
      strength: sanitizeString(med.strength, 60),
      baselineUnitPrice: sanitizeNumber(med.unitPrice),
      currentUnitPrice: sanitizeNumber(med.unitPrice),
      targetAlertPrice: sanitizeNumber(med.unitPrice),
      notifyOnAnyChange: true,
      updatedAtMs: nowMs,
    };

    setPriceWatches((prev) => {
      const next = [newWatch, ...prev];
      saveLocal(STORAGE_KEYS.PRICE_WATCHES, next);
      return next;
    });
    if (user) {
      try {
        await setDoc(
          doc(db, 'price_watches', watchId),
          buildPriceWatchCloudPayload(newWatch, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `price_watches/${watchId}`);
      }
    }
    showToast(`${med.brandName} মূল্য নিরীক্ষণ ও অ্যালার্ট তালিকায় যুক্ত হয়েছে!`);
  };

  const handleMarkAlertRead = async (alertId: string) => {
    const canonId = getCanonicalDocId(alertId);
    const nowMs = Date.now();
    const targetAlert = priceAlerts.find((a) => getCanonicalDocId(a.id) === canonId);
    const updatedAlert: PriceAlert | null = targetAlert
      ? { ...targetAlert, id: canonId, isRead: true, updatedAtMs: nowMs }
      : null;

    setPriceAlerts((prev) => {
      const next = prev.map((a) =>
        getCanonicalDocId(a.id) === canonId ? { ...a, id: canonId, isRead: true, updatedAtMs: nowMs } : a
      );
      saveLocal(STORAGE_KEYS.PRICE_ALERTS, next);
      return next;
    });
    if (user && updatedAlert) {
      try {
        await setDoc(
          doc(db, 'price_alerts', canonId),
          buildPriceAlertCloudPayload(updatedAlert, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `price_alerts/${canonId}`);
      }
    }
  };

  const handleDeletePriceAlert = async (alertId: string) => {
    const canonId = getCanonicalDocId(alertId);
    markDeletedIds(
      user ? [alertId, canonId, `${canonId}_${user.uid.slice(0, 6)}`] : [alertId, canonId]
    );
    setPriceAlerts((prev) => {
      const next = prev.filter((a) => getCanonicalDocId(a.id) !== canonId);
      saveLocal(STORAGE_KEYS.PRICE_ALERTS, next);
      return next;
    });
    if (user) {
      try {
        await deleteDoc(doc(db, 'price_alerts', canonId));
      } catch {
        // ignore if local demo alert was not in Firestore yet
      }
    }
    showToast('মূল্য অ্যালার্ট বিজ্ঞপ্তি মুছে ফেলা হয়েছে');
  };

  // Staff & Shop Profile Handlers
  const handleUpdateShopProfile = async (
    data: Omit<ShopProfile, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    const nowMs = Date.now();
    const nextShop: ShopProfile = {
      ...shopProfile,
      id: SHARED_SHOP_DOC_ID,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      ...data,
      updatedAtMs: nowMs,
    };
    setShopProfile(nextShop);
    saveLocal(STORAGE_KEYS.SHOP, nextShop);

    if (user) {
      try {
        await setDoc(
          doc(db, 'shops', SHARED_SHOP_DOC_ID),
          buildShopCloudPayload(nextShop, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `shops/${SHARED_SHOP_DOC_ID}`);
      }
    }
    showToast('দোকানের একাউন্ট তথ্য সংরক্ষিত হয়েছে!');
  };

  const handleSaveStaffMember = async (
    data: Omit<StaffMember, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const nowMs = Date.now();
    const stId = getCanonicalDocId(existingId || `staff_${nowMs}`);
    unmarkDeletedId(stId);
    const enforcedName =
      data.roleTitle === 'owner' ? 'Owner' : sanitizeString(data.name, 100);

    const newStaff: StaffMember = {
      id: stId,
      ownerId: user?.uid || SHARED_PHARMACY_OWNER_ID,
      name: enforcedName,
      roleTitle: data.roleTitle,
      phone: sanitizeString(data.phone, 30),
      shift: sanitizeString(data.shift, 60),
      counterName: sanitizeString(data.counterName, 60),
      active: true,
      updatedAtMs: nowMs,
    };

    if (existingId) {
      setStaffList((prev) => {
        const next = prev.map((s) => (getCanonicalDocId(s.id) === stId ? newStaff : s));
        saveLocal(STORAGE_KEYS.STAFF, next);
        return next;
      });
      if (getCanonicalDocId(activeStaff.id) === stId) setActiveStaff(newStaff);
    } else {
      setStaffList((prev) => {
        const next = [...prev, newStaff];
        saveLocal(STORAGE_KEYS.STAFF, next);
        return next;
      });
    }

    if (user) {
      try {
        await setDoc(
          doc(db, 'staff', stId),
          buildStaffCloudPayload(newStaff, user.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `staff/${stId}`);
      }
    }
    showToast(`${enforcedName} প্রোফাইল সংরক্ষিত হয়েছে!`);
  };

  const handleDeleteStaffMember = async (id: string) => {
    const canonId = getCanonicalDocId(id);
    markDeletedIds(
      user ? [id, canonId, `${canonId}_${user.uid.slice(0, 6)}`] : [id, canonId]
    );
    setStaffList((prev) => {
      const remaining = prev.filter((s) => getCanonicalDocId(s.id) !== canonId);
      saveLocal(STORAGE_KEYS.STAFF, remaining);
      if (getCanonicalDocId(activeStaff.id) === canonId && remaining.length > 0) {
        setActiveStaff(remaining[0]);
      }
      return remaining;
    });
    if (user) {
      try {
        await deleteDoc(doc(db, 'staff', canonId));
      } catch {
        // ignore if local demo staff was not in Firestore yet
      }
      if (id !== canonId) {
        try {
          await deleteDoc(doc(db, 'staff', id));
        } catch {
          // ignore
        }
      }
    }
    showToast('স্টাফ প্রোফাইল স্থায়ীভাবে ডিলিট করা হয়েছে');
  };

  const unreadAlertsCount = useMemo(
    () => priceAlerts.filter((a) => !a.isRead).length,
    [priceAlerts]
  );

  const navItems: {
    id: ActiveSection;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'compare',
      label: 'ওষুধের মূল্য, অ্যালার্ট ও তুলনা',
      shortLabel: 'মূল্য ও অ্যালার্ট',
      icon: ArrowRightLeft,
    },
    {
      id: 'pos_accounts',
      label: 'দৈনিক ক্রয়-বিক্রয় ও ইনভয়েস',
      shortLabel: 'ক্রয়-বিক্রয় ও POS',
      icon: ShoppingCart,
    },
    {
      id: 'inventory',
      label: 'ইনভেন্টরি ও স্টক ম্যানেজমেন্ট',
      shortLabel: 'ইনভেন্টরি স্টক',
      icon: Boxes,
    },
    {
      id: 'customer_ledger',
      label: 'কাস্টমার লেজার ও বাকি খাতা',
      shortLabel: 'কাস্টমার লেজার',
      icon: BookOpen,
    },
    {
      id: 'staff_shop',
      label: 'দোকান একাউন্ট ও Owner/স্টাফ',
      shortLabel: 'Owner ও স্টাফ',
      icon: Users,
    },
  ];

  const activeNavObj = navItems.find((n) => n.id === activeSection) || navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 no-print">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            aria-label="মেনু"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('compare');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ইকবাল ফার্মেসী
          </a>
        </div>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  isActive
                    ? 'text-teal-700 border-teal-700 font-semibold'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {item.shortLabel}
                {item.id === 'compare' && unreadAlertsCount > 0
                  ? ` (${unreadAlertsCount})`
                  : ''}
                {item.id === 'pos_accounts' && posCart.length > 0
                  ? ` (${posCart.length})`
                  : ''}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isCloudLoggedIn ? (
            <>
              <button
                type="button"
                onClick={() => setShowCloudLoginModal(true)}
                className="hidden sm:flex px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                title="দোকান ক্লাউড একাউন্ট বিস্তারিত"
              >
                <Cloud className="w-3.5 h-3.5 text-teal-700" />
                <span>ক্লাউড সক্রিয় ({cloudSession?.email?.split('@')[0] || 'Owner'})</span>
              </button>
              <button
                type="button"
                onClick={handleCloudLogout}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                লগআউট ({getOperatorName(activeStaff)})
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowCloudLoginModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              দোকান ক্লাউড লগইন
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-3 space-y-1 no-print">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-left cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Workspace Body: Left Sidebar (260px) + Main Content Viewport */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 xl:w-72 flex-col justify-between bg-white border-r border-slate-200 p-5 shrink-0 no-print">
          <div className="space-y-6">
            {/* Shop Identity Summary */}
            <div className="pb-4 border-b border-slate-200 space-y-0.5">
              <div className="text-base font-bold text-teal-800">
                {shopProfile.shopName || 'ইকবাল ফার্মেসী'}
              </div>
              <div className="text-xs font-semibold text-slate-800">
                ইকবাল মাহমুদ (DMTD DENTAL,LMF,RMP,Pharmasist)
              </div>
              <div className="text-[11px] text-slate-600 leading-snug">
                ঠিকানা:- {shopProfile.address}
              </div>
              <div className="text-xs text-slate-700 font-mono">
                মোবাই:- {shopProfile.phone}
              </div>
            </div>

            {/* Sidebar Navigation List */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-400 px-3 pb-1">
                মূল মেনু ও মডিউল
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'pos_accounts' && posCart.length > 0 && (
                      <span className="font-mono tabular-nums text-xs px-1.5 py-0.5 rounded bg-teal-600 text-white">
                        {posCart.length}
                      </span>
                    )}
                    {item.id === 'compare' && unreadAlertsCount > 0 && (
                      <span className="font-mono tabular-nums text-xs px-1.5 py-0.5 rounded bg-amber-500 text-white">
                        {unreadAlertsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Operator / Staff Switcher in Sidebar */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                সক্রিয় অপারেটর (Owner / স্টাফ)
              </div>
              <select
                value={activeStaff.id}
                onChange={(e) => {
                  const found = staffList.find((s) => s.id === e.target.value);
                  if (found) {
                    setActiveStaff(found);
                    showToast(`সক্রিয় অপারেটর: ${getOperatorName(found)}`);
                  }
                }}
                aria-label="সক্রিয় অপারেটর নির্বাচন"
                className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md"
              >
                {staffList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.roleTitle === 'owner' ? 'Owner' : st.name} — {st.counterName}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500">
                সেল এন্ট্রিতে নাম দেখাবে:{' '}
                <strong className="text-slate-900">{getOperatorName(activeStaff)}</strong>
              </div>
            </div>

            {/* PWA In-App Install Prompt Button (Mandatory per pwa-integration skill) */}
            {!isInstalled && (isInstallable || isIOS) && (
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-teal-950">
                  অফলাইন অ্যাপ হিসেবে ইনস্টল করুন
                </div>
                <p className="text-xs text-teal-800">
                  ইন্টারনেট ছাড়াই যেকোনো সময় ওষুধের মূল্য যাচাই ও ইনভয়েস তৈরি করতে অ্যাপটি ডিভাইসে ইনস্টল করুন।
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (isInstallable) install();
                    else if (isIOS) setShowIOSInstallModal(true);
                  }}
                  className="w-full py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  অ্যাপ ইনস্টল করুন (Install PWA)
                </button>
              </div>
            )}
          </div>

          {/* Online / Offline Dual Mode Status & Cloud Sync */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span>অনলাইন মোড সক্রিয়</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-amber-700">অফলাইন মোড সক্রিয়</span>
                  </>
                )}
              </span>
              <span className="text-slate-400">Offline-Ready</span>
            </div>

            {isCloudLoggedIn ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-teal-700 shrink-0" />
                  <span className="truncate">
                    ক্লাউড সিঙ্ক: {cloudSession?.email || user?.email || 'mhakbor2001@gmail.com'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSeedCloudData}
                  disabled={seedingCloud}
                  className="w-full py-1.5 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {seedingCloud ? 'সিঙ্ক হচ্ছে...' : 'সকল ডেটা ক্লাউডে সিঙ্ক করুন'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-slate-500 leading-relaxed">
                  অ্যাপটি অনলাইন ও অফলাইন উভয় মাধ্যমে স্বয়ংক্রিয়ভাবে ডেটা সংরক্ষণ করছে।
                </div>
                <button
                  type="button"
                  onClick={() => setShowCloudLoginModal(true)}
                  className="w-full py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  দোকান ক্লাউড লগইন করুন
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Workspace Canvas */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full">

          {/* Offline Connectivity Banner */}
          {!isOnline && (
            <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium rounded-md flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>অফলাইন মোড সক্রিয়:</strong> ইন্টারনেট সংযোগ ছাড়াই আপনি ওষুধের মূল্য যাচাই, নতুন ইনভয়েস তৈরি, মূল্য পরিবর্তন, এডিট ও ডিলিট করতে পারবেন। ইন্টারনেট চালু হলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।
                </span>
              </div>
            </div>
          )}

          {/* Toast Feedback Banner */}
          {toastMessage && (
            <div className="mb-4 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-md flex items-center justify-between shadow-sm no-print">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-slate-400 hover:text-white ml-4 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Active View Render */}
          {activeSection === 'compare' && (
            <MedicineCompareView
              catalog={fullCatalog}
              inventory={inventory}
              priceWatches={priceWatches}
              priceAlerts={priceAlerts}
              publicAppUrl={PUBLIC_APP_URL}
              onAddToPosCart={handleAddToPosCart}
              onQuickAddInventory={handleQuickAddInventoryFromCompare}
              onSaveMedicineCatalog={handleSaveMedicineCatalog}
              onDeleteCustomMedicine={handleDeleteCustomMedicine}
              onTogglePriceWatch={handleTogglePriceWatch}
              onMarkAlertRead={handleMarkAlertRead}
              onDeletePriceAlert={handleDeletePriceAlert}
            />
          )}

          {activeSection === 'pos_accounts' && (
            <PosAndDailyAccountsView
              catalog={fullCatalog}
              inventory={inventory}
              customers={customers}
              transactions={transactions}
              staffList={staffList}
              activeStaff={activeStaff}
              onSelectActiveStaff={(st) => {
                setActiveStaff(st);
                showToast(`সক্রিয় অপারেটর: ${getOperatorName(st)}`);
              }}
              posCart={posCart}
              onAddToCart={handleAddToPosCart}
              onAddCustomToCart={handleAddCustomToPosCart}
              onUpdateCartQty={handleUpdateCartQty}
              onUpdateCartUnitPrice={handleUpdateCartUnitPrice}
              onUpdateCartPurchasePrice={handleUpdateCartPurchasePrice}
              onUpdateCartItemDetails={handleUpdateCartItemDetails}
              onRemoveFromCart={handleRemoveFromCart}
              onClearCart={() => {
                setPosCart([]);
                saveLocal(STORAGE_KEYS.POS_CART, []);
              }}
              onCompleteSale={handleCompleteSale}
              purchaseCart={purchaseCart}
              onAddToPurchaseCart={handleAddToPurchaseCart}
              onAddCustomToPurchaseCart={handleAddCustomToPurchaseCart}
              onUpdatePurchaseCartQty={handleUpdatePurchaseCartQty}
              onUpdatePurchaseCartCost={handleUpdatePurchaseCartCost}
              onUpdatePurchaseCartMrp={handleUpdatePurchaseCartMrp}
              onUpdatePurchaseCartBatch={handleUpdatePurchaseCartBatch}
              onUpdatePurchaseCartItemDetails={handleUpdatePurchaseCartItemDetails}
              onRemoveFromPurchaseCart={handleRemoveFromPurchaseCart}
              onClearPurchaseCart={() => {
                setPurchaseCart([]);
                saveLocal(STORAGE_KEYS.PURCHASE_CART, []);
              }}
              onCompletePurchaseInvoice={handleCompletePurchaseInvoice}
              onRecordPurchase={handleRecordPurchase}
              editingInvoiceTx={editingInvoiceTx}
              onStartEditInvoice={handleStartEditInvoice}
              onCancelEditInvoice={handleCancelEditInvoice}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              shopProfile={shopProfile}
            />
          )}

          {activeSection === 'inventory' && (
            <InventoryView
              inventory={inventory}
              catalog={fullCatalog}
              onSaveInventoryItem={handleSaveInventoryItem}
              onDeleteInventoryItem={handleDeleteInventoryItem}
              onQuickRestock={handleQuickRestock}
            />
          )}

          {activeSection === 'customer_ledger' && (
            <CustomerLedgerView
              customers={customers}
              transactions={transactions}
              activeStaff={activeStaff}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              onCollectDuePayment={handleCollectDuePayment}
              onStartEditInvoice={handleStartEditInvoice}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeSection === 'staff_shop' && (
            <StaffAndShopView
              shopProfile={shopProfile}
              staffList={staffList}
              activeStaff={activeStaff}
              transactions={transactions}
              cloudSession={cloudSession}
              isCloudLoggedIn={isCloudLoggedIn}
              seedingCloud={seedingCloud}
              onOpenCloudLoginModal={() => setShowCloudLoginModal(true)}
              onQuickCloudLogin={handleQuickCloudLogin}
              onCloudLogout={handleCloudLogout}
              onSyncCloudData={handleSeedCloudData}
              onSelectActiveStaff={(st) => {
                setActiveStaff(st);
                showToast(`সক্রিয় অপারেটর: ${getOperatorName(st)}`);
              }}
              onUpdateShopProfile={handleUpdateShopProfile}
              onSaveStaffMember={handleSaveStaffMember}
              onDeleteStaffMember={handleDeleteStaffMember}
            />
          )}
        </main>
      </div>

      {/* Shop Cloud Login Modal (দোকান ক্লাউড লগইন) */}
      {showCloudLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 no-print">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3.5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                  <Cloud className="w-4 h-4" />
                  <span>ইকবাল ফার্মেসী · মাল্টি-ডিভাইস ক্লাউড একাউন্ট</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  দোকান ক্লাউড লগইন (Shop Cloud Login)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCloudLoginModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                বন্ধ করুন ✕
              </button>
            </div>

            {isCloudLoggedIn && cloudSession && (
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-md space-y-1.5 text-xs">
                <div className="font-bold text-teal-950 flex items-center justify-between">
                  <span>বর্তমানে লগইন সক্রিয় রয়েছে</span>
                  <span className="text-teal-700 font-mono">Active</span>
                </div>
                <div className="text-teal-900">
                  দোকান: <strong>{cloudSession.shopName}</strong> ({cloudSession.displayName})
                </div>
                <div className="text-teal-800 font-mono">
                  ইমেইল: {cloudSession.email} · মোবাইল: {cloudSession.phone}
                </div>
              </div>
            )}

            {/* Option 1: Instant 1-Click Shop Cloud Login */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
              <div className="text-xs font-bold text-slate-900">
                ১-ক্লিকে ইকবাল ফার্মেসী ক্লাউড লগইন (প্রস্তাবিত)
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                কোনো পপআপ ব্লক বা ঝামেলা ছাড়াই সরাসরি ইকবাল ফার্মেসীর মূল একাউন্টে লগইন ও ক্লাউড সিঙ্ক চালু করুন।
              </p>
              <button
                type="button"
                disabled={cloudLoginLoading}
                onClick={handleQuickCloudLogin}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {cloudLoginLoading
                  ? 'লগইন হচ্ছে...'
                  : '১-ক্লিকে ইকবাল ফার্মেসী একাউন্টে লগইন করুন'}
              </button>
            </div>

            {/* Option 2: Email / Mobile & Password Form */}
            <form onSubmit={handleCustomCloudLoginSubmit} className="space-y-3">
              <div className="text-xs font-bold text-slate-800">
                অথবা ইমেইল / মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করুন:
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  দোকানের ইমেইল অথবা আইডি *
                </label>
                <input
                  type="text"
                  required
                  value={cloudLoginEmail}
                  onChange={(e) => setCloudLoginEmail(e.target.value)}
                  placeholder="mhakbor2001@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    মোবাইল নম্বর *
                  </label>
                  <input
                    type="text"
                    required
                    value={cloudLoginPhone}
                    onChange={(e) => setCloudLoginPhone(e.target.value)}
                    placeholder="01712525994"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    অপারেটর রোল *
                  </label>
                  <select
                    value={cloudLoginRole}
                    onChange={(e) => setCloudLoginRole(e.target.value as 'owner' | 'staff')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    <option value="owner">মালিক (Owner)</option>
                    <option value="staff">স্টাফ (Staff)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  দোকান ক্লাউড পাসওয়ার্ড / পিন *
                </label>
                <input
                  type="password"
                  required
                  value={cloudLoginPassword}
                  onChange={(e) => setCloudLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={cloudLoginLoading}
                  className="w-full sm:flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {cloudLoginLoading ? 'লগইন হচ্ছে...' : 'লগইন ও সিঙ্ক চালু করুন'}
                </button>
                <button
                  type="button"
                  disabled={cloudLoginLoading}
                  onClick={handleGoogleCloudLogin}
                  className="w-full sm:w-auto py-2.5 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                >
                  Google লগইন
                </button>
              </div>
            </form>

            {isCloudLoggedIn && (
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSeedCloudData}
                  disabled={seedingCloud}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  {seedingCloud ? 'সিঙ্ক হচ্ছে...' : 'সকল ডেটা এখনই সিঙ্ক করুন'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleCloudLogout();
                    setShowCloudLoginModal(false);
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                >
                  একাউন্ট লগআউট করুন
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* iOS PWA Installation Guide Modal */}
      {showIOSInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              iPhone / iPad-এ অ্যাপটি ইনস্টল করুন
            </h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              ১. Safari ব্রাউজারের নিচে <strong>Share</strong> বাটনে ট্যাপ করুন।
              <br />
              ২. নিচে স্ক্রল করে <strong>Add to Home Screen</strong> সিলেক্ট করুন।
            </p>
            <button
              type="button"
              onClick={() => setShowIOSInstallModal(false)}
              className="mt-4 w-full rounded-md bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              বুঝেছি, বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
