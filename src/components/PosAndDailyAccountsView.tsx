import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  FileText,
  Info,
  Minus,
  PackageCheck,
  PackageMinus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserCheck,
} from 'lucide-react';
import {
  BD_PHARMA_COMPANIES,
  formatCartItemInvoiceLine,
  formatCleanMoney,
  formatPurchaseItemInvoiceLine,
  formatTransactionItemsList,
  formatTransactionItemsText,
  getInventoryStockForMedicine,
  getInvoiceFormPrefix,
  matchesMedicineQuery,
  parseTransactionItemsDetailed,
  searchAndRankMedicines,
} from '../data/bdMedicines';
import { getTodayDateStr } from '../data/demoSeedData';
import {
  CartItem,
  Customer,
  InventoryItem,
  MedicineCatalogItem,
  PurchaseCartItem,
  ShopProfile,
  StaffMember,
  Transaction,
} from '../types';

interface PosAndDailyAccountsViewProps {
  catalog: MedicineCatalogItem[];
  inventory: InventoryItem[];
  customers: Customer[];
  transactions: Transaction[];
  staffList: StaffMember[];
  activeStaff: StaffMember;
  onSelectActiveStaff: (staff: StaffMember) => void;
  posCart: CartItem[];
  onAddToCart: (med: MedicineCatalogItem, qty: number) => void;
  onAddCustomToCart: (params: {
    brandName: string;
    genericName?: string;
    companyName?: string;
    strength?: string;
    dosageForm?: string;
    unitPrice: number;
    purchasePrice?: number;
    qty: number;
    saveToCatalog?: boolean;
  }) => Promise<void>;
  onUpdateCartQty: (medId: string, newQty: number) => void;
  onUpdateCartUnitPrice: (medId: string, newUnitPrice: number) => void;
  onUpdateCartPurchasePrice: (medId: string, newPurchasePrice: number) => void;
  onUpdateCartItemDetails: (medId: string, updates: Partial<CartItem>) => void;
  onRemoveFromCart: (medId: string) => void;
  onClearCart: () => void;
  onCompleteSale: (params: {
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
  }) => Promise<Transaction | null>;
  purchaseCart: PurchaseCartItem[];
  onAddToPurchaseCart: (med: MedicineCatalogItem, qty: number) => void;
  onAddCustomToPurchaseCart: (params: {
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
  }) => Promise<void>;
  onUpdatePurchaseCartQty: (medId: string, newQty: number) => void;
  onUpdatePurchaseCartCost: (medId: string, newCost: number) => void;
  onUpdatePurchaseCartMrp: (medId: string, newMrp: number) => void;
  onUpdatePurchaseCartBatch: (medId: string, batchNo: string, expiryDate?: string) => void;
  onUpdatePurchaseCartItemDetails: (
    medId: string,
    updates: Partial<PurchaseCartItem>
  ) => void;
  onRemoveFromPurchaseCart: (medId: string) => void;
  onClearPurchaseCart: () => void;
  onCompletePurchaseInvoice: (params: {
    supplierCompany: string;
    supplierPhone: string;
    invoiceNo: string;
    discount: number;
    paidAmount: number;
    paymentMethod: Transaction['paymentMethod'];
    dateStr?: string;
    editingTxId?: string;
    syncModifiedPricesToCatalog?: boolean;
  }) => Promise<Transaction | null>;
  onRecordPurchase: (params: {
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
  }) => Promise<Transaction | null>;
  editingInvoiceTx: Transaction | null;
  onStartEditInvoice: (tx: Transaction) => void;
  onCancelEditInvoice: () => void;
  onEditTransaction: (
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
  ) => Promise<void>;
  onDeleteTransaction: (tx: Transaction) => Promise<void>;
  shopProfile: ShopProfile;
}

const CUSTOM_PRODUCT_FORMS = [
  { value: 'Tablet', label: 'ট্যাবলেট (Tablet)' },
  { value: 'Capsule', label: 'ক্যাপসুল (Capsule)' },
  { value: 'Syrup', label: 'সিরাপ (Syrup)' },
  { value: 'Suspension', label: 'সাসপেনশন (Suspension)' },
  { value: 'Sachet', label: 'স্যাচেট (Sachet)' },
  { value: 'Drops', label: 'ড্রপ (Pediatric Drops)' },
  { value: 'Eye Drop', label: 'আই ড্রপ (Eye Drop)' },
  { value: 'Ear Drop', label: 'ইয়ার ড্রপ (Ear Drop)' },
  { value: 'Nasal Drop', label: 'ন্যাজাল ড্রপ (Nasal Drop)' },
  { value: 'Suppository', label: 'সাপোজিটরি (Suppository)' },
  { value: 'Inhaler', label: 'ইনহেলার (Inhaler)' },
  { value: 'Injection', label: 'ইনজেকশন (Injection)' },
  { value: 'Gel', label: 'ক্রিম / অয়েন্টমেন্ট / জেল (Gel/Cream)' },
  { value: 'Surgical', label: 'সার্জিক্যাল / কাস্টম পণ্য (Item/Pcs)' },
];

const makeFreshSaleInvoiceNo = () =>
  `INV-${getTodayDateStr().replace(/-/g, '').slice(2)}-${Math.floor(100 + Math.random() * 900)}`;

const makeFreshPurchaseInvoiceNo = () =>
  `PUR-${getTodayDateStr().replace(/-/g, '').slice(2)}-${Math.floor(100 + Math.random() * 900)}`;

