import React, { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Cloud,
  Edit3,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { ShopCloudSession } from '../firebase';
import { ShopProfile, StaffMember, Transaction } from '../types';

interface StaffAndShopViewProps {
  shopProfile: ShopProfile;
  staffList: StaffMember[];
  activeStaff: StaffMember;
  transactions: Transaction[];
  cloudSession: ShopCloudSession | null;
  isCloudLoggedIn: boolean;
  seedingCloud: boolean;
  onOpenCloudLoginModal: () => void;
  onQuickCloudLogin: () => Promise<void>;
  onCloudLogout: () => Promise<void>;
  onSyncCloudData: () => Promise<void>;
  onSelectActiveStaff: (staff: StaffMember) => void;
  onUpdateShopProfile: (
    data: Omit<ShopProfile, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveStaffMember: (
    data: Omit<StaffMember, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  onDeleteStaffMember: (id: string) => Promise<void>;
}

export const StaffAndShopView: React.FC<StaffAndShopViewProps> = ({
  shopProfile,
  staffList,
  activeStaff,
  transactions,
  cloudSession,
  isCloudLoggedIn,
  seedingCloud,
  onOpenCloudLoginModal,
  onQuickCloudLogin,
  onCloudLogout,
  onSyncCloudData,
  onSelectActiveStaff,
  onUpdateShopProfile,
  onSaveStaffMember,
  onDeleteStaffMember,
}) => {
  // Shop form
  const [shopName, setShopName] = useState(shopProfile.shopName);
  const [licenseNo, setLicenseNo] = useState(shopProfile.licenseNo);
  const [phone, setPhone] = useState(shopProfile.phone);
  const [address, setAddress] = useState(shopProfile.address);
  const [savingShop, setSavingShop] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);

  // Add / Edit Staff modal
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffName, setStaffName] = useState('');
  const [roleTitle, setRoleTitle] = useState<StaffMember['roleTitle']>('salesman');
  const [staffPhone, setStaffPhone] = useState('');
  const [shift, setShift] = useState('সকাল ৯টা - বিকাল ৫টা');
  const [counterName, setCounterName] = useState('কাউন্টার ২ (স্টাফ)');
  const [savingStaff, setSavingStaff] = useState(false);

  // Calculate Sales & Collection per Staff Member
  const staffPerformance = useMemo(() => {
    const map = new Map<
      string,
      {
        memoCount: number;
        totalSaleAmount: number;
        cashCollected: number;
      }
    >();

    for (const tx of transactions) {
      if (tx.txType === 'sale' || tx.txType === 'due_payment') {
        const key = tx.staffRole === 'owner' ? 'Owner' : tx.staffName;
        const prev = map.get(key) || {
          memoCount: 0,
          totalSaleAmount: 0,
          cashCollected: 0,
        };
        if (tx.txType === 'sale') {
          prev.memoCount += 1;
          prev.totalSaleAmount += tx.grandTotal;
        }
        prev.cashCollected += tx.paidAmount;
        map.set(key, prev);
      }
    }
    return map;
  }, [transactions]);

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingShop(true);
    try {
      await onUpdateShopProfile({
        shopName: shopName.trim(),
        licenseNo: licenseNo.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      setShopSaved(true);
      setTimeout(() => setShopSaved(false), 2000);
    } finally {
      setSavingShop(false);
    }
  };

  const openNewStaffModal = () => {
    setEditingStaff(null);
    setStaffName('');
    setRoleTitle('salesman');
    setStaffPhone('');
    setShift('সকাল ৯টা - বিকাল ৫টা');
    setCounterName('কাউন্টার ২ (স্টাফ)');
    setShowStaffModal(true);
  };

  const openEditStaffModal = (st: StaffMember) => {
    setEditingStaff(st);
    setStaffName(st.roleTitle === 'owner' ? 'Owner' : st.name);
    setRoleTitle(st.roleTitle);
    setStaffPhone(st.phone);
    setShift(st.shift);
    setCounterName(st.counterName);
    setShowStaffModal(true);
  };

  const handleSaveStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = roleTitle === 'owner' ? 'Owner' : staffName.trim();
    if (!finalName) return;
    setSavingStaff(true);
    try {
      await onSaveStaffMember(
        {
          name: finalName,
          roleTitle,
          phone: staffPhone.trim() || '01700-000000',
          shift: shift.trim(),
          counterName: counterName.trim(),
          active: true,
        },
        editingStaff?.id
      );
      setShowStaffModal(false);
    } finally {
      setSavingStaff(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Shop Cloud Login & Real-Time Multi-Device Sync Control Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-700">
            <Cloud className="w-4 h-4" />
            <span>দোকান ক্লাউড লগইন ও মাল্টি-ডিভাইস অটো সিঙ্ক</span>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            {isCloudLoggedIn
              ? `ক্লাউড একাউন্ট সক্রিয়: ${cloudSession?.shopName || shopProfile.shopName} (${cloudSession?.email || 'mhakbor2001@gmail.com'})`
              : 'দোকান ক্লাউড একাউন্টে লগইন করে সকল ডিভাইসে রিয়েল-টাইম ডেটা সিঙ্ক চালু করুন'}
          </h2>
          <p className="text-xs text-slate-600">
            {isCloudLoggedIn
              ? `লগইনকৃত একাউন্ট: ${cloudSession?.displayName || 'ইকবাল মাহমুদ (Owner)'} · মোবাইল: ${cloudSession?.phone || shopProfile.phone} · সকল ইনভয়েস, স্টক ও কাস্টমার লেজার ক্লাউড ও লোকাল স্টোরেজে সুরক্ষিত।`
              : '১-ক্লিকে ইকবাল ফার্মেসী ক্লাউড লগইন অথবা ইমেইল/মোবাইল ও পাসওয়ার্ড দিয়ে দোকান ক্লাউডে লগইন করুন।'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isCloudLoggedIn ? (
            <>
              <button
                type="button"
                onClick={onSyncCloudData}
                disabled={seedingCloud}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${seedingCloud ? 'animate-spin' : ''}`} />
                {seedingCloud ? 'সিঙ্ক হচ্ছে...' : 'এখনই ক্লাউডে সিঙ্ক করুন'}
              </button>
              <button
                type="button"
                onClick={onOpenCloudLoginModal}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                একাউন্ট তথ্য / পরিবর্তন
              </button>
              <button
                type="button"
                onClick={onCloudLogout}
                className="px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                লগআউট
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onQuickCloudLogin}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                ১-ক্লিকে দোকান ক্লাউড লগইন
              </button>
              <button
                type="button"
                onClick={onOpenCloudLoginModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                ইমেইল / পাসওয়ার্ড লগইন অপশন
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Owner & Staff Counter Role Management + Sales Performance */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                <Users className="w-4 h-4" />
                নির্দিষ্ট দোকানের একাউন্টে মালিক (Owner) ও স্টাফ ব্যবস্থাপনা
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                মালিক (Owner) ও স্টাফ তালিকা এবং সেলস রিপোর্ট
              </h2>
              <p className="text-xs text-slate-500">
                দোকানের মালিকের এন্ট্রিতে সর্বদা <strong>&ldquo;Owner&rdquo;</strong> দেখাবে এবং অন্যান্য স্টাফদের ক্ষেত্রে তাদের নির্দিষ্ট নাম দেখাবে।
              </p>
            </div>
            <button
              type="button"
              onClick={openNewStaffModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> নতুন স্টাফ যুক্ত করুন
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">প্রদর্শিত নাম ও পদবী</th>
                  <th className="py-2.5 px-3">কাউন্টার ও শিফট</th>
                  <th className="py-2.5 px-3 text-right">মোট মেমো</th>
                  <th className="py-2.5 px-3 text-right">মোট বিক্রি (৳)</th>
                  <th className="py-2.5 px-3 text-right">নগদ আদায় (৳)</th>
                  <th className="py-2.5 px-4 text-right">সক্রিয় / এডিট / ডিলিট</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {staffList.map((st) => {
                  const isCurrent = st.id === activeStaff.id;
                  const displayName = st.roleTitle === 'owner' ? 'Owner' : st.name;
                  const perf = staffPerformance.get(displayName) || {
                    memoCount: 0,
                    totalSaleAmount: 0,
                    cashCollected: 0,
                  };
                  return (
                    <tr
                      key={st.id}
                      className={isCurrent ? 'bg-teal-50/60' : 'hover:bg-slate-50'}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{displayName}</div>
                        <div className="text-xs text-slate-500">
                          {st.roleTitle === 'owner'
                            ? 'দোকানের মালিক (Owner)'
                            : st.roleTitle === 'pharmacist'
                            ? 'ফার্মাসিস্ট (Staff)'
                            : st.roleTitle === 'manager'
                            ? 'ম্যানেজার (Staff)'
                            : 'সেলসম্যান (Staff)'}{' '}
                          · {st.phone}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        <div className="font-medium text-slate-800">{st.counterName}</div>
                        <div>{st.shift}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-800">
                        {perf.memoCount}টি
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        ৳{perf.totalSaleAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        ৳{perf.cashCollected.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectActiveStaff(st)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                              isCurrent
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {isCurrent ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" /> সক্রিয়
                              </>
                            ) : (
                              'সক্রিয় করুন'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditStaffModal(st)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                            title="এডিট করুন"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {staffList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteStaffMember(st.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded cursor-pointer"
                              title="ডিলিট করুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Cols: Specific Pharmacy Shop Account Profile & License Info */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
              <Building2 className="w-4 h-4" />
              নির্দিষ্ট দোকানের নামে একাউন্ট ও লাইসেন্স সেটিংস
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              ফার্মেসি একাউন্ট প্রোফাইল ({shopProfile.shopName})
            </h2>
            <p className="text-xs text-slate-500">
              নির্দিষ্ট দোকানের নামে একাউন্ট তৈরি বা হালনাগাদ করুন। এই একাউন্টের অধীনেই Owner ও সকল স্টাফ কাজ করবেন।
            </p>
          </div>

          <form onSubmit={handleSaveShop} className="space-y-4 pt-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                নির্দিষ্ট দোকানের / ফার্মেসির নাম *
              </label>
              <input
                type="text"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ড্রাগ লাইসেন্স নম্বর (DGDA) *
                </label>
                <input
                  type="text"
                  required
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  দোকানের মোবাইল নম্বর *
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                দোকানের ঠিকানা *
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {shopSaved ? (
                <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <Check className="w-4 h-4" /> দোকানের একাউন্ট আপডেট হয়েছে
                </span>
              ) : (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-teal-700" /> অনলাইন ও অফলাইন সিঙ্ক সক্রিয়
                </span>
              )}

              <button
                type="submit"
                disabled={savingShop}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer disabled:opacity-50"
              >
                {savingShop ? 'আপডেট হচ্ছে...' : 'দোকানের একাউন্ট সংরক্ষণ করুন'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Add / Edit Staff Member Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {editingStaff
                  ? 'মালিক / স্টাফ প্রোফাইল এডিট করুন'
                  : 'দোকানের একাউন্টে নতুন মালিক / স্টাফ যুক্ত করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStaffModal(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                বন্ধ করুন ✕
              </button>
            </div>

            <form onSubmit={handleSaveStaffSubmit} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    পদবী / রোল নির্বাচন করুন *
                  </label>
                  <select
                    value={roleTitle}
                    onChange={(e) => {
                      const val = e.target.value as StaffMember['roleTitle'];
                      setRoleTitle(val);
                      if (val === 'owner') {
                        setStaffName('Owner');
                        setCounterName('কাউন্টার ১ (Owner)');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="salesman">সেলসম্যান (Staff)</option>
                    <option value="pharmacist">ফার্মাসিস্ট (Staff)</option>
                    <option value="manager">ম্যানেজার (Staff)</option>
                    <option value="owner">দোকানের মালিক (Owner)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {roleTitle === 'owner'
                      ? 'প্রদর্শিত নাম (সর্বদা Owner)'
                      : 'স্টাফের নির্দিষ্ট নাম *'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={roleTitle === 'owner'}
                    value={roleTitle === 'owner' ? 'Owner' : staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="যেমন: মাহফুজুর রহমান"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-100 disabled:font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    মোবাইল নম্বর *
                  </label>
                  <input
                    type="text"
                    required
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="018XXXXXXXX"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    কাউন্টার নম্বর *
                  </label>
                  <input
                    type="text"
                    required
                    value={counterName}
                    onChange={(e) => setCounterName(e.target.value)}
                    placeholder="কাউন্টার ২ (স্টাফ)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ডিউটি শিফট *
                </label>
                <input
                  type="text"
                  required
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {savingStaff ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