export const PosAndDailyAccountsView: React.FC<PosAndDailyAccountsViewProps> = ({
  catalog,
  inventory,
  customers,
  transactions,
  staffList,
  activeStaff,
  onSelectActiveStaff,
  posCart,
  onAddToCart,
  onAddCustomToCart,
  onUpdateCartQty,
  onUpdateCartUnitPrice,
  onUpdateCartPurchasePrice,
  onUpdateCartItemDetails,
  onRemoveFromCart,
  onClearCart,
  onCompleteSale,
  purchaseCart,
  onAddToPurchaseCart,
  onAddCustomToPurchaseCart,
  onUpdatePurchaseCartQty,
  onUpdatePurchaseCartCost,
  onUpdatePurchaseCartMrp,
  onUpdatePurchaseCartBatch,
  onUpdatePurchaseCartItemDetails,
  onRemoveFromPurchaseCart,
  onClearPurchaseCart,
  onCompletePurchaseInvoice,
  editingInvoiceTx,
  onStartEditInvoice,
  onCancelEditInvoice,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  const invoiceBuilderRef = useRef<HTMLDivElement | null>(null);
  const saleCustomNameInputRef = useRef<HTMLInputElement | null>(null);
  const saleCustomPriceInputRef = useRef<HTMLInputElement | null>(null);
  const purCustomNameInputRef = useRef<HTMLInputElement | null>(null);
  const purCustomCostInputRef = useRef<HTMLInputElement | null>(null);

  const [entryTab, setEntryTab] = useState<'sale_pos' | 'purchase_entry'>('sale_pos');
  const [medSearch, setMedSearch] = useState('');

  // Custom Product Entry states for Sales Bill (কাস্টম প্রডাক্ট, দাম, পরিমাণ দিয়ে বিক্রয় বিল)
  const [saleCustomName, setSaleCustomName] = useState('');
  const [saleCustomForm, setSaleCustomForm] = useState('Tablet');
  const [saleCustomStrength, setSaleCustomStrength] = useState('');
  const [saleCustomUnitPrice, setSaleCustomUnitPrice] = useState('');
  const [saleCustomPurPrice, setSaleCustomPurPrice] = useState('');
  const [saleCustomQty, setSaleCustomQty] = useState('1');
  const [saleCustomSaveCatalog, setSaleCustomSaveCatalog] = useState(true);

  // Custom Product Entry states for Purchase Bill (কাস্টম প্রডাক্ট, দাম, পরিমাণ দিয়ে ক্রয় বিল)
  const [purCustomName, setPurCustomName] = useState('');
  const [purCustomForm, setPurCustomForm] = useState('Tablet');
  const [purCustomStrength, setPurCustomStrength] = useState('');
  const [purCustomCostPrice, setPurCustomCostPrice] = useState('');
  const [purCustomMrpPrice, setPurCustomMrpPrice] = useState('');
  const [purCustomQty, setPurCustomQty] = useState('10');
  const [purCustomBatchNo, setPurCustomBatchNo] = useState('');
  const [purCustomSaveCatalog, setPurCustomSaveCatalog] = useState(true);

  // Sale checkout states (বিক্রয় ইনভয়েস — স্টক কমবে)
  const [saleInvoiceNo, setSaleInvoiceNo] = useState<string>(() => makeFreshSaleInvoiceNo());
  const [saleDateStr, setSaleDateStr] = useState<string>(() => getTodayDateStr());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [walkInName, setWalkInName] = useState('সাধারণ ক্রেতা (Walk-in)');
  const [walkInPhone, setWalkInPhone] = useState('N/A');
  const [discountStr, setDiscountStr] = useState('0');
  const [paidAmountStr, setPaidAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<Transaction['paymentMethod']>('cash');
  const [syncModifiedPrices, setSyncModifiedPrices] = useState<boolean>(true);
  const [submittingSale, setSubmittingSale] = useState(false);

  // Purchase Invoice states (ক্রয় ইনভয়েস — স্টক বাড়বে)
  const [purMedSearch, setPurMedSearch] = useState<string>('');
  const [supplierCompany, setSupplierCompany] = useState<string>(BD_PHARMA_COMPANIES[0]);
  const [purCompanySearch, setPurCompanySearch] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('কোম্পানি ডিপো / প্রতিনিধি');
  const [purInvoiceNo, setPurInvoiceNo] = useState(() => makeFreshPurchaseInvoiceNo());
  const [purDateStr, setPurDateStr] = useState<string>(() => getTodayDateStr());
  const [purDiscountStr, setPurDiscountStr] = useState('0');
  const [purPaidStr, setPurPaidStr] = useState('');
  const [purPaymentMethod, setPurPaymentMethod] = useState<Transaction['paymentMethod']>('cash');
  const [syncPurPricesToCatalog, setSyncPurPricesToCatalog] = useState<boolean>(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // Daily Cashbook Filter states
  const [dateFilter, setDateFilter] = useState<string>(getTodayDateStr());
  const [showAllDates, setShowAllDates] = useState<boolean>(true);
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'sale' | 'purchase' | 'due_payment'>(
    'ALL'
  );
  const [staffRoleFilter, setStaffRoleFilter] = useState<'ALL' | 'owner' | 'staff'>('ALL');
  const [previewInvoice, setPreviewInvoice] = useState<Transaction | null>(null);

  // Edit Due Payment Modal states (only used for due_payment entries; sale & purchase invoices use the full New-Invoice Builder)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDateStr, setEditDateStr] = useState('');
  const [editPartyName, setEditPartyName] = useState('');
  const [editPartyPhone, setEditPartyPhone] = useState('');
  const [editItemsSummary, setEditItemsSummary] = useState('');
  const [editSubTotal, setEditSubTotal] = useState('0');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editPaidAmount, setEditPaidAmount] = useState('0');
  const [editPaymentMethod, setEditPaymentMethod] = useState<Transaction['paymentMethod']>('cash');
  const [savingEditTx, setSavingEditTx] = useState(false);

  const isEditingSale = editingInvoiceTx?.txType === 'sale';
  const isEditingPurchase = editingInvoiceTx?.txType === 'purchase';

  // When an invoice is selected for editing, load all its fields into the full New-Invoice Builder and scroll to it
  useEffect(() => {
    if (!editingInvoiceTx) return;

    if (editingInvoiceTx.txType === 'sale') {
      setEntryTab('sale_pos');
      setSaleInvoiceNo(editingInvoiceTx.invoiceNo);
      setSaleDateStr(editingInvoiceTx.dateStr);

      const matchedCust = customers.find(
        (c) =>
          c.id === editingInvoiceTx.partyId ||
          c.name.trim().toLowerCase() === editingInvoiceTx.partyName.trim().toLowerCase()
      );
      if (matchedCust && editingInvoiceTx.partyId !== 'walk-in') {
        setSelectedCustomerId(matchedCust.id);
      } else {
        setSelectedCustomerId('walk-in');
        setWalkInName(editingInvoiceTx.partyName);
        setWalkInPhone(editingInvoiceTx.partyPhone);
      }
      setDiscountStr(String(editingInvoiceTx.discount));
      setPaidAmountStr(String(editingInvoiceTx.paidAmount));
      setPaymentMethod(editingInvoiceTx.paymentMethod);
    } else if (editingInvoiceTx.txType === 'purchase') {
      setEntryTab('purchase_entry');
      setPurInvoiceNo(editingInvoiceTx.invoiceNo);
      setPurDateStr(editingInvoiceTx.dateStr);
      const cleanComp =
        editingInvoiceTx.partyName.replace(/\s*\(ডিপো চালান\)\s*$/, '').trim() ||
        BD_PHARMA_COMPANIES[0];
      setSupplierCompany(cleanComp);
      setSupplierPhone(editingInvoiceTx.partyPhone);
      setPurDiscountStr(String(editingInvoiceTx.discount));
      setPurPaidStr(String(editingInvoiceTx.paidAmount));
      setPurPaymentMethod(editingInvoiceTx.paymentMethod);
    }

    const timer = setTimeout(() => {
      invoiceBuilderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(timer);
  }, [editingInvoiceTx, customers]);

  // Map of original quantities in the invoice currently being edited, so live stock preview is 100% accurate
  const editedOldQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingInvoiceTx) return map;
    const parsed = parseTransactionItemsDetailed(editingInvoiceTx.itemsSummary, catalog);
    for (const p of parsed) {
      if (p.matchedMedicine?.id) {
        map.set(p.matchedMedicine.id, (map.get(p.matchedMedicine.id) || 0) + p.qty);
      }
      const keyByName = p.brandAndStrength.trim().toLowerCase();
      map.set(keyByName, (map.get(keyByName) || 0) + p.qty);
    }
    return map;
  }, [editingInvoiceTx, catalog]);

  const getOldEditedQtyForMed = (med: {
    id?: string;
    medicineId?: string;
    brandName: string;
    strength: string;
  }): number => {
    if (!editingInvoiceTx) return 0;
    const idKey = med.medicineId || med.id;
    if (idKey && editedOldQtyMap.has(idKey)) {
      return editedOldQtyMap.get(idKey) || 0;
    }
    const nameKey = `${med.brandName} ${med.strength}`.trim().toLowerCase();
    return editedOldQtyMap.get(nameKey) || 0;
  };

  const getStockForMed = (med: {
    id?: string;
    medicineId?: string;
    brandName: string;
    strength: string;
    dosageForm: string;
  }) => {
    return getInventoryStockForMedicine(inventory, {
      ...med,
      id: med.id || med.medicineId || '',
    });
  };

  const quickSearchSaleMedicines = useMemo(() => {
    const q = medSearch.trim();
    if (!q) return catalog.slice(0, 16);
    return searchAndRankMedicines(catalog, q, 24);
  }, [catalog, medSearch]);

  const quickSearchPurchaseMedicines = useMemo(() => {
    const q = purMedSearch.trim();
    if (!q) return catalog.slice(0, 16);
    return searchAndRankMedicines(catalog, q, 24);
  }, [catalog, purMedSearch]);

  const filteredPurchaseCompanies = useMemo(() => {
    const q = purCompanySearch.trim().toLowerCase();
    const baseList =
      supplierCompany && !BD_PHARMA_COMPANIES.includes(supplierCompany)
        ? [supplierCompany, ...BD_PHARMA_COMPANIES]
        : BD_PHARMA_COMPANIES;
    if (!q) return baseList;
    const matches = baseList.filter((c) => c.toLowerCase().includes(q));
    return matches.length > 0 ? matches : baseList;
  }, [purCompanySearch, supplierCompany]);

  // Sale calculations
  const cartSubTotal = useMemo(() => {
    return posCart.reduce((acc, item) => acc + item.unitPrice * item.qty, 0);
  }, [posCart]);

  const totalSaleUnits = useMemo(() => {
    return posCart.reduce((acc, item) => acc + item.qty, 0);
  }, [posCart]);

  const getMedPurchasePrice = (med: MedicineCatalogItem): number => {
    if (typeof med.purchasePrice === 'number' && med.purchasePrice > 0) {
      return med.purchasePrice;
    }
    return Number((med.unitPrice * 0.88).toFixed(2));
  };

  const hasModifiedCartPrice = useMemo(() => {
    return posCart.some(
      (item) =>
        (item.originalUnitPrice !== undefined &&
          Math.abs(item.unitPrice - item.originalUnitPrice) > 0.001) ||
        (item.originalPurchasePrice !== undefined &&
          item.purchasePrice !== undefined &&
          Math.abs(item.purchasePrice - item.originalPurchasePrice) > 0.001)
    );
  }, [posCart]);

  const discountVal = Math.max(0, parseFloat(discountStr) || 0);
  const grandTotal = Math.max(0, cartSubTotal - discountVal);

  const effectivePaidAmount =
    paidAmountStr.trim() === ''
      ? grandTotal
      : Math.max(0, Math.min(grandTotal, parseFloat(paidAmountStr) || 0));

  const dueAmount = Math.max(0, grandTotal - effectivePaidAmount);

  // Purchase Invoice calculations
  const purchaseSubTotal = useMemo(() => {
    return purchaseCart.reduce((acc, item) => acc + item.purchasePrice * item.qty, 0);
  }, [purchaseCart]);

  const totalPurchaseUnits = useMemo(() => {
    return purchaseCart.reduce((acc, item) => acc + item.qty, 0);
  }, [purchaseCart]);

  const purDiscountVal = Math.max(0, parseFloat(purDiscountStr) || 0);
  const purGrandTotal = Math.max(0, purchaseSubTotal - purDiscountVal);

  const effectivePurPaidAmount =
    purPaidStr.trim() === ''
      ? purGrandTotal
      : Math.max(0, Math.min(purGrandTotal, parseFloat(purPaidStr) || 0));

  const purDueAmount = Math.max(0, purGrandTotal - effectivePurPaidAmount);

  const formatOperatorDisplay = (staff: StaffMember) => {
    return staff.roleTitle === 'owner' ? 'Owner' : staff.name;
  };

  const resetSaleFormToFresh = () => {
    setSaleInvoiceNo(makeFreshSaleInvoiceNo());
    setSaleDateStr(getTodayDateStr());
    setSelectedCustomerId('walk-in');
    setWalkInName('সাধারণ ক্রেতা (Walk-in)');
    setWalkInPhone('N/A');
    setDiscountStr('0');
    setPaidAmountStr('');
    setPaymentMethod('cash');
  };

  const resetPurchaseFormToFresh = () => {
    setPurInvoiceNo(makeFreshPurchaseInvoiceNo());
    setPurDateStr(getTodayDateStr());
    setPurDiscountStr('0');
    setPurPaidStr('');
    setPurPaymentMethod('cash');
  };

  const submitSaleWithMode = async (asBrandNewInvoice: boolean) => {
    if (posCart.length === 0) return;
    setSubmittingSale(true);
    try {
      let cName = walkInName.trim() || 'সাধারণ ক্রেতা (Walk-in)';
      let cPhone = walkInPhone.trim() || 'N/A';
      if (selectedCustomerId !== 'walk-in') {
        const cust = customers.find((c) => c.id === selectedCustomerId);
        if (cust) {
          cName = cust.name;
          cPhone = cust.phone;
        }
      }
      const targetInvoiceNo =
        asBrandNewInvoice && isEditingSale && saleInvoiceNo === editingInvoiceTx?.invoiceNo
          ? makeFreshSaleInvoiceNo()
          : saleInvoiceNo.trim() || makeFreshSaleInvoiceNo();

      const createdTx = await onCompleteSale({
        customerId: selectedCustomerId,
        customerName: cName,
        customerPhone: cPhone,
        discount: discountVal,
        paidAmount: effectivePaidAmount,
        paymentMethod: dueAmount > 0 && effectivePaidAmount === 0 ? 'due' : paymentMethod,
        syncModifiedPricesToCatalog: syncModifiedPrices,
        invoiceNo: targetInvoiceNo,
        dateStr: saleDateStr.trim() || getTodayDateStr(),
        editingTxId: !asBrandNewInvoice && isEditingSale ? editingInvoiceTx?.id : undefined,
      });
      resetSaleFormToFresh();
      if (createdTx) {
        setPreviewInvoice(createdTx);
      }
    } finally {
      setSubmittingSale(false);
    }
  };

  // Complete Sale Invoice (Stock decreases)
  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSaleWithMode(false);
  };

  const submitPurchaseWithMode = async (asBrandNewInvoice: boolean) => {
    if (purchaseCart.length === 0) return;
    setSubmittingPurchase(true);
    try {
      const targetPurInvNo =
        asBrandNewInvoice && isEditingPurchase && purInvoiceNo === editingInvoiceTx?.invoiceNo
          ? makeFreshPurchaseInvoiceNo()
          : purInvoiceNo.trim() || makeFreshPurchaseInvoiceNo();

      const createdTx = await onCompletePurchaseInvoice({
        supplierCompany: supplierCompany.trim() || BD_PHARMA_COMPANIES[0],
        supplierPhone: supplierPhone.trim() || 'কোম্পানি ডিপো',
        invoiceNo: targetPurInvNo,
        discount: purDiscountVal,
        paidAmount: effectivePurPaidAmount,
        paymentMethod:
          purDueAmount > 0 && effectivePurPaidAmount === 0 ? 'due' : purPaymentMethod,
        dateStr: purDateStr.trim() || getTodayDateStr(),
        editingTxId: !asBrandNewInvoice && isEditingPurchase ? editingInvoiceTx?.id : undefined,
        syncModifiedPricesToCatalog: syncPurPricesToCatalog,
      });
      resetPurchaseFormToFresh();
      if (createdTx) {
        setPreviewInvoice(createdTx);
      }
    } finally {
      setSubmittingPurchase(false);
    }
  };

  // Complete Purchase Invoice (Stock increases)
  const handlePurchaseInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPurchaseWithMode(false);
  };

  const handleEditInvoiceAction = (tx: Transaction) => {
    setPreviewInvoice(null);
    if (tx.txType === 'sale' || tx.txType === 'purchase') {
      // Load directly into the full New-Invoice Creation Builder (নতুন ইনভয়েস তৈরী করার প্রক্রিয়া)
      onStartEditInvoice(tx);
      return;
    }
    setEditingTx(tx);
    setEditDateStr(tx.dateStr);
    setEditPartyName(tx.partyName);
    setEditPartyPhone(tx.partyPhone);
    setEditItemsSummary(formatTransactionItemsText(tx.itemsSummary));
    setEditSubTotal(String(tx.subTotal));
    setEditDiscount(String(tx.discount));
    setEditPaidAmount(String(tx.paidAmount));
    setEditPaymentMethod(tx.paymentMethod);
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setSavingEditTx(true);
    try {
      const sub = Math.max(0, parseFloat(editSubTotal) || 0);
      const disc = Math.max(0, Math.min(sub, parseFloat(editDiscount) || 0));
      const grand = Math.max(0, sub - disc);
      const paid = Math.max(0, Math.min(grand, parseFloat(editPaidAmount) || 0));
      const due = Math.max(0, grand - paid);

      await onEditTransaction(editingTx.id, {
        dateStr: editDateStr.trim() || editingTx.dateStr,
        partyName: editPartyName.trim() || editingTx.partyName,
        partyPhone: editPartyPhone.trim() || editingTx.partyPhone,
        itemsSummary: editItemsSummary.trim() || editingTx.itemsSummary,
        subTotal: sub,
        discount: disc,
        grandTotal: grand,
        paidAmount: paid,
        dueAmount: due,
        paymentMethod: editPaymentMethod,
      });
      setEditingTx(null);
    } finally {
      setSavingEditTx(false);
    }
  };

  // Filtered Daily Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!showAllDates && tx.dateStr !== dateFilter) return false;
      if (txTypeFilter !== 'ALL' && tx.txType !== txTypeFilter) return false;
      if (staffRoleFilter !== 'ALL' && tx.staffRole !== staffRoleFilter) return false;
      return true;
    });
  }, [transactions, dateFilter, showAllDates, txTypeFilter, staffRoleFilter]);

  // Daily Accounting Summary Metrics
  const dailyMetrics = useMemo(() => {
    let totalSalesBill = 0;
    let salesCashCollected = 0;
    let salesDueGiven = 0;
    let dueCollectedLater = 0;
    let totalPurchaseBill = 0;
    let ownerSales = 0;
    let staffSales = 0;

    for (const tx of filteredTransactions) {
      if (tx.txType === 'sale') {
        totalSalesBill += tx.grandTotal;
        salesCashCollected += tx.paidAmount;
        salesDueGiven += tx.dueAmount;
        if (tx.staffRole === 'owner') ownerSales += tx.grandTotal;
        else staffSales += tx.grandTotal;
      } else if (tx.txType === 'due_payment') {
        dueCollectedLater += tx.paidAmount;
      } else if (tx.txType === 'purchase') {
        totalPurchaseBill += tx.grandTotal;
      }
    }

    const totalCashIn = salesCashCollected + dueCollectedLater;
    const netCashDrawer = totalCashIn - totalPurchaseBill;

    return {
      totalSalesBill,
      salesCashCollected,
      salesDueGiven,
      dueCollectedLater,
      totalPurchaseBill,
      totalCashIn,
      netCashDrawer,
      ownerSales,
      staffSales,
    };
  }, [filteredTransactions]);

  const parsedPreviewItems = useMemo(() => {
    if (!previewInvoice) return [];
    return parseTransactionItemsDetailed(previewInvoice.itemsSummary);
  }, [previewInvoice]);

  return (
    <div className="space-y-6">
      {/* Active Owner / Staff Entry Identity Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">
              বর্তমান ক্রয় ও বিক্রয় ইনভয়েস অপারেটর (মালিকের নাম &ldquo;Owner&rdquo; এবং স্টাফদের নির্দিষ্ট নাম প্রদর্শিত)
            </div>
            <div className="text-sm font-bold text-slate-900">
              অপারেটর নাম:{' '}
              <span className="text-teal-700 font-bold">
                {formatOperatorDisplay(activeStaff)}
              </span>{' '}
              · {activeStaff.counterName}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">অপারেটর পরিবর্তন:</span>
          {staffList.map((st) => {
            const isSelected = st.id === activeStaff.id;
            const label = st.roleTitle === 'owner' ? 'Owner' : st.name;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectActiveStaff(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two Distinct Invoice Modes: 1. Sales Invoice (Decreases Stock) | 2. Purchase Invoice (Increases Stock) */}
      <div
        ref={invoiceBuilderRef}
        className={`bg-white border rounded-lg overflow-hidden transition-colors no-print ${
          editingInvoiceTx
            ? 'border-amber-500 ring-2 ring-amber-200/80'
            : 'border-slate-200'
        }`}
      >
        {/* Active Invoice Edit Mode Banner (Uses the exact same New-Invoice Creation Process) */}
        {editingInvoiceTx && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-amber-950">
                <Edit3 className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  ইনভয়েস এডিট মোড সক্রিয় (নতুন ইনভয়েস তৈরির প্রক্রিয়ায় এডিট হচ্ছে):{' '}
                  <span className="font-mono underline">{editingInvoiceTx.invoiceNo}</span>
                </span>
                <span className="text-amber-800 font-semibold">
                  · {editingInvoiceTx.txType === 'sale' ? 'বিক্রয় ইনভয়েস' : 'ক্রয় ইনভয়েস'} ·{' '}
                  {editingInvoiceTx.partyName}
                </span>
              </div>
              <p className="text-xs text-amber-900">
                নতুন ইনভয়েস তৈরির মতোই বাম পাশ থেকে যেকোনো নতুন ওষুধ যোগ করুন, ডান পাশে পরিমাণ (+ / -), ক্রয় মূল্য ও বিক্রয় মূল্য পরিবর্তন বা ওষুধ ডিলিট করুন এবং নিচে ইনভয়েস সম্পন্ন করুন।
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onCancelEditInvoice();
                resetSaleFormToFresh();
                resetPurchaseFormToFresh();
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              এডিট বাতিল করে নতুন মেমো শুরু করুন ✕
            </button>
          </div>
        )}

        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-2 bg-slate-200/80 p-1 rounded-md">
            <button
              type="button"
              onClick={() => setEntryTab('sale_pos')}
              className={`px-4 py-2 text-xs font-bold rounded transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                entryTab === 'sale_pos'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>
                {isEditingSale
                  ? `১. বিক্রয় ইনভয়েস এডিট হচ্ছে (${editingInvoiceTx?.invoiceNo})`
                  : '১. প্রডাক্ট বিক্রয় ইনভয়েস — স্টক কমবে (Sales Invoice)'}
              </span>
              {posCart.length > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded ${
                    entryTab === 'sale_pos'
                      ? 'bg-teal-900 text-white'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {posCart.length} আইটেম (-{totalSaleUnits})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setEntryTab('purchase_entry')}
              className={`px-4 py-2 text-xs font-bold rounded transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                entryTab === 'purchase_entry'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>
                {isEditingPurchase
                  ? `২. ক্রয় ইনভয়েস এডিট হচ্ছে (${editingInvoiceTx?.invoiceNo})`
                  : '২. প্রডাক্ট ক্রয় ইনভয়েস — স্টক বাড়বে (Purchase Invoice)'}
              </span>
              {purchaseCart.length > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded ${
                    entryTab === 'purchase_entry'
                      ? 'bg-indigo-900 text-white'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {purchaseCart.length} আইটেম (+{totalPurchaseUnits})
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {entryTab === 'sale_pos' ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-md">
                <PackageMinus className="w-3.5 h-3.5 text-teal-700" />
                {isEditingSale
                  ? 'বিক্রয় ইনভয়েস এডিট: সংরক্ষণ করলে পূর্বের স্টক সমন্বয় হয়ে নতুন স্টক কমবে'
                  : 'বিক্রয় মোড: ইনভয়েস সম্পন্ন করলে স্টক স্বয়ংক্রিয়ভাবে কমবে'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-md">
                <PackageCheck className="w-3.5 h-3.5 text-indigo-700" />
                {isEditingPurchase
                  ? 'ক্রয় ইনভয়েস এডিট: সংরক্ষণ করলে পূর্বের স্টক সমন্বয় হয়ে নতুন স্টক বাড়বে'
                  : 'ক্রয় মোড: ইনভয়েস সম্পন্ন করলে স্টক স্বয়ংক্রিয়ভাবে বাড়বে'}
              </span>
            )}
          </div>
        </div>

        {entryTab === 'sale_pos' ? (
          /* ============================================================================
             MODE 1: PRODUCT SALES INVOICE (বিক্রয় ইনভয়েস — বিক্রয় করলে স্টক কমবে)
             ============================================================================ */
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left 5 Cols: Custom Product Entry + Quick Medicine Picker for Sale */}
            <div className="lg:col-span-5 p-5 space-y-4">
              {/* Custom Product Quick Builder for Sales Bill */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = saleCustomName.trim();
                  if (!name) {
                    saleCustomNameInputRef.current?.focus();
                    return;
                  }
                  const unitPrice = Math.max(0.1, parseFloat(saleCustomUnitPrice) || 10);
                  const purchasePrice =
                    saleCustomPurPrice.trim() !== ''
                      ? Math.max(0.01, parseFloat(saleCustomPurPrice) || Number((unitPrice * 0.88).toFixed(2)))
                      : Number((unitPrice * 0.88).toFixed(2));
                  const qty = Math.max(1, parseInt(saleCustomQty, 10) || 1);

                  await onAddCustomToCart({
                    brandName: name,
                    strength: saleCustomStrength.trim(),
                    dosageForm: saleCustomForm,
                    unitPrice,
                    purchasePrice,
                    qty,
                    saveToCatalog: saleCustomSaveCatalog,
                  });

                  setSaleCustomName('');
                  setSaleCustomStrength('');
                  setSaleCustomUnitPrice('');
                  setSaleCustomPurPrice('');
                  setSaleCustomQty('1');
                }}
                className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-md space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-teal-950 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-teal-700" />
                      <span>কাস্টম প্রডাক্ট, দাম ও পরিমাণ দিয়ে বিক্রয় বিল তৈরি</span>
                    </div>
                    <p className="text-[11px] text-teal-800">
                      লিস্টে না থাকা যেকোনো ওষুধ বা কাস্টম পণ্যের নাম, দাম ও পরিমাণ লিখে সরাসরি বিক্রয় বিলে যুক্ত করুন
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      প্রডাক্ট / ওষুধের নাম *
                    </label>
                    <input
                      ref={saleCustomNameInputRef}
                      type="text"
                      required
                      value={saleCustomName}
                      onChange={(e) => setSaleCustomName(e.target.value)}
                      placeholder="যেমন: কাস্টম ওষুধ / সার্জিক্যাল..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      ধরন / ফর্ম
                    </label>
                    <select
                      value={saleCustomForm}
                      onChange={(e) => setSaleCustomForm(e.target.value)}
                      aria-label="কাস্টম প্রডাক্টের ধরন"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                    >
                      {CUSTOM_PRODUCT_FORMS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      শক্তি / সাইজ
                    </label>
                    <input
                      type="text"
                      value={saleCustomStrength}
                      onChange={(e) => setSaleCustomStrength(e.target.value)}
                      placeholder="500mg / 100ml"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      বিক্রয় দর (৳) *
                    </label>
                    <input
                      ref={saleCustomPriceInputRef}
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={saleCustomUnitPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSaleCustomUnitPrice(val);
                        const num = parseFloat(val);
                        if (Number.isFinite(num) && num > 0) {
                          setSaleCustomPurPrice(String(Number((num * 0.88).toFixed(2))));
                        }
                      }}
                      placeholder="10.00"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      ক্রয় দর (৳)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={saleCustomPurPrice}
                      onChange={(e) => setSaleCustomPurPrice(e.target.value)}
                      placeholder="8.80 (88%)"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      বিক্রয় পরিমাণ (পিস) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={saleCustomQty}
                      onChange={(e) => setSaleCustomQty(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-teal-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saleCustomSaveCatalog}
                      onChange={(e) => setSaleCustomSaveCatalog(e.target.checked)}
                      className="rounded border-teal-400 text-teal-700"
                    />
                    <span>ক্যাটালগ ও স্টকেও সংরক্ষণ করুন</span>
                  </label>

                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ বিক্রয় বিলে কাস্টম প্রডাক্ট যুক্ত করুন</span>
                  </button>
                </div>
              </form>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    অথবা ক্যাটালগ ও স্টক থেকে ওষুধ নির্বাচন করুন
                  </h3>
                  <p className="text-xs text-slate-500">
                    ওষুধ সিলেক্ট করলে বিক্রয় ইনভয়েসে যুক্ত হবে এবং বিক্রয় শেষে স্টক কমে যাবে
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={medSearch}
                    onChange={(e) => setMedSearch(e.target.value)}
                    placeholder="ওষুধের নাম লিখে সার্চ করুন (যেমন: Napa, Seclo, Noret, Femicom)..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>
                {medSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setSaleCustomName(medSearch.trim());
                      saleCustomPriceInputRef.current?.focus();
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded flex items-center justify-between cursor-pointer"
                  >
                    <span>
                      &ldquo;{medSearch.trim()}&rdquo; কাস্টম প্রডাক্ট হিসেবে দাম ও পরিমাণ বসিয়ে বিক্রয় বিলে যুক্ত করুন
                    </span>
                    <span className="font-bold text-teal-700">+ কাস্টম যোগ →</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {quickSearchSaleMedicines.map((med) => {
                  const st = getStockForMed(med);
                  const inCart = posCart.find((c) => c.medicineId === med.id)?.qty || 0;
                  const afterSaleStock = Math.max(0, st - inCart);
                  const purPrice = getMedPurchasePrice(med);
                  return (
                    <div
                      key={med.id}
                      className="p-3 border border-slate-200 rounded-md hover:border-teal-600 transition-colors flex flex-col justify-between gap-2 bg-white"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-900">
                            {med.brandName}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              {med.strength}
                            </span>
                          </span>
                          <span className="font-mono tabular-nums text-xs font-bold text-teal-700">
                            বিক্রয়: ৳{formatCleanMoney(med.unitPrice)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center justify-between">
                          <span>{med.genericName} · {med.dosageForm}</span>
                          <span className="font-mono text-[11px] font-semibold text-indigo-700">
                            ক্রয়: ৳{formatCleanMoney(purPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-xs font-mono tabular-nums">
                          {st > 0 ? (
                            <span className="text-slate-700 font-semibold">
                              স্টক: {st} পিস
                              {inCart > 0 && (
                                <span className="text-amber-700 ml-1">
                                  (থাকবে {afterSaleStock})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-red-600 font-medium">স্টক: ০ পিস</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onAddToCart(med, 1)}
                            className="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded cursor-pointer"
                          >
                            +১ পিস
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddToCart(med, med.unitsPerStrip || 10)}
                            className="px-2 py-1 text-xs font-medium bg-teal-700 hover:bg-teal-800 text-white rounded cursor-pointer"
                          >
                            +১ পাতা ({med.unitsPerStrip || 10})
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 7 Cols: Active Sales Invoice Memo with Stock Decrease Indicator */}
            <div className="lg:col-span-7 p-5 bg-slate-50/40 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-teal-900">
                        ১. প্রডাক্ট বিক্রয় ইনভয়েস ও ক্যাশ মেমো (Sales Invoice — স্টক কমবে)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      অপারেটর: <strong>{formatOperatorDisplay(activeStaff)}</strong> · মেমো টেবিলে প্রডাক্টের নাম, ধরন, শক্তি, ক্রয় দর, বিক্রয় দর ও পরিমাণ সরাসরি পরিবর্তন করা যাবে
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onAddCustomToCart({
                          brandName: 'কাস্টম প্রডাক্ট',
                          strength: '',
                          dosageForm: 'Tablet',
                          unitPrice: 10,
                          purchasePrice: 8.8,
                          qty: 1,
                          saveToCatalog: false,
                        });
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-teal-900 bg-teal-100 hover:bg-teal-200 border border-teal-300 rounded cursor-pointer"
                    >
                      + নতুন কাস্টম লাইন যোগ
                    </button>
                    {posCart.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            posCart.forEach((item) => {
                              onUpdateCartItemDetails(item.medicineId, { updateStock: true });
                            });
                          }}
                          className="px-2 py-0.5 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded cursor-pointer"
                        >
                          সবগুলোতে ✅ স্টক কমবে
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            posCart.forEach((item) => {
                              onUpdateCartItemDetails(item.medicineId, { updateStock: false });
                            });
                          }}
                          className="px-2 py-0.5 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded cursor-pointer"
                        >
                          সবগুলো শুধু ইনভয়েস
                        </button>
                        <button
                          type="button"
                          onClick={onClearCart}
                          className="text-xs text-red-600 hover:underline cursor-pointer ml-1"
                        >
                          মেমো খালি করুন
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sale Cart Items Table */}
                <div className="my-3 max-h-[290px] overflow-y-auto border border-slate-200 rounded-md bg-white">
                  {posCart.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-slate-500 space-y-2">
                      <div>
                        বিক্রয় ইনভয়েসে এখনো কোনো ওষুধ বা কাস্টম প্রডাক্ট যোগ করা হয়নি।
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAddCustomToCart({
                            brandName: 'কাস্টম প্রডাক্ট',
                            strength: '',
                            dosageForm: 'Tablet',
                            unitPrice: 10,
                            purchasePrice: 8.8,
                            qty: 1,
                            saveToCatalog: false,
                          });
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded cursor-pointer"
                      >
                        + সরাসরি কাস্টম প্রডাক্ট লাইন যোগ করুন
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-teal-50/70 border-b border-slate-200 text-xs font-semibold text-slate-700">
                        <tr>
                          <th className="py-2 px-3">প্রডাক্ট / ওষুধের নাম, ধরন ও স্টক হ্রাস</th>
                          <th className="py-2 px-1.5 text-center">ক্রয় দর (৳)</th>
                          <th className="py-2 px-1.5 text-center">বিক্রয় দর (৳)</th>
                          <th className="py-2 px-2 text-center">বিক্রয় পরিমাণ (পিস)</th>
                          <th className="py-2 px-3 text-right">মোট (৳)</th>
                          <th className="py-2 px-2 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {posCart.map((item, idx) => {
                          const priceChanged =
                            item.originalUnitPrice !== undefined &&
                            Math.abs(item.unitPrice - item.originalUnitPrice) > 0.001;
                          const purPriceVal =
                            typeof item.purchasePrice === 'number' && item.purchasePrice > 0
                              ? item.purchasePrice
                              : Number((item.unitPrice * 0.88).toFixed(2));
                          const purPriceChanged =
                            item.originalPurchasePrice !== undefined &&
                            Math.abs(purPriceVal - item.originalPurchasePrice) > 0.001;
                          const lineTotal = item.unitPrice * item.qty;
                          const rawCurrentStock = getStockForMed(item);
                          const oldEditedQty = isEditingSale ? getOldEditedQtyForMed(item) : 0;
                          const currentStock = rawCurrentStock + oldEditedQty;
                          const remainingStock = Math.max(0, currentStock - item.qty);
                          return (
                            <tr key={item.medicineId}>
                              <td className="py-2 px-3">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="font-mono text-xs font-bold text-slate-500">
                                    {idx + 1}.
                                  </span>
                                  <select
                                    value={item.dosageForm || 'Tablet'}
                                    onChange={(e) =>
                                      onUpdateCartItemDetails(item.medicineId, {
                                        dosageForm: e.target.value,
                                      })
                                    }
                                    aria-label="প্রডাক্ট ফর্ম"
                                    className="px-1 py-0.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded text-slate-700"
                                  >
                                    {CUSTOM_PRODUCT_FORMS.map((f) => (
                                      <option key={f.value} value={f.value}>
                                        {getInvoiceFormPrefix(f.value)}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={item.brandName}
                                    onChange={(e) =>
                                      onUpdateCartItemDetails(item.medicineId, {
                                        brandName: e.target.value,
                                      })
                                    }
                                    placeholder="প্রডাক্টের নাম"
                                    aria-label="প্রডাক্টের নাম"
                                    className="w-32 sm:w-36 px-1.5 py-0.5 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    value={item.strength}
                                    onChange={(e) =>
                                      onUpdateCartItemDetails(item.medicineId, {
                                        strength: e.target.value,
                                      })
                                    }
                                    placeholder="শক্তি/সাইজ"
                                    aria-label="শক্তি বা সাইজ"
                                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded focus:border-teal-600 focus:outline-none"
                                  />
                                </div>
                                <div className="text-[11px] font-mono text-teal-800 mt-1">
                                  (৳{formatCleanMoney(item.unitPrice)}) × {item.qty}=
                                  {formatCleanMoney(lineTotal)}
                                  {priceChanged && (
                                    <span className="ml-1.5 text-amber-700 font-sans font-semibold">
                                      (পূর্বের বিক্রয় দর: ৳{item.originalUnitPrice?.toFixed(2)})
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <label
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border select-none cursor-pointer transition-colors ${
                                      item.updateStock !== false
                                        ? 'bg-teal-50 border-teal-300 text-teal-900 hover:bg-teal-100 font-semibold'
                                        : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 font-medium'
                                    }`}
                                    title={
                                      item.updateStock !== false
                                        ? 'স্টক থেকে কমবে (টিক চিহ্ন তুলে দিলে স্টক পরিবর্তন হবে না, শুধু ইনভয়েস তৈরি হবে)'
                                        : 'স্টকে পরিবর্তন হবে না (শুধু ইনভয়েস তৈরি হবে)'
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={item.updateStock !== false}
                                      onChange={(e) =>
                                        onUpdateCartItemDetails(item.medicineId, {
                                          updateStock: e.target.checked,
                                        })
                                      }
                                      className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                    />
                                    <span className="text-[11px]">
                                      {item.updateStock !== false
                                        ? '✅ স্টক থেকে কমবে'
                                        : '❌ স্টকে কমবে না (শুধু ইনভয়েস)'}
                                    </span>
                                  </label>
                                </div>

                                {item.updateStock !== false ? (
                                  <div className="text-[11px] font-mono text-amber-800 mt-0.5 flex items-center gap-1">
                                    <ArrowDownRight className="w-3 h-3 text-amber-700 shrink-0" />
                                    <span>
                                      স্টক কমবে: বর্তমান {currentStock} পিস → বিক্রয়ের পর{' '}
                                      <strong>{remainingStock} পিস</strong> (-{item.qty})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-[11px] font-mono text-amber-800 mt-0.5 flex items-center gap-1">
                                    <Info className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>
                                      স্টক অপরিবর্তিত থাকবে (বর্তমান {currentStock} পিস) · শুধু ইনভয়েসে যুক্ত থাকবে
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Editable Purchase Price Input */}
                              <td className="py-2 px-1.5 text-center">
                                <div className="inline-flex items-center">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    aria-label={`${item.brandName} ক্রয় মূল্য`}
                                    value={purPriceVal}
                                    onChange={(e) =>
                                      onUpdateCartPurchasePrice(
                                        item.medicineId,
                                        Math.max(0, parseFloat(e.target.value) || 0)
                                      )
                                    }
                                    className={`w-18 text-center py-1 px-1 text-xs font-mono tabular-nums border rounded focus:outline-none ${
                                      purPriceChanged
                                        ? 'border-indigo-500 bg-indigo-50/60 font-bold text-indigo-900'
                                        : 'border-slate-200 bg-white text-indigo-900'
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* Editable Selling Unit Price Input */}
                              <td className="py-2 px-1.5 text-center">
                                <div className="inline-flex items-center">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    aria-label={`${item.brandName} বিক্রয় মূল্য`}
                                    value={item.unitPrice}
                                    onChange={(e) =>
                                      onUpdateCartUnitPrice(
                                        item.medicineId,
                                        Math.max(0, parseFloat(e.target.value) || 0)
                                      )
                                    }
                                    className={`w-18 text-center py-1 px-1 text-xs font-mono tabular-nums border rounded focus:outline-none ${
                                      priceChanged
                                        ? 'border-amber-500 bg-amber-50/60 font-bold text-slate-900'
                                        : 'border-slate-200 bg-white text-slate-900'
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* Quantity Controls */}
                              <td className="py-2 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateCartQty(item.medicineId, Math.max(1, item.qty - 1))
                                    }
                                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.qty}
                                    onChange={(e) =>
                                      onUpdateCartQty(
                                        item.medicineId,
                                        Math.max(1, parseInt(e.target.value, 10) || 1)
                                      )
                                    }
                                    className="w-14 text-center py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => onUpdateCartQty(item.medicineId, item.qty + 1)}
                                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>

                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {formatCleanMoney(lineTotal)}
                              </td>

                              <td className="py-2 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => onRemoveFromCart(item.medicineId)}
                                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {posCart.length > 0 && (
                  <div className="mb-3 p-2.5 bg-white border border-teal-200 rounded-md text-xs font-mono text-slate-800 space-y-0.5">
                    <div className="text-[11px] font-sans font-semibold text-teal-800 mb-1 flex items-center justify-between">
                      <span>বিক্রয় ইনভয়েস প্রিভিউ (Sales Invoice Lines):</span>
                      <span>মোট স্টক আউট: -{totalSaleUnits} পিস</span>
                    </div>
                    {posCart.map((item, idx) => (
                      <div key={item.medicineId}>{formatCartItemInvoiceLine(item, idx)}</div>
                    ))}
                  </div>
                )}

                {hasModifiedCartPrice && (
                  <label className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncModifiedPrices}
                      onChange={(e) => setSyncModifiedPrices(e.target.checked)}
                      className="rounded border-amber-400 text-teal-700"
                    />
                    <span>
                      ইনভয়েসে পরিবর্তিত ওষুধের নতুন দাম মূল ক্যাটালগ ও ইনভেন্টরিতেও আপডেট করুন এবং স্বয়ংক্রিয় মূল্য অ্যালার্ট পাঠান
                    </span>
                  </label>
                )}
              </div>

              {/* Customer Selection & Sale Payment Form */}
              <form onSubmit={handleSaleSubmit} className="space-y-3 pt-2 border-t border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      কাস্টমার / লেজার খাতা নির্বাচন করুন
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    >
                      <option value="walk-in">সাধারণ ক্রেতা (নগদ / Walk-in)</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone}) — পূর্বের বাকি: ৳{c.totalDue}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      বিক্রয় মেমো নং *
                    </label>
                    <input
                      type="text"
                      required
                      value={saleInvoiceNo}
                      onChange={(e) => setSaleInvoiceNo(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      তারিখ ও পেমেন্ট মাধ্যম
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        required
                        value={saleDateStr}
                        onChange={(e) => setSaleDateStr(e.target.value)}
                        aria-label="বিক্রয় তারিখ"
                        className="w-1/2 px-1.5 py-1.5 text-[11px] font-mono bg-white border border-slate-200 rounded-md"
                      />
                      <select
                        value={paymentMethod}
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as Transaction['paymentMethod'])
                        }
                        aria-label="পেমেন্ট মাধ্যম"
                        className="w-1/2 px-1.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                      >
                        <option value="cash">নগদ (Cash)</option>
                        <option value="bkash">বিকাশ</option>
                        <option value="nagad">নগদ MFS</option>
                        <option value="card">কার্ড</option>
                        <option value="due">বাকি (Due)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {selectedCustomerId === 'walk-in' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                      placeholder="ক্রেতার নাম (ঐচ্ছিক)"
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                    <input
                      type="text"
                      value={walkInPhone}
                      onChange={(e) => setWalkInPhone(e.target.value)}
                      placeholder="মোবাইল নম্বর"
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 bg-white p-3 rounded-md border border-slate-200">
                  <div>
                    <label className="block text-xs text-slate-500">মোট বিক্রয় বিল (৳)</label>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      ৳{cartSubTotal.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">ছাড় / ডিসকাউন্ট (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={discountStr}
                      onChange={(e) => setDiscountStr(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">নগদ জমা (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder={grandTotal.toFixed(0)}
                      value={paidAmountStr}
                      onChange={(e) => setPaidAmountStr(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-xs space-x-3 font-mono tabular-nums">
                    <span className="text-slate-700">
                      নিট প্রদেয়: <strong className="text-slate-900">৳{grandTotal.toFixed(2)}</strong>
                    </span>
                    <span className={dueAmount > 0 ? 'text-red-600 font-bold' : 'text-emerald-700'}>
                      বাকি (Due): ৳{dueAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditingSale && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onCancelEditInvoice();
                            resetSaleFormToFresh();
                          }}
                          className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          এডিট বাতিল
                        </button>
                        <button
                          type="button"
                          disabled={posCart.length === 0 || submittingSale}
                          onClick={() => submitSaleWithMode(true)}
                          className="px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-100 hover:bg-teal-200 border border-teal-300 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          নতুন ইনভয়েস হিসেবে তৈরি করুন
                        </button>
                      </>
                    )}
                    <button
                      type="submit"
                      disabled={posCart.length === 0 || submittingSale}
                      className="px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {submittingSale
                        ? 'বিক্রয় ইনভয়েস সংরক্ষণ হচ্ছে...'
                        : isEditingSale
                        ? `এডিটকৃত বিক্রয় ইনভয়েস সংরক্ষণ ও স্টক সমন্বয় করুন (${saleInvoiceNo}) ✓`
                        : `বিক্রয় ইনভয়েস সম্পন্ন করুন ও স্টক কমান (-${totalSaleUnits} পিস) ✓`}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* ============================================================================
             MODE 2: PRODUCT PURCHASE INVOICE (ক্রয় ইনভয়েস — ক্রয় করলে স্টক বাড়বে)
             ============================================================================ */
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left 5 Cols: Custom Product Entry + Medicine Picker for Purchase Invoice (Stock-In) */}
            <div className="lg:col-span-5 p-5 space-y-4">
              {/* Custom Product Quick Builder for Purchase Bill */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = purCustomName.trim();
                  if (!name) {
                    purCustomNameInputRef.current?.focus();
                    return;
                  }
                  const purchasePrice = Math.max(0.01, parseFloat(purCustomCostPrice) || 8.8);
                  const unitPrice =
                    purCustomMrpPrice.trim() !== ''
                      ? Math.max(0.01, parseFloat(purCustomMrpPrice) || Number((purchasePrice / 0.88).toFixed(2)))
                      : Number((purchasePrice / 0.88).toFixed(2));
                  const qty = Math.max(1, parseInt(purCustomQty, 10) || 10);

                  await onAddCustomToPurchaseCart({
                    brandName: name,
                    companyName: supplierCompany,
                    strength: purCustomStrength.trim(),
                    dosageForm: purCustomForm,
                    purchasePrice,
                    unitPrice,
                    qty,
                    batchNo: purCustomBatchNo.trim(),
                    saveToCatalog: purCustomSaveCatalog,
                  });

                  setPurCustomName('');
                  setPurCustomStrength('');
                  setPurCustomCostPrice('');
                  setPurCustomMrpPrice('');
                  setPurCustomQty('10');
                  setPurCustomBatchNo('');
                }}
                className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-md space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-indigo-700" />
                      <span>কাস্টম প্রডাক্ট, দাম ও পরিমাণ দিয়ে ক্রয় বিল তৈরি</span>
                    </div>
                    <p className="text-[11px] text-indigo-800">
                      লিস্টে না থাকা যেকোনো ওষুধ বা কাস্টম পণ্যের নাম, ক্রয় দর, বিক্রয় MRP ও পরিমাণ লিখে সরাসরি ক্রয় বিলে যুক্ত করুন
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      প্রডাক্ট / ওষুধের নাম *
                    </label>
                    <input
                      ref={purCustomNameInputRef}
                      type="text"
                      required
                      value={purCustomName}
                      onChange={(e) => setPurCustomName(e.target.value)}
                      placeholder="যেমন: নতুন ওষুধ / কাস্টম পণ্য..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      ধরন / ফর্ম
                    </label>
                    <select
                      value={purCustomForm}
                      onChange={(e) => setPurCustomForm(e.target.value)}
                      aria-label="কাস্টম প্রডাক্টের ধরন"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    >
                      {CUSTOM_PRODUCT_FORMS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      শক্তি / সাইজ
                    </label>
                    <input
                      type="text"
                      value={purCustomStrength}
                      onChange={(e) => setPurCustomStrength(e.target.value)}
                      placeholder="500mg / 100ml"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded font-mono focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      ক্রয় দর (৳) *
                    </label>
                    <input
                      ref={purCustomCostInputRef}
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={purCustomCostPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPurCustomCostPrice(val);
                        const num = parseFloat(val);
                        if (Number.isFinite(num) && num > 0) {
                          setPurCustomMrpPrice(String(Number((num / 0.88).toFixed(2))));
                        }
                      }}
                      placeholder="8.80"
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      বিক্রয় MRP (৳)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={purCustomMrpPrice}
                      onChange={(e) => setPurCustomMrpPrice(e.target.value)}
                      placeholder="10.00"
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      পরিমাণ (পিস) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={purCustomQty}
                      onChange={(e) => setPurCustomQty(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      ব্যাচ নং
                    </label>
                    <input
                      type="text"
                      value={purCustomBatchNo}
                      onChange={(e) => setPurCustomBatchNo(e.target.value)}
                      placeholder="B-101"
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-indigo-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={purCustomSaveCatalog}
                      onChange={(e) => setPurCustomSaveCatalog(e.target.checked)}
                      className="rounded border-indigo-400 text-indigo-700"
                    />
                    <span>ক্যাটালগেও স্থায়ীভাবে সংরক্ষণ করুন</span>
                  </label>

                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ ক্রয় বিলে কাস্টম প্রডাক্ট যুক্ত করুন</span>
                  </button>
                </div>
              </form>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    অথবা ক্যাটালগ থেকে ক্রয়ের ওষুধ নির্বাচন করুন
                  </h3>
                  <p className="text-xs text-slate-500">
                    ওষুধ সিলেক্ট করলে ক্রয় ইনভয়েসে যুক্ত হবে এবং সম্পন্ন করলে স্টক বৃদ্ধি পাবে
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={purMedSearch}
                    onChange={(e) => setPurMedSearch(e.target.value)}
                    placeholder="ক্রয়ের ওষুধ সার্চ করুন (যেমন: Napa, Seclo, Sergel, Noret)..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                {purMedSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setPurCustomName(purMedSearch.trim());
                      purCustomCostInputRef.current?.focus();
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded flex items-center justify-between cursor-pointer"
                  >
                    <span>
                      &ldquo;{purMedSearch.trim()}&rdquo; কাস্টম প্রডাক্ট হিসেবে দাম ও পরিমাণ বসিয়ে ক্রয় বিলে যুক্ত করুন
                    </span>
                    <span className="font-bold text-indigo-700">+ কাস্টম যোগ →</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {quickSearchPurchaseMedicines.map((med) => {
                  const st = getStockForMed(med);
                  const inPurCart =
                    purchaseCart.find((c) => c.medicineId === med.id)?.qty || 0;
                  const afterPurchaseStock = st + inPurCart;
                  const estCost = getMedPurchasePrice(med);
                  return (
                    <div
                      key={med.id}
                      className="p-3 border border-slate-200 rounded-md hover:border-indigo-600 transition-colors flex flex-col justify-between gap-2 bg-white"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-900">
                            {med.brandName}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              {med.strength}
                            </span>
                          </span>
                          <span className="font-mono tabular-nums text-xs font-bold text-indigo-700">
                            ক্রয়: ৳{formatCleanMoney(estCost)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center justify-between">
                          <span>{med.dosageForm}</span>
                          <span className="font-mono text-[11px] font-semibold text-teal-700">
                            বিক্রয়: ৳{formatCleanMoney(med.unitPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-xs font-mono tabular-nums text-slate-600">
                          স্টক: {st} পিস
                          {inPurCart > 0 && (
                            <span className="text-emerald-700 font-bold ml-1">
                              (হবে {afterPurchaseStock})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onAddToPurchaseCart(med, med.unitsPerStrip || 10);
                              setSupplierCompany(med.companyName);
                            }}
                            className="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded cursor-pointer"
                          >
                            +{med.unitsPerStrip || 10} পিস
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onAddToPurchaseCart(med, 100);
                              setSupplierCompany(med.companyName);
                            }}
                            className="px-2 py-1 text-xs font-medium bg-indigo-700 hover:bg-indigo-800 text-white rounded cursor-pointer"
                          >
                            +১০০ পিস
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 7 Cols: Active Purchase Invoice Memo with Stock Increase Indicator */}
            <div className="lg:col-span-7 p-5 bg-indigo-50/20 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-indigo-950">
                      ২. প্রডাক্ট ক্রয় ইনভয়েস ও স্টক-ইন ভাউচার (Purchase Invoice — স্টক বাড়বে)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      অপারেটর: <strong>{formatOperatorDisplay(activeStaff)}</strong> · ক্রয় তালিকায় প্রডাক্টের নাম, ধরন, শক্তি, ক্রয় দর, বিক্রয় MRP ও পরিমাণ সরাসরি পরিবর্তন করা যাবে
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onAddCustomToPurchaseCart({
                          brandName: 'কাস্টম প্রডাক্ট',
                          companyName: supplierCompany,
                          strength: '',
                          dosageForm: 'Tablet',
                          purchasePrice: 8.8,
                          unitPrice: 10,
                          qty: 10,
                          saveToCatalog: false,
                        });
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-indigo-950 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 rounded cursor-pointer"
                    >
                      + নতুন কাস্টম লাইন যোগ
                    </button>
                    {purchaseCart.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            purchaseCart.forEach((item) => {
                              onUpdatePurchaseCartItemDetails(item.medicineId, { updateStock: true });
                            });
                          }}
                          className="px-2 py-0.5 text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded cursor-pointer"
                        >
                          সবগুলোতে ✅ স্টকে যুক্ত
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            purchaseCart.forEach((item) => {
                              onUpdatePurchaseCartItemDetails(item.medicineId, { updateStock: false });
                            });
                          }}
                          className="px-2 py-0.5 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded cursor-pointer"
                        >
                          সবগুলো শুধু ইনভয়েস
                        </button>
                        <button
                          type="button"
                          onClick={onClearPurchaseCart}
                          className="text-xs text-red-600 hover:underline cursor-pointer ml-1"
                        >
                          ক্রয় তালিকা খালি করুন
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Purchase Cart Items Table */}
                <div className="my-3 max-h-[290px] overflow-y-auto border border-slate-200 rounded-md bg-white">
                  {purchaseCart.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-slate-500 space-y-2">
                      <div>
                        ক্রয় ইনভয়েসে এখনো কোনো ওষুধ বা কাস্টম প্রডাক্ট যোগ করা হয়নি।
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAddCustomToPurchaseCart({
                            brandName: 'কাস্টম প্রডাক্ট',
                            companyName: supplierCompany,
                            strength: '',
                            dosageForm: 'Tablet',
                            purchasePrice: 8.8,
                            unitPrice: 10,
                            qty: 10,
                            saveToCatalog: false,
                          });
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded cursor-pointer"
                      >
                        + সরাসরি কাস্টম প্রডাক্ট লাইন যোগ করুন
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-indigo-50/70 border-b border-slate-200 text-xs font-semibold text-slate-700">
                        <tr>
                          <th className="py-2 px-3">প্রডাক্ট / ওষুধের নাম, ধরন ও স্টক বৃদ্ধি</th>
                          <th className="py-2 px-2 text-center">ক্রয় দর (৳)</th>
                          <th className="py-2 px-2 text-center">বিক্রয় MRP (৳)</th>
                          <th className="py-2 px-2 text-center">ক্রয় পরিমাণ (পিস)</th>
                          <th className="py-2 px-3 text-right">মোট (৳)</th>
                          <th className="py-2 px-2 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {purchaseCart.map((item, idx) => {
                          const lineTotal = item.purchasePrice * item.qty;
                          const rawCurrentStock = getStockForMed(item);
                          const oldPurQty = isEditingPurchase ? getOldEditedQtyForMed(item) : 0;
                          const currentStock = Math.max(0, rawCurrentStock - oldPurQty);
                          const afterStock = currentStock + item.qty;
                          return (
                            <tr key={item.medicineId}>
                              <td className="py-2 px-3">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="font-mono text-xs font-bold text-slate-500">
                                    {idx + 1}.
                                  </span>
                                  <select
                                    value={item.dosageForm || 'Tablet'}
                                    onChange={(e) =>
                                      onUpdatePurchaseCartItemDetails(item.medicineId, {
                                        dosageForm: e.target.value,
                                      })
                                    }
                                    aria-label="প্রডাক্ট ফর্ম"
                                    className="px-1 py-0.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded text-slate-700"
                                  >
                                    {CUSTOM_PRODUCT_FORMS.map((f) => (
                                      <option key={f.value} value={f.value}>
                                        {getInvoiceFormPrefix(f.value)}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={item.brandName}
                                    onChange={(e) =>
                                      onUpdatePurchaseCartItemDetails(item.medicineId, {
                                        brandName: e.target.value,
                                      })
                                    }
                                    placeholder="প্রডাক্টের নাম"
                                    aria-label="প্রডাক্টের নাম"
                                    className="w-32 sm:w-36 px-1.5 py-0.5 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    value={item.strength}
                                    onChange={(e) =>
                                      onUpdatePurchaseCartItemDetails(item.medicineId, {
                                        strength: e.target.value,
                                      })
                                    }
                                    placeholder="শক্তি/সাইজ"
                                    aria-label="শক্তি বা সাইজ"
                                    className="w-20 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded focus:border-indigo-600 focus:outline-none"
                                  />
                                </div>
                                <div className="text-[11px] font-mono text-indigo-800 mt-1">
                                  (৳{formatCleanMoney(item.purchasePrice)}) × {item.qty}=
                                  {formatCleanMoney(lineTotal)}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <label
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border select-none cursor-pointer transition-colors ${
                                      item.updateStock !== false
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-semibold'
                                        : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 font-medium'
                                    }`}
                                    title={
                                      item.updateStock !== false
                                        ? 'স্টকে যুক্ত হবে (ক্লিক করে টিক চিহ্ন তুলে দিলে স্টকে যুক্ত না হয়ে শুধু ইনভয়েস তৈরি হবে)'
                                        : 'স্টকে যুক্ত হবে না (শুধু ইনভয়েস তৈরি হবে)'
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={item.updateStock !== false}
                                      onChange={(e) =>
                                        onUpdatePurchaseCartItemDetails(item.medicineId, {
                                          updateStock: e.target.checked,
                                        })
                                      }
                                      className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <span className="text-[11px]">
                                      {item.updateStock !== false
                                        ? '✅ স্টকে যুক্ত হবে'
                                        : '❌ স্টকে যুক্ত হবে না (শুধু ইনভয়েস)'}
                                    </span>
                                  </label>
                                </div>

                                {item.updateStock !== false ? (
                                  <div className="text-[11px] font-mono text-emerald-700 mt-0.5 flex items-center gap-1">
                                    <ArrowUpRight className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>
                                      স্টক বাড়বে: বর্তমান {currentStock} পিস → ক্রয়ের পর{' '}
                                      <strong>{afterStock} পিস</strong> (+{item.qty})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-[11px] font-mono text-amber-800 mt-0.5 flex items-center gap-1">
                                    <Info className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>
                                      স্টক অপরিবর্তিত থাকবে (বর্তমান {currentStock} পিস) · শুধু ইনভয়েস ও মোট হিসাবে থাকবে
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Editable Purchase Unit Cost */}
                              <td className="py-2 px-1.5 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.1"
                                  aria-label={`${item.brandName} ক্রয় দর`}
                                  value={item.purchasePrice}
                                  onChange={(e) =>
                                    onUpdatePurchaseCartCost(
                                      item.medicineId,
                                      Math.max(0.01, parseFloat(e.target.value) || 0)
                                    )
                                  }
                                  className="w-18 text-center py-1 px-1 text-xs font-mono tabular-nums border border-slate-200 rounded bg-white text-slate-900"
                                />
                              </td>

                              {/* Editable Selling MRP */}
                              <td className="py-2 px-1.5 text-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.1"
                                  aria-label={`${item.brandName} বিক্রয় MRP`}
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    onUpdatePurchaseCartMrp(
                                      item.medicineId,
                                      Math.max(0.01, parseFloat(e.target.value) || 0)
                                    )
                                  }
                                  className="w-18 text-center py-1 px-1 text-xs font-mono tabular-nums border border-slate-200 rounded bg-white text-slate-900"
                                />
                              </td>

                              {/* Purchase Qty Controls */}
                              <td className="py-2 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdatePurchaseCartQty(
                                        item.medicineId,
                                        Math.max(1, item.qty - 10)
                                      )
                                    }
                                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                                    title="-১০ পিস"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.qty}
                                    onChange={(e) =>
                                      onUpdatePurchaseCartQty(
                                        item.medicineId,
                                        Math.max(1, parseInt(e.target.value, 10) || 1)
                                      )
                                    }
                                    className="w-16 text-center py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdatePurchaseCartQty(item.medicineId, item.qty + 10)
                                    }
                                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                                    title="+১০ পিস"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="mt-1 flex items-center justify-center gap-1">
                                  <input
                                    type="text"
                                    value={item.batchNo}
                                    onChange={(e) =>
                                      onUpdatePurchaseCartBatch(item.medicineId, e.target.value)
                                    }
                                    placeholder="ব্যাচ নং"
                                    className="w-20 text-center py-0.5 px-1 text-[10px] font-mono border border-slate-200 rounded text-slate-600"
                                  />
                                </div>
                              </td>

                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {formatCleanMoney(lineTotal)}
                              </td>

                              <td className="py-2 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => onRemoveFromPurchaseCart(item.medicineId)}
                                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {purchaseCart.length > 0 && (
                  <div className="mb-3 p-2.5 bg-white border border-indigo-200 rounded-md text-xs font-mono text-slate-800 space-y-0.5">
                    <div className="text-[11px] font-sans font-semibold text-indigo-900 mb-1 flex items-center justify-between">
                      <span>ক্রয় ইনভয়েস প্রিভিউ (Purchase Invoice Lines):</span>
                      <span className="text-emerald-700 font-bold">
                        মোট স্টক বৃদ্ধি: +{totalPurchaseUnits} পিস
                      </span>
                    </div>
                    {purchaseCart.map((item, idx) => (
                      <div key={item.medicineId}>{formatPurchaseItemInvoiceLine(item, idx)}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supplier Company & Purchase Payment Form */}
              <form
                onSubmit={handlePurchaseInvoiceSubmit}
                className="space-y-3 pt-2 border-t border-slate-200"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      সরবরাহকারী কোম্পানি সার্চ ও নির্বাচন
                    </label>
                    <input
                      type="text"
                      value={purCompanySearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPurCompanySearch(val);
                        const q = val.trim().toLowerCase();
                        if (q) {
                          const firstComp = BD_PHARMA_COMPANIES.find((c) =>
                            c.toLowerCase().includes(q)
                          );
                          if (firstComp) setSupplierCompany(firstComp);
                        }
                      }}
                      placeholder="কোম্পানি সার্চ করুন..."
                      className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md mb-1"
                    />
                    <select
                      value={supplierCompany}
                      onChange={(e) => setSupplierCompany(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    >
                      {filteredPurchaseCompanies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      ক্রয় ইনভয়েস / চালান নং *
                    </label>
                    <input
                      type="text"
                      required
                      value={purInvoiceNo}
                      onChange={(e) => setPurInvoiceNo(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                    />
                    <input
                      type="text"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      placeholder="ডিপো / প্রতিনিধির মোবাইল"
                      className="w-full mt-1 px-3 py-1 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      তারিখ ও পেমেন্ট মাধ্যম
                    </label>
                    <input
                      type="date"
                      required
                      value={purDateStr}
                      onChange={(e) => setPurDateStr(e.target.value)}
                      aria-label="ক্রয় ইনভয়েস তারিখ"
                      className="w-full px-2.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded-md mb-1"
                    />
                    <select
                      value={purPaymentMethod}
                      onChange={(e) =>
                        setPurPaymentMethod(e.target.value as Transaction['paymentMethod'])
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    >
                      <option value="cash">নগদ টাকা (Cash)</option>
                      <option value="bkash">বিকাশ (bKash)</option>
                      <option value="nagad">নগদ এমএফএস (Nagad)</option>
                      <option value="card">ব্যাংক / চেক (Card/Bank)</option>
                      <option value="due">কোম্পানি বাকি (Supplier Due)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 bg-white p-3 rounded-md border border-slate-200">
                  <div>
                    <label className="block text-xs text-slate-500">মোট ক্রয় বিল (৳)</label>
                    <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      ৳{purchaseSubTotal.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">কমিশন / ছাড় (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={purDiscountStr}
                      onChange={(e) => setPurDiscountStr(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">নগদ পরিশোধ (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder={purGrandTotal.toFixed(0)}
                      value={purPaidStr}
                      onChange={(e) => setPurPaidStr(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-xs space-x-3 font-mono tabular-nums">
                    <span className="text-slate-700">
                      নিট ক্রয় বিল:{' '}
                      <strong className="text-slate-900">৳{purGrandTotal.toFixed(2)}</strong>
                    </span>
                    <span
                      className={purDueAmount > 0 ? 'text-red-600 font-bold' : 'text-emerald-700'}
                    >
                      কোম্পানি বাকি: ৳{purDueAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditingPurchase && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onCancelEditInvoice();
                            resetPurchaseFormToFresh();
                          }}
                          className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          এডিট বাতিল
                        </button>
                        <button
                          type="button"
                          disabled={purchaseCart.length === 0 || submittingPurchase}
                          onClick={() => submitPurchaseWithMode(true)}
                          className="px-3.5 py-2 text-xs font-semibold text-indigo-900 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          নতুন ইনভয়েস হিসেবে তৈরি করুন
                        </button>
                      </>
                    )}
                    {(() => {
                      const stockedPurUnits = purchaseCart
                        .filter((i) => i.updateStock !== false)
                        .reduce((acc, i) => acc + i.qty, 0);
                      return (
                        <button
                          type="submit"
                          disabled={purchaseCart.length === 0 || submittingPurchase}
                          className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {submittingPurchase
                            ? 'ক্রয় ইনভয়েস সংরক্ষণ হচ্ছে...'
                            : isEditingPurchase
                            ? `এডিটকৃত ক্রয় ইনভয়েস সংরক্ষণ করুন (${purInvoiceNo}) ✓`
                            : stockedPurUnits > 0
                            ? `ক্রয় ইনভয়েস সম্পন্ন করুন ও স্টক বাড়ান (+${stockedPurUnits} পিস) ✓`
                            : `ক্রয় ইনভয়েস সম্পন্ন করুন (শুধু ইনভয়েস, স্টক অপরিবর্তিত) ✓`}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Daily Purchase & Sales Accounting Dashboard */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              দৈনিক ক্রয় ও বিক্রয় ইনভয়েস তালিকা (বিক্রয়ে স্টক হ্রাস ও ক্রয়ে স্টক বৃদ্ধি)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              সকল বিক্রয় ইনভয়েস এবং ক্রয় ইনভয়েস আলাদাভাবে দেখুন, প্রিন্ট করুন, এডিট বা ডিলিট করুন (ডিলিট করলে স্টক স্বয়ংক্রিয়ভাবে পূর্বাবস্থায় ফিরবে)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setShowAllDates(false);
              }}
              aria-label="তারিখ নির্বাচন"
              className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50"
            />
            <button
              type="button"
              onClick={() => setShowAllDates(!showAllDates)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showAllDates
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showAllDates ? 'সকল তারিখ দেখানো হচ্ছে' : 'সকল তারিখের হিসাব'}
            </button>

            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value as 'ALL' | 'owner' | 'staff')}
              aria-label="মালিক বা স্টাফ ফিল্টার"
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md"
            >
              <option value="ALL">Owner ও সকল স্টাফ</option>
              <option value="owner">শুধুমাত্র Owner-এর এন্ট্রি</option>
              <option value="staff">শুধুমাত্র স্টাফদের এন্ট্রি</option>
            </select>
          </div>
        </div>

        {/* 5-Column Daily Financial Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70 border-b border-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500">মোট বিক্রয় ইনভয়েস (Sales Bill)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-teal-800 mt-1">
              ৳{dailyMetrics.totalSalesBill.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Owner: ৳{dailyMetrics.ownerSales} · স্টাফ: ৳{dailyMetrics.staffSales}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500">নগদ বিক্রয় ও বকেয়া আদায়</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              ৳{dailyMetrics.totalCashIn.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              নগদ মেমো: ৳{dailyMetrics.salesCashCollected} · বকেয়া আদায়: ৳{dailyMetrics.dueCollectedLater}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500">কাস্টমার বাকি (Due Given)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-600 mt-1">
              ৳{dailyMetrics.salesDueGiven.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-1">কাস্টমার লেজারে স্বয়ংক্রিয় যুক্ত</div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500">প্রডাক্ট ক্রয় ইনভয়েস (Purchase Bill)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-indigo-900 mt-1">
              ৳{dailyMetrics.totalPurchaseBill.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-1">কোম্পানি ক্রয় ও স্টক-ইন খরচ</div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-500">নেট ক্যাশ ব্যালেন্স (Cash Flow)</div>
            <div
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                dailyMetrics.netCashDrawer >= 0 ? 'text-teal-700' : 'text-red-600'
              }`}
            >
              ৳{dailyMetrics.netCashDrawer.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 mt-1">মোট নগদ জমা বিয়োগ ক্রয় খরচ</div>
          </div>
        </div>

        {/* Transaction Type Filter Bar */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-md">
            {[
              { id: 'ALL', label: 'সকল ইনভয়েস ও লেনদেন' },
              { id: 'sale', label: 'বিক্রয় ইনভয়েস (স্টক কমেছে)' },
              { id: 'purchase', label: 'ক্রয় ইনভয়েস (স্টক বেড়েছে)' },
              { id: 'due_payment', label: 'বকেয়া আদায় (Due Collection)' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTxTypeFilter(tab.id as typeof txTypeFilter)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  txTypeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500">
            মোট {filteredTransactions.length}টি ইনভয়েস এন্ট্রি
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">ইনভয়েস নং ও তারিখ</th>
                <th className="py-2.5 px-3">ইনভয়েসের ধরন ও স্টক প্রভাব</th>
                <th className="py-2.5 px-3">কাস্টমার / কোম্পানি</th>
                <th className="py-2.5 px-3">ওষুধের বিবরণ</th>
                <th className="py-2.5 px-3">এন্ট্রি অপারেটর</th>
                <th className="py-2.5 px-3 text-right">মোট বিল (৳)</th>
                <th className="py-2.5 px-3 text-right">নগদ জমা (৳)</th>
                <th className="py-2.5 px-3 text-right">বাকি (৳)</th>
                <th className="py-2.5 px-4 text-right">ইনভয়েস / এডিট / ডিলিট</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center text-slate-500">
                    নির্বাচিত ফিল্টারে কোনো ক্রয় বা বিক্রয় ইনভয়েস পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isCurrentlyEditingThisRow = editingInvoiceTx?.id === tx.id;
                  return (
                    <tr
                      key={tx.id}
                      className={`transition-colors ${
                        isCurrentlyEditingThisRow
                          ? 'bg-amber-50/80 hover:bg-amber-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-xs">
                        <div className="font-semibold text-slate-900">{tx.invoiceNo}</div>
                        <div className="text-slate-500">{tx.dateStr}</div>
                        {isCurrentlyEditingThisRow && (
                          <div className="text-[11px] font-sans font-bold text-amber-800 mt-0.5">
                            উপরে প্যানেলে এডিট হচ্ছে...
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {tx.txType === 'sale' ? (
                          <div>
                            <span className="font-bold text-teal-800">বিক্রয় ইনভয়েস</span>
                            <div className="text-[11px] font-mono text-amber-700">
                              স্টক হ্রাস (-{tx.totalCount} পিস)
                            </div>
                          </div>
                        ) : tx.txType === 'purchase' ? (
                          <div>
                            <span className="font-bold text-indigo-800">ক্রয় ইনভয়েস</span>
                            <div className="text-[11px] font-mono text-emerald-700">
                              স্টক বৃদ্ধি (+{tx.totalCount} পিস)
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-emerald-700">বকেয়া আদায়</span>
                            <div className="text-[11px] text-slate-400">লেজার জমা</div>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 uppercase mt-0.5">
                          {tx.paymentMethod}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 text-xs">{tx.partyName}</div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {tx.partyPhone}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-800 font-mono">
                        <div className="space-y-0.5">
                          {formatTransactionItemsList(tx.itemsSummary).map((line, idx) => (
                            <div key={idx} className="whitespace-nowrap">
                              {line}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <div className="font-bold text-slate-900">
                          {tx.staffRole === 'owner' ? 'Owner' : tx.staffName}
                        </div>
                        <div className="text-slate-500">{tx.counterName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        ৳{tx.grandTotal.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        ৳{tx.paidAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {tx.dueAmount > 0 ? (
                          <span className="text-red-600 font-semibold">
                            ৳{tx.dueAmount.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">৳0.00</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewInvoice(tx)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                              tx.txType === 'purchase'
                                ? 'text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                                : 'text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200'
                            }`}
                            title="ইনভয়েস দেখুন ও প্রিন্ট করুন"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {tx.txType === 'purchase'
                              ? 'ক্রয় ইনভয়েস'
                              : tx.txType === 'sale'
                              ? 'বিক্রয় ইনভয়েস'
                              : 'রশিদ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditInvoiceAction(tx)}
                            className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            title="নতুন ইনভয়েস তৈরির মতো সম্পূর্ণ এডিট করুন"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            এডিট
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTransaction(tx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="এন্ট্রি ডিলিট করুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                লেনদেন / ইনভয়েস এন্ট্রি এডিট করুন ({editingTx.invoiceNo})
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                বন্ধ করুন ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    তারিখ *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    পেমেন্ট মাধ্যম
                  </label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) =>
                      setEditPaymentMethod(e.target.value as Transaction['paymentMethod'])
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="cash">নগদ (Cash)</option>
                    <option value="bkash">বিকাশ (bKash)</option>
                    <option value="nagad">নগদ (Nagad)</option>
                    <option value="card">কার্ড (Card)</option>
                    <option value="due">বাকি (Due)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    কাস্টমার / কোম্পানির নাম *
                  </label>
                  <input
                    type="text"
                    required
                    value={editPartyName}
                    onChange={(e) => setEditPartyName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    মোবাইল নম্বর *
                  </label>
                  <input
                    type="text"
                    required
                    value={editPartyPhone}
                    onChange={(e) => setEditPartyPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ওষুধ ও আইটেম বিবরণ *
                </label>
                <textarea
                  rows={3}
                  required
                  value={editItemsSummary}
                  onChange={(e) => setEditItemsSummary(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    মোট বিল (SubTotal ৳) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editSubTotal}
                    onChange={(e) => setEditSubTotal(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ডিসকাউন্ট (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    নগদ জমা (Paid ৳) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editPaidAmount}
                    onChange={(e) => setEditPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingEditTx}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {savingEditTx ? 'আপডেট হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
         TWO DISTINCT PRINTABLE INVOICE TEMPLATES MODAL:
         - template 1: প্রডাক্ট বিক্রয় ইনভয়েস (SALES INVOICE — স্টক কমেছে)
         - template 2: প্রডাক্ট ক্রয় ইনভয়েস (PURCHASE INVOICE — স্টক বেড়েছে)
         ============================================================================ */}
      {previewInvoice && (
        <div id="printable-invoice-modal" className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div id="printable-invoice-receipt" className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 shadow-xl my-auto">
            {/* Distinct Top Invoice Type Banner */}
            <div
              className={`mb-4 px-4 py-2.5 rounded-md border flex flex-wrap items-center justify-between gap-2 ${
                previewInvoice.txType === 'purchase'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                  : previewInvoice.txType === 'sale'
                  ? 'bg-teal-50 border-teal-300 text-teal-950'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {previewInvoice.txType === 'purchase' ? (
                  <Truck className="w-4 h-4 text-indigo-700 shrink-0" />
                ) : (
                  <ShoppingCart className="w-4 h-4 text-teal-700 shrink-0" />
                )}
                <span className="text-sm font-extrabold tracking-tight">
                  {previewInvoice.txType === 'purchase'
                    ? 'প্রডাক্ট ক্রয় ইনভয়েস / স্টক-ইন চালান (PURCHASE INVOICE)'
                    : previewInvoice.txType === 'sale'
                    ? 'প্রডাক্ট বিক্রয় ইনভয়েস / ক্যাশ মেমো (SALES INVOICE)'
                    : 'বকেয়া আদায় মানি রিসিট (DUE COLLECTION RECEIPT)'}
                </span>
              </div>

              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${
                  previewInvoice.txType === 'purchase'
                    ? 'bg-white border-indigo-300 text-emerald-700'
                    : previewInvoice.txType === 'sale'
                    ? 'bg-white border-teal-300 text-amber-800'
                    : 'bg-white border-emerald-300 text-emerald-800'
                }`}
              >
                {(() => {
                  const items = parsedPreviewItems;
                  const nonStockCount = items.filter((i) => i.tailText?.includes('নন-স্টক')).length;
                  const stockEffectQty = items
                    .filter((i) => !i.tailText?.includes('নন-স্টক'))
                    .reduce((sum, i) => sum + i.qty, 0);
                  if (previewInvoice.txType === 'purchase') {
                    return stockEffectQty > 0
                      ? `স্টক বৃদ্ধি (+${stockEffectQty} পিস)${nonStockCount > 0 ? ` · ${nonStockCount}টি নন-স্টক` : ''}`
                      : 'শুধু ইনভয়েস (স্টক অপরিবর্তিত)';
                  }
                  if (previewInvoice.txType === 'sale') {
                    return stockEffectQty > 0
                      ? `স্টক হ্রাস (-${stockEffectQty} পিস)${nonStockCount > 0 ? ` · ${nonStockCount}টি নন-স্টক` : ''}`
                      : 'শুধু ইনভয়েস (স্টক অপরিবর্তিত)';
                  }
                  return 'লেজার বকেয়া জমা';
                })()}
              </span>
            </div>

            {/* Top Header: Left Corner Pharmacy Identity & Chamber Hours + Right Corner Invoice Meta */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
              {/* বাম কোনে ইকবাল ফার্মেসী ও রোগী দেখার সময় */}
              <div className="text-left space-y-0.5">
                <h3 className="text-xl font-extrabold text-teal-900 tracking-tight">
                  ইকবাল ফার্মেসী
                </h3>
                <p className="text-xs font-bold text-slate-900">
                  ইকবাল মাহমুদ (DMTD DENTAL,LMF,RMP,Pharmasist)
                </p>
                <p className="text-xs text-slate-800">
                  ঠিকানা:- নতুনহাট,ইসলামিয়া মাদ্রাসা-৩৮০৯,চন্দ্রগঞ্জ,লক্ষীপুর।
                </p>
                <p className="text-xs font-mono font-bold text-slate-900">
                  মোবাই:- 01812-358839
                </p>
                <div className="text-[11px] text-slate-700 pt-1 leading-snug space-y-0.5">
                  <div>
                    <span className="font-semibold text-slate-900">রোগী দেখার সময়:-</span> সকাল ৮টা-১০টা এবং সন্ধ্যা ৬টা-রাত ১০টা (শনি,রবি,সোম,বুধ,বৃহস্পতি)
                  </div>
                  <div>
                    সকাল ৮টা-১০টা এবং দুপুর ৩টা-রাত ১০টা (মঙ্গল) এবং শুক্রবার সারাদিন।
                  </div>
                </div>
              </div>

              {/* ডান পাশে ক্রয় অথবা বিক্রয় ইনভয়েসের নির্দিষ্ট তথ্য */}
              <div className="text-left sm:text-right text-xs space-y-1 shrink-0 sm:border-l sm:border-slate-200 sm:pl-4">
                <div>
                  <span className="text-slate-500">
                    {previewInvoice.txType === 'purchase'
                      ? 'ক্রয় ইনভয়েস নং: '
                      : 'বিক্রয় মেমো নং: '}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {previewInvoice.invoiceNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">তারিখ: </span>
                  <span className="font-mono text-slate-800">{previewInvoice.dateStr}</span>
                </div>
                <div>
                  <span className="text-slate-500">
                    {previewInvoice.txType === 'purchase'
                      ? 'সরবরাহকারী কোম্পানি: '
                      : 'ক্রেতার নাম: '}
                  </span>
                  <span className="font-semibold text-slate-900">{previewInvoice.partyName}</span>
                </div>
                <div>
                  <span className="text-slate-500">
                    {previewInvoice.txType === 'purchase' ? 'ডিপো / ফোন: ' : 'মোবাইল: '}
                  </span>
                  <span className="font-mono text-slate-800">{previewInvoice.partyPhone}</span>
                </div>
                <div>
                  <span className="text-slate-500">অপারেটর: </span>
                  <span className="text-slate-800 font-semibold">
                    {previewInvoice.staffRole === 'owner' ? 'Owner' : previewInvoice.staffName}
                  </span>
                </div>
              </div>
            </div>

            {/* Items & Stock Impact Section */}
            <div className="py-4 border-b border-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                <span>
                  {previewInvoice.txType === 'purchase'
                    ? 'ক্রয়কৃত প্রডাক্টের তালিকা ও স্টক বৃদ্ধি বিবরণ:'
                    : 'বিক্রয়কৃত প্রডাক্টের তালিকা ও স্টক হ্রাস বিবরণ:'}
                </span>
                <span className="font-mono text-slate-500">
                  {previewInvoice.txType === 'purchase'
                    ? 'ক্রয় দর × পরিমাণ = মোট'
                    : 'বিক্রয় দর × পরিমাণ = মোট'}
                </span>
              </div>

              {parsedPreviewItems.length > 0 ? (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead
                      className={
                        previewInvoice.txType === 'purchase'
                          ? 'bg-indigo-50/70 border-b border-slate-200 text-indigo-950 font-sans'
                          : 'bg-teal-50/70 border-b border-slate-200 text-teal-950 font-sans'
                      }
                    >
                      <tr>
                        <th className="py-2 px-3">ওষুধের বিবরণ (হিসাব লাইন)</th>
                        <th className="py-2 px-2 text-center">একক দর</th>
                        <th className="py-2 px-2 text-center">পরিমাণ</th>
                        <th className="py-2 px-2 text-center">স্টক পরিবর্তন</th>
                        <th className="py-2 px-3 text-right">মোট (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-slate-50/50">
                      {parsedPreviewItems.map((pItem, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {pItem.rawLine}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-700">
                            ৳{formatCleanMoney(pItem.unitPrice)}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-slate-900">
                            {pItem.qty} পিস
                          </td>
                          <td className="py-2 px-2 text-center">
                            {pItem.tailText?.includes('নন-স্টক') ? (
                              <span className="text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                ০ পিস (শুধু ইনভয়েস)
                              </span>
                            ) : previewInvoice.txType === 'purchase' ? (
                              <span className="text-emerald-700 font-bold">
                                +{pItem.qty} পিস (স্টক ইন)
                              </span>
                            ) : (
                              <span className="text-amber-800 font-bold">
                                -{pItem.qty} পিস (স্টক আউট)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            ৳{formatCleanMoney(pItem.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs font-mono text-slate-900 space-y-1 leading-relaxed">
                  {formatTransactionItemsList(previewInvoice.itemsSummary).map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Totals */}
            <div className="py-3.5 space-y-1.5 text-sm font-mono tabular-nums">
              <div className="flex justify-between text-xs text-slate-600">
                <span>
                  {previewInvoice.txType === 'purchase'
                    ? 'মোট ক্রয় বিল (Sub-total):'
                    : 'মোট বিক্রয় বিল (Sub-total):'}
                </span>
                <span>৳{previewInvoice.subTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>ছাড় / ডিসকাউন্ট (Discount):</span>
                <span>-৳{previewInvoice.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>
                  {previewInvoice.txType === 'purchase'
                    ? 'নিট ক্রয় বিল (Grand Total):'
                    : 'নিট বিক্রয় বিল (Grand Total):'}
                </span>
                <span>৳{previewInvoice.grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>
                  {previewInvoice.txType === 'purchase' ? 'নগদ পরিশোধ' : 'নগদ জমা'} (
                  {previewInvoice.paymentMethod.toUpperCase()}):
                </span>
                <span>৳{previewInvoice.paidAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600 font-semibold">
                <span>
                  {previewInvoice.txType === 'purchase'
                    ? 'কোম্পানি বাকি (Supplier Due):'
                    : 'কাস্টমার বাকি (Customer Due):'}
                </span>
                <span>৳{previewInvoice.dueAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* ইনভয়েস এর ফুটার (ছোট করে লেখা) */}
            <div className="pt-2.5 pb-1 border-t border-dashed border-slate-300 text-center space-y-0.5">
              <div className="text-[10px] font-semibold text-slate-600">
                মোঃ আকবর হোসেন চৌধুরী
              </div>
              <div className="text-[10px] text-slate-500">
                ডেভেলপার ইকবাল ফার্মেসী মেডিসিন এ্যাপস্
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 no-print mt-2">
              {(previewInvoice.txType === 'sale' || previewInvoice.txType === 'purchase') && (
                <button
                  type="button"
                  onClick={() => handleEditInvoiceAction(previewInvoice)}
                  className="px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  ইনভয়েস এডিট করুন
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                {previewInvoice.txType === 'purchase'
                  ? 'ক্রয় ইনভয়েস প্রিন্ট করুন'
                  : 'বিক্রয় ইনভয়েস প্রিন্ট করুন'}
              </button>
              <button
                type="button"
                onClick={() => setPreviewInvoice(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
